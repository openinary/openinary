"use client";

import logger from "@/lib/logger";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import z from "zod";
import { Button } from "./ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "./ui/form";
import { Input } from "./ui/input";
import { useQueryClient } from "@tanstack/react-query";

interface FolderCreateResponse {
  success: boolean;
  folder: string | null;
  error?: string;
}

const folderCreateFormSchema = z.object({
  folder: z.string().min(1, {
    message: "Folder name is required",
  }),
});

type FolderCreateFormValues = z.infer<typeof folderCreateFormSchema>;

export function CreateFolderSection({
  uploadToFolder,
  onSuccessfulCreate,
}: {
  uploadToFolder?: string;
  onSuccessfulCreate?: (folder: string) => void;
}) {
  const queryClient = useQueryClient();
  const folderCreateForm = useForm<FolderCreateFormValues>({
    resolver: zodResolver(folderCreateFormSchema),
    defaultValues: {
      folder: "",
    },
  });

  const onFolderSubmit = async (values: FolderCreateFormValues) => {
    const formData = new FormData();
    formData.append("folder", [uploadToFolder, values.folder].join("/"));

    const createFolder = async () => {
      const apiUrl =
        process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000";

      const response = await fetch(`${apiUrl}/upload/createfolder`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      const data: FolderCreateResponse = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Something went wrong");
      }

      return data;
    };

    try {
      const data = await toast.promise(createFolder(), {
        loading: `Creating "${values.folder}"...`,
        success: `Folder "${values.folder}" created`,
        error: (error) =>
          error instanceof Error ? error.message : "Something went wrong",
      }).unwrap();

      // Invalidate storage tree query to refresh the data
      queryClient.invalidateQueries({ queryKey: ["storage-tree"] });
      onSuccessfulCreate?.(data.folder!);
    } catch (error) {
      console.error(error);
      folderCreateForm.setError("folder", {
        message: error instanceof Error ? error.message : "Something went wrong",
      });
    }
  };

  return (
    <section className="flex-1">
      <Form {...folderCreateForm}>
        <form onSubmit={folderCreateForm.handleSubmit(onFolderSubmit)}>
          <FormField
            control={folderCreateForm.control}
            name="folder"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Folder name</FormLabel>
                <FormControl>
                  <Input
                    type="text"
                    placeholder="The folders name"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="-mx-4 -mb-4 mt-4 flex justify-end gap-2 rounded-b-lg border-t bg-muted/50 px-4 py-4">
            <Button type="submit">
              {folderCreateForm.formState.isSubmitting
                ? "Creating..."
                : "Create folder"}
            </Button>
          </div>
        </form>
      </Form>
    </section>
  );
}
