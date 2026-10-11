import type { MetadataRoute } from "next"

// Lets LIFE OS be installed as an app (Add to Home Screen). Paths follow the base path
// so the installed app opens at /life-os/ on GitHub Pages.
const base = process.env.NEXT_PUBLIC_BASE_PATH ?? ""

export const dynamic = "force-static"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LIFE OS",
    short_name: "LIFE OS",
    description: "A personal operating system for your day, habits, focus and progress.",
    start_url: `${base}/`,
    scope: `${base}/`,
    display: "standalone",
    background_color: "#121216",
    theme_color: "#121216",
    icons: [
      { src: `${base}/icons/icon-192.png`, sizes: "192x192", type: "image/png" },
      { src: `${base}/icons/icon-512.png`, sizes: "512x512", type: "image/png" },
      { src: `${base}/icons/icon-maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
