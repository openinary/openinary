import { cn } from "@/lib/utils";
import type React from "react";
import { FullWidthDivider } from "@/components/ui/full-width-divider";
import { Code2, Globe, Upload, Zap } from "lucide-react";

type FeatureType = {
  title: string;
  icon: React.ReactNode;
  description: string;
};

export function FeatureSection() {
  return (
    <div className="mx-auto w-full place-content-center space-y-12">
      <div className="relative grid grid-cols-1 gap-px bg-border md:grid-cols-2 lg:grid-cols-4">
        <FullWidthDivider position="top" />
        {features.map((feature) => (
          <FeatureCard feature={feature} key={feature.title} />
        ))}
      </div>
    </div>
  );
}

export function FeatureCard({
  feature,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  feature: FeatureType;
}) {
  return (
    <div
      className={cn(
        "relative flex flex-col justify-between overflow-hidden bg-background p-4 md:p-6",
        className,
      )}
      {...props}
    >
      <div
        className={cn(
          "relative z-10 flex items-center gap-3 pb-2 md:flex-col md:items-start md:gap-0 md:pb-0",
          "[&_svg]:size-5 [&_svg]:text-primary",
        )}
      >
        <div className="md:pb-6">{feature.icon}</div>
        <h3 className="font-medium text-foreground text-lg">{feature.title}</h3>
      </div>

      <div className="relative z-10">
        <p className="text-muted-foreground text-xs leading-relaxed">
          {feature.description}
        </p>
      </div>
    </div>
  );
}

const features: FeatureType[] = [
  {
    title: "Upload via API",
    icon: <Upload />,
    description: "Simple REST API for uploading media files programmatically",
  },
  {
    title: "Transformations via URL",
    icon: <Code2 />,
    description: "Transform images and videos on-the-fly using URL parameters",
  },
  {
    title: "Edge delivery",
    icon: <Globe />,
    description: "Fast content delivery optimized for global performance",
  },
  {
    title: "S3-compatible",
    icon: <Zap />,
    description:
      "Works seamlessly with S3, R2, MinIO, and other compatible storage",
  },
];
