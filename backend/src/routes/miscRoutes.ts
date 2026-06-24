import express from "express";
import { getSheetData } from "../services/sheetsService";

const router = express.Router();

router.get("/teams", async (_req, res) => {
  try {
    const teams = await getSheetData("Teams");
    res.json({ teams });
  } catch (err) {
    console.error("Get teams error:", err);
    res.status(500).json({ error: "Failed to fetch teams" });
  }
});

router.get("/sponsors", async (_req, res) => {
  try {
    const sponsors = await getSheetData("Sponsors");
    res.json({ sponsors });
  } catch (err) {
    console.error("Get sponsors error:", err);
    res.status(500).json({ error: "Failed to fetch sponsors" });
  }
});

export default router;
