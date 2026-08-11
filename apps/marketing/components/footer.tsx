import Logo from "@/components/logo";
import { Button } from "@/components/ui/button";
import { GithubIcon } from "lucide-react";
import Link from "next/link";

const navLinks = [
  { href: "/", label: "Website" },
  { href: "/compare", label: "Compare" },
  { href: "https://docs.openinary.dev/", label: "Docs", external: true },
  {
    href: "https://docs.openinary.dev/quickstart",
    label: "Quickstart",
    external: true,
  },
];

const legalLinks = [
  { href: "/legal", label: "Legal Notice" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy Policy" },
];

const socialLinks = [
  {
    href: "https://x.com/initflorian",
    label: "X",
    icon: <XIcon />,
  },
  {
    href: "https://www.linkedin.com/in/florian-heysen/",
    label: "LinkedIn",
    icon: <LinkedInIcon />,
  },
  {
    href: "https://github.com/openinary/openinary",
    label: "Github",
    icon: <GithubIcon />,
  },
];

export function Footer() {
  return (
    <footer className="mx-auto *:px-4 *:md:px-6">
      <div className="flex flex-col gap-6 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Logo />
          </div>
          <div className="flex items-center">
            {socialLinks.map(({ href, label, icon }) => (
              <Button asChild key={label} size="icon-sm" variant="ghost">
                <a
                  aria-label={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-track-event="social_clicked"
                  data-track-prop-location="footer"
                  data-track-prop-label={label}
                >
                  {icon}
                </a>
              </Button>
            ))}
          </div>
        </div>

        <nav className="flex items-center justify-between">
          <ul className="flex flex-wrap gap-4 font-medium text-muted-foreground text-sm md:gap-6">
            {navLinks.map((link) => (
              <li key={link.label}>
                <Link
                  className="hover:text-foreground"
                  href={link.href}
                  data-track-event="nav_link_clicked"
                  data-track-prop-location="footer"
                  {...(link.external
                    ? { target: "_blank", rel: "noopener noreferrer" }
                    : {})}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          <ul className="flex flex-wrap gap-4 font-medium text-muted-foreground text-sm md:gap-6">
            {legalLinks.map((link) => (
              <li key={link.label}>
                <Link
                  className="hover:text-foreground"
                  href={link.href}
                  data-track-event="nav_link_clicked"
                  data-track-prop-location="footer"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-4 border-t py-4 text-muted-foreground text-sm">
        <p>&copy; {new Date().getFullYear()} Openinary. All rights reserved.</p>

        <p className="inline-flex items-center gap-1.5">
          <span>Built by</span>
          <a
            aria-label="x/twitter"
            className="inline-flex items-center gap-1.5 text-foreground/80 hover:text-foreground hover:underline"
            href={"https://x.com/initflorian"}
            rel="noreferrer"
            target="_blank"
            data-track-event="author_clicked"
            data-track-prop-location="footer"
          >
            <img
              alt=""
              width={20}
              height={20}
              loading="lazy"
              className="size-5 rounded-full"
              src="https://github.com/florianheysen.png?size=40"
            />
            florianheysen
          </a>
        </p>
      </div>
    </footer>
  );
}

function XIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg
      fill="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="m18.9,1.153h3.682l-8.042,9.189,9.46,12.506h-7.405l-5.804-7.583-6.634,7.583H.469l8.6-9.831L0,1.153h7.593l5.241,6.931,6.065-6.931Zm-1.293,19.494h2.039L6.482,3.239h-2.19l13.314,17.408Z" />
    </svg>
  );
}

function LinkedInIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg
      fill="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93zM6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37z" />
    </svg>
  );
}
