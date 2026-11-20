import type { MetadataRoute } from "next";

/** The whole app is the back office: no crawler may index any of it (X-Robots-Tag in next.config.ts says the same). */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
