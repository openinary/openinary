import { DOCKER_COMPOSE_YML } from "@/lib/generated/sources";
import type { Metadata } from "next";

import { AgentPrompt } from "@/components/site/agent-prompt";
import { homeFaqs } from "@/components/site/faqs";
import { SITE_URL } from "@/lib/site";
import {
  ApiKeysMock,
  CodeFile,
  LogsMock,
  SignedUrlMock,
  TerminalMock,
  TransformMock,
  UploadMock,
  VideoJobsMock,
  createLines,
} from "@/components/site/mocks";
import { PlanCard, PlanStrip, plans } from "@/components/site/plans";
import { FaqBlock, FinalCta, PageHero, SiteShell, SplitHeading } from "@/components/site/shell";
import { StorageStrip } from "@/components/site/storage-strip";
import {
  ButtonLink,
  Container,
  DOCS_URL,
  GITHUB_URL,
  H2,
  ShotTile,
  Sky,
  StartButtons,
  TextLink,
} from "@/components/site/ui";
import { ProductFilm } from "@/components/site/film";
import { GitHubMark } from "@/components/site/header";
import { freeLines } from "@/components/site/plans";
import pricing from "@/data/pricing.json";

const cld = Object.fromEntries(pricing.cloudinary.plans.map((p) => [p.id, p]));

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "Openinary",
      url: SITE_URL,
      logo: `${SITE_URL}/logo.svg`,
      sameAs: [
        "https://github.com/openinary",
        "https://openalternative.co/openinary",
        "https://www.npmjs.com/package/create-openinary",
      ],
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: "support@openinary.dev",
      },
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: "Openinary",
      url: SITE_URL,
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "SoftwareApplication",
      name: "Openinary",
      url: SITE_URL,
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Linux, macOS, Windows (Docker)",
      license: "https://www.gnu.org/licenses/agpl-3.0.html",
      publisher: { "@id": `${SITE_URL}/#organization` },
      offers: {
        "@type": "Offer",
        name: "Openinary Cloud free plan",
        price: "0",
        priceCurrency: "USD",
        url: "https://app.openinary.dev",
        description: `${freeLines.join(", ")}, no credit card required.`,
      },
    },
    {
      "@type": "FAQPage",
      mainEntity: homeFaqs.map(({ question, text }) => ({
        "@type": "Question",
        name: question,
        acceptedAnswer: { "@type": "Answer", text },
      })),
    },
  ],
};

/** The top of the repo's own compose file, read at build so it never drifts. */
const compose = DOCKER_COMPOSE_YML
  .split("\n")
  .slice(0, 20)
  .join("\n");

export default function Home() {
  return (
    <SiteShell>
      <script
        type="application/ld+json"
        // Escape "<" so no string in the data can close the script tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />

      <PageHero
        title="The open-source alternative to Cloudinary."
        lede={
          <>
            Same URL transformations for images and video, without the credits.
            <br className="hidden md:block" /> Start on our free plan, or self-host it on the bucket you already have.
          </>
        }
        location="hero"
        eyebrow={<AgentPrompt surface="marketing_hero" />}
      />

      <Container>
        <ProductFilm className="overflow-hidden rounded-lg" />
        <div className="flex flex-col items-center gap-4 py-10">
          <p className="text-[13px] text-ink-10">Runs on the storage you already pay for</p>
          <StorageStrip />
        </div>
      </Container>

      <Container className="pt-10 pb-16 lg:pt-14 lg:pb-24">
        <SplitHeading title="Your Cloudinary workflow," muted="on one open API.">
          <TextLink href="/features" className="md:self-end">
            See all features ↗
          </TextLink>
        </SplitHeading>
        <ul className="mt-12 grid gap-3 lg:grid-cols-3">
          <ShotTile
            tone="clear"
            shot={<TransformMock />}
            title="Change the URL, get the file"
            body="Width, crop, format and quality are parameters in the link. Each version is made on the first request, no thumbnail folder to keep in sync."
          />
          <ShotTile
            tone="haze"
            shot={<VideoJobsMock />}
            title="Video without a pipeline"
            body="Transcode, resize and grab thumbnails from the same URLs. A pending job tells you when it will be ready instead of leaving you to poll."
          />
          <ShotTile
            tone="ocean"
            shot={<LogsMock />}
            title="Fast after the first hit"
            body="Every transformed file is cached at the edge and served like a static asset. Only the first request does the work."
          />
        </ul>
      </Container>

      <Container>
        <div className="grid gap-2 rounded-lg bg-tile p-2 md:grid-cols-[1fr_1.15fr]">
          <div className="self-center px-4 pt-8 pb-4 md:px-12 md:py-20">
            <H2>Running in one command.</H2>
            <p className="mt-4 max-w-[400px] text-[15px] leading-6 text-ink-11">
              The CLI asks three questions, writes your secrets and starts the container. Point it at the bucket you
              already have, nothing is moved.
            </p>
            <StartButtons
              location="install_block"
              secondary={{ href: `${DOCS_URL}/quickstart`, label: "Self-host guide", event: "self_host_clicked" }}
              className="mt-7"
            />
          </div>
          <Sky tone="dusk" className="relative h-[340px] overflow-hidden rounded-lg md:h-auto md:min-h-[400px]">
            <div className="shot-cut absolute inset-x-5 top-8 bottom-0 md:inset-x-10 md:top-12">
              <TerminalMock lines={createLines} />
            </div>
          </Sky>
        </div>
      </Container>

      <Container className="grid items-center gap-10 py-16 md:grid-cols-[1.25fr_1fr] md:py-24">
        <CodeFile
          name="docker-compose.yml"
          href={`${GITHUB_URL}/blob/main/docker-compose.yml`}
          code={compose}
        />
        <div>
          <H2>Don&apos;t take our word for it.</H2>
          <p className="mt-4 max-w-[380px] text-[15px] leading-6 text-ink-11">
            Every line that touches your files is on GitHub under the AGPL-3.0: the engine, the dashboard and the
            hosted version. Read it before you trust it with your media.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <ButtonLink href={GITHUB_URL} variant="secondary" data-track-event="github_clicked" data-track-prop-location="trust">
              <GitHubMark /> View the code
            </ButtonLink>
            <ButtonLink href="/security" variant="secondary">
              How your files stay yours
            </ButtonLink>
          </div>
        </div>
      </Container>

      <Container>
        <Sky tone="haze" className="rounded-lg px-4 pt-14 pb-10 md:px-12 md:pt-20 md:pb-14">
          <div className="text-center">
            {/* On the sky, so white in both themes, like the line under it. */}
            <H2 className="mx-auto text-white">No credits. No ${cld.plus.monthlyUsd} jump.</H2>
            <p className="mx-auto mt-3 max-w-[460px] text-[15px] leading-6 text-white/80">
              Free plan, no card required. Past it, each resource at its own published rate and no monthly fee, or run
              the same engine yourself for nothing.
            </p>
          </div>
          <div className="mt-10 grid gap-3 md:grid-cols-3">
            {plans.map((plan) => (
              <PlanCard key={plan.name} plan={plan} location="home_pricing" />
            ))}
          </div>
          <div className="mt-3">
            <PlanStrip location="home_pricing" />
          </div>
        </Sky>
      </Container>

      <Container className="pt-16 md:pt-24">
        <H2>Everything else, in the same place.</H2>
        <ul className="mt-12 grid gap-3 md:grid-cols-[1.4fr_1fr]">
          <ShotTile
            tone="clear"
            shot={<UploadMock />}
            title="Drop-in uploader"
            body="A React component and a hook that upload straight to your instance, with progress, retries and previews."
          />
          <ShotTile
            tone="ocean"
            shot={<ApiKeysMock />}
            title="API keys"
            body="One key per service, with an expiry. Keys are hashed before they are stored."
          />
          <ShotTile
            tone="dusk"
            shot={<SignedUrlMock />}
            title="Signed URLs"
            muted="Self-hosted."
            body="Private files only open with a link your backend signed. Edit one parameter and it stops working."
            className="md:order-last"
          />
          <ShotTile
            tone="dawn"
            shot={<LogsMock rows={3} />}
            title="Logs"
            body="Every delivery, charted by the hour and kept for a year, with recent video jobs alongside."
          />
        </ul>
      </Container>

      <FaqBlock
        title="Before you switch."
        intro="Something we haven't covered? Ask on GitHub and you'll get an answer from the people who build it."
        faqs={homeFaqs}
      />

      <FinalCta location="footer_cta" />
    </SiteShell>
  );
}
