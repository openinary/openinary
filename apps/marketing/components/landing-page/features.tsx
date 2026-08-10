"use client";

import { ContainerIcon, CpuIcon, ImageIcon } from "lucide-react";
import Image from "next/image";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEffect, useState } from "react";

const features = [
  {
    icon: <ContainerIcon className="size-5" />,
    title: "Docker-Ready",
    description: "Self-hostable with Docker",
    image: "/image-1.png",
    value: "docker",
  },
  {
    icon: <CpuIcon className="size-5" />,
    title: "API-First",
    description: "On-the-fly image and video processing",
    image: "/image-2.png",
    value: "upload",
  },
  {
    icon: <ImageIcon className="size-5" />,
    title: "Media Transforms",
    description: "Resize, format, and optimize via URL",
    image: "/image-3.png",
    value: "transform",
  },
];

export default function FeaturesSection() {
  const [activeTab, setActiveTab] = useState(features[0]?.value ?? "explore");

  // Preload all images to avoid layout shift
  useEffect(() => {
    features.forEach((feature) => {
      const link = document.createElement("link");
      link.rel = "preload";
      link.as = "image";
      link.href = feature.image;
      document.head.appendChild(link);
    });
  }, []);

  return (
    <section className="w-full border-y">
      <Tabs 
        value={activeTab} 
        onValueChange={setActiveTab}
        className="w-full"
      >
        <TabsList className="flex flex-col lg:flex-row h-auto w-full p-0 bg-transparent rounded-none border-0 gap-0">
          {features.map((feature, index) => (
            <TabsTrigger
              key={feature.value}
              value={feature.value}
              className={`bg-muted data-[state=active]:bg-card flex h-auto min-h-[80px] w-full flex-1 justify-start rounded-none border-0 p-4 text-left shadow-none transition-colors lg:min-h-[100px] lg:p-6 ${
                index < features.length - 1
                  ? "border-border border-b lg:border-r lg:border-b-0"
                  : ""
              }`}
            >
              <div className="flex w-full flex-row items-center gap-3">
                <div className="border-border flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border shadow-none lg:h-10 lg:w-10">
                  {feature.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm lg:text-base font-medium leading-tight mb-1 break-words">
                    {feature.title}
                  </h3>
                  <p className="text-muted-foreground text-sm font-normal leading-relaxed break-words lg:text-sm">
                    {feature.description}
                  </p>
                </div>
              </div>
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="w-full border-t">
          <div className="relative w-full" style={{ aspectRatio: '1920 / 1080', minHeight: '400px' }}>
            {features.map((feature, index) => (
              <div
                key={feature.value}
                className={`absolute inset-0 transition-opacity duration-300 ease-in-out ${
                  activeTab === feature.value
                    ? "opacity-100 pointer-events-auto z-10"
                    : "opacity-0 pointer-events-none z-0"
                }`}
              >
                <div className="relative w-full h-full overflow-hidden">
                  <Image
                    src={feature.image}
                    alt={feature.title}
                    fill
                    priority={index === 0}
                    loading={index === 0 ? "eager" : "eager"}
                    className="object-cover"
                    sizes="100vw"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </Tabs>
    </section>
  );
}
