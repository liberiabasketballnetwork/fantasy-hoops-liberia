/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        court: {
          orange: "#FF6B00",
          dark: "#0B0F14",
          panel: "#121821",
          green: "#0F9D58",
        },
      },
    },
  },
  plugins: [],
};
