/**
 * API client for the Renaiss Glass Insight FastAPI backend.
 *
 * All functions talk to http://localhost:8000 and return typed
 * responses.  Errors are surfaced as rejected promises.
 */

const BASE = import.meta.env.VITE_API_BASE_URL || 
  (typeof window !== "undefined" && window.location.hostname.includes("vercel.app")
    ? "https://renaiss-glass-insight-main.vercel.app"
    : "http://localhost:8000");

/* ── Response types ──────────────────────────────────────────────── */

export interface SearchResult {
  cert: string;
  card_name: string;
  set_name: string;
  grade: string;
  fmv: number;
  low: number;
  high: number;
  confidence: number;
  /** "conformal" when ≥5 history points, "fallback" for 1-4, "hint" for 0 */
  method: "conformal" | "fallback" | "hint";
  confidence_tier: string;
  freshness_days: number;
}

export interface PackEVResult {
  pack_name: string;
  cost: number;
  expected_value: number;
  ev_ratio: number;
  verdict: "Positive EV" | "Below EV";
  cards_fetched: number;
  cards_total: number;
}

/** Shape returned by GET /recent-sales (marketplace_listings table) */
export interface RecentSale {
  id: number;
  card_name: string;
  set_name: string | null;
  year: number | null;
  grade: string | null;
  ask_price: number;
  fmv: number;
  price_gap: number;
  /** "Overpriced" | "Underpriced" | "Fair" */
  verdict: string;
  fetched_at: string | null;
}

/* ── Helpers ─────────────────────────────────────────────────────── */

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    // Try to extract the FastAPI "detail" field for a friendlier message
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      detail = body?.detail ?? body ?? detail;
    } catch {
      detail = (await res.text().catch(() => detail)) || detail;
    }
    throw new ApiError(res.status, String(detail));
  }
  return res.json() as Promise<T>;
}

/* ── Public API ──────────────────────────────────────────────────── */

export function searchByCert(cert: string): Promise<SearchResult> {
  return get<SearchResult>(`/search?cert=${encodeURIComponent(cert)}`);
}

export async function fetchPackEV(pack: string): Promise<PackEVResult> {
  const allPacks = await get<PackEVResult[]>("/pack-ev");
  const target = pack.toLowerCase().replace(/\s*pack/g, "");
  const found = allPacks.find(
    (p) => p.pack_name.toLowerCase().replace(/\s*pack/g, "") === target
  );
  if (!found) {
    throw new Error(`Pack ${pack} not found`);
  }
  return found;
}

export function fetchRecentSales(): Promise<RecentSale[]> {
  return get<RecentSale[]>("/recent-sales");
}
