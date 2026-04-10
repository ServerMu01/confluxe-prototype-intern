from __future__ import annotations

import json
import re
from typing import Any

from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.tools import tool
from langchain_groq import ChatGroq
from pymongo import DESCENDING
from pymongo.collection import Collection
from pymongo.database import Database

from app.core.config import settings
from app.models.schemas import IntelligenceOutput
from app.services.catalog_service import record_to_output


class CopilotService:
    def __init__(self, database: Database) -> None:
        self._records: Collection = database['intelligence_records']
        self._llm = None

        if settings.groq_api_key:
            self._llm = ChatGroq(
                model=settings.groq_model_reasoner,
                api_key=settings.groq_api_key,
                timeout=settings.llm_timeout_seconds,
                temperature=0.1
            )

    def handle_query(self, query: str) -> tuple[str, list[IntelligenceOutput]]:
        items = self._rule_based_select(query)

        if not self._llm or self._should_use_rule_summary(query, items):
            summary = self._build_summary(query, items)
            return summary, items

        tools = self._build_tools()
        prompt = ChatPromptTemplate.from_messages(
            [
                (
                    'system',
                    'You are Confluxe Merch Co-Pilot. Use available tools to inspect products and answer briefly with an actionable buying plan.'
                ),
                ('human', '{input}'),
                ('placeholder', '{agent_scratchpad}')
            ]
        )

        agent = create_tool_calling_agent(self._llm, tools, prompt)
        agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=False)
        result = agent_executor.invoke({'input': query})

        summary = result.get('output', '').strip()
        if not summary or self._is_generic_summary(summary):
            summary = self._build_summary(query, items)

        return summary, items

    def _build_tools(self) -> list:
        @tool
        def get_launch_products(category: str = '') -> str:
            """Return top launch products, optionally filtered by category."""
            query: dict[str, Any] = {'action': 'LAUNCH'}
            if category.strip():
                query['category'] = self._category_filter(category.strip())

            records = list(
                self._records.find(
                    query,
                    {
                        '_id': 0,
                        'name': 1,
                        'category': 1,
                        'price_inr': 1,
                        'trend_score': 1,
                        'action': 1
                    }
                ).sort('trend_score', DESCENDING).limit(10)
            )
            return json.dumps(
                [
                    {
                        'name': record.get('name'),
                        'category': record.get('category'),
                        'price_inr': record.get('price_inr'),
                        'trend_score': record.get('trend_score'),
                        'action': record.get('action')
                    }
                    for record in records
                ]
            )

        @tool
        def get_products_under_budget(max_budget_inr: float, category: str = '') -> str:
            """Return products under a max budget in INR, optionally by category."""
            query: dict[str, Any] = {'price_inr': {'$lte': max_budget_inr}}
            if category.strip():
                query['category'] = self._category_filter(category.strip())

            records = list(
                self._records.find(
                    query,
                    {
                        '_id': 0,
                        'name': 1,
                        'category': 1,
                        'price_inr': 1,
                        'action': 1,
                        'trend_score': 1
                    }
                ).sort('trend_score', DESCENDING).limit(15)
            )
            return json.dumps(
                [
                    {
                        'name': record.get('name'),
                        'category': record.get('category'),
                        'price_inr': record.get('price_inr'),
                        'action': record.get('action'),
                        'trend_score': record.get('trend_score')
                    }
                    for record in records
                ]
            )

        @tool
        def get_category_mix() -> str:
            """Return the count of recommendations grouped by category and action."""
            records = list(self._records.find({}, {'_id': 0, 'category': 1, 'action': 1}))
            aggregate: dict[str, dict[str, int]] = {}

            for record in records:
                category_name = str(record.get('category', 'Uncategorized'))
                action_name = str(record.get('action', 'TEST'))
                category_bucket = aggregate.setdefault(category_name, {'LAUNCH': 0, 'TEST': 0, 'AVOID': 0})
                category_bucket[action_name] = category_bucket.get(action_name, 0) + 1

            return json.dumps(aggregate)

        return [get_launch_products, get_products_under_budget, get_category_mix]

    def _rule_based_select(self, query: str) -> list[IntelligenceOutput]:
        category = self._infer_category(query)
        action = self._infer_action(query)
        budget = self._extract_budget(query)
        search_regex = self._extract_search_regex(query)

        filter_query: dict[str, Any] = {}

        if category:
            filter_query['category'] = self._category_filter(category)
        if action:
            filter_query['action'] = action
        if search_regex:
            filter_query['$or'] = [
                {'name': {'$regex': search_regex, '$options': 'i'}},
                {'category': {'$regex': search_regex, '$options': 'i'}}
            ]

        records = list(self._records.find(filter_query).sort('trend_score', DESCENDING))
        if not records and search_regex:
            relaxed_query = {
                '$or': [
                    {'name': {'$regex': search_regex, '$options': 'i'}},
                    {'category': {'$regex': search_regex, '$options': 'i'}}
                ]
            }
            records = list(self._records.find(relaxed_query).sort('trend_score', DESCENDING))

        if not records:
            return []

        deduped_records: list[dict[str, Any]] = []
        seen_keys: set[tuple[str, str, int]] = set()

        for record in records:
            product_id = str(record.get('product_id', '')).strip().lower()
            name = str(record.get('name', '')).strip().lower()
            category_name = str(record.get('category', '')).strip().lower()
            price = int(round(float(record.get('price_inr', 0.0))))
            dedupe_key = (product_id, category_name, 0) if product_id else (name, category_name, price)

            if dedupe_key in seen_keys:
                continue

            seen_keys.add(dedupe_key)
            deduped_records.append(record)

        records = deduped_records

        if budget:
            selected: list[dict[str, Any]] = []
            running_total = 0.0

            for record in records:
                price_inr = float(record.get('price_inr', 0.0))
                if running_total + price_inr > budget:
                    continue
                selected.append(record)
                running_total += price_inr
                if len(selected) >= 25:
                    break

            records = selected or records[:12]
        else:
            records = records[:12]

        return [record_to_output(record) for record in records]

    @staticmethod
    def _category_filter(category: str) -> dict[str, str]:
        return {
            '$regex': f'^{re.escape(category)}$',
            '$options': 'i'
        }

    @staticmethod
    def _build_summary(query: str, items: list[IntelligenceOutput]) -> str:
        if not items:
            return 'No matching products were found for this request. Try removing category or budget constraints.'

        launch_count = len([item for item in items if item.action == 'LAUNCH'])
        top_categories = ', '.join(sorted({item.normalized_product.category for item in items}))
        total_price = sum(item.normalized_product.price_inr for item in items)
        unique_top_names: list[str] = []
        seen_names: set[str] = set()
        for item in items:
            normalized_name = item.normalized_product.name.strip().lower()
            if normalized_name in seen_names:
                continue
            seen_names.add(normalized_name)
            unique_top_names.append(item.normalized_product.name)
            if len(unique_top_names) >= 3:
                break

        top_names = ', '.join(unique_top_names) if unique_top_names else 'N/A'

        return (
            f"Generated a shortlist for '{query}' with {len(items)} products across {top_categories}. "
            f"{launch_count} items are marked LAUNCH with an approximate combined MSRP of INR {total_price:,.0f}. "
            f"Top picks: {top_names}."
        )

    @staticmethod
    def _infer_action(query: str) -> str | None:
        lowered_query = query.lower()
        if 'avoid' in lowered_query:
            return 'AVOID'
        if 'test' in lowered_query:
            return 'TEST'
        if 'launch' in lowered_query or 'order' in lowered_query or 'buy' in lowered_query:
            return 'LAUNCH'
        return None

    @staticmethod
    def _infer_category(query: str) -> str | None:
        lowered_query = query.lower()
        categories = ['streetwear', 'activewear', 'formalwear', 'outerwear', 'footwear', 'accessories']

        for category in categories:
            if category in lowered_query:
                return category.title()

        alias_map = {
            'tshirt': 'Streetwear',
            'tshirts': 'Streetwear',
            'tee': 'Streetwear',
            'tees': 'Streetwear',
            'hoodie': 'Streetwear',
            'jogger': 'Activewear',
            'joggers': 'Activewear',
            'athleisure': 'Activewear',
            'sneaker': 'Footwear',
            'sneakers': 'Footwear',
            'shoe': 'Footwear',
            'shoes': 'Footwear',
            'jacket': 'Outerwear',
            'jackets': 'Outerwear',
            'coat': 'Outerwear',
            'coats': 'Outerwear',
            'accessory': 'Accessories',
            'accessories': 'Accessories',
            'formal': 'Formalwear'
        }

        tokens = re.findall(r'[a-z0-9]+', lowered_query)
        for token in tokens:
            mapped = alias_map.get(token)
            if mapped:
                return mapped

        return None

    @staticmethod
    def _extract_search_regex(query: str) -> str | None:
        lowered_query = query.lower()

        if re.search(r'\bt[\s-]?shirts?\b|\btees?\b', lowered_query):
            return r't[\s-]?shirts?|tees?'

        stop_words = {
            'build',
            'order',
            'buy',
            'launch',
            'test',
            'avoid',
            'under',
            'budget',
            'inr',
            'rs',
            'rupees',
            'for',
            'with',
            'and',
            'the',
            'show',
            'products',
            'product',
            'plan'
        }

        tokens = [
            token
            for token in re.findall(r'[a-z0-9]+', lowered_query)
            if len(token) >= 3 and token not in stop_words and not token.isdigit()
        ]

        if not tokens:
            return None

        unique_tokens = list(dict.fromkeys(tokens))[:3]
        if len(unique_tokens) == 1:
            return re.escape(unique_tokens[0])

        return '|'.join(re.escape(token) for token in unique_tokens)

    @staticmethod
    def _should_use_rule_summary(query: str, items: list[IntelligenceOutput]) -> bool:
        token_count = len(re.findall(r'[a-z0-9]+', query.lower()))
        return token_count <= 4 or not items

    @staticmethod
    def _is_generic_summary(summary: str) -> bool:
        lowered = summary.lower()
        generic_markers = [
            'specific products may vary',
            'based on the top launch products',
            'please note',
            'combination of both'
        ]
        return any(marker in lowered for marker in generic_markers)

    @staticmethod
    def _extract_budget(query: str) -> float | None:
        budget_pattern = re.search(r'₹\s*([0-9]+(?:\.[0-9]+)?)\s*([kKlL]|cr|CR)?', query)
        if not budget_pattern:
            return None

        value = float(budget_pattern.group(1))
        unit = (budget_pattern.group(2) or '').lower()

        multipliers: dict[str, float] = {
            'k': 1_000.0,
            'l': 100_000.0,
            'cr': 10_000_000.0
        }

        return value * multipliers.get(unit, 1.0)
