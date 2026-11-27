import { readFileSync } from "node:fs";
import { iconName } from "./src/lib/icons";
import { defineConfig, sessionDrivers } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import nimbus, {
  defineConfig as defineNimbusConfig,
} from "@cloudflare/nimbus-docs";
import { tableScroll } from "@cloudflare/nimbus-docs/markdown";
import cloudflare from "@astrojs/cloudflare";

/** Where each collection is served, under the site's `/docs` base. */
const PREFIX = { docs: "", reference: "/api-reference" } as const;

/**
 * A sidebar link labelled like the page: its `sidebar.label`, else its title.
 * Pages of the main collection can be listed by slug alone; the API reference
 * is another collection, which takes a `{ label, link }` instead.
 */
function page(slug: string, collection: keyof typeof PREFIX) {
  if (collection === "docs") return slug;
  const file = readFileSync(new URL(`./src/content/${collection}/${slug}.mdx`, import.meta.url), "utf8");
  const fm = file.split("---")[1] ?? "";
  const label = (fm.match(/^\s+label:\s*(.+)$/m) ?? fm.match(/^title:\s*(.+)$/m))?.[1]?.replace(/^["']|["']$/g, "");
  const path = slug === "index" ? "" : `/${slug}`;
  return { label: label ?? slug, link: `${PREFIX[collection]}${path}` };
}

function group(label: string, icon: string, slugs: string[], collection: keyof typeof PREFIX = "docs") {
  return { label, icon: iconName(icon), items: slugs.map((s) => page(s, collection)) };
}

/** A site path from a page, as the full URL the Markdown versions use. */
function absolute(href: string, base: string) {
  if (!href.startsWith("/")) return href;
  const root = base.replace(/\/$/, "");
  return `https://openinary.dev${href.startsWith(`${root}/`) ? href : `${root}${href}`}`;
}

const nimbusConfig = defineNimbusConfig({
  // Pages stay prerendered; only the MCP server answers on request.
  rendering: { default: "build", collections: { reference: "build" } },
  agents: {
    mcp: true,
    // openinary.dev's root belongs to the marketing site; the docs Worker
    // only answers under /docs.
    discovery: false,
  },
  // Canonical origin: drives canonical URLs, OG images, the sitemap and llms.txt.
  site: "https://openinary.dev",
  title: "Openinary Docs",
  description: "Self-hosted image and video transformations, upload and storage. Docs for Openinary Cloud and self-hosting.",
  locale: "en",
  github: "https://github.com/openinary/openinary",
  socialImageAlt: "Openinary documentation",
  // Same groups and order as the Mintlify site: Documentation, then the API
  // reference, its own collection. The rail shows the one the page is in
  // (src/lib/section-rail.ts); the changelog lives on openinary.dev.
  sidebar: {
    items: [
      {
        label: "Documentation",
        items: [
          group("Get started", "rocket", ["index", "cloud/quickstart", "quickstart", "migrate-from-cloudinary"]),
          group("Transformations", "wand-magic-sparkles", [
            "media-transformations/overview",
            "media-transformations/image-transformations",
            "media-transformations/video-transformations",
            "media-transformations/overlays",
            "media-transformations/intelligent-compression",
            "media-transformations/upload-and-prewarm",
            "media-transformations/signed-urls",
          ]),
          group("Upload & storage", "upload", [
            "guides/file-uploader",
            "cloud/file-uploader",
            "guides/integrate/nextjs",
            "guides/integrate/react",
          ]),
          group("Cloud", "cloud", ["cloud/overview", "cloud/teams", "cloud/api"]),
          group("Self-hosting", "server", [
            "configuration/server",
            "configuration/authentication",
            "configuration/storage",
            "configuration/database",
            "configuration/video-processing",
            "configuration/docker-resources",
            "configuration/telemetry",
            "configuration/opentelemetry",
            "guides/coolify-deployment",
            "guides/dokploy-deployment",
            "guides/railway-deployment",
            "local-development",
            "security",
          ]),
          group("Resources", "toolbox", ["cloudinary-comparison", "project-structure"]),
        ],
      },
      {
        label: "API Reference",
        items: [
          group("Overview", "code", ["index"], "reference"),
          group("Media", "wand-magic-sparkles", ["media/transform", "media/authenticated-transform"], "reference"),
          group("Files", "file", [
            "files/upload",
            "files/upload-sign",
            "files/download",
            "files/download-folder",
            "files/download-zip",
            "files/create-folder",
          ], "reference"),
          group("Storage", "database", [
            "storage/list",
            "storage/folders",
            "storage/metadata",
            "storage/rename",
            "storage/move",
            "storage/copy",
            "storage/delete",
            "storage/stats",
          ], "reference"),
          group("Cache", "rotate", ["cache/invalidate"], "reference"),
          group("Video Processing", "film", [
            "video/status",
            "queue/stats",
            "queue/worker-stats",
            "queue/jobs",
            "queue/events",
          ], "reference"),
          group("API Keys", "key", ["api-keys/create", "api-keys/list", "api-keys/update", "api-keys/delete"], "reference"),
          group("System", "server", ["health"], "reference"),
        ],
      },
    ],
  },
});

export default defineConfig({
  base: "/docs",
  // nimbus:adapter
  output: "server",
  // No page uses Astro sessions; without this the adapter binds a KV namespace for them.
  session: { driver: sessionDrivers.lruCache() },
  adapter: cloudflare({ prerenderEnvironment: "node" }),
  // Tailwind v4 via its Vite plugin (the integration Astro recommends for
  // Tailwind v4 — replaces the PostCSS plugin, which doesn't build under
  // Astro 7's Vite 8 bundler).
  vite: {
    plugins: [tailwindcss()],
  },
  // Hover-prefetch link targets so full-page navigations feel instant without
  // a client-side router.
  prefetch: {
    prefetchAll: true,
    defaultStrategy: "hover",
  },
  integrations: [
    nimbus(nimbusConfig, {
      // Authoring rules are opt-in by design — your repo, your taste. The
      // two below are the load-bearing pair: frontmatter has to validate
      // against the content schema for the page to render properly, and
      // broken internal links are 404s for your readers. Add the others
      // (heading hierarchy, code-block language, style, etc.) when you're
      // ready to enforce them — see `nimbus-docs lint --help`.
      rules: {
        "nimbus/frontmatter-shape": "error",
        "nimbus/internal-link": "error",
      },
      markdown: {
        // What a Mintlify-style card becomes in the Markdown versions agents
        // read: its link, not only its title.
        componentMap: {
          Card: {
            revision: "card-v1",
            render: ({ attrs, children, base }) => {
              const title = `**${attrs.title}**`;
              const href = typeof attrs.href === "string" ? absolute(attrs.href, base) : undefined;
              return `- ${href ? `[${title}](${href})` : title}: ${children.trim()}\n`;
            },
          },
        },
        // Wrap wide tables so they scroll instead of overflowing the page
        // (styled by `.nb-table-scroll` in src/styles/prose.css).
        hastPlugins: [tableScroll()],
        // `## Install {#install}` gives a heading a fixed id. A heading that
        // ends in other `{…}` text, such as `{account_id}` in a .md file, is
        // read as attributes too; remove this to keep it as text.
        features: { headingAttributes: true },
      },
    }),
  ],
});
