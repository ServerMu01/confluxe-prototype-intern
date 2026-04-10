import { LayoutDashboard, PackageSearch, TrendingUp, X, Network } from 'lucide-react';
import logoMark from '@/assets/logo-custom.png';

const navigation = [
  { key: 'dashboard', label: 'Intelligence Engine', icon: LayoutDashboard },
  { key: 'catalogs', label: 'Vendor Catalogs', icon: PackageSearch },
  { key: 'trends', label: 'Trend Signals', icon: TrendingUp }
];

export default function AppSidebar({ view, isMobileOpen, onNavClick, onCloseMobile }) {
  return (
    <aside
      className={`fixed inset-y-0 left-0 z-30 flex w-64 transform flex-col border-r border-[#E5E2D9] bg-[#F2F0EA] transition-transform duration-300 ease-in-out md:relative md:translate-x-0 ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
    >
      <div className="flex h-20 flex-shrink-0 items-center justify-between border-b border-[#E5E2D9] px-8">
        <div className="flex items-center gap-3">
          <img
            src={logoMark}
            alt="Confluxe logo"
            className="h-8 w-8 border border-[#E5E2D9] bg-[#111111] p-1 object-contain shadow-sm"
          />
          <span className="mt-1 text-xl font-bold tracking-tight text-[#111111] font-serif">Confluxe</span>
        </div>
        <button className="text-[#555555] md:hidden" onClick={onCloseMobile} type="button">
          <X size={20} />
        </button>
      </div>

      <nav className="flex-1 space-y-2 overflow-y-auto px-5 py-8">
        {navigation.map((item, index) => {
          const Icon = item.icon;
          const isActive =
            view === item.key || (item.key === 'dashboard' && view === 'report');

          return (
            <button
              key={item.key}
              onClick={() => onNavClick(item.key)}
              type="button"
              className={`stagger-item flex w-full items-center gap-3 rounded-none px-4 py-3 font-medium transition-all duration-200 ${
                isActive
                  ? 'border border-[#E5E2D9] bg-white text-[#E32929] shadow-sm'
                  : 'text-[#555555] hover:bg-[#EAE7DF] hover:text-[#111111] hover:translate-x-1'
              }`}
              style={{ animationDelay: `${80 + index * 80}ms` }}
            >
              <Icon size={18} />
              <span className="text-sm">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="flex-shrink-0 border-t border-[#E5E2D9] bg-[#EAE7DF]/50 p-5">
        <div className="mb-2 flex items-center gap-2">
          <Network size={14} className="text-[#2A6B3D]" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#555555]">
            LangGraph Status
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs font-serif text-[#2A6B3D]">
          <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#2A6B3D]" />
          Multi-Agent Active
        </div>
      </div>
    </aside>
  );
}
