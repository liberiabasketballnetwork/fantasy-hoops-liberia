import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";

import authRoutes from "./routes/authRoutes";
import playerRoutes from "./routes/playerRoutes";
import lineupRoutes from "./routes/lineupRoutes";
import leaderboardRoutes from "./routes/leaderboardRoutes";
import adminRoutes from "./routes/adminRoutes";
import miscRoutes from "./routes/miscRoutes";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// ---------- Security & core middleware ----------
app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "*",
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
