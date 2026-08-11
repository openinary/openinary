import { AlertCircle, DollarSign, Lock } from "lucide-react";

const painPoints = [
  {
    icon: <Lock className="size-5" />,
    title: "Vendor lock-in",
    description: "Stuck with a single provider, difficult to migrate",
  },
  {
    icon: <DollarSign className="size-5" />,
    title: "Unpredictable pricing",
    description: "Unexpected costs that scale unpredictably",
  },
  {
    icon: <AlertCircle className="size-5" />,
    title: "Lack of transparency",
    description: "Black box pricing and limited control over your media",
  },
];

export default function TakeControlSection() {
  return (
    <section className="bg-muted px-6 py-12 border-y">
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-4">
          <h2 className="text-3xl font-semibold lg:text-4xl">
            Take back control of your media
          </h2>
          <p className="text-muted-foreground max-w-[600px]">
            Break free from vendor lock-in and unpredictable pricing. Own your media infrastructure.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-3">
          {painPoints.map((point, index) => (
            <div
              key={index}
              className="bg-card flex flex-col gap-3 p-6 border rounded-lg"
            >
              <div className="bg-muted flex h-10 w-10 items-center justify-center rounded-lg border">
                {point.icon}
              </div>
              <div className="flex flex-col gap-1">
                <h3 className="text-base font-semibold">{point.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {point.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-card mt-4 p-6 border rounded-lg">
          <p className="text-base font-semibold mb-2">
            AGPL 3.0 licensed, self-hosted is free
          </p>
          <p className="text-sm text-muted-foreground">
            You only pay for your infrastructure costs (server + storage). No hidden fees, no usage limits, full transparency.
          </p>
        </div>
      </div>
    </section>
  );
}
