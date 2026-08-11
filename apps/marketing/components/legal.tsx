export function Section({ children }: { children: React.ReactNode }) {
  return (
    <section className="pb-8 mb-8 border-b border-border last:border-0 last:pb-0 last:mb-0">
      {children}
    </section>
  );
}

export function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-base font-semibold text-foreground mb-2">{children}</h2>;
}

export function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground leading-relaxed mb-3">{children}</p>;
}

export function Ul({ children }: { children: React.ReactNode }) {
  return (
    <ul className="text-sm text-muted-foreground pl-5 mb-3 space-y-1 list-disc">
      {children}
    </ul>
  );
}

export function A({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
      className="underline underline-offset-2 hover:text-foreground transition-colors"
    >
      {children}
    </a>
  );
}
