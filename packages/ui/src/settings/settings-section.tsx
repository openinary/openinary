import { cn } from "../lib/utils";

/**
 * The one shape every settings page is built from: a tile. Its head names the
 * section (with an optional action on the right), its body holds labelled
 * fields for anything typed, a list of rows for toggles, values and existing
 * items, and any buttons in a right-aligned row underneath.
 */
export function SettingsSection({
  title,
  description,
  action,
  danger,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Sits at the right of the head, for something that acts on the section. */
  action?: React.ReactNode;
  /** A destructive section: red edge and title. Goes last on the page. */
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("ds-tile", danger && "ds-tile-danger")}>
      <div className="flex min-h-12 flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <div className="min-w-[min(100%,14rem)] flex-1">
          <h3
            className={cn(
              "flex items-center gap-1 font-medium text-[14px]/5",
              danger && "text-ds-red",
            )}
          >
            {title}
          </h3>
          {description && (
            <p className="mt-0.5 text-[13px]/5 text-ds-muted text-pretty">
              {description}
            </p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="ds-tile-divider" />
      <div className="@container space-y-4 p-4">{children}</div>
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
export const settingsFieldLabelClass = "text-[13px]/5 font-medium text-ds-muted";

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
        <span className="block text-[12.5px]/[18px] text-ds-faint">{hint}</span>
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
      className={cn("ds-tile-inner divide-y divide-(--ds-rule)", className)}
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
        <p className="font-medium text-[13px]/5">{label}</p>
        {description && (
          <p className="mt-0.5 text-[13px]/5 text-ds-muted">
            {description}
          </p>
        )}
      </div>
      {children && (
        <div className="flex shrink-0 items-center gap-1 text-[13px]">
          {children}
        </div>
      )}
    </div>
  );
}

export function SettingsActions({ children }: { children: React.ReactNode }) {
  return <div className="flex justify-end gap-2">{children}</div>;
}
