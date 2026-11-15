import {
  ApiKeysMock,
  CodeAndResponseMock,
  CostMock,
  FormatsMock,
  LogsMock,
  ProductSizesMock,
  StorageMock,
  TransformMock,
  UploadMock,
  VideoJobsMock,
  createLines,
} from "@/components/site/mocks";
import { DOCS_URL, GITHUB_URL, type SkyTone } from "@/components/site/ui";
import { cloudinaryCost, openinaryCloudCost, usageForPlan } from "@/lib/pricing";

/**
 * Content for /solutions/[slug]. One template, four audiences: a hero shot,
 * four feature tiles, the "under the hood" block and six spec tiles, the same
 * order as the reference's solution pages.
 */

export type Solution = {
  slug: string;
  metaTitle: string;
  metaDescription: string;
  title: React.ReactNode;
  lede: string;
  hero: React.ReactNode;
  heroTone: SkyTone;
  section: { title: string; muted: string };
  cards: {
    tone: SkyTone;
    shot: React.ReactNode;
    title: string;
    muted: string;
    body: string;
    checks: string[];
  }[];
  hood: {
    title: string;
    muted: string;
    body: string;
    links: { href: string; label: string }[];
    terminal: { title?: string; lines: string[] };
  };
  specs: { title: string; body: string }[];
  cta: { title: string; body: string };
};

const usd = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;
const plusUsage = usageForPlan("plus");
const plusRival = cloudinaryCost(plusUsage);
const plusOurs = openinaryCloudCost(plusUsage);

const curlLines = [
  '$ curl -sI "https://media.acme.shop/t/w_800,f_auto/products/lamp.jpg" \\',
  '    -H "Accept: image/avif,image/webp,*/*"',
  "",
  "HTTP/2 200",
  "content-type: image/avif",
  "content-length: 38912",
  "cache-control: public, max-age=31536000, must-revalidate",
  "x-content-type-options: nosniff",
];

export const solutions: Solution[] = [
  {
    slug: "developers",
    metaTitle: "Openinary for developers",
    metaDescription:
      "Uploads, image and video transformations and edge delivery behind one API and one URL format. Open source, self-hosted or on Cloud.",
    title: "Change the URL. Get the file.",
    lede: "Uploads, transformations and delivery behind one API and one URL format. Less time wiring image pipelines, more time on the thing you're building.",
    heroTone: "clear",
    hero: (
      <CodeAndResponseMock
        file="components/avatar.tsx"
        code={[
          'const cdn = "https://media.acme.dev/t";',
          "",
          "export function Avatar({ user }) {",
          "  return (",
          "    <img",
          "      src={`${cdn}/w_160,h_160,c_fill,g_face,r_max/${user.photo}`}",
          "      width={80}",
          "      height={80}",
          "      alt={user.name}",
          "    />",
          "  );",
          "}",
        ]}
        title="GET /t/w_160,h_160,c_fill,…/ana.jpg"
        rows={[
          ["resize", "160 × 160, cropped on the face"],
          ["round", "r_max, a circle"],
          ["format", "image/avif for this browser"],
          ["weight", "6.1 KB, from 412 KB"],
          ["cache", "HIT on the next request"],
        ]}
      />
    ),
    section: { title: "From one upload to every size.", muted: "Then it serves itself." },
    cards: [
      {
        tone: "clear",
        shot: <UploadMock />,
        title: "Upload from anywhere.",
        muted: "Backend, browser or dashboard.",
        body: "Send files with an API key from your server, or let the browser upload straight to Openinary with a short-lived signature.",
        checks: ["Checked by their bytes, not their extension", "A React uploader and hook, ready to drop in", "Folders, moves and renames over the API"],
      },
      {
        tone: "haze",
        shot: <TransformMock />,
        title: "Ask for the size in the URL.",
        muted: "No resize job to write.",
        body: "Width, crop, gravity, format and quality are parameters. The first request makes the file, every one after is a cache hit.",
        checks: ["Crop on faces with g_face", "f_auto and q_auto pick format and weight", "Overlays, effects and borders"],
      },
      {
        tone: "ocean",
        shot: <VideoJobsMock />,
        title: "Video on the same URLs.",
        muted: "With an honest wait.",
        body: "A video that isn't ready yet answers 202 with its phase, progress and an estimate. Honour Retry-After and you ask again at the right time.",
        checks: ["Trim with so_ and eo_", "MP4 and WebM output", "Thumbnails from any frame"],
      },
      {
        tone: "dusk",
        shot: <LogsMock />,
        title: "See what you served.",
        muted: "Every delivery, logged.",
        body: "Deliveries are logged and charted by the hour, with recent video jobs alongside, so a broken image is a search away.",
        checks: ["Hourly counts kept for a year", "Failure rate at a glance", "The latest 500 deliveries in full"],
      },
    ],
    hood: {
      title: "Under the hood.",
      muted: "One container.",
      body: "A Hono API on Node.js, libvips through sharp for images, FFmpeg for video and SQLite for auth and jobs. Point it at a bucket and it runs.",
      links: [
        { href: `${DOCS_URL}/project-structure`, label: "How the project is laid out" },
        { href: GITHUB_URL, label: "Read the source" },
      ],
      terminal: { lines: createLines },
    },
    specs: [
      { title: "Images", body: "libvips through sharp. JPEG, PNG, WebP and AVIF in and out." },
      { title: "Video", body: "FFmpeg on a queue, workers sized from your RAM." },
      { title: "Storage", body: "Any S3-compatible bucket, or local disk to start." },
      { title: "Auth", body: "Better Auth sessions for the dashboard, hashed API keys for code." },
      { title: "Cache", body: "Each version cached after its first request, purged over the API." },
      { title: "Licence", body: "AGPL-3.0. The engine, the dashboard and Cloud, all on GitHub." },
    ],
    cta: { title: "Ship the image, not the pipeline.", body: "Free plan, no card required, or one command to run it yourself." },
  },
  {
    slug: "startups",
    metaTitle: "Openinary for startups",
    metaDescription:
      "Image and video transformations and delivery that cost what you use. A free plan, usage pricing past it, and an open-source engine you can take in-house.",
    title: (
      <>
        Cloudinary&apos;s features.
        <br /> Not Cloudinary&apos;s bill.
      </>
    ),
    lede: "Transformations, video and delivery that cost what you use, on an engine you can take in-house the day it makes sense.",
    heroTone: "dawn",
    hero: (
      <CostMock
        rival={{ name: "Cloudinary", plan: `${plusRival.planName} plan`, usd: usd(plusRival.monthlyUsd) }}
        ours={{ name: "Openinary Cloud", plan: plusOurs.planName ?? "Cloud", usd: usd(plusOurs.monthlyUsd) }}
        usage={[
          `${plusUsage.storageGb} GB stored`,
          `${plusUsage.transformations.toLocaleString("en-US")} transformations`,
          `${plusUsage.videoMinutes} video minutes`,
          `${plusUsage.cdnRequests.toLocaleString("en-US")} CDN requests`,
        ]}
      />
    ),
    section: { title: "Start free.", muted: "Stay when it grows." },
    cards: [
      {
        tone: "clear",
        shot: <UploadMock />,
        title: "No card to start.",
        muted: "A real free plan.",
        body: "Create an account, make an API key and upload. The free plan has storage, transformations, video and CDN requests every month.",
        checks: ["Signed browser uploads, no key in the bundle", "A React uploader to drop in", "Same dashboard as self-hosted"],
      },
      {
        tone: "haze",
        shot: <LogsMock />,
        title: "Pay for usage.",
        muted: "Not for seats.",
        body: "Past the allowance, the Cloud plan bills what you actually served. Cached deliveries never count as transformations.",
        checks: ["Live usage in Settings", "No per-seat or per-site pricing", "Video metered on encode time"],
      },
      {
        tone: "ocean",
        shot: <TransformMock />,
        title: "Bring your Cloudinary URLs.",
        muted: "Most translate one to one.",
        body: "The transformation syntax is close to Cloudinary's, so moving is mostly a change of host. The migration guide covers files, uploads and URLs.",
        checks: ["w_, h_, c_, g_, q_auto, f_auto", "Overlays and effects", "Five-step migration guide"],
      },
      {
        tone: "dusk",
        shot: <StorageMock />,
        title: "Take it in-house later.",
        muted: "Same engine.",
        body: "When owning the infrastructure is cheaper than renting it, run the same open-source engine on your own servers and bucket.",
        checks: ["AGPL-3.0, nothing held back", "Docker, Coolify, Dokploy or Railway", "Your bucket, your bill"],
      },
    ],
    hood: {
      title: "When you outgrow us,",
      muted: "keep the engine.",
      body: "Cloud and self-hosted run the same code. Moving in-house is a container and a bucket, not a rewrite of every image URL in your app.",
      links: [
        { href: `${DOCS_URL}/migrate-from-cloudinary`, label: "Migrate from Cloudinary" },
        { href: "/pricing#calculator", label: "Compare your costs" },
      ],
      terminal: { lines: createLines },
    },
    specs: [
      { title: "Free plan", body: "Storage, transformations, video and CDN every month, no card." },
      { title: "Cloud plan", body: "Twice the allowance, then usage at published rates." },
      { title: "No seats", body: "Priced by usage, never per user or per site." },
      { title: "Migration", body: "A guide for files, uploads and URLs, in five steps." },
      { title: "Open source", body: "Read every line before you depend on it." },
      { title: "Support", body: "Answers on GitHub from the people who build it." },
    ],
    cta: { title: "Put the savings back into the product.", body: "Free plan, no card required. See your own numbers on the pricing page." },
  },
  {
    slug: "agencies",
    metaTitle: "Openinary for agencies",
    metaDescription:
      "Run Openinary per client on the bucket each client owns: the same URLs, the same dashboard, nothing to license per site.",
    title: "One media stack for every client.",
    lede: "Run an Openinary per client on the bucket that client owns. Same URLs, same dashboard, and nothing to license per site.",
    heroTone: "haze",
    hero: <StorageMock className="mx-auto max-w-[620px]" />,
    section: { title: "Every client separate.", muted: "Every project the same." },
    cards: [
      {
        tone: "clear",
        shot: <StorageMock />,
        title: "Their bucket.",
        muted: "Their files.",
        body: "Point each instance at the client's own S3-compatible bucket. Their media never sits in your account, so offboarding moves nothing.",
        checks: ["S3, R2, MinIO and the rest", "A prefix per site if they share one", "Local disk for prototypes"],
      },
      {
        tone: "ocean",
        shot: <ApiKeysMock />,
        title: "A key per site.",
        muted: "Revoke one, keep the rest.",
        body: "Give each site, environment and CI job its own key with an expiry. A leaked key is one click, not a rotation across every project.",
        checks: ["Hashed before they are stored", "Expiry set at creation", "Disable a key without deleting it"],
      },
      {
        tone: "haze",
        shot: <UploadMock />,
        title: "An uploader for editors.",
        muted: "No FTP, no tickets.",
        body: "Drop the React uploader into the client's admin and they manage their own images, with progress, retries and previews.",
        checks: ["Drag and drop, batches of any size", "Signed uploads straight from the browser", "Images, video, audio and 3D"],
      },
      {
        tone: "dusk",
        shot: <LogsMock />,
        title: "Proof of delivery.",
        muted: "For the monthly report.",
        body: "Deliveries, cache hits and failures are logged and charted, so you can show a client what their media did this month.",
        checks: ["Hourly counts for a year", "Failure rate per instance", "Recent video jobs"],
      },
    ],
    hood: {
      title: "Hand it over.",
      muted: "Or keep running it.",
      body: "It's AGPL software on the client's own infrastructure, so handing a project over means handing over a container and a bucket, not a vendor account.",
      links: [
        { href: `${DOCS_URL}/guides/coolify-deployment`, label: "Deploy on Coolify" },
        { href: `${DOCS_URL}/guides/dokploy-deployment`, label: "Deploy on Dokploy" },
      ],
      terminal: { lines: createLines },
    },
    specs: [
      { title: "Per-client instances", body: "One container each, isolated by design." },
      { title: "Per-client buckets", body: "Files stay in the client's own storage." },
      { title: "Same URLs everywhere", body: "One transformation syntax across every project." },
      { title: "Admin from env", body: "Provision the first account and key at boot." },
      { title: "No licence per site", body: "AGPL-3.0, free to run as many as you need." },
      { title: "Cloud when it's simpler", body: "Isolated buckets per account, keys pinned to one." },
    ],
    cta: { title: "One stack, every client.", body: "Start a client on Cloud for free, or run your first instance in one command." },
  },
  {
    slug: "ecommerce",
    metaTitle: "Openinary for e-commerce",
    metaDescription:
      "One upload per product photo. Thumbnails, zoom views and retina sizes come from the URL, in the lightest format each browser accepts.",
    title: "Every product photo, at every size.",
    lede: "One upload per photo. Grid, zoom, cart and retina sizes come from the URL, in the lightest format each browser accepts.",
    heroTone: "dawn",
    hero: <ProductSizesMock className="mx-auto max-w-[720px]" />,
    section: { title: "Lighter pages.", muted: "Same photos." },
    cards: [
      {
        tone: "clear",
        shot: <FormatsMock />,
        title: "The lightest format.",
        muted: "Per browser, one URL.",
        body: "f_auto serves AVIF where it's supported, WebP where it isn't, and the original type to everything else. The URL in your template never changes.",
        checks: ["Exact content type on every response", "q_auto weighs size against quality", "dpr_2 for retina screens"],
      },
      {
        tone: "haze",
        shot: <TransformMock />,
        title: "Square, padded, on brand.",
        muted: "Whatever the shot.",
        body: "Pad a portrait shot into a square grid with a background taken from the photo itself, or a blurred copy of it, instead of cropping the product.",
        checks: ["c_pad with b_auto or b_blurred", "Borders and corners", "A placeholder when a photo is missing"],
      },
      {
        tone: "ocean",
        shot: <UploadMock />,
        title: "Catalogue uploads that finish.",
        muted: "Hundreds at a time.",
        body: "Large selections go up in batches with retries, so a catalogue import doesn't die halfway on a timeout.",
        checks: ["Checked by content at upload", "Folders per collection", "Warm the cache for launch day (self-hosted)"],
      },
      {
        tone: "dusk",
        shot: <VideoJobsMock />,
        title: "Product video, too.",
        muted: "From the same library.",
        body: "Short loops and unboxing videos are transcoded on request, with a poster frame for the grid and a watermark if you want one.",
        checks: ["MP4 and WebM", "Poster frames from any second", "Overlays on video"],
      },
    ],
    hood: {
      title: "One request,",
      muted: "the right bytes.",
      body: "The browser says what it accepts, Openinary answers with the lightest file it can, then caches it for every shopper after.",
      links: [
        { href: `${DOCS_URL}/media-transformations/intelligent-compression`, label: "Formats and compression" },
        { href: `${DOCS_URL}/media-transformations/overlays`, label: "Overlays and watermarks" },
      ],
      terminal: { title: "~/shop", lines: curlLines },
    },
    specs: [
      { title: "AVIF and WebP", body: "Picked per browser from one URL." },
      { title: "Every size", body: "Width, height, ratio and crop from the URL." },
      { title: "Retina", body: "dpr_2 doubles the pixels, not the markup." },
      { title: "Watermarks", body: "Your logo on images and video with l_." },
      { title: "Placeholders", body: "A default image when a SKU has none yet." },
      { title: "Cache", body: "Served from cache after the first shopper." },
    ],
    cta: { title: "Faster product pages, same photos.", body: "Free plan, no card required. Bring your catalogue when you're ready." },
  },
];

export const solutionBySlug = (slug: string) => solutions.find((s) => s.slug === slug);
