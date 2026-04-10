import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  PackageSearch, 
  TrendingUp, 
  Settings, 
  Search, 
  Bell, 
  ChevronDown, 
  ArrowUpRight, 
  ArrowDownRight,
  Filter,
  CheckCircle2,
  FileText,
  Printer,
  Download,
  Loader2,
  Check,
  ArrowLeft,
  UploadCloud,
  MapPin,
  RefreshCw,
  FileJson,
  AlertTriangle,
  Bot,
  Database,
  Menu,
  X,
  Network,
  Sparkles
} from 'lucide-react';

// --- MOCK DATA ---
const kpis = [
  { label: "Products Analyzed", value: "12,403", trend: "+14%", positive: true },
  { label: "Launch Recommendations", value: "1,842", trend: "15% of catalog", positive: true },
  { label: "Avg Trend Score", value: "6.8", trend: "+0.4", positive: true },
  { label: "High Risk Avoids", value: "3,105", trend: "Saved ₹4.2M", positive: false }
];

const categoryDemand = [
  { name: "Streetwear", value: 85, color: "bg-[#E32929]" },
  { name: "Activewear", value: 72, color: "bg-[#111111]" },
  { name: "Formalwear", value: 45, color: "bg-[#8C827A]" },
  { name: "Winter Outerwear", value: 12, color: "bg-[#D1CFC7]" },
];

const productsData = [
  { 
    id: 1, 
    name: "Oversized Graphic Hoodie", 
    brand: "URBANGEN",
    category: "Streetwear", 
    price: "₹2,499", 
    trendScore: 8.5, 
    demand: "High", 
    priceFit: "IDEAL", 
    action: "LAUNCH", 
    reason: "Strong upward trend in streetwear searches in India (Tier 1 & 2), combined with optimal pricing for Gen Z consumers. Google trends show +45% YoY growth for 'oversized'." 
  },
  { 
    id: 2, 
    name: "Slim Fit Raw Denim", 
    brand: "DENIMCO",
    category: "Apparel", 
    price: "₹4,999", 
    trendScore: 5.2, 
    demand: "Medium", 
    priceFit: "OVERPRICED", 
    action: "TEST", 
    reason: "Stable demand but price point exceeds the localized market average by 25%. Suggest limited A/B testing in metro regions before full rollout." 
  },
  { 
    id: 3, 
    name: "Seamless Yoga Set", 
    brand: "FITFLEX",
    category: "Activewear", 
    price: "₹1,899", 
    trendScore: 9.1, 
    demand: "High", 
    priceFit: "UNDERPRICED", 
    action: "LAUNCH", 
    reason: "High growth category. Current localized pricing is highly competitive, allowing room for potential margin expansion. High volume expected." 
  },
  { 
    id: 4, 
    name: "Heavy Winter Parka", 
    brand: "NORDICGEAR",
    category: "Outerwear", 
    price: "₹12,999", 
    trendScore: 1.5, 
    demand: "Low", 
    priceFit: "OVERPRICED", 
    action: "AVOID", 
    reason: "Poor geographic climate fit for 85% of Indian regions. Search volume is practically zero outside Dec-Jan. High inventory risk." 
  },
  { 
    id: 5, 
    name: "Chunky Platform Sneakers", 
    brand: "STEPUP",
    category: "Footwear", 
    price: "₹3,499", 
    trendScore: 7.8, 
    demand: "High", 
    priceFit: "IDEAL", 
    action: "LAUNCH", 
    reason: "Aligns with rising K-Pop inspired fashion trends in India. Pricing fits perfectly within the ₹3k-₹5k sweet spot for target demographic." 
  }
];

const catalogsData = [
  { id: 1, name: "UrbanGen_Global_v2.csv", brand: "URBANGEN", skus: "12,403", date: "Oct 24, 2026", status: "Normalized", color: "text-[#2A6B3D]", bg: "bg-[#2A6B3D]/10", border: "border-[#2A6B3D]/20", agentLog: "Semantic mapping complete" },
  { id: 2, name: "DenimCo_Fall_2026.json", brand: "DENIMCO", skus: "4,250", date: "Oct 23, 2026", status: "Processing", color: "text-[#111111]", bg: "bg-[#111111]/10", border: "border-[#111111]/20", agentLog: "Parsing sizing formats..." },
  { id: 3, name: "FitFlex_Core_Line.csv", brand: "FITFLEX", skus: "1,820", date: "Oct 20, 2026", status: "Normalized", color: "text-[#2A6B3D]", bg: "bg-[#2A6B3D]/10", border: "border-[#2A6B3D]/20", agentLog: "Semantic mapping complete" },
  { id: 4, name: "NordicGear_Winter.csv", brand: "NORDICGEAR", skus: "845", date: "Oct 18, 2026", status: "Requires Mapping", color: "text-[#E32929]", bg: "bg-[#E32929]/10", border: "border-[#E32929]/20", agentLog: "Error resolving categories" }
];

const marketTrends = [
  { category: "Streetwear", volume: "245K", growth: "+45%", region: "Delhi NCR", status: "Surging" },
  { category: "Activewear", volume: "180K", growth: "+22%", region: "Bangalore", status: "Steady" },
  { category: "Formalwear", volume: "95K", growth: "-5%", region: "Mumbai", status: "Declining" },
  { category: "Outerwear", volume: "12K", growth: "-40%", region: "Shimla", status: "Seasonal" },
];

const risingKeywords = [
  { term: "oversized graphic tee india", growth: "Breakout", type: "text-[#E32929]", bg: "bg-[#E32929]/10" },
  { term: "baggy parachute pants men", growth: "+124%", type: "text-[#2A6B3D]", bg: "bg-[#2A6B3D]/10" },
  { term: "seamless ribbed activewear", growth: "+85%", type: "text-[#2A6B3D]", bg: "bg-[#2A6B3D]/10" },
  { term: "old money aesthetic fashion", growth: "+65%", type: "text-[#111111]", bg: "bg-[#F2F0EA]" },
  { term: "korean streetwear brands", growth: "+42%", type: "text-[#111111]", bg: "bg-[#F2F0EA]" }
];

const trendChartData = [
  { month: "Jan", value: 35 }, { month: "Feb", value: 42 }, { month: "Mar", value: 40 }, 
  { month: "Apr", value: 55 }, { month: "May", value: 50 }, { month: "Jun", value: 65 }, 
  { month: "Jul", value: 72 }, { month: "Aug", value: 68 }, { month: "Sep", value: 85 }, 
  { month: "Oct", value: 100 }
];

export default function App() {
  const [selectedProduct, setSelectedProduct] = useState(productsData[0]);
  const [view, setView] = useState('dashboard');
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const handleNavClick = (newView) => {
    setView(newView);
    setIsMobileOpen(false);
  };

  return (
    <div className="flex h-screen bg-[#FAF9F5] text-[#111111] font-sans overflow-hidden selection:bg-[#E32929] selection:text-white">
      
      {/* MOBILE OVERLAY */}
      {isMobileOpen && (
        <div 
          className="fixed inset-0 bg-[#111111]/40 z-20 md:hidden backdrop-blur-sm"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* SIDEBAR */}
      <aside className={`fixed inset-y-0 left-0 w-64 bg-[#F2F0EA] border-r border-[#E5E2D9] flex flex-col z-30 transition-transform duration-300 ease-in-out transform ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0`}>
        <div className="h-20 flex items-center justify-between px-8 border-b border-[#E5E2D9] flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-[#E32929]"></div>
            <span className="font-serif font-bold text-xl tracking-tight text-[#111111] mt-1">Confluxe</span>
          </div>
          <button className="md:hidden text-[#555555]" onClick={() => setIsMobileOpen(false)}>
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 py-8 px-5 space-y-2 overflow-y-auto">
          <button onClick={() => handleNavClick('dashboard')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-none font-medium transition-colors ${view === 'dashboard' || view === 'report' ? 'bg-white text-[#E32929] shadow-sm border border-[#E5E2D9]' : 'text-[#555555] hover:bg-[#EAE7DF] hover:text-[#111111]'}`}>
            <LayoutDashboard size={18} /> <span className="text-sm">Intelligence Engine</span>
          </button>
          <button onClick={() => handleNavClick('catalogs')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-none font-medium transition-colors ${view === 'catalogs' ? 'bg-white text-[#E32929] shadow-sm border border-[#E5E2D9]' : 'text-[#555555] hover:bg-[#EAE7DF] hover:text-[#111111]'}`}>
            <PackageSearch size={18} /> <span className="text-sm">Vendor Catalogs</span>
          </button>
          <button onClick={() => handleNavClick('trends')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-none font-medium transition-colors ${view === 'trends' ? 'bg-white text-[#E32929] shadow-sm border border-[#E5E2D9]' : 'text-[#555555] hover:bg-[#EAE7DF] hover:text-[#111111]'}`}>
            <TrendingUp size={18} /> <span className="text-sm">Trend Signals</span>
          </button>
        </nav>

        {/* Global Agent Status */}
        <div className="p-5 border-t border-[#E5E2D9] bg-[#EAE7DF]/50 flex-shrink-0">
          <div className="flex items-center gap-2 mb-2">
            <Network size={14} className="text-[#2A6B3D]" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#555555]">LangGraph Status</span>
          </div>
          <div className="flex items-center gap-2 text-xs font-serif text-[#2A6B3D]">
            <div className="w-1.5 h-1.5 rounded-full bg-[#2A6B3D] animate-pulse"></div> Multi-Agent Active
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-[#FAF9F5] relative w-full">
        
        {/* HEADER */}
        <header className="h-20 bg-[#FAF9F5]/90 backdrop-blur-md border-b border-[#E5E2D9] flex items-center justify-between px-4 md:px-10 z-10 flex-shrink-0 w-full">
          <div className="flex items-center gap-4">
            <button className="md:hidden text-[#555555] hover:text-[#111111]" onClick={() => setIsMobileOpen(true)}>
              <Menu size={20} />
            </button>
            <div className="flex items-center gap-2 text-sm text-[#555555] bg-white border border-[#E5E2D9] px-3 py-1.5 md:px-4 md:py-2 shadow-sm">
              <span className="uppercase tracking-wider text-[10px] font-bold hidden sm:inline">Catalog</span>
              <ChevronDown size={14} className="hidden sm:block" />
              <div className="w-px h-4 bg-[#E5E2D9] mx-2 hidden sm:block"></div>
              <span className="text-[#111111] font-serif italic text-xs md:text-sm truncate max-w-[120px] sm:max-w-none">UrbanGen_Global_v2.csv</span>
              <span className="ml-2 flex items-center gap-1 text-[#2A6B3D] text-[9px] uppercase font-bold bg-[#2A6B3D]/10 px-2 py-0.5 border border-[#2A6B3D]/20">
                <CheckCircle2 size={10} /> <span className="hidden sm:inline">Parsed</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4 md:gap-6">
            {/* Merch Co-Pilot (Agent 5) */}
            <div className="relative group hidden lg:flex items-center">
              <div className="absolute left-3 text-[#888888] group-focus-within:text-[#E32929] transition-colors flex items-center gap-2">
                <Bot size={14} /> 
              </div>
              <input 
                type="text" 
                placeholder="Merch Co-Pilot: Build a ₹50L activewear order..." 
                className="bg-white border border-[#E5E2D9] pl-9 pr-16 py-2 text-sm focus:outline-none focus:border-[#111111] focus:ring-1 focus:ring-[#111111] w-80 text-[#111111] placeholder-[#888888] transition-all shadow-sm rounded-none"
              />
              <div className="absolute right-2 flex items-center gap-1">
                <span className="text-[9px] font-bold border border-[#E5E2D9] px-1.5 py-0.5 text-[#888888] bg-[#F2F0EA] rounded">⌘</span>
                <span className="text-[9px] font-bold border border-[#E5E2D9] px-1.5 py-0.5 text-[#888888] bg-[#F2F0EA] rounded">K</span>
              </div>
            </div>
            <button className="relative text-[#555555] hover:text-[#111111] transition-colors hidden sm:block">
              <Bell size={20} />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-[#E32929] rounded-none"></span>
            </button>
            <div className="w-8 h-8 shrink-0 bg-[#111111] cursor-pointer flex items-center justify-center text-[10px] font-bold tracking-widest text-white">
              VI
            </div>
          </div>
        </header>

        {/* DYNAMIC SCROLLABLE CONTENT */}
        <div className="flex-1 overflow-auto p-4 md:p-10 z-0">
          {view === 'dashboard' && <DashboardView selectedProduct={selectedProduct} setSelectedProduct={setSelectedProduct} onGenerateReport={() => setView('report')} />}
          {view === 'report' && <ReportView onBack={() => setView('dashboard')} />}
          {view === 'catalogs' && <CatalogsView />}
          {view === 'trends' && <TrendsView />}
        </div>
      </main>
    </div>
  );
}

// ==========================================
// VIEW 1: INTELLIGENCE ENGINE (Explainer Agent)
// ==========================================
function DashboardView({ selectedProduct, setSelectedProduct, onGenerateReport }) {
  return (
    <div className="animate-in fade-in duration-500 max-w-[1400px] mx-auto">
      <div className="mb-6 md:mb-10 flex flex-col sm:flex-row justify-between sm:items-end gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-1.5 h-1.5 bg-[#E32929]"></div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#E32929]">Intelligence Layer</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-serif text-[#111111] tracking-tight">Market Launch Intelligence.</h1>
        </div>
        <button onClick={onGenerateReport} className="bg-[#111111] w-full sm:w-auto text-white px-5 py-2.5 text-xs font-bold uppercase tracking-widest hover:bg-[#E32929] transition-colors flex items-center justify-center gap-2 rounded-none shadow-md">
          Generate Report <ArrowUpRight size={14} />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-10">
        {kpis.map((kpi, idx) => (
          <div key={idx} className="bg-white border border-[#E5E2D9] p-5 shadow-sm hover:border-[#111111] transition-colors group">
            <p className="text-[#888888] text-[10px] font-bold uppercase tracking-wider mb-4">{kpi.label}</p>
            <div className="flex items-end justify-between">
              <h3 className="text-2xl md:text-3xl font-serif text-[#111111]">{kpi.value}</h3>
              <div className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 border ${kpi.positive ? 'text-[#2A6B3D] bg-[#2A6B3D]/5 border-[#2A6B3D]/20' : 'text-[#E32929] bg-[#E32929]/5 border-[#E32929]/20'}`}>
                {kpi.positive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />} {kpi.trend}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Table Column */}
        <div className="col-span-1 lg:col-span-8 flex flex-col gap-6 w-full overflow-hidden">
          <div className="bg-white border border-[#E5E2D9] flex flex-col overflow-hidden shadow-sm w-full">
            <div className="p-4 md:p-6 border-b border-[#E5E2D9] flex flex-col sm:flex-row items-start sm:items-center justify-between bg-white gap-4">
              <div>
                <h2 className="text-lg md:text-xl font-serif text-[#111111]">Engine Recommendations</h2>
                <p className="text-[10px] text-[#888888] font-bold uppercase tracking-widest mt-1">Live Market Mapping</p>
              </div>
              <div className="flex gap-3 w-full sm:w-auto">
                <button className="flex-1 sm:flex-none justify-center flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#888888] hover:text-[#111111] hover:bg-[#F2F0EA] transition-all border border-transparent hover:border-[#E5E2D9]">
                  <Search size={12} /> Search
                </button>
              </div>
            </div>
            
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left text-sm whitespace-nowrap min-w-[700px]">
                <thead className="bg-[#FAF9F5] text-[#888888] border-b border-[#E5E2D9]">
                  <tr>
                    <th className="px-6 py-4 font-bold text-[10px] uppercase tracking-wider">Product</th>
                    <th className="px-6 py-4 font-bold text-[10px] uppercase tracking-wider">Category</th>
                    <th className="px-6 py-4 font-bold text-[10px] uppercase tracking-wider">Trend Signal</th>
                    <th className="px-6 py-4 font-bold text-[10px] uppercase tracking-wider">Price Fit</th>
                    <th className="px-6 py-4 font-bold text-[10px] uppercase tracking-wider text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E2D9] bg-white">
                  {productsData.map((product, index) => (
                    <tr 
                      key={product.id} 
                      onClick={() => setSelectedProduct(product)}
                      className={`cursor-pointer group transition-all duration-300 ${selectedProduct.id === product.id ? 'bg-[#FAF9F5] relative before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-[#E32929]' : 'hover:bg-[#FDFCF9]'}`}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 shrink-0 flex items-center justify-center font-serif text-xs border transition-colors ${selectedProduct.id === product.id ? 'bg-[#111111] text-white border-[#111111]' : 'bg-[#F2F0EA] text-[#888888] border-[#E5E2D9]'}`}>
                            {String(index + 1).padStart(2, '0')}
                          </div>
                          <div>
                            <div className="font-serif text-[15px] text-[#111111] mb-1">{product.name}</div>
                            <div className="text-[9px] text-[#888888] font-bold uppercase tracking-widest">{product.brand} • <span className="text-[#111111]">{product.price}</span></div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4"><span className="text-xs font-medium text-[#555555]">{product.category}</span></td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-2">
                            <span className={`font-serif text-sm ${product.trendScore >= 7 ? 'text-[#111111]' : 'text-[#888888]'}`}>{product.trendScore}</span>
                            <span className={`text-[9px] font-bold uppercase tracking-widest ${product.demand === 'High' ? 'text-[#E32929]' : product.demand === 'Medium' ? 'text-[#111111]' : 'text-[#888888]'}`}>{product.demand}</span>
                          </div>
                          <div className="w-16 h-[3px] bg-[#E5E2D9] overflow-hidden">
                            <div className={`h-full ${product.trendScore >= 7 ? 'bg-[#E32929]' : 'bg-[#8C827A]'}`} style={{ width: `${(product.trendScore / 10) * 100}%` }}></div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4"><span className={`px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest border ${product.priceFit === 'IDEAL' ? 'bg-white text-[#111111] border-[#111111]' : product.priceFit === 'UNDERPRICED' ? 'bg-[#2A6B3D]/10 text-[#2A6B3D] border-[#2A6B3D]/20' : 'bg-[#F2F0EA] text-[#888888] border-[#E5E2D9]'}`}>{product.priceFit}</span></td>
                      <td className="px-6 py-4 text-right"><span className={`inline-flex items-center justify-center px-4 py-2 text-[9px] font-bold uppercase tracking-widest w-24 border transition-colors ${product.action === 'LAUNCH' ? 'bg-[#E32929] text-white border-[#E32929]' : product.action === 'TEST' ? 'bg-white text-[#111111] border-[#111111]' : 'bg-[#F2F0EA] text-[#888888] border-[#E5E2D9]'}`}>{product.action}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* AI Explainer Panel (Agent 3) */}
        <div className="col-span-1 lg:col-span-4 flex flex-col gap-6 w-full">
          <div className="bg-[#1C1A1A] border border-[#333] p-6 relative overflow-hidden text-[#FAF9F5] shadow-lg">
            <div className="absolute top-0 left-0 w-full h-1 bg-[#E32929]"></div>
            
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-[#E32929]" />
                <span className="font-bold text-[10px] uppercase tracking-widest text-[#E32929]">Agent: Decision Explainer</span>
              </div>
              <span className="text-[8px] bg-[#333] px-2 py-0.5 border border-[#444] text-[#AAA] uppercase tracking-widest rounded">LangChain Output</span>
            </div>
            
            <h3 className="text-xl font-serif text-white tracking-wide mb-4 leading-snug">{selectedProduct.name}</h3>
            
            <div className="flex gap-6 mb-6">
              <div>
                <p className="text-[9px] text-[#888888] uppercase tracking-widest mb-1">Demand Vector</p>
                <p className="font-serif text-sm text-white">{selectedProduct.demand}</p>
              </div>
              <div>
                <p className="text-[9px] text-[#888888] uppercase tracking-widest mb-1">Calculated Score</p>
                <p className="font-serif text-sm text-white">{selectedProduct.trendScore}/10</p>
              </div>
            </div>

            <div className="relative border-t border-[#333333] pt-5 mt-2">
              <p className="text-[10px] font-bold text-white opacity-50 uppercase tracking-widest mb-2">Generated Reasoning</p>
              <p className="text-[#D1CFC7] text-xs leading-relaxed italic">
                "{selectedProduct.reason}"
              </p>
            </div>
            
            <button className="w-full mt-6 bg-white hover:bg-[#E32929] hover:text-white text-[#111111] border border-transparent py-3 font-bold uppercase text-[10px] tracking-widest transition-all">
              Human Override: Approve
            </button>
          </div>
          
          <div className="bg-white border border-[#E5E2D9] p-6 shadow-sm">
            <h2 className="text-[10px] font-bold text-[#111111] mb-5 flex items-center gap-2 uppercase tracking-widest"><div className="w-1.5 h-1.5 bg-[#E32929]"></div> Category Distribution</h2>
            <div className="space-y-5">
              {categoryDemand.map((cat, idx) => (
                <div key={idx}>
                  <div className="flex justify-between text-xs mb-2">
                    <span className="text-[#555555]">{cat.name}</span><span className="text-[#111111] font-bold">{cat.value}%</span>
                  </div>
                  <div className="w-full bg-[#F2F0EA] h-0.5 overflow-hidden"><div className={`h-full ${cat.color} transition-all duration-300`} style={{ width: `${cat.value}%` }}></div></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// VIEW 2: LAUNCH REPORT (Strategy Synthesizer Agent)
// ==========================================
function ReportView({ onBack }) {
  const [downloadState, setDownloadState] = useState('idle');
  return (
    <div className="animate-in fade-in slide-in-from-right-8 duration-500 max-w-4xl mx-auto pb-20">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white border border-[#EAE5DC] rounded-none p-4 shadow-sm mb-6 md:mb-8 gap-4">
        <button onClick={onBack} className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#555555] hover:text-[#E32929] transition-colors">
          <ArrowLeft size={14} /> Back to Engine
        </button>
        <div className="flex items-center gap-3">
          <FileText size={16} className="text-[#E32929]" />
          <span className="font-serif italic text-sm">UrbanGen_India_Launch.pdf</span>
        </div>
        <div className="flex w-full sm:w-auto gap-4">
          <button className="hidden sm:flex items-center gap-2 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-[#555555] hover:text-[#111111] transition-colors">
            <Printer size={14} /> Print
          </button>
          <button onClick={() => {setDownloadState('downloading'); setTimeout(() => setDownloadState('done'), 2000)}} disabled={downloadState !== 'idle'} className="flex-1 sm:flex-none flex items-center gap-2 bg-[#111111] hover:bg-[#E32929] text-white px-5 py-2 text-[10px] font-bold uppercase tracking-widest transition-all w-full sm:w-44 justify-center">
            {downloadState === 'idle' && <><Download size={14} /> Download PDF</>}
            {downloadState === 'downloading' && <><Loader2 size={14} className="animate-spin" /> Synthesizing...</>}
            {downloadState === 'done' && <><Check size={14} className="text-[#2A6B3D]" /> Downloaded</>}
          </button>
        </div>
      </div>

      <div className="bg-white border border-[#EAE5DC] shadow-xl p-6 sm:p-12 md:p-16 relative min-h-[800px] overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-[#E32929]"></div>
        
        {/* Agent Badge (Agent 4) */}
        <div className="absolute top-4 right-4 sm:top-8 sm:right-12 flex items-center gap-2 text-[8px] font-bold uppercase tracking-widest text-[#888888] bg-[#F2F0EA] border border-[#EAE5DC] px-2 py-1">
          <Sparkles size={10} className="text-[#E32929]" /> <span className="hidden sm:inline">Drafted by Strategy Synthesizer Agent</span><span className="sm:hidden">AI Drafted</span>
        </div>

        <div className="border-b-2 border-[#111111] pb-6 md:pb-8 mb-8 md:mb-10 flex flex-col md:flex-row justify-between items-start md:items-end mt-12 sm:mt-4 gap-6">
          <div>
            <h1 className="font-bold text-[10px] tracking-widest uppercase text-[#E32929] mb-3">Confluxe Executive Report</h1>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-serif text-[#111111] leading-tight">India Market<br/>Launch Strategy</h2>
          </div>
          <div className="text-left md:text-right">
            <p className="text-[9px] font-bold uppercase tracking-widest text-[#888888] mb-1">Prepared For</p>
            <p className="font-serif text-lg text-[#111111]">UrbanGen Global</p>
            <p className="text-[10px] text-[#555555] mt-1 font-bold uppercase tracking-widest">Oct 24, 2026</p>
          </div>
        </div>

        <div className="mb-10 md:mb-12">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#E32929] mb-4 flex items-center gap-2"><div className="w-1.5 h-1.5 bg-[#E32929]"></div> 01. Executive Summary</h3>
          <p className="text-[#111111] leading-relaxed font-serif text-base md:text-lg bg-[#FAF9F5] p-4 md:p-6 border-l-2 border-[#E32929]">
            Based on the analysis of 12,403 SKUs against real-time Indian consumer search behaviors, 
            we recommend an immediate <span className="font-bold text-[#E32929]">LAUNCH allocation of 1,842 products</span>. 
            The primary driver for launch success is the Streetwear and Activewear categories, which map strongly to Tier 1 and Tier 2 demand signals.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 md:gap-8 mb-10 md:mb-12 border-y border-[#EAE5DC] py-6 md:py-8">
          <div><p className="text-[9px] font-bold uppercase tracking-widest text-[#888888] mb-1">Total Viable SKUs</p><p className="text-2xl md:text-3xl font-serif text-[#111111]">1,842</p></div>
          <div><p className="text-[9px] font-bold uppercase tracking-widest text-[#888888] mb-1">Projected Category</p><p className="text-2xl md:text-3xl font-serif text-[#E32929]">Streetwear</p></div>
          <div><p className="text-[9px] font-bold uppercase tracking-widest text-[#888888] mb-1">Avg Trend Score</p><p className="text-2xl md:text-3xl font-serif text-[#111111]">6.8 <span className="text-sm text-[#888888]">/10</span></p></div>
        </div>

        <div>
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#E32929] mb-6 flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-[#E32929]"></div> 02. Initial Launch Allocation
          </h3>
          
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:p-5 bg-[#FAF9F5] border border-[#EAE5DC] gap-4">
              <div className="flex items-center gap-4 sm:gap-5">
                <div className="font-serif text-xl sm:text-2xl text-[#E32929] opacity-50">01</div>
                <div>
                  <h4 className="font-bold text-[#111111] text-sm mb-1">Core Streetwear Collection</h4>
                  <p className="text-[11px] text-[#555555]">Graphic Hoodies, Oversized Tees</p>
                </div>
              </div>
              <div className="text-left sm:text-right pl-10 sm:pl-0">
                <span className="text-[9px] font-bold uppercase tracking-widest text-[#E32929] border border-[#E32929] px-2 py-0.5 mb-1 inline-block">Launch</span>
                <p className="font-serif text-[#111111]">420 SKUs</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:p-5 bg-[#FAF9F5] border border-[#EAE5DC] gap-4">
              <div className="flex items-center gap-4 sm:gap-5">
                <div className="font-serif text-xl sm:text-2xl text-[#111111] opacity-50">02</div>
                <div>
                  <h4 className="font-bold text-[#111111] text-sm mb-1">Active & Yoga</h4>
                  <p className="text-[11px] text-[#555555]">Seamless sets, High-stretch leggings</p>
                </div>
              </div>
              <div className="text-left sm:text-right pl-10 sm:pl-0">
                <span className="text-[9px] font-bold uppercase tracking-widest text-[#E32929] border border-[#E32929] px-2 py-0.5 mb-1 inline-block">Launch</span>
                <p className="font-serif text-[#111111]">315 SKUs</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:p-5 border border-[#EAE5DC] bg-white opacity-60 gap-4">
              <div className="flex items-center gap-4 sm:gap-5">
                <div className="font-serif text-xl sm:text-2xl text-[#888888] opacity-50">03</div>
                <div>
                  <h4 className="font-bold text-[#555555] text-sm mb-1">Heavy Outerwear</h4>
                  <p className="text-[11px] text-[#888888]">Parkas, Puffer Jackets</p>
                </div>
              </div>
              <div className="text-left sm:text-right pl-10 sm:pl-0">
                <span className="text-[9px] font-bold uppercase tracking-widest text-[#888888] border border-[#E5E2D9] px-2 py-0.5 mb-1 inline-block">Avoid</span>
                <p className="font-serif text-[#888888]">369 SKUs</p>
              </div>
            </div>
          </div>
        </div>
        
        {/* Footer */}
        <div className="mt-12 md:mt-16 pt-6 border-t border-[#EAE5DC] flex justify-between items-center text-[#888888]">
          <p className="text-[9px] font-bold uppercase tracking-widest">Confidential & Proprietary</p>
          <p className="font-serif text-xs italic">Confluxe Intelligence Engine</p>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// VIEW 3: VENDOR CATALOGS (Normalization Agent)
// ==========================================
function CatalogsView() {
  return (
    <div className="animate-in fade-in duration-500 max-w-[1400px]">
      <div className="mb-6 md:mb-10">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-1.5 h-1.5 bg-[#111111]"></div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#555555]">Data Operations</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-serif text-[#111111] tracking-tight">Vendor Catalog Management.</h1>
        <p className="text-sm text-[#888888] mt-2 max-w-2xl">Upload raw vendor data files. The <strong className="text-[#111111]">Normalization Agent</strong> parses messy strings, maps categories, and standardizes data to the Confluxe schema.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8 mb-10">
        {/* Upload Dropzone */}
        <div className="col-span-1 lg:col-span-2 border-2 border-dashed border-[#DCD6CA] bg-white p-8 md:p-12 flex flex-col items-center justify-center text-center hover:border-[#111111] hover:bg-[#FDFCF9] transition-all cursor-pointer shadow-sm">
          <div className="w-12 h-12 bg-[#F2F0EA] rounded-full flex items-center justify-center mb-4 text-[#555555]">
            <UploadCloud size={24} />
          </div>
          <p className="font-serif text-lg text-[#111111] mb-1">Drag & drop catalog files</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#888888]">Semantic Parsing via LangChain Structured Output</p>
        </div>

        {/* Agent Status Panel (Agent 1) */}
        <div className="col-span-1 bg-[#1C1A1A] p-6 shadow-sm text-white relative overflow-hidden border border-[#333]">
           <div className="absolute top-0 left-0 w-full h-1 bg-[#2A6B3D]"></div>
           <div className="flex items-center gap-2 mb-6">
             <Database size={14} className="text-[#2A6B3D]" />
             <span className="text-[10px] font-bold uppercase tracking-widest text-[#2A6B3D]">Normalization Agent</span>
           </div>
           
           <div className="space-y-4 text-xs font-mono">
             <div className="flex flex-col gap-1 border-b border-[#333] pb-3">
               <span className="text-[#888]">RAW: <span className="text-white">"mens_top_wntr_blk_42"</span></span>
               <span className="text-[#2A6B3D]">↳ PARSED: Outerwear | Black | Size L</span>
             </div>
             <div className="flex flex-col gap-1 border-b border-[#333] pb-3">
               <span className="text-[#888]">RAW: <span className="text-white">"29.99 USD"</span></span>
               <span className="text-[#2A6B3D]">↳ CONVERTED: ₹2,499 (MSRP)</span>
             </div>
             <div className="flex items-center gap-2 mt-4 text-[#2A6B3D] animate-pulse">
               <div className="w-1.5 h-1.5 bg-[#2A6B3D] rounded-full"></div> Awaiting new data...
             </div>
           </div>
        </div>
      </div>

      <div className="bg-white border border-[#E5E2D9] shadow-sm w-full">
        <div className="p-4 md:p-5 border-b border-[#E5E2D9] flex flex-col sm:flex-row justify-between sm:items-center gap-4">
          <h2 className="font-serif text-[#111111]">Connected Catalogs</h2>
          <button className="w-full sm:w-auto justify-center flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#555555] hover:text-[#111111] bg-[#F2F0EA] sm:bg-transparent py-2 sm:py-0 border border-[#E5E2D9] sm:border-transparent">
            <RefreshCw size={12} /> Sync All
          </button>
        </div>
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left text-sm whitespace-nowrap min-w-[600px]">
            <thead className="bg-[#FAF9F5] text-[#888888] border-b border-[#E5E2D9]">
              <tr>
                <th className="px-6 py-4 font-bold text-[10px] uppercase tracking-wider">File Name</th>
                <th className="px-6 py-4 font-bold text-[10px] uppercase tracking-wider">SKUs</th>
                <th className="px-6 py-4 font-bold text-[10px] uppercase tracking-wider">Agent Activity Log</th>
                <th className="px-6 py-4 font-bold text-[10px] uppercase tracking-wider text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E2D9]">
              {catalogsData.map((cat) => (
                <tr key={cat.id} className="hover:bg-[#FDFCF9] transition-colors">
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-3">
                      <FileJson size={16} className="text-[#888888]" />
                      <span className="font-serif text-[#111111]">{cat.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-5 font-serif text-[#111111]">{cat.skus}</td>
                  <td className="px-6 py-5 text-xs text-[#555555] font-mono bg-[#FAF9F5] w-1/3">
                    {'>'} {cat.agentLog}
                  </td>
                  <td className="px-6 py-5 text-right">
                    <span className={`inline-flex items-center justify-center px-3 py-1 text-[9px] font-bold uppercase tracking-widest border ${cat.color} ${cat.bg} ${cat.border}`}>
                      {cat.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// VIEW 4: TREND SIGNALS (RAG Agent)
// ==========================================
function TrendsView() {
  return (
    <div className="animate-in fade-in duration-500 max-w-[1400px]">
      <div className="mb-6 md:mb-8 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-1.5 h-1.5 bg-[#E32929]"></div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#E32929]">External Intelligence</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-serif text-[#111111] tracking-tight">Market Trend Pulse.</h1>
          <p className="text-sm text-[#888888] mt-2 max-w-2xl">Real-time search volume combined with our <strong className="text-[#111111]">Contextual Trend RAG Agent</strong> to explain the 'why' behind the spikes.</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-white border border-[#E5E2D9] shadow-sm w-fit">
          <div className="w-2 h-2 rounded-full bg-[#2A6B3D] animate-pulse"></div>
          <span className="text-[9px] font-bold uppercase tracking-widest text-[#555555]">Live: Google Trends API</span>
        </div>
      </div>

      {/* Trend KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6 mb-6 md:mb-8">
        <div className="bg-white border border-[#E5E2D9] p-5 shadow-sm hover:border-[#111111] transition-colors">
          <p className="text-[#888888] text-[10px] font-bold uppercase tracking-wider mb-2">Active Signals Tracked</p>
          <h3 className="text-2xl md:text-3xl font-serif text-[#111111]">1.2M+</h3>
          <p className="text-[9px] font-bold text-[#888888] uppercase tracking-widest mt-2">Queries across India</p>
        </div>
        <div className="bg-white border border-[#E5E2D9] p-5 shadow-sm hover:border-[#111111] transition-colors">
          <p className="text-[#888888] text-[10px] font-bold uppercase tracking-wider mb-2">Top Micro-Trend</p>
          <h3 className="text-2xl md:text-3xl font-serif text-[#111111]">Y2K Denim</h3>
          <p className="text-[9px] font-bold text-[#2A6B3D] uppercase tracking-widest mt-2 flex items-center gap-1">
            <TrendingUp size={10} /> +142% WoW Growth
          </p>
        </div>
        <div className="bg-white border border-[#E5E2D9] p-5 shadow-sm hover:border-[#111111] transition-colors">
          <p className="text-[#888888] text-[10px] font-bold uppercase tracking-wider mb-2">Tier 2 Momentum</p>
          <h3 className="text-2xl md:text-3xl font-serif text-[#111111]">High</h3>
          <p className="text-[9px] font-bold text-[#E32929] uppercase tracking-widest mt-2">Shift from Metro dominance</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
        
        {/* Highlight Card (Agent 2) */}
        <div className="bg-[#E32929] p-6 md:p-8 text-white shadow-xl relative overflow-hidden flex flex-col justify-between col-span-1 lg:row-span-2">
          <div className="absolute -right-8 -top-8 text-white/10">
            <TrendingUp size={180} strokeWidth={1} />
          </div>
          
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-6 border-b border-white/20 pb-3">
              <h3 className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-white"></span> RAG Agent Insight
              </h3>
              <Network size={14} className="text-white/80" />
            </div>
            
            <h4 className="text-3xl font-serif mb-4 leading-tight">Streetwear queries up 45% in Tier 2 cities.</h4>
            <p className="text-xs text-white/90 leading-relaxed mb-6 bg-black/10 p-4 border-l-2 border-white">
              The data suggests a rapid decentralization of streetwear demand. Moving beyond Delhi and Mumbai, cities like Pune, Jaipur, and Chandigarh are showing massive spike signals for oversized styles.
            </p>

            <div className="mb-8">
              <p className="text-[8px] font-bold uppercase tracking-widest text-white/60 mb-2">Sources Retrieved via Vector DB</p>
              <ul className="text-[10px] space-y-1.5 text-white/80 font-mono">
                <li>[1] Google_Trends_IN_Oct.csv</li>
                <li>[2] Myntra_Q3_Sales_Report.pdf</li>
                <li>[3] Vogue_India_Streetwear_Blog.html</li>
              </ul>
            </div>
          </div>
          
          <button className="relative z-10 bg-white text-[#E32929] px-5 py-3 text-[10px] font-bold uppercase tracking-widest hover:bg-[#FAF9F5] transition-all w-full text-center">
            View Source Documents
          </button>
        </div>

        {/* Table Area */}
        <div className="col-span-1 lg:col-span-2 bg-white border border-[#E5E2D9] shadow-sm flex flex-col w-full">
          <div className="p-5 border-b border-[#E5E2D9]">
             <h2 className="font-serif text-[#111111]">Category Momentum Map</h2>
          </div>
          <div className="overflow-x-auto flex-1 w-full">
            <table className="w-full text-left text-sm whitespace-nowrap min-w-[500px]">
              <thead className="bg-[#FAF9F5] text-[#888888] border-b border-[#E5E2D9]">
                <tr>
                  <th className="px-6 py-4 font-bold text-[10px] uppercase tracking-wider">Category</th>
                  <th className="px-6 py-4 font-bold text-[10px] uppercase tracking-wider">Monthly Vol</th>
                  <th className="px-6 py-4 font-bold text-[10px] uppercase tracking-wider">YoY Growth</th>
                  <th className="px-6 py-4 font-bold text-[10px] uppercase tracking-wider">Top Region</th>
                  <th className="px-6 py-4 font-bold text-[10px] uppercase tracking-wider text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E2D9]">
                {marketTrends.map((trend, i) => (
                  <tr key={i} className="hover:bg-[#FDFCF9] transition-colors">
                    <td className="px-6 py-5 font-serif text-[#111111]">{trend.category}</td>
                    <td className="px-6 py-5 text-sm text-[#555555]">{trend.volume}</td>
                    <td className={`px-6 py-5 font-bold text-sm ${trend.growth.includes('+') ? 'text-[#2A6B3D]' : 'text-[#E32929]'}`}>
                      {trend.growth}
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-1.5 text-xs text-[#555555]"><MapPin size={12} className="text-[#888888]"/> {trend.region}</div>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <span className="text-[9px] font-bold uppercase tracking-widest bg-[#F2F0EA] text-[#111111] px-3 py-1.5 border border-[#E5E2D9]">
                        {trend.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Rising Keywords Panel */}
        <div className="col-span-1 bg-white border border-[#E5E2D9] shadow-sm flex flex-col w-full">
          <div className="p-4 md:p-5 border-b border-[#E5E2D9] flex justify-between items-center">
             <h2 className="font-serif text-[#111111]">Rising Search Queries</h2>
             <Search size={14} className="text-[#888888]" />
          </div>
          <div className="p-2 flex-1">
            {risingKeywords.map((kw, i) => (
              <div key={i} className="flex items-center justify-between p-3 sm:p-4 hover:bg-[#FDFCF9] transition-colors border-b last:border-0 border-[#E5E2D9]">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-[#888888] font-serif text-sm opacity-50 shrink-0">0{i+1}</span>
                  <span className="font-medium text-[#111111] text-xs sm:text-sm truncate leading-tight">"{kw.term}"</span>
                </div>
                <span className={`text-[8px] sm:text-[9px] font-bold uppercase tracking-widest px-2 py-1 ${kw.type} ${kw.bg} whitespace-nowrap shrink-0 ml-2`}>
                  {kw.growth}
                </span>
              </div>
            ))}
          </div>
          <div className="p-4 border-t border-[#E5E2D9] bg-[#FAF9F5]">
            <button className="w-full text-center text-[10px] font-bold uppercase tracking-widest text-[#E32929] hover:text-[#111111] transition-colors">
              View All 500+ Queries
            </button>
          </div>
        </div>

        {/* Search Interest Visual Chart */}
        <div className="col-span-1 lg:col-span-2 bg-white border border-[#E5E2D9] shadow-sm p-6 md:p-8 w-full flex flex-col justify-between">
           <div className="flex justify-between items-end mb-8">
             <div>
                <h2 className="font-serif text-[#111111] text-lg">Search Interest Over Time</h2>
                <p className="text-[10px] text-[#888888] font-bold uppercase tracking-widest mt-1">Macro Indicator: "Streetwear India"</p>
             </div>
             <div className="text-right">
                <p className="text-3xl font-serif text-[#111111]">100</p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#E32929]">Peak Popularity (Oct)</p>
             </div>
           </div>

           <div className="h-48 flex items-end justify-between gap-2 border-b border-[#E5E2D9] pb-2 relative mt-4">
             <div className="absolute top-0 left-0 w-full border-t border-dashed border-[#EAE5DC]"></div>
             <div className="absolute top-1/2 left-0 w-full border-t border-dashed border-[#EAE5DC]"></div>
             
             {trendChartData.map((data, i) => (
               <div key={i} className="flex-1 flex flex-col items-center gap-2 group z-10">
                 <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-[#111111] text-white text-[9px] font-bold px-2 py-1 absolute -mt-8 pointer-events-none whitespace-nowrap">
                   Value: {data.value}
                 </div>
                 <div 
                    className={`w-full max-w-[40px] rounded-t-sm transition-all duration-500 ease-in-out ${i === trendChartData.length - 1 ? 'bg-[#E32929]' : 'bg-[#F2F0EA] group-hover:bg-[#D1CFC7]'}`}
                    style={{ height: `${data.value}%` }}
                 ></div>
               </div>
             ))}
           </div>
           
           <div className="flex justify-between mt-3 text-[9px] font-bold uppercase tracking-widest text-[#888888]">
             {trendChartData.map((data, i) => (<div key={i} className="flex-1 text-center">{data.month}</div>))}
           </div>
        </div>

      </div>
    </div>
  );
}