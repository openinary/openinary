import Image from "next/image";

import { AuthSplit } from "@openinary/dashboard/ui/auth-split";
import { VersionBadge } from "@/components/ui/version-badge";

/**
 * The frame of every signed-out page: the wordmark, one card with a title and
 * a sentence over the form, and the footer line.
 */
export function AuthShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <AuthSplit>
    <div className="flex flex-1 flex-col items-center px-4">
      <VersionBadge />
      <div className="my-auto w-full max-w-[356px] py-10">
        <div className="mb-12 flex items-center justify-center gap-2">
          <Image
            src="/icon.svg"
            alt=""
            width={20}
            height={20}
            className="dark:invert"
          />
          <span className="font-semibold text-[17px]/6 tracking-[-0.02em]">
            Openinary
          </span>
        </div>
        <main>
          <h1 className="font-semibold text-[18px]/6 tracking-[-0.01em]">
            {title}
          </h1>
          <p className="mt-1.5 text-[13.5px]/5 text-ds-muted text-pretty">
            {description}
          </p>
          <div className="mt-6">{children}</div>
        </main>
        <p className="mt-6 text-center text-[12px]/4 text-ds-faint">
          © Openinary {new Date().getFullYear()}
        </p>
      </div>
    </div>
    </AuthSplit>
  );
}

/** What went wrong, as a tinted line above the submit button. */
export function AuthError({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-[10px] bg-ds-red/10 px-3.5 py-2.5 text-[13px]/5 text-ds-red"
    >
      {children}
    </p>
  );
}
