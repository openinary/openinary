"use client"

import { useEffect } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form"
import logger from "@/lib/logger"

const accountFormSchema = z.object({
  name: z.string().min(1, {
    message: "Name is required",
  }),
  email: z.string().email({
    message: "Please enter a valid email address",
  }),
  image: z.union([
    z.string().url({
      message: "Please enter a valid URL",
    }),
    z.literal(""),
  ]).optional(),
})

type AccountFormValues = z.infer<typeof accountFormSchema>

interface AccountTabProps {
  userName: string
  userEmail: string
  userAvatar: string
  isOpen: boolean
}

export function AccountTab({
  userName,
  userEmail,
  userAvatar,
  isOpen,
}: AccountTabProps) {
  const accountForm = useForm<AccountFormValues>({
    resolver: zodResolver(accountFormSchema),
    defaultValues: {
      name: userName,
      email: userEmail,
      image: userAvatar,
    },
  })

  // Update form when user data changes or dialog opens
  useEffect(() => {
    if (isOpen) {
      accountForm.reset({
        name: userName,
        email: userEmail,
        image: userAvatar,
      })
    }
  }, [isOpen, userName, userEmail, userAvatar, accountForm])

  const onAccountSubmit = async (values: AccountFormValues) => {
    try {
      // TODO: Implement account update API call
      // For now, just log the values
      logger.info("Account update", { values })
      // You would typically call something like:
      // await authClient.user.update({ ...values })
      alert("Not implemented yet")
    } catch (error) {
      logger.error("Error updating account", { error })
      alert("Not implemented yet")
    }
  }

  return (
    <Form {...accountForm}>
      <form onSubmit={accountForm.handleSubmit(onAccountSubmit)} className="space-y-4">
        <div className="divide-y rounded-lg border">
          <FormField
            control={accountForm.control}
            name="name"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between gap-4 space-y-0 px-4 py-3">
                <FormLabel className="text-muted-foreground">Name</FormLabel>
                <FormControl>
                  <Input
                    disabled
                    type="text"
                    placeholder="Your name"
                    className="h-auto max-w-52 border-none bg-transparent p-0 text-right shadow-none focus-visible:ring-0"
                    {...field}
                  />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={accountForm.control}
            name="email"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between gap-4 space-y-0 px-4 py-3">
                <FormLabel className="text-muted-foreground">Email</FormLabel>
                <FormControl>
                  <Input
                    disabled
                    type="email"
                    placeholder="your.email@example.com"
                    className="h-auto max-w-52 border-none bg-transparent p-0 text-right shadow-none focus-visible:ring-0"
                    {...field}
                  />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={accountForm.control}
            name="image"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between gap-4 space-y-0 px-4 py-3">
                <FormLabel className="text-muted-foreground">Avatar URL</FormLabel>
                <FormControl>
                  <Input
                    disabled
                    type="url"
                    placeholder="https://example.com/avatar.jpg"
                    className="h-auto max-w-52 border-none bg-transparent p-0 text-right shadow-none focus-visible:ring-0"
                    {...field}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button
            disabled
            type="button"
            variant="ghost"
            onClick={() => accountForm.reset()}
          >
            Reset
          </Button>
          <Button
            type="submit"
            disabled
          >
            {accountForm.formState.isSubmitting ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </form>
    </Form>
  )
}

