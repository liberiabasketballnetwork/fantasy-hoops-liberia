"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface FormData {
  display_name: string;
}

export default function ChooseDisplayNamePage() {
  const { user, login, token } = useAuth();
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // If already has a display name, skip this page.
  if (user?.display_name) {
    router.replace("/dashboard");
    return null;
  }

  async function onSubmit(data: FormData) {
    setError("");
    setLoading(true);
    try {
      const res = await api.post("/set-display-name", { display_name: data.display_name });
      // Persist the updated display_name into localStorage so the rest of
      // the app sees it without requiring a fresh login.
      if (user && token) {
        login(token, { ...user, display_name: res.data.display_name });
      }
      router.push("/dashboard");
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to save display name. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto card p-6 mt-8">
      <h1 className="text-2xl font-bold mb-1">Choose Your Display Name</h1>
      <p className="text-sm text-gray-400 mb-5">
        Fantasy Hoops Liberia now has public display names. Pick the name other
        players will see on leaderboards and throughout the competition.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <div>
          <input
            className="input-field"
            placeholder="Display name"
            autoFocus
            {...register("display_name", {
              required: true,
              maxLength: 32,
              pattern: /^[a-zA-Z0-9 _-]+$/,
            })}
          />
          <p className="text-xs text-gray-500 mt-1">
            Letters, numbers, spaces, _ and - only. Max 32 characters.
          </p>
          {errors.display_name?.type === "required" && <p className="text-red-400 text-xs mt-1">Display name is required</p>}
          {errors.display_name?.type === "maxLength" && <p className="text-red-400 text-xs mt-1">Display name must be 32 characters or fewer</p>}
          {errors.display_name?.type === "pattern" && <p className="text-red-400 text-xs mt-1">Only letters, numbers, spaces, _ and - are allowed</p>}
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? "Saving..." : "Save Display Name"}
        </button>
      </form>
    </div>
  );
}
