"use client";

import logger from "@/lib/logger";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
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

    try {
      const apiUrl =
        process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000";

      const response = await fetch(`${apiUrl}/upload/createfolder`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      const data: FolderCreateResponse = await response.json();

      if (data.success) {
        // Invalidate storage tree query to refresh the data
        queryClient.invalidateQueries({ queryKey: ["storage-tree"] });
        onSuccessfulCreate?.(data.folder!);
      } else {
        folderCreateForm.setError("folder", { message: data.error });
      }
    } catch (error) {
      console.error(error);
      folderCreateForm.setError("folder", { message: "Something went wrong" });
    }
  };

  return (
    <section className="flex-1 my-5">
      <Form {...folderCreateForm}>
        <form
          onSubmit={folderCreateForm.handleSubmit(onFolderSubmit)}
          className="space-y-4"
        >
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
          <div className="flex justify-end gap-2">
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
