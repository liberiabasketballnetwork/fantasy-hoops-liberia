"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface FormData {
  full_name: string;
  email: string;
  phone: string;
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
          <input className="input-field" type="email" placeholder="Email address" {...register("email", { required: true })} />
          {errors.email && <p className="text-red-400 text-xs mt-1">A valid email is required</p>}
        </div>
        <div>
          <input className="input-field" placeholder="Phone (optional)" {...register("phone")} />
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
        <Link href="/login" className="text-court-orange">
          Log in
        </Link>
      </p>
    </div>
  );
}
