"use client";

import { Section } from "@/components/section";
import { StorageTree } from "@/components/storage-tree";
import Image from "next/image";

export default function HomePage() {
  return (
    <div className="relative min-h-screen bg-background">
      <Section />
      <StorageTree />
      <Image
        className="absolute bottom-4 left-1/2 -translate-x-1/2 opacity-40"
        src="/openinary.svg"
        alt="Openinary"
        width={80}
        height={80}
      />
    </div>
  );
}
