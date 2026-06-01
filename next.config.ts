import type { NextConfig } from "next";

const SUPABASE_HOSTNAME = "mesrwnxkhbosmlupgvsc.supabase.co";

const nextConfig: NextConfig = {
  // ─── Optimización de imágenes ──────────────────────────────
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: SUPABASE_HOSTNAME,
        pathname: "/storage/v1/object/public/**",
      },
    ],
    // Servir WebP/AVIF en lugar de JPEG/PNG/HEIC cuando el browser lo soporta
    formats: ["image/avif", "image/webp"],
  },

  // ─── Headers de caché globales ─────────────────────────────
  async headers() {
    return [
      // Assets estáticos de Next.js (_next/static) — inmutables, 1 año
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      // Imágenes de Supabase Storage servidas via next/image — 1 día + stale-while-revalidate
      {
        source: "/_next/image",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=3600",
          },
        ],
      },
      // Favicon, robots.txt, etc.
      {
        source: "/(favicon.ico|robots.txt|sitemap.xml)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
