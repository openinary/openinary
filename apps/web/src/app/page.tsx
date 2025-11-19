"use client";

import { Section } from "@/components/section";
import { UploadSection } from "@/components/upload-section";
import { StorageTree } from "@/components/storage-tree";
import { LogoLink } from "@/components/logo-link";

export default function HomePage() {
  return (
    <div className="relative min-h-screen bg-background">
      
      <Section />
      <section className="flex flex-row gap-4 px-6 py-8">
        <UploadSection />
        <StorageTree />
      </section>
      <LogoLink />
    </div>
  );
}
