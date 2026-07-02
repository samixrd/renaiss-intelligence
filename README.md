# Renaiss Glass Insight — Backend API

A FastAPI backend that proxies the [Renaiss Index](https://renaiss.com) public API, persists card price history in [Turso](https://turso.tech) (libSQL), and serves conformal-prediction price intervals.

---

## Tech Stack

| Layer | Technology |
|---|---|
| API framework | [FastAPI](https://fastapi.tiangolo.com) |
| Database | [Turso](https://turso.tech) (libSQL / SQLite-compatible) |
| ML inference | scikit-learn + MAPIE (conformal prediction) |
| Deployment | [Vercel](https://vercel.com) (Python serverless) |

---

## Project Structure

```
.
├── api/
│   └── index.py          # Vercel entry point — re-exports the FastAPI app
├── app/
│   ├── main.py           # FastAPI app, routes, lifespan
│   ├── database.py       # Turso (libsql_client) data-access layer
│   ├── background_job.py # APScheduler jobs (local only)
│   ├── inference.py      # Conformal-prediction price intervals
│   ├── pack_ev.py        # Pack expected-value calculator
│   ├── renaiss_service.py# Renaiss API HTTP client
│   └── schemas.py        # Pydantic schemas
├── .env.example          # Environment variable reference (copy → .env)
├── vercel.json           # Vercel deployment configuration
└── requirements.txt      # Python dependencies
```

---

## Local Development

### 1. Clone & install dependencies

```bash
git clone https://github.com/samixrd/renaiss-intelligence.git
cd renaiss-intelligence
pip install -r requirements.txt
```

### 2. Configure environment variables

```bash
cp .env.example .env
# Edit .env and fill in your real Turso credentials
```

| Variable | Description | Where to find it |
|---|---|---|
| `TURSO_DATABASE_URL` | `libsql://…turso.io` URL | Turso dashboard → your DB → **Connect** |
| `TURSO_AUTH_TOKEN` | Read-write JWT token | Turso dashboard → your DB → **+ Create Token** |

### 3. Start the dev server

```bash
uvicorn app.main:app --reload
```

The API will be available at `http://localhost:8000`.  
Interactive docs: `http://localhost:8000/docs`

---

## Deploying to Vercel

### Prerequisites

- A [Vercel account](https://vercel.com/signup)
- [Vercel CLI](https://vercel.com/docs/cli): `npm i -g vercel`
- Your Turso database URL and auth token

### Step 1 — Add environment variables in the Vercel dashboard

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard) → your project
2. Navigate to **Settings → Environment Variables**
3. Add the following variables for **Production**, **Preview**, and **Development**:

   | Name | Value |
   |---|---|
   | `TURSO_DATABASE_URL` | `libsql://renaiss-intelligence-samixrd.aws-ap-south-1.turso.io` |
   | `TURSO_AUTH_TOKEN` | *(your token from Turso dashboard)* |

   > ⚠️ **Never** paste these into `vercel.json` — use the dashboard to keep secrets out of source control.

### Step 2 — Deploy via CLI

```bash
# First-time setup (links local project to Vercel)
vercel

# Deploy to production
vercel --prod
```

Or connect your GitHub repository for automatic deployments on every push:

1. Vercel dashboard → **Add New Project**
2. Import from GitHub → `samixrd/renaiss-intelligence`
3. Framework Preset: **Other**
4. Root Directory: `.` (leave as-is)
5. Click **Deploy**

### Step 3 — Verify

```bash
curl https://your-deployment.vercel.app/health
# → {"status":"ok"}

curl "https://your-deployment.vercel.app/search?cert=YOUR_CERT"
# → {"cert":…,"fmv":…,"low":…,"high":…}
```

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Health check (API status) |
| `GET` | `/health` | Liveness probe |
| `GET` | `/search?cert={cert}` | Look up a graded cert; returns FMV + prediction interval |
| `GET` | `/pack-ev` | Expected value for all packs |
| `GET` | `/packs` | List available packs |
| `GET` | `/recent-sales` | Last 20 marketplace listings with price-gap analysis |

Full interactive documentation is available at `/docs` (Swagger UI) and `/redoc`.

---

## Serverless Notes

Vercel runs each request as an isolated serverless function. This means:

- **APScheduler background jobs are disabled** on Vercel — the marketplace sync jobs (`sync_marketplace_listings`, `sync_marketplace_sales`, `sync_recent_pulls`) cannot run as persistent background threads.
- To keep data fresh in production, add **Vercel Cron Jobs** in `vercel.json` to hit a trigger endpoint, or run the sync jobs from a separate always-on worker.
- `init_db()` runs on every cold start — it uses `CREATE TABLE IF NOT EXISTS` so it is safe and idempotent.

---

## Database Schema

All tables are created automatically on startup in your Turso database.

| Table | Purpose |
|---|---|
| `cards` | Snapshot of each graded-card lookup |
| `price_history` | Every price observation over time (feeds conformal prediction) |
| `marketplace_sales` | Historical marketplace sale transactions |
| `marketplace_listings` | Current marketplace listings with ask-vs-FMV gap |

---

## License

MIT