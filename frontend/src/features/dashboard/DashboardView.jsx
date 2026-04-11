import { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Search, Sparkles } from 'lucide-react';
import { listIntelligenceProducts } from '@/lib/api';

const DEMAND_COLORS = ['bg-[#E32929]', 'bg-[#111111]', 'bg-[#8C827A]', 'bg-[#D1CFC7]', 'bg-[#2A6B3D]'];
const RECOMMENDATIONS_PER_PAGE = 12;
const ACTION_FILTERS = ['ALL', 'LAUNCH', 'TEST', 'AVOID'];
const DEMAND_FILTERS = ['ALL', 'High', 'Medium', 'Low'];

function formatInr(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
}

function sanitizeReasoning(text) {
  const raw = String(text || '').trim();
  if (!raw) {
    return 'No reasoning generated.';
  }

  const unwrapped = raw.replace(/^"+|"+$/g, '');
  return unwrapped.replace(/\s+/g, ' ').trim();
}

function mapRecordToProduct(record, index) {
  const stableId = record.normalized_product.id || `prd-${index + 1}`;
  return {
    id: `${stableId}-${index + 1}`,
    name: record.normalized_product.name,
    brand: record.normalized_product.brand,
    category: record.normalized_product.category,
    price: formatInr(record.normalized_product.price_inr),
    trendScore: Number(record.trend_score.toFixed(1)),
    demand: record.demand_level,
    priceFit: record.price_fit,
    action: record.action,
    reason: sanitizeReasoning(record.ai_reasoning)
  };
}

function buildPaginationPages(totalPages, currentPage) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, 'ellipsis-right', totalPages];
  }

  if (currentPage >= totalPages - 3) {
    return [1, 'ellipsis-left', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }

  return [1, 'ellipsis-left', currentPage - 1, currentPage, currentPage + 1, 'ellipsis-right', totalPages];
}

export default function DashboardView({ onGenerateReport, selectedCatalogJobId }) {
  const [products, setProducts] = useState([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [recommendationQuery, setRecommendationQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [demandFilter, setDemandFilter] = useState('ALL');

  useEffect(() => {
    let active = true;

    async function loadProducts() {
      try {
        setIsLoading(true);
        setError('');
        const records = await listIntelligenceProducts({ jobId: selectedCatalogJobId || undefined });
        if (!active) {
          return;
        }

        const mapped = records.map(mapRecordToProduct);
        setProducts(mapped);
        setCurrentPage(1);
        if (mapped.length > 0) {
          setSelectedProductId((prev) => prev || mapped[0].id);
        } else {
          setSelectedProductId('');
        }
      } catch (loadError) {
        if (!active) {
          return;
        }
        setError(loadError.message || 'Failed to fetch intelligence products.');
        setProducts([]);
        setSelectedProductId('');
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    loadProducts();

    return () => {
      active = false;
    };
  }, [selectedCatalogJobId]);

  const availableCategories = useMemo(
    () => ['ALL', ...new Set(products.map((product) => product.category))],
    [products]
  );

  const filteredProducts = useMemo(() => {
    const normalizedQuery = recommendationQuery.trim().toLowerCase();

    return products.filter((product) => {
      const matchesQuery =
        !normalizedQuery ||
        product.name.toLowerCase().includes(normalizedQuery) ||
        product.brand.toLowerCase().includes(normalizedQuery) ||
        product.category.toLowerCase().includes(normalizedQuery);
      const matchesAction = actionFilter === 'ALL' || product.action === actionFilter;
      const matchesCategory = categoryFilter === 'ALL' || product.category === categoryFilter;
      const matchesDemand = demandFilter === 'ALL' || product.demand === demandFilter;

      return matchesQuery && matchesAction && matchesCategory && matchesDemand;
    });
  }, [products, recommendationQuery, actionFilter, categoryFilter, demandFilter]);

  const selectedProduct = useMemo(() => {
    if (!filteredProducts.length) {
      return null;
    }
    return filteredProducts.find((item) => item.id === selectedProductId) || filteredProducts[0];
  }, [filteredProducts, selectedProductId]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredProducts.length / RECOMMENDATIONS_PER_PAGE)),
    [filteredProducts.length]
  );

  const pageStartIndex = useMemo(
    () => (currentPage - 1) * RECOMMENDATIONS_PER_PAGE,
    [currentPage]
  );

  const paginatedProducts = useMemo(
    () => filteredProducts.slice(pageStartIndex, pageStartIndex + RECOMMENDATIONS_PER_PAGE),
    [filteredProducts, pageStartIndex]
  );

  const paginationPages = useMemo(
    () => buildPaginationPages(totalPages, currentPage),
    [totalPages, currentPage]
  );

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [recommendationQuery, actionFilter, categoryFilter, demandFilter]);

  useEffect(() => {
    if (!filteredProducts.length) {
      setSelectedProductId('');
      return;
    }

    if (!filteredProducts.some((product) => product.id === selectedProductId)) {
      setSelectedProductId(filteredProducts[0].id);
      return;
    }

    if (paginatedProducts.length && !paginatedProducts.some((product) => product.id === selectedProductId)) {
      setSelectedProductId(paginatedProducts[0].id);
    }
  }, [filteredProducts, paginatedProducts, selectedProductId]);

  const kpis = useMemo(() => {
    const total = products.length;
    const launch = products.filter((item) => item.action === 'LAUNCH').length;
    const avoid = products.filter((item) => item.action === 'AVOID').length;
    const avgScore = total
      ? products.reduce((sum, item) => sum + item.trendScore, 0) / total
      : 0;

    const launchShare = total ? Math.round((launch / total) * 100) : 0;
    const avoidShare = total ? Math.round((avoid / total) * 100) : 0;

    return [
      {
        label: 'Products Analyzed',
        value: total.toLocaleString('en-IN'),
        trend: total ? 'Live sync' : 'Awaiting upload',
        positive: total > 0
      },
      {
        label: 'Launch Recommendations',
        value: launch.toLocaleString('en-IN'),
        trend: `${launchShare}% of catalog`,
        positive: launchShare >= 30
      },
      {
        label: 'Avg Trend Score',
        value: avgScore ? avgScore.toFixed(1) : '0.0',
        trend: avgScore >= 6 ? 'Strong momentum' : 'Needs curation',
        positive: avgScore >= 6
      },
      {
        label: 'High Risk Avoids',
        value: avoid.toLocaleString('en-IN'),
        trend: `${avoidShare}% flagged`,
        positive: false
      }
    ];
  }, [products]);

  const categoryDemand = useMemo(() => {
    if (!products.length) {
      return [];
    }

    const counts = products.reduce((accumulator, product) => {
      accumulator[product.category] = (accumulator[product.category] || 0) + 1;
      return accumulator;
    }, {});

    const total = products.length;

    return Object.entries(counts)
      .map(([name, count], index) => ({
        name,
        value: Math.max(1, Math.round((count / total) * 100)),
        color: DEMAND_COLORS[index % DEMAND_COLORS.length]
      }))
      .sort((left, right) => right.value - left.value)
      .slice(0, 5);
  }, [products]);

  return (
    <div className="mx-auto max-w-[1400px] screen-enter">
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end md:mb-10">
        <div className="fade-up">
          <div className="mb-2 flex items-center gap-3">
            <div className="h-1.5 w-1.5 bg-[#E32929]" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#E32929]">
              Intelligence Layer
            </span>
          </div>
          <h1 className="text-2xl font-serif tracking-tight text-[#111111] md:text-3xl">
            Market Launch Intelligence.
          </h1>
        </div>
        <button
          onClick={() => onGenerateReport(selectedProduct)}
          disabled={!selectedProduct}
          type="button"
          className="scale-in flex w-full items-center justify-center gap-2 rounded-none bg-[#111111] px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-white shadow-md transition-colors hover:bg-[#E32929] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          Generate Report <ArrowUpRight size={14} />
        </button>
      </div>

      {error && (
        <div className="confluxe-alert confluxe-alert-error mb-6">
          {error}
        </div>
      )}

      {!isLoading && products.length === 0 && !error && (
        <div className="mb-8 border border-[#E5E2D9] bg-white p-8 text-center shadow-sm">
          <h2 className="font-serif text-xl text-[#111111]">No intelligence records yet</h2>
          <p className="mt-2 text-sm text-[#555555]">
            Upload a vendor catalog in the Catalogs screen to start generating launch recommendations.
          </p>
        </div>
      )}

      <div className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 md:gap-6">
        {kpis.map((kpi, index) => (
          <div
            key={kpi.label}
            className="stagger-item group border border-[#E5E2D9] bg-white p-5 shadow-sm transition-colors hover:border-[#111111]"
            style={{ animationDelay: `${120 + index * 70}ms` }}
          >
            <p className="mb-4 text-[10px] font-bold uppercase tracking-wider text-[#888888]">{kpi.label}</p>
            <div className="flex items-end justify-between">
              <h3 className="text-2xl font-serif text-[#111111] md:text-3xl">{kpi.value}</h3>
              <div
                className={`flex items-center gap-1 border px-2 py-1 text-[10px] font-bold ${
                  kpi.positive
                    ? 'border-[#2A6B3D]/20 bg-[#2A6B3D]/5 text-[#2A6B3D]'
                    : 'border-[#E32929]/20 bg-[#E32929]/5 text-[#E32929]'
                }`}
              >
                {kpi.positive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                {kpi.trend}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-8 2xl:grid-cols-12">
        <div className="col-span-1 flex w-full min-w-0 flex-col gap-6 overflow-hidden 2xl:col-span-8">
          <div className="fade-up delay-2 flex w-full flex-col overflow-hidden border border-[#E5E2D9] bg-white shadow-sm">
            <div className="flex flex-col items-start justify-between gap-4 border-b border-[#E5E2D9] bg-white p-4 sm:flex-row sm:items-center md:p-6">
              <div>
                <h2 className="text-lg font-serif text-[#111111] md:text-xl">Engine Recommendations</h2>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-[#888888]">
                  Live Market Mapping
                </p>
              </div>
              <div className="w-full space-y-3 sm:max-w-[760px]">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <label className="relative block w-full sm:flex-1">
                    <Search
                      size={12}
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#888888]"
                    />
                    <input
                      type="text"
                      value={recommendationQuery}
                      onChange={(event) => setRecommendationQuery(event.target.value)}
                      placeholder="Search product, brand, category"
                      className="w-full border border-[#E5E2D9] bg-[#FCFBF8] py-2 pl-8 pr-3 text-xs font-medium text-[#111111] placeholder-[#888888] focus:border-[#111111] focus:bg-white focus:outline-none"
                    />
                  </label>

                  {(recommendationQuery || actionFilter !== 'ALL' || categoryFilter !== 'ALL' || demandFilter !== 'ALL') && (
                    <button
                      type="button"
                      onClick={() => {
                        setRecommendationQuery('');
                        setActionFilter('ALL');
                        setCategoryFilter('ALL');
                        setDemandFilter('ALL');
                      }}
                      className="border border-[#111111] bg-[#111111] px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-white transition hover:bg-[#E32929] hover:border-[#E32929]"
                    >
                      Clear Filters
                    </button>
                  )}
                </div>

                <div className="space-y-2 border border-[#E5E2D9] bg-[#FAF9F5] p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-[#888888]">Action</span>
                    {ACTION_FILTERS.map((option) => {
                      const active = actionFilter === option;

                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() => setActionFilter(option)}
                          className={`border px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest transition ${
                            active
                              ? 'border-[#111111] bg-[#111111] text-white'
                              : 'border-[#E5E2D9] bg-white text-[#555555] hover:border-[#111111] hover:text-[#111111]'
                          }`}
                        >
                          {option === 'ALL' ? 'All' : option}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-[#888888]">Category</span>
                    {availableCategories.map((option) => {
                      const active = categoryFilter === option;

                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() => setCategoryFilter(option)}
                          className={`border px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest transition ${
                            active
                              ? 'border-[#111111] bg-[#111111] text-white'
                              : 'border-[#E5E2D9] bg-white text-[#555555] hover:border-[#111111] hover:text-[#111111]'
                          }`}
                        >
                          {option === 'ALL' ? 'All Categories' : option}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-[#888888]">Demand</span>
                    {DEMAND_FILTERS.map((option) => {
                      const active = demandFilter === option;

                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() => setDemandFilter(option)}
                          className={`border px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest transition ${
                            active
                              ? 'border-[#111111] bg-[#111111] text-white'
                              : 'border-[#E5E2D9] bg-white text-[#555555] hover:border-[#111111] hover:text-[#111111]'
                          }`}
                        >
                          {option === 'ALL' ? 'All' : option}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3 p-4 md:hidden">
              {paginatedProducts.length === 0 ? (
                <div className="border border-[#E5E2D9] bg-[#FAF9F5] p-4 text-center text-xs text-[#555555]">
                  No recommendations match the current filters.
                </div>
              ) : (
                paginatedProducts.map((product, index) => {
                const isSelected = selectedProduct?.id === product.id;
                const displayIndex = pageStartIndex + index + 1;

                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => setSelectedProductId(product.id)}
                    className={`stagger-item w-full border p-4 text-left transition-all ${
                      isSelected
                        ? 'border-[#111111] bg-[#FAF9F5] shadow-sm'
                        : 'border-[#E5E2D9] bg-white hover:border-[#111111]'
                    }`}
                    style={{ animationDelay: `${180 + index * 50}ms` }}
                  >
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-[#888888]">
                        {String(displayIndex).padStart(2, '0')}
                      </span>
                      <span
                        className={`border px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${
                          product.action === 'LAUNCH'
                            ? 'border-[#E32929] bg-[#E32929] text-white'
                            : product.action === 'TEST'
                              ? 'border-[#111111] bg-white text-[#111111]'
                              : 'border-[#E5E2D9] bg-[#F2F0EA] text-[#888888]'
                        }`}
                      >
                        {product.action}
                      </span>
                    </div>

                    <h3 className="text-base font-serif text-[#111111]">{product.name}</h3>
                    <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-[#888888]">
                      {product.brand} • {product.price}
                    </p>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-[10px] font-bold uppercase tracking-widest">
                      <div>
                        <p className="text-[#888888]">Category</p>
                        <p className="mt-1 text-[#111111]">{product.category}</p>
                      </div>
                      <div>
                        <p className="text-[#888888]">Trend Score</p>
                        <p className="mt-1 text-[#111111]">{product.trendScore}</p>
                      </div>
                    </div>

                    <div className="mt-3 h-[3px] w-full overflow-hidden bg-[#E5E2D9]">
                      <div
                        className={`h-full ${product.trendScore >= 7 ? 'bg-[#E32929]' : 'bg-[#8C827A]'}`}
                        style={{ width: `${(product.trendScore / 10) * 100}%` }}
                      />
                    </div>
                  </button>
                );
                })
              )}
            </div>

            <div className="hidden w-full overflow-x-auto lg:block">
              <table className="min-w-[640px] w-full table-fixed whitespace-nowrap text-left text-sm">
                <thead className="border-b border-[#E5E2D9] bg-[#FAF9F5] text-[#888888]">
                  <tr>
                    <th className="w-[38%] px-6 py-4 text-[10px] font-bold uppercase tracking-wider">Product</th>
                    <th className="w-[18%] px-6 py-4 text-[10px] font-bold uppercase tracking-wider">Category</th>
                    <th className="w-[18%] px-6 py-4 text-[10px] font-bold uppercase tracking-wider">Trend Signal</th>
                    <th className="w-[12%] px-6 py-4 text-[10px] font-bold uppercase tracking-wider">Price Fit</th>
                    <th className="w-[14%] px-6 py-4 text-right text-[10px] font-bold uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E2D9] bg-white">
                  {paginatedProducts.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-10 text-center text-sm text-[#555555]">
                        No recommendations match the current filters.
                      </td>
                    </tr>
                  ) : (
                    paginatedProducts.map((product, index) => {
                      const displayIndex = pageStartIndex + index + 1;

                      return (
                    <tr
                      key={product.id}
                      onClick={() => setSelectedProductId(product.id)}
                      className={`group cursor-pointer transition-all duration-300 ${
                        selectedProduct?.id === product.id
                          ? 'bg-[#FAF9F5]'
                          : 'hover:bg-[#FDFCF9]'
                      }`}
                    >
                      <td
                        className={`border-l-4 px-6 py-4 ${
                          selectedProduct?.id === product.id ? 'border-l-[#E32929]' : 'border-l-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <div
                            className={`flex h-10 w-10 shrink-0 items-center justify-center border text-xs font-serif transition-colors ${
                              selectedProduct?.id === product.id
                                ? 'border-[#111111] bg-[#111111] text-white'
                                : 'border-[#E5E2D9] bg-[#F2F0EA] text-[#888888]'
                            }`}
                          >
                            {String(displayIndex).padStart(2, '0')}
                          </div>
                          <div className="min-w-0">
                            <div className="mb-1 truncate text-[15px] font-serif text-[#111111]">{product.name}</div>
                            <div className="truncate text-[9px] font-bold uppercase tracking-widest text-[#888888]">
                              {product.brand} • <span className="text-[#111111]">{product.price}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs font-medium text-[#555555]">{product.category}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-sm font-serif ${
                                product.trendScore >= 7 ? 'text-[#111111]' : 'text-[#888888]'
                              }`}
                            >
                              {product.trendScore}
                            </span>
                            <span
                              className={`text-[9px] font-bold uppercase tracking-widest ${
                                product.demand === 'High'
                                  ? 'text-[#E32929]'
                                  : product.demand === 'Medium'
                                    ? 'text-[#111111]'
                                    : 'text-[#888888]'
                              }`}
                            >
                              {product.demand}
                            </span>
                          </div>
                          <div className="h-[3px] w-16 overflow-hidden bg-[#E5E2D9]">
                            <div
                              className={`h-full ${product.trendScore >= 7 ? 'bg-[#E32929]' : 'bg-[#8C827A]'}`}
                              style={{ width: `${(product.trendScore / 10) * 100}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`border px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest ${
                            product.priceFit === 'IDEAL'
                              ? 'border-[#111111] bg-white text-[#111111]'
                              : product.priceFit === 'UNDERPRICED'
                                ? 'border-[#2A6B3D]/20 bg-[#2A6B3D]/10 text-[#2A6B3D]'
                                : 'border-[#E5E2D9] bg-[#F2F0EA] text-[#888888]'
                          }`}
                        >
                          {product.priceFit}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span
                          className={`inline-flex w-24 items-center justify-center border px-4 py-2 text-[9px] font-bold uppercase tracking-widest transition-colors ${
                            product.action === 'LAUNCH'
                              ? 'border-[#E32929] bg-[#E32929] text-white'
                              : product.action === 'TEST'
                                ? 'border-[#111111] bg-white text-[#111111]'
                                : 'border-[#E5E2D9] bg-[#F2F0EA] text-[#888888]'
                          }`}
                        >
                          {product.action}
                        </span>
                      </td>
                    </tr>
                    );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {filteredProducts.length > RECOMMENDATIONS_PER_PAGE && (
              <div className="flex flex-col gap-3 border-t border-[#E5E2D9] bg-[#FAF9F5] px-4 py-4 sm:flex-row sm:items-center sm:justify-between md:px-6">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#888888]">
                  Page {currentPage} of {totalPages} · Showing {paginatedProducts.length} of {filteredProducts.length} filtered ({products.length} total)
                </p>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((previous) => Math.max(1, previous - 1))}
                    disabled={currentPage === 1}
                    className="border border-[#E5E2D9] bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[#555555] transition hover:border-[#111111] hover:text-[#111111] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Prev
                  </button>

                  {paginationPages.map((page) => {
                    if (typeof page !== 'number') {
                      return (
                        <span key={page} className="px-1 text-[10px] font-bold uppercase tracking-widest text-[#888888]">
                          ...
                        </span>
                      );
                    }

                    return (
                      <button
                        key={page}
                        type="button"
                        onClick={() => setCurrentPage(page)}
                        className={`border px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest transition ${
                          page === currentPage
                            ? 'border-[#111111] bg-[#111111] text-white'
                            : 'border-[#E5E2D9] bg-white text-[#555555] hover:border-[#111111] hover:text-[#111111]'
                        }`}
                      >
                        {page}
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => setCurrentPage((previous) => Math.min(totalPages, previous + 1))}
                    disabled={currentPage === totalPages}
                    className="border border-[#E5E2D9] bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[#555555] transition hover:border-[#111111] hover:text-[#111111] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="col-span-1 flex w-full min-w-0 flex-col gap-6 2xl:col-span-4">
          <div className="fade-up delay-3 relative overflow-hidden border border-[#333] bg-[#1C1A1A] p-6 text-[#FAF9F5] shadow-lg">
            <div className="absolute left-0 top-0 h-1 w-full bg-[#E32929]" />

            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-[#E32929]" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#E32929]">
                  Agent: Decision Explainer
                </span>
              </div>
              <span className="rounded border border-[#444] bg-[#333] px-2 py-0.5 text-[8px] uppercase tracking-widest text-[#AAA]">
                LangChain Output
              </span>
            </div>

            {selectedProduct ? (
              <>
                <h3 className="mb-4 break-words text-xl font-serif leading-snug tracking-wide text-white">
                  {selectedProduct.name}
                </h3>

                <div className="mb-6 flex gap-6">
                  <div>
                    <p className="mb-1 text-[9px] uppercase tracking-widest text-[#888888]">Demand Vector</p>
                    <p className="text-sm font-serif text-white">{selectedProduct.demand}</p>
                  </div>
                  <div>
                    <p className="mb-1 text-[9px] uppercase tracking-widest text-[#888888]">Calculated Score</p>
                    <p className="text-sm font-serif text-white">{selectedProduct.trendScore}/10</p>
                  </div>
                </div>

                <div className="relative mt-2 border-t border-[#333333] pt-5">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-white opacity-50">
                    Generated Reasoning
                  </p>
                  <div className="max-h-[170px] overflow-y-auto pr-1">
                    <p className="break-words text-xs italic leading-relaxed text-[#D1CFC7]">{selectedProduct.reason}</p>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-xs text-[#D1CFC7]">No selected product. Upload and process a catalog to populate recommendations.</p>
            )}

            <button
              type="button"
              className="mt-6 w-full border border-transparent bg-white py-3 text-[10px] font-bold uppercase tracking-widest text-[#111111] transition-all hover:bg-[#E32929] hover:text-white"
            >
              Human Override: Approve
            </button>
          </div>

          <div className="fade-up delay-4 border border-[#E5E2D9] bg-white p-6 shadow-sm">
            <h2 className="mb-5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#111111]">
              <div className="h-1.5 w-1.5 bg-[#E32929]" />
              Category Distribution
            </h2>
            <div className="space-y-5">
              {categoryDemand.map((cat) => (
                <div key={cat.name}>
                  <div className="mb-2 flex justify-between text-xs">
                    <span className="text-[#555555]">{cat.name}</span>
                    <span className="font-bold text-[#111111]">{cat.value}%</span>
                  </div>
                  <div className="h-0.5 w-full overflow-hidden bg-[#F2F0EA]">
                    <div
                      className={`h-full transition-all duration-300 ${cat.color}`}
                      style={{ width: `${cat.value}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
