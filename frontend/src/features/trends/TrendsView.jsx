import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Filter, MapPin, Network, Search, TrendingDown, TrendingUp } from 'lucide-react';
import { getTrendTimeline, listIntelligenceProducts, listTrendKeywords, listTrendSignals } from '@/lib/api';

const FULL_TIMELINE_MONTHS = 12;
const CATALOG_SEARCH_MIN_LENGTH = 3;
const TIME_WINDOWS = [
  { id: '3M', months: 3 },
  { id: '6M', months: 6 },
  { id: '12M', months: 12 }
];

const CATEGORY_MATCH_ALIASES = {
  shoes: ['footwear', 'sneaker', 'sneakers'],
  footwear: ['shoes', 'sneaker', 'sneakers'],
  sneaker: ['sneakers', 'shoes', 'footwear'],
  sneakers: ['sneaker', 'shoes', 'footwear']
};

function getWindowMonths(windowId) {
  return TIME_WINDOWS.find((window) => window.id === windowId)?.months ?? 12;
}

const STATUS_META = {
  Surging: {
    confidence: 92,
    badgeClass: 'border-[#2A6B3D]/20 bg-[#2A6B3D]/10 text-[#2A6B3D]'
  },
  Steady: {
    confidence: 74,
    badgeClass: 'border-[#111111]/20 bg-[#111111]/10 text-[#111111]'
  },
  Declining: {
    confidence: 41,
    badgeClass: 'border-[#E32929]/20 bg-[#E32929]/10 text-[#E32929]'
  },
  Seasonal: {
    confidence: 56,
    badgeClass: 'border-[#8C827A]/20 bg-[#8C827A]/10 text-[#8C827A]'
  }
};

function formatProvider(provider) {
  if (!provider) {
    return 'Trend Provider';
  }

  if (provider === 'apify_google_trends') {
    return 'Apify Google Trends';
  }
  if (provider === 'pytrends') {
    return 'Google Trends (PyTrends)';
  }
  return provider.replace(/[_-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildInsightNarrative(activeTrend) {
  const growthValue = parseGrowthValue(activeTrend.growth);
  const directionText = growthValue >= 0 ? 'accelerating' : 'cooling';

  return (
    `${activeTrend.category} demand is ${directionText} in ${activeTrend.region} with ` +
    `${activeTrend.growth} year-over-year movement and a momentum score of ${activeTrend.momentum_score}/10. ` +
    `Use this live demand curve to size buys and adjust pricing cadence weekly.`
  );
}

function buildSourceList(activeTrend) {
  const providerLabel = formatProvider(activeTrend.provider);
  return [
    `${providerLabel} timeline feed (${FULL_TIMELINE_MONTHS} months)`,
    `${activeTrend.category} related query stream`,
    `${activeTrend.region} regional interest heatmap`
  ];
}

function keywordBadgeStyle(growth) {
  const value = parseGrowthValue(growth);
  if (String(growth).toLowerCase() === 'breakout' || value >= 90) {
    return 'text-[#E32929] bg-[#E32929]/10';
  }
  if (value >= 30) {
    return 'text-[#2A6B3D] bg-[#2A6B3D]/10';
  }
  return 'text-[#111111] bg-[#F2F0EA]';
}

function normalizeMonthLabel(rawValue, fallbackMonth) {
  if (typeof rawValue === 'string' && rawValue.trim()) {
    const trimmed = rawValue.trim();
    const parsedDate = new Date(trimmed);
    if (!Number.isNaN(parsedDate.getTime())) {
      return parsedDate.toLocaleString('en-US', { month: 'short' });
    }

    const compact = trimmed.replace(/[^a-zA-Z]/g, '');
    if (compact.length >= 3) {
      const abbreviation = compact.slice(0, 1).toUpperCase() + compact.slice(1, 3).toLowerCase();
      return abbreviation;
    }

    return trimmed;
  }

  return fallbackMonth;
}

function normalizeTimelinePoints(rawTimeline) {
  if (!Array.isArray(rawTimeline) || rawTimeline.length === 0) {
    return [];
  }

  const normalized = rawTimeline
    .map((point, index) => {
      const month = normalizeMonthLabel(
        point?.month ?? point?.label ?? point?.date ?? point?.period,
        `M${index + 1}`
      );
      const rawValue = point?.value ?? point?.interest ?? point?.score ?? point?.signal;
      const numericValue = Number(rawValue);
      if (!Number.isFinite(numericValue)) {
        return null;
      }

      const value = Math.max(0, Math.min(100, Math.round(numericValue)));

      return {
        month,
        value
      };
    })
    .filter((point) => point && typeof point.month === 'string' && point.month.trim() !== '');

  return normalized.slice(-FULL_TIMELINE_MONTHS);
}

function buildLineGraphModel(series) {
  const width = 760;
  const height = 252;
  const padding = { top: 18, right: 24, bottom: 34, left: 32 };
  const baselineY = height - padding.bottom;

  if (!Array.isArray(series) || series.length < 2) {
    return {
      width,
      height,
      padding,
      baselineY,
      points: [],
      linePoints: '',
      areaPoints: '',
      yGuides: [],
      latestPoint: null,
      peakIndex: -1,
      yMin: 0,
      yMax: 100
    };
  }

  const safeSeries = series.map((point, index) => {
    const numericValue = Number(point?.value);
    return {
      month: typeof point?.month === 'string' && point.month.trim() ? point.month.trim() : `M${index + 1}`,
      value: Number.isFinite(numericValue) ? Math.max(0, Math.min(100, numericValue)) : 0
    };
  });

  const values = safeSeries.map((point) => point.value);
  const minValue = Math.max(0, Math.floor(Math.min(...values) - 8));
  const maxValue = Math.min(100, Math.ceil(Math.max(...values) + 8));
  const yMin = Math.min(minValue, maxValue - 1);
  const yMax = Math.max(maxValue, yMin + 1);
  const range = yMax - yMin;
  const drawableWidth = width - padding.left - padding.right;
  const drawableHeight = height - padding.top - padding.bottom;
  const pointDenominator = Math.max(1, safeSeries.length - 1);

  const points = safeSeries.map((point, index) => {
    const x = padding.left + (index / pointDenominator) * drawableWidth;
    const y = padding.top + ((yMax - point.value) / range) * drawableHeight;
    return {
      ...point,
      index,
      x,
      y
    };
  });

  const linePoints = points.map((point) => `${point.x},${point.y}`).join(' ');
  const areaPoints = `${linePoints} ${points[points.length - 1].x},${baselineY} ${points[0].x},${baselineY}`;
  const yGuides = [0.2, 0.5, 0.8].map((ratio) => ({
    y: padding.top + ratio * drawableHeight,
    value: Math.round(yMax - ratio * range)
  }));

  let peakIndex = 0;
  for (let i = 1; i < points.length; i += 1) {
    if (points[i].value > points[peakIndex].value) {
      peakIndex = i;
    }
  }

  return {
    width,
    height,
    padding,
    baselineY,
    points,
    linePoints,
    areaPoints,
    yGuides,
    latestPoint: points[points.length - 1],
    peakIndex,
    yMin,
    yMax
  };
}

function parseGrowthValue(growth) {
  if (!growth) {
    return 0;
  }

  const growthText = String(growth);
  if (growthText.toLowerCase() === 'breakout') {
    return 150;
  }

  const numericGrowth = Number(growthText.replace(/[^0-9.-]/g, ''));
  return Number.isNaN(numericGrowth) ? 0 : numericGrowth;
}

function parseVolumeToK(volume) {
  const numericVolume = Number(volume.replace(/[^0-9.]/g, ''));
  return Number.isNaN(numericVolume) ? 0 : numericVolume;
}

function computeSignalScore(trend) {
  const growthScore = Math.max(0, Math.min(100, 50 + parseGrowthValue(trend.growth)));
  const confidenceScore = STATUS_META[trend.status]?.confidence ?? 50;
  return Math.round((growthScore + confidenceScore) / 2);
}

function normalizeCategoryKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function categoriesAreRelated(left, right) {
  const leftKey = normalizeCategoryKey(left);
  const rightKey = normalizeCategoryKey(right);

  if (!leftKey || !rightKey) {
    return false;
  }

  if (leftKey.includes(rightKey) || rightKey.includes(leftKey)) {
    return true;
  }

  const leftAliases = CATEGORY_MATCH_ALIASES[leftKey] || [];
  const rightAliases = CATEGORY_MATCH_ALIASES[rightKey] || [];

  if (leftAliases.some((alias) => alias === rightKey || alias.includes(rightKey) || rightKey.includes(alias))) {
    return true;
  }

  if (rightAliases.some((alias) => alias === leftKey || alias.includes(leftKey) || leftKey.includes(alias))) {
    return true;
  }

  return false;
}

export default function TrendsView({ selectedCatalogJobId = '' }) {
  const [marketTrends, setMarketTrends] = useState([]);
  const [catalogRecords, setCatalogRecords] = useState([]);
  const [risingKeywords, setRisingKeywords] = useState([]);
  const [timelinePoints, setTimelinePoints] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedWindow, setSelectedWindow] = useState('6M');
  const [selectedRegion, setSelectedRegion] = useState('All Regions');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [keywordFilter, setKeywordFilter] = useState('');

  useEffect(() => {
    setSelectedRegion('All Over India');
    setSelectedCategory('');
    setCatalogSearch('');
    setKeywordFilter('');
  }, [selectedCatalogJobId]);

  useEffect(() => {
    let active = true;

    async function loadCatalogRecords() {
      try {
        const catalogData = await listIntelligenceProducts({
          jobId: selectedCatalogJobId || undefined
        });

        if (!active || !Array.isArray(catalogData)) {
          return;
        }

        const compactRecords = catalogData.slice(0, 1500).map((item) => ({
          name: String(item?.normalized_product?.name || ''),
          brand: String(item?.normalized_product?.brand || ''),
          category: String(item?.normalized_product?.category || '')
        }));
        setCatalogRecords(compactRecords);
      } catch {
        if (active) {
          setCatalogRecords([]);
        }
      }
    }

    loadCatalogRecords();

    return () => {
      active = false;
    };
  }, [selectedCatalogJobId]);

  useEffect(() => {
    let active = true;

    async function loadTrendSignals() {
      try {
        setIsLoading(true);
        setError('');
        const trendData = await listTrendSignals({
          jobId: selectedCatalogJobId || undefined
        });

        if (!active) {
          return;
        }

        if (!Array.isArray(trendData) || trendData.length === 0) {
          setMarketTrends([]);
          setSelectedCategory('');
          setError('No live trend data was returned by providers.');
          return;
        }

        setMarketTrends(trendData);
        setSelectedCategory((previous) => {
          if (previous && trendData.some((trend) => trend.category === previous)) {
            return previous;
          }
          return trendData[0].category;
        });
      } catch (loadError) {
        if (active) {
          setMarketTrends([]);
          setSelectedCategory('');
          setError(
            loadError.message
              ? loadError.message
              : 'Live trend signals unavailable right now.'
          );
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    loadTrendSignals();

    return () => {
      active = false;
    };
  }, [selectedCatalogJobId]);

  const regions = useMemo(() => {
    const available = marketTrends
      .map((trend) => String(trend.region || '').trim())
      .filter((region) => region !== '');

    return ['All Over India', ...new Set(available)];
  }, [marketTrends]);

  useEffect(() => {
    if (!regions.includes(selectedRegion)) {
      setSelectedRegion('All Over India');
    }
  }, [regions, selectedRegion]);

  const normalizedCatalogSearch = catalogSearch.trim().toLowerCase();
  const shouldFilterByCatalogSearch = normalizedCatalogSearch.length >= CATALOG_SEARCH_MIN_LENGTH;

  const catalogSuggestions = useMemo(() => {
    const suggestionMap = new Map();

    const addSuggestion = (rawValue, weight = 1) => {
      const value = String(rawValue || '').trim();
      if (!value || value.length < 2) {
        return;
      }

      const key = value.toLowerCase();
      const existing = suggestionMap.get(key);
      if (existing) {
        existing.weight += weight;
        return;
      }

      suggestionMap.set(key, { value, weight });
    };

    catalogRecords.forEach((record) => {
      addSuggestion(record.category, 4);
      addSuggestion(record.brand, 2);
      addSuggestion(record.name, 1);
    });

    marketTrends.forEach((trend) => {
      addSuggestion(trend.category, 5);
    });

    let suggestions = [...suggestionMap.values()];
    if (normalizedCatalogSearch) {
      suggestions = suggestions.filter((entry) => entry.value.toLowerCase().includes(normalizedCatalogSearch));
    }

    suggestions.sort((left, right) => right.weight - left.weight || left.value.length - right.value.length);
    return suggestions.map((entry) => entry.value).slice(0, 14);
  }, [catalogRecords, marketTrends, normalizedCatalogSearch]);

  const matchedCatalogCategories = useMemo(() => {
    if (!shouldFilterByCatalogSearch) {
      return null;
    }

    const matched = new Set();

    catalogRecords.forEach((record) => {
      const category = String(record?.category || '').trim();
      if (!category) {
        return;
      }

      const nameMatch = String(record?.name || '').toLowerCase().includes(normalizedCatalogSearch);
      const brandMatch = String(record?.brand || '').toLowerCase().includes(normalizedCatalogSearch);
      const categoryMatch = category.toLowerCase().includes(normalizedCatalogSearch);
      if (nameMatch || brandMatch || categoryMatch) {
        matched.add(category.toLowerCase());
      }
    });

    marketTrends.forEach((trend) => {
      const category = String(trend?.category || '').trim().toLowerCase();
      if (category && category.includes(normalizedCatalogSearch)) {
        matched.add(category);
      }
    });

    return matched;
  }, [catalogRecords, marketTrends, normalizedCatalogSearch, shouldFilterByCatalogSearch]);

  const filteredTrends = useMemo(() => {
    const byRegion = selectedRegion === 'All Over India'
      ? marketTrends
      : marketTrends.filter((trend) => trend.region === selectedRegion);

    if (!shouldFilterByCatalogSearch) {
      return byRegion;
    }

    if (!matchedCatalogCategories || matchedCatalogCategories.size === 0) {
      return [];
    }

    return byRegion.filter((trend) => {
      const trendCategory = String(trend.category || '').trim();
      if (!trendCategory) {
        return false;
      }

      const trendCategoryLower = trendCategory.toLowerCase();
      if (trendCategoryLower.includes(normalizedCatalogSearch)) {
        return true;
      }

      for (const catalogCategory of matchedCatalogCategories) {
        if (categoriesAreRelated(trendCategoryLower, catalogCategory)) {
          return true;
        }
      }

      return false;
    });
  }, [marketTrends, selectedRegion, normalizedCatalogSearch, matchedCatalogCategories, shouldFilterByCatalogSearch]);

  const activeTrend = useMemo(() => {
    if (filteredTrends.length === 0) {
      return null;
    }

    const selected = filteredTrends.find((trend) => trend.category === selectedCategory);
    return selected ?? filteredTrends[0];
  }, [filteredTrends, selectedCategory]);

  useEffect(() => {
    if (filteredTrends.length === 0) {
      setSelectedCategory('');
      return;
    }

    if (!filteredTrends.some((trend) => trend.category === selectedCategory)) {
      setSelectedCategory(filteredTrends[0].category);
    }
  }, [filteredTrends, selectedCategory]);

  useEffect(() => {
    if (!activeTrend?.category) {
      return;
    }

    let active = true;

    async function loadTrendDetails() {
      try {
        setIsDetailLoading(true);
        const [keywords, timeline] = await Promise.all([
          listTrendKeywords(activeTrend.category, 20, {
            jobId: selectedCatalogJobId || undefined
          }),
          getTrendTimeline(activeTrend.category, FULL_TIMELINE_MONTHS, {
            jobId: selectedCatalogJobId || undefined
          })
        ]);

        if (!active) {
          return;
        }

        setRisingKeywords(keywords);
        setTimelinePoints(timeline);
      } catch {
        if (active) {
          setRisingKeywords([]);
          setTimelinePoints([]);
        }
      } finally {
        if (active) {
          setIsDetailLoading(false);
        }
      }
    }

    loadTrendDetails();

    return () => {
      active = false;
    };
  }, [activeTrend?.category, selectedCatalogJobId]);

  const filteredKeywords = useMemo(() => {
    const normalizedQuery = keywordFilter.trim().toLowerCase();

    return risingKeywords
      .filter((keyword) => keyword.term.toLowerCase().includes(normalizedQuery))
      .sort((left, right) => parseGrowthValue(right.growth) - parseGrowthValue(left.growth));
  }, [keywordFilter, risingKeywords]);

  const topKeyword = filteredKeywords[0];

  const normalizedTimeline = useMemo(() => normalizeTimelinePoints(timelinePoints), [timelinePoints]);

  const chartSeries = useMemo(() => {
    const monthWindow = getWindowMonths(selectedWindow);
    return normalizedTimeline.slice(-monthWindow);
  }, [normalizedTimeline, selectedWindow]);

  const lineChart = useMemo(() => buildLineGraphModel(chartSeries), [chartSeries]);

  if (isLoading) {
    return (
      <div className="max-w-[1400px] animate-in fade-in duration-500">
        <div className="border border-[#E5E2D9] bg-white p-8 text-center shadow-sm">
          <h2 className="font-serif text-xl text-[#111111]">Trend Signals</h2>
          <p className="mt-2 text-sm text-[#555555]">Loading live trend intelligence...</p>
        </div>
      </div>
    );
  }

  if (!activeTrend) {
    let emptyMessage = selectedRegion !== 'All Over India'
      ? `No trend signals found for ${selectedRegion}.`
      : 'No live trend data available for this selection.';

    if (shouldFilterByCatalogSearch) {
      emptyMessage = `No trend signals match your catalog search for "${catalogSearch}".`;
    }

    return (
      <div className="max-w-[1400px] animate-in fade-in duration-500">
        <div className="border border-[#E5E2D9] bg-white p-8 text-center shadow-sm">
          <h2 className="font-serif text-xl text-[#111111]">Trend Signals</h2>
          <p className="mt-2 text-sm text-[#555555]">{error || emptyMessage}</p>
        </div>
      </div>
    );
  }

  const statusMeta = STATUS_META[activeTrend.status] ?? STATUS_META.Steady;
  const trendIsPositive = parseGrowthValue(activeTrend.growth) >= 0;
  const hasChartData = chartSeries.length > 0;
  const peakPoint = hasChartData
    ? chartSeries.reduce(
        (highest, current) => (current.value > highest.value ? current : highest),
        chartSeries[0]
      )
    : { month: 'N/A', value: 0 };
  const averageScore = hasChartData
    ? Math.round(chartSeries.reduce((sum, point) => sum + point.value, 0) / chartSeries.length)
    : 0;
  const forecastScore = hasChartData
    ? Math.max(5, Math.min(100, Math.round(averageScore + (trendIsPositive ? 8 : -6))))
    : 0;
  const totalVolumeK = Math.round(
    filteredTrends.reduce((sum, trend) => sum + parseVolumeToK(trend.volume), 0)
  );
  const liveProvider = formatProvider(activeTrend.provider || marketTrends[0]?.provider);
  const sourceList = buildSourceList(activeTrend);
  const insightNarrative = buildInsightNarrative(activeTrend);
  const windowStartLabel = chartSeries[0]?.month || 'N/A';
  const windowEndLabel = chartSeries[chartSeries.length - 1]?.month || 'N/A';
  const timelineUnavailable = chartSeries.length < 2;

  return (
    <div className="mx-auto w-full max-w-[1400px] screen-enter">
      {error && (
        <div className="confluxe-alert confluxe-alert-error mb-4">
          {error}
        </div>
      )}

      <div className="fade-up mb-6 flex flex-col items-start justify-between gap-4 md:mb-8 md:flex-row md:items-end">
        <div>
          <div className="mb-2 flex items-center gap-3">
            <div className="h-1.5 w-1.5 bg-[#E32929]" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#E32929]">
              External Intelligence
            </span>
          </div>
          <h1 className="text-2xl font-serif tracking-tight text-[#111111] md:text-3xl">Market Trend Pulse.</h1>
          <p className="mt-2 max-w-2xl text-sm text-[#888888]">
            Real-time search volume combined with our <strong className="text-[#111111]">Contextual Trend RAG Agent</strong>{' '}
            to explain the why behind the spikes.
          </p>
        </div>
        <div className="flex w-fit items-center gap-2 border border-[#E5E2D9] bg-white px-4 py-2 shadow-sm">
          <div className="h-2 w-2 animate-pulse rounded-full bg-[#2A6B3D]" />
          <span className="text-[9px] font-bold uppercase tracking-widest text-[#555555]">
            Live: {liveProvider}
          </span>
        </div>
      </div>

      <div className="fade-up delay-1 mb-6 flex flex-col gap-3 border border-[#E5E2D9] bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between md:mb-8 md:p-4">
        <div className="inline-flex overflow-hidden border border-[#E5E2D9] bg-[#FAF9F5]">
          {TIME_WINDOWS.map((window) => (
            <button
              key={window.id}
              type="button"
              onClick={() => setSelectedWindow(window.id)}
              className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest transition-colors ${
                selectedWindow === window.id
                  ? 'bg-[#111111] text-white'
                  : 'text-[#555555] hover:bg-[#EAE7DF] hover:text-[#111111]'
              }`}
            >
              {window.id}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative block">
            <Filter
              size={12}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#555555]"
            />
            <select
              value={selectedRegion}
              onChange={(event) => setSelectedRegion(event.target.value)}
              className="confluxe-select w-full py-2 pl-8 pr-8 text-[10px] font-bold uppercase tracking-widest sm:w-44"
            >
              {regions.map((region) => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
            </select>
          </label>

          <label className="relative block">
            <Search size={12} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#888888]" />
            <input
              list="catalog-search-suggestions"
              type="text"
              value={catalogSearch}
              onChange={(event) => setCatalogSearch(event.target.value)}
              placeholder="Search within catalog data (3+ chars)"
              className="w-full border border-[#E5E2D9] py-2 pl-8 pr-3 text-xs text-[#111111] placeholder-[#888888] focus:border-[#111111] focus:outline-none sm:w-64"
            />
            <datalist id="catalog-search-suggestions">
              {catalogSuggestions.map((suggestion) => (
                <option key={suggestion} value={suggestion} />
              ))}
            </datalist>
          </label>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3 md:mb-8 md:gap-6">
        <div className="stagger-item border border-[#E5E2D9] bg-white p-5 shadow-sm transition-colors hover:border-[#111111] delay-1">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[#888888]">Tracked Search Volume</p>
          <h3 className="text-2xl font-serif text-[#111111] md:text-3xl">{totalVolumeK}K</h3>
          <p className="mt-2 text-[9px] font-bold uppercase tracking-widest text-[#888888]">
            Across {filteredTrends.length} active categories
          </p>
        </div>
        <div className="stagger-item border border-[#E5E2D9] bg-white p-5 shadow-sm transition-colors hover:border-[#111111] delay-2">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[#888888]">Fastest Rising Query</p>
          <h3 className="truncate text-2xl font-serif text-[#111111] md:text-3xl">
            {topKeyword ? topKeyword.term : 'No Match'}
          </h3>
          <p className="mt-2 flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-[#2A6B3D]">
            <ArrowUpRight size={10} />
            {topKeyword ? topKeyword.growth : '0%'} Growth Momentum
          </p>
        </div>
        <div className="stagger-item border border-[#E5E2D9] bg-white p-5 shadow-sm transition-colors hover:border-[#111111] delay-3">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[#888888]">Signal Confidence</p>
          <h3 className="text-2xl font-serif text-[#111111] md:text-3xl">{statusMeta.confidence}%</h3>
          <div className="mt-3 h-1.5 w-full overflow-hidden bg-[#F2F0EA]">
            <div className="h-full bg-[#E32929]" style={{ width: `${statusMeta.confidence}%` }} />
          </div>
        </div>
      </div>

      <div className="space-y-6 md:space-y-8">
        <section className="grid grid-cols-1 gap-6 xl:grid-cols-12 md:gap-8">
          <div className="fade-up delay-2 relative col-span-1 flex flex-col justify-between overflow-hidden bg-[#E32929] p-6 text-white shadow-xl md:p-8 xl:col-span-4">
            <div className="animate-pan absolute -right-8 -top-8 text-white/10">
              <TrendingUp size={180} strokeWidth={1} />
            </div>

            <div className="relative z-10">
              <div className="mb-6 flex items-center justify-between border-b border-white/20 pb-3">
                <h3 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest">
                  <span className="h-1.5 w-1.5 bg-white" />
                  RAG Agent Insight: {activeTrend.category}
                </h3>
                <Network size={14} className="text-white/80" />
              </div>

              <h4 className="mb-4 text-2xl font-serif leading-tight sm:text-3xl">
                {activeTrend.category} signals {trendIsPositive ? 'expanding' : 'cooling'} in {activeTrend.region}.
              </h4>
              <p className="mb-6 border-l-2 border-white bg-black/10 p-4 text-xs leading-relaxed text-white/90">
                {insightNarrative}
              </p>

              <div className="mb-6 flex flex-wrap items-center gap-3">
                <span className={`border px-2 py-1 text-[9px] font-bold uppercase tracking-widest ${statusMeta.badgeClass}`}>
                  {activeTrend.status}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/80">
                  YoY: {activeTrend.growth}
                </span>
              </div>

              <div className="mb-8">
                <p className="mb-2 text-[8px] font-bold uppercase tracking-widest text-white/60">
                  Sources Retrieved via Vector DB
                </p>
                <ul className="space-y-1.5 font-mono text-[10px] text-white/80">
                  {sourceList.map((source, index) => (
                    <li key={source}>
                      [{index + 1}] {source}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <button
              type="button"
              className="relative z-10 w-full bg-white px-5 py-3 text-center text-[10px] font-bold uppercase tracking-widest text-[#E32929] transition-all hover:bg-[#FAF9F5]"
            >
              Add Insight to Merch Brief
            </button>
          </div>

          <div className="fade-up delay-3 col-span-1 flex w-full flex-col border border-[#E5E2D9] bg-white shadow-sm xl:col-span-8">
            <div className="border-b border-[#E5E2D9] p-5">
              <h2 className="font-serif text-[#111111]">Category Momentum Map</h2>
            </div>

            <div className="space-y-3 p-4 md:hidden">
              {filteredTrends.map((trend, index) => {
                const isActive = trend.category === activeTrend.category;

                return (
                  <button
                    key={trend.category}
                    type="button"
                    onClick={() => setSelectedCategory(trend.category)}
                    className={`stagger-item w-full border p-4 text-left transition-all ${
                      isActive
                        ? 'border-[#111111] bg-[#FAF9F5] shadow-sm'
                        : 'border-[#E5E2D9] bg-white hover:border-[#111111]'
                    }`}
                    style={{ animationDelay: `${180 + index * 70}ms` }}
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="font-serif text-[#111111]">{trend.category}</p>
                        <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-[#888888]">
                          {trend.volume} • {trend.region}
                        </p>
                      </div>
                      <span
                        className={`border px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${
                          STATUS_META[trend.status]?.badgeClass ?? STATUS_META.Steady.badgeClass
                        }`}
                      >
                        {trend.status}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest">
                      <span className={trend.growth.includes('+') ? 'text-[#2A6B3D]' : 'text-[#E32929]'}>
                        {trend.growth}
                      </span>
                      <span className="text-[#555555]">Signal {computeSignalScore(trend)}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="hidden flex-1 w-full overflow-x-auto md:block">
              <table className="min-w-[620px] w-full whitespace-nowrap text-left text-sm">
                <thead className="border-b border-[#E5E2D9] bg-[#FAF9F5] text-[#888888]">
                  <tr>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider">Category</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider">Monthly Vol</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider">YoY Growth</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider">Top Region</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider">Signal Score</th>
                    <th className="px-6 py-4 text-right text-[10px] font-bold uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E2D9]">
                  {filteredTrends.map((trend) => {
                    const isActive = trend.category === activeTrend.category;

                    return (
                      <tr
                        key={trend.category}
                        onClick={() => setSelectedCategory(trend.category)}
                        className={`cursor-pointer transition-colors ${
                          isActive ? 'bg-[#FAF9F5]' : 'hover:bg-[#FDFCF9]'
                        }`}
                      >
                        <td className="px-6 py-5 font-serif text-[#111111]">{trend.category}</td>
                        <td className="px-6 py-5 text-sm text-[#555555]">{trend.volume}</td>
                        <td className={`px-6 py-5 text-sm font-bold ${trend.growth.includes('+') ? 'text-[#2A6B3D]' : 'text-[#E32929]'}`}>
                          {trend.growth}
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-1.5 text-xs text-[#555555]">
                            <MapPin size={12} className="text-[#888888]" />
                            {trend.region}
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-14 overflow-hidden bg-[#F2F0EA]">
                              <div
                                className="h-full bg-[#111111]"
                                style={{ width: `${computeSignalScore(trend)}%` }}
                              />
                            </div>
                            <span className="text-xs font-bold text-[#111111]">
                              {computeSignalScore(trend)}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-5 text-right">
                          <span
                            className={`border px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest ${
                              STATUS_META[trend.status]?.badgeClass ?? STATUS_META.Steady.badgeClass
                            }`}
                          >
                            {trend.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-12 md:gap-8">
          <div className="col-span-1 flex flex-col gap-6 xl:col-span-4">
            <div className="fade-up delay-4 flex w-full flex-col border border-[#E5E2D9] bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-[#E5E2D9] p-4 md:p-5">
                <div className="flex items-center justify-between">
                  <h2 className="font-serif text-[#111111]">Rising Search Queries</h2>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-[#888888]">
                    {filteredKeywords.length} matching terms
                  </span>
                </div>
                <label className="relative block">
                  <Search size={12} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#888888]" />
                  <input
                    type="text"
                    value={keywordFilter}
                    onChange={(event) => setKeywordFilter(event.target.value)}
                    placeholder="Filter returned query terms"
                    className="w-full border border-[#E5E2D9] bg-[#FAF9F5] py-2 pl-8 pr-3 text-[10px] uppercase font-bold tracking-widest text-[#111111] placeholder-[#888888] focus:border-[#111111] focus:bg-white focus:outline-none transition-colors"
                  />
                </label>
              </div>
              <div className="flex-1 p-2">
                {filteredKeywords.length > 0 ? (
                  filteredKeywords.map((kw, i) => (
                    <div
                      key={kw.term}
                      className="flex items-center justify-between border-b border-[#E5E2D9] p-3 transition-colors last:border-0 hover:bg-[#FDFCF9] sm:p-4"
                    >
                      <div className="min-w-0 flex items-center gap-3">
                        <span className="shrink-0 text-sm font-serif text-[#888888] opacity-50">0{i + 1}</span>
                        <span className="truncate text-xs font-medium leading-tight text-[#111111] sm:text-sm">
                          "{kw.term}"
                        </span>
                      </div>
                      <span
                        className={`ml-2 shrink-0 whitespace-nowrap px-2 py-1 text-[8px] font-bold uppercase tracking-widest sm:text-[9px] ${keywordBadgeStyle(kw.growth)}`}
                      >
                        {kw.growth}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="p-4 text-center text-xs text-[#888888]">
                    No query terms matched your filter.
                  </div>
                )}
              </div>
              <div className="border-t border-[#E5E2D9] bg-[#FAF9F5] p-4">
                <button
                  type="button"
                  className="w-full text-center text-[10px] font-bold uppercase tracking-widest text-[#E32929] transition-colors hover:text-[#111111]"
                >
                    {isDetailLoading ? 'Syncing Queries...' : 'Send Top Queries to Planner'}
                </button>
              </div>
            </div>

            <div className="fade-up delay-6 border border-[#E5E2D9] bg-white p-6 shadow-sm">
              <h2 className="mb-4 font-serif text-[#111111]">Deployment Guidance</h2>
              <p className="text-sm leading-relaxed text-[#555555]">
                Prioritize {activeTrend.category.toLowerCase()} demand in {activeTrend.region} while confidence sits at{' '}
                <span className="font-bold text-[#111111]">{statusMeta.confidence}%</span>. Recommended move is a
                focused 6-week test allocation with weekly repricing and search-term refresh cycles.
              </p>

              <div className="mt-5 space-y-3">
                <div className="flex items-center justify-between border border-[#E5E2D9] bg-[#FAF9F5] p-3 text-[10px] font-bold uppercase tracking-widest text-[#555555]">
                  <span>Category</span>
                  <span className="text-[#111111]">{activeTrend.category}</span>
                </div>
                <div className="flex items-center justify-between border border-[#E5E2D9] bg-[#FAF9F5] p-3 text-[10px] font-bold uppercase tracking-widest text-[#555555]">
                  <span>Region Focus</span>
                  <span className="text-[#111111]">{activeTrend.region}</span>
                </div>
                <div className="flex items-center justify-between border border-[#E5E2D9] bg-[#FAF9F5] p-3 text-[10px] font-bold uppercase tracking-widest text-[#555555]">
                  <span>Signal Score</span>
                  <span className="text-[#111111]">{computeSignalScore(activeTrend)}</span>
                </div>
              </div>

              <button
                type="button"
                className="mt-5 w-full bg-[#111111] px-5 py-3 text-center text-[10px] font-bold uppercase tracking-widest text-white transition-colors hover:bg-[#E32929]"
              >
                Generate Trend Action Plan
              </button>
            </div>
          </div>

          <div className="fade-up delay-5 col-span-1 flex w-full flex-col justify-between border border-[#E5E2D9] bg-white p-5 shadow-sm md:p-8 xl:col-span-8">
            <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-lg font-serif text-[#111111]">Search Interest Over Time</h2>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-[#888888]">
                  Macro Indicator: {activeTrend.category}
                </p>
                <p className="mt-1 text-[9px] font-bold uppercase tracking-widest text-[#AAA29A]">
                  Window: {selectedWindow} ({windowStartLabel} to {windowEndLabel})
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4 text-right">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-[#888888]">Peak</p>
                  <p className="text-xl font-serif text-[#111111]">{peakPoint.value}</p>
                </div>
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-[#888888]">Forecast</p>
                  <p className="text-xl font-serif text-[#111111]">{forecastScore}</p>
                </div>
              </div>
            </div>

            <div className="mb-5 flex items-center gap-4 border border-[#E5E2D9] bg-[#FAF9F5] p-3">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[#555555]">
                {trendIsPositive ? <TrendingUp size={12} className="text-[#2A6B3D]" /> : <TrendingDown size={12} className="text-[#E32929]" />}
                {trendIsPositive ? 'Uptrend' : 'Cooling'}
              </div>
              <div className="h-3 w-px bg-[#E5E2D9]" />
              <div className="text-[10px] font-bold uppercase tracking-widest text-[#555555]">
                Avg Signal: {averageScore}
              </div>
            </div>

            <div className="relative mt-4 border border-[#E5E2D9] bg-[#FCFBF8] p-3 sm:p-4">
              <svg
                viewBox={`0 0 ${lineChart.width} ${lineChart.height}`}
                className="h-56 w-full overflow-visible sm:h-60"
                role="img"
                aria-label={`${activeTrend.category} search interest trend line`}
              >
                {lineChart.yGuides.map((level, index) => (
                  <g key={`guide-${index}`}>
                    <line
                      x1={lineChart.padding.left}
                      y1={level.y}
                      x2={lineChart.width - lineChart.padding.right}
                      y2={level.y}
                      stroke="#E7E1D6"
                      strokeDasharray="4 5"
                    />
                    <text
                      x={lineChart.padding.left - 6}
                      y={level.y + 3}
                      textAnchor="end"
                      fontSize="9"
                      fontWeight="700"
                      fill="#AAA29A"
                    >
                      {level.value}
                    </text>
                  </g>
                ))}

                <line
                  x1={lineChart.padding.left}
                  y1={lineChart.baselineY}
                  x2={lineChart.width - lineChart.padding.right}
                  y2={lineChart.baselineY}
                  stroke="#CFC7B9"
                  strokeWidth="1.5"
                />

                {lineChart.points.length > 0 && (
                  <>
                    <polygon
                      points={lineChart.areaPoints}
                      fill={trendIsPositive ? 'rgba(17, 17, 17, 0.08)' : 'rgba(140, 130, 122, 0.16)'}
                    />
                    <polyline
                      points={lineChart.linePoints}
                      fill="none"
                      stroke={trendIsPositive ? '#111111' : '#6E665F'}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </>
                )}

                {lineChart.points.map((point) => {
                  const isPeak = point.index === lineChart.peakIndex;
                  const isLatest = point.index === lineChart.points.length - 1;

                  return (
                    <g key={`${point.month}-${point.index}`}>
                      <circle
                        cx={point.x}
                        cy={point.y}
                        r={isPeak || isLatest ? 4.2 : 3}
                        fill={isPeak ? '#E32929' : '#111111'}
                        stroke="#FFFFFF"
                        strokeWidth="1.5"
                      />
                      <title>{`${point.month}: ${point.value}`}</title>
                    </g>
                  );
                })}

                {lineChart.latestPoint && (
                  <g>
                    <line
                      x1={lineChart.latestPoint.x}
                      y1={lineChart.latestPoint.y}
                      x2={lineChart.latestPoint.x + 42}
                      y2={lineChart.latestPoint.y - 18}
                      stroke="#111111"
                      strokeWidth="1"
                      strokeDasharray="2 2"
                    />
                    <rect
                      x={Math.max(lineChart.padding.left, Math.min(lineChart.latestPoint.x + 42, lineChart.width - lineChart.padding.right - 62))}
                      y={lineChart.latestPoint.y - 30}
                      width="62"
                      height="18"
                      fill="#111111"
                    />
                    <text
                      x={Math.max(lineChart.padding.left + 31, Math.min(lineChart.latestPoint.x + 73, lineChart.width - lineChart.padding.right - 31))}
                      y={lineChart.latestPoint.y - 18}
                      textAnchor="middle"
                      fontSize="9"
                      fontWeight="700"
                      fill="#FFFFFF"
                    >
                      {`Signal ${lineChart.latestPoint.value}`}
                    </text>
                  </g>
                )}
              </svg>

              {timelineUnavailable && (
                <p className="mt-2 text-center text-[10px] font-bold uppercase tracking-widest text-[#888888]">
                  Timeline points unavailable from live providers.
                </p>
              )}
            </div>

            <div className="mt-3 flex justify-between text-[9px] font-bold uppercase tracking-widest text-[#888888]">
              {chartSeries.map((data, index) => (
                <div key={`${data.month}-${index}`} className="flex-1 text-center">
                  {data.month}
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
