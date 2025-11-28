"use client"

import { Settings, History, BarChart3 } from "lucide-react"
import { Separator } from "@/components/ui/separator"
import type { MediaFile } from "./types"

interface AssetMetadataTabProps {
  asset: MediaFile
}

export function AssetMetadataTab({ asset }: AssetMetadataTabProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Settings className="h-4 w-4" />
          File Metadata
        </h3>
        <div className="text-sm text-muted-foreground space-y-1">
          <div>
            <span className="font-medium">Path:</span> {asset.path}
          </div>
          <div>
            <span className="font-medium">ID:</span> {asset.id}
          </div>
          <div>
            <span className="font-medium">Type:</span> {asset.type}
          </div>
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <History className="h-4 w-4" />
          History
        </h3>
        <div className="text-sm text-muted-foreground">
          Asset history and version information will be displayed here.
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          Analytics
        </h3>
        <div className="text-sm text-muted-foreground">
          Usage statistics and analytics will be displayed here.
        </div>
      </div>
    </div>
  )
}

