"use client";

import { Button } from "@/components/ui/button";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { CopyInput } from "@/components/comp-53";
import Link from "next/link";
import { ImageIcon, VideoIcon } from "lucide-react";
import type { ReactNode } from "react";

type UrlPart = {
  text: string;
  className: string;
  tooltip: string;
};

const examples: {
  title: string;
  description: string;
  icon: ReactNode;
  url: string;
  code: string;
  urlParts: UrlPart[];
}[] = [
  {
    title: "Image resize and format",
    description: "Resize and convert to WebP format",
    icon: <ImageIcon />,
    url: "https://your-instance.com/t/w_800,h_600,f_webp/sample.jpg",
    code: `GET /t/w_800,h_600,f_webp/sample.jpg`,
    urlParts: [
      {
        text: "https://your-instance.com",
        className: "text-muted-foreground",
        tooltip: "Your Openinary instance base URL",
      },
      {
        text: "/t/",
        className: "text-purple-500 dark:text-purple-400",
        tooltip: "Transformation endpoint prefix",
      },
      {
        text: "w_800",
        className: "text-blue-500 dark:text-blue-400",
        tooltip: "Width: resize to 800px",
      },
      {
        text: ",",
        className: "text-muted-foreground",
        tooltip: "Parameter separator",
      },
      {
        text: "h_600",
        className: "text-emerald-500 dark:text-emerald-400",
        tooltip: "Height: resize to 600px",
      },
      {
        text: ",",
        className: "text-muted-foreground",
        tooltip: "Parameter separator",
      },
      {
        text: "f_webp",
        className: "text-amber-500 dark:text-amber-400",
        tooltip: "Format: convert to WebP",
      },
      {
        text: "/",
        className: "text-muted-foreground",
        tooltip: "Path separator",
      },
      {
        text: "sample.jpg",
        className: "text-rose-500 dark:text-rose-400",
        tooltip: "Source file path in your storage",
      },
    ],
  },
  {
    title: "Video thumbnail",
    description: "Extract a frame from video",
    icon: <VideoIcon />,
    url: "https://your-instance.com/t/w_400,h_300,so_5,f_webp/video.mp4",
    code: `GET /t/w_400,h_300,so_5,f_webp/video.mp4`,
    urlParts: [
      {
        text: "https://your-instance.com",
        className: "text-muted-foreground",
        tooltip: "Your Openinary instance base URL",
      },
      {
        text: "/t/",
        className: "text-purple-500 dark:text-purple-400",
        tooltip: "Transformation endpoint prefix",
      },
      {
        text: "w_400",
        className: "text-blue-500 dark:text-blue-400",
        tooltip: "Width: resize to 400px",
      },
      {
        text: ",",
        className: "text-muted-foreground",
        tooltip: "Parameter separator",
      },
      {
        text: "h_300",
        className: "text-emerald-500 dark:text-emerald-400",
        tooltip: "Height: resize to 300px",
      },
      {
        text: ",",
        className: "text-muted-foreground",
        tooltip: "Parameter separator",
      },
      {
        text: "so_5",
        className: "text-cyan-500 dark:text-cyan-400",
        tooltip: "Start offset: extract frame at 5 seconds",
      },
      {
        text: ",",
        className: "text-muted-foreground",
        tooltip: "Parameter separator",
      },
      {
        text: "f_webp",
        className: "text-amber-500 dark:text-amber-400",
        tooltip: "Format: convert to WebP",
      },
      {
        text: "/",
        className: "text-muted-foreground",
        tooltip: "Path separator",
      },
      {
        text: "video.mp4",
        className: "text-rose-500 dark:text-rose-400",
        tooltip: "Source file path in your storage",
      },
    ],
  },
];

export default function TransformationExamplesSection() {
  return (
    <section className="px-6 py-16 md:py-20 relative">
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-4">
          <h2 className="text-3xl font-semibold tracking-tight lg:text-4xl mb-4">
            Looks familiar if you know Cloudinary
          </h2>
          <p className="text-muted-foreground max-w-[600px] leading-relaxed">
            Same powerful URL-based transformations you&apos;re used to, but
            self-hosted and open-source.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {examples.map((example, index) => (
            <Item key={index} variant="outline">
              <ItemMedia variant="icon">{example.icon}</ItemMedia>
              <ItemContent className="w-full gap-4">
                <div>
                  <ItemTitle>{example.title}</ItemTitle>
                  <ItemDescription>{example.description}</ItemDescription>
                </div>
                <CopyInput value={example.url} label="Example URL" />
                <CopyInput value={example.code} label="Code example" />
              </ItemContent>
            </Item>
          ))}
        </div>

        <div className="flex justify-start">
          <Button
            asChild
            variant="link"
            data-track-event="transformations_docs_clicked"
          >
            <Link
              href="https://docs.openinary.dev/media-transformations/overview"
              target="_blank"
              rel="noopener noreferrer"
            >
              See all transformation options
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
