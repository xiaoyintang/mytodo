import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Only the availability flag is public; the provider key stays in the route.
  env: { NEXT_PUBLIC_DICTATION_ENABLED: process.env.SILICONFLOW_API_KEY ? "1" : "0" },
};

export default nextConfig;
