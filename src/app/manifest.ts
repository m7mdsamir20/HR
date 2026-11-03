import type { MetadataRoute } from "next";

// Makes the app installable on a phone's home screen. The name is descriptive, not a brand (there is
// no product name yet, CLAUDE.md §1). No service worker on purpose: nothing tenant-scoped is cached
// on the device, and every page needs a live, authorized session anyway.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "إدارة المهام والموارد البشرية",
    short_name: "المهام والموارد",
    description: "Task and HR management",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "ar",
    dir: "rtl",
    background_color: "#f6f7f9",
    theme_color: "#f6f7f9",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
