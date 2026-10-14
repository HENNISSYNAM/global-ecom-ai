import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/s/", disallow: ["/dashboard/", "/api/"] }],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
