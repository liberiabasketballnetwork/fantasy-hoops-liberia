"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface FormData {
  full_name: string;
  display_name: string;
  phone: string;
  email: string;
  password: string;
}

export default function RegisterPage() {
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { login } = useAuth();

  async function onSubmit(data: FormData) {
    setError("");
    setLoading(true);
    try {
      const res = await api.post("/register", data);
      login(res.data.token, res.data.user);
      router.push("/dashboard");
    } catch (err: any) {
      setError(err?.response?.data?.error || "Registration failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto card p-6">
      <h1 className="text-2xl font-bold mb-1">Create Your Account</h1>
      <p className="text-sm text-gray-400 mb-5">
        Free forever. Join Fantasy Hoops Liberia.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        {/* Full Name */}
        <div>
          <label htmlFor="reg-fullname" className="text-xs text-gray-400 mb-1 block">
            Full Name <span className="text-red-400">*</span>
          </label>
          <input
            id="reg-fullname"
            className="input-field"
            placeholder="e.g. James Kollie"
            autoComplete="name"
            aria-label="Full name"
            {...register("full_name", { required: true, minLength: 2 })}
          />
          {errors.full_name && (
            <p className="text-red-400 text-xs mt-1" role="alert">Full name is required (minimum 2 characters).</p>
          )}
        </div>

        {/* Display Name */}
        <div>
          <label htmlFor="reg-displayname" className="text-xs text-gray-400 mb-1 block">
            Display Name <span className="text-red-400">*</span>
          </label>
          <input
            id="reg-displayname"
            className="input-field"
            placeholder="e.g. HoopsKing"
            autoComplete="username"
            aria-label="Display name — shown publicly on leaderboards"
            {...register("display_name", {
              required: true,
              maxLength: 32,
              pattern: /^[a-zA-Z0-9 _-]+$/,
            })}
          />
          <p className="text-xs text-gray-500 mt-1">
            This is the name other players will see on leaderboards and throughout the competition.
          </p>
          {errors.display_name?.type === "required" && (
            <p className="text-red-400 text-xs mt-1" role="alert">Display name is required.</p>
          )}
          {errors.display_name?.type === "maxLength" && (
            <p className="text-red-400 text-xs mt-1" role="alert">Display name must be 32 characters or fewer.</p>
          )}
          {errors.display_name?.type === "pattern" && (
            <p className="text-red-400 text-xs mt-1" role="alert">Only letters, numbers, spaces, _ and - are allowed.</p>
          )}
        </div>

        {/* Phone */}
        <div>
          <label htmlFor="reg-phone" className="text-xs text-gray-400 mb-1 block">
            Phone Number <span className="text-red-400">*</span>
          </label>
          <input
            id="reg-phone"
            className="input-field"
            type="tel"
            placeholder="e.g. 0771234567"
            autoComplete="tel"
            aria-label="Phone number — used to log in"
            {...register("phone", { required: true, minLength: 6 })}
          />
          <p className="text-xs text-gray-500 mt-1">
            This is your login credential. Enter in local format (e.g. 0771234567).
          </p>
          {errors.phone && (
            <p className="text-red-400 text-xs mt-1" role="alert">A valid phone number is required.</p>
          )}
        </div>

        {/* Email — optional */}
        <div>
          <label htmlFor="reg-email" className="text-xs text-gray-400 mb-1 block">
            Email Address <span className="text-gray-600">(optional)</span>
          </label>
          <input
            id="reg-email"
            className="input-field"
            type="email"
            placeholder="email@example.com"
            autoComplete="email"
            aria-label="Email address (optional)"
            {...register("email")}
          />
        </div>

        {/* Password */}
        <div>
          <label htmlFor="reg-password" className="text-xs text-gray-400 mb-1 block">
            Password <span className="text-red-400">*</span>
          </label>
          <input
            id="reg-password"
            className="input-field"
            type="password"
            placeholder="Minimum 6 characters"
            autoComplete="new-password"
            aria-label="Password"
            {...register("password", { required: true, minLength: 6 })}
          />
          {errors.password && (
            <p className="text-red-400 text-xs mt-1" role="alert">Password must be at least 6 characters.</p>
          )}
        </div>

        {error && (
          <p className="text-red-400 text-sm" role="alert">{error}</p>
        )}

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? "Creating account..." : "Create Account"}
        </button>
      </form>

      {/* Registration tips */}
      <div className="card p-4 mt-4 border-[#2a3441]">
        <p className="text-xs font-semibold text-gray-300 mb-2">💡 Registration Tips</p>
        <ul className="text-xs text-gray-400 flex flex-col gap-1.5">
          <li>• Your phone number is used to log in — keep it handy.</li>
          <li>• Your display name is public and visible to all players.</li>
          <li>• Display names must be unique — choose something memorable.</li>
        </ul>
      </div>

      <p className="text-sm text-gray-400 mt-4">
        Already have an account?{" "}
        <Link href="/login" className="text-court-orange">Sign in</Link>
      </p>
    </div>
  );
}
