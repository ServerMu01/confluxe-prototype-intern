import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Download, FileText, Loader2, Printer, Sparkles } from 'lucide-react';
import { listIntelligenceProducts } from '@/lib/api';

function formatInr(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function sanitizeReasoning(text) {
  const raw = String(text || '').trim();
  if (!raw) {
    return 'No reasoning generated.';
  }

  const unwrapped = raw.replace(/^"+|"+$/g, '');
  return unwrapped.replace(/\s+/g, ' ').trim();
}

function mapRecordToReportItem(record, index) {
  const product = record?.normalized_product || {};
  const signal = record?.trend_signal || {};
  const stableId = String(product.id || `prd-${index + 1}`);

  return {
    id: `${stableId}-${index + 1}`,
    name: String(product.name || `Product ${index + 1}`),
    brand: String(product.brand || 'UNKNOWN'),
    category: String(product.category || 'Accessories'),
    priceInr: Number(product.price_inr || 0),
    trendScore: Number(Number(record?.trend_score || 0).toFixed(1)),
    demand: String(record?.demand_level || 'Medium'),
    action: String(record?.action || 'TEST'),
    reason: sanitizeReasoning(record?.ai_reasoning),
    growthPercentage: Number(signal.growth_percentage || 0),
    momentumScore: Number(signal.momentum_score || 0),
    searchVolume: Number(signal.search_volume || 0)
  };
}

function mapSelectedProductFallback(selectedProduct) {
  if (!selectedProduct) {
    return null;
  }

  const parsedPrice = Number(String(selectedProduct.price || '').replace(/[^\d.-]/g, ''));

  return {
    id: String(selectedProduct.id || 'selected-fallback'),
    name: String(selectedProduct.name || 'Portfolio Selection Pending'),
    brand: String(selectedProduct.brand || 'UNKNOWN'),
    category: String(selectedProduct.category || 'Accessories'),
    priceInr: Number.isFinite(parsedPrice) ? parsedPrice : 0,
    trendScore: Number(selectedProduct.trendScore || 0),
    demand: String(selectedProduct.demand || 'Medium'),
    action: String(selectedProduct.action || 'TEST'),
    reason: sanitizeReasoning(selectedProduct.reason),
    growthPercentage: 0,
    momentumScore: 0,
    searchVolume: 0
  };
}

function styleForAction(action) {
  const key = String(action || '').toUpperCase();

  if (key === 'LAUNCH') {
    return {
      card: 'border-[#EAE5DC] bg-[#FAF9F5]',
      tag: 'border-[#E32929] text-[#E32929]',
      value: 'text-[#111111]'
    };
  }

  if (key === 'TEST') {
    return {
      card: 'border-[#EAE5DC] bg-[#FAF9F5]',
      tag: 'border-[#111111] text-[#111111]',
      value: 'text-[#111111]'
    };
  }

  return {
    card: 'border-[#EAE5DC] bg-white opacity-75',
    tag: 'border-[#E5E2D9] text-[#888888]',
    value: 'text-[#888888]'
  };
}

export default function ReportView({ onBack, selectedProduct, selectedCatalogJobId }) {
  const reportSurfaceRef = useRef(null);
  const [reportItems, setReportItems] = useState([]);
  const [isLoadingReport, setIsLoadingReport] = useState(true);
  const [reportError, setReportError] = useState('');
  const [downloadState, setDownloadState] = useState('idle');

  useEffect(() => {
    let active = true;

    async function loadReportData() {
      try {
        setIsLoadingReport(true);
        setReportError('');
        const records = await listIntelligenceProducts({ jobId: selectedCatalogJobId || undefined });

        if (!active) {
          return;
        }

        setReportItems(records.map(mapRecordToReportItem));
      } catch (error) {
        if (!active) {
          return;
        }

        setReportError(error?.message || 'Unable to sync report data from intelligence engine.');
      } finally {
        if (active) {
          setIsLoadingReport(false);
        }
      }
    }

    loadReportData();

    return () => {
      active = false;
    };
  }, [selectedCatalogJobId]);

  const fallbackItem = useMemo(() => mapSelectedProductFallback(selectedProduct), [selectedProduct]);

  const allItems = useMemo(() => {
    if (reportItems.length > 0) {
      return reportItems;
    }

    return fallbackItem ? [fallbackItem] : [];
  }, [reportItems, fallbackItem]);

  const activeProduct = useMemo(() => {
    if (!allItems.length) {
      return null;
    }

    if (!selectedProduct) {
      return allItems[0];
    }

    const selectedId = String(selectedProduct.id || '');
    const selectedName = String(selectedProduct.name || '').trim().toLowerCase();
    const selectedCategory = String(selectedProduct.category || '').trim().toLowerCase();

    const byId = allItems.find((item) => item.id === selectedId);
    if (byId) {
      return byId;
    }

    const byName = allItems.find(
      (item) => item.name.trim().toLowerCase() === selectedName && item.category.trim().toLowerCase() === selectedCategory
    );

    if (byName) {
      return byName;
    }

    return allItems[0];
  }, [allItems, selectedProduct]);

  const metrics = useMemo(() => {
    if (!allItems.length) {
      return {
        avgTrendScore: 0,
        launchCount: 0,
        avoidCount: 0,
        totalItems: 0
      };
    }

    const avgTrendScore = allItems.reduce((sum, item) => sum + item.trendScore, 0) / allItems.length;

    return {
      avgTrendScore: Number(avgTrendScore.toFixed(1)),
      launchCount: allItems.filter((item) => item.action.toUpperCase() === 'LAUNCH').length,
      avoidCount: allItems.filter((item) => item.action.toUpperCase() === 'AVOID').length,
      totalItems: allItems.length
    };
  }, [allItems]);

  const categoryMix = useMemo(() => {
    if (!allItems.length) {
      return [];
    }

    const counts = allItems.reduce((accumulator, item) => {
      accumulator[item.category] = (accumulator[item.category] || 0) + 1;
      return accumulator;
    }, {});

    return Object.entries(counts)
      .map(([category, count]) => ({
        category,
        share: Math.round((count / allItems.length) * 100)
      }))
      .sort((left, right) => right.share - left.share)
      .slice(0, 3);
  }, [allItems]);

  const allocationRows = useMemo(() => {
    if (!allItems.length) {
      return [];
    }

    const ranked = [...allItems].sort((left, right) => right.trendScore - left.trendScore);
    const rows = [];
    const usedIds = new Set();

    if (activeProduct) {
      rows.push(activeProduct);
      usedIds.add(activeProduct.id);
    }

    for (const action of ['LAUNCH', 'TEST', 'AVOID']) {
      const match = ranked.find((item) => item.action.toUpperCase() === action && !usedIds.has(item.id));
      if (match) {
        rows.push(match);
        usedIds.add(match.id);
      }
      if (rows.length >= 3) {
        break;
      }
    }

    for (const item of ranked) {
      if (rows.length >= 3) {
        break;
      }
      if (!usedIds.has(item.id)) {
        rows.push(item);
        usedIds.add(item.id);
      }
    }

    return rows.slice(0, 3);
  }, [allItems, activeProduct]);

  const preparedDate = useMemo(
    () => new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    []
  );

  const focusName = activeProduct?.name || 'Portfolio Selection Pending';
  const focusCategory = activeProduct?.category || 'Streetwear';
  const focusAction = activeProduct?.action || 'TEST';
  const focusDemand = activeProduct?.demand || 'Medium';
  const focusTrendScore = activeProduct?.trendScore || 0;
  const focusReasoning = activeProduct?.reason || 'No reasoning generated yet.';

  const reportFileName = `${focusCategory.replace(/\s+/g, '_')}_Launch_Brief_${new Date().toISOString().slice(0, 10)}.pdf`;

  const handleDownload = async () => {
    if (!activeProduct || downloadState !== 'idle' || !reportSurfaceRef.current) {
      return;
    }

    setDownloadState('downloading');
    setReportError('');

    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf')
      ]);

      const exportTarget = reportSurfaceRef.current;

      // Let pending layout/paint finish before capturing.
      await new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
      await new Promise((resolve) => window.requestAnimationFrame(() => resolve()));

      const canvas = await html2canvas(exportTarget, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        width: exportTarget.scrollWidth,
        height: exportTarget.scrollHeight,
        scrollX: 0,
        scrollY: 0,
        onclone: (clonedDocument) => {
          // Disable transient animations so exported content never renders as invisible.
          const animatedNodes = clonedDocument.querySelectorAll(
            '.screen-enter, .fade-up, .scale-in, .stagger-item, .delay-1, .delay-2, .delay-3, .delay-4, .delay-5, .delay-6'
          );
          animatedNodes.forEach((node) => {
            node.style.animation = 'none';
            node.style.opacity = '1';
            node.style.transform = 'none';
          });
        }
      });

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 8;
      const printableWidth = pageWidth - margin * 2;
      const printableHeight = pageHeight - margin * 2;

      // Force a single-page export by scaling the full report surface to fit A4 bounds.
      const widthScale = printableWidth / canvas.width;
      const heightScale = printableHeight / canvas.height;
      const fitScale = Math.min(widthScale, heightScale);
      const renderWidth = canvas.width * fitScale;
      const renderHeight = canvas.height * fitScale;
      const offsetX = (pageWidth - renderWidth) / 2;
      const offsetY = (pageHeight - renderHeight) / 2;

      const imageData = canvas.toDataURL('image/png');
      pdf.addImage(imageData, 'PNG', offsetX, offsetY, renderWidth, renderHeight, undefined, 'FAST');

      pdf.save(reportFileName);

      window.setTimeout(() => setDownloadState('done'), 250);
      window.setTimeout(() => setDownloadState('idle'), 1400);
    } catch (error) {
      setReportError(error?.message || 'Unable to generate PDF report. Please try again.');
      setDownloadState('idle');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="mx-auto max-w-4xl screen-enter pb-14 sm:pb-20">
      <div className="fade-up mb-6 flex flex-col items-start justify-between gap-4 rounded-none border border-[#EAE5DC] bg-white p-4 shadow-sm sm:flex-row sm:items-center md:mb-8">
        <button
          onClick={onBack}
          type="button"
          className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#555555] transition-colors hover:text-[#E32929]"
        >
          <ArrowLeft size={14} />
          Back to Engine
        </button>
        <div className="min-w-0 flex items-center gap-3">
          <FileText size={16} className="shrink-0 text-[#E32929]" />
          <span className="truncate text-sm font-serif italic">{reportFileName}</span>
        </div>
        <div className="flex w-full gap-4 sm:w-auto">
          <button
            type="button"
            onClick={handlePrint}
            className="hidden items-center gap-2 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-[#555555] transition-colors hover:text-[#111111] sm:flex"
          >
            <Printer size={14} />
            Print
          </button>
          <button
            onClick={handleDownload}
            disabled={!activeProduct || downloadState !== 'idle'}
            type="button"
            className="flex w-full flex-1 items-center justify-center gap-2 bg-[#111111] px-5 py-2 text-[10px] font-bold uppercase tracking-widest text-white transition-all hover:bg-[#E32929] disabled:cursor-not-allowed disabled:opacity-70 sm:w-52 sm:flex-none"
          >
            {downloadState === 'idle' && (
              <>
                <Download size={14} />
                Download PDF
              </>
            )}
            {downloadState === 'downloading' && (
              <>
                <Loader2 size={14} className="animate-spin" />
                Generating PDF...
              </>
            )}
            {downloadState === 'done' && (
              <>
                <Check size={14} className="text-[#2A6B3D]" />
                Downloaded
              </>
            )}
          </button>
        </div>
      </div>

      <div ref={reportSurfaceRef} className="relative min-h-[640px] overflow-hidden border border-[#EAE5DC] bg-white p-5 shadow-xl sm:p-10 md:min-h-[800px] md:p-16">
        <div className="absolute left-0 top-0 h-1 w-full bg-[#E32929]" />

        <div className="scale-in absolute right-4 top-4 flex items-center gap-2 border border-[#EAE5DC] bg-[#F2F0EA] px-2 py-1 text-[8px] font-bold uppercase tracking-widest text-[#888888] sm:right-12 sm:top-8">
          <Sparkles size={10} className="text-[#E32929]" />
          <span className="hidden sm:inline">Drafted by Strategy Synthesizer Agent</span>
          <span className="sm:hidden">AI Drafted</span>
        </div>

        <div className="fade-up delay-1 mt-12 mb-8 flex flex-col items-start justify-between gap-6 border-b-2 border-[#111111] pb-6 sm:mt-4 md:mb-10 md:flex-row md:items-end md:pb-8">
          <div>
            <h1 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-[#E32929]">
              Confluxe Executive Report
            </h1>
            <h2 className="text-3xl font-serif leading-tight text-[#111111] sm:text-4xl md:text-5xl">
              India Market
              <br />
              Launch Strategy
            </h2>
          </div>
          <div className="text-left md:text-right">
            <p className="mb-1 text-[9px] font-bold uppercase tracking-widest text-[#888888]">Prepared For</p>
            <p className="text-lg font-serif text-[#111111]">Confluxe Intelligence</p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-[#555555]">{preparedDate}</p>
          </div>
        </div>

        {isLoadingReport && (
          <div className="mb-6 flex items-center gap-2 border border-[#EAE5DC] bg-[#FAF9F5] p-3 text-xs text-[#555555]">
            <Loader2 size={14} className="animate-spin" />
            Syncing latest intelligence records for report...
          </div>
        )}

        {reportError && (
          <div className="confluxe-alert confluxe-alert-error mb-6 text-xs">
            {reportError}
          </div>
        )}

        <div className="fade-up delay-2 mb-10 md:mb-12">
          <h3 className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#E32929]">
            <div className="h-1.5 w-1.5 bg-[#E32929]" />
            01. Executive Summary
          </h3>
          <p className="border-l-2 border-[#E32929] bg-[#FAF9F5] p-4 font-serif text-base leading-relaxed text-[#111111] md:p-6 md:text-lg">
            Based on the latest intelligence run, <span className="font-bold text-[#E32929]">{focusName}</span> in the{' '}
            <span className="font-bold text-[#E32929]">{focusCategory}</span> category is currently marked as{' '}
            <span className="font-bold text-[#E32929]">{focusAction}</span>. Demand is {focusDemand.toLowerCase()} with a
            trend score of {focusTrendScore}/10. {focusReasoning}
          </p>
        </div>

        <div className="fade-up delay-3 mb-10 grid grid-cols-1 gap-6 border-y border-[#EAE5DC] py-6 sm:grid-cols-3 md:mb-12 md:gap-8 md:py-8">
          <div>
            <p className="mb-1 text-[9px] font-bold uppercase tracking-widest text-[#888888]">Recommendation</p>
            <p className="text-2xl font-serif text-[#111111] md:text-3xl">{focusAction}</p>
          </div>
          <div>
            <p className="mb-1 text-[9px] font-bold uppercase tracking-widest text-[#888888]">Projected Category</p>
            <p className="text-2xl font-serif text-[#E32929] md:text-3xl">{focusCategory}</p>
          </div>
          <div>
            <p className="mb-1 text-[9px] font-bold uppercase tracking-widest text-[#888888]">Avg Trend Score</p>
            <p className="text-2xl font-serif text-[#111111] md:text-3xl">
              {metrics.avgTrendScore || focusTrendScore || '0.0'} <span className="text-sm text-[#888888]">/10</span>
            </p>
          </div>
        </div>

        <div className="fade-up delay-4">
          <h3 className="mb-6 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#E32929]">
            <div className="h-1.5 w-1.5 bg-[#E32929]" />
            02. Initial Launch Allocation
          </h3>

          <div className="space-y-4">
            {allocationRows.length === 0 && (
              <div className="border border-[#EAE5DC] bg-[#FAF9F5] p-4 text-sm text-[#555555]">
                No allocation rows available yet. Upload and process a catalog to populate this section.
              </div>
            )}

            {allocationRows.map((item, index) => {
              const style = styleForAction(item.action);

              return (
                <div
                  key={item.id}
                  className={`stagger-item flex flex-col justify-between gap-4 border p-4 sm:flex-row sm:items-center sm:p-5 ${style.card}`}
                >
                  <div className="flex items-center gap-4 sm:gap-5">
                    <div className={`text-xl font-serif opacity-50 sm:text-2xl ${style.value}`}>
                      {String(index + 1).padStart(2, '0')}
                    </div>
                    <div>
                      <h4 className={`mb-1 text-sm font-bold ${style.value}`}>{item.name}</h4>
                      <p className="text-[11px] text-[#555555]">
                        {item.brand} • {item.category} • {formatInr(item.priceInr)}
                      </p>
                    </div>
                  </div>
                  <div className="pl-10 text-left sm:pl-0 sm:text-right">
                    <span className={`mb-1 inline-block border px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${style.tag}`}>
                      {item.action}
                    </span>
                    <p className={`font-serif ${style.value}`}>
                      Score {item.trendScore}/10 · {item.demand}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="fade-up delay-5 mt-10 border-t border-[#EAE5DC] pt-6 md:mt-12">
          <h3 className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#E32929]">
            <div className="h-1.5 w-1.5 bg-[#E32929]" />
            03. Category Mix Snapshot
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {categoryMix.length > 0 ? (
              categoryMix.map((entry) => (
                <div key={entry.category} className="border border-[#EAE5DC] bg-[#FAF9F5] p-4">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-[#888888]">{entry.category}</p>
                  <p className="mt-1 text-2xl font-serif text-[#111111]">{entry.share}%</p>
                </div>
              ))
            ) : (
              <div className="border border-[#EAE5DC] bg-[#FAF9F5] p-4 text-sm text-[#555555]">
                No category mix available.
              </div>
            )}
          </div>
        </div>

        <div className="fade-up delay-6 mt-12 flex items-center justify-between border-t border-[#EAE5DC] pt-6 text-[#888888] md:mt-16">
          <p className="text-[9px] font-bold uppercase tracking-widest">Confidential & Proprietary</p>
          <p className="text-xs font-serif italic">Confluxe Intelligence Engine</p>
        </div>
      </div>
    </div>
  );
}
