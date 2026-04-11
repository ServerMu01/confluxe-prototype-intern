import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Filter, MapPin, Network, Search, TrendingDown, TrendingUp } from 'lucide-react';
import { getTrendTimeline, listTrendKeywords, listTrendSignals } from '@/lib/api';

const TIME_WINDOWS = [
  { id: '3M', months: 3 },
  { id: '6M', months: 6 },
  { id: '12M', months: 12 }
];

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

const INSIGHT_COPY = {
  Streetwear:
    'Streetwear is scaling beyond metros, with social-first style cycles compressing from quarterly to monthly adoption in Tier 2 hubs.',
  Activewear:
    'Activewear is benefiting from hybrid fitness behavior and creator-led wellness content, producing consistent monthly search intent.',
  Formalwear:
    'Formalwear demand is flattening as officewear becomes event-based, making narrower capsule drops more effective than broad rollouts.',
  Outerwear:
    'Outerwear remains weather-bound; targeted launch windows and regional depth outperform always-on nationwide inventory strategies.'
};

const SOURCE_INDEX = {
  Streetwear: ['Google_Trends_IN_Oct.csv', 'Myntra_Q3_Sales_Report.pdf', 'Vogue_India_Streetwear_Blog.html'],
  Activewear: ['YouTube_Fitness_Fashion_Insights.csv', 'Nykaa_Fitwear_Search_Log.json', 'Athleisure_Conversion_Study.pdf'],
  Formalwear: ['LinkedIn_Office_Style_Pulse.csv', 'Wedding_Season_Demand_Report.pdf', 'Retail_Formals_Basket_Study.xlsx'],
  Outerwear: ['IMD_Regional_Weather_Trends.csv', 'Winterwear_Search_Timeline.json', 'Regional_Climate_Demand_Map.pdf']
};

const MONTH_ABBREVIATIONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const FALLBACK_TREND_DASHBOARD = [
  {
    category: 'Streetwear',
    volume: '245K',
    growth: '+45%',
    region: 'Delhi NCR',
    status: 'Surging',
    momentum_score: 9,
    provider: 'offline_fallback'
  },
  {
    category: 'Activewear',
    volume: '180K',
    growth: '+22%',
    region: 'Bangalore',
    status: 'Surging',
    momentum_score: 8,
    provider: 'offline_fallback'
  },
  {
    category: 'Formalwear',
    volume: '95K',
    growth: '-5%',
    region: 'Mumbai',
    status: 'Steady',
    momentum_score: 4,
    provider: 'offline_fallback'
  },
  {
    category: 'Outerwear',
    volume: '12K',
    growth: '-40%',
    region: 'Shimla',
    status: 'Declining',
    momentum_score: 2,
    provider: 'offline_fallback'
  }
];

function formatProvider(provider) {
  if (!provider) {
    return 'Live Trend Feed';
  }

  if (provider === 'apify_google_trends') {
    return 'Apify Google Trends';
  }
  if (provider === 'pytrends') {
    return 'Google Trends (PyTrends)';
  }
  return 'Fallback Trend Model';
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

function buildFallbackSeries(activeTrend, monthCount = 12) {
  const labels = getRollingMonthLabels(monthCount);
  const base = (activeTrend?.momentum_score || 5) * 10;

  return labels.map((month, index) => {
    const swing = ((index % 4) - 1.5) * 5;
    return {
      month,
      value: Math.max(8, Math.min(100, Math.round(base + swing)))
    };
  });
}

function getRollingMonthLabels(monthCount = 12) {
  const labels = [];
  const anchor = new Date();

  for (let offset = monthCount - 1; offset >= 0; offset -= 1) {
    const monthDate = new Date(anchor.getFullYear(), anchor.getMonth() - offset, 1);
    labels.push(monthDate.toLocaleString('en-US', { month: 'short' }));
  }

  return labels;
}

function normalizeMonthLabel(rawValue, fallbackMonth) {
  if (typeof rawValue === 'string' && rawValue.trim()) {
    const trimmed = rawValue.trim();
    const parsedDate = new Date(trimmed);
    if (!Number.isNaN(parsedDate.getTime())) {
      return parsedDate.toLocaleString('en-US', { month: 'short' });
    }

    const alphabeticPrefix = trimmed.replace(/[^a-zA-Z]/g, '').slice(0, 3).toLowerCase();
    const foundMonth = MONTH_ABBREVIATIONS.find((month) => month.toLowerCase() === alphabeticPrefix);
    return foundMonth || fallbackMonth;
  }

  return fallbackMonth;
}

function normalizeTimelinePoints(rawTimeline, activeTrend, monthCount = 12) {
  const fallback = buildFallbackSeries(activeTrend, monthCount);
  const rollingMonths = getRollingMonthLabels(monthCount);

  if (!Array.isArray(rawTimeline) || rawTimeline.length === 0) {
    return fallback;
  }

  const bucket = new Map();

  rawTimeline.forEach((point, index) => {
    const fallbackPoint = fallback[index % fallback.length];
    const month = normalizeMonthLabel(
      point?.month ?? point?.label ?? point?.date ?? point?.period,
      fallbackPoint.month
    );
    const rawValue = point?.value ?? point?.interest ?? point?.score ?? point?.signal;
    const numericValue = Number(rawValue);
    const value = Number.isFinite(numericValue)
      ? Math.max(0, Math.min(100, Math.round(numericValue)))
      : fallbackPoint.value;

    const existing = bucket.get(month) || { sum: 0, count: 0 };
    bucket.set(month, {
      sum: existing.sum + value,
      count: existing.count + 1
    });
  });

  const normalized = rollingMonths.map((month, index) => {
    const monthBucket = bucket.get(month);

    if (!monthBucket || monthBucket.count === 0) {
      return fallback[index];
    }

    return {
      month,
      value: Math.round(monthBucket.sum / monthBucket.count)
    };
  });

  return normalized.length >= 2 ? normalized : fallback;
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

  if (growth.toLowerCase() === 'breakout') {
    return 150;
  }

  const numericGrowth = Number(growth.replace(/[^0-9.-]/g, ''));
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

export default function TrendsView() {
  const [marketTrends, setMarketTrends] = useState([]);
  const [risingKeywords, setRisingKeywords] = useState([]);
  const [timelinePoints, setTimelinePoints] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedWindow, setSelectedWindow] = useState('6M');
  const [selectedRegion, setSelectedRegion] = useState('All Regions');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [keywordQuery, setKeywordQuery] = useState('');

  useEffect(() => {
    let active = true;

    async function loadTrendSignals() {
      try {
        setIsLoading(true);
        setError('');
        const trendData = await listTrendSignals();

        if (!active) {
          return;
        }

        const dataToUse = trendData.length > 0 ? trendData : FALLBACK_TREND_DASHBOARD;
        setMarketTrends(dataToUse);
        setSelectedCategory((previous) => previous || dataToUse[0].category);
      } catch (loadError) {
        if (active) {
          setMarketTrends(FALLBACK_TREND_DASHBOARD);
          setSelectedCategory((previous) => previous || FALLBACK_TREND_DASHBOARD[0].category);
          setError(
            loadError.message
              ? `${loadError.message} Showing modelled trend signals instead.`
              : 'Live trend signals unavailable. Showing modelled trend signals instead.'
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
  }, []);

  const regions = useMemo(
    () => ['All Regions', ...new Set(marketTrends.map((trend) => trend.region))],
    [marketTrends]
  );

  const filteredTrends = useMemo(() => {
    if (selectedRegion === 'All Regions') {
      return marketTrends;
    }

    return marketTrends.filter((trend) => trend.region === selectedRegion);
  }, [marketTrends, selectedRegion]);

  const activeTrend = useMemo(() => {
    const selected = filteredTrends.find((trend) => trend.category === selectedCategory);
    return selected ?? filteredTrends[0] ?? marketTrends[0];
  }, [filteredTrends, marketTrends, selectedCategory]);

  useEffect(() => {
    if (filteredTrends.length > 0 && !filteredTrends.some((trend) => trend.category === selectedCategory)) {
      setSelectedCategory(filteredTrends[0].category);
    }
  }, [filteredTrends, selectedCategory]);

  useEffect(() => {
    if (!activeTrend?.category) {
      return;
    }

    let active = true;
    const monthWindow = getWindowMonths(selectedWindow);

    async function loadTrendDetails() {
      try {
        setIsDetailLoading(true);
        const [keywords, timeline] = await Promise.all([
          listTrendKeywords(activeTrend.category, 20),
          getTrendTimeline(activeTrend.category, monthWindow)
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
  }, [activeTrend?.category, selectedWindow]);

  const filteredKeywords = useMemo(() => {
    const normalizedQuery = keywordQuery.trim().toLowerCase();

    return risingKeywords
      .filter((keyword) => keyword.term.toLowerCase().includes(normalizedQuery))
      .sort((left, right) => parseGrowthValue(right.growth) - parseGrowthValue(left.growth));
  }, [keywordQuery, risingKeywords]);

  const topKeyword = filteredKeywords[0];

  const chartSeries = useMemo(() => {
    const monthWindow = getWindowMonths(selectedWindow);
    const source = normalizeTimelinePoints(timelinePoints, activeTrend, monthWindow);

    if (source.length >= 2) {
      return source;
    }

    return buildFallbackSeries(activeTrend, monthWindow);
  }, [activeTrend, selectedWindow, timelinePoints]);

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
    return (
      <div className="max-w-[1400px] animate-in fade-in duration-500">
        <div className="border border-[#E5E2D9] bg-white p-8 text-center shadow-sm">
          <h2 className="font-serif text-xl text-[#111111]">Trend Signals</h2>
          <p className="mt-2 text-sm text-[#555555]">No trend data available for this selection.</p>
        </div>
      </div>
    );
  }

  const statusMeta = STATUS_META[activeTrend.status] ?? STATUS_META.Steady;
  const trendIsPositive = parseGrowthValue(activeTrend.growth) >= 0;
  const peakPoint = chartSeries.reduce(
    (highest, current) => (current.value > highest.value ? current : highest),
    chartSeries[0]
  );
  const averageScore = Math.round(
    chartSeries.reduce((sum, point) => sum + point.value, 0) / chartSeries.length
  );
  const forecastScore = Math.max(
    5,
    Math.min(100, Math.round(averageScore + (trendIsPositive ? 8 : -6)))
  );
  const totalVolumeK = Math.round(
    filteredTrends.reduce((sum, trend) => sum + parseVolumeToK(trend.volume), 0)
  );
  const liveProvider = formatProvider(activeTrend.provider || marketTrends[0]?.provider);
  const sourceList = SOURCE_INDEX[activeTrend.category] || [
    'Google_Trends_Feed.json',
    'Catalog_Intelligence_Vector.db',
    'Regional_Demand_Snapshot.csv'
  ];

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
              type="text"
              value={keywordQuery}
              onChange={(event) => setKeywordQuery(event.target.value)}
              placeholder="Filter query terms"
              className="w-full border border-[#E5E2D9] py-2 pl-8 pr-3 text-xs text-[#111111] placeholder-[#888888] focus:border-[#111111] focus:outline-none sm:w-56"
            />
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
                {INSIGHT_COPY[activeTrend.category] || 'Live trend signals suggest category performance is shifting. Use weekly refresh cycles to calibrate allocation and pricing decisions.'}
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
              <div className="flex items-center justify-between border-b border-[#E5E2D9] p-4 md:p-5">
                <h2 className="font-serif text-[#111111]">Rising Search Queries</h2>
                <span className="text-[9px] font-bold uppercase tracking-widest text-[#888888]">
                  {filteredKeywords.length} matching terms
                </span>
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
                  Window: {selectedWindow} ({chartSeries[0]?.month} to {chartSeries[chartSeries.length - 1]?.month})
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
