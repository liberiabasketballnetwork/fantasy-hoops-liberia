import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { appendRow, getSheetData, updateRow } from "../services/sheetsService";
import { normalizePhoneNumber, formatPhoneForSheet, stripApostrophe } from "../utils/phoneUtils";
import { validateDisplayName, isDisplayNameTaken } from "../utils/displayNameUtils";
import { authenticate, AuthRequest } from "../middleware/auth";

const router = express.Router();

const registerSchema = z.object({
  full_name: z.string().min(2),
  display_name: z.string().min(1),
  phone: z.string().min(6, "A valid phone number is required"),
  password: z.string().min(6),
  email: z.string().email().optional().or(z.literal("")).default(""),
});

router.post("/register", async (req, res) => {
  try {
    const parsed = registerSchema.parse(req.body);

    // Validate display name format and reserved names.
    const dnValidation = validateDisplayName(parsed.display_name);
    if (!dnValidation.valid) {
      return res.status(400).json({ error: dnValidation.error });
    }
    const trimmedDisplayName = dnValidation.trimmed!;

    const normalizedPhone = normalizePhoneNumber(parsed.phone);
    const allUsers = await getSheetData("Users");

    // Phone uniqueness check.
    const existingPhone = allUsers.find(
      (u) => normalizePhoneNumber(stripApostrophe(String(u.phone || ""))) === normalizedPhone
    );
    if (existingPhone) {
      return res.status(409).json({ error: "An account with this phone number already exists." });
    }

    // Display name uniqueness check (case-insensitive).
    if (isDisplayNameTaken(trimmedDisplayName, allUsers)) {
      return res.status(409).json({
        error: `The display name "${trimmedDisplayName}" is already taken. Please choose a different one.`,
      });
    }

    const password_hash = await bcrypt.hash(parsed.password, 10);
    const user_id = uuidv4();
    const email = (parsed.email || "").toLowerCase();

    await appendRow("Users", {
      user_id,
      full_name: parsed.full_name,
      display_name: trimmedDisplayName,
      email,
      password_hash,
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
      user: {
        user_id,
        full_name: parsed.full_name,
        display_name: trimmedDisplayName,
        phone: normalizedPhone,
        email,
      },
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

    // Admin login shortcut.
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
        user: { user_id: "admin", full_name: "Admin", display_name: "Admin", email: parsed.email, isAdmin: true },
      });
    }

    if (!parsed.phone) {
      return res.status(401).json({ error: "Invalid phone number or password" });
    }

    const normalizedLoginPhone = normalizePhoneNumber(parsed.phone);
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

    // display_name may be blank for beta users who registered before this
    // feature — the frontend detects this and redirects to the
    // choose-display-name page before letting them continue.
    res.json({
      token,
      user: {
        user_id: user.user_id,
        full_name: user.full_name,
        display_name: user.display_name || "",
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
  res.json({ message: "Logged out" });
});

// POST /change-password — authenticated users only.
// Validates current password, enforces complexity, rejects same password.
const changePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z
    .string()
    .min(8, "New password must be at least 8 characters.")
    .max(64, "New password must be 64 characters or fewer.")
    .regex(/[A-Z]/, "New password must contain at least one uppercase letter.")
    .regex(/[a-z]/, "New password must contain at least one lowercase letter.")
    .regex(/[0-9]/, "New password must contain at least one number."),
  confirm_password: z.string().min(1),
});

router.post("/change-password", authenticate, async (req: AuthRequest, res) => {
  try {
    const parsed = changePasswordSchema.parse(req.body);

    if (parsed.new_password !== parsed.confirm_password) {
      return res.status(400).json({ error: "New password and confirmation do not match." });
    }

    const allUsers = await getSheetData("Users");
    const user = allUsers.find((u) => u.user_id === req.user!.user_id);
    if (!user) return res.status(404).json({ error: "User not found." });

    // Verify current password.
    const currentValid = await bcrypt.compare(parsed.current_password, user.password_hash);
    if (!currentValid) {
      return res.status(401).json({ error: "Current password is incorrect." });
    }

    // Reject if the new password is the same as the current one.
    const isSame = await bcrypt.compare(parsed.new_password, user.password_hash);
    if (isSame) {
      return res.status(400).json({ error: "New password must be different from your current password." });
    }

    const new_hash = await bcrypt.hash(parsed.new_password, 10);
    await updateRow("Users", "user_id", req.user!.user_id, { password_hash: new_hash });

    res.json({ message: "Password changed successfully." });
  } catch (err: any) {
    if (err.name === "ZodError") {
      // Return the first validation message cleanly.
      const first = err.errors[0];
      return res.status(400).json({ error: first?.message || "Invalid input." });
    }
    console.error("Change password error:", err);
    res.status(500).json({ error: "Failed to change password." });
  }
});

// POST /set-display-name - one-time migration flow for beta users who
// logged in before display_name existed. Also used by profile edit.
const setDisplayNameSchema = z.object({
  display_name: z.string().min(1),
});

router.post("/set-display-name", authenticate, async (req: AuthRequest, res) => {
  try {
    const { display_name } = setDisplayNameSchema.parse(req.body);

    const validation = validateDisplayName(display_name);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }
    const trimmed = validation.trimmed!;

    const allUsers = await getSheetData("Users");
    if (isDisplayNameTaken(trimmed, allUsers, req.user!.user_id)) {
      return res.status(409).json({
        error: `The display name "${trimmed}" is already taken. Please choose a different one.`,
      });
    }

    await updateRow("Users", "user_id", req.user!.user_id, { display_name: trimmed });

    res.json({ message: "Display name saved.", display_name: trimmed });
  } catch (err: any) {
    if (err.name === "ZodError") {
      return res.status(400).json({ error: "Invalid input", details: err.errors });
    }
    console.error("Set display name error:", err);
    res.status(500).json({ error: "Failed to save display name" });
  }
});

export default router;
