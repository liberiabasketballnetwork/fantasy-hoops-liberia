/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true, // keeps things simple/free on Render static hosting
  },
};

module.exports = nextConfig;
