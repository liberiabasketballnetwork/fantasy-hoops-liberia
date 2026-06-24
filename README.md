# Fantasy Hoops Liberia

A free-to-run fantasy basketball web app for Liberian basketball fans, built on a
zero-cost stack (Google Sheets as the database, Render.com free tier hosting).

**👉 If you are not a developer, start with `WALKTHROUGH.md` — it has copy/paste,
click-by-click instructions for the entire setup and deployment, with no coding
required.**

## Stack

- **Frontend**: Next.js 15+ (App Router), TypeScript, Tailwind CSS, React Hook Form, Axios
- **Backend**: Node.js, Express, TypeScript
- **Database**: Google Sheets (via the Google Sheets API, service account auth)
- **Auth**: JWT + bcrypt
- **Hosting**: Render.com free tier (see `render.yaml`)

## Project structure

```
fantasy-hoops-liberia/
├── backend/          # Express API — talks to Google Sheets
│   └── src/
│       ├── config/       # Google Sheets connection + sheet/column schema
│       ├── services/     # sheetsService.ts (DB layer), scoringEngine.ts
│       ├── middleware/   # JWT auth
│       └── routes/       # auth, players, lineup, leaderboard, admin, misc
├── frontend/         # Next.js app
│   └── src/
│       ├── app/          # all pages (App Router)
│       ├── components/   # Navbar etc.
│       ├── context/      # AuthContext
│       ├── hooks/        # useRequireAdmin
│       └── lib/          # axios api client
├── render.yaml       # One-click Render Blueprint deploy config
└── WALKTHROUGH.md    # Non-technical step-by-step setup guide
```

## Local development (for developers)

**Backend**
```bash
cd backend
cp .env.example .env   # fill in your values
npm install
npm run dev             # http://localhost:4000
```

**Frontend**
```bash
cd frontend
echo "NEXT_PUBLIC_API_URL=http://localhost:4000" > .env.local
npm install
npm run dev             # http://localhost:3000
```

## Fantasy scoring rules

| Stat | Value |
|---|---|
| Point | +1 |
| Rebound | +1.5 |
| Assist | +2 |
| Steal | +3 |
| Block | +3 |
| Turnover | -1 |
| Captain | all of the above x2 |

## API overview

See `backend/src/routes/*` for full implementations. Key endpoints:

- `POST /register`, `POST /login`, `POST /logout`
- `GET /players`, `GET /players/:id`
- `POST /submit-lineup`, `GET /my-lineup`
- `GET /leaderboard`, `GET /leaderboard/week/:weekId`
- `GET /teams`, `GET /sponsors`
- `POST /admin/create-week`, `/admin/add-player`, `/admin/input-stats`,
  `/admin/calculate-scores`, `/admin/lock-week`, `/admin/reset-week`, and more
  (all under `/admin/*`, JWT + admin-only)

## Notes

- This is an MVP build. The Profile-edit, Forgot-password email flow, and a full
  History page with a week-selector are stubbed/noted as future enhancements —
  see the end of `WALKTHROUGH.md`.
- Everything runs on free tiers only — no paid database, no paid APIs, no subscriptions.
