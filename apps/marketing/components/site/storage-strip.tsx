const providers = [
  { name: "Amazon S3", logo: "/storage/amazon-s3.svg", ratio: 424 / 512 },
  { name: "Cloudflare R2", logo: "/storage/cloudflare-r2.svg", ratio: 1059 / 479 },
  { name: "Google Cloud", logo: "/storage/google-cloud.svg", ratio: 1 },
  { name: "Backblaze", logo: "/storage/backblaze.svg", ratio: 1 },
  { name: "Wasabi", logo: "/storage/wasabi.svg", ratio: 1 },
  { name: "Scaleway", logo: "/storage/scaleway.svg", ratio: 1 },
  { name: "OVHcloud", logo: "/storage/ovhcloud.svg", ratio: 29 / 18 },
];

/**
 * Upright marks take the full 16px height; wide ones get the same area
 * instead, or a cloud twice as wide as it is tall outweighs its neighbours.
 */
const MARK = 16;
const height = (ratio: number) => (ratio > 1 ? Math.round(Math.sqrt((MARK * MARK) / ratio)) : MARK);

/**
 * Provider names with their marks. The files are already the page's grey;
 * dark mode inverts them (a plain invert in light would paint them white on
 * white).
 */
export function StorageStrip() {
  return (
    <ul className="flex flex-wrap items-center justify-center gap-x-7 gap-y-3">
      {providers.map((p) => (
        <li key={p.name} className="flex items-center gap-2 text-[13px] text-ink-11">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.logo} alt="" style={{ height: height(p.ratio) }} className="w-auto grayscale dark:opacity-80 dark:invert" />
          {p.name}
        </li>
      ))}
    </ul>
  );
}
