"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef } from "react";
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
import { Spinner } from "./ui/spinner";

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

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => clearTimeout(timeout);
  }, []);

  const onSubmit = async (values: RenameFormValues) => {
    if (values.name === currentName) return;
    const success = await onRename(values.name);
    if (!success) {
      renameForm.setError("name", { message: "Failed to rename" });
    }
  };

  return (
    <section className="flex-1">
      <Form {...renameForm}>
        <form onSubmit={renameForm.handleSubmit(onSubmit)}>
          <FormField
            control={renameForm.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input
                    type="text"
                    {...field}
                    ref={(el) => {
                      field.ref(el);
                      inputRef.current = el;
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="-mx-4 -mb-4 mt-4 flex justify-end gap-2 rounded-b-lg border-t bg-muted/50 px-4 py-4">
            <Button type="submit" className="w-[80px]" disabled={renameForm.formState.isSubmitting}>
              {renameForm.formState.isSubmitting ? <Spinner size={16} /> : "Rename"}
            </Button>
          </div>
        </form>
      </Form>
    </section>
  );
}
