import dns from "dns";
dns.setDefaultResultOrder("ipv4first");

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
import importRoutes from "./routes/importRoutes";
import calculationBackupRoutes from "./routes/calculationBackupRoutes";
import weeklyScoreRoutes from "./routes/weeklyScoreRoutes";
import priceAdjustmentRoutes from "./routes/priceAdjustmentRoutes";
import marketRoutes from "./routes/marketRoutes";
import reportRoutes from "./routes/reportRoutes";
import teamAdvisorRoutes from "./routes/teamAdvisorRoutes";
import playerComparisonRoutes from "./routes/playerComparisonRoutes";
import teamPlannerRoutes from "./routes/teamPlannerRoutes";
import teamOptimizerRoutes from "./routes/teamOptimizerRoutes";
import leagueRoutes from "./routes/leagueRoutes";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(helmet());

const allowedOrigins = process.env.FRONTEND_URL
  ? [process.env.FRONTEND_URL, process.env.FRONTEND_URL.replace("https://www.", "https://"), process.env.FRONTEND_URL.replace("https://", "https://www.")]
  : ["*"];

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: "5mb" }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 500, standardHeaders: true, legacyHeaders: false }));

app.get("/health", (_req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));

app.use("/", authRoutes);
app.use("/players", playerRoutes);
app.use("/", lineupRoutes);
app.use("/leaderboard", leaderboardRoutes);
app.use("/admin", adminRoutes);
app.use("/admin", importRoutes);
app.use("/admin", calculationBackupRoutes);
app.use("/admin", weeklyScoreRoutes);
app.use("/admin", priceAdjustmentRoutes);
app.use("/", marketRoutes);    // /market
app.use("/", reportRoutes);       // /reports/weekly/:weekId
app.use("/", teamAdvisorRoutes);      // /team-advisor
app.use("/", playerComparisonRoutes); // /player-comparison
app.use("/", teamPlannerRoutes);      // /team-planner/simulate
app.use("/", teamOptimizerRoutes);    // /team-optimizer
app.use("/", leagueRoutes);           // /leagues/*
app.use("/", miscRoutes);

app.use((req, res) => res.status(404).json({ error: "Route not found" }));
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => console.log(`Fantasy Hoops Liberia API running on port ${PORT}`));
