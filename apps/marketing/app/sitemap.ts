import type { MetadataRoute } from "next";

import competitorsData from "@/data/competitors.json";

const base = "https://openinary.dev";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    "/",
    "/compare",
    ...Object.keys(competitorsData.competitors).map((slug) => `/compare/${slug}`),
    "/legal",
    "/terms",
    "/privacy",
  ].map((path) => ({ url: `${base}${path}` }));
}
