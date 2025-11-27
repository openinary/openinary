"use client";

import { UploadSection } from "@/components/upload-section";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Breadcrumb, BreadcrumbItem, BreadcrumbSeparator, BreadcrumbList, BreadcrumbPage, BreadcrumbLink } from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";

export default function HomePage() {

  return (
    <>
      <AppSidebar />
      <SidebarInset>
      <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex items-center justify-between w-full px-4">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="-ml-1" />
              <Separator
                orientation="vertical"
                className="mr-2 data-[orientation=vertical]:h-4"
              />
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                      Assets
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>
            <div className="flex items-center gap-2">
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <Upload className="h-4 w-4" />
                    Upload
                  </Button>
                </DialogTrigger>
                <DialogContent className="flex flex-col gap-0 p-0 max-w-2xl [&>button:last-child]:top-3.5">
                  <DialogHeader className="contents space-y-0 text-left">
                    <DialogTitle className="border-b px-6 py-4 text-base">
                      Upload Files
                    </DialogTitle>
                  </DialogHeader>
                  <div className="px-6 py-4">
                    <UploadSection />
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </header>
        <div className="px-4 sm:px-6 py-6 sm:py-8 space-y-6">
            Display a grid of images with the ability to click on them to open a right sidebar with the media file details
            The right sidebar should have the following sections:
            - Media File Name
            - Media File Size
            - Media File Type
            - Media File Created At
            - Media File Updated At
            - Media File URL
            - Media File Thumbnail
            - Media File Preview
            - Media File Actions
            - Media File Transformations
            - Media File Metadata
            - Media File History
            - Media File Analytics
            - Media File Settings
            - Media File Actions
            - Media File Transformations
            - Media File Metadata
            - Media File History
            - Media File Analytics
            - Media File Settings
            - Media File Actions
        </div>
      </SidebarInset>
    </>
  );
}

