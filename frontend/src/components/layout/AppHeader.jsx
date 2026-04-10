import { useEffect, useRef, useState } from 'react';
import { Bot, Bell, CheckCircle2, Loader2, Menu } from 'lucide-react';
import { queryCopilot } from '@/lib/api';

function resolveStatusMeta(status) {
  const value = String(status || '').toLowerCase();

  if (value === 'completed') {
    return {
      label: 'Parsed',
      className: 'border-[#2A6B3D]/20 bg-[#2A6B3D]/10 text-[#2A6B3D]'
    };
  }

  if (value === 'processing' || value === 'queued' || value === 'uploading') {
    return {
      label: 'Processing',
      className: 'border-[#111111]/20 bg-[#111111]/10 text-[#111111]'
    };
  }

  if (value === 'failed') {
    return {
      label: 'Failed',
      className: 'border-[#E32929]/20 bg-[#E32929]/10 text-[#E32929]'
    };
  }

  if (value === 'cancelled') {
    return {
      label: 'Cancelled',
      className: 'border-[#9A5B00]/20 bg-[#9A5B00]/10 text-[#9A5B00]'
    };
  }

  return {
    label: 'Idle',
    className: 'border-[#8C827A]/20 bg-[#8C827A]/10 text-[#8C827A]'
  };
}

export default function AppHeader({
  onOpenMobile,
  catalogs = [],
  selectedCatalogJobId = '',
  onCatalogChange,
  isCatalogLoading = false
}) {
  const activeCatalog = catalogs.find((catalog) => catalog.job_id === selectedCatalogJobId) || null;
  const statusMeta = resolveStatusMeta(activeCatalog?.status);
  const [copilotQuery, setCopilotQuery] = useState('');
  const [copilotResult, setCopilotResult] = useState(null);
  const [copilotError, setCopilotError] = useState('');
  const [isCopilotLoading, setIsCopilotLoading] = useState(false);
  const [isCopilotPanelOpen, setIsCopilotPanelOpen] = useState(false);
  const copilotPanelRef = useRef(null);
  const copilotInputRef = useRef(null);

  useEffect(() => {
    function handleKeyDown(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        copilotInputRef.current?.focus();
        copilotInputRef.current?.select();
        setIsCopilotPanelOpen(true);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(event) {
      if (copilotPanelRef.current && !copilotPanelRef.current.contains(event.target)) {
        setIsCopilotPanelOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  async function handleCopilotSubmit(event) {
    event.preventDefault();

    const normalizedQuery = copilotQuery.trim();
    if (normalizedQuery.length < 3) {
      setCopilotError('Type at least 3 characters to run Merch Co-Pilot.');
      setCopilotResult(null);
      setIsCopilotPanelOpen(true);
      return;
    }

    setIsCopilotLoading(true);
    setCopilotError('');
    setIsCopilotPanelOpen(true);

    try {
      const result = await queryCopilot(normalizedQuery);
      setCopilotResult(result);
    } catch (error) {
      setCopilotResult(null);
      setCopilotError(error?.message || 'Merch Co-Pilot could not process your query.');
    } finally {
      setIsCopilotLoading(false);
    }
  }

  return (
    <header className="z-10 flex h-16 w-full flex-shrink-0 items-center justify-between border-b border-[#E5E2D9] bg-[#FAF9F5]/90 px-3 backdrop-blur-md sm:h-20 sm:px-4 md:px-10">
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <button
          className="text-[#555555] hover:text-[#111111] md:hidden"
          onClick={onOpenMobile}
          type="button"
        >
          <Menu size={20} />
        </button>
        <div className="flex min-w-0 items-center gap-2 border border-[#E5E2D9] bg-white px-2 py-1 text-sm text-[#555555] shadow-sm sm:px-3 sm:py-1.5 md:px-4 md:py-2">
          <span className="hidden text-[10px] font-bold uppercase tracking-wider sm:inline">Catalog</span>
          <select
            value={selectedCatalogJobId}
            onChange={(event) => onCatalogChange?.(event.target.value)}
            disabled={isCatalogLoading || catalogs.length === 0}
            className="confluxe-select max-w-[130px] cursor-pointer text-[11px] font-serif italic text-[#111111] disabled:cursor-not-allowed sm:max-w-[170px] md:max-w-[280px] md:text-sm"
          >
            {isCatalogLoading && <option value="">Loading catalogs...</option>}
            {!isCatalogLoading && catalogs.length === 0 && <option value="">No catalogs uploaded</option>}
            {!isCatalogLoading &&
              catalogs.map((catalog) => (
                <option key={catalog.job_id} value={catalog.job_id}>
                  {catalog.filename}
                </option>
              ))}
          </select>
          <span className={`ml-1 hidden items-center gap-1 border px-2 py-0.5 text-[9px] font-bold uppercase sm:flex ${statusMeta.className}`}>
            <CheckCircle2 size={10} />
            <span className="hidden sm:inline">{statusMeta.label}</span>
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3 sm:gap-4 md:gap-6">
        <div ref={copilotPanelRef} className="relative hidden lg:block">
          <form onSubmit={handleCopilotSubmit} className="group relative flex items-center">
            <div className="absolute left-3 flex items-center gap-2 text-[#888888] transition-colors group-focus-within:text-[#E32929]">
              <Bot size={14} />
            </div>
            <input
              ref={copilotInputRef}
              type="text"
              value={copilotQuery}
              onChange={(event) => setCopilotQuery(event.target.value)}
              onFocus={() => setIsCopilotPanelOpen(true)}
              placeholder="Merch Co-Pilot: Build a ₹50L activewear order..."
              className="w-80 rounded-none border border-[#E5E2D9] bg-white py-2 pl-9 pr-20 text-sm text-[#111111] placeholder-[#888888] shadow-sm transition-all focus:border-[#111111] focus:outline-none focus:ring-1 focus:ring-[#111111]"
            />
            <button
              type="submit"
              disabled={isCopilotLoading}
              className="absolute right-1.5 inline-flex h-7 items-center border border-[#E5E2D9] bg-[#FAF9F5] px-2 text-[10px] font-bold uppercase tracking-widest text-[#555555] transition-colors hover:bg-[#F2F0EA] hover:text-[#111111] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isCopilotLoading ? (
                <>
                  <Loader2 size={10} className="mr-1 animate-spin" />
                  Run
                </>
              ) : (
                'Run'
              )}
            </button>
          </form>

          {isCopilotPanelOpen && (
            <div className="absolute right-0 top-[calc(100%+0.45rem)] z-30 w-[30rem] border border-[#E5E2D9] bg-white p-4 shadow-lg">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#888888]">Merch Co-Pilot</p>
                <div className="flex items-center gap-1">
                  <span className="rounded border border-[#E5E2D9] bg-[#F2F0EA] px-1.5 py-0.5 text-[9px] font-bold text-[#888888]">
                    ⌘
                  </span>
                  <span className="rounded border border-[#E5E2D9] bg-[#F2F0EA] px-1.5 py-0.5 text-[9px] font-bold text-[#888888]">
                    K
                  </span>
                </div>
              </div>

              {copilotError && (
                <div className="confluxe-alert confluxe-alert-error mb-3 p-2 text-xs">
                  {copilotError}
                </div>
              )}

              {!copilotError && !copilotResult && !isCopilotLoading && (
                <p className="text-xs leading-relaxed text-[#666666]">
                  Press Enter to run your order brief and get a shortlist with action labels.
                </p>
              )}

              {copilotResult && (
                <>
                  <p className="text-xs leading-relaxed text-[#333333]">{copilotResult.summary}</p>
                  <div className="mt-3 space-y-2">
                    {(copilotResult.items || []).slice(0, 4).map((item) => {
                      const product = item?.normalized_product || {};
                      return (
                        <div
                          key={product.id || `${product.name}-${item.action}`}
                          className="flex items-center justify-between border border-[#E5E2D9] bg-[#FAF9F5] px-2.5 py-2"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium text-[#111111]">{product.name}</p>
                            <p className="text-[10px] uppercase tracking-widest text-[#888888]">{product.category}</p>
                          </div>
                          <span className="ml-2 shrink-0 text-[10px] font-bold uppercase tracking-widest text-[#111111]">
                            {item.action}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <button
          className="relative hidden text-[#555555] transition-colors hover:text-[#111111] sm:block"
          type="button"
        >
          <Bell size={20} />
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-none bg-[#E32929]" />
        </button>

        <div className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center bg-[#111111] text-[10px] font-bold tracking-widest text-white">
          VI
        </div>
      </div>
    </header>
  );
}
