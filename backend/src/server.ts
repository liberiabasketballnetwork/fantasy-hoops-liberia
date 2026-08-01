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
import achievementRoutes from "./routes/achievementRoutes";
import watchlistRoutes from "./routes/watchlistRoutes";
import notificationRoutes from "./routes/notificationRoutes";
import pushRoutes from "./routes/pushRoutes";
import communityRoutes from "./routes/communityRoutes";
import platformSettingsRoutes from "./routes/platformSettingsRoutes";
import referralRoutes from "./routes/referralRoutes";
import teamRoutes from "./routes/teamRoutes";
import referralRewardRoutes from "./routes/referralRewardRoutes";
import passwordResetRequestRoutes from "./routes/passwordResetRequestRoutes";
import platformAnalyticsRoutes from "./routes/platformAnalyticsRoutes";
import campaignRoutes from "./routes/campaignRoutes";
import retentionRoutes from "./routes/retentionRoutes";
import sponsorRoutes from "./routes/sponsorRoutes";
import prizePayoutRoutes from "./routes/prizePayoutRoutes";
import { migrateExistingUsers } from "./services/referralService";
import { migrateTeamStatuses } from "./services/playerEligibilityService";
// Bootstrap push destination (registers with engine at import time)
import "./services/pushDestinationHandler";

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
app.use("/", achievementRoutes);      // /achievements/* and /admin/achievements/*
app.use("/", watchlistRoutes);        // /watchlist/*
app.use("/", notificationRoutes);     // /notifications/*
app.use("/", pushRoutes);             // /push/*
app.use("/", communityRoutes);        // /community/*
app.use("/", platformSettingsRoutes); // /platform-settings, /admin/platform-settings
app.use("/", referralRoutes);         // /referral/*
app.use("/", teamRoutes);             // /teams, /admin/teams
app.use("/", referralRewardRoutes);        // /referral/my-rewards, /admin/referral-rewards/*
app.use("/", passwordResetRequestRoutes);  // /reset-request, /admin/reset-requests/*
app.use("/", platformAnalyticsRoutes);     // /admin/platform-analytics
app.use("/", campaignRoutes);              // /admin/campaigns/*
app.use("/", retentionRoutes);             // /admin/retention/*
app.use("/", sponsorRoutes);              // /admin/sponsors/*, /admin/weeks/:id/sponsor
app.use("/", prizePayoutRoutes);          // /admin/prize-payouts/*, /user/prizes/my-history
app.use("/", miscRoutes);

app.use((req, res) => res.status(404).json({ error: "Route not found" }));
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Fantasy Hoops Liberia API running on port ${PORT}`);
  migrateExistingUsers().catch((e) =>
    console.warn("[Referral] Migration error:", e?.message)
  );
  // FEATURE-002: ensure all teams have explicit status
  migrateTeamStatuses().catch((e) =>
    console.warn("[TeamMigration] Error:", e?.message)
  );
});
