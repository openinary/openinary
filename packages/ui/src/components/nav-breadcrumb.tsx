import { FoldersIcon, HomeIcon } from "lucide-react"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@repo/ui/components/ui/breadcrumb"

interface NavBreadcrumbProps {
  folderKey?: string;
}

export default function NavBreadcrumb({ folderKey }: NavBreadcrumbProps) {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href="/" className="flex items-center gap-2">
            <HomeIcon size={16} />
            Home
          </BreadcrumbLink>
        </BreadcrumbItem>
        {folderKey && (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage className="flex items-center gap-2">
                <FoldersIcon size={16} />
                {folderKey}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
