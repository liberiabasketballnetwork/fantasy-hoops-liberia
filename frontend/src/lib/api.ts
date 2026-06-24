import axios from "axios";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export const api = axios.create({
  baseURL: API_BASE_URL,
});

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("fhl_token");
    if (token) {
      config.headers.set
        ? config.headers.set("Authorization", `Bearer ${token}`)
        : ((config.headers as any).Authorization = `Bearer ${token}`);
    }
  }
  return config;
});
