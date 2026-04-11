from __future__ import annotations

import re
import uuid
from typing import TypedDict

from langchain_core.prompts import ChatPromptTemplate
from langchain_groq import ChatGroq
from langgraph.graph import END, StateGraph

from app.core.config import settings
from app.core.exceptions import LLMTimeoutError
from app.models.schemas import IntelligenceOutput, NormalizedProduct, RawVendorProduct, TrendSignal
from app.services.trend_service import TrendService


class PipelineState(TypedDict, total=False):
    raw_product: RawVendorProduct
    normalized_product: NormalizedProduct
    trend_signal: TrendSignal
    trend_score: float
    demand_level: str
    price_fit: str
    action: str
    ai_reasoning: str


class ConfluxePipeline:
    NAME_TOKEN_EXPANSIONS: dict[str, str] = {
        'athltc': 'athletic',
        'athletic': 'athletic',
        'br': 'bra',
        'spt': 'sport',
        'blk': 'black',
        'blck': 'black',
        'wht': 'white',
        'gry': 'grey',
        'nvy': 'navy',
        'brwn': 'brown',
        'snkrs': 'sneakers',
        'sneakers': 'sneakers',
        'hgh': 'high',
        'tp': 'top',
        'wntr': 'winter',
        'smmr': 'summer',
        'sndls': 'sandals',
        'lthr': 'leather',
        'blt': 'belt',
        'bckl': 'buckle',
        'slvr': 'silver',
        'rncoat': 'raincoat',
        'trnsprnt': 'transparent',
        'mx': 'maxi',
        'drss': 'dress',
        'bho': 'boho',
        'prnt': 'print',
        'frml': 'formal',
        'csl': 'casual',
        'mens': 'mens',
        'wmn': 'women',
        'ovrszd': 'oversized',
        'grphc': 'graphic',
        'shrt': 'shirt',
        'slmfit': 'slim fit',
        'slimfit': 'slim fit',
        'runng': 'running',
        'hddie': 'hoodie',
        'unsex': 'unisex'
    }
    NAME_UPPERCASE_TOKENS: set[str] = {'xs', 's', 'm', 'l', 'xl', 'xxl', 'xxxl'}

    PRICE_BANDS: dict[str, tuple[float, float]] = {
        'Streetwear': (1200.0, 4500.0),
        'Activewear': (1500.0, 5200.0),
        'Formalwear': (2200.0, 7000.0),
        'Outerwear': (3000.0, 14000.0),
        'Footwear': (1800.0, 6500.0),
        'Accessories': (700.0, 3200.0)
    }

    def __init__(self, trend_service: TrendService) -> None:
        self._trend_service = trend_service
        self._normalize_chain = None
        self._explain_chain = None

        if settings.groq_api_key:
            parser_llm = ChatGroq(
                model=settings.groq_model_parser,
                api_key=settings.groq_api_key,
                timeout=settings.llm_timeout_seconds,
                temperature=0.0
            )
            reasoner_llm = ChatGroq(
                model=settings.groq_model_reasoner,
                api_key=settings.groq_api_key,
                timeout=settings.llm_timeout_seconds,
                temperature=0.2
            )

            normalize_prompt = ChatPromptTemplate.from_messages(
                [
                    (
                        'system',
                        'You normalize messy fashion product data into the target schema. '
                        'Use these category options when possible: Streetwear, Activewear, Formalwear, Outerwear, Footwear, Accessories. '
                        'Convert USD to INR using rate {usd_inr_rate}. Generate a compact product id prefixed with prd_. '
                    ),
                    (
                        'human',
                        'item_desc: {item_desc}\n'
                        'msrp_usd: {msrp_usd}\n'
                        'qty: {qty}\n'
                        'brand: {brand}\n'
                        'vendor_sku: {vendor_sku}'
                    )
                ]
            )
            self._normalize_chain = normalize_prompt | parser_llm.with_structured_output(NormalizedProduct)

            explain_prompt = ChatPromptTemplate.from_messages(
                [
                    (
                        'system',
                        'You are a retail intelligence analyst. Return exactly 2-3 sentences describing why the action was chosen. '
                        'Mention demand level, trend momentum, and pricing fit in plain business language.'
                    ),
                    (
                        'human',
                        'Product: {product_name} ({category})\n'
                        'Price (INR): {price_inr}\n'
                        'Trend momentum: {momentum_score}/10\n'
                        'Growth: {growth_percentage}%\n'
                        'Demand level: {demand_level}\n'
                        'Price fit: {price_fit}\n'
                        'Recommended action: {action}'
                    )
                ]
            )
            self._explain_chain = explain_prompt | reasoner_llm

        graph_builder = StateGraph(PipelineState)
        graph_builder.add_node('normalize_node', self.normalize_node)
        graph_builder.add_node('trend_fetch_node', self.trend_fetch_node)
        graph_builder.add_node('scoring_node', self.scoring_node)
        graph_builder.add_node('explainer_node', self.explainer_node)

        graph_builder.set_entry_point('normalize_node')
        graph_builder.add_edge('normalize_node', 'trend_fetch_node')
        graph_builder.add_edge('trend_fetch_node', 'scoring_node')
        graph_builder.add_edge('scoring_node', 'explainer_node')
        graph_builder.add_edge('explainer_node', END)

        self.graph = graph_builder.compile()

    def normalize_node(self, state: PipelineState) -> PipelineState:
        raw_product = state['raw_product']

        if self._normalize_chain:
            try:
                normalized = self._normalize_chain.invoke(
                    {
                        'item_desc': raw_product.item_desc,
                        'msrp_usd': raw_product.msrp_usd,
                        'qty': raw_product.qty,
                        'brand': raw_product.brand or 'Unknown',
                        'vendor_sku': raw_product.vendor_sku or '' ,
                        'usd_inr_rate': settings.usd_inr_rate
                    }
                )
                if not normalized.id:
                    normalized.id = f'prd_{uuid.uuid4().hex[:10]}'
                if normalized.price_inr <= 0:
                    normalized.price_inr = round(raw_product.msrp_usd * settings.usd_inr_rate, 2)
                return {'normalized_product': normalized}
            except Exception as exc:
                if 'timeout' in str(exc).lower():
                    raise LLMTimeoutError('Normalization LLM timed out.') from exc

        return {'normalized_product': self._deterministic_normalize(raw_product)}

    def trend_fetch_node(self, state: PipelineState) -> PipelineState:
        normalized_product = state['normalized_product']
        trend_signal = self._trend_service.get_trend_signal(normalized_product.category)
        return {'trend_signal': trend_signal}

    def scoring_node(self, state: PipelineState) -> PipelineState:
        normalized_product = state['normalized_product']
        trend_signal = state['trend_signal']
        return self._score_and_action(normalized_product, trend_signal)

    def explainer_node(self, state: PipelineState) -> PipelineState:
        normalized_product = state['normalized_product']
        trend_signal = state['trend_signal']

        if self._explain_chain:
            try:
                response = self._explain_chain.invoke(
                    {
                        'product_name': normalized_product.name,
                        'category': normalized_product.category,
                        'price_inr': normalized_product.price_inr,
                        'momentum_score': trend_signal.momentum_score,
                        'growth_percentage': trend_signal.growth_percentage,
                        'demand_level': state['demand_level'],
                        'price_fit': state['price_fit'],
                        'action': state['action']
                    }
                )
                content = getattr(response, 'content', str(response)).strip()
                if content:
                    return {'ai_reasoning': content}
            except Exception as exc:
                if 'timeout' in str(exc).lower():
                    raise LLMTimeoutError('Explainer LLM timed out.') from exc

        return {
            'ai_reasoning': self._fallback_reasoning(
                normalized_product=normalized_product,
                trend_signal=trend_signal,
                trend_score=state['trend_score'],
                demand_level=state['demand_level'],
                price_fit=state['price_fit'],
                action=state['action']
            )
        }

    def run(self, raw_product: RawVendorProduct) -> IntelligenceOutput:
        final_state = self.graph.invoke({'raw_product': raw_product})

        return IntelligenceOutput(
            normalized_product=final_state['normalized_product'],
            trend_signal=final_state['trend_signal'],
            trend_score=final_state['trend_score'],
            demand_level=final_state['demand_level'],
            price_fit=final_state['price_fit'],
            action=final_state['action'],
            ai_reasoning=final_state['ai_reasoning']
        )

    def run_bulk(self, raw_product: RawVendorProduct) -> IntelligenceOutput:
        normalized_product = self._deterministic_normalize(raw_product)
        trend_signal = self._trend_service.get_trend_signal(normalized_product.category)
        scored = self._score_and_action(normalized_product, trend_signal)
        ai_reasoning = self._fallback_reasoning(
            normalized_product=normalized_product,
            trend_signal=trend_signal,
            trend_score=scored['trend_score'],
            demand_level=scored['demand_level'],
            price_fit=scored['price_fit'],
            action=scored['action']
        )

        return IntelligenceOutput(
            normalized_product=normalized_product,
            trend_signal=trend_signal,
            trend_score=scored['trend_score'],
            demand_level=scored['demand_level'],
            price_fit=scored['price_fit'],
            action=scored['action'],
            ai_reasoning=ai_reasoning
        )

    @classmethod
    def prettify_product_name(cls, item_desc: str) -> str:
        text = str(item_desc or '').strip()
        if not text:
            return 'Unknown Product'

        # Handle escaped characters from malformed CSV exports.
        text = text.replace('\\_', '_').replace('\\&', '&')
        text = re.sub(r'(?<=\w)-(?=\w)', ' ', text)
        text = re.sub(r'[\\_/]+', ' ', text)
        text = re.sub(r'([^\W\d_]+)(\d+)', r'\1 \2', text)
        text = re.sub(r'(\d+)([^\W\d_]+)', r'\1 \2', text)
        text = re.sub(r'\s+', ' ', text).strip()

        expanded_tokens: list[str] = []
        for raw_token in text.split(' '):
            token = raw_token.strip()
            if not token:
                continue

            lowered = token.lower()
            expanded = cls.NAME_TOKEN_EXPANSIONS.get(lowered, lowered)
            expanded_tokens.extend(part for part in expanded.split(' ') if part)

        if not expanded_tokens:
            return 'Unknown Product'

        formatted_tokens: list[str] = []
        for token in expanded_tokens:
            if token in cls.NAME_UPPERCASE_TOKENS:
                formatted_tokens.append(token.upper())
            elif token.isdigit():
                formatted_tokens.append(token)
            elif re.fullmatch(r'\d+[a-z]{1,2}', token):
                formatted_tokens.append(token[:-2] + token[-2:].upper())
            elif token == '&':
                formatted_tokens.append(token)
            else:
                formatted_tokens.append(token.capitalize())

        return ' '.join(formatted_tokens)

    def _deterministic_normalize(self, raw_product: RawVendorProduct) -> NormalizedProduct:
        normalized_name = self.prettify_product_name(raw_product.item_desc)
        normalized_brand = (raw_product.brand or normalized_name.split(' ')[0]).upper()
        normalized_category = self._category_from_text(normalized_name)
        price_inr = round(raw_product.msrp_usd * settings.usd_inr_rate, 2)

        return NormalizedProduct(
            id=f'prd_{uuid.uuid4().hex[:10]}',
            name=normalized_name,
            brand=normalized_brand,
            category=normalized_category,
            price_inr=price_inr
        )

    def _category_from_text(self, item_desc: str) -> str:
        text = item_desc.lower()

        if any(keyword in text for keyword in ('hoodie', 'street', 'graphic', 'baggy', 'parachute')):
            return 'Streetwear'
        if any(keyword in text for keyword in ('yoga', 'active', 'gym', 'athletic', 'seamless', 'sports bra', 'running')):
            return 'Activewear'
        if any(keyword in text for keyword in ('blazer', 'formal', 'office', 'suit', 'slim fit')):
            return 'Formalwear'
        if any(keyword in text for keyword in ('parka', 'winter', 'jacket', 'outer')):
            return 'Outerwear'
        if any(keyword in text for keyword in ('sneaker', 'shoe', 'footwear')):
            return 'Footwear'
        return 'Accessories'

    def _price_fit(self, category: str, price_inr: float) -> str:
        lower_bound, upper_bound = self.PRICE_BANDS.get(category, (1200.0, 6000.0))

        if price_inr < lower_bound * 0.9:
            return 'UNDERPRICED'
        if price_inr > upper_bound * 1.1:
            return 'OVERPRICED'
        return 'IDEAL'

    def _score_and_action(self, normalized_product: NormalizedProduct, trend_signal: TrendSignal) -> dict[str, str | float]:
        price_fit = self._price_fit(normalized_product.category, normalized_product.price_inr)

        growth_component = max(1.0, min(10.0, 5.0 + (trend_signal.growth_percentage / 10.0)))
        trend_score = round((trend_signal.momentum_score * 0.7) + (growth_component * 0.3), 1)
        trend_score = float(max(1.0, min(10.0, trend_score)))

        if trend_score >= 7.0:
            demand_level = 'High'
        elif trend_score >= 4.5:
            demand_level = 'Medium'
        else:
            demand_level = 'Low'

        if demand_level == 'High' and price_fit != 'OVERPRICED':
            action = 'LAUNCH'
        elif demand_level == 'Low' or (price_fit == 'OVERPRICED' and trend_score < 6.5):
            action = 'AVOID'
        else:
            action = 'TEST'

        return {
            'trend_score': trend_score,
            'demand_level': demand_level,
            'price_fit': price_fit,
            'action': action
        }

    def _fallback_reasoning(
        self,
        normalized_product: NormalizedProduct,
        trend_signal: TrendSignal,
        trend_score: float,
        demand_level: str,
        price_fit: str,
        action: str
    ) -> str:
        return (
            f"{normalized_product.name} shows {demand_level.lower()} demand with a trend score of {trend_score}/10 "
            f"driven by {trend_signal.growth_percentage:+.1f}% category growth. "
            f"At INR {normalized_product.price_inr:.0f}, pricing is {price_fit.lower()}, "
            f"so the recommended action is {action}."
        )
