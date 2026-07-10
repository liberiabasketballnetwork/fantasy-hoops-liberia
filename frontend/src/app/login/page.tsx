"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface FormData {
  email: string;
  password: string;
}

export default function LoginPage() {
  const { register, handleSubmit } = useForm<FormData>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { login } = useAuth();

  async function onSubmit(data: FormData) {
    setError("");
    setLoading(true);
    try {
      const res = await api.post("/login", data);
      login(res.data.token, res.data.user);
      if (res.data.user.isAdmin) {
        router.push("/admin");
      } else if (!res.data.user.display_name) {
        router.push("/choose-display-name");
      } else {
        router.push("/dashboard");
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || "Login failed. Check your credentials.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto card p-6">
      <h1 className="text-2xl font-bold mb-1">Welcome Back</h1>
      <p className="text-sm text-gray-400 mb-5">
        Sign in using the phone number you registered with.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <div>
          <label htmlFor="login-phone" className="text-xs text-gray-400 mb-1 block">
            Phone Number
          </label>
          <input
            id="login-phone"
            className="input-field"
            type="text"
            placeholder="e.g. 0771234567"
            autoComplete="username"
            aria-label="Phone number or email address"
            {...register("email", { required: true })}
          />
        </div>

        <div>
          <label htmlFor="login-password" className="text-xs text-gray-400 mb-1 block">
            Password
          </label>
          <input
            id="login-password"
            className="input-field"
            type="password"
            placeholder="Password"
            autoComplete="current-password"
            aria-label="Password"
            {...register("password", { required: true })}
          />
        </div>

        {error && <p className="text-red-400 text-sm" role="alert">{error}</p>}

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>

      {/* Login Tips — FHDS card, replaces old admin note */}
      <div className="card p-4 mt-4 border-[#2a3441]">
        <p className="text-xs font-semibold text-gray-300 mb-2">💡 Login Tips</p>
        <ul className="text-xs text-gray-400 flex flex-col gap-1.5">
          <li>• Use the phone number you registered with.</li>
          <li>• Enter it in local format (example: 0771234567).</li>
          <li>• Administrators may also sign in using their email address.</li>
        </ul>
      </div>

      <p className="text-sm text-gray-400 mt-4">
        No account yet?{" "}
        <Link href="/register" className="text-court-orange">
          Register free
        </Link>
      </p>
    </div>
  );
}
