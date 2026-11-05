# DSSSB TGT CS Rank Predictor – Live Leaderboard & Cutoff Predictor

A full-stack, production-ready web application for the **DSSSB TGT Computer Science (Post Code 55/25)** examination. Built with **React + Vite + TypeScript**, **Tailwind CSS**, **Recharts**, and a **Cloudflare Workers + D1 (SQLite)** database architecture.

---

## Core Capabilities

1. **Smart Automatic Answer-Key Discovery (18 Shifts)**
   - Every shift paper is uniquely identified by `exam_id + exam_date + shift_number + paper_code + paper_variant`.
   - **1st Valid Submission** in a shift automatically extracts all 200 question IDs and official answers, validates completeness/duplicates/options, and stores `v1` as `pending_verification`.
   - **Subsequent Submissions** in the same shift cross-verify the discovered key (`confirmed_pending_key` -> `published`) and reuse the cached key to score the new candidate's individual responses instantaneously.
   - **Conflict Detection**: If a subsequent response sheet contains conflicting official answers, the shift key is automatically flagged as `conflict` with question-level diff details for administrator audit.
   - **Versioned Revisions & Recalculation**: Administrators can revise any question's answer (or mark it as `DROP`) to publish a new key version (`v2`, `v3`, etc.), marking prior versions `superseded` and automatically recalculating all affected candidate submissions.

2. **Response-Sheet URL & HTML/PDF Upload Processing**
   - Server-side URL allowlisting (`cdn.digialm.com`, `digialm.com`, `dsssb.delhi.gov.in`, `dsssbonline.nic.in`) and SSRF protection (blocking private IPs, loopback, link-local, and embedded credentials).
   - Automatic detection of session-protected DSSSB URLs with a seamless fallback to direct HTML/PDF/Text file upload so candidates never share their DSSSB passwords or cookies.

3. **Configurable Server-Side Scoring Engine**
   - Supports configurable positive marks (`+1.00`), negative marking (`-0.25`), unattempted marks (`0.00`), dropped question treatment (`bonus_to_all`, `bonus_if_attempted`, `exclude_from_total`), and multiple correct options.
   - Computes Section A (General Aptitude: 100 Qs) and Section B (Computer Science Domain: 100 Qs) sub-scores and net accuracy.

4. **SQL `DENSE_RANK()` Live Leaderboards & Cutoff Predictor**
   - Overall Combined Leaderboard, Category-Wise Leaderboards (`General`, `OBC`, `EWS`, `SC`, `ST`, `Other`), and Individual Shift Leaderboards (`Shifts 1–18`).
   - Equal scores receive the exact same rank via `DENSE_RANK() OVER (ORDER BY score DESC)`.
   - Sample-based Category Cutoff Predictor using P50, P75, P85, P90 percentiles and statutory DSSSB minimum qualifying criteria.

---

## Local Development & Automated Testing

```bash
# 1. Install dependencies
npm install

# 2. Run the 15-point automated test suite (Vitest)
npm test

# 3. Start the full-stack server on http://localhost:3000
npm run dev
```

Default Administrator Console credentials (configurable via `.env`):
- **Username**: `admin`
- **Password**: `dsssb-admin-2026`

---

## Cloudflare Workers + D1 Production Deployment

1. **Create the Cloudflare D1 Database**
   ```bash
   npx wrangler d1 create dsssb-tgt-cs-db
   ```
   Copy the returned `database_id` into `wrangler.toml`.

2. **Apply D1 SQL Migrations**
   ```bash
   # Local D1 verification
   npm run cf:d1:migrate:local

   # Production remote D1 database
   npm run cf:d1:migrate:remote
   ```

3. **Configure Production Secrets**
   ```bash
   npx wrangler secret put ADMIN_SESSION_SECRET
   npx wrangler secret put TURNSTILE_SECRET_KEY
   ```

4. **Build & Deploy to Cloudflare Workers**
   ```bash
   npm run cf:deploy
   ```
