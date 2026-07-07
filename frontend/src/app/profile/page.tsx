"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface DisplayNameForm {
  display_name: string;
}

interface ChangePasswordForm {
  current_password: string;
  new_password: string;
  confirm_password: string;
}

export default function ProfilePage() {
  const { user, loading, login, token } = useAuth();

  // Display name edit state.
  const { register: regDN, handleSubmit: handleDN, formState: { errors: dnErrors } } = useForm<DisplayNameForm>();
  const [editingDN, setEditingDN] = useState(false);
  const [dnError, setDnError] = useState("");
  const [savingDN, setSavingDN] = useState(false);

  // Change password state.
  const { register: regPW, handleSubmit: handlePW, reset: resetPW, formState: { errors: pwErrors } } = useForm<ChangePasswordForm>();
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");
  const [savingPW, setSavingPW] = useState(false);

  if (loading) return null;

  if (!user) {
    return (
      <div className="text-center card p-8">
        <p className="mb-4">Log in to view your profile.</p>
        <Link href="/login" className="btn-primary">Log in</Link>
      </div>
    );
  }

  async function onSaveDisplayName(data: DisplayNameForm) {
    setDnError("");
    setSavingDN(true);
    try {
      const res = await api.post("/set-display-name", { display_name: data.display_name });
      if (user && token) login(token, { ...user, display_name: res.data.display_name });
      setEditingDN(false);
    } catch (err: any) {
      setDnError(err?.response?.data?.error || "Failed to save display name.");
    } finally {
      setSavingDN(false);
    }
  }

  async function onChangePassword(data: ChangePasswordForm) {
    setPwError("");
    setPwSuccess("");
    if (data.new_password !== data.confirm_password) {
      setPwError("New password and confirmation do not match.");
      return;
    }
    setSavingPW(true);
    try {
      await api.post("/change-password", {
        current_password: data.current_password,
        new_password: data.new_password,
        confirm_password: data.confirm_password,
      });
      setPwSuccess("Password changed successfully.");
      resetPW();
    } catch (err: any) {
      setPwError(err?.response?.data?.error || "Failed to change password.");
    } finally {
      setSavingPW(false);
    }
  }

  return (
    <div className="max-w-md flex flex-col gap-5">
      <div className="card p-6">
        <h1 className="text-2xl font-bold mb-4">My Profile</h1>
        <div className="flex flex-col gap-4 text-sm">
          <div>
            <p className="text-gray-400">Full name</p>
            <p className="font-bold">{user.full_name}</p>
          </div>
          <div>
            <p className="text-gray-400">Display name</p>
            {editingDN ? (
              <form onSubmit={handleDN(onSaveDisplayName)} className="flex flex-col gap-2 mt-1">
                <input
                  className="input-field"
                  defaultValue={user.display_name || ""}
                  {...regDN("display_name", { required: true, maxLength: 32, pattern: /^[a-zA-Z0-9 _-]+$/ })}
                  autoFocus
                />
                {dnErrors.display_name?.type === "required" && <p className="text-red-400 text-xs">Required</p>}
                {dnErrors.display_name?.type === "maxLength" && <p className="text-red-400 text-xs">Max 32 characters</p>}
                {dnErrors.display_name?.type === "pattern" && <p className="text-red-400 text-xs">Only letters, numbers, spaces, _ and - allowed</p>}
                {dnError && <p className="text-red-400 text-xs">{dnError}</p>}
                <div className="flex gap-2">
                  <button type="submit" disabled={savingDN} className="btn-primary text-xs">{savingDN ? "Saving..." : "Save"}</button>
                  <button type="button" onClick={() => setEditingDN(false)} className="px-3 py-1 rounded bg-[#1f2733] text-xs">Cancel</button>
                </div>
              </form>
            ) : (
              <div className="flex items-center gap-2">
                <p className="font-bold">{user.display_name || <span className="text-gray-500">Not set</span>}</p>
                <button onClick={() => setEditingDN(true)} className="text-xs text-court-orange">Edit</button>
              </div>
            )}
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
      </div>

      <div className="card p-6">
        <h2 className="font-bold mb-4">Change Password</h2>
        <form onSubmit={handlePW(onChangePassword)} className="flex flex-col gap-3">
          <div>
            <input
              type="password"
              className="input-field"
              placeholder="Current password"
              {...regPW("current_password", { required: true })}
            />
            {pwErrors.current_password && <p className="text-red-400 text-xs mt-1">Current password is required</p>}
          </div>
          <div>
            <input
              type="password"
              className="input-field"
              placeholder="New password"
              {...regPW("new_password", {
                required: true,
                minLength: 8,
                maxLength: 64,
                pattern: /^(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9]).+$/,
              })}
            />
            {pwErrors.new_password?.type === "minLength" && <p className="text-red-400 text-xs mt-1">Minimum 8 characters</p>}
            {pwErrors.new_password?.type === "maxLength" && <p className="text-red-400 text-xs mt-1">Maximum 64 characters</p>}
            {pwErrors.new_password?.type === "pattern" && <p className="text-red-400 text-xs mt-1">Must include uppercase, lowercase and a number</p>}
            <p className="text-xs text-gray-500 mt-1">Min 8 chars · uppercase · lowercase · number</p>
          </div>
          <div>
            <input
              type="password"
              className="input-field"
              placeholder="Confirm new password"
              {...regPW("confirm_password", { required: true })}
            />
            {pwErrors.confirm_password && <p className="text-red-400 text-xs mt-1">Please confirm your new password</p>}
          </div>
          {pwError && <p className="text-red-400 text-sm">{pwError}</p>}
          {pwSuccess && <p className="text-green-400 text-sm">{pwSuccess}</p>}
          <button type="submit" disabled={savingPW} className="btn-primary w-full">
            {savingPW ? "Changing..." : "Change Password"}
          </button>
        </form>
      </div>
    </div>
  );
}
