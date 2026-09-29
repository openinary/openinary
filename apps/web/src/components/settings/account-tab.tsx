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
import { authClient } from "@/lib/auth-client"
import logger from "@/lib/logger"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "sonner"
import {
  SettingsActions,
  SettingsFields,
  SettingsSection,
  settingsFieldClass,
  settingsFieldLabelClass,
} from "@openinary/ui"

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
    const updateAccount = async () => {
      const result = await authClient.updateUser({
        name: values.name,
        image: values.image || undefined,
      })
      if (result.error) {
        throw new Error(result.error.message || "Failed to update account")
      }
    }

    try {
      await toast.promise(updateAccount(), {
        loading: "Saving changes...",
        success: "Account updated",
        error: (error) =>
          error instanceof Error ? error.message : "Failed to update account",
      }).unwrap()
      accountForm.reset(values)
    } catch (error) {
      logger.error("Error updating account", { error })
    }
  }

  return (
    <Form {...accountForm}>
      <form onSubmit={accountForm.handleSubmit(onAccountSubmit)}>
        <SettingsSection
          title="Profile"
          description="How you appear in this dashboard. The email is the one you sign in with."
        >
        <SettingsFields className="@sm:grid-cols-1">
          <FormField
            control={accountForm.control}
            name="name"
            render={({ field }) => (
              <FormItem className={settingsFieldClass}>
                <FormLabel className={settingsFieldLabelClass}>Name</FormLabel>
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
              <FormItem className={settingsFieldClass}>
                <FormLabel className={settingsFieldLabelClass}>Email</FormLabel>
                <FormControl>
                  <Input
                    disabled
                    type="email"
                    placeholder="your.email@example.com"
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
              <FormItem className={settingsFieldClass}>
                <FormLabel className={settingsFieldLabelClass}>Avatar URL</FormLabel>
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
        </SettingsFields>
        <SettingsActions>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={accountForm.formState.isSubmitting}
            onClick={() => accountForm.reset()}
          >
            Reset
          </Button>
          <Button
            type="submit"
            size="sm"
            className="w-[110px]"
            disabled={accountForm.formState.isSubmitting}
          >
            {accountForm.formState.isSubmitting ? <Spinner size={16} /> : "Save Changes"}
          </Button>
        </SettingsActions>
        </SettingsSection>
      </form>
    </Form>
  )
}

