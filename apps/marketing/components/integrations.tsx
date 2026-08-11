import { cn } from "@/lib/utils";
import { FullWidthDivider } from "@/components/ui/full-width-divider";
import type { ReactNode } from "react";
import { Check } from "lucide-react";

type LogoType = {
  src?: string;
  svg?: ReactNode;
  alt: string;
  isInvertable?: boolean;
};

type TileData = {
  row: number;
  col: number;
  logo?: LogoType;
};

export function Integrations() {
  return (
    <section className="relative mx-auto w-full py-10 md:py-20">
      <FullWidthDivider position="top" />
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-12 px-6 py-6 md:py-12 md:grid-cols-2 md:items-center">
        {/* Left Content */}
        <div className="max-w-xl space-y-5">
          <h2 className="text-3xl font-semibold tracking-tight lg:text-4xl mb-4">
            Seamless Integration
          </h2>
          <p className="text-muted-foreground max-w-[600px] leading-relaxed">
            Use your existing S3-compatible storage infrastructure. No need to
            migrate or change providers.
          </p>
          <ul className="flex flex-col gap-4 mt-6">
            <li className="flex items-center gap-2">
              <Check className="size-5 flex-shrink-0 text-green-600" />
              <span className="text-sm font-medium">AWS S3</span>
            </li>
            <li className="flex items-center gap-2">
              <Check className="size-5 flex-shrink-0 text-green-600" />
              <span className="text-sm font-medium">Cloudflare R2</span>
            </li>
            <li className="flex items-center gap-2">
              <Check className="size-5 flex-shrink-0 text-green-600" />
              <span className="text-sm font-medium">Google Cloud Storage</span>
            </li>
            <li className="flex items-center gap-2">
              <Check className="size-5 flex-shrink-0 text-green-600" />
              <span className="text-sm font-medium">Any S3-Compatible Storage</span>
            </li>
          </ul>
        </div>

        {/* Right Content - Visual */}
        <div className="place-items-end">
          <div className="mask-[radial-gradient(ellipse_at_center,black,black,transparent)] relative size-90">
            {tiles.map((tile) => (
              <IntegrationCard key={`${tile.row}_${tile.col}`} {...tile} />
            ))}
          </div>
        </div>
      </div>
      <FullWidthDivider position="bottom" />
    </section>
  );
}

function IntegrationCard({ row, col, logo }: TileData) {
  return (
    <div
      className={cn(
        "absolute flex size-18 items-center justify-center rounded-md border",
        logo
          ? "bg-card shadow-xs dark:bg-card/60"
          : "bg-secondary/30 dark:bg-background", // Styling for empty tiles
      )}
      style={{
        left: col * 72, // 72px cell
        top: row * 72,
      }}
    >
      {logo &&
        (logo.svg ? (
          <div
            className={cn(
              "pointer-events-none flex size-8 select-none items-center justify-center p-1 [&>svg]:size-full",
              logo.isInvertable && "dark:invert",
            )}
          >
            {logo.svg}
          </div>
        ) : logo.src ? (
          <img
            alt={logo.alt}
            className={cn(
              "pointer-events-none size-8 select-none object-contain p-1",
              logo.isInvertable && "dark:invert",
            )}
            height={40}
            src={logo.src}
            width={40}
            loading="lazy"
          />
        ) : null)}
    </div>
  );
}

// Coordinate mapping to approximate the "scattered" look in the image.
// Grid 5x5.
const tiles: TileData[] = [
  // Row 0
  {
    row: 0,
    col: 1,
  },
  {
    row: 0,
    col: 3,
    logo: {
      src: "/s3-logo.png",
      alt: "Amazon S3 Logo",
    },
  },

  // Row 1
  { row: 1, col: 0 }, // Empty
  {
    row: 1,
    col: 2,
    logo: {
      src: "/wasabi-logo.png",
      alt: "Wasabi Logo",
    },
  },
  {
    row: 1,
    col: 4,
    logo: {
      svg: (
        <svg
          viewBox="0 0 256 116"
          xmlns="http://www.w3.org/2000/svg"
          width="256"
          height="116"
          preserveAspectRatio="xMidYMid"
        >
          <path
            fill="#FFF"
            d="m202.357 49.394-5.311-2.124C172.085 103.434 72.786 69.289 66.81 85.997c-.996 11.286 54.227 2.146 93.706 4.059 12.039.583 18.076 9.671 12.964 24.484l10.069.031c11.615-36.209 48.683-17.73 50.232-29.68-2.545-7.857-42.601 0-31.425-35.497Z"
          />
          <path
            fill="#F4811F"
            d="M176.332 108.348c1.593-5.31 1.062-10.622-1.593-13.809-2.656-3.187-6.374-5.31-11.154-5.842L71.17 87.634c-.531 0-1.062-.53-1.593-.53-.531-.532-.531-1.063 0-1.594.531-1.062 1.062-1.594 2.124-1.594l92.946-1.062c11.154-.53 22.839-9.56 27.087-20.182l5.312-13.809c0-.532.531-1.063 0-1.594C191.203 20.182 166.772 0 138.091 0 111.535 0 88.697 16.995 80.73 40.896c-5.311-3.718-11.684-5.843-19.12-5.31-12.747 1.061-22.838 11.683-24.432 24.43-.531 3.187 0 6.374.532 9.56C16.996 70.107 0 87.103 0 108.348c0 2.124 0 3.718.531 5.842 0 1.063 1.062 1.594 1.594 1.594h170.489c1.062 0 2.125-.53 2.125-1.594l1.593-5.842Z"
          />
          <path
            fill="#FAAD3F"
            d="M205.544 48.863h-2.656c-.531 0-1.062.53-1.593 1.062l-3.718 12.747c-1.593 5.31-1.062 10.623 1.594 13.809 2.655 3.187 6.373 5.31 11.153 5.843l19.652 1.062c.53 0 1.062.53 1.593.53.53.532.53 1.063 0 1.594-.531 1.063-1.062 1.594-2.125 1.594l-20.182 1.062c-11.154.53-22.838 9.56-27.087 20.182l-1.063 4.78c-.531.532 0 1.594 1.063 1.594h70.108c1.062 0 1.593-.531 1.593-1.593 1.062-4.25 2.124-9.03 2.124-13.81 0-27.618-22.838-50.456-50.456-50.456"
          />
        </svg>
      ),
      alt: "Cloudflare R2 Logo",
    },
  },

  // Row 2
  {
    row: 2,
    col: 1,
    logo: {
      svg: (
        <svg
          width="79"
          height="48"
          viewBox="0 0 79 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M73.142 2.69a40.1 40.1 0 0 1-3.74 44.49h-21.44l6.6-11.67h-8.73l10.29-18.13h8.78l8.24-14.67zm-42.34 44.49H8.942a39.59 39.59 0 0 1-3.79-44.59l14.18 24.63L34.962 0h23l-27.15 47.16z"
            fill="#000e9c"
          />
        </svg>
      ),
      alt: "OVHcloud Logo",
    },
  },
  {
    row: 2,
    col: 3,
    logo: {
      svg: (
        <svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient
              id="azure-a"
              x1="-1032.17"
              x2="-1059.21"
              y1="145.31"
              y2="65.43"
              gradientTransform="matrix(1 0 0 -1 1075 158)"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0" stopColor="#114a8b" />
              <stop offset="1" stopColor="#0669bc" />
            </linearGradient>
            <linearGradient
              id="azure-b"
              x1="-1023.73"
              x2="-1029.98"
              y1="108.08"
              y2="105.97"
              gradientTransform="matrix(1 0 0 -1 1075 158)"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0" stopOpacity=".3" />
              <stop offset=".07" stopOpacity=".2" />
              <stop offset=".32" stopOpacity=".1" />
              <stop offset=".62" stopOpacity=".05" />
              <stop offset="1" stopOpacity="0" />
            </linearGradient>
            <linearGradient
              id="azure-c"
              x1="-1027.16"
              x2="-997.48"
              y1="147.64"
              y2="68.56"
              gradientTransform="matrix(1 0 0 -1 1075 158)"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0" stopColor="#3ccbf4" />
              <stop offset="1" stopColor="#2892df" />
            </linearGradient>
          </defs>
          <path
            fill="url(#azure-a)"
            d="M33.34 6.54h26.04l-27.03 80.1a4.15 4.15 0 0 1-3.94 2.81H8.15a4.14 4.14 0 0 1-3.93-5.47L29.4 9.38a4.15 4.15 0 0 1 3.94-2.83z"
          />
          <path
            fill="#0078d4"
            d="M71.17 60.26H29.88a1.91 1.91 0 0 0-1.3 3.31l26.53 24.76a4.17 4.17 0 0 0 2.85 1.13h23.38z"
          />
          <path
            fill="url(#azure-b)"
            d="M33.34 6.54a4.12 4.12 0 0 0-3.95 2.88L4.25 83.92a4.14 4.14 0 0 0 3.91 5.54h20.79a4.44 4.44 0 0 0 3.4-2.9l5.02-14.78 17.91 16.7a4.24 4.24 0 0 0 2.67.97h23.29L71.02 60.26H41.24L59.47 6.55z"
          />
          <path
            fill="url(#azure-c)"
            d="M66.6 9.36a4.14 4.14 0 0 0-3.93-2.82H33.65a4.15 4.15 0 0 1 3.93 2.82l25.18 74.62a4.15 4.15 0 0 1-3.93 5.48h29.02a4.15 4.15 0 0 0 3.93-5.48z"
          />
        </svg>
      ),
      alt: "Microsoft Azure Logo",
    },
  }, // Empty

  // Row 3

  { row: 3, col: 0 }, // Empty
  {
    row: 3,
    col: 2,
    logo: {
      svg: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="800"
          height="800"
          preserveAspectRatio="xMidYMid"
          viewBox="0 -25 256 256"
        >
          <path
            fill="#EA4335"
            d="m170.252 56.819 22.253-22.253 1.483-9.37C153.437-11.677 88.976-7.496 52.42 33.92 42.267 45.423 34.734 59.764 30.717 74.573l7.97-1.123 44.505-7.34 3.436-3.513c19.797-21.742 53.27-24.667 76.128-6.168l7.496.39Z"
          />
          <path
            fill="#4285F4"
            d="M224.205 73.918a100.249 100.249 0 0 0-30.217-48.722l-31.232 31.232a55.515 55.515 0 0 1 20.379 44.037v5.544c15.35 0 27.797 12.445 27.797 27.796 0 15.352-12.446 27.485-27.797 27.485h-55.671l-5.466 5.934v33.34l5.466 5.231h55.67c39.93.311 72.553-31.494 72.864-71.424a72.303 72.303 0 0 0-31.793-60.453"
          />
          <path
            fill="#34A853"
            d="M71.87 205.796h55.593V161.29H71.87a27.275 27.275 0 0 1-11.399-2.498l-7.887 2.42-22.409 22.253-1.952 7.574c12.567 9.489 27.9 14.825 43.647 14.757"
          />
          <path
            fill="#FBBC05"
            d="M71.87 61.425C31.94 61.664-.237 94.228.001 134.159a72.301 72.301 0 0 0 28.222 56.88l32.248-32.246c-13.99-6.322-20.208-22.786-13.887-36.776 6.32-13.99 22.786-20.208 36.775-13.888a27.796 27.796 0 0 1 13.887 13.888l32.248-32.248A72.224 72.224 0 0 0 71.87 61.425"
          />
        </svg>
      ),
      alt: "Google Cloud Storage Logo",
    },
  },
  {
    row: 3,
    col: 4,
    logo: {
      svg: (
        <svg
          width="274"
          height="450"
          viewBox="0 0 274 450"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M84.224 0s66.68 58.453 57.75 110.156c-4.024 23.336-34.711 61.133-18.141 97.305 17.852 38.969 27.125 114.164-53.203 94.734-79.195-18.984-73.094-116.172-14.234-167.211S95.888 25.954 84.224 0m60.844 175.352c-4.43 39.437 39.203 78.75 4.492 132.187-23.75 36.984 12.969 89.016 60.375 79.531 51.805-10.328 64.844-43.109 63.469-81.203-1.805-48.359-21.094-61.836-63.821-98.117-46.437-39.203-10.672-113.578-10.672-113.578s-48.711 37.781-53.843 81.18M5.88 348.25c9.274 26.016 23.625 67.727 80.383 88.898 47.773 17.907 114.687 21.094 153.242-28.351 8.867-11.086-2.797-6.766-14.469-2.344a93.34 93.34 0 0 1-87.086-16.726c-32.812-27.344-20.007-57.985-36.46-58.336-54.25-1.164-82.547-22.344-97.188-40.368-3.32-4.25-8.453 29.172 1.578 57.227"
            fill="#e41e2a"
          />
        </svg>
      ),
      alt: "Backblaze B2 Logo",
    },
  },

  // Row 4
  {
    row: 4,
    col: 1,
    logo: {
      svg: (
        <svg
          width="65"
          height="76"
          viewBox="0 0 65 76"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M24.91 54.32c.017 2.549 2.108 4.6 4.67 4.584l12.606-.02c2.888-.357 5.104-2.72 5.26-5.61V35.222c0-2.531-2.063-4.583-4.609-4.583s-4.609 2.052-4.609 4.583V46.69a3 3 0 0 1-3.006 2.989H29.52c-2.562.016-4.626 2.095-4.61 4.643m-2.875-8.908c-2.546 0-4.61-2.052-4.61-4.584V22.767c.152-2.89 2.364-5.257 5.251-5.62h12.616c2.55.005 4.626 2.039 4.67 4.573A4.6 4.6 0 0 1 38.63 25a4.64 4.64 0 0 1-3.279 1.373H29.64a3 3 0 0 0-3.006 2.99V40.83c0 2.528-2.058 4.578-4.6 4.584"
            fill="#521094"
          />
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M14.48 0h22.876a27.36 27.36 0 0 1 19.312 7.919A27.04 27.04 0 0 1 64.682 27.1v36.137c-.738 6.839-6.262 12.19-13.157 12.743h-24.19a27.38 27.38 0 0 1-19.33-7.938A27.06 27.06 0 0 1 0 48.83V14.417C.006 6.465 6.482.017 14.48 0m35.666 14.559a18.2 18.2 0 0 0-12.87-5.303l-22.446-.04c-3.108.044-5.602 2.568-5.591 5.66v33.786a18 18 0 0 0 5.318 12.776 18.2 18.2 0 0 0 12.849 5.287h23.227a5.67 5.67 0 0 0 4.81-4.613V27.37a18 18 0 0 0-5.297-12.811"
            fill="#521094"
          />
        </svg>
      ),
      alt: "Scaleway Logo",
    },
  },
  {
    row: 4,
    col: 3,
    logo: {
      svg: (
        <svg
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 1024 1024"
        >
          <path
            d="M4.8 438.2A520.7 520.7 0 000 489.7h777.8c-2.7-5.3-6.4-10-10-14.7-133-171.8-204.5-157-306.9-161.3-34-1.4-57.2-2-193-2-72.7 0-151.7.2-228.6.4A621 621 0 0015 386.3h398.6v51.9H4.8zm779.1 103.5H.4c.8 13.8 2.1 27.5 4 41h723.4c32.2 0 50.3-18.3 56.1-41zM45 724.3s120 294.5 466.5 299.7c207 0 385-123 465.9-299.7H45z"
            fill="#000"
          />
          <path
            d="M511.5 0A512.2 512.2 0 0065.3 260.6l202.7-.2c158.4 0 164.2.6 195.2 2l19.1.6c66.7 2.3 148.7 9.4 213.2 58.2 35 26.5 85.6 85 115.7 126.5 27.9 38.5 35.9 82.8 17 125.2-17.5 39-55 62.2-100.4 62.2H16.7s4.2 18 10.6 37.8h970.6a510.4 510.4 0 0026.1-160.7A512.4 512.4 0 00511.5 0z"
            fill="#000"
          />
        </svg>
      ),
      alt: "Railway Logo",
      isInvertable: true,
    },
  },
];
