import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { appendRow, getSheetData, updateRow } from "../services/sheetsService";
import {
  normalizePhoneNumber,
  formatPhoneForSheet,
  stripApostrophe,
} from "../utils/phoneUtils";

const router = express.Router();

const registerSchema = z.object({
  full_name: z.string().min(2),
  phone: z.string().min(6, "A valid phone number is required"),
  password: z.string().min(6),
  email: z.string().email().optional().or(z.literal("")).default(""),
});

router.post("/register", async (req, res) => {
  try {
    const parsed = registerSchema.parse(req.body);

    // Normalize the incoming phone number before any lookup or storage.
    // This handles "+231881465193", "231881465193", and "0881465193" all
    // resolving to the same canonical "0881465193" form.
    const normalizedPhone = normalizePhoneNumber(parsed.phone);

    // Duplicate-check: compare normalized input against the normalized
    // stored value (stripping any apostrophe Sheets may have preserved).
    const allUsers = await getSheetData("Users");
    const existing = allUsers.find(
      (u) => normalizePhoneNumber(stripApostrophe(String(u.phone || ""))) === normalizedPhone
    );
    if (existing) {
      return res.status(409).json({ error: "An account with this phone number already exists." });
    }

    const password_hash = await bcrypt.hash(parsed.password, 10);
    const user_id = uuidv4();
    const email = (parsed.email || "").toLowerCase();

    await appendRow("Users", {
      user_id,
      full_name: parsed.full_name,
      email,
      password_hash,
      // formatPhoneForSheet() normalizes the number AND adds the leading
      // apostrophe that tells Google Sheets to store it as text, preserving
      // the leading zero. The apostrophe itself never appears in the cell.
      phone: formatPhoneForSheet(normalizedPhone),
      created_at: new Date().toISOString(),
      last_login: "",
    });

    const token = jwt.sign(
      { user_id, phone: normalizedPhone, isAdmin: false },
      process.env.JWT_SECRET as string,
      { expiresIn: (process.env.JWT_EXPIRES_IN || "7d") as any }
    );

    res.status(201).json({
      token,
      user: { user_id, full_name: parsed.full_name, phone: normalizedPhone, email },
    });
  } catch (err: any) {
    if (err.name === "ZodError") {
      return res.status(400).json({ error: "Invalid input", details: err.errors });
    }
    console.error("Register error:", err);
    res.status(500).json({ error: "Registration failed" });
  }
});

const loginSchema = z
  .object({
    email: z.string().optional(),
    phone: z.string().optional(),
    password: z.string().min(1),
  })
  .refine((data) => !!data.email || !!data.phone, {
    message: "Either phone or email is required",
  });

router.post("/login", async (req, res) => {
  try {
    const parsed = loginSchema.parse(req.body);

    // Admin login shortcut (single admin account via env vars) - still email-based,
    // unrelated to the regular phone-based user login below.
    if (
      parsed.email &&
      parsed.email.trim().toLowerCase() === (process.env.ADMIN_EMAIL || "").trim().toLowerCase() &&
      parsed.password.trim() === (process.env.ADMIN_PASSWORD || "").trim()
    ) {
      const token = jwt.sign(
        { user_id: "admin", email: parsed.email, isAdmin: true },
        process.env.JWT_SECRET as string,
        { expiresIn: (process.env.JWT_EXPIRES_IN || "7d") as any }
      );
      return res.json({
        token,
        user: { user_id: "admin", full_name: "Admin", email: parsed.email, isAdmin: true },
      });
    }

    if (!parsed.phone) {
      return res.status(401).json({ error: "Invalid phone number or password" });
    }

    // Normalize the login attempt the same way we normalized at registration,
    // so "+231881465193" and "0881465193" both find the same account.
    const normalizedLoginPhone = normalizePhoneNumber(parsed.phone);

    // Scan all users and compare normalized values, stripping any apostrophe
    // that may exist in the stored value (from the formatPhoneForSheet step
    // at registration, or from a manual sheet edit).
    const allUsers = await getSheetData("Users");
    const user = allUsers.find(
      (u) => normalizePhoneNumber(stripApostrophe(String(u.phone || ""))) === normalizedLoginPhone
    );
    if (!user) return res.status(401).json({ error: "Invalid phone number or password" });

    const valid = await bcrypt.compare(parsed.password, user.password_hash);
    if (!valid) return res.status(401).json({ error: "Invalid phone number or password" });

    await updateRow("Users", "user_id", user.user_id, {
      last_login: new Date().toISOString(),
    });

    const token = jwt.sign(
      { user_id: user.user_id, phone: normalizedLoginPhone, isAdmin: false },
      process.env.JWT_SECRET as string,
      { expiresIn: (process.env.JWT_EXPIRES_IN || "7d") as any }
    );

    res.json({
      token,
      user: {
        user_id: user.user_id,
        full_name: user.full_name,
        phone: normalizedLoginPhone,
        email: user.email,
      },
    });
  } catch (err: any) {
    if (err.name === "ZodError") {
      return res.status(400).json({ error: "Invalid input", details: err.errors });
    }
    console.error("Login error:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

router.post("/logout", (_req, res) => {
  // JWT is stateless - logout is handled client-side by deleting the token.
  res.json({ message: "Logged out" });
});

export default router;
