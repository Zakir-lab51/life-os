import type { NextConfig } from "next";

// `GITHUB_PAGES=1 next build` makes a static copy for https://zakir-lab51.github.io/life-os/
// (everything runs in the browser, so plain files are enough). Normal dev and builds are unchanged.
const pages = process.env.GITHUB_PAGES === "1"
const basePath = pages ? "/life-os" : ""

const nextConfig: NextConfig = {
  ...(pages ? { output: "export" as const, basePath, trailingSlash: true, images: { unoptimized: true } } : {}),
  env: { NEXT_PUBLIC_BASE_PATH: basePath, NEXT_PUBLIC_OFFLINE: pages ? "1" : "" },
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
