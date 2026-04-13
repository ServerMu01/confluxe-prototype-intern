import { useEffect, useState } from 'react';
import AppHeader from '@/components/layout/AppHeader';
import AppSidebar from '@/components/layout/AppSidebar';
import DashboardView from '@/features/dashboard/DashboardView';
import ReportView from '@/features/report/ReportView';
import CatalogsView from '@/features/catalogs/CatalogsView';
import TrendsView from '@/features/trends/TrendsView';
import { listCatalogJobs } from '@/lib/api';

export default function App() {
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [view, setView] = useState('dashboard');
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [catalogOptions, setCatalogOptions] = useState([]);
  const [selectedCatalogJobId, setSelectedCatalogJobId] = useState('');
  const [isCatalogLoading, setIsCatalogLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadCatalogs(showLoading = false) {
      try {
        if (active && showLoading) {
          setIsCatalogLoading(true);
        }

        const jobs = await listCatalogJobs(40);
        if (!active) {
          return;
        }

        setCatalogOptions(jobs);
        setSelectedCatalogJobId((previousId) => {
          if (previousId && jobs.some((job) => job.job_id === previousId)) {
            return previousId;
          }

          const completed = jobs.find((job) => String(job.status || '').toLowerCase() === 'completed');
          return completed?.job_id || jobs[0]?.job_id || '';
        });
      } catch {
        if (!active) {
          return;
        }
        if (showLoading) {
          setCatalogOptions([]);
          setSelectedCatalogJobId('');
        }
      } finally {
        if (active && showLoading) {
          setIsCatalogLoading(false);
        }
      }
    }

    loadCatalogs(true);

    const refreshId = window.setInterval(() => {
      loadCatalogs(false);
    }, 5000);

    return () => {
      active = false;
      window.clearInterval(refreshId);
    };
  }, []);

  const handleNavClick = (newView) => {
    setView(newView);
    setIsMobileOpen(false);
  };

  const showDashboard = view === 'dashboard';
  const showReport = view === 'report';
  const showCatalogs = view === 'catalogs';
  const showTrends = view === 'trends';

  return (
    <div className="flex h-screen overflow-hidden bg-[#FAF9F5] font-sans text-[#111111] selection:bg-[#E32929] selection:text-white">
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-20 bg-[#111111]/40 backdrop-blur-sm md:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      <AppSidebar
        view={view}
        isMobileOpen={isMobileOpen}
        onNavClick={handleNavClick}
        onCloseMobile={() => setIsMobileOpen(false)}
      />

      <main className="relative flex h-full w-full flex-1 flex-col overflow-hidden bg-[#FAF9F5]">
        <AppHeader
          onOpenMobile={() => setIsMobileOpen(true)}
          catalogs={catalogOptions}
          selectedCatalogJobId={selectedCatalogJobId}
          isCatalogLoading={isCatalogLoading}
          onCatalogChange={(jobId) => {
            setSelectedCatalogJobId(jobId);
            setSelectedProduct(null);
          }}
        />

        <div className="z-0 flex-1 overflow-auto p-3 sm:p-4 md:p-8 lg:p-10">
          <div key={view} className="screen-enter">
            {showDashboard && (
              <DashboardView
                selectedCatalogJobId={selectedCatalogJobId}
                onGenerateReport={(product) => {
                  setSelectedProduct(product || null);
                  setView('report');
                }}
              />
            )}
            {showReport && (
              <ReportView
                selectedProduct={selectedProduct}
                selectedCatalogJobId={selectedCatalogJobId}
                onBack={() => setView('dashboard')}
              />
            )}
            {showCatalogs && <CatalogsView />}
            {showTrends && <TrendsView selectedCatalogJobId={selectedCatalogJobId} />}
          </div>
        </div>
      </main>
    </div>
  );
}
