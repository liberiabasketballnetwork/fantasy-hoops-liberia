"use client";

import { useAuth } from "@/context/AuthContext";
import Link from "next/link";

export default function ProfilePage() {
  const { user, loading } = useAuth();

  if (loading) return null;

  if (!user) {
    return (
      <div className="text-center card p-8">
        <p className="mb-4">Log in to view your profile.</p>
        <Link href="/login" className="btn-primary">
          Log in
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-md card p-6">
      <h1 className="text-2xl font-bold mb-4">My Profile</h1>
      <div className="flex flex-col gap-3 text-sm">
        <div>
          <p className="text-gray-400">Full name</p>
          <p className="font-bold">{user.full_name}</p>
        </div>
        <div>
          <p className="text-gray-400">Phone number</p>
          <p className="font-bold">{user.phone || "—"}</p>
        </div>
        {user.email && (
          <div>
            <p className="text-gray-400">Email</p>
            <p className="font-bold">{user.email}</p>
          </div>
        )}
      </div>
      <p className="text-xs text-gray-500 mt-5">
        Editing profile details (name, phone, password reset) can be wired up to{" "}
        <code>PUT /users/:id</code> as a future enhancement.
      </p>
    </div>
  );
}
