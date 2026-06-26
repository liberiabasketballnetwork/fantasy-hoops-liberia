"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface FormData {
  phone: string;
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
      router.push(res.data.user.isAdmin ? "/admin" : "/dashboard");
    } catch (err: any) {
      setError(err?.response?.data?.error || "Login failed. Check your credentials.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto card p-6">
      <h1 className="text-2xl font-bold mb-1">Welcome back</h1>
      <p className="text-sm text-gray-400 mb-5">Log in to manage your fantasy lineup.</p>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <input className="input-field" type="tel" placeholder="Phone number" {...register("phone", { required: true })} />
        <input className="input-field" type="password" placeholder="Password" {...register("password", { required: true })} />

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? "Logging in..." : "Login"}
        </button>
      </form>

      <p className="text-sm text-gray-400 mt-4">
        No account yet?{" "}
        <Link href="/register" className="text-court-orange">
          Register free
        </Link>
      </p>
      <p className="text-xs text-gray-500 mt-2">
        Admin? Use the <Link href="/admin/login" className="text-court-orange">admin login page</Link> instead.
      </p>
    </div>
  );
}
