import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

/**
 * Everything public is crawlable; member and admin areas are not.
 * The sitemap is generated from the same route list, so it can never drift.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/dashboard", "/dashboard/", "/admin", "/admin/", "/api/"],
      },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
