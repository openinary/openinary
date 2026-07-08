"use client";

import { useEffect, useState } from "react";
import { Laptop, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useHideThumbnails } from "@/hooks/use-hide-thumbnails";

const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Laptop },
] as const;

export function AppearanceTab() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [hideThumbnails, setHideThumbnails] = useHideThumbnails();

  // Avoid a hydration mismatch: next-themes only knows the resolved theme
  // once mounted on the client.
  useEffect(() => setMounted(true), []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
        <div>
          <p className="text-sm font-medium">Theme</p>
          <p className="text-xs text-muted-foreground">
            Pick a theme. &quot;System&quot; follows your OS appearance
            setting and updates automatically when it changes.
          </p>
        </div>
        <div className="flex shrink-0 gap-1 rounded-full border bg-muted/40 p-1">
          {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTheme(value)}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors",
                mounted && theme === value
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
        <div>
          <p className="text-sm font-medium">Hide thumbnails</p>
          <p className="text-xs text-muted-foreground">
            Show a generic icon per file type or folder instead of a
            thumbnail preview, for better performance in the dashboard. Grid
            and list views are affected; the Asset Details sidebar still
            shows the full preview.
          </p>
        </div>
        <Switch
          checked={hideThumbnails}
          onCheckedChange={setHideThumbnails}
        />
      </div>
    </div>
  );
}
