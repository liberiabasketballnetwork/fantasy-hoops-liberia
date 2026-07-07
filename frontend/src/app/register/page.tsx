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
      <h1 className="text-2xl font-bold mb-1">Create your account</h1>
      <p className="text-sm text-gray-400 mb-5">Free forever. No credit card needed.</p>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <div>
          <input className="input-field" placeholder="Full name" {...register("full_name", { required: true, minLength: 2 })} />
          {errors.full_name && <p className="text-red-400 text-xs mt-1">Full name is required</p>}
        </div>
        <div>
          <input
            className="input-field"
            placeholder="Display name"
            {...register("display_name", {
              required: true,
              maxLength: 32,
              pattern: /^[a-zA-Z0-9 _-]+$/,
            })}
          />
          <p className="text-xs text-gray-500 mt-1">
            This is the name other players will see on leaderboards and throughout the competition.
          </p>
          {errors.display_name?.type === "required" && <p className="text-red-400 text-xs mt-1">Display name is required</p>}
          {errors.display_name?.type === "maxLength" && <p className="text-red-400 text-xs mt-1">Display name must be 32 characters or fewer</p>}
          {errors.display_name?.type === "pattern" && <p className="text-red-400 text-xs mt-1">Only letters, numbers, spaces, _ and - are allowed</p>}
        </div>
        <div>
          <input className="input-field" type="tel" placeholder="Phone number" {...register("phone", { required: true, minLength: 6 })} />
          {errors.phone && <p className="text-red-400 text-xs mt-1">A valid phone number is required</p>}
        </div>
        <div>
          <input className="input-field" type="email" placeholder="Email address (optional)" {...register("email")} />
        </div>
        <div>
          <input className="input-field" type="password" placeholder="Password" {...register("password", { required: true, minLength: 6 })} />
          {errors.password && <p className="text-red-400 text-xs mt-1">Password must be at least 6 characters</p>}
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? "Creating account..." : "Register"}
        </button>
      </form>

      <p className="text-sm text-gray-400 mt-4">
        Already have an account?{" "}
        <Link href="/login" className="text-court-orange">Log in</Link>
      </p>
    </div>
  );
}
