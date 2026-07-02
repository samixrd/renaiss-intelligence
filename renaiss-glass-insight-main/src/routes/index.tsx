import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback, type ReactNode, type FormEvent } from "react";
import { Search, TrendingUp, TrendingDown, Sparkles, Loader2, AlertCircle } from "lucide-react";
import bgAsset from "@/assets/hands-bg.webp.asset.json";
import {
  searchByCert,
  fetchPackEV,
  fetchRecentSales,
  type SearchResult,
  type PackEVResult,
  type RecentSale,
} from "@/lib/api";

export const Route = createFileRoute("/")(
  {
    head: () => ({
      meta: [
        { title: "Renaiss Intelligence — Calibrated Price Confidence for Collectors" },
        { name: "description", content: "Calibrated price confidence, pack EV, and live sales for collectibles." },
        { property: "og:title", content: "Renaiss Intelligence" },
        { property: "og:description", content: "Calibrated Price Confidence for Collectors" },
      ],
    }),
    component: Index,
  },
);

/* ── Shared UI primitives ─────────────────────────────────────────── */

function GlassCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`glass-panel rounded-2xl ${className}`}>{children}</div>;
}

function Spinner({ className = "" }: { className?: string }) {
  return <Loader2 className={`animate-spin text-faint ${className}`} />;
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/8 px-4 py-3 text-sm">
      <AlertCircle className="text-danger h-4 w-4 shrink-0" />
      <span className="text-danger/90 flex-1">{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="text-danger hover:text-danger/70 text-xs font-medium underline">
          Retry
        </button>
      )}
    </div>
  );
}

function SkeletonBar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-white/8 ${className}`} />;
}

/* ── Pack EV card ─────────────────────────────────────────────────── */

function PackCard({
  data,
  loading,
  error,
  onRetry,
}: {
  data: PackEVResult | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  if (error) {
    return (
      <GlassCard className="p-6">
        <ErrorBanner message={error} onRetry={onRetry} />
      </GlassCard>
    );
  }

  if (loading || !data) {
    return (
      <GlassCard className="p-6">
        <div className="flex items-baseline justify-between">
          <SkeletonBar className="h-5 w-28" />
          <SkeletonBar className="h-5 w-16 rounded-full" />
        </div>
        <div className="mt-6 grid grid-cols-2 gap-4">
          <div>
            <SkeletonBar className="h-3 w-10" />
            <SkeletonBar className="mt-2 h-8 w-24" />
          </div>
          <div>
            <SkeletonBar className="h-3 w-24" />
            <SkeletonBar className="mt-2 h-8 w-24" />
          </div>
        </div>
        <SkeletonBar className="mt-5 h-6 w-full" />
      </GlassCard>
    );
  }

  const below = data.verdict === "Below EV";
  const delta = ((data.expected_value - data.cost) / data.cost) * 100;

  return (
    <GlassCard className="p-6">
      <div className="flex items-baseline justify-between">
        <h3 className="font-sans text-lg tracking-wider text-white">{data.pack_name}</h3>
        <span
          className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-widest ${below ? "badge-danger" : "badge-success"}`}
        >
          {data.verdict}
        </span>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-4">
        <div>
          <div className="text-faint text-[11px] uppercase tracking-widest">Cost</div>
          <div className="mono-numeric mt-1 text-2xl">${data.cost.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-faint text-[11px] uppercase tracking-widest">Expected Value</div>
          <div className="mono-numeric mt-1 text-2xl">${data.expected_value.toFixed(2)}</div>
        </div>
      </div>
      <div className="mt-5 flex items-center gap-2 border-t border-border pt-4">
        {below ? (
          <TrendingDown className="text-danger h-4 w-4" />
        ) : (
          <TrendingUp className="text-success h-4 w-4" />
        )}
        <span className="mono-numeric text-soft text-sm">{delta.toFixed(2)}%</span>
        <span className="text-faint ml-auto text-xs">
          {data.cards_fetched}/{data.cards_total} cards priced
        </span>
      </div>
    </GlassCard>
  );
}

/* ── Main page ────────────────────────────────────────────────────── */

function Index() {
  const [query, setQuery] = useState("");

  // Search state
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Pack EV state
  const [omegaEV, setOmegaEV] = useState<PackEVResult | null>(null);
  const [omegaLoading, setOmegaLoading] = useState(true);
  const [omegaError, setOmegaError] = useState<string | null>(null);

  const [renaEV, setRenaEV] = useState<PackEVResult | null>(null);
  const [renaLoading, setRenaLoading] = useState(true);
  const [renaError, setRenaError] = useState<string | null>(null);

  // Recent sales state
  const [sales, setSales] = useState<RecentSale[]>([]);
  const [salesLoading, setSalesLoading] = useState(true);
  const [salesError, setSalesError] = useState<string | null>(null);

  /* ── Fetchers ─────────────────────────────────────────────────── */

  const doSearch = useCallback(async (cert: string) => {
    setSearchLoading(true);
    setSearchError(null);
    try {
      const result = await searchByCert(cert);
      setSearchResult(result);
    } catch (e: any) {
      setSearchError(e?.message ?? "Failed to fetch search results");
      setSearchResult(null);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed) doSearch(trimmed);
  };

  const loadOmega = useCallback(async () => {
    setOmegaLoading(true);
    setOmegaError(null);
    try {
      setOmegaEV(await fetchPackEV("OMEGA"));
    } catch (e: any) {
      setOmegaError(e?.message ?? "Failed to load OMEGA pack");
    } finally {
      setOmegaLoading(false);
    }
  }, []);

  const loadRena = useCallback(async () => {
    setRenaLoading(true);
    setRenaError(null);
    try {
      setRenaEV(await fetchPackEV("RenaCrypt"));
    } catch (e: any) {
      setRenaError(e?.message ?? "Failed to load RenaCrypt pack");
    } finally {
      setRenaLoading(false);
    }
  }, []);

  const loadSales = useCallback(async () => {
    setSalesLoading(true);
    setSalesError(null);
    try {
      setSales(await fetchRecentSales());
    } catch (e: any) {
      setSalesError(e?.message ?? "Failed to load recent sales");
    } finally {
      setSalesLoading(false);
    }
  }, []);

  // Load pack EV + recent sales on mount
  useEffect(() => {
    loadOmega();
    loadRena();
    loadSales();
  }, [loadOmega, loadRena, loadSales]);

  /* ── Confidence range bar ─────────────────────────────────────── */

  const hasSearch = searchResult !== null;
  const low = searchResult?.low ?? 0;
  const high = searchResult?.high ?? 0;
  const fmv = searchResult?.fmv ?? 0;
  const barPadding = Math.max((high - low) * 0.15, 10);
  const rangeMin = low - barPadding;
  const rangeMax = high + barPadding;
  const markerPct = rangeMax > rangeMin ? ((fmv - rangeMin) / (rangeMax - rangeMin)) * 100 : 50;
  const lowPct = rangeMax > rangeMin ? ((low - rangeMin) / (rangeMax - rangeMin)) * 100 : 20;
  const highPct = rangeMax > rangeMin ? 100 - ((rangeMax - high) / (rangeMax - rangeMin)) * 100 : 80;

  return (
    <div className="bg-background text-foreground relative min-h-screen overflow-hidden">
      {/* Background image */}
      <div
        className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-40"
        style={{ backgroundImage: `url(${bgAsset.url})` }}
      />
      <div className="bg-overlay pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute -top-32 left-1/2 h-[480px] w-[680px] -translate-x-1/2 rounded-full bg-white/5 blur-3xl" />

      <div className="relative mx-auto max-w-6xl px-6 py-10">
        {/* Navbar */}
        <nav className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl border border-white/15 bg-white/10 backdrop-blur-xl">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight">Renaiss Intelligence</h1>
              <p className="text-faint text-xs">Calibrated Price Confidence for Collectors</p>
            </div>
          </div>
          <div className="text-soft hidden items-center gap-6 text-sm md:flex">
            <a className="hover:text-foreground">Markets</a>
            <a className="hover:text-foreground">Packs</a>
            <a className="hover:text-foreground">Watchlist</a>
            <button className="glass-panel rounded-full px-4 py-1.5 text-xs hover:bg-card/80">
              Sign in
            </button>
          </div>
        </nav>

        {/* Hero / Search */}
        <div className="mt-16 text-center">
          <div className="glass-panel text-soft inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] uppercase tracking-widest">
            <span className="bg-success h-1.5 w-1.5 rounded-full" />
            Live market intelligence
          </div>
          <h2 className="mt-5 text-balance text-4xl font-semibold tracking-tight md:text-5xl">
            Know what it's <em className="text-soft italic">really</em> worth.
          </h2>
          <p className="text-soft mx-auto mt-3 max-w-xl text-sm">
            Enter a cert number to see calibrated fair market value, confidence intervals, and pack expected value in real time.
          </p>

          <form onSubmit={handleSearchSubmit}>
            <GlassCard className="mx-auto mt-8 flex max-w-2xl items-center gap-2 p-2">
              <Search className="text-faint ml-3 h-4 w-4" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Enter cert number e.g. 30060064"
                className="placeholder:text-faint flex-1 bg-transparent px-2 py-3 text-sm focus:outline-none"
              />
              <button
                type="submit"
                disabled={searchLoading || !query.trim()}
                className="bg-primary text-primary-foreground flex items-center gap-2 rounded-xl border border-border px-5 py-2.5 text-sm font-medium transition hover:opacity-90 disabled:opacity-50"
              >
                {searchLoading && <Spinner className="h-4 w-4" />}
                Search
              </button>
            </GlassCard>
          </form>
        </div>

        {/* Sections */}
        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          {/* Price Confidence */}
          <GlassCard className="p-6 lg:col-span-2">
            <div className="flex items-center justify-between">
              <span className="text-faint text-[11px] uppercase tracking-widest">
                Price Confidence
              </span>
              {hasSearch && (
                <span className="badge-success rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-widest">
                  {searchResult.method === "conformal"
                    ? "Conformal interval"
                    : searchResult.method === "hint"
                    ? "First lookup"
                    : "Fallback estimate"}
                </span>
              )}
            </div>

            {searchError && (
              <div className="mt-4">
                <ErrorBanner message={searchError} onRetry={() => query.trim() && doSearch(query.trim())} />
              </div>
            )}

            {searchLoading && (
              <div className="mt-8 flex flex-col items-center gap-3 py-8">
                <Spinner className="h-6 w-6" />
                <span className="text-faint text-sm">Fetching live data…</span>
              </div>
            )}

            {!searchLoading && !searchError && !hasSearch && (
              <div className="mt-6 py-8 text-center">
                <p className="text-faint text-sm">Search a cert number above to see price confidence data.</p>
              </div>
            )}

            {!searchLoading && hasSearch && (
              <>
                <div className="mt-4 flex flex-wrap items-baseline gap-3">
                  <h3 className="text-2xl font-semibold tracking-tight">
                    {searchResult.card_name || `Cert #${query}`}
                  </h3>
                  {searchResult.grade && (
                    <span className="glass-panel mono-numeric rounded-md px-2 py-0.5 text-xs">
                      {searchResult.grade}
                    </span>
                  )}
                  <span className="glass-panel mono-numeric rounded-md px-2 py-0.5 text-xs">
                    {searchResult.confidence_tier}
                  </span>
                  <span className="text-faint text-xs">
                    {searchResult.freshness_days >= 0 ? `${searchResult.freshness_days}d fresh` : "freshness unknown"}
                  </span>
                  {searchResult.set_name && (
                    <span className="text-faint text-xs w-full mt-1">{searchResult.set_name}</span>
                  )}
                </div>

                <div className="mt-8 grid gap-8 md:grid-cols-[auto_1fr] md:items-center">
                  <div>
                    <div className="text-faint text-[11px] uppercase tracking-widest">FMV</div>
                    <div className="mono-numeric mt-1 text-5xl tracking-tight">
                      ${fmv.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className="mono-numeric text-faint mt-2 text-xs">
                      {(searchResult.confidence * 100).toFixed(0)}% CI · ${low.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} — ${high.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>

                  <div>
                    <div className="bg-muted relative h-2 rounded-full">
                      <div
                        className="from-success/40 via-success/70 to-success/40 absolute inset-y-0 rounded-full bg-gradient-to-r"
                        style={{ left: `${lowPct}%`, right: `${100 - highPct}%` }}
                      />
                      <div
                        className="bg-primary absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-border shadow-[0_0_20px_rgba(255,255,255,0.6)]"
                        style={{ left: `${markerPct}%` }}
                      />
                    </div>
                    <div className="mono-numeric text-faint mt-2 flex justify-between text-[11px]">
                      <span>${rangeMin.toFixed(0)}</span>
                      <span>${low.toFixed(0)} low</span>
                      <span>${high.toFixed(0)} high</span>
                      <span>${rangeMax.toFixed(0)}</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </GlassCard>

          {/* Pack EV */}
          <div className="lg:col-span-2">
            <div className="mb-3 flex items-baseline justify-between">
              <span className="text-faint text-[11px] uppercase tracking-widest">
                Pack EV
              </span>
              <span className="text-faint text-xs">Live from API</span>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <PackCard data={omegaEV} loading={omegaLoading} error={omegaError} onRetry={loadOmega} />
              <PackCard data={renaEV} loading={renaLoading} error={renaError} onRetry={loadRena} />
            </div>
          </div>

          {/* Recent Sales */}
          <GlassCard className="p-6 lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-faint text-[11px] uppercase tracking-widest">
                Recent Sales
              </span>
              <span className="text-faint text-xs">Live feed</span>
            </div>

            {salesError && <ErrorBanner message={salesError} onRetry={loadSales} />}

            {salesLoading && (
              <div className="space-y-3 py-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 py-3">
                    <div>
                      <SkeletonBar className="h-4 w-40" />
                      <SkeletonBar className="mt-1.5 h-3 w-20" />
                    </div>
                    <SkeletonBar className="h-5 w-14 rounded-md" />
                    <SkeletonBar className="h-4 w-16" />
                  </div>
                ))}
              </div>
            )}

            {!salesLoading && !salesError && sales.length === 0 && (
              <div className="py-8 text-center">
                <p className="text-faint text-sm">No recent sales yet. Search for a cert to start building history.</p>
              </div>
            )}

            {!salesLoading && !salesError && sales.length > 0 && (
              <div className="max-h-80 overflow-y-auto pr-2">
                <ul className="divide-y divide-border">
                  {sales.map((s) => (
                    <li
                      key={s.id}
                      className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 py-3"
                    >
                      <div>
                        <div className="text-sm font-medium">{s.card_name}</div>
                        <div className="text-faint text-xs">
                          {s.set_name ? `${s.set_name}` : ""}
                          {s.year ? ` · ${s.year}` : ""}
                          {s.fetched_at
                            ? ` · ${new Date(s.fetched_at).toLocaleString()}`
                            : ""}
                        </div>
                      </div>
                      {s.grade && (
                        <span className="glass-panel mono-numeric text-soft rounded-md px-2 py-0.5 text-[11px]">
                          {s.grade}
                        </span>
                      )}
                      <div className="text-right">
                        <div className="mono-numeric text-sm">
                          Ask: ${s.ask_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div className="text-faint mono-numeric text-xs">
                          FMV: ${s.fmv.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-widest ${
                          s.verdict === "Overpriced"
                            ? "badge-danger"
                            : s.verdict === "Underpriced"
                            ? "badge-success"
                            : "glass-panel text-soft"
                        }`}
                      >
                        {s.verdict}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </GlassCard>
        </div>

        <footer className="text-faint mt-16 flex items-center justify-between border-t border-border pt-6 text-xs">
          <span>© Renaiss Intelligence</span>
          <span className="mono-numeric">v0.1 · live data</span>
        </footer>
      </div>
    </div>
  );
}
