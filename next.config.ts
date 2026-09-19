import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  output: "standalone",
  // Dev-only: allow browsers on the LAN / preview proxy to load dev assets + HMR websocket
  // when the app is opened via http://10.10.123.33:3000 or the z.ai preview proxy
  // (ignored in prod).
  allowedDevOrigins: [
    "10.10.123.33",
    "*.space-z.ai",
    "preview-chat-103fab11-cfb3-48de-b5f4-ca75aa36a113.space-z.ai",
  ],
  typescript: {
    // Type errors MUST block production builds — never ignore them
    ignoreBuildErrors: false,
  },
  reactStrictMode: true,
  serverExternalPackages: [
    "@prisma/client",
    "bcryptjs",
    "jose",
    "sharp",
    "exceljs",
    "better-sqlite3",
  ],
  // Security headers for a government production system.
  async headers() {
    const csp = isProd
      ? // Production CSP — no unsafe-eval (Next.js production builds don't need it)
        [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline'",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "font-src 'self' https://fonts.gstatic.com",
          "img-src 'self' data: blob:",
          "connect-src 'self'",
          "frame-ancestors 'none'",
          "form-action 'self'",
          "base-uri 'self'",
          "object-src 'none'",
        ].join("; ")
      : // Development CSP — allows unsafe-eval for Next.js hot reloading
        [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "font-src 'self' https://fonts.gstatic.com",
          "img-src 'self' data: blob:",
          "connect-src 'self'",
          "frame-ancestors 'none'",
          "form-action 'self'",
          "base-uri 'self'",
          "object-src 'none'",
        ].join("; ");

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
          { key: "Content-Security-Policy", value: csp },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()",
          },
        ],
      },
      // Serve .lottie files with correct MIME type (application/json)
      {
        source: "/dot-lottie/:path*.lottie",
        headers: [
          { key: "Content-Type", value: "application/json" },
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
