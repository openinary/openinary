import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Check } from "lucide-react";

const storageProviders = [
  "Amazon S3",
  "Cloudflare R2",
  "MinIO",
  "DigitalOcean Spaces",
  "Backblaze B2",
  "Any S3-compatible storage",
];

export default function StorageCompatibilitySection() {
  return (
    <section className="px-6 py-12 border-b">
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-4">
          <h2 className="text-3xl font-semibold lg:text-4xl">
            Works with your storage
          </h2>
          <p className="text-muted-foreground max-w-[600px]">
            Use your existing S3-compatible storage infrastructure. No need to
            migrate or change providers.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {storageProviders.map((provider, index) => (
            <div
              key={index}
              className="flex items-center gap-2 p-4 border rounded-lg"
            >
              <Check className="size-5 text-green-600 flex-shrink-0" />
              <span className="text-sm font-medium">{provider}</span>
            </div>
          ))}
        </div>

        <div className="flex justify-start">
          <Button
            asChild
            size="lg"
            variant="link"
            data-track-event="configuration_docs_clicked"
          >
            <Link
              href="https://docs.openinary.dev/configuration/storage"
              target="_blank"
              rel="noopener noreferrer"
            >
              How to configure yours
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
