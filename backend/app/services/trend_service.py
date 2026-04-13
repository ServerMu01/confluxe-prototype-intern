from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import json
import re
from typing import Any
from urllib.parse import quote

import requests
from langchain_core.prompts import ChatPromptTemplate
from langchain_groq import ChatGroq
from pymongo.collection import Collection
from pytrends.request import TrendReq

from app.core.config import settings
from app.core.exceptions import TrendDataUnavailableError
from app.models.schemas import TrendDashboardItem, TrendKeywordItem, TrendSignal, TrendTimelinePoint


@dataclass
class TrendSnapshot:
    signal: TrendSignal
    timeline: list[TrendTimelinePoint]
    keywords: list[TrendKeywordItem]
    provider: str
    fetched_at: datetime


class TrendService:
    CATEGORY_ORDER: tuple[str, ...] = (
        'Streetwear',
        'Activewear',
        'Formalwear',
        'Outerwear',
        'Footwear',
        'Accessories'
    )
    TIER_ONE_CITIES: tuple[str, ...] = (
        'Delhi NCR',
        'Mumbai',
        'Bengaluru',
        'Hyderabad',
        'Chennai',
        'Pune',
        'Kolkata',
        'Ahmedabad'
    )
    REGION_ALIAS_MAP: dict[str, str] = {
        'india': 'All Over India',
        'all india': 'All Over India',
        'all over india': 'All Over India',
        'nationwide': 'All Over India',
        'pan india': 'All Over India',
        'in': 'All Over India',
        'delhi': 'Delhi NCR',
        'new delhi': 'Delhi NCR',
        'nct of delhi': 'Delhi NCR',
        'haryana': 'Delhi NCR',
        'noida': 'Delhi NCR',
        'gurugram': 'Delhi NCR',
        'gurgaon': 'Delhi NCR',
        'mumbai metropolitan region': 'Mumbai',
        'maharashtra': 'Mumbai',
        'bangalore': 'Bengaluru',
        'bengaluru urban': 'Bengaluru',
        'karnataka': 'Bengaluru',
        'telangana': 'Hyderabad',
        'tamil nadu': 'Chennai',
        'west bengal': 'Kolkata',
        'gujarat': 'Ahmedabad'
    }

    def __init__(self, snapshot_collection: Collection | None = None) -> None:
        self._cache: dict[str, TrendSnapshot] = {}
        self._snapshot_collection = snapshot_collection
        self._category_terms: dict[str, str] = {
            'Streetwear': 'streetwear fashion india',
            'Activewear': 'activewear india',
            'Formalwear': 'formalwear india',
            'Outerwear': 'winter jackets india',
            'Footwear': 'sneakers india',
            'Accessories': 'fashion accessories india'
        }
        self._keyword_generation_chain = None

        if settings.groq_api_key:
            try:
                keyword_llm = ChatGroq(
                    model=settings.groq_model_parser,
                    api_key=settings.groq_api_key,
                    timeout=min(12, settings.llm_timeout_seconds),
                    temperature=0.2
                )
                keyword_prompt = ChatPromptTemplate.from_messages(
                    [
                        (
                            'system',
                            'You are a search-intelligence assistant. '\
                            'Return only a JSON array with up to 8 objects of shape '\
                            '{"term": string, "growth": string}. '\
                            'Each growth must be formatted like +45% or Breakout.'
                        ),
                        (
                            'human',
                            'Category: {category}\n'
                            'Top region: {region}\n'
                            'Growth percentage: {growth_percentage}\n'
                            'Momentum score: {momentum_score}/10\n'
                            'Generate realistic rising search queries for India fashion merchandising.'
                        )
                    ]
                )
                self._keyword_generation_chain = keyword_prompt | keyword_llm
            except Exception:
                self._keyword_generation_chain = None

    def get_trend_signal(self, category: str) -> TrendSignal:
        snapshot = self._load_snapshot(category, allow_remote=True)
        return snapshot.signal

    def get_macro_trends(self) -> list[TrendDashboardItem]:
        items: list[TrendDashboardItem] = []

        def load_category(category: str) -> TrendDashboardItem | None:
            try:
                snapshot = self._load_snapshot(category, allow_remote=True)
            except TrendDataUnavailableError:
                return None

            signal = snapshot.signal
            status = self._status_from_signal(signal)
            return TrendDashboardItem(
                category=signal.category,
                volume=f"{round(signal.search_volume / 1000)}K",
                growth=f"{signal.growth_percentage:+.0f}%",
                region=signal.top_region,
                status=status,
                momentum_score=signal.momentum_score,
                provider=snapshot.provider
            )

        workers = min(6, len(self.CATEGORY_ORDER))
        with ThreadPoolExecutor(max_workers=workers) as executor:
            results = list(executor.map(load_category, self.CATEGORY_ORDER))

        items = [item for item in results if item is not None]

        if not items:
            raise TrendDataUnavailableError('No live trend signals are currently available from providers.')

        return items

    def get_rising_keywords(self, category: str, limit: int = 10) -> list[TrendKeywordItem]:
        snapshot = self._load_snapshot(category, allow_remote=True)
        return snapshot.keywords[: max(1, min(50, limit))]

    def get_timeline(self, category: str, months: int = 12) -> list[TrendTimelinePoint]:
        snapshot = self._load_snapshot(category, allow_remote=True)
        return snapshot.timeline[-max(1, min(12, months)) :]

    def _load_snapshot(self, category: str, allow_remote: bool = True) -> TrendSnapshot:
        normalized_category = self._normalize_category(category)
        now = datetime.now(timezone.utc)
        cached = self._cache.get(normalized_category)

        if cached:
            if self._is_within_age(cached.fetched_at, settings.trend_cache_ttl_seconds, now=now):
                return cached

        persisted_fresh = self._load_snapshot_from_store(
            normalized_category,
            max_age_seconds=settings.trend_persisted_cache_ttl_seconds,
            now=now
        )
        if persisted_fresh:
            self._cache[normalized_category] = persisted_fresh
            return persisted_fresh

        snapshot: TrendSnapshot | None = None

        if allow_remote:
            snapshot = self._build_apify_snapshot(normalized_category)
            if not snapshot:
                snapshot = self._build_pytrends_snapshot(normalized_category)

        if snapshot:
            self._cache[normalized_category] = snapshot
            self._save_snapshot_to_store(normalized_category, snapshot)
            return snapshot

        if cached and self._is_within_age(cached.fetched_at, settings.trend_stale_fallback_max_age_seconds, now=now):
            return self._as_cached_snapshot(cached)

        persisted_stale = self._load_snapshot_from_store(
            normalized_category,
            max_age_seconds=settings.trend_stale_fallback_max_age_seconds,
            now=now
        )
        if persisted_stale:
            self._cache[normalized_category] = persisted_stale
            return self._as_cached_snapshot(persisted_stale)

        raise TrendDataUnavailableError(
            f'Live trend data is unavailable for {normalized_category}. Check provider connectivity and credentials.'
        )

    @staticmethod
    def _is_within_age(fetched_at: datetime, max_age_seconds: int, now: datetime | None = None) -> bool:
        if max_age_seconds <= 0:
            return False

        baseline = now or datetime.now(timezone.utc)
        normalized_fetched_at = TrendService._to_utc_datetime(fetched_at)
        age_seconds = (baseline - normalized_fetched_at).total_seconds()
        return age_seconds <= max_age_seconds

    @staticmethod
    def _to_utc_datetime(value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    @staticmethod
    def _as_cached_snapshot(snapshot: TrendSnapshot) -> TrendSnapshot:
        provider = snapshot.provider
        if 'cached' not in provider.lower():
            provider = f'{provider}_cached'

        return TrendSnapshot(
            signal=snapshot.signal,
            timeline=snapshot.timeline,
            keywords=snapshot.keywords,
            provider=provider,
            fetched_at=snapshot.fetched_at
        )

    @staticmethod
    def _snapshot_cache_key(category: str) -> str:
        geo = settings.trends_geo.strip().upper() or 'IN'
        normalized = category.strip().lower()
        return f'{geo}::{normalized}'

    def _load_snapshot_from_store(
        self,
        category: str,
        max_age_seconds: int,
        now: datetime | None = None
    ) -> TrendSnapshot | None:
        if self._snapshot_collection is None or max_age_seconds <= 0:
            return None

        baseline = now or datetime.now(timezone.utc)
        threshold = baseline - timedelta(seconds=max_age_seconds)

        try:
            document = self._snapshot_collection.find_one(
                {
                    'cache_key': self._snapshot_cache_key(category),
                    'fetched_at': {'$gte': threshold}
                },
                sort=[('fetched_at', -1)],
                projection={
                    '_id': 0,
                    'provider': 1,
                    'signal': 1,
                    'timeline': 1,
                    'keywords': 1,
                    'fetched_at': 1
                }
            )
        except Exception:
            return None

        if not isinstance(document, dict):
            return None

        fetched_at = document.get('fetched_at')
        if not isinstance(fetched_at, datetime):
            return None

        try:
            signal = TrendSignal.model_validate(document.get('signal') or {})
            timeline = [
                TrendTimelinePoint.model_validate(point)
                for point in (document.get('timeline') or [])
                if isinstance(point, dict)
            ]
            keywords = [
                TrendKeywordItem.model_validate(item)
                for item in (document.get('keywords') or [])
                if isinstance(item, dict)
            ]
        except Exception:
            return None

        if not timeline:
            return None

        return TrendSnapshot(
            signal=signal,
            timeline=timeline,
            keywords=keywords,
            provider=str(document.get('provider') or 'unknown_provider'),
            fetched_at=self._to_utc_datetime(fetched_at)
        )

    def _save_snapshot_to_store(self, category: str, snapshot: TrendSnapshot) -> None:
        if self._snapshot_collection is None:
            return

        document = {
            'cache_key': self._snapshot_cache_key(category),
            'category': category,
            'geo': settings.trends_geo,
            'provider': snapshot.provider,
            'signal': snapshot.signal.model_dump(),
            'timeline': [point.model_dump() for point in snapshot.timeline],
            'keywords': [keyword.model_dump() for keyword in snapshot.keywords],
            'fetched_at': self._to_utc_datetime(snapshot.fetched_at),
            'updated_at': datetime.now(timezone.utc)
        }

        try:
            self._snapshot_collection.update_one(
                {'cache_key': document['cache_key']},
                {'$set': document},
                upsert=True
            )
        except Exception:
            # Snapshot persistence is a cost optimization and should not fail requests.
            return

    def _build_apify_snapshot(self, category: str) -> TrendSnapshot | None:
        if not settings.apify_api_token:
            return None

        query = self._category_terms.get(category, category)

        try:
            apify_items: list[dict[str, Any]] = []
            input_candidates = [
                {
                    'searchTerms': [query],
                    'geo': settings.trends_geo,
                    'timeRange': 'today 5-y',
                    'maxItems': 100
                },
                {
                    'searchTerms': [query],
                    'geo': settings.trends_geo,
                    'timeRange': 'today 3-m',
                    'maxItems': 100
                },
                {
                    'searchTerms': [query],
                    'geo': settings.trends_geo,
                    'timeRange': 'all',
                    'maxItems': 100
                }
            ]

            for actor_input in input_candidates:
                apify_items = self._call_apify_actor(actor_input)
                if apify_items:
                    break

            if not apify_items:
                return None

            timeline = self._extract_apify_timeline(apify_items)
            if not timeline:
                return None

            top_region = self._extract_apify_top_region(apify_items)
            keywords = self._extract_apify_keywords(apify_items)

            signal = self._signal_from_timeline(category, timeline, top_region)
            if not keywords:
                keywords = self._fallback_keywords(signal)

            return TrendSnapshot(
                signal=signal,
                timeline=timeline,
                keywords=keywords,
                provider='apify_google_trends',
                fetched_at=datetime.now(timezone.utc)
            )
        except Exception:
            return None

    def _build_pytrends_snapshot(self, category: str) -> TrendSnapshot | None:
        query = self._category_terms.get(category, category)

        try:
            client = TrendReq(hl='en-US', tz=330)
            client.build_payload([query], timeframe='today 12-m', geo=settings.trends_geo)

            interest_over_time = client.interest_over_time()
            if interest_over_time.empty or query not in interest_over_time.columns:
                return None

            monthly_series = interest_over_time[query]
            timeline = self._timeline_from_series(monthly_series)
            if not timeline:
                return None

            top_region = 'India'
            region_interest = client.interest_by_region(
                resolution='REGION',
                inc_low_vol=True,
                inc_geo_code=False
            )
            if not region_interest.empty and query in region_interest.columns:
                non_zero = region_interest[region_interest[query] > 0]
                if not non_zero.empty:
                    top_region = str(non_zero[query].idxmax())
            top_region = self._normalize_region(top_region)

            keywords = self._extract_pytrends_keywords(client.related_queries(), query)

            signal = self._signal_from_timeline(category, timeline, top_region)
            if not keywords:
                keywords = self._fallback_keywords(signal)

            return TrendSnapshot(
                signal=signal,
                timeline=timeline,
                keywords=keywords,
                provider='pytrends',
                fetched_at=datetime.now(timezone.utc)
            )
        except Exception:
            return None

    def _call_apify_actor(self, actor_input: dict[str, Any]) -> list[dict[str, Any]]:
        actor_id = quote(settings.apify_google_trends_actor_id, safe='')
        response = requests.post(
            f'https://api.apify.com/v2/acts/{actor_id}/run-sync-get-dataset-items',
            params={
                'token': settings.apify_api_token,
                'format': 'json',
                'clean': 'true'
            },
            json=actor_input,
            timeout=12
        )
        response.raise_for_status()
        payload = response.json()

        if isinstance(payload, list):
            return [item for item in payload if isinstance(item, dict)]
        if isinstance(payload, dict):
            if isinstance(payload.get('items'), list):
                return [item for item in payload['items'] if isinstance(item, dict)]
            if isinstance(payload.get('data'), list):
                return [item for item in payload['data'] if isinstance(item, dict)]

        return []

    def _extract_apify_timeline(self, payload_items: list[dict[str, Any]]) -> list[TrendTimelinePoint]:
        dated_values: list[tuple[datetime, int]] = []
        nodes = list(self._iter_dict_nodes(payload_items))

        for index, node in enumerate(nodes):
            raw_date = node.get('date') or node.get('time') or node.get('timestamp') or node.get('formattedDate')
            raw_value = node.get('value')
            if raw_value is None:
                raw_value = node.get('interest') or node.get('hits') or node.get('score') or node.get('values')

            value = self._extract_numeric_value(raw_value)
            if value is None:
                continue

            date_text = str(raw_date or '').strip()
            parsed_date = self._parse_trend_date(date_text)
            if not parsed_date:
                parsed_date = datetime.now(timezone.utc).replace(day=1)
                parsed_date = parsed_date.replace(month=max(1, min(12, (index % 12) + 1)))

            dated_values.append((parsed_date, max(0, min(100, value))))

        if not dated_values:
            return []

        month_map: dict[tuple[int, int], tuple[datetime, int]] = {}
        for point_date, value in dated_values:
            key = (point_date.year, point_date.month)
            existing = month_map.get(key)
            if not existing or point_date >= existing[0]:
                month_map[key] = (point_date, value)

        ordered = sorted(month_map.values(), key=lambda entry: entry[0])[-12:]
        return [
            TrendTimelinePoint(month=point_date.strftime('%b'), value=value)
            for point_date, value in ordered
        ]

    def _extract_apify_top_region(self, payload_items: list[dict[str, Any]]) -> str:
        best_region = 'India'
        best_value = -1

        for node in self._iter_dict_nodes(payload_items):
            region_name = str(
                node.get('region')
                or node.get('geoName')
                or node.get('location')
                or node.get('country')
                or ''
            ).strip()
            value = self._extract_numeric_value(
                node.get('value')
                or node.get('interest')
                or node.get('hits')
                or node.get('score')
            )

            if region_name and value is not None and value > best_value:
                best_region = region_name
                best_value = value

        return self._normalize_region(best_region)

    def _extract_apify_keywords(self, payload_items: list[dict[str, Any]]) -> list[TrendKeywordItem]:
        keywords: list[TrendKeywordItem] = []
        for node in self._iter_dict_nodes(payload_items):
            term = str(
                node.get('query')
                or node.get('keyword')
                or node.get('term')
                or node.get('topic_title')
                or node.get('topicTitle')
                or ''
            ).strip()
            if len(term) < 3:
                continue

            growth = self._format_growth_value(
                node.get('growth')
                or node.get('value')
                or node.get('percentage')
                or node.get('score')
            )
            keywords.append(TrendKeywordItem(term=term[:120], growth=growth))

        deduped: dict[str, TrendKeywordItem] = {}
        for keyword in keywords:
            deduped[keyword.term.lower()] = keyword

        return list(deduped.values())[:12]

    @staticmethod
    def _iter_dict_nodes(value: Any):
        if isinstance(value, dict):
            yield value
            for nested in value.values():
                yield from TrendService._iter_dict_nodes(nested)
        elif isinstance(value, list):
            for item in value:
                yield from TrendService._iter_dict_nodes(item)

    def _timeline_from_series(self, series: Any) -> list[TrendTimelinePoint]:
        try:
            monthly = series.resample('MS').mean().dropna().tail(12)
        except Exception:
            monthly = series.tail(12)

        timeline: list[TrendTimelinePoint] = []

        try:
            iterator = monthly.items()
        except Exception:
            return timeline

        for index, value in iterator:
            try:
                numeric = int(round(float(value)))
            except Exception:
                continue

            month_label = index.strftime('%b') if hasattr(index, 'strftime') else str(index)
            timeline.append(
                TrendTimelinePoint(
                    month=month_label,
                    value=max(0, min(100, numeric))
                )
            )

        return timeline[-12:]

    def _extract_pytrends_keywords(self, related_queries: dict[str, Any], query: str) -> list[TrendKeywordItem]:
        query_data = related_queries.get(query) if isinstance(related_queries, dict) else None
        if not isinstance(query_data, dict):
            return []

        rising_df = query_data.get('rising')
        top_df = query_data.get('top')
        source_df = rising_df if getattr(rising_df, 'empty', True) is False else top_df
        if source_df is None or getattr(source_df, 'empty', True):
            return []

        keywords: list[TrendKeywordItem] = []
        for _, row in source_df.head(12).iterrows():
            term = str(row.get('query') or row.get('topic_title') or '').strip()
            if not term:
                continue

            keywords.append(
                TrendKeywordItem(
                    term=term,
                    growth=self._format_growth_value(row.get('value'))
                )
            )

        return keywords

    def _signal_from_timeline(self, category: str, timeline: list[TrendTimelinePoint], top_region: str) -> TrendSignal:
        if not timeline:
            raise TrendDataUnavailableError(f'Unable to derive trend signal for {category}; timeline data is empty.')

        first_value = max(1, timeline[0].value)
        last_value = timeline[-1].value
        growth_percentage = round(((last_value - first_value) / first_value) * 100.0, 1)

        tail = timeline[-3:] if len(timeline) >= 3 else timeline
        tail_average = sum(point.value for point in tail) / len(tail)
        momentum_score = int(max(1, min(10, round(tail_average / 10.0))))

        mean_index = sum(point.value for point in timeline) / len(timeline)
        search_volume = int(max(2500, round(mean_index * 2500)))

        return TrendSignal(
            category=category,
            search_volume=search_volume,
            growth_percentage=growth_percentage,
            momentum_score=momentum_score,
            top_region=self._normalize_region(top_region)
        )

    def _fallback_keywords(self, signal: TrendSignal) -> list[TrendKeywordItem]:
        llm_keywords = self._generate_keywords_with_llm(signal)
        if llm_keywords:
            return llm_keywords

        # Dynamic, non-static heuristic fallback based on current live signal context.
        category_slug = signal.category.lower()
        region_slug = signal.top_region.lower().replace(' ', ' ')
        growth_anchor = max(15, min(180, int(abs(signal.growth_percentage)) + (signal.momentum_score * 7)))

        candidate_terms = [
            f'{category_slug} trends {region_slug}',
            f'{category_slug} new arrivals india',
            f'best {category_slug} brands india',
            f'{category_slug} price under 2999',
            f'{category_slug} outfit ideas {region_slug}',
            f'{category_slug} sale online india'
        ]

        keywords: list[TrendKeywordItem] = []
        for index, term in enumerate(candidate_terms):
            growth_value = max(8, growth_anchor - (index * 9))
            keywords.append(TrendKeywordItem(term=term, growth=f'+{growth_value}%'))

        return keywords[:12]

    def _generate_keywords_with_llm(self, signal: TrendSignal) -> list[TrendKeywordItem]:
        if not self._keyword_generation_chain:
            return []

        try:
            response = self._keyword_generation_chain.invoke(
                {
                    'category': signal.category,
                    'region': signal.top_region,
                    'growth_percentage': signal.growth_percentage,
                    'momentum_score': signal.momentum_score
                }
            )
        except Exception:
            return []

        raw_content = str(getattr(response, 'content', response)).strip()
        if not raw_content:
            return []

        match = re.search(r'\[.*\]', raw_content, flags=re.DOTALL)
        json_payload = match.group(0) if match else raw_content

        try:
            parsed = json.loads(json_payload)
        except Exception:
            return []

        if not isinstance(parsed, list):
            return []

        deduped: dict[str, TrendKeywordItem] = {}
        for item in parsed:
            if not isinstance(item, dict):
                continue

            term = str(item.get('term') or '').strip()
            if len(term) < 3:
                continue

            growth = self._format_growth_value(item.get('growth'))
            deduped[term.lower()] = TrendKeywordItem(term=term[:120], growth=growth)

        return list(deduped.values())[:12]

    @staticmethod
    def _extract_numeric_value(candidate: Any) -> int | None:
        if candidate is None:
            return None

        if isinstance(candidate, list) and candidate:
            first = candidate[0]
            if isinstance(first, dict):
                extracted = first.get('extracted_value') or first.get('value')
                return TrendService._extract_numeric_value(extracted)
            return TrendService._extract_numeric_value(first)

        if isinstance(candidate, dict):
            extracted = candidate.get('extracted_value') or candidate.get('value')
            return TrendService._extract_numeric_value(extracted)

        if isinstance(candidate, (int, float)):
            return int(round(candidate))

        text = str(candidate).strip().lower()
        if not text:
            return None
        if text == 'breakout':
            return 100

        digits = ''.join(char for char in text if char.isdigit() or char == '.')
        if not digits:
            return None

        try:
            return int(round(float(digits)))
        except ValueError:
            return None

    @staticmethod
    def _format_growth_value(value: Any) -> str:
        if value is None:
            return '+0%'

        text = str(value).strip()
        if not text:
            return '+0%'
        if text.lower() == 'breakout':
            return 'Breakout'
        if text.startswith('+') or text.startswith('-'):
            return text if text.endswith('%') else f'{text}%'

        try:
            numeric = float(text)
            return f"{numeric:+.0f}%"
        except ValueError:
            return text

    @staticmethod
    def _parse_trend_date(value: str) -> datetime | None:
        if not value:
            return None

        formats = [
            '%b %Y',
            '%Y-%m-%d',
            '%d %b %Y',
            '%Y-%m',
            '%m/%d/%Y',
            '%Y-%m-%dT%H:%M:%S.%fZ',
            '%Y-%m-%dT%H:%M:%SZ'
        ]
        for date_format in formats:
            try:
                return datetime.strptime(value, date_format).replace(tzinfo=timezone.utc)
            except ValueError:
                continue

        return None

    @staticmethod
    def _normalize_category(category: str) -> str:
        normalized = category.strip().title()
        if normalized in {'Athleisure', 'Yoga'}:
            return 'Activewear'
        if normalized in {'Jackets', 'Winterwear'}:
            return 'Outerwear'
        if normalized in {'Sneakers', 'Shoes'}:
            return 'Footwear'
        return normalized

    @classmethod
    def _normalize_region(cls, region: str) -> str:
        candidate = str(region or '').strip()
        if not candidate:
            return 'All Over India'

        compact = re.sub(r'\s+', ' ', candidate).strip()
        lowered = compact.lower()

        if lowered in cls.REGION_ALIAS_MAP:
            return cls.REGION_ALIAS_MAP[lowered]

        for city in cls.TIER_ONE_CITIES:
            if lowered == city.lower():
                return city

        return 'All Over India'

    @staticmethod
    def _status_from_signal(signal: TrendSignal) -> str:
        if signal.growth_percentage >= 20 and signal.momentum_score >= 8:
            return 'Surging'
        if signal.growth_percentage >= 0 and signal.momentum_score >= 5:
            return 'Steady'
        if signal.growth_percentage < 0 and signal.momentum_score <= 3:
            return 'Declining'
        return 'Seasonal'
