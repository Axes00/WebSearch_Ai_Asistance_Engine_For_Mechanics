import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/lib/i18n.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: [
    "@xenova/transformers",
    "better-sqlite3",
    "pdf-poppler",
    "pdfjs-dist",
    "sqlite-vec",
  ],
  experimental: {
    // Large archive streaming; tune response size upward.
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default withNextIntl(nextConfig);
