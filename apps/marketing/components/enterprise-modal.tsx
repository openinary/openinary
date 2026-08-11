"use client";

import { Building2, CheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useActionState } from "react";
import { submitEnterprise } from "@/app/actions/enterprise";
import posthog from "posthog-js";

type FormState = { success: boolean; error?: string };
const initialState: FormState = { success: false };

export function EnterpriseModal({ trigger }: { trigger: React.ReactNode }) {
  const [state, formAction, isPending] = useActionState<FormState, FormData>(
    async (_prev, formData) => {
      const result = await submitEnterprise(formData);
      if (result.success) {
        posthog.identify(formData.get("email") as string, {
          company: formData.get("company") as string,
        });
        posthog.capture("enterprise_submitted");
      }
      return result;
    },
    initialState
  );

  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <div className="mb-2 flex flex-col items-center gap-2">
          <div
            aria-hidden="true"
            className="flex size-11 shrink-0 items-center justify-center rounded-full border"
          >
            {state.success ? (
              <CheckIcon className="size-5 text-foreground" />
            ) : (
              <Building2 className="size-5 text-foreground" />
            )}
          </div>
          <DialogHeader>
            <DialogTitle className="sm:text-center">
              {state.success ? "Request sent!" : "Talk to our team"}
            </DialogTitle>
            <DialogDescription className="sm:text-center">
              {state.success
                ? "We'll reach out within 24 hours."
                : "Tell us about your use case and we'll get back to you within 24h."}
            </DialogDescription>
          </DialogHeader>
        </div>

        {!state.success && (
          <form action={formAction} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ent-email">Work email</Label>
              <Input
                id="ent-email"
                name="email"
                type="email"
                placeholder="jane@yourcompany.com"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ent-company">Company</Label>
                <Input id="ent-company" name="company" placeholder="Acme Corp" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ent-team-size">Team size</Label>
                <Select name="teamSize">
                  <SelectTrigger id="ent-team-size">
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1-10">1–10</SelectItem>
                    <SelectItem value="11-50">11–50</SelectItem>
                    <SelectItem value="51-200">51–200</SelectItem>
                    <SelectItem value="201+">201+</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ent-volume">Monthly media volume</Label>
              <Select name="monthlyVolume">
                <SelectTrigger id="ent-volume">
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="<10k">&lt; 10k transformations</SelectItem>
                  <SelectItem value="10k-100k">10k – 100k</SelectItem>
                  <SelectItem value="100k-1m">100k – 1M</SelectItem>
                  <SelectItem value="1m+">1M+</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ent-message">
                Message{" "}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Textarea
                id="ent-message"
                name="message"
                placeholder="Describe your needs, constraints, or timeline…"
                rows={3}
              />
            </div>

            {state.error && (
              <p className="text-sm text-destructive">{state.error}</p>
            )}

            <Button className="w-full" type="submit" disabled={isPending}>
              {isPending ? "Sending…" : "Send request"}
            </Button>
          </form>
        )}

        <p className="text-center text-muted-foreground text-xs">
          By submitting you agree to our{" "}
          <a className="underline hover:no-underline" href="/privacy">
            Privacy Policy
          </a>
          .
        </p>
      </DialogContent>
    </Dialog>
  );
}
