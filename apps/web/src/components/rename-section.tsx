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

function splitExtension(name: string): { base: string; extension: string } {
  const lastDot = name.lastIndexOf(".");
  if (lastDot <= 0) return { base: name, extension: "" };
  return { base: name.slice(0, lastDot), extension: name.slice(lastDot) };
}

export function RenameSection({
  currentName,
  keepExtension,
  onRename,
}: {
  currentName: string;
  keepExtension?: boolean;
  onRename: (newName: string) => Promise<boolean>;
}) {
  const { base: currentBase, extension } = keepExtension
    ? splitExtension(currentName)
    : { base: currentName, extension: "" };

  const renameForm = useForm<RenameFormValues>({
    resolver: zodResolver(renameFormSchema),
    defaultValues: {
      name: currentBase,
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
    const newName = `${values.name}${extension}`;
    if (values.name === currentBase) return;
    const success = await onRename(newName);
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
                  {extension ? (
                    <div className="border-input dark:bg-input/30 focus-within:border-ring focus-within:ring-ring/50 flex h-8 w-full min-w-0 items-center rounded-md border bg-transparent shadow-xs transition-[color,box-shadow] focus-within:ring-[3px]">
                      <input
                        type="text"
                        {...field}
                        ref={(el) => {
                          field.ref(el);
                          inputRef.current = el;
                        }}
                        className="min-w-0 flex-1 truncate bg-transparent py-1 pl-3 text-base outline-none md:text-sm"
                      />
                      <span className="text-muted-foreground select-none whitespace-nowrap py-1 pr-3 text-base md:text-sm">
                        {extension}
                      </span>
                    </div>
                  ) : (
                    <Input
                      type="text"
                      {...field}
                      ref={(el) => {
                        field.ref(el);
                        inputRef.current = el;
                      }}
                    />
                  )}
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
