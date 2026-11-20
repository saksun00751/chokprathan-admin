import { notFound } from "next/navigation";

/**
 * Any URL no other route matches. The proxy always rewrites to /{lang}/..., so answering with
 * notFound() here shows the site's own 404 (`../not-found.tsx`) inside the root layout, in the
 * visitor's language, instead of the framework's bare English page. Real routes always win:
 * Next.js only falls back to a catch-all when nothing more specific matches.
 */
// This page exists only to answer 404, so the development-time "instant navigation" check (which
// renders the page to measure it) has nothing to validate here.
export const instant = false;

export default function Missing() {
  notFound();
}
