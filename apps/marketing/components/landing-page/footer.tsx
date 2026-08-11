import Link from "next/link";

interface FooterLink {
  title: string;
  href: string;
}

interface SocialLink {
  name: string;
  href: string;
  icon: React.ReactNode;
  ariaLabel: string;
}

interface FooterSectionProps {
  links?: FooterLink[];
  socialLinks?: SocialLink[];
  copyrightText?: string;
  companyName?: string;
}

const defaultSocialLinks: SocialLink[] = [
  {
    name: "X/Twitter",
    href: "https://x.com/initflorian",
    ariaLabel: "X/Twitter",
    icon: (
      <svg
        className="size-5"
        xmlns="http://www.w3.org/2000/svg"
        width="1em"
        height="1em"
        viewBox="0 0 24 24"
      >
        <path
          fill="currentColor"
          d="M10.488 14.651L15.25 21h7l-7.858-10.478L20.93 3h-2.65l-5.117 5.886L8.75 3h-7l7.51 10.015L2.32 21h2.65zM16.25 19L5.75 5h2l10.5 14z"
        ></path>
      </svg>
    ),
  },
  {
    name: "LinkedIn",
    href: "https://www.linkedin.com/in/florian-heysen/",
    ariaLabel: "LinkedIn",
    icon: (
      <svg
        className="size-5"
        xmlns="http://www.w3.org/2000/svg"
        width="1em"
        height="1em"
        viewBox="0 0 24 24"
      >
        <path
          fill="currentColor"
          d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93zM6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37z"
        ></path>
      </svg>
    ),
  },
  {
    name: "GitHub",
    href: "https://github.com/openinary/openinary",
    ariaLabel: "GitHub",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        className="size-5"
        width="1em"
        height="1em"
        fill="currentColor"
      >
        <path d="M12.001 2C6.47598 2 2.00098 6.475 2.00098 12C2.00098 16.425 4.86348 20.1625 8.83848 21.4875C9.33848 21.575 9.52598 21.275 9.52598 21.0125C9.52598 20.775 9.51348 19.9875 9.51348 19.15C7.00098 19.6125 6.35098 18.5375 6.15098 17.975C6.03848 17.6875 5.55098 16.8 5.12598 16.5625C4.77598 16.375 4.27598 15.9125 5.11348 15.9C5.90098 15.8875 6.46348 16.625 6.65098 16.925C7.55098 18.4375 8.98848 18.0125 9.56348 17.75C9.65098 17.1 9.91348 16.6625 10.201 16.4125C7.97598 16.1625 5.65098 15.3 5.65098 11.475C5.65098 10.3875 6.03848 9.4875 6.67598 8.7875C6.57598 8.5375 6.22598 7.5125 6.77598 6.1375C6.77598 6.1375 7.61348 5.875 9.52598 7.1625C10.326 6.9375 11.176 6.825 12.026 6.825C12.876 6.825 13.726 6.9375 14.526 7.1625C16.4385 5.8625 17.276 6.1375 17.276 6.1375C17.826 7.5125 17.476 8.5375 17.376 8.7875C18.0135 9.4875 18.401 10.375 18.401 11.475C18.401 15.3125 16.0635 16.1625 13.8385 16.4125C14.201 16.725 14.5135 17.325 14.5135 18.2625C14.5135 19.6 14.501 20.675 14.501 21.0125C14.501 21.275 14.6885 21.5875 15.1885 21.4875C19.259 20.1133 21.9999 16.2963 22.001 12C22.001 6.475 17.526 2 12.001 2Z"></path>
      </svg>
    ),
  },
];

export default function FooterSection({
  socialLinks = defaultSocialLinks,
  copyrightText = "All rights reserved",
  companyName = "Openinary",
}: FooterSectionProps) {
  return (
    <footer>
      <div className="flex flex-col gap-6 p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex flex-col gap-2">
            <span className="text-muted-foreground block text-sm">
              © {new Date().getFullYear()} {companyName}, {copyrightText}
            </span>
            <p className="text-xs text-muted-foreground max-w-[500px]">
              Built by florianheysen
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-muted-foreground">
                Resources
              </span>
              <div className="flex flex-col gap-1">
                <Link
                  href="/"
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Website
                </Link>
                <Link
                  href="https://docs.openinary.dev/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Docs
                </Link>
                <Link
                  href="https://docs.openinary.dev/quickstart"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Quickstart
                </Link>
              </div>
            </div>
            <div className="flex justify-center gap-6 text-sm">
              {socialLinks.map((socialLink, index) => (
                <Link
                  key={index}
                  href={socialLink.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={socialLink.ariaLabel}
                  className="text-muted-foreground hover:text-primary block"
                >
                  {socialLink.icon}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
