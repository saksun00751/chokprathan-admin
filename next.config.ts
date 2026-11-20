import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * Content Security Policy without nonces: nonces need fully dynamic rendering, which Partial
 * Prerendering cannot do (see the Next.js CSP guide). Scripts are limited to this origin plus the
 * inline bootstrap Next.js emits; nothing may load from or send to another origin, and the back
 * office cannot be framed.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // Same-origin images only: slips and banners come from /media, the 2-step QR is a data: URL and
  // a banner being edited is previewed from a blob: URL. (The member site also allows https: for
  // aggregator game art, which the back office never shows.)
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "media-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "manifest-src 'self'",
  "worker-src 'self' blob:",
  // No upgrade-insecure-requests: every asset is same-origin and HSTS already forces HTTPS,
  // while the directive would break a plain-HTTP staging server.
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]),
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  poweredByHeader: false,
  // A self-contained server bundle for Docker / PM2 (see README "Deploy").
  output: "standalone",
  experimental: {
    serverActions: {
      bodySizeLimit: "3mb",
      // Behind a reverse proxy on another host name, list the public origin(s) here.
      allowedOrigins: process.env.ALLOWED_ORIGINS?.split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // The whole app is the back office (pages are dynamic, Next.js already sends no-store): keep every path out of search engines.
      { source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
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
