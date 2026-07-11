import express from "express";
import { authenticate, AuthRequest } from "../middleware/auth";
import {
  getWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  getWatchedPlayerIds,
} from "../services/watchlistService";

const router = express.Router();

/** GET /watchlist — enriched watched players with insights */
router.get("/watchlist", authenticate, async (req: AuthRequest, res) => {
  try {
    const players = await getWatchlist(req.user!.user_id);
    res.json({ players });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to fetch watchlist." });
  }
});

/** GET /watchlist/ids — lightweight list of watched player_ids (for toggle state) */
router.get("/watchlist/ids", authenticate, async (req: AuthRequest, res) => {
  try {
    const ids = await getWatchedPlayerIds(req.user!.user_id);
    res.json({ ids });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to fetch watchlist IDs." });
  }
});

/** POST /watchlist — add a player */
router.post("/watchlist", authenticate, async (req: AuthRequest, res) => {
  try {
    const { player_id } = req.body;
    if (!player_id) return res.status(400).json({ error: "player_id is required." });
    await addToWatchlist(req.user!.user_id, player_id);
    res.status(201).json({ message: "Player added to watchlist." });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to add to watchlist." });
  }
});

/** DELETE /watchlist/:playerId — remove a player */
router.delete("/watchlist/:playerId", authenticate, async (req: AuthRequest, res) => {
  try {
    await removeFromWatchlist(req.user!.user_id, req.params.playerId);
    res.json({ message: "Player removed from watchlist." });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to remove from watchlist." });
  }
});

export default router;
