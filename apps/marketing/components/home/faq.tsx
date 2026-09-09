import Link from "next/link";
import { ChevronDown } from "lucide-react";

import { Eyebrow, Section, gutter } from "@/components/home/section";
import { focusRing, pressable } from "@/components/home/cta-button";
import { cn } from "@/lib/utils";

const faqs: { question: string; answer: React.ReactNode }[] = [
  {
    question: "How do I deploy Openinary with Docker?",
    answer: (
      <>
        Openinary is fully Dockerized and runs on any infrastructure, with no
        external dependencies beyond an S3-compatible bucket. Clone the
        repository, set your environment variables, run{" "}
        <code className="font-mono text-[0.9em]">docker compose up</code>, then
        point it at your storage. Every step is in the{" "}
        <Link
          href="https://docs.openinary.dev/configuration"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2"
        >
          documentation
        </Link>
        .
      </>
    ),
  },
  {
    question: "What are the costs of self-hosting?",
    answer:
      "The self-hosted version is free under the AGPL 3.0 licence. You pay only for your own infrastructure, the server and the storage behind it. With an S3-compatible bucket like Cloudflare R2, most projects land at a few dollars per month.",
  },
  {
    question: "How does Openinary compare to Cloudinary?",
    answer:
      "Openinary covers the core of what Cloudinary does, as open source you can host yourself: transformations, API uploads and edge delivery, without vendor lock-in or enterprise pricing. Your media stays in your own bucket, there are no usage limits beyond the ones you configure, and the whole codebase is AGPL 3.0 so you can read it, modify it and contribute back.",
  },
  {
    question: "Is the Cloud version available?",
    answer: (
      <>
        Yes, Openinary Cloud is live as a public alpha.{" "}
        <Link
          href="https://app.openinary.dev"
          target="_blank"
          rel="noopener noreferrer"
          data-track-event="cloud_waitlist_clicked"
          data-track-prop-location="faq"
          className="underline underline-offset-2"
        >
          Create your account
        </Link>{" "}
        and you are in: the free plan includes 2 GB of storage, 1,000 image
        transformations, 30 minutes of video processing and 50,000 CDN requests
        per month, no credit card required. When you outgrow it, the
        pay-as-you-go plan bills only what you use past the included quotas. It
        is still early, so expect rough edges, and tell us what breaks.
      </>
    ),
  },
  {
    question: "What image and video formats are supported?",
    answer:
      "JPEG, PNG, WebP and AVIF for images, and video processing through FFmpeg. Transformations happen on the fly: resizing, cropping, format conversion, quality optimization and video transcoding, all driven from the URL or the API.",
  },
];

export function Faq() {
  return (
    <Section>
      <div className={`${gutter} pb-14 pt-14 md:pb-20 md:pt-20`}>
        <Eyebrow>Questions</Eyebrow>

        <div className="mt-6 max-w-[672px]">
          {faqs.map(({ question, answer }) => (
            <details
              key={question}
              className="group border-b border-border py-3 last:border-b-0"
            >
              <summary
                className={cn(
                  "flex list-none items-center justify-between gap-4 rounded-sm py-1 text-[15px] font-medium leading-[1.5] text-foreground marker:hidden [&::-webkit-details-marker]:hidden",
                  focusRing,
                  pressable,
                )}
              >
                {question}
                <ChevronDown
                  className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
                  aria-hidden
                />
              </summary>
              <div className="pb-3 pr-8 pt-3 text-sm leading-[1.63] text-muted-foreground">
                {answer}
              </div>
            </details>
          ))}
        </div>
      </div>
    </Section>
  );
}
