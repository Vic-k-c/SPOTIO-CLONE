# Church Canvass

A map-based soul-winning / door-to-door tracker: click a location on the map to
log a prospect, and it lands as a card on a Trello-style board your team can
drag through follow-up stages. Includes login with roles, a dashboard, and
PDF/CSV export.

## Stack

- **Backend:** Node.js + Express, server-rendered with EJS
- **Database:** PostgreSQL (plain SQL via `pg`, no ORM — easy to read/modify)
- **Auth:** `express-session` (stored in Postgres) + `bcryptjs` password hashing
- **Map:** Leaflet.js + OpenStreetMap tiles (free, no API key needed)
- **Board:** SortableJS for drag-and-drop
- **PDF export:** `pdfkit`

## One important scoping note

You asked for "click on roof to open popup." True rooftop/building-outline
detection needs a building-footprint data source (e.g. Microsoft/Overture
Building Footprints or Google's Open Buildings) loaded as a map layer, which
is more setup than fits a first prototype. This build instead lets you **click
anywhere on the map** to drop a pin and log a prospect — same workflow, just
without highlighting individual roof outlines yet. See "What I'd extend
first" below for how to add real building outlines.

## Run it locally

1. Install Node 18+ and a local Postgres (or use a free one from
   [Neon](https://neon.tech) or [Supabase](https://supabase.com) if you don't
   want to install Postgres locally).
2. `cd church-canvass && npm install`
3. Copy `.env.example` to `.env` and fill in `DATABASE_URL` and `SESSION_SECRET`.
4. Create the tables and seed the default board columns:
   ```
   npm run migrate
   ```
5. Start the app:
   ```
   npm start
   ```
6. Open `http://localhost:3000` — since no users exist yet, you'll land on
   **/register**, which creates your first (admin) account. Log in, then add
   the rest of your team from **Team → Add member**.
7. Go to **Map**, allow location access when your browser asks, click any
   spot on the map, fill out the popup form, and save — the prospect appears
   instantly as a card on **Board**.

## Deploy to Render

**Option A — Blueprint (fastest):**
1. Push this folder to a GitHub repo.
2. In Render, choose **New → Blueprint**, point it at the repo. Render reads
   `render.yaml` and provisions both the web service and a free Postgres
   database automatically, wiring `DATABASE_URL` and generating
   `SESSION_SECRET` for you.
3. Click **Apply**. First deploy runs `npm run migrate` automatically before
   starting the server (see `startCommand` in `render.yaml`), so the schema
   and default board columns are created for you.
4. Once live, open the URL Render gives you and go to `/register`.

**Option B — Manual:**
1. Push to GitHub.
2. In Render: **New → PostgreSQL** (free tier) → note the Internal
   Database URL.
3. **New → Web Service** → connect the repo → Build command `npm install` →
   Start command `npm run migrate && npm start`.
4. Add environment variables: `DATABASE_URL` (the Postgres Internal URL),
   `SESSION_SECRET` (any long random string), `NODE_ENV=production`.
5. Deploy.

Render's free web service spins down when idle, so the first request after a
quiet period takes a few seconds to wake up — normal for a free-tier
prototype.

## User roles

| Role | Can do |
|---|---|
| **member** | Log prospects on the map, move/edit cards on the board |
| **leader** | Everything a member can, plus delete cards and export reports |
| **admin** | Everything, plus add/remove team members |

## Data model (Postgres)

- `users` — name, email, password hash, role
- `lists` — the fixed board columns (New Prospect → Contacted → Follow-Up →
  Bible Study → Decision Made → Not Interested), seeded on first migrate
- `cards` — one row per prospect: contact info, lat/lng, notes, interest
  level (hot/warm/cold), which list it's in, who it's assigned to, who
  logged it

## What I'd extend first

1. **Real rooftop detection.** Add a building-footprint tile layer (Overture
   Maps or Microsoft Building Footprints, both free/open) as a GeoJSON layer
   in `map.js`, and snap the click handler to the nearest building polygon
   instead of the raw click coordinate. This gets you the literal
   "click-the-roof" interaction and lets you shade houses that already have
   a prospect logged.
2. **Territory assignment.** Draw polygons on the map (Leaflet.draw) to carve
   up neighborhoods and assign a territory to a person or team, so members
   only see/work their own area — this is the core of what makes Spotio
   useful for door-knocking teams.
3. **Visit history per address**, not just per prospect — track every knock
   (not home / came back later / declined) as its own timestamped event, so
   the same address can be revisited without losing prior context.
4. **Offline-first mobile support.** Canvassers are often in spotty signal —
   a service worker that queues prospect submissions locally and syncs when
   back online would matter a lot in real use.
5. **Move sessions to a proper store in high-traffic use** — already using
   `connect-pg-simple` here (Postgres-backed, so it survives restarts), but
   consider Redis if you scale past a small church team.
6. **Card comments/activity feed** so multiple people following up with the
   same prospect can see what's already been tried.
