"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface FormData {
  email: string;
  password: string;
}

export default function AdminLoginPage() {
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
      if (!res.data.user.isAdmin) {
        setError("This account is not an admin account.");
        setLoading(false);
        return;
      }
      login(res.data.token, res.data.user);
      router.push("/admin");
    } catch (err: any) {
      setError(err?.response?.data?.error || "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto card p-6">
      <h1 className="text-2xl font-bold mb-1">Admin Login</h1>
      <p className="text-sm text-gray-400 mb-5">
        Restricted access — log in with the admin email/password set in your backend
        environment variables.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <input className="input-field" type="email" placeholder="Admin email" {...register("email", { required: true })} />
        <input className="input-field" type="password" placeholder="Admin password" {...register("password", { required: true })} />

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? "Logging in..." : "Login as Admin"}
        </button>
      </form>
    </div>
  );
}
