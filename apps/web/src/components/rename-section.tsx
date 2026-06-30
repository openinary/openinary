"use client";

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

const renameFormSchema = z.object({
  name: z.string().min(1, { message: "Name is required" }),
});

type RenameFormValues = z.infer<typeof renameFormSchema>;

export function RenameSection({
  currentName,
  onRename,
}: {
  currentName: string;
  onRename: (newName: string) => Promise<boolean>;
}) {
  const renameForm = useForm<RenameFormValues>({
    resolver: zodResolver(renameFormSchema),
    defaultValues: {
      name: currentName,
    },
  });

  const onSubmit = async (values: RenameFormValues) => {
    if (values.name === currentName) return;
    const success = await onRename(values.name);
    if (!success) {
      renameForm.setError("name", { message: "Failed to rename" });
    }
  };

  return (
    <section className="flex-1 my-5">
      <Form {...renameForm}>
        <form
          onSubmit={renameForm.handleSubmit(onSubmit)}
          className="space-y-4"
        >
          <FormField
            control={renameForm.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input type="text" autoFocus {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="flex justify-end gap-2">
            <Button type="submit">
              {renameForm.formState.isSubmitting ? "Renaming..." : "Rename"}
            </Button>
          </div>
        </form>
      </Form>
    </section>
  );
}
