import { cn } from "../lib/utils";

/**
 * The one shape every settings page is built from: a titled section holding a
 * bordered list of rows, label on the left and its control or value on the
 * right, with any buttons in a right-aligned row underneath.
 */
export function SettingsSection({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  /** Sits on the title row, for something that acts on the whole section. */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {description && (
            <p className="mt-1 text-[13px] text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {action}
      </div>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
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

/** Shared with form rows that bring their own wrapper (react-hook-form). */
export const settingsRowClass =
  "flex min-h-12 items-center justify-between gap-4 space-y-0 px-4 py-2.5";

export const settingsLabelClass = "text-sm font-medium";

/** An input that reads as the row's value rather than as a box in a box. */
export const settingsFieldClass =
  "h-auto w-80 max-w-full rounded-none border-none bg-transparent p-0 text-right shadow-none focus-visible:ring-0 dark:bg-transparent";

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
    <div className={settingsRowClass}>
      <div className="min-w-0">
        <p className={settingsLabelClass}>{label}</p>
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
