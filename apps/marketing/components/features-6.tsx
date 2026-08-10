import CodeBlockIllustration from "@/components/ui/illustrations/code-block-illustration";
import { BookOpen } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function FeaturesSection() {
  return (
    <section className="relative @container mx-auto w-full py-10 md:py-20">
      <div className="mx-auto w-full max-w-5xl px-6 py-6 md:py-12">
        <div className="@3xl:grid-cols-3 relative grid gap-12">
          <div className="@3xl:pb-3 flex flex-col justify-between gap-2 @3xl:gap-12">
            <div>
              <h2 className="relative z-10 text-balance text-3xl font-semibold tracking-tight lg:text-4xl">
                Cloudinary-compatible transformations
              </h2>
              <p className="text-muted-foreground my-6 max-w-2xl leading-relaxed">
                Use the same transformation syntax you already know. Resize, crop, convert format and quality — directly from the URL, no code changes needed.
              </p>
            </div>

            <Button asChild data-track-event="docs_clicked" data-track-prop-location="features">
              <Link href="https://docs.openinary.dev/api-reference/introduction" target="_blank">
                <BookOpen className="size-4" />
                API reference
              </Link>
            </Button>
          </div>
          <div className="@3xl:col-span-2 mt-auto h-fit">
            <CodeBlockIllustration />
          </div>
        </div>
      </div>
    </section>
  );
}
