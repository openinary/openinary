"use client";

import { CopyInput } from "@/components/ui/copy-input";
import { useMemo } from "react";

export function Examples() {
  const exampleUrls = useMemo(() => {
    const baseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/api$/, "");
    return [
      {
        title: "Resize image to 300x200",
        url: `${baseUrl}/t/resize:300x200/image.png`,
      },
      {
        title: "Convert to WebP with 80% quality",
        url: `${baseUrl}/t/format:webp/quality:80/image.png`,
      },
      {
        title: "Smart crop to square with face detection",
        url: `${baseUrl}/t/gravity:face/resize:400x400/image.png`,
      },
      {
        title: "Resize video with 80% quality",
        url: `${baseUrl}/t/resize:640x360/quality:80/video.mp4`,
      },
    ];
  }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-left text-xl font-semibold">
        Examples
      </h2>
    <div className="grid gap-4 md:grid-cols-2">
      {exampleUrls.map((example, index) => (
        <div
          key={index}
          className="p-4 rounded-lg border border-black/10 bg-neutral-50"
        >
          <h3 className="font-medium mb-2">{example.title}</h3>
          <CopyInput value={example.url} />
        </div>
      ))}
    </div>
    </div>
  );
}