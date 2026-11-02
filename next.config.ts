import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Review and Needs you became the To do page; old links (digest emails) still land there.
  async redirects() {
    return [
      { source: "/app/review", destination: "/app/todo?tab=ready", permanent: false },
      { source: "/app/needs-you", destination: "/app/todo?tab=answers", permanent: false },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
