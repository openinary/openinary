import { cn } from "../lib/utils";

/**
 * The one shape every settings page is built from. A section names itself on
 * the left and holds its content on the right: labelled fields for anything
 * typed, a bordered list of rows for toggles, values and existing items, and
 * any buttons in a right-aligned row underneath.
 */
export function SettingsSection({
  title,
  description,
  action,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Sits under the description, for something that acts on the section. */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    // Container queries, not breakpoints: what matters is the room the page
    // leaves this section, which the sidebar and any side panel change.
    <section className="@container">
      <div className="grid gap-x-10 gap-y-4 @2xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div>
        <h3 className="flex items-center gap-1 text-sm font-semibold">
          {title}
        </h3>
        {description && (
          <p className="mt-1 text-[13px] text-muted-foreground">
            {description}
          </p>
        )}
        {action && <div className="mt-3">{action}</div>}
      </div>
      <div className="@container space-y-4">{children}</div>
      </div>
    </section>
  );
}

/** Lays fields out two to a line; a field can span both with col-span-full. */
export function SettingsFields({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div className={cn("grid gap-4 @sm:grid-cols-2", className)} {...props} />
  );
}

/** Shared with fields that bring their own label (react-hook-form). */
export const settingsFieldClass = "space-y-1.5";
export const settingsFieldLabelClass = "text-[13px] font-medium";

/** A label over its control, with an optional hint under it. */
export function SettingsField({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is `children`
    <label className={cn("block", settingsFieldClass, className)}>
      <span className={cn("block", settingsFieldLabelClass)}>{label}</span>
      {children}
      {hint && (
        <span className="block text-xs text-muted-foreground">{hint}</span>
      )}
    </label>
  );
}

export function SettingsList({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("divide-y overflow-hidden rounded-lg border", className)}
      {...props}
    />
  );
}

export function SettingsRow({
  label,
  description,
  children,
}: {
  label: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    // Wraps rather than squeezes: once the text would drop under 14rem, the
    // control moves to its own line below it.
    <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5">
      <div className="min-w-[min(100%,14rem)] flex-1">
        <p className="text-sm font-medium">{label}</p>
        {description && (
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {children && (
        <div className="flex shrink-0 items-center gap-1 text-sm">
          {children}
        </div>
      )}
    </div>
  );
}

export function SettingsActions({ children }: { children: React.ReactNode }) {
  return <div className="flex justify-end gap-2">{children}</div>;
}
