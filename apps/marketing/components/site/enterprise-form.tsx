"use client";

import { CheckCircle2, X } from "lucide-react";
import { useId, useRef, useState, useTransition } from "react";

import { submitEnterprise } from "@/app/actions/enterprise";
import { buttonClass, focusRing } from "@/components/site/ui";
import { cn } from "@/lib/utils";

/**
 * The enterprise lead form. Lands in Attio through submitEnterprise; option
 * values are the ones the Attio columns already hold, so keep them as they are.
 */
const field = cn(
  "h-9 w-full rounded-lg bg-well px-3 text-[13px] text-ink-12 shadow-rule-strong placeholder:text-ink-9 transition-shadow hover:shadow-rule-strong",
  focusRing,
);

const teamSizes = [
  ["1-10", "1 to 10 people"],
  ["11-50", "11 to 50 people"],
  ["51-200", "51 to 200 people"],
  ["201+", "More than 200"],
];

const volumes = [
  ["<10k", "Under 10k transformations"],
  ["10k-100k", "10k to 100k"],
  ["100k-1m", "100k to 1M"],
  ["1m+", "More than 1M"],
];

function Label({ htmlFor, children, optional }: { htmlFor: string; children: string; optional?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-[12px] text-ink-11">
      {children}
      {optional ? <span className="text-ink-9"> (optional)</span> : null}
    </label>
  );
}

export function EnterpriseForm() {
  const [pending, start] = useTransition();
  const id = useId(); // two forms can share a page (plan strip and table)
  const [state, setState] = useState<{ done?: boolean; error?: string }>({});

  if (state.done) {
    return (
      <div className="flex min-h-[420px] flex-col items-center justify-center px-6 text-center">
        <CheckCircle2 aria-hidden className="size-6 text-ok" />
        <p className="mt-4 text-[17px] tracking-[-0.02em] text-ink-12">Thanks, it&apos;s with us.</p>
        <p className="mt-1.5 max-w-[320px] text-[13px] leading-5 text-ink-11">
          One of the people who build Openinary will reply by email.
        </p>
      </div>
    );
  }

  return (
    <form
      action={(data) =>
        start(async () => {
          const res = await submitEnterprise(data);
          setState(res.success ? { done: true } : { error: res.error });
        })
      }
      className="grid gap-4 p-5 text-left md:p-7"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor={`${id}-email`}>Work email</Label>
          <input id={`${id}-email`} name="email" type="email" required autoComplete="email" placeholder="jane@acme.com" className={field} />
        </div>
        <div>
          <Label htmlFor={`${id}-company`}>Company</Label>
          <input id={`${id}-company`} name="company" required autoComplete="organization" placeholder="Acme" className={field} />
        </div>
        <div>
          <Label htmlFor={`${id}-team`} optional>
            Team size
          </Label>
          <select id={`${id}-team`} name="teamSize" defaultValue="" className={field}>
            <option value="">Pick one</option>
            {teamSizes.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor={`${id}-volume`} optional>
            Monthly volume
          </Label>
          <select id={`${id}-volume`} name="monthlyVolume" defaultValue="" className={field}>
            <option value="">Pick one</option>
            {volumes.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <Label htmlFor={`${id}-message`} optional>
          What are you weighing up?
        </Label>
        <textarea
          id={`${id}-message`}
          name="message"
          rows={5}
          placeholder="Where your media lives today, what you serve each month, and any deadline."
          className={cn(field, "h-auto resize-none py-2.5 leading-5")}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <p role="status" className={cn("text-[12px]", state.error ? "text-bad" : "text-ink-10")}>
          {state.error ?? "We reply by email, from a person."}
        </p>
        <button
          type="submit"
          disabled={pending}
          data-track-event="enterprise_submitted"
          className={buttonClass("primary", "disabled:opacity-60")}
        >
          {pending ? "Sending" : "Send"}
        </button>
      </div>
    </form>
  );
}

/**
 * "Talk to us": a button that opens the form in a modal. Native <dialog>, so
 * focus trapping, Escape and the top layer come from the browser.
 */
export function TalkToUs({
  location,
  className,
  children = "Talk to us",
}: {
  location: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        data-track-event="enterprise_clicked"
        data-track-prop-location={location}
        className={className ?? buttonClass("secondary")}
      >
        {children}
      </button>
      <dialog
        ref={ref}
        aria-labelledby={`talk-${location}`}
        // A click on the backdrop lands on the dialog itself, not its content.
        onClick={(e) => e.target === e.currentTarget && ref.current?.close()}
        className="m-auto w-[calc(100%-32px)] max-w-[560px] shot-rim text-left text-ink-12 backdrop:bg-black/60 backdrop:backdrop-blur-[2px]"
      >
        <div className="overflow-hidden rounded-[11px] bg-frame">
          <div className="flex items-start justify-between gap-4 border-b-[0.5px] border-rule px-5 pt-5 pb-4 md:px-7">
            <div>
              <h2 id={`talk-${location}`} className="text-[17px] tracking-[-0.02em]">
                Talk to the people who build it
              </h2>
              <p className="mt-1 text-[13px] leading-5 text-ink-11">
                Volume rates, help moving off Cloudinary, or running it in-house. Tell us where you are.
              </p>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={() => ref.current?.close()}
              className={cn("grid size-7 shrink-0 place-items-center rounded-md text-ink-10 hover:text-ink-12", focusRing)}
            >
              <X className="size-4" />
            </button>
          </div>
          <EnterpriseForm />
        </div>
      </dialog>
    </>
  );
}
