import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";
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
import bgAsset from "@/assets/hands-bg.webp.asset.json";
import {
  searchByCert,
  fetchPackEV,
  fetchRecentSales,
  type SearchResult,
  type PackEVResult,
  type RecentSale,
} from "@/lib/api";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Renaiss Intelligence — Banker Bot & Market Advisor" },
      { name: "description", content: "Chat with the Renaiss Banker Bot for calibrated price confidence and pack EV." },
      { property: "og:title", content: "Renaiss Intelligence Banker Bot" },
      { property: "og:description", content: "Sleek financial chatbot for collectibles." },
    ],
  }),
  component: Index,
});

/* ── UI Components ───────────────────────────────────────────────── */

interface Message {
  id: string;
  sender: "bot" | "user";
  timestamp: Date;
  text: string;
  type?: "text" | "cert" | "pack" | "sales";
  payload?: any;
  loading?: boolean;
}

function GlassCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`glass-panel rounded-2xl ${className}`}>{children}</div>;
}

function Spinner({ className = "" }: { className?: string }) {
  return <Loader2 className={`animate-spin text-faint ${className}`} />;
}

/* ── Main Page ───────────────────────────────────────────────────── */

function Index() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      sender: "bot",
      timestamp: new Date(1782992681856),
      text: "Welcome to Renaiss Intelligence. I am your Banker Bot. Ask me to search certification serials, analyze pack expected values, or view recent marketplace sales.",
      type: "text",
    },
  ]);
  const [input, setInput] = useState("");
  const [isBotTyping, setIsBotTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Side dashboard stats
  const [recentSales, setRecentSales] = useState<RecentSale[]>([]);
  const [salesLoading, setSalesLoading] = useState(true);
  const [omegaEV, setOmegaEV] = useState<PackEVResult | null>(null);
  const [renaEV, setRenaEV] = useState<PackEVResult | null>(null);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isBotTyping]);

  // Load dashboard widgets
  const loadDashboardData = useCallback(async () => {
    setSalesLoading(true);
    try {
      const [salesData, omegaData, renaData] = await Promise.all([
        fetchRecentSales().catch(() => [] as RecentSale[]),
        fetchPackEV("OMEGA").catch(() => null),
        fetchPackEV("RenaCrypt").catch(() => null),
      ]);
      setRecentSales(salesData);
      setOmegaEV(omegaData);
      setRenaEV(renaData);
    } catch (err) {
      console.error("Dashboard prefetch failed", err);
    } finally {
      setSalesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Action: Search Cert
  const handleCertSearch = async (certNum: string, messageId: string) => {
    try {
      const res = await searchByCert(certNum);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId
            ? {
                ...msg,
                loading: false,
                text: `Analysis complete for Cert #${certNum}.`,
                type: "cert",
                payload: res,
              }
            : msg
        )
      );
    } catch (err: any) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId
            ? {
                ...msg,
                loading: false,
                text: `Error analyzing Cert #${certNum}: ${err.message || "Endpoint error. Make sure your Turso database and Renaiss API credentials are set."}`,
              }
            : msg
        )
      );
    }
  };

  // Action: Analyze Pack
  const handlePackAnalyze = async (packName: string, messageId: string) => {
    try {
      const res = await fetchPackEV(packName);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId
            ? {
                ...msg,
                loading: false,
                text: `Expected value for ${packName} calculated successfully.`,
                type: "pack",
                payload: res,
              }
            : msg
        )
      );
    } catch (err: any) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId
            ? {
                ...msg,
                loading: false,
                text: `Error fetching expected value for ${packName}: ${err.message}`,
              }
            : msg
        )
      );
    }
  };

  // Action: List Recent Sales
  const handleRecentSales = async (messageId: string) => {
    try {
      const res = await fetchRecentSales();
      setRecentSales(res); // update dashboard too
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId
            ? {
                ...msg,
                loading: false,
                text: `Here are the latest marketplace listings and price gaps:`,
                type: "sales",
                payload: res,
              }
            : msg
        )
      );
    } catch (err: any) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId
            ? {
                ...msg,
                loading: false,
                text: `Error retrieving marketplace sales: ${err.message}`,
              }
            : msg
        )
      );
    }
  };

  // Process message input
  const processCommand = async (text: string) => {
    const cleanText = text.trim();
    if (!cleanText) return;

    // User message
    const userMsgId = `user-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: userMsgId, sender: "user", timestamp: new Date(), text: cleanText },
    ]);
    setInput("");

    // Bot typing
    setIsBotTyping(true);
    const botMsgId = `bot-${Date.now()}`;

    // Add loading/placeholder message
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: botMsgId,
          sender: "bot",
          timestamp: new Date(),
          text: "Processing request...",
          loading: true,
        },
      ]);
      setIsBotTyping(false);
    }, 400);

    // Parse commands/intent
    setTimeout(() => {
      const lower = cleanText.toLowerCase();
      const certMatch = lower.match(/\b\d{8,}\b/) || cleanText.match(/cert\s*#?([a-zA-Z0-9-]+)/i);
      
      if (certMatch) {
        const certVal = certMatch[1] || certMatch[0];
        handleCertSearch(certVal, botMsgId);
      } else if (lower.includes("omega")) {
        handlePackAnalyze("OMEGA", botMsgId);
      } else if (lower.includes("crypt") || lower.includes("rena")) {
        handlePackAnalyze("RenaCrypt", botMsgId);
      } else if (lower.includes("sale") || lower.includes("recent") || lower.includes("listing")) {
        handleRecentSales(botMsgId);
      } else {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === botMsgId
              ? {
                  ...msg,
                  loading: false,
                  text: `I couldn't identify the command. You can say:
- "Check cert 30060064"
- "Analyze Omega Pack"
- "Show recent sales"`,
                }
              : msg
          )
        );
      }
    }, 600);
  };

  return (
    <div className="bg-background text-foreground relative min-h-screen overflow-hidden flex flex-col font-sans">
      {/* Background Graphic */}
      <div
        className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-25"
        style={{ backgroundImage: `url(${bgAsset.url})` }}
      />
      <div className="bg-overlay pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute -top-40 left-1/3 h-[500px] w-[700px] rounded-full bg-accent/10 blur-3xl" />

      {/* Header */}
      <header className="relative border-b border-border bg-card/20 backdrop-blur-md px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-white/5 shadow-inner">
            <Bot className="h-5 w-5 text-accent-foreground" />
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-wide flex items-center gap-2">
              RENAISS BANKER BOT
              <span className="h-2 w-2 rounded-full bg-success animate-pulse inline-block" />
            </h1>
            <p className="text-faint text-xs">Automated Financial Analyst & Collectors' Intelligence</p>
          </div>
        </div>
        <button
          onClick={loadDashboardData}
          className="text-faint hover:text-foreground text-xs flex items-center gap-1.5 transition"
        >
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </header>

      {/* Main Workspace */}
      <main className="relative flex-1 overflow-hidden flex flex-col lg:flex-row max-w-7xl mx-auto w-full">
        
        {/* Left Side: Bot Chat Interaction */}
        <section className="flex-1 flex flex-col border-r border-border min-h-0">
          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
            {messages.map((msg) => {
              const isBot = msg.sender === "bot";
              return (
                <div key={msg.id} className={`flex gap-4 ${isBot ? "" : "flex-row-reverse"}`}>
                  <div
                    className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 border ${
                      isBot ? "bg-accent/10 border-accent/20 text-accent-foreground" : "bg-white/10 border-border text-foreground"
                    }`}
                  >
                    {isBot ? <Bot className="h-4.5 w-4.5" /> : <User className="h-4.5 w-4.5" />}
                  </div>

                  <div className={`flex flex-col max-w-[85%] ${isBot ? "" : "items-end"}`}>
                    <div
                      className={`rounded-2xl px-4 py-3 text-sm shadow-sm leading-relaxed whitespace-pre-line ${
                        isBot
                          ? "bg-card/40 border border-border text-foreground rounded-tl-sm"
                          : "bg-white/10 text-white rounded-tr-sm"
                      }`}
                    >
                      {msg.loading ? (
                        <div className="flex items-center gap-2 py-1">
                          <Spinner className="h-4 w-4" />
                          <span className="text-faint text-xs">Running model inference...</span>
                        </div>
                      ) : (
                        msg.text
                      )}
                    </div>

                    {/* Rich Response Widgets */}
                    {!msg.loading && msg.type === "cert" && msg.payload && (
                      <CertAnalysisWidget result={msg.payload} />
                    )}

                    {!msg.loading && msg.type === "pack" && msg.payload && (
                      <PackEVWidget data={msg.payload} />
                    )}

                    {!msg.loading && msg.type === "sales" && msg.payload && (
                      <SalesWidget list={msg.payload} />
                    )}
                  </div>
                </div>
              );
            })}
            {isBotTyping && (
              <div className="flex gap-4">
                <div className="h-9 w-9 rounded-xl flex items-center justify-center bg-accent/10 border border-accent/20 text-accent-foreground">
                  <Bot className="h-4.5 w-4.5" />
                </div>
                <div className="bg-card/40 border border-border text-foreground rounded-2xl rounded-tl-sm px-4 py-3 text-sm flex items-center gap-2">
                  <span className="h-1.5 w-1.5 bg-foreground rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="h-1.5 w-1.5 bg-foreground rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="h-1.5 w-1.5 bg-foreground rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Quick-Prompt suggestions */}
          <div className="px-6 py-2 flex flex-wrap gap-2 shrink-0">
            <button
              onClick={() => processCommand("Check cert 30060064")}
              className="text-xs bg-white/5 border border-border hover:bg-white/10 rounded-full px-3 py-1.5 transition text-soft flex items-center gap-1"
            >
              <Search className="h-3 w-3" /> Cert #30060064
            </button>
            <button
              onClick={() => processCommand("Analyze RenaCrypt expected value")}
              className="text-xs bg-white/5 border border-border hover:bg-white/10 rounded-full px-3 py-1.5 transition text-soft flex items-center gap-1"
            >
              <Coins className="h-3 w-3" /> RenaCrypt EV
            </button>
            <button
              onClick={() => processCommand("Analyze OMEGA EV")}
              className="text-xs bg-white/5 border border-border hover:bg-white/10 rounded-full px-3 py-1.5 transition text-soft flex items-center gap-1"
            >
              <Coins className="h-3 w-3" /> OMEGA Pack EV
            </button>
            <button
              onClick={() => processCommand("Show recent sales")}
              className="text-xs bg-white/5 border border-border hover:bg-white/10 rounded-full px-3 py-1.5 transition text-soft flex items-center gap-1"
            >
              <History className="h-3 w-3" /> Marketplace Sales
            </button>
          </div>

          {/* Chat Input */}
          <div className="p-4 border-t border-border bg-card/10 shrink-0">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                processCommand(input);
              }}
              className="flex items-center gap-2 bg-white/5 border border-border rounded-xl p-1 focus-within:border-accent/40 transition"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask me to search, calculate or sync..."
                className="flex-1 bg-transparent px-3 py-2 text-sm focus:outline-none placeholder:text-faint"
              />
              <button
                type="submit"
                disabled={!input.trim()}
                className="h-9 w-9 grid place-items-center rounded-lg bg-accent text-accent-foreground hover:opacity-90 disabled:opacity-40 transition"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </section>

        {/* Right Side: Visual Dashboard Widgets */}
        <section className="w-full lg:w-96 overflow-y-auto p-6 space-y-6 lg:block hidden shrink-0 bg-card/5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-soft">Real-time Overview</h2>
          </div>

          {/* Pack EV Widgets */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold text-faint uppercase tracking-widest">Active Gacha Packs</h3>
            {omegaEV ? (
              <GlassCard className="p-4 flex items-center justify-between border-l-2 border-l-success">
                <div>
                  <div className="font-semibold text-sm">{omegaEV.pack_name}</div>
                  <div className="text-faint text-[10px]">Ratio: {omegaEV.ev_ratio.toFixed(2)}x</div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-sm text-success">${omegaEV.expected_value.toFixed(2)}</div>
                  <div className="text-faint text-[10px]">Cost: ${omegaEV.cost.toFixed(2)}</div>
                </div>
              </GlassCard>
            ) : (
              <div className="text-xs text-faint">Loading OMEGA Pack statistics...</div>
            )}

            {renaEV ? (
              <GlassCard className="p-4 flex items-center justify-between border-l-2 border-l-danger">
                <div>
                  <div className="font-semibold text-sm">{renaEV.pack_name}</div>
                  <div className="text-faint text-[10px]">Ratio: {renaEV.ev_ratio.toFixed(2)}x</div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-sm text-danger">${renaEV.expected_value.toFixed(2)}</div>
                  <div className="text-faint text-[10px]">Cost: ${renaEV.cost.toFixed(2)}</div>
                </div>
              </GlassCard>
            ) : (
              <div className="text-xs text-faint">Loading RenaCrypt Pack statistics...</div>
            )}
          </div>

          {/* Live Sales List */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold text-faint uppercase tracking-widest">Live Marketplace Sales</h3>
            {salesLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="h-12 bg-white/5 animate-pulse rounded-lg" />
                ))}
              </div>
            ) : recentSales.length > 0 ? (
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                {recentSales.slice(0, 5).map((sale) => (
                  <div key={sale.id} className="p-3 bg-white/5 border border-border/60 rounded-xl flex items-center justify-between gap-2 text-xs">
                    <div className="truncate">
                      <div className="font-medium text-foreground truncate">{sale.card_name}</div>
                      <div className="text-faint text-[10px] truncate">{sale.set_name || "Pack Pull"}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="font-mono text-white font-semibold">${sale.ask_price}</span>
                      <div className={`text-[9px] ${sale.price_gap < 0 ? "text-success" : "text-danger"}`}>
                        {sale.price_gap < 0 ? "" : "+"}{sale.price_gap.toFixed(0)}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-faint">No marketplace listings synchronized yet.</div>
            )}
          </div>

          <div className="p-4 bg-accent/5 border border-accent/10 rounded-2xl flex gap-3 text-xs">
            <Info className="h-4 w-4 text-accent shrink-0 mt-0.5" />
            <p className="text-soft">
              All statistical models use conformal inference with 80% calibration bands. Live feedback updates every 2 mins.
            </p>
          </div>
        </section>
      </main>
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
    <GlassCard className="mt-3 p-5 w-full bg-card/60 max-w-xl">
      <div className="flex items-center justify-between border-b border-border/80 pb-3">
        <div>
          <h4 className="font-semibold text-white text-sm">{result.card_name}</h4>
          <span className="text-faint text-[10px]">{result.set_name || "Renaiss Collectibles"}</span>
        </div>
        <span className="badge-success text-[9px] uppercase tracking-wider rounded-full px-2 py-0.5">
          {result.method === "conformal" ? "Conformal prediction" : result.method}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="bg-white/5 rounded-xl p-2 text-center">
          <div className="text-faint text-[9px] uppercase">Low Range</div>
          <div className="font-mono text-sm font-semibold mt-1">${low.toFixed(2)}</div>
        </div>
        <div className="bg-accent/10 border border-accent/20 rounded-xl p-2 text-center">
          <div className="text-accent-foreground text-[9px] uppercase">Best Estimate</div>
          <div className="font-mono text-sm font-bold text-white mt-1">${fmv.toFixed(2)}</div>
        </div>
        <div className="bg-white/5 rounded-xl p-2 text-center">
          <div className="text-faint text-[9px] uppercase">High Range</div>
          <div className="font-mono text-sm font-semibold mt-1">${high.toFixed(2)}</div>
        </div>
      </div>

      <div className="mt-5">
        <div className="relative h-2 bg-white/10 rounded-full">
          <div
            className="from-success/20 via-success/60 to-success/20 absolute inset-y-0 rounded-full bg-gradient-to-r"
            style={{ left: `${lowPct}%`, right: `${100 - highPct}%` }}
          />
          <div
            className="bg-white absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-border shadow-md"
            style={{ left: `${markerPct}%` }}
          />
        </div>
        <div className="font-mono text-faint text-[10px] mt-1.5 flex justify-between">
          <span>${rangeMin.toFixed(0)}</span>
          <span className="text-success">${low.toFixed(0)} low</span>
          <span className="text-white">${fmv.toFixed(0)} fmv</span>
          <span className="text-success">${high.toFixed(0)} high</span>
          <span>${rangeMax.toFixed(0)}</span>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between text-[11px] text-faint">
        <span className="flex items-center gap-1">
          <Info className="h-3.5 w-3.5 text-accent" /> Freshness: {result.freshness_days} days
        </span>
        <span>Grade: {result.grade || "Raw"}</span>
      </div>
    </GlassCard>
  );
}

function PackEVWidget({ data }: { data: PackEVResult }) {
  const isPositive = data.verdict === "Positive EV";
  return (
    <GlassCard className={`mt-3 p-5 w-full max-w-md ${isPositive ? "border-l-4 border-l-success" : "border-l-4 border-l-danger"}`}>
      <div className="flex items-center justify-between mb-4">
        <h4 className="font-bold text-white text-sm uppercase tracking-wider">{data.pack_name}</h4>
        <span className={`text-[9px] uppercase font-bold tracking-widest px-2.5 py-0.5 rounded-full ${isPositive ? "badge-success" : "badge-danger"}`}>
          {data.verdict}
        </span>
      </div>

      <div className="space-y-3">
        <div className="flex justify-between items-center text-xs">
          <span className="text-faint">Pack Purchase Cost</span>
          <span className="font-mono text-foreground font-semibold">${data.cost.toFixed(2)}</span>
        </div>
        <div className="flex justify-between items-center text-xs">
          <span className="text-faint">Model Calculated Expected Value</span>
          <span className="font-mono text-white font-bold">${data.expected_value.toFixed(2)}</span>
        </div>
        <div className="flex justify-between items-center text-xs border-t border-border pt-2">
          <span className="text-faint">ROI Factor Ratio</span>
          <span className={`font-mono font-bold flex items-center gap-1 ${isPositive ? "text-success" : "text-danger"}`}>
            {isPositive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            {data.ev_ratio.toFixed(2)}x
          </span>
        </div>
      </div>

      <div className="mt-3 text-[10px] text-faint text-right">
        Analysis based on {data.cards_fetched}/{data.cards_total} card price points.
      </div>
    </GlassCard>
  );
}

function SalesWidget({ list }: { list: RecentSale[] }) {
  return (
    <GlassCard className="mt-3 p-4 w-full bg-card/60 max-w-xl">
      <div className="text-xs font-bold text-white uppercase tracking-wider mb-3 flex items-center justify-between">
        <span>Analyzed Deals</span>
        <span className="text-[10px] text-faint font-normal">showing top 3</span>
      </div>
      <div className="space-y-3">
        {list.slice(0, 3).map((item) => {
          const isUnder = item.verdict === "Underpriced";
          const isOver = item.verdict === "Overpriced";
          return (
            <div key={item.id} className="p-3 bg-white/5 border border-border/80 rounded-xl flex items-center justify-between gap-3">
              <div className="truncate">
                <div className="text-xs font-semibold text-white truncate">{item.card_name}</div>
                <div className="text-[10px] text-faint truncate">{item.set_name || "Gacha"}</div>
              </div>
              <div className="text-right shrink-0 flex items-center gap-3">
                <div>
                  <div className="text-xs font-mono font-semibold">${item.ask_price}</div>
                  <div className="text-[9px] text-faint font-mono">FMV: ${item.fmv}</div>
                </div>
                <span className={`text-[9px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full ${isUnder ? "badge-success" : isOver ? "badge-danger" : "glass-panel text-soft"}`}>
                  {item.verdict}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}
