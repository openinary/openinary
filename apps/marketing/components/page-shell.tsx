import { Footer } from "@/components/home/footer";
import { Header } from "@/components/home/header";
import { Eyebrow, gutter } from "@/components/home/section";
import { cn } from "@/lib/utils";

/**
 * The homepage's shell, for every other public page: the 1100px column whose
 * hairline side borders the sections' own rules run out to. One place, so the
 * pages cannot drift apart on width or chrome again.
 */
export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background">
      <div className="mx-auto w-full max-w-[1100px] md:border-x md:border-border">
        <Header />
        <main>{children}</main>
        <Footer />
      </div>
    </div>
  );
}

/**
 * Page opener in the hero's voice, one step down: same eyebrow, same tracking,
 * a size below the homepage h1. `children` render above the eyebrow, for a
 * back link.
 */
export function PageIntro({
  eyebrow,
  title,
  lede,
  children,
}: {
  eyebrow: string;
  title: string;
  lede?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn(gutter, "pb-14 pt-14 md:pb-20 md:pt-20")}>
      {children}
      <Eyebrow>{eyebrow}</Eyebrow>
      <h1 className="mt-4 max-w-[24ch] text-balance text-3xl font-semibold leading-[1.1] tracking-[-0.03em] text-foreground sm:text-4xl">
        {title}
      </h1>
      {lede ? (
        <p className="mt-5 max-w-[36rem] text-[15px] leading-[1.63] text-muted-foreground sm:text-base">
          {lede}
        </p>
      ) : null}
    </div>
  );
}
