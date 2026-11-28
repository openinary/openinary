import type { Metadata } from "next";
import Link from "next/link";

import { FinalCta, PageHero, SiteShell, SplitHeading } from "@/components/site/shell";
import { Container, DOCS_URL, InfoTile, Sky, focusRing } from "@/components/site/ui";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Features | Openinary",
  description:
    "Everything Openinary does: image and video transformations from the URL, uploads, edge delivery, your own storage, and a dashboard. Each one links to its guide.",
  alternates: { canonical: "/features" },
};

const d = (path: string) => `${DOCS_URL}/${path}`;

type Feature = { title: string; body: string; href: string; badge?: string };
type Group = { id: string; title: string; lede: string; features: Feature[] };

const groups: Group[] = [
  {
    id: "images",
    title: "Images",
    lede: "Resize, crop, convert and touch up any image by changing its URL.",
    features: [
      { title: "Resize and crop", body: "Width, height, aspect ratio and crop modes such as fill, fit, pad and thumb, from the URL.", href: d("media-transformations/image-transformations") },
      { title: "Format and quality", body: "AVIF, WebP, PNG or JPEG, picked per browser with f_auto, and q_auto to weigh size against quality.", href: d("media-transformations/intelligent-compression") },
      { title: "Effects", body: "Blur, sharpen, brightness, contrast, saturation, grayscale, sepia, tint and more with e_.", href: d("api-reference/media/transform") },
      { title: "Overlays and watermarks", body: "Put a logo on any image or video with l_, positioned, sized, faded or tiled.", href: d("media-transformations/overlays") },
      { title: "Backgrounds and borders", body: "Pad with a color taken from the image or a blurred copy of it, and draw borders with bo_.", href: d("api-reference/media/transform") },
      { title: "Retina and flips", body: "dpr_2 serves a 2x image, a_hflip and a_vflip mirror it, a_auto follows EXIF.", href: d("api-reference/media/transform") },
      { title: "Default images", body: "Serve a placeholder with the same transformation when a file is missing.", href: d("api-reference/media/transform") },
    ],
  },
  {
    id: "video",
    title: "Video",
    lede: "Transcode, resize and thumbnail video from the same URLs, on a queue that tells you when it's done.",
    features: [
      { title: "Video transformations", body: "Resize, crop, trim and convert to MP4 or WebM. Only transcoded when a URL asks for it.", href: d("media-transformations/video-transformations") },
      { title: "Thumbnails", body: "Any frame as an image, made in about a second on first request.", href: d("media-transformations/video-transformations") },
      { title: "Ready-time estimates", body: "A 202 says which phase the job is in, how far it got and when it should be done.", href: d("api-reference/media/transform") },
      { title: "Job status", body: "Follow a job with /video-status or the queue events stream.", href: d("api-reference/video/status") },
      { title: "Workers and limits", body: "Concurrency sized from your RAM, retries and cleanup you can tune.", href: d("configuration/video-processing"), badge: "Self-hosted" },
    ],
  },
  {
    id: "uploads",
    title: "Uploads",
    lede: "Get files in from your backend, your frontend or the dashboard.",
    features: [
      { title: "Upload API", body: "Send files with an API key. Checked by their bytes, not their extension.", href: d("api-reference/files/upload") },
      { title: "Signed uploads", body: "Let a browser upload directly with a short-lived signature, no key in the bundle.", href: d("api-reference/files/upload-sign") },
      { title: "File uploader", body: "A React component and hook with drag and drop, progress and retries.", href: d("guides/file-uploader") },
      { title: "Warm the cache on upload", body: "List the transformations you need and they are made before anyone asks.", href: d("media-transformations/upload-and-prewarm"), badge: "Self-hosted" },
      { title: "Audio and 3D", body: "wav, mp3, ogg, glb and gltf stored and served as untouched originals.", href: d("api-reference/files/upload") },
      { title: "Folders", body: "Create, move, rename, copy and delete, from the API or the dashboard.", href: d("api-reference/storage/list") },
    ],
  },
  {
    id: "delivery",
    title: "Delivery",
    lede: "Serve transformed files as fast as static ones, and keep private ones private.",
    features: [
      { title: "Edge cache", body: "Every transformed file is cached, only the first request does the work.", href: d("media-transformations/overview") },
      { title: "Cache invalidation", body: "Clear one file's cached versions, or the whole cache, without touching originals.", href: d("api-reference/cache/invalidate") },
      { title: "Signed URLs", body: "Private files only open with an HMAC-signed link from your backend.", href: d("media-transformations/signed-urls"), badge: "Self-hosted" },
      { title: "Safe by default", body: "Exact content types and nosniff on every response.", href: "/security" },
    ],
  },
  {
    id: "storage",
    title: "Storage",
    lede: "Your files stay in a bucket you own, or in ours on Cloud.",
    features: [
      { title: "Any S3-compatible bucket", body: "S3, R2, MinIO, Backblaze, Wasabi, Scaleway, OVHcloud and the rest.", href: d("configuration/storage") },
      { title: "Storage prefix", body: "Serve a bucket something else already writes to, without moving an object.", href: d("configuration/storage") },
      { title: "Local disk", body: "No bucket yet? Start on disk and switch later.", href: d("configuration/storage") },
      { title: "Cloud buckets", body: "Isolated buckets per account, with keys pinned to one bucket.", href: d("cloud/overview") },
    ],
  },
  {
    id: "dashboard",
    title: "Dashboard",
    lede: "The same dashboard on Cloud and self-hosted.",
    features: [
      { title: "Media library", body: "Browse, preview, upload and organise every file, with an asset panel per file.", href: d("index") },
      { title: "Logs", body: "Every delivery logged and charted, hourly counts kept for a year.", href: d("changelog") },
      { title: "Playgrounds", body: "Try transformations on images and video before you write a URL.", href: d("changelog") },
      { title: "API keys", body: "Create, expire and revoke keys. Hashed before they are stored.", href: d("api-reference/api-keys/create") },
      { title: "Quick actions", body: "Every page, tool and setting on Cmd or Ctrl+K.", href: d("changelog") },
    ],
  },
  {
    id: "self-hosting",
    title: "Self-hosting",
    lede: "One command, one container, on the infrastructure you already run.",
    features: [
      { title: "create-openinary", body: "The CLI writes your secrets and starts Docker.", href: d("quickstart") },
      { title: "Docker images", body: "Full stack or API only, on Node.js 22.", href: d("configuration/docker-resources") },
      { title: "Coolify, Dokploy, Railway", body: "Step-by-step guides for the platforms people use most.", href: d("guides/coolify-deployment") },
      { title: "Admin from env", body: "Create the first account and an API key from environment variables.", href: d("configuration/server") },
      { title: "Telemetry you can turn off", body: "Three anonymous events, listed in full, off with one variable.", href: d("configuration/telemetry") },
    ],
  },
];

const total = groups.reduce((n, g) => n + g.features.length, 0);

export default function FeaturesPage() {
  return (
    <SiteShell>
      <PageHero
        title={
          <>
            Everything Openinary does.
            <br /> Each one in the docs.
          </>
        }
        lede="Every part of Openinary, grouped the way the docs group it. Each one links to its guide, so you can see exactly how it works before you sign up."
        location="features_hero"
        note={`${total} features, and counting.`}
      />

      <Container>
        <Sky tone="clear" className="rounded-lg px-4 py-10 md:px-16 md:py-14">
          <div className="shot-rim">
            <ul className="grid gap-px overflow-hidden rounded-[11px] bg-ink-4 sm:grid-cols-2 lg:grid-cols-4">
              {groups.map((g) => (
                <li key={g.id}>
                  <Link
                    href={`#${g.id}`}
                    className={cn("flex h-full items-center justify-between gap-3 bg-panel px-4 py-3.5 transition-colors hover:bg-rule", focusRing)}
                  >
                    <span>
                      <span className="block text-[14px] text-ink-12">{g.title}</span>
                      <span className="block text-[12px] text-ink-10">{g.features.length} features</span>
                    </span>
                    <span aria-hidden className="text-ink-10">↓</span>
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href={DOCS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn("flex h-full items-center justify-between gap-3 bg-panel px-4 py-3.5 transition-colors hover:bg-rule", focusRing)}
                >
                  <span>
                    <span className="block text-[14px] text-ink-12">Docs</span>
                    <span className="block text-[12px] text-ink-10">Read the docs</span>
                  </span>
                  <span aria-hidden className="text-ink-10">↗</span>
                </Link>
              </li>
            </ul>
          </div>
        </Sky>
      </Container>

      {groups.map((g) => (
        <Container key={g.id} id={g.id} className="pt-20 md:pt-24">
          <SplitHeading title={g.title} aside={g.lede} />
          <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {g.features.map((f) => (
              <li key={f.title}>
                <InfoTile {...f} className="h-full" />
              </li>
            ))}
          </ul>
        </Container>
      ))}

      <div className="pt-16" />
      <FinalCta location="features_cta" />
    </SiteShell>
  );
}
