# Fantasy Hoops Liberia — Simple Setup & Deployment Guide

This guide assumes **no coding experience**. Follow each step in order. It will take
roughly 1–2 hours the first time. Everything used is **100% free**.

---

## What you're deploying

- **Backend** (the "engine"): handles logins, lineups, scoring — talks to Google Sheets.
- **Frontend** (the website people see): built with Next.js, mobile-friendly, installable as an app.
- **Database**: a Google Sheet (no paid database needed).
- **Hosting**: Render.com free tier for both pieces.

---

## PART 1 — Create your Google Sheet "database"

1. Go to [sheets.google.com](https://sheets.google.com) and create a new spreadsheet.
2. Rename it to: `Fantasy Hoops Database`
3. At the bottom, you'll see one tab called "Sheet1." You need to create **11 tabs** total,
   one per "table." Right-click the tab → Duplicate, or click the `+` to add new sheets.
   Rename each tab **exactly** as written below (capitalization matters):

   `Users`, `Teams`, `Players`, `Weekly_Gameweek`, `User_Lineups`, `Lineup_Players`,
   `Games`, `Player_Stats`, `Fantasy_Scoring`, `Leaderboard`, `Sponsors`, `Settings`

4. For each tab, type these column headers into **row 1**, starting at cell A1
   (one header per cell, left to right):

   **Users**: `user_id, full_name, email, password_hash, phone, created_at, last_login`

   **Teams**: `team_id, team_name, division, logo_url, created_at`

   **Players**: `player_id, full_name, team_id, position, fantasy_price, status, average_points, average_rebounds, average_assists, photo_url, created_at`

   **Weekly_Gameweek**: `week_id, start_date, end_date, submission_deadline, is_locked, created_at`

   **User_Lineups**: `lineup_id, user_id, week_id, captain_player_id, total_score, submitted_at`

   **Lineup_Players**: `lineup_id, player_id`

   **Games**: `game_id, home_team, away_team, game_date, status`

   **Player_Stats**: `stat_id, game_id, player_id, points, rebounds, assists, steals, blocks, turnovers, minutes_played`

   **Fantasy_Scoring**: `score_id, player_id, week_id, fantasy_points`

   **Leaderboard**: `leaderboard_id, week_id, user_id, score, rank`

   **Sponsors**: `sponsor_id, company_name, prize, week_id`

   **Settings**: `setting_key, setting_value`

5. Copy the long ID from your sheet's URL — it's the part between `/d/` and `/edit`:
   `https://docs.google.com/spreadsheets/d/THIS_PART_IS_YOUR_SHEET_ID/edit`
   Save this somewhere — you'll need it later as `GOOGLE_SHEET_ID`.

> **Already set up your sheet before this update?** You just need two small additions,
> no need to redo anything:
> - Add a new tab named exactly `Settings` with headers `setting_key` (cell A1) and
>   `setting_value` (cell B1). Leave the rest blank — the app creates rows automatically.
> - On your existing `Players` tab, add a new column header `photo_url` right after
>   `average_assists` (and before `created_at`, if you want to keep things in the same
>   order as new sheets — though the app reads columns by header name, not position, so
>   it'll work either way as long as the header text matches exactly).

---

## PART 2 — Create a free Google Cloud "service account" (so the app can edit your Sheet)

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create a free account
   (no credit card charges occur on the free tier used here).
2. Create a new Project (top bar → "New Project"). Name it `fantasy-hoops-liberia`.
3. In the search bar, search for **"Google Sheets API"** → click it → click **Enable**.
4. In the left menu, go to **IAM & Admin → Service Accounts → Create Service Account**.
   - Name: `fantasy-hoops-bot`
   - Click **Create and Continue** → **Done** (you can skip role assignment).
5. Click on the new service account → go to the **Keys** tab → **Add Key → Create New Key**
   → choose **JSON** → Create. A `.json` file downloads to your computer.
6. Open that JSON file with a text editor (Notepad is fine). You need two values from it:
   - `client_email` → this is your `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `private_key` → this is your `GOOGLE_PRIVATE_KEY` (long text starting with
     `-----BEGIN PRIVATE KEY-----`)
7. **Important:** Go back to your Google Sheet → click **Share** (top right) → paste in the
   `client_email` address from the JSON file → give it **Editor** access → Send/Share.
   Without this step, the app cannot read or write to your sheet.

---

## PART 3 — Put the code on GitHub

1. Create a free account at [github.com](https://github.com) if you don't have one.
2. Click **New repository**. Name it `fantasy-hoops-liberia`. Keep it Public or Private,
   your choice. Click **Create repository**.
3. On your computer, unzip the project folder you received from this build.
4. Follow GitHub's on-screen instructions under **"…or push an existing repository from
   the command line"** — this uploads all the code. (If you're not comfortable with command
   lines, GitHub Desktop app — [desktop.github.com](https://desktop.github.com) — lets you
   do this by dragging the folder in and clicking "Publish".)

---

## PART 4 — Deploy on Render.com (free hosting)

1. Create a free account at [render.com](https://render.com), and connect your GitHub account
   when prompted.
2. Click **New +** → **Blueprint**. Select your `fantasy-hoops-liberia` GitHub repo.
   Render will detect the `render.yaml` file included in this project and propose two
   services: a backend and a frontend. Click **Apply**.
3. Render will ask you to fill in some environment variables it couldn't guess. Fill these
   in for the **backend** service:

   | Variable | Value |
   |---|---|
   | `ADMIN_EMAIL` | the email you'll use to log into the admin dashboard |
   | `ADMIN_PASSWORD` | a strong password for the admin dashboard |
   | `GOOGLE_SHEET_ID` | from Part 1, step 5 |
   | `GOOGLE_SERVICE_ACCOUNT_EMAIL` | from Part 2, step 6 |
   | `GOOGLE_PRIVATE_KEY` | from Part 2, step 6 — paste the whole key, including the BEGIN/END lines |
   | `FRONTEND_URL` | leave blank for now, you'll fill this in step 5 below |

4. For the **frontend** service, fill in:

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | leave blank for now, you'll fill this in step 5 below |

5. Click **Create/Deploy**. Render will build both services (this takes 3–6 minutes).
   Once done, you'll see two live URLs, for example:
   - Backend: `https://fantasy-hoops-liberia-backend.onrender.com`
   - Frontend: `https://fantasy-hoops-liberia-frontend.onrender.com`

6. Go back into each service's **Environment** settings on Render and fill in the two
   blanks you left above:
   - Backend's `FRONTEND_URL` → paste your **frontend** URL
   - Frontend's `NEXT_PUBLIC_API_URL` → paste your **backend** URL

   Saving these will trigger both services to redeploy automatically (1–2 minutes).

---

## PART 5 — You're live! First-time setup

1. Visit your frontend URL. You should see the Fantasy Hoops Liberia landing page.
2. Go to `/admin/login` and log in with the `ADMIN_EMAIL` / `ADMIN_PASSWORD` you set in
   Part 4.
3. In the Admin Dashboard:
   - **Add Teams** (e.g. Bushrod Island Ballers, Monrovia Heat, etc.)
   - **Add Players** to each team, with their positions and average stats.
   - **Start New Week** to open the first gameweek for submissions.
4. Share your frontend URL with users so they can register and pick their lineups.
5. After real games happen, come back to the Admin Dashboard → **Input Stats** to enter
   each player's real game stats, then click **Calculate Scores** to update the leaderboard
   automatically. Click **Lock Week** before kickoff if you want to prevent late changes.

---

## Notes on staying 100% free

- Render's free web services "sleep" after 15 minutes of no traffic and take ~30–50
  seconds to wake up on the next visit. This is normal on the free tier — fine for an MVP.
- Google Sheets API free tier allows far more requests per day than a small fantasy app
  will use; the app also caches reads for 15 seconds to stay well within limits.
- No paid databases, no paid APIs, no credit card required anywhere in this setup.

## Where to go from here

- Add a "Forgot Password" email flow (currently not wired up — would need a free email
  service like Brevo's free tier).
- Add per-player photos (use small/compressed images to keep load times fast on low
  bandwidth).
- Build out the History page to show a dropdown of all past completed gameweeks.

If anything breaks, the most common cause is a typo in one of the environment variables
(especially `GOOGLE_PRIVATE_KEY`, which must include the `\n` line breaks exactly as
Google gave them) — double-check those first.
