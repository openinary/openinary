import {
  SolarBag,
  SolarBolt,
  SolarBook,
  SolarCode,
  SolarDashboard,
  SolarHistory,
  SolarImages,
  SolarRocket,
  SolarShield,
  SolarStorage,
  SolarTeam,
  SolarUpload,
  SolarVideo,
  type SolarIcon,
} from "@/components/site/solar";

import { DOCS_URL, GITHUB_URL } from "@/components/site/ui";

export type NavItem = {
  href: string;
  label: string;
  description: string;
  icon: SolarIcon;
};

export const productMenu: NavItem[] = [
  { href: "/features#images", label: "Images", description: "Resize, crop and convert from the URL.", icon: SolarImages },
  { href: "/features#video", label: "Video", description: "Transcode and thumbnail on request.", icon: SolarVideo },
  { href: "/features#uploads", label: "Uploads", description: "API, signed uploads, drop-in widget.", icon: SolarUpload },
  { href: "/features#delivery", label: "Delivery", description: "Cached at the edge after the first hit.", icon: SolarBolt },
  { href: "/features#storage", label: "Storage", description: "S3, R2, MinIO, the bucket you own.", icon: SolarStorage },
  { href: "/features#dashboard", label: "Dashboard", description: "Library, logs, keys and playgrounds.", icon: SolarDashboard },
];

/** Slugs match app/solutions/[slug]; the pages' content lives in solutions-data.tsx. */
export const solutionsMenu: NavItem[] = [
  { href: "/solutions/developers", label: "Developers", description: "One URL in, the right file out.", icon: SolarCode },
  { href: "/solutions/startups", label: "Startups", description: "Cloudinary features, not its bill.", icon: SolarRocket },
  { href: "/solutions/agencies", label: "Agencies", description: "One media stack for every client.", icon: SolarTeam },
  { href: "/solutions/ecommerce", label: "E-commerce", description: "Product images at every size.", icon: SolarBag },
];

export const resourcesMenu: NavItem[] = [
  { href: DOCS_URL, label: "Documentation", description: "Guides for Cloud and self-hosting.", icon: SolarBook },
  { href: "/changelog", label: "Changelog", description: "What shipped.", icon: SolarHistory },
  { href: "/security", label: "Security", description: "How your files stay yours.", icon: SolarShield },
  { href: `${DOCS_URL}/api-reference`, label: "API Reference", description: "Every endpoint, with examples.", icon: SolarCode },
];

export const footerColumns: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Product",
    links: [
      { href: "/features", label: "Features" },
      { href: "/pricing", label: "Pricing" },
      { href: "/compare", label: "Compare" },
      { href: "/changelog", label: "Changelog" },
    ],
  },
  {
    title: "Solutions",
    links: solutionsMenu.map(({ href, label }) => ({ href, label })),
  },
  {
    title: "Resources",
    links: [
      { href: DOCS_URL, label: "Docs" },
      { href: `${DOCS_URL}/migrate-from-cloudinary`, label: "Migrate from Cloudinary" },
      { href: "/security", label: "Security" },
      { href: "/open-source", label: "Open source" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: GITHUB_URL, label: "GitHub" },
      { href: "mailto:hello@openinary.dev", label: "Contact" },
      { href: "/legal", label: "Legal notice" },
      { href: "https://openalternative.co/openinary", label: "Open Alternative" },
    ],
  },
];

export const legalLinks = [
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/legal", label: "Legal" },
];
