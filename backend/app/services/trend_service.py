from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote

import requests
from pytrends.request import TrendReq

from app.core.config import settings
from app.models.schemas import TrendDashboardItem, TrendKeywordItem, TrendSignal, TrendTimelinePoint


@dataclass
class TrendSnapshot:
    signal: TrendSignal
    timeline: list[TrendTimelinePoint]
    keywords: list[TrendKeywordItem]
    provider: str
    fetched_at: datetime


class TrendService:
    def __init__(self) -> None:
        self._cache: dict[str, TrendSnapshot] = {}
        self._category_terms: dict[str, str] = {
            'Streetwear': 'streetwear fashion india',
            'Activewear': 'activewear india',
            'Formalwear': 'formalwear india',
            'Outerwear': 'winter jackets india',
            'Footwear': 'sneakers india',
            'Accessories': 'fashion accessories india'
        }
        self._profiles: dict[str, dict[str, int | float | str]] = {
            'Streetwear': {
                'search_volume': 245000,
                'growth_percentage': 45.0,
                'momentum_score': 9,
                'top_region': 'Delhi NCR'
            },
            'Activewear': {
                'search_volume': 180000,
                'growth_percentage': 22.0,
                'momentum_score': 8,
                'top_region': 'Bangalore'
            },
            'Formalwear': {
                'search_volume': 95000,
                'growth_percentage': -5.0,
                'momentum_score': 4,
                'top_region': 'Mumbai'
            },
            'Outerwear': {
                'search_volume': 12000,
                'growth_percentage': -40.0,
                'momentum_score': 2,
                'top_region': 'Shimla'
            },
            'Footwear': {
                'search_volume': 132000,
                'growth_percentage': 18.0,
                'momentum_score': 7,
                'top_region': 'Hyderabad'
            },
            'Accessories': {
                'search_volume': 86000,
                'growth_percentage': 11.0,
                'momentum_score': 6,
                'top_region': 'Pune'
            }
        }

    def get_trend_signal(self, category: str) -> TrendSignal:
        snapshot = self._load_snapshot(category)
        return snapshot.signal

    def get_macro_trends(self) -> list[TrendDashboardItem]:
        items: list[TrendDashboardItem] = []

        for category in ('Streetwear', 'Activewear', 'Formalwear', 'Outerwear', 'Footwear', 'Accessories'):
            # Keep dashboard responses fast; avoid blocking on remote providers when cache is cold.
            snapshot = self._load_snapshot(category, allow_remote=False)
            signal = snapshot.signal
            status = self._status_from_signal(signal)

            items.append(
                TrendDashboardItem(
                    category=signal.category,
                    volume=f"{round(signal.search_volume / 1000)}K",
                    growth=f"{signal.growth_percentage:+.0f}%",
                    region=signal.top_region,
                    status=status,
                    momentum_score=signal.momentum_score,
                    provider=snapshot.provider
                )
            )

        return items

    def get_rising_keywords(self, category: str, limit: int = 10) -> list[TrendKeywordItem]:
        snapshot = self._load_snapshot(category)
        return snapshot.keywords[: max(1, min(50, limit))]

    def get_timeline(self, category: str, months: int = 12) -> list[TrendTimelinePoint]:
        snapshot = self._load_snapshot(category)
        return snapshot.timeline[-max(1, min(12, months)) :]

    def _load_snapshot(self, category: str, allow_remote: bool = True) -> TrendSnapshot:
        normalized_category = self._normalize_category(category)
        cached = self._cache.get(normalized_category)
        now = datetime.now(timezone.utc)

        if cached:
            age_seconds = (now - cached.fetched_at).total_seconds()
            if age_seconds <= settings.trend_cache_ttl_seconds:
                return cached

        if not allow_remote:
            snapshot = self._build_deterministic_snapshot(normalized_category)
        else:
            snapshot = self._build_apify_snapshot(normalized_category)
            if not snapshot:
                snapshot = self._build_pytrends_snapshot(normalized_category)
            if not snapshot:
                snapshot = self._build_deterministic_snapshot(normalized_category)

        self._cache[normalized_category] = snapshot
        return snapshot

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
                    'timeRange': 'today 12-m',
                    'maxItems': 100
                },
                {
                    'queries': [query],
                    'geo': settings.trends_geo,
                    'timeframe': 'today 12-m',
                    'maxItems': 100
                },
                {
                    'searchTerm': query,
                    'geo': settings.trends_geo,
                    'timeRange': 'today 12-m',
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
            if not keywords:
                keywords = self._default_keywords_for_category(category)

            signal = self._signal_from_timeline(category, timeline, top_region)

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

            keywords = self._extract_pytrends_keywords(client.related_queries(), query)
            if not keywords:
                keywords = self._default_keywords_for_category(category)

            signal = self._signal_from_timeline(category, timeline, top_region)

            return TrendSnapshot(
                signal=signal,
                timeline=timeline,
                keywords=keywords,
                provider='pytrends',
                fetched_at=datetime.now(timezone.utc)
            )
        except Exception:
            return None

    def _build_deterministic_snapshot(self, category: str) -> TrendSnapshot:
        profile = self._profiles.get(category, self._profiles['Formalwear'])
        variation_seed = sum(ord(char) for char in category)
        offset = (variation_seed % 7) - 3

        base_value = int(profile['momentum_score']) * 10
        growth_factor = float(profile['growth_percentage']) / 28.0

        timeline: list[TrendTimelinePoint] = []
        month_labels = ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct']
        for index, label in enumerate(month_labels):
            seasonal_swing = ((index % 3) - 1) * 4
            drift = (index - 5) * growth_factor
            value = int(max(4, min(100, round(base_value + seasonal_swing + drift + offset))))
            timeline.append(TrendTimelinePoint(month=label, value=value))

        top_region = str(profile['top_region'])
        signal = self._signal_from_timeline(category, timeline, top_region)

        return TrendSnapshot(
            signal=signal,
            timeline=timeline,
            keywords=self._default_keywords_for_category(category),
            provider='deterministic_fallback',
            fetched_at=datetime.now(timezone.utc)
        )

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
            timeout=45
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

        return best_region

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
            profile = self._profiles.get(category, self._profiles['Formalwear'])
            return TrendSignal(
                category=category,
                search_volume=int(profile['search_volume']),
                growth_percentage=float(profile['growth_percentage']),
                momentum_score=int(profile['momentum_score']),
                top_region=str(profile['top_region'])
            )

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
            top_region=top_region
        )

    def _default_keywords_for_category(self, category: str) -> list[TrendKeywordItem]:
        base_terms = {
            'Streetwear': ['oversized tee india', 'baggy cargo pants', 'street style men'],
            'Activewear': ['gym co-ord women', 'seamless yoga set', 'running tights men'],
            'Formalwear': ['office shirts men', 'formal trouser women', 'blazer slim fit'],
            'Outerwear': ['light jacket india', 'winter hoodie men', 'puffer jacket women'],
            'Footwear': ['chunky sneakers india', 'running shoes women', 'casual sneakers men'],
            'Accessories': ['crossbody bags india', 'minimal watches', 'bucket hats india']
        }

        terms = base_terms.get(category, ['fashion trends india', 'apparel demand india', 'top style searches'])
        growth_values = ['Breakout', '+124%', '+78%']

        return [
            TrendKeywordItem(term=term, growth=growth_values[index % len(growth_values)])
            for index, term in enumerate(terms)
        ]

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

    @staticmethod
    def _status_from_signal(signal: TrendSignal) -> str:
        if signal.growth_percentage >= 20 and signal.momentum_score >= 8:
            return 'Surging'
        if signal.growth_percentage >= 0 and signal.momentum_score >= 5:
            return 'Steady'
        if signal.growth_percentage < 0 and signal.momentum_score <= 3:
            return 'Declining'
        return 'Seasonal'
