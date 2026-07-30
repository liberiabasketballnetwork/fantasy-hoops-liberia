import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { appendRow, getSheetData, updateRow } from "../services/sheetsService";
import { normalizePhoneNumber, formatPhoneForSheet, stripApostrophe, normalizeSheetPhone, isValidPhone } from "../utils/phoneUtils";
import { generateReferralCode, validateReferralCode, assignReferral, findReferrerByCode } from "../services/referralService";
import { validateDisplayName, isDisplayNameTaken } from "../utils/displayNameUtils";
import { authenticate, AuthRequest } from "../middleware/auth";

const router = express.Router();

router.post("/register", async (req, res) => {
  try {
    const parsed = z.object({
      full_name:    z.string().min(2),
      display_name: z.string().min(1),
      phone:        z.string().min(6),
      password:     z.string().min(6),
      email:        z.string().email().optional().or(z.literal("")).default(""),
      ref:          z.string().optional(),   // GEP-002.1: referral code from URL
    }).parse(req.body);

    const dnValidation = validateDisplayName(parsed.display_name);
    if (!dnValidation.valid) return res.status(400).json({ error: dnValidation.error });
    const trimmedDisplayName = dnValidation.trimmed!;

    const normalizedPhone = normalizePhoneNumber(parsed.phone);
    const allUsers = await getSheetData("Users");

    if (allUsers.find((u) => normalizeSheetPhone(String(u.phone || "")) === normalizedPhone))
      return res.status(409).json({ error: "An account with this phone number already exists." });
    if (isDisplayNameTaken(trimmedDisplayName, allUsers))
      return res.status(409).json({ error: `The display name "${trimmedDisplayName}" is already taken. Please choose a different one.` });

    // GEP-002.1: validate referral code before creating account
    const incomingRef = parsed.ref?.trim().toUpperCase() || "";
    if (incomingRef) {
      const refCheck = await findReferrerByCode(incomingRef);
      if (!refCheck) return res.status(400).json({ error: "Invalid referral code." });
    }

    const password_hash = await bcrypt.hash(parsed.password, 10);
    const user_id       = uuidv4();
    const email         = (parsed.email || "").toLowerCase();

    // GEP-002.1: generate unique referral code for new user
    const referral_code = await generateReferralCode();

    await appendRow("Users", {
      user_id,
      full_name:    parsed.full_name,
      display_name: trimmedDisplayName,
      email,
      password_hash,
      phone:        formatPhoneForSheet(normalizedPhone),
      created_at:   new Date().toISOString(),
      last_login:   "",
      referral_code,
      referred_by:  incomingRef || "",
      referral_date: incomingRef ? new Date().toISOString() : "",
    });

    // GEP-002.1: persist referral relationship if code was used
    if (incomingRef) {
      const referrer_user_id = await findReferrerByCode(incomingRef);
      if (referrer_user_id) {
        // Fire-and-forget — referral recording must never block registration
        assignReferral(referrer_user_id, user_id, incomingRef).catch((e) =>
          console.warn("[Referral] assignReferral failed:", e?.message)
        );
      }
    }

    const token = jwt.sign(
      { user_id, phone: normalizedPhone, isAdmin: false },
      process.env.JWT_SECRET as string,
      { expiresIn: process.env.JWT_EXPIRES_IN as any || "7d" }
    );

    res.status(201).json({
      token,
      user: { user_id, full_name: parsed.full_name, display_name: trimmedDisplayName, phone: normalizedPhone, email },
    });
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid input", details: err.errors });
    res.status(500).json({ error: "Registration failed" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const parsed = z.object({ email: z.string().optional(), phone: z.string().optional(), password: z.string().min(1) }).refine((d) => !!d.email || !!d.phone, { message: "Either phone or email is required" }).parse(req.body);
    if (parsed.email && parsed.email.trim().toLowerCase() === (process.env.ADMIN_EMAIL || "").trim().toLowerCase() && parsed.password.trim() === (process.env.ADMIN_PASSWORD || "").trim()) {
      const token = jwt.sign({ user_id: "admin", email: parsed.email, isAdmin: true }, process.env.JWT_SECRET as string, { expiresIn: process.env.JWT_EXPIRES_IN as any || "7d" });
      return res.json({ token, user: { user_id: "admin", full_name: "Admin", display_name: "Admin", email: parsed.email, isAdmin: true } });
    }
    const rawIdentifier = parsed.phone ?? parsed.email ?? "";
    console.log("[LOGIN]", { identifierType: rawIdentifier.includes("@") ? "email-field-phone" : "phone" });
    if (!rawIdentifier) return res.status(401).json({ error: "Invalid phone number or password" });
    const normalizedLoginPhone = normalizePhoneNumber(rawIdentifier);
    const allUsers = await getSheetData("Users");
    const user = allUsers.find((u) => normalizeSheetPhone(String(u.phone || "")) === normalizedLoginPhone);
    if (!user) return res.status(401).json({ error: "Invalid phone number or password" });
    const valid = await bcrypt.compare(parsed.password, user.password_hash);
    if (!valid) return res.status(401).json({ error: "Invalid phone number or password" });

    // FEATURE-004: check if temp password has expired
    const isTempPassword = String(user.password_temporary || "").toUpperCase() === "TRUE";
    const tempExpiry = user.temp_password_expires_at ? new Date(user.temp_password_expires_at) : null;
    const tempExpired = isTempPassword && tempExpiry && tempExpiry < new Date();
    if (tempExpired) {
      return res.status(401).json({
        error: "Your temporary password has expired. Please submit a new password reset request.",
        code:  "TEMP_PASSWORD_EXPIRED",
      });
    }

    await updateRow("Users", "user_id", user.user_id, { last_login: new Date().toISOString() });
    const token = jwt.sign({ user_id: user.user_id, phone: normalizedLoginPhone, isAdmin: false }, process.env.JWT_SECRET as string, { expiresIn: process.env.JWT_EXPIRES_IN as any || "7d" });
    res.json({
      token,
      user: { user_id: user.user_id, full_name: user.full_name, display_name: user.display_name || "", phone: normalizedLoginPhone, email: user.email },
      // FEATURE-004: signal frontend to redirect to mandatory password change
      must_change_password: isTempPassword && !tempExpired,
    });
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid input", details: err.errors });
    res.status(500).json({ error: "Login failed" });
  }
});

// FEATURE-004: set-password — clears password_temporary flag after forced change
router.post("/set-password", authenticate, async (req: AuthRequest, res) => {
  try {
    const { new_password } = req.body;
    if (!new_password || String(new_password).length < 6)
      return res.status(400).json({ error: "Password must be at least 6 characters." });

    const allUsers = await getSheetData("Users");
    const user = allUsers.find((u) => u.user_id === req.user!.user_id);
    if (!user) return res.status(404).json({ error: "User not found." });

    const password_hash = await bcrypt.hash(new_password, 10);
    await updateRow("Users", "user_id", req.user!.user_id, {
      ...user,
      password_hash,
      password_temporary:       "FALSE",
      temp_password_expires_at: "",
    });

    res.json({ message: "Password updated successfully." });
  } catch { res.status(500).json({ error: "Failed to set password." }); }
});

router.post("/logout", (_req, res) => res.json({ message: "Logged out" }));

router.post("/set-display-name", authenticate, async (req: AuthRequest, res) => {
  try {
    const { display_name } = z.object({ display_name: z.string().min(1) }).parse(req.body);
    const validation = validateDisplayName(display_name);
    if (!validation.valid) return res.status(400).json({ error: validation.error });
    const trimmed = validation.trimmed!;
    const allUsers = await getSheetData("Users");
    if (isDisplayNameTaken(trimmed, allUsers, req.user!.user_id)) return res.status(409).json({ error: `The display name "${trimmed}" is already taken. Please choose a different one.` });
    await updateRow("Users", "user_id", req.user!.user_id, { display_name: trimmed });
    res.json({ message: "Display name saved.", display_name: trimmed });
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid input", details: err.errors });
    res.status(500).json({ error: "Failed to save display name" });
  }
});

router.post("/change-password", authenticate, async (req: AuthRequest, res) => {
  try {
    const parsed = z.object({ current_password: z.string().min(1), new_password: z.string().min(8, "New password must be at least 8 characters.").max(64, "New password must be 64 characters or fewer.").regex(/[A-Z]/, "New password must contain at least one uppercase letter.").regex(/[a-z]/, "New password must contain at least one lowercase letter.").regex(/[0-9]/, "New password must contain at least one number."), confirm_password: z.string().min(1) }).parse(req.body);
    if (parsed.new_password !== parsed.confirm_password) return res.status(400).json({ error: "New password and confirmation do not match." });
    const allUsers = await getSheetData("Users");
    const user = allUsers.find((u) => u.user_id === req.user!.user_id);
    if (!user) return res.status(404).json({ error: "User not found." });
    const currentValid = await bcrypt.compare(parsed.current_password, user.password_hash);
    if (!currentValid) return res.status(401).json({ error: "Current password is incorrect." });
    const isSame = await bcrypt.compare(parsed.new_password, user.password_hash);
    if (isSame) return res.status(400).json({ error: "New password must be different from your current password." });
    const new_hash = await bcrypt.hash(parsed.new_password, 10);
    await updateRow("Users", "user_id", req.user!.user_id, { password_hash: new_hash });
    res.json({ message: "Password changed successfully." });
  } catch (err: any) {
    if (err.name === "ZodError") { const first = err.errors[0]; return res.status(400).json({ error: first?.message || "Invalid input." }); }
    res.status(500).json({ error: "Failed to change password." });
  }
});

export default router;
