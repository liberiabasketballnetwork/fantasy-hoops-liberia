"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function ChangePasswordPage() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const [newPassword,     setNewPassword]     = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      // Use existing change-password endpoint, passing new password as both
      // current (they just logged in with temp) and new — backend will accept
      // because we call /set-password (new dedicated endpoint) instead
      await api.post("/set-password", { new_password: newPassword });
      router.push("/dashboard");
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to set password. Try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!user) {
    router.push("/login");
    return null;
  }

  return (
    <div className="max-w-md mx-auto card p-8 flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold mb-1">🔐 Set New Password</h1>
        <p className="text-sm text-gray-400">
          You logged in with a temporary password. Please set a new permanent password to continue.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="new-password" className="text-xs text-gray-500 font-medium">
            New Password
          </label>
          <input
            id="new-password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Minimum 6 characters"
            className="input-field"
            required
            minLength={6}
            disabled={loading}
            autoComplete="new-password"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="confirm-password" className="text-xs text-gray-500 font-medium">
            Confirm Password
          </label>
          <input
            id="confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Repeat your new password"
            className="input-field"
            required
            disabled={loading}
            autoComplete="new-password"
          />
        </div>

        {error && (
          <p className="text-sm text-red-400" role="alert">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading || !newPassword || !confirmPassword}
          className="btn-primary disabled:opacity-50"
        >
          {loading ? "Saving…" : "Set New Password"}
        </button>
      </form>

      <button
        onClick={logout}
        className="text-xs text-gray-500 hover:text-gray-300 text-center"
      >
        Sign out
      </button>
    </div>
  );
}
