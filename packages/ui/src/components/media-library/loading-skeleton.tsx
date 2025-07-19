"use client";

import { Card } from "@repo/ui/components/ui/card";
import { Skeleton } from "@repo/ui/components/ui/skeleton";

interface LoadingSkeletonProps {
  viewMode: "grid" | "list";
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
      {Array.from({ length: 12 }).map((_, index) => (
        <Card
          key={index}
          className="relative border-2 rounded-lg overflow-hidden"
        >
          <Skeleton className="aspect-square w-full" />
        </Card>
      ))}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="grid grid-cols-8 gap-4 p-3 border-b bg-muted/50 text-sm font-medium">
        <div className="col-span-2">Display name</div>
        <div>Containing folder</div>
        <div>Asset type</div>
        <div>Format</div>
        <div>Size</div>
        <div>Dimensions</div>
        <div>Access control</div>
      </div>
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          key={index}
          className="grid grid-cols-8 gap-4 p-3 border-b items-center"
        >
          <div className="col-span-2 flex items-center gap-3">
            <Skeleton className="w-4 h-4 rounded" />
            <Skeleton className="w-10 h-10 rounded" />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-8" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-14" />
        </div>
      ))}
    </div>
  );
}

export function LoadingSkeleton({ viewMode }: LoadingSkeletonProps) {
  return viewMode === "grid" ? <GridSkeleton /> : <ListSkeleton />;
}