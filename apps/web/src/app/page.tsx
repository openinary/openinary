"use client";

import { Examples } from "@/components/examples";
import { UploadSection } from "@/components/upload-section";
import { StorageTree } from "@/components/storage-tree";
import { NavHeader } from "@/components/nav-header";

export default function HomePage() {

  return (
    <div className="relative min-h-screen bg-background">
      <NavHeader currentPage="home" />

      <div className="px-4 sm:px-6 py-6 sm:py-8 space-y-6 sm:space-y-8">
        {/* Header Section */}
        <div className="space-y-2">
          <h1 className="text-left text-2xl sm:text-3xl font-semibold lg:text-4xl">
            Try the API now!
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
            Place an image inside your storage folder and modify the URL to transform it.
          </p>
        </div>

        {/* Upload & Storage Section */}
        <section className="flex flex-col lg:flex-row gap-4">
          <UploadSection />
          <StorageTree />
        </section>

        {/* Examples Section */}
        <Examples />
      </div>
    </div>
  );
}
