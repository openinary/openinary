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
  FormMessage,
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
      alert("Account updated successfully! (This is a placeholder - implement the API call)")
    } catch (error) {
      logger.error("Error updating account", { error })
      alert("Failed to update account")
    }
  }

  return (
    <Form {...accountForm}>
      <form onSubmit={accountForm.handleSubmit(onAccountSubmit)} className="space-y-4">
        <FormField
          control={accountForm.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input
                  type="text"
                  placeholder="Your name"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={accountForm.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  placeholder="your.email@example.com"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={accountForm.control}
          name="image"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Avatar URL (optional)</FormLabel>
              <FormControl>
                <Input
                  type="url"
                  placeholder="https://example.com/avatar.jpg"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-end gap-2 pt-4">
          <Button
            type="button"
            variant="ghost"
            onClick={() => accountForm.reset()}
          >
            Reset
          </Button>
          <Button
            type="submit"
            disabled={accountForm.formState.isSubmitting}
          >
            {accountForm.formState.isSubmitting ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </form>
    </Form>
  )
}

