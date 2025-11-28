"use client"

import { useQueryState } from "nuqs"
import { PanelRight } from "lucide-react"
import { Button } from "@/components/ui/button"

export function AssetDetailsSidebarTrigger({
  onClick,
}: {
  onClick?: () => void
}) {
  const [assetId] = useQueryState("asset")

  const handleClick = () => {
    if (onClick) {
      onClick()
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-7"
      onClick={handleClick}
      disabled={!assetId}
    >
      <PanelRight className="h-4 w-4" />
      <span className="sr-only">Toggle Asset Details Sidebar</span>
    </Button>
  )
}

