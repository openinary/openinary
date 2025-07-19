"use client";

import { ThemeSwitcher } from "@repo/ui/components/theme-switcher";
import NavBreadcrumb from "@repo/ui/components/nav-breadcrumb";
import UploadButton from "@repo/ui/components/upload-button";
import MediaLibrary from "@repo/ui/components/media-library/index";
import { useFolderFiles } from "@/lib/hooks/use-folder-files";
import { uploadMultipleFilesAction, deleteFileAction } from "@/lib/actions";
import { useRouter } from "next/navigation";

interface FolderPageProps {
  params: {
    folderKey: string;
  };
}

export default function FolderPage({ params }: FolderPageProps) {
  const { folderKey } = params;
  const router = useRouter();
  const {
    data: mediaResult,
    isLoading,
    error,
    refetch,
  } = useFolderFiles(folderKey);

  const handleFileDeleted = () => {
    refetch();
  };

  const handleDeleteFile = async (key: string) => {
    return await deleteFileAction(key);
  };

  const handleFolderClick = (folderKey: string) => {
    router.push(`/${folderKey}`);
  };

  return (
    <div className="min-h-screen flex">
      <div className="flex-1 flex flex-col">
        <div className="border-b px-4 sm:px-5 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-4 min-w-0">
              <NavBreadcrumb folderKey={folderKey} />
            </div>
            <div className="flex items-center gap-2 sm:gap-4">
              <ThemeSwitcher />
              <UploadButton uploadAction={uploadMultipleFilesAction} />
            </div>
          </div>
        </div>

        <MediaLibrary
          mediaResult={mediaResult}
          isLoading={isLoading}
          onFileDeleted={handleFileDeleted}
          onDeleteFile={handleDeleteFile}
          onFolderClick={handleFolderClick}
        />
      </div>
    </div>
  );
}
