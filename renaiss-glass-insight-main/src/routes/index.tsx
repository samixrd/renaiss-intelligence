import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback, type ReactNode } from "react";
import {
  Send,
  Bot,
  User,
  Sparkles,
  Loader2,
  TrendingUp,
  TrendingDown,
  Coins,
  Search,
  History,
  Info,
  DollarSign,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import bgAsset from "@/assets/hands-bg.webp.asset.json";
import {
  searchByCert,
  fetchPackEV,
  fetchRecentSales,
  fetchSuggestions,
  type SearchResult,
  type PackEVResult,
  type RecentSale,
} from "@/lib/api";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Renaiss Intelligence — Banker Bot & Market Advisor" },
      { name: "description", content: "Conformal price confidence and pack EV dashboard." },
      { property: "og:title", content: "Renaiss Intelligence Dashboard" },
      { property: "og:description", content: "Sleek financial dashboard for collectibles." },
    ],
  }),
  component: Index,
});

/* ── Custom UI & Visual Elements ─────────────────────────────────── */

function NumberCounter({ value, prefix = "", suffix = "", duration = 0.8 }: { value: number; prefix?: string; suffix?: string; duration?: number }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let startTime: number | null = null;
    const startValue = 0;
    
    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / (duration * 1000), 1);
      setDisplayValue(startValue + progress * (value - startValue));
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    
    requestAnimationFrame(animate);
  }, [value, duration]);

  return (
    <span className="font-mono tracking-tight text-white font-semibold">
      {prefix}
      {displayValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      {suffix}
    </span>
  );
}

function GlassCard({ children, className = "", delay = 0, interactive = false }: { children: ReactNode; className?: string; delay?: number; interactive?: boolean }) {
  const cardProps = interactive ? {
    whileHover: { 
      scale: 1.015, 
      boxShadow: "0 0 25px rgba(232, 213, 183, 0.15), inset 0 0 0 1px rgba(232, 213, 183, 0.2)",
      borderColor: "rgba(232, 213, 183, 0.3)" 
    },
    transition: { type: "spring", stiffness: 400, damping: 25 }
  } : {};

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      {...cardProps}
      className={`relative overflow-hidden backdrop-blur-xl bg-[#16161E]/40 border border-white/10 rounded-2xl shadow-xl transition-all duration-300 ${className}`}
    >
      {/* Subtle Inner Glow */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none" />
      {children}
    </motion.div>
  );
}

function RarityBadge({ tier }: { tier: string }) {
  const normalized = tier.toLowerCase();
  
  let glowColor = "rgba(156, 163, 175, 0.2)";
  let textColor = "text-gray-400";
  let bgBorder = "border-gray-500/20 bg-gray-500/5";

  if (normalized.includes("s")) {
    glowColor = "rgba(245, 158, 11, 0.35)";
    textColor = "text-[#E8D5B7]";
    bgBorder = "border-[#E8D5B7]/30 bg-[#E8D5B7]/10";
  } else if (normalized.includes("epic")) {
    glowColor = "rgba(168, 85, 247, 0.35)";
    textColor = "text-purple-400";
    bgBorder = "border-purple-500/30 bg-purple-500/10";
  } else if (normalized.includes("rare") || normalized.includes("blue")) {
    glowColor = "rgba(59, 130, 246, 0.35)";
    textColor = "text-blue-400";
    bgBorder = "border-blue-500/30 bg-blue-500/10";
  } else if (normalized.includes("uncommon") || normalized.includes("green")) {
    glowColor = "rgba(34, 197, 94, 0.35)";
    textColor = "text-green-400";
    bgBorder = "border-green-500/30 bg-green-500/10";
  }

  return (
    <span 
      style={{ boxShadow: `0 0 10px ${glowColor}` }}
      className={`text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md border ${textColor} ${bgBorder}`}
    >
      {tier}
    </span>
  );
}

function EVMeter({ cost, expectedValue }: { cost: number; expectedValue: number }) {
  const ratio = cost > 0 ? expectedValue / cost : 0;
  const percentage = Math.min(Math.max((ratio / 2) * 100, 5), 100);
  
  return (
    <div className="space-y-1.5 mt-3">
      <div className="flex justify-between text-[11px] text-[#A1A1AA]">
        <span>Cost vs EV Ratio</span>
        <span className={ratio >= 1.0 ? "text-green-400 font-bold" : "text-red-400 font-bold"}>
          {ratio.toFixed(2)}x
        </span>
      </div>
      <div className="relative h-2 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
        <div
          className={`h-full rounded-full transition-all duration-700 bg-gradient-to-r ${
            ratio >= 1.0 ? "from-red-500 via-yellow-500 to-green-500" : "from-red-600 to-yellow-500"
          }`}
          style={{ width: `${percentage}%` }}
        />
        <div className="absolute top-0 bottom-0 w-0.5 bg-white/20" style={{ left: "50%" }} />
      </div>
      <div className="flex justify-between text-[9px] text-[#52525B] font-mono">
        <span>0.0x</span>
        <span>1.0x (Break Even)</span>
        <span>2.0x+</span>
      </div>
    </div>
  );
}

function ConfidenceBellCurve({ low, high, fmv }: { low: number; high: number; fmv: number }) {
  const range = high - low;
  const minVal = low - range * 0.4;
  const maxVal = high + range * 0.4;
  const getPct = (v: number) => {
    const p = ((v - minVal) / (maxVal - minVal)) * 100;
    return Math.min(Math.max(p, 5), 95);
  };
  
  const lowPct = getPct(low);
  const fmvPct = getPct(fmv);
  const highPct = getPct(high);

  return (
    <div className="mt-4 p-4 bg-white/[0.01] border border-white/5 rounded-xl space-y-3">
      <div className="text-[11px] text-[#A1A1AA] font-semibold tracking-wider uppercase">
        80% Price Confidence Distribution
      </div>
      <div className="relative h-20 w-full mt-2">
        <svg className="w-full h-full overflow-visible" viewBox="0 0 100 40" preserveAspectRatio="none">
          {/* Main Bell Curve path */}
          <path
            d="M 0 38 Q 20 38 40 10 T 60 10 Q 80 38 100 38"
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="1.5"
          />
          {/* Highlight interval */}
          <path
            d={`M ${lowPct} 38 Q 40 12 50 8 T ${highPct} 38 Z`}
            fill="url(#gold-grad)"
            opacity="0.15"
          />
          <defs>
            <linearGradient id="gold-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#E8D5B7" />
              <stop offset="100%" stopColor="transparent" />
            </linearGradient>
          </defs>
          {/* Target Indicators */}
          <line x1={lowPct} y1="38" x2={lowPct} y2="18" stroke="#22C55E" strokeWidth="1" strokeDasharray="2 2" />
          <line x1={fmvPct} y1="38" x2={fmvPct} y2="8" stroke="#E8D5B7" strokeWidth="1.5" />
          <line x1={highPct} y1="38" x2={highPct} y2="18" stroke="#EF4444" strokeWidth="1" strokeDasharray="2 2" />
        </svg>
        {/* Dynamic Labels */}
        <div 
          style={{ left: `${lowPct}%` }} 
          className="absolute top-1/2 -translate-x-1/2 text-[9px] font-mono text-green-400 bg-[#0A0A0F]/80 px-1 rounded border border-green-500/20"
        >
          ${low.toFixed(0)}
        </div>
        <div 
          style={{ left: `${fmvPct}%` }} 
          className="absolute top-0 -translate-x-1/2 text-[10px] font-mono text-white font-bold bg-[#16161E] px-2 py-0.5 rounded border border-[#E8D5B7]/40 shadow-lg"
        >
          ${fmv.toFixed(0)}
        </div>
        <div 
          style={{ left: `${highPct}%` }} 
          className="absolute top-1/2 -translate-x-1/2 text-[9px] font-mono text-red-400 bg-[#0A0A0F]/80 px-1 rounded border border-red-500/20"
        >
          ${high.toFixed(0)}
        </div>
      </div>
      <div className="flex justify-between text-[9px] text-[#52525B]">
        <span>Low Target (10th percentile)</span>
        <span>High Target (90th percentile)</span>
      </div>
    </div>
  );
}

function MarketPulse({ totalListings, avgGap, lastSync }: { totalListings: number; avgGap: number; lastSync: string }) {
  const syncDate = lastSync ? new Date(lastSync) : new Date();
  
  return (
    <GlassCard className="p-4 bg-[#111118]/80 border-white/5">
      <div className="flex items-center justify-between mb-3 border-b border-white/5 pb-2">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
          <span className="text-[11px] uppercase tracking-wider font-bold text-[#A1A1AA] font-heading">Market Pulse</span>
        </div>
        <span className="text-[9px] text-[#52525B] font-mono">
          Sync: {syncDate.toLocaleTimeString()}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <div className="text-[10px] text-[#A1A1AA]/80 uppercase">Listings Tracked</div>
          <div className="font-mono text-lg font-bold text-white tracking-tight">
            {totalListings || "--"}
          </div>
        </div>
        <div className="space-y-1">
          <div className="text-[10px] text-[#A1A1AA]/80 uppercase">Average Price Gap</div>
          <div className={`font-mono text-lg font-bold tracking-tight ${avgGap < 0 ? "text-green-400" : "text-red-400"}`}>
            {avgGap !== 0 ? `${avgGap > 0 ? "+" : ""}${avgGap.toFixed(1)}%` : "--"}
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

function SkeletonLoader() {
  return (
    <div className="space-y-4 p-5 bg-[#16161E]/40 border border-white/5 rounded-2xl animate-pulse w-full">
      <div className="h-6 bg-white/5 rounded w-1/3" />
      <div className="h-4 bg-white/5 rounded w-1/2" />
      <div className="grid grid-cols-3 gap-2 pt-2">
        <div className="h-14 bg-white/5 rounded-xl" />
        <div className="h-14 bg-white/5 rounded-xl" />
        <div className="h-14 bg-white/5 rounded-xl" />
      </div>
      <div className="h-28 bg-white/5 rounded-xl pt-2" />
    </div>
  );
}

/* ── Main Dashboard Component ────────────────────────────────────── */

function Index() {
  const [certInput, setCertInput] = useState("");
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showBanner, setShowBanner] = useState(true);

  // Side dashboard stats
  const [recentSales, setRecentSales] = useState<RecentSale[]>([]);
  const [salesLoading, setSalesLoading] = useState(true);
  const [omegaEV, setOmegaEV] = useState<PackEVResult | null>(null);
  const [renaEV, setRenaEV] = useState<PackEVResult | null>(null);
  const [edenEV, setEdenEV] = useState<PackEVResult | null>(null);

  // Aggregated market pulse stats
  const totalListings = recentSales.length;
  const avgGap = recentSales.length > 0 
    ? recentSales.reduce((acc, curr) => acc + curr.price_gap, 0) / recentSales.length 
    : 0;
  const lastSync = recentSales[0]?.fetched_at || "";

  // Load dashboard widgets
  const loadDashboardData = useCallback(async () => {
    setSalesLoading(true);
    try {
      const [salesData, omegaData, renaData, edenData] = await Promise.all([
        fetchRecentSales().catch(() => [] as RecentSale[]),
        fetchPackEV("OMEGA").catch(() => null),
        fetchPackEV("RenaCrypt").catch(() => null),
        fetchPackEV("Eden Pack").catch(() => null),
      ]);
      setRecentSales(salesData);
      setOmegaEV(omegaData);
      setRenaEV(renaData);
      setEdenEV(edenData);
    } catch (err) {
      console.error("Dashboard prefetch failed", err);
    } finally {
      setSalesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
    fetchSuggestions().then(setSuggestions).catch(() => {});
    const dismissed = localStorage.getItem("beta-banner-dismissed");
    if (dismissed === "true") {
      setShowBanner(false);
    }
  }, [loadDashboardData]);

  // Action: Search PSA Cert
  const handleSearch = async (certNum: string) => {
    const trimmed = certNum.trim();
    if (!trimmed) return;
    setValidationError(null);
    setSearchLoading(true);
    setSearchError(null);
    setSearchResult(null);
    
    if (!/^PSA\d+$/i.test(trimmed)) {
      setValidationError("Only PSA certificates are currently supported.");
      setSearchLoading(false);
      return;
    }

    try {
      const res = await searchByCert(trimmed.toUpperCase());
      setSearchResult(res);
    } catch (err: any) {
      setSearchError(err.message || "PSA cert not found or error fetching data. Please ensure your backend config is correct.");
    } finally {
      setSearchLoading(false);
    }
  };

  return (
    <div className="bg-[#0A0A0F] text-[#FAFAFA] relative min-h-screen overflow-hidden flex flex-col font-sans">
      {/* Background Graphic & Overlays */}
      <div
        className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-[0.08] mix-blend-lighten"
        style={{ backgroundImage: `url(${bgAsset.url})` }}
      />
      <div className="pointer-events-none absolute -top-80 left-1/4 h-[600px] w-[800px] rounded-full bg-[#E8D5B7]/5 blur-[140px]" />
      <div className="pointer-events-none absolute -bottom-80 right-1/4 h-[600px] w-[800px] rounded-full bg-[#A78BFA]/5 blur-[140px]" />

      {/* Header / Navbar */}
      <header className="relative border-b border-white/[0.06] bg-[#111118]/75 backdrop-blur-xl px-6 py-4 flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/[0.02] shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[#E8D5B7]">
              <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight font-heading flex items-center gap-2 text-[#FAFAFA]">
              RENAISS INTELLIGENCE
              <span className="flex items-center gap-1 bg-[#22C55E]/10 border border-[#22C55E]/30 px-2 py-0.5 rounded-full text-[9px] text-[#22C55E] uppercase tracking-wider font-sans font-semibold">
                <span className="h-1.5 w-1.5 rounded-full bg-[#22C55E] animate-pulse inline-block" />
                Live
              </span>
            </h1>
            <p className="text-[#A1A1AA] text-xs">Automated Financial Analyst & Collectors' Intelligence</p>
          </div>
        </div>
        <button
          onClick={loadDashboardData}
          className="text-[#A1A1AA] hover:text-[#FAFAFA] text-xs flex items-center gap-1.5 transition-colors border border-white/5 bg-white/[0.02] px-3 py-1.5 rounded-lg hover:bg-white/5 font-semibold"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>

        {/* Navbar bottom subtle gradient line */}
        <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#E8D5B7]/30 to-transparent" />
      </header>

      {/* Beta Warning Banner */}
      {showBanner && (
        <div className="mx-6 mt-4 p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl flex items-center justify-between gap-3 text-xs text-amber-200/95 shadow-md shrink-0">
          <div className="flex items-center gap-2.5">
            <Info className="h-4 w-4 text-amber-500 shrink-0" />
            <span>
              Data sourced from Renaiss CLI and Index API (beta). Some data may be incomplete, missing, delayed, or still being updated. All outputs are experimental references, not final verified market facts.
            </span>
          </div>
          <button
            onClick={() => {
              localStorage.setItem("beta-banner-dismissed", "true");
              setShowBanner(false);
            }}
            className="text-[#A1A1AA] hover:text-white text-[10px] font-bold px-2 py-1 rounded bg-white/5 hover:bg-white/10 transition-all shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Workspace Scrollable Container */}
      <div className="flex-1 overflow-y-auto z-5 px-6 py-8">
        <div className="max-w-7xl mx-auto w-full space-y-8">
          
          {/* Hero Section & Search Bar */}
          <section className="text-center max-w-2xl mx-auto space-y-4">
            <h2 className="text-3xl font-extrabold font-heading text-white tracking-tight sm:text-4xl">
              Graded PSA Cert Lookup
            </h2>
            <p className="text-[#A1A1AA] text-sm sm:text-base leading-relaxed">
              Verify PSA cert values instantly. Analyze conformal confidence intervals, ROI calculations, and market gap rates.
            </p>
            
            {/* Search Input Box */}
            <div className="pt-2">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSearch(certInput);
                }}
                className="flex items-center gap-2 bg-[#16161E] border border-white/10 rounded-xl p-1.5 focus-within:border-[#E8D5B7]/40 focus-within:ring-1 focus-within:ring-[#E8D5B7]/10 transition-all max-w-lg mx-auto shadow-2xl"
              >
                <Search className="h-5 w-5 text-[#52525B] ml-3 shrink-0" />
                <input
                  value={certInput}
                  onChange={(e) => {
                    setCertInput(e.target.value);
                    setValidationError(null);
                  }}
                  placeholder="Enter PSA cert number (e.g. PSA151238633)..."
                  className="flex-1 bg-transparent px-2 py-2 text-sm focus:outline-none placeholder:text-[#52525B]"
                />
                <button
                  type="submit"
                  disabled={!certInput.trim() || searchLoading}
                  className="px-5 py-2 text-xs font-bold rounded-lg bg-[#E8D5B7] text-[#0A0A0F] hover:opacity-90 disabled:opacity-30 disabled:hover:opacity-30 transition-all cursor-pointer flex items-center gap-1.5 font-heading"
                >
                  {searchLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  Search
                </button>
              </form>

              {validationError && (
                <div className="text-amber-500 text-xs mt-2 font-semibold text-center">
                  {validationError}
                </div>
              )}

              {/* Suggestions */}
              {suggestions && suggestions.length > 0 && (
                <div className="flex justify-center gap-2 mt-3 flex-wrap">
                  <span className="text-[11px] text-[#52525B] self-center">Suggestions:</span>
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => {
                        setCertInput(suggestion);
                        handleSearch(suggestion);
                      }}
                      className="text-[10px] bg-white/[0.02] border border-white/5 hover:border-white/20 hover:bg-white/5 rounded-md px-2 py-1 text-[#A1A1AA] transition-colors"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* 3-Column Dashboard Layout Grid */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Column 1: Price Confidence Search Result */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                <Info className="h-4 w-4 text-[#E8D5B7]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#A1A1AA] font-heading">Price Confidence</h3>
              </div>

              {searchLoading ? (
                <SkeletonLoader />
              ) : searchError ? (
                <GlassCard className="p-5 border-red-500/20 bg-red-500/5 text-center">
                  <div className="text-red-400 font-bold text-sm font-heading mb-1">Search Failed</div>
                  <p className="text-xs text-[#A1A1AA] leading-relaxed">{searchError}</p>
                </GlassCard>
              ) : searchResult ? (
                <CertAnalysisWidget result={searchResult} />
              ) : (
                <GlassCard className="p-8 text-center border-dashed border-white/10 bg-transparent">
                  <Search className="h-8 w-8 text-[#52525B] mx-auto mb-3" />
                  <div className="text-sm font-semibold text-white font-heading">No PSA Cert Loaded</div>
                  <p className="text-xs text-[#52525B] mt-1.5 max-w-xs mx-auto leading-relaxed">
                    Lookup a PSA cert number in the search bar above to generate the Conformal inference prediction curve.
                  </p>
                </GlassCard>
              )}
            </div>

            {/* Column 2: Pack Expected Value Cards */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                <Coins className="h-4 w-4 text-purple-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#A1A1AA] font-heading">Pack Expected Values</h3>
              </div>

              {salesLoading ? (
                <div className="space-y-3">
                  <div className="h-24 bg-white/5 animate-pulse rounded-xl" />
                  <div className="h-24 bg-white/5 animate-pulse rounded-xl" />
                  <div className="h-24 bg-white/5 animate-pulse rounded-xl" />
                </div>
              ) : (
                <div className="space-y-4">
                  {omegaEV && (
                    <GlassCard interactive className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-bold text-sm font-heading">{omegaEV.pack_name}</div>
                          <div className="text-[#A1A1AA] text-[10px] font-semibold mt-0.5">
                            Ratio: <span className={omegaEV.ev_ratio >= 1 ? "text-green-400" : "text-red-400"}>{omegaEV.ev_ratio.toFixed(2)}x</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-sm text-[#E8D5B7]">
                            <NumberCounter value={omegaEV.expected_value} prefix="$" />
                          </div>
                          <div className="text-[#52525B] text-[9px] font-mono mt-0.5">Cost: ${omegaEV.cost.toFixed(2)}</div>
                        </div>
                      </div>
                      <EVMeter cost={omegaEV.cost} expectedValue={omegaEV.expected_value} />
                      {omegaEV.recent_notable_pulls && omegaEV.recent_notable_pulls.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-white/5 space-y-1.5">
                          <div className="text-[10px] text-[#A1A1AA] uppercase tracking-wider font-semibold">Recent Notable Pulls</div>
                          <div className="space-y-1">
                            {omegaEV.recent_notable_pulls.map((pull) => (
                              <div key={pull.token_id} className="flex justify-between items-center text-[10px]">
                                <span className="text-[#A1A1AA] truncate pr-2">
                                  #{pull.token_id.slice(0, 8)}...{pull.token_id.slice(-8)}
                                  <span className="ml-1 text-[8px] uppercase px-1 bg-white/5 border border-white/5 rounded text-[#A1A1AA]">{pull.tier}</span>
                                </span>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="font-mono text-[#E8D5B7] font-semibold">${pull.fmv.toFixed(2)}</span>
                                  {pull.marketplace_url && (
                                    <a
                                      href={pull.marketplace_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-blue-400 hover:underline flex items-center gap-0.5"
                                    >
                                      View <ArrowRight className="h-2.5 w-2.5 inline" />
                                    </a>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </GlassCard>
                  )}

                  {renaEV && (
                    <GlassCard interactive className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-bold text-sm font-heading">{renaEV.pack_name}</div>
                          <div className="text-[#A1A1AA] text-[10px] font-semibold mt-0.5">
                            Ratio: <span className={renaEV.ev_ratio >= 1 ? "text-green-400" : "text-red-400"}>{renaEV.ev_ratio.toFixed(2)}x</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-sm text-[#E8D5B7]">
                            <NumberCounter value={renaEV.expected_value} prefix="$" />
                          </div>
                          <div className="text-[#52525B] text-[9px] font-mono mt-0.5">Cost: ${renaEV.cost.toFixed(2)}</div>
                        </div>
                      </div>
                      <EVMeter cost={renaEV.cost} expectedValue={renaEV.expected_value} />
                      {renaEV.recent_notable_pulls && renaEV.recent_notable_pulls.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-white/5 space-y-1.5">
                          <div className="text-[10px] text-[#A1A1AA] uppercase tracking-wider font-semibold">Recent Notable Pulls</div>
                          <div className="space-y-1">
                            {renaEV.recent_notable_pulls.map((pull) => (
                              <div key={pull.token_id} className="flex justify-between items-center text-[10px]">
                                <span className="text-[#A1A1AA] truncate pr-2">
                                  #{pull.token_id.slice(0, 8)}...{pull.token_id.slice(-8)}
                                  <span className="ml-1 text-[8px] uppercase px-1 bg-white/5 border border-white/5 rounded text-[#A1A1AA]">{pull.tier}</span>
                                </span>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="font-mono text-[#E8D5B7] font-semibold">${pull.fmv.toFixed(2)}</span>
                                  {pull.marketplace_url && (
                                    <a
                                      href={pull.marketplace_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-blue-400 hover:underline flex items-center gap-0.5"
                                    >
                                      View <ArrowRight className="h-2.5 w-2.5 inline" />
                                    </a>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </GlassCard>
                  )}

                  {edenEV && (
                    <GlassCard interactive className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-bold text-sm font-heading">{edenEV.pack_name}</div>
                          <div className="text-[#A1A1AA] text-[10px] font-semibold mt-0.5">
                            Ratio: <span className={edenEV.ev_ratio >= 1 ? "text-green-400" : "text-red-400"}>{edenEV.ev_ratio.toFixed(2)}x</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-sm text-[#E8D5B7]">
                            <NumberCounter value={edenEV.expected_value} prefix="$" />
                          </div>
                          <div className="text-[#52525B] text-[9px] font-mono mt-0.5">Cost: ${edenEV.cost.toFixed(2)}</div>
                        </div>
                      </div>
                      <EVMeter cost={edenEV.cost} expectedValue={edenEV.expected_value} />
                    </GlassCard>
                  )}
                </div>
              )}
            </div>

            {/* Column 3: Recent Sales Feed & Live Statistics */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                <History className="h-4 w-4 text-blue-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#A1A1AA] font-heading">Recent Sales Activity</h3>
              </div>

              {/* Aggregated Pulse Info */}
              <MarketPulse totalListings={totalListings} avgGap={avgGap} lastSync={lastSync} />

              {salesLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <div key={n} className="h-12 bg-white/5 animate-pulse rounded-xl" />
                  ))}
                </div>
              ) : recentSales.length > 0 ? (
                <div className="space-y-2.5 max-h-[400px] overflow-y-auto pr-1">
                  {recentSales.map((sale) => (
                    <div 
                      key={sale.id} 
                      className="p-3 bg-[#16161E]/40 border border-white/5 hover:border-white/10 rounded-xl flex items-center justify-between gap-2 text-xs transition-all duration-200 hover:-translate-y-0.5"
                    >
                      <div className="truncate space-y-0.5">
                        <div className="font-semibold text-white truncate">{sale.card_name}</div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[#52525B] text-[10px] font-mono truncate">{sale.set_name || "Gacha"}</span>
                          {sale.grade && <RarityBadge tier={sale.grade} />}
                        </div>
                      </div>
                      <div className="shrink-0 text-right space-y-0.5">
                        <span className="font-mono text-white font-bold">${sale.ask_price.toFixed(2)}</span>
                        <div className="flex justify-end">
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                            sale.price_gap < -10.0 ? "bg-green-500/10 text-green-400 border border-green-500/20" : 
                            sale.price_gap > 10.0 ? "bg-red-500/10 text-red-400 border border-red-500/20" : 
                            "bg-white/5 text-[#A1A1AA] border border-white/10"
                          }`}>
                            {sale.price_gap < 0 ? "" : "+"}{sale.price_gap.toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-[#52525B] italic text-center p-6 bg-white/[0.01] border border-white/5 rounded-xl">
                  No marketplace listings synchronized yet. Click refresh to sync.
                </div>
              )}
            </div>

          </section>

        </div>
      </div>
    </div>
  );
}

/* ── Render Widgets ──────────────────────────────────────────────── */

function CertAnalysisWidget({ result }: { result: SearchResult }) {
  const low = result.low ?? 0;
  const high = result.high ?? 0;
  const fmv = result.fmv ?? 0;
  const barPadding = Math.max((high - low) * 0.15, 10);
  const rangeMin = low - barPadding;
  const rangeMax = high + barPadding;
  const markerPct = rangeMax > rangeMin ? ((fmv - rangeMin) / (rangeMax - rangeMin)) * 100 : 50;
  const lowPct = rangeMax > rangeMin ? ((low - rangeMin) / (rangeMax - rangeMin)) * 100 : 20;
  const highPct = rangeMax > rangeMin ? 100 - ((rangeMax - high) / (rangeMax - rangeMin)) * 100 : 80;

  return (
    <GlassCard className="p-5 w-full bg-[#16161E]/60">
      <div className="flex items-center justify-between border-b border-white/5 pb-3">
        <div className="truncate pr-2">
          <h4 className="font-bold text-white text-sm font-heading truncate">{result.card_name}</h4>
          <span className="text-[#A1A1AA] text-[10px] font-semibold truncate block">{result.set_name || "Renaiss Collectibles"}</span>
        </div>
        <span className="bg-[#22C55E]/10 border border-[#22C55E]/20 text-[#22C55E] text-[9px] font-bold uppercase tracking-wider rounded-full px-2.5 py-0.5 shrink-0">
          {result.method === "conformal" ? "Conformal Inference" : result.method}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="bg-white/[0.02] border border-white/5 rounded-xl p-2 text-center">
          <div className="text-[#52525B] text-[9px] uppercase font-bold">Low Range</div>
          <div className="font-mono text-sm font-semibold text-white mt-1">
            <NumberCounter value={low} prefix="$" />
          </div>
        </div>
        <div className="bg-[#E8D5B7]/10 border border-[#E8D5B7]/20 rounded-xl p-2 text-center">
          <div className="text-[#E8D5B7] text-[9px] uppercase font-bold">Best Estimate</div>
          <div className="font-mono text-sm font-bold text-white mt-1">
            <NumberCounter value={fmv} prefix="$" />
          </div>
        </div>
        <div className="bg-white/[0.02] border border-white/5 rounded-xl p-2 text-center">
          <div className="text-[#52525B] text-[9px] uppercase font-bold">High Range</div>
          <div className="font-mono text-sm font-semibold text-white mt-1">
            <NumberCounter value={high} prefix="$" />
          </div>
        </div>
      </div>

      {/* Bell Curve visualization */}
      <ConfidenceBellCurve low={low} high={high} fmv={fmv} />

      {/* Backup standard range slider representation */}
      <div className="mt-5 border-t border-white/5 pt-4">
        <div className="relative h-2 bg-white/5 rounded-full border border-white/5">
          <div
            className="from-green-500/30 via-[#E8D5B7]/60 to-red-500/30 absolute inset-y-0 rounded-full bg-gradient-to-r"
            style={{ left: `${lowPct}%`, right: `${100 - highPct}%` }}
          />
          <div
            className="bg-[#E8D5B7] absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-black shadow-[0_0_8px_rgba(232,213,183,0.5)]"
            style={{ left: `${markerPct}%` }}
          />
        </div>
        <div className="font-mono text-[#52525B] text-[10px] mt-1.5 flex justify-between">
          <span>${rangeMin.toFixed(0)}</span>
          <span className="text-green-400 font-bold">${low.toFixed(0)} low</span>
          <span className="text-[#E8D5B7] font-bold">${fmv.toFixed(0)} fmv</span>
          <span className="text-red-400 font-bold">${high.toFixed(0)} high</span>
          <span>${rangeMax.toFixed(0)}</span>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between text-[11px] text-[#A1A1AA] border-t border-white/5 pt-3">
        <span className="flex items-center gap-1.5 font-semibold">
          <Info className="h-3.5 w-3.5 text-[#E8D5B7]" /> Freshness: {result.freshness_days} days
        </span>
        {result.grade && (
          <div className="flex items-center gap-1">
            <span className="text-[#52525B]">Grade:</span> 
            <RarityBadge tier={result.grade} />
          </div>
        )}
      </div>
    </GlassCard>
  );
}
