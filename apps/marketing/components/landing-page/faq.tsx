import Link from "next/link";
import { FullWidthDivider } from "../ui/full-width-divider";

export default function FAQsSection() {
  return (
    <section className="px-6 py-10 md:py-20 relative">
      <div>
        <div className="grid gap-y-12 px-2 lg:[grid-template-columns:1fr_auto]">
          <div className="lg:text-left lg:sticky lg:top-[100px] lg:self-start">
            <h2 className="text-3xl font-semibold tracking-tight lg:text-4xl mb-4">
              Frequently <br className="hidden lg:block" /> Asked Questions
            </h2>
            <p className="text-muted-foreground max-w-[600px] leading-relaxed">
              Everything you need to know about deploying and using Openinary.
            </p>
          </div>

          <div className="divide-y divide-dashed sm:mx-auto sm:max-w-lg lg:mx-0">
            <div className="pb-6">
              <h3 className="font-medium">
                How do I deploy Openinary with Docker?
              </h3>
              <p className="text-muted-foreground mt-4">
                Openinary is fully Dockerized and can be deployed on any
                infrastructure. No external dependencies required - it works
                with any S3-compatible storage.
              </p>

              <ol className="list-outside list-decimal space-y-2 pl-4">
                <li className="text-muted-foreground mt-4">
                  Clone the repository and configure environment variables.
                </li>
                <li className="text-muted-foreground mt-4">
                  Run docker-compose up or deploy to your preferred container
                  platform.
                </li>
                <li className="text-muted-foreground mt-4">
                  Configure S3-compatible storage (like Cloudflare R2) -
                  detailed instructions in our{" "}
                  <Link
                    target="_blank"
                    className="underline"
                    href="https://docs.openinary.dev/configuration"
                  >
                    documentation
                  </Link>
                  .
                </li>
              </ol>
            </div>
            <div className="py-6">
              <h3 className="font-medium">
                What are the costs of self-hosting?
              </h3>
              <p className="text-muted-foreground mt-4">
                The self-hosted version is completely free under AGPL 3.0
                license. You only pay for your own infrastructure costs (server,
                storage). Optionally use S3-compatible storage like Cloudflare
                R2 for optimized performance. For most projects, this typically
                costs just a few dollars per month.
              </p>
            </div>
            <div className="py-6">
              <h3 className="font-medium">
                How does Openinary compare to Cloudinary?
              </h3>
              <p className="text-muted-foreground my-4">
                Openinary provides the core features of Cloudinary but as an
                open source, self-hostable solution. You get image
                transformations, API uploads, and edge delivery without vendor
                lock-in or enterprise pricing.
              </p>
              <ul className="list-outside list-disc space-y-2 pl-4">
                <li className="text-muted-foreground">
                  Full control over your media infrastructure
                </li>
                <li className="text-muted-foreground">
                  No usage limits beyond what you configure
                </li>
                <li className="text-muted-foreground">
                  Transparent, AGPL 3.0-licensed codebase you can
                  modify/contribute to
                </li>
              </ul>
            </div>
            <div className="py-6">
              <h3 className="font-medium">Is the Cloud version available?</h3>
              <p className="text-muted-foreground mt-4">
                Yes, Openinary Cloud is live as a public alpha.{" "}
                <Link
                  href="https://app.openinary.dev"
                  className="underline"
                  data-track-event="cloud_waitlist_clicked"
                  data-track-prop-location="faq"
                >
                  Create your account
                </Link>{" "}
                and you&apos;re in: the free plan includes 1 GB of storage, 500
                image transformations, 15 minutes of video processing and
                25,000 CDN requests per month, no credit card required. When
                you outgrow it, the pay-as-you-go plan bills only what you use
                past the included quotas. It&apos;s still early, so expect
                rough edges, and tell us what breaks.
              </p>
            </div>
            <div className="py-6">
              <h3 className="font-medium">
                What image and video formats are supported?
              </h3>
              <p className="text-muted-foreground mt-4">
                Openinary supports common web formats (JPEG, PNG, WebP) for
                images and video processing via FFmpeg. On-the-fly
                transformations include resizing, cropping, format conversion,
                quality optimization, and video transcoding. All transformations
                happen via API for maximum flexibility.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
