import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  async headers() {
    return [
      {
        source: "/video",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'self' https://github.com https://*.github.com" },
        ],
      },
      {
        source: "/studio",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'self' https://github.com https://*.github.com" },
        ],
      },
      {
        source: "/studio/video",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'self' https://github.com https://*.github.com" },
        ],
      },
      {
        source: "/",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'self' https://github.com https://*.github.com" },
        ],
      },
    ];
  },
};

export default nextConfig;
