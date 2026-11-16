import type { Metadata } from "next";

import { GitHubMark } from "@/components/site/header";
import { TerminalMock } from "@/components/site/mocks";
import { FinalCta, PageHero, SiteShell, SkyStage, SplitHeading } from "@/components/site/shell";
import {
  ButtonLink,
  Container,
  DOCS_URL,
  GITHUB_URL,
  H2,
  InfoTile,
  Pill,
  TextLink,
} from "@/components/site/ui";

export const metadata: Metadata = {
  title: "Security | Openinary",
  description:
    "What Openinary does with your files, and what it never will: content-checked uploads, hashed keys, signed URLs, non-root containers and telemetry you can switch off.",
  alternates: { canonical: "/security" },
};

/** Every statement on this page is checked against apps/docs/security.mdx and the telemetry page. */
const updated = "12 November 2026";

type Row = { k: string; v: string };
type Point = {
  title: string;
  links: { href: string; label: string }[];
  panel: { title: string; sub: string; pill: { label: string; tone: "green" | "amber" | "red" | "neutral" }; grid?: Row[]; rows: Row[] };
};

const points: Point[] = [
  {
    title: "Your files stay in the bucket you choose.",
    links: [
      { href: `${DOCS_URL}/configuration/storage`, label: "Connecting storage" },
      { href: `${DOCS_URL}/cloud/overview`, label: "How Cloud isolates buckets" },
    ],
    panel: {
      title: "acme-media",
      sub: "Cloudflare R2",
      pill: { label: "Connected", tone: "green" },
      grid: [
        { k: "Owner", v: "You" },
        { k: "Prefix", v: "public/" },
        { k: "Keys", v: "Yours" },
        { k: "Copies", v: "None" },
      ],
      rows: [
        { k: "Originals", v: "plain objects" },
        { k: "Transformed versions", v: "cache, rebuildable" },
        { k: "Leaving", v: "nothing to export" },
      ],
    },
  },
  {
    title: "Uploads are checked by what they are, not what they claim.",
    links: [
      { href: `${DOCS_URL}/api-reference/files/upload`, label: "Upload validation" },
      { href: `${DOCS_URL}/security#upload-and-delivery`, label: "Why both halves matter" },
    ],
    panel: {
      title: "invoice.jpg",
      sub: "POST /upload",
      pill: { label: "Rejected", tone: "red" },
      rows: [
        { k: "Extension", v: ".jpg" },
        { k: "Declared type", v: "image/jpeg" },
        { k: "Leading bytes", v: "<!DOCTYPE html>" },
        { k: "Result", v: "never reaches storage" },
        { k: "On delivery", v: "nosniff, exact type" },
      ],
    },
  },
  {
    title: "Keys are hashed. Passwords too.",
    links: [
      { href: `${DOCS_URL}/security#api-keys`, label: "API keys" },
      { href: `${DOCS_URL}/security#database`, label: "What the database holds" },
    ],
    panel: {
      title: "auth.db",
      sub: "/app/data, mode 600",
      pill: { label: "Owner only", tone: "green" },
      rows: [
        { k: "apiKey", v: "hashed before storage" },
        { k: "user", v: "passwords scrypt-hashed" },
        { k: "session", v: "web sessions" },
        { k: "Key expiry", v: "set at creation" },
        { k: "Compromised key", v: "disable in one click" },
      ],
    },
  },
  {
    title: "Private files need a link your backend signed.",
    links: [
      { href: `${DOCS_URL}/media-transformations/signed-urls`, label: "Signed URLs" },
    ],
    panel: {
      title: "/authenticated/s--9f2c…/w_200/invoice.png",
      sub: "HMAC-SHA256, keyed on API_SECRET",
      pill: { label: "Self-hosted", tone: "neutral" },
      rows: [
        { k: "Signature matches", v: "200" },
        { k: "w_200 edited to w_5000", v: "401" },
        { k: "Signature missing", v: "400" },
        { k: "Comparison", v: "constant time" },
      ],
    },
  },
  {
    title: "Telemetry you can read, and switch off.",
    links: [
      { href: `${DOCS_URL}/configuration/telemetry`, label: "Exactly what is sent" },
    ],
    panel: {
      title: "OPENINARY_TELEMETRY=false",
      sub: "one variable",
      pill: { label: "Off", tone: "amber" },
      rows: [
        { k: "Events", v: "3, listed in full" },
        { k: "File names, URLs, media", v: "never" },
        { k: "Counts", v: "bucketed, never raw" },
        { k: "Instance id", v: "irreversible UUID" },
      ],
    },
  },
];

const installLines = [
  "$ docker compose up -d",
  "",
  "✓  secure-db: /app/data/auth.db set to 600",
  "✓  admin account created from OPENINARY_ADMIN_EMAIL",
  "✓  API key generated, shown once below",
  "   sk_live_•••••••••••••••••••••••••",
  "",
  "Listening on :3000",
];

export default function SecurityPage() {
  return (
    <SiteShell>
      <PageHero
        title={
          <>
            What Openinary does with your files.
            <br className="hidden md:block" /> And what it never will.
          </>
        }
        lede="You are trusting it with your media and your users' uploads. Here is exactly how files get in, how they are served, what is stored about you, and how to check every line."
        location="security_hero"
        actions={
          <div className="mt-7 flex flex-wrap gap-2">
            <ButtonLink href={`${DOCS_URL}/security`} variant="secondary">
              The full detail in the docs
            </ButtonLink>
            <ButtonLink href={GITHUB_URL} data-track-event="github_clicked" data-track-prop-location="security_hero">
              Read the source
            </ButtonLink>
          </div>
        }
        note={`Last updated ${updated}`}
      />

      <SkyStage tone="clear">
        <TerminalMock title="root@media-01" lines={installLines} className="mx-auto max-w-[680px]" />
      </SkyStage>

      <Container className="pt-20 md:pt-28">
        <H2>
          The short version. <span className="text-ink-10">Every line checked against the code.</span>
        </H2>
        <div className="mt-10 flex flex-col gap-3">
          {points.map((p) => (
            <div key={p.title} className="grid gap-8 rounded-lg bg-tile p-6 md:grid-cols-2 md:p-10">
              <div className="flex flex-col justify-between gap-6">
                <p className="max-w-[340px] text-[20px] leading-7 tracking-[-0.02em] text-ink-12">{p.title}</p>
                <div className="flex flex-col items-start gap-2">
                  {p.links.map((l) => (
                    <TextLink key={l.href} href={l.href}>
                      {l.label}
                    </TextLink>
                  ))}
                </div>
              </div>
              <Panel {...p.panel} />
            </div>
          ))}
        </div>
      </Container>

      <Container className="pt-20 md:pt-28">
        <SplitHeading
          title="Two images."
          muted="Pick the one your policy needs."
          aside="Neither needs a privileged container or extra capabilities. Mount /app/data with the host permissions you want."
        />
        <div className="mt-8 grid gap-3 md:grid-cols-2">
          <InfoTile title="openinary/openinary-api" badge="node, non-root" body="The API on its own. Runs as the unprivileged node user. Put your own reverse proxy in front." />
          <InfoTile title="openinary/openinary" badge="root" body="API, dashboard, nginx and supervisord in one. Processes run as root, so choose the API image if non-root is a requirement." />
        </div>
      </Container>

      <Container className="pt-20 md:pt-28">
        <H2 muted="Nothing held back.">Open source, all of it.</H2>
        <div className="mt-8 grid gap-3 md:grid-cols-3">
          <InfoTile title="One command to install" body="create-openinary writes random secrets into your .env, so nothing ships with a default password." href={`${DOCS_URL}/quickstart`} />
          <InfoTile title="Nothing phones home" body="Except three anonymous telemetry events you can read in full and turn off." href={`${DOCS_URL}/configuration/telemetry`} />
          <InfoTile title="Patched runtime" body="The images run on Node.js 22, which still gets security updates." href={`${DOCS_URL}/changelog`} />
        </div>
      </Container>

      <Container className="pt-20 md:pt-28">
        <div className="grid gap-8 rounded-lg bg-tile p-6 md:grid-cols-2 md:p-12">
          <div>
            <H2>Read every line of it.</H2>
            <p className="mt-4 max-w-[400px] text-[13px] leading-5 text-ink-11">
              The engine, the dashboard and the hosted version are open source under the AGPL-3.0. You don&apos;t have
              to take this page&apos;s word for anything.
            </p>
            <ButtonLink href={GITHUB_URL} variant="secondary" className="mt-6">
              <GitHubMark /> openinary/openinary
            </ButtonLink>
          </div>
          <div>
            <H2>Found a problem?</H2>
            <p className="mt-4 max-w-[400px] text-[13px] leading-5 text-ink-11">
              Email what you found and how to reproduce it. Please give us a chance to fix it before you share it
              publicly.
            </p>
            <ButtonLink href="mailto:security@openinary.dev" variant="secondary" className="mt-6">
              security@openinary.dev
            </ButtonLink>
          </div>
        </div>
      </Container>

      <div className="pt-16" />
      <FinalCta location="security_cta" />
    </SiteShell>
  );
}

function Panel({ title, sub, pill, grid, rows }: Point["panel"]) {
  return (
    <div className="overflow-hidden rounded-lg bg-frame shadow-rule">
      <div className="flex items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate font-mono text-[12px] text-ink-12">{title}</p>
          <p className="text-[11px] text-ink-10">{sub}</p>
        </div>
        <Pill tone={pill.tone}>{pill.label}</Pill>
      </div>
      {grid ? (
        <div className="grid grid-cols-2 gap-px border-y-[0.5px] border-rule bg-rule sm:grid-cols-4">
          {grid.map((g) => (
            <div key={g.k} className="bg-frame px-4 py-2.5">
              <p className="text-[12px] text-ink-12">{g.v}</p>
              <p className="text-[11px] text-ink-10">{g.k}</p>
            </div>
          ))}
        </div>
      ) : null}
      <ul className="divide-y-[0.5px] divide-rule border-t-[0.5px] border-rule">
        {rows.map((r) => (
          <li key={r.k} className="flex items-center justify-between gap-4 px-4 py-2.5 text-[12px]">
            <span className="text-ink-12">{r.k}</span>
            <span className="text-right text-ink-10">{r.v}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
