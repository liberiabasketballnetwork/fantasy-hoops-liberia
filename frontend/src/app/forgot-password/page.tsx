"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

type State = "idle" | "loading" | "success" | "error";

export default function ForgotPasswordPage() {
  const [phone,     setPhone]     = useState("");
  const [state,     setState]     = useState<State>("idle");
  const [reference, setReference] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim()) return;
    setState("loading");
    try {
      const res = await api.post("/reset-request", { phone: phone.trim() });
      setReference(res.data.request_reference || "");
      setState("success");
    } catch {
      // On error, still show success — never reveal server issues that could aid enumeration
      setState("success");
    }
  }

  if (state === "success") {
    return (
      <div className="max-w-md mx-auto card p-8 text-center flex flex-col gap-5">
        <div className="text-5xl">✅</div>
        <div>
          <h1 className="text-xl font-bold mb-2">Request Submitted</h1>
          <p className="text-sm text-gray-400 leading-relaxed">
            Your password reset request has been sent to an administrator.
            Please allow up to 24 hours for your request to be processed.
          </p>
        </div>
        {reference && reference !== "PR-000000" && (
          <div className="bg-[#0b0f14] rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">Reference number</p>
            <p className="text-lg font-bold text-court-orange tracking-widest">{reference}</p>
            <p className="text-xs text-gray-600 mt-1">Quote this if you contact support</p>
          </div>
        )}
        <p className="text-sm text-gray-400">
          The administrator will contact you with your temporary password via WhatsApp.
        </p>
        <Link href="/login" className="btn-primary">
          Back to Login
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto card p-8 flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold mb-1">Forgot Password?</h1>
        <p className="text-sm text-gray-400">
          Enter the phone number you registered with. An administrator will
          send you a temporary password via WhatsApp.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="phone" className="text-xs text-gray-500 font-medium">
            Phone Number
          </label>
          <input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="0887519817"
            className="input-field"
            required
            disabled={state === "loading"}
            autoComplete="tel"
          />
        </div>

        <button
          type="submit"
          disabled={state === "loading" || !phone.trim()}
          className="btn-primary disabled:opacity-50"
        >
          {state === "loading" ? "Submitting…" : "Submit Request"}
        </button>
      </form>

      <div className="border-t border-[#1f2733] pt-4 text-center">
        <Link href="/login" className="text-sm text-court-orange hover:opacity-80">
          ← Back to Login
        </Link>
      </div>
    </div>
  );
}
