import { Code2, Globe, Upload, Zap } from "lucide-react";

const features = [
  {
    icon: <Upload className="size-5" />,
    title: "Upload via API",
    description: "Simple REST API for uploading media files programmatically",
  },
  {
    icon: <Code2 className="size-5" />,
    title: "Transformations via URL",
    description: "Transform images and videos on-the-fly using URL parameters",
  },
  {
    icon: <Globe className="size-5" />,
    title: "Edge delivery",
    description: "Fast content delivery optimized for global performance",
  },
  {
    icon: <Zap className="size-5" />,
    title: "S3-compatible",
    description: "Works seamlessly with S3, R2, MinIO, and other compatible storage",
  },
];

export default function BuiltForDevelopersSection() {
  return (
    <section className="px-6 py-12 border-t">
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-4">
          <h2 className="text-3xl font-semibold lg:text-4xl">
            Built for developers
          </h2>
          <p className="text-muted-foreground max-w-[600px]">
            Designed with developers in mind. Simple APIs, powerful features, full control.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature, index) => (
            <div
              key={index}
              className="flex flex-col gap-3 p-4 border rounded-lg"
            >
              <div className="bg-muted flex h-10 w-10 items-center justify-center rounded-lg border">
                {feature.icon}
              </div>
              <div className="flex flex-col gap-1">
                <h3 className="text-base font-semibold">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
