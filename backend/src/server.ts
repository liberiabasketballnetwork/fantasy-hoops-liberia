import dns from "dns";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";

// Work around a known Node.js issue where outbound HTTPS requests to Google's
// APIs intermittently fail with "Premature close" when Node resolves a
// hostname to an IPv6 address the network path can't actually reach.
// Forcing IPv4-first resolution avoids it. Must run before any networked
// modules (like googleapis) make their first request.
dns.setDefaultResultOrder("ipv4first");

import authRoutes from "./routes/authRoutes";
import playerRoutes from "./routes/playerRoutes";
import lineupRoutes from "./routes/lineupRoutes";
import leaderboardRoutes from "./routes/leaderboardRoutes";
import adminRoutes from "./routes/adminRoutes";
import miscRoutes from "./routes/miscRoutes";
import importRoutes from "./routes/importRoutes";
import calculationBackupRoutes from "./routes/calculationBackupRoutes";
import weeklyScoreRoutes from "./routes/weeklyScoreRoutes";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// ---------- Security & core middleware ----------
app.use(helmet());

// Build the list of allowed origins: the configured FRONTEND_URL, its
// "www." variant (or the non-www variant if FRONTEND_URL already has www),
// and the original onrender.com URL as a fallback so the old link keeps
// working too. This avoids CORS failures when a custom domain is reachable
// both with and without "www."
function buildAllowedOrigins(): string[] {
  const configured = process.env.FRONTEND_URL;
  if (!configured) return [];

  const origins = new Set<string>([configured]);
  try {
    const url = new URL(configured);
    if (url.hostname.startsWith("www.")) {
      origins.add(configured.replace("www.", ""));
    } else {
      origins.add(configured.replace(`://${url.hostname}`, `://www.${url.hostname}`));
    }
  } catch {
    // ignore malformed FRONTEND_URL, just use it as-is
  }
  origins.add("https://fantasy-hoops-liberia-frontend.onrender.com");
  return Array.from(origins);
}

const allowedOrigins = buildAllowedOrigins();

app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : "*",
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// ---------- Health check (used by Render) ----------
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ---------- Routes ----------
app.use("/", authRoutes); // /register, /login, /logout
app.use("/players", playerRoutes); // /players, /players/:id
app.use("/", lineupRoutes); // /submit-lineup, /my-lineup
app.use("/leaderboard", leaderboardRoutes); // /leaderboard, /leaderboard/week/:id
app.use("/admin", adminRoutes); // all /admin/* routes
app.use("/admin", importRoutes); // /admin/import-stats-preview
app.use("/admin", calculationBackupRoutes); // /admin/calculation-backup/*
app.use("/admin", weeklyScoreRoutes); // /admin/calculate-weekly-scores
app.use("/", miscRoutes); // /teams, /sponsors

// ---------- 404 ----------
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// ---------- Error handler ----------
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Fantasy Hoops Liberia API running on port ${PORT}`);
});
