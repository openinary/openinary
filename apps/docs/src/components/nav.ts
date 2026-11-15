/**
 * The marketing site's menus (apps/marketing/components/site/nav.ts), with
 * the same Solar icons by Iconify name. Links are built by `site()` and
 * `docs()` (./site.ts), so they work in production and in dev.
 */
import { docs, site } from "./site";

export type NavItem = { href: string; label: string; description: string; icon: string };

const s = (name: string) => `solar:${name}-bold-duotone`;

export const productMenu: NavItem[] = [
  { href: site("/features#images"), label: "Images", description: "Resize, crop and convert from the URL.", icon: s("gallery-wide") },
  { href: site("/features#video"), label: "Video", description: "Transcode and thumbnail on request.", icon: s("videocamera-record") },
  { href: site("/features#uploads"), label: "Uploads", description: "API, signed uploads, drop-in widget.", icon: s("upload-minimalistic") },
  { href: site("/features#delivery"), label: "Delivery", description: "Cached at the edge after the first hit.", icon: s("bolt") },
  { href: site("/features#storage"), label: "Storage", description: "S3, R2, MinIO, the bucket you own.", icon: s("server-square") },
  { href: site("/features#dashboard"), label: "Dashboard", description: "Library, logs, keys and playgrounds.", icon: s("widget-2") },
];

export const solutionsMenu: NavItem[] = [
  { href: site("/solutions/developers"), label: "Developers", description: "One URL in, the right file out.", icon: s("code-square") },
  { href: site("/solutions/startups"), label: "Startups", description: "Cloudinary features, not its bill.", icon: s("rocket-2") },
  { href: site("/solutions/agencies"), label: "Agencies", description: "One media stack for every client.", icon: s("users-group-rounded") },
  { href: site("/solutions/ecommerce"), label: "E-commerce", description: "Product images at every size.", icon: s("bag-4") },
];

export const resourcesMenu: NavItem[] = [
  { href: docs("/"), label: "Documentation", description: "Guides for Cloud and self-hosting.", icon: s("book-2") },
  { href: site("/changelog"), label: "Changelog", description: "What shipped.", icon: s("history") },
  { href: site("/security"), label: "Security", description: "How your files stay yours.", icon: s("shield-check") },
  { href: docs("/api-reference"), label: "API Reference", description: "Every endpoint, with examples.", icon: s("code-square") },
];

/** The docs' two parts, in the Resources menu: the phone row under the bar lists them too. */
export const docsMenu: NavItem[] = resourcesMenu.filter((item) => item.href.startsWith(docs("/")));
