"use client";

import { useEffect, useState } from "react";
import { Laptop, Moon, Sun } from "lucide-react";
import { motion } from "framer-motion";
import { useTheme } from "next-themes";
import { Separator } from "../ui/separator";
import { Switch } from "../ui/switch";
import { cn } from "../lib/utils";
import { useHideThumbnails } from "../hooks/use-hide-thumbnails";

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
      <div>
        <p className="text-sm font-medium">Theme</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Pick a theme. &quot;System&quot; follows your OS appearance
          setting and updates automatically when it changes.
        </p>
        <div className="mt-3 flex w-fit gap-1 rounded-full border bg-muted/40 p-1">
          {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTheme(value)}
              className={cn(
                "relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors",
                mounted && theme === value
                  ? "text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {mounted && theme === value && (
                <motion.div
                  layoutId="theme-active"
                  className="absolute inset-0 rounded-full bg-foreground"
                  transition={{ type: "tween", duration: 0.2, ease: "easeOut" }}
                />
              )}
              <Icon className="relative size-4" />
              <span className="relative">{label}</span>
            </button>
          ))}
        </div>
      </div>

      <Separator />

      <div>
        <p className="text-sm font-medium">Hide thumbnails</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Show a generic icon per file type or folder instead of a
          thumbnail preview, for better performance in the dashboard. Grid
          and list views are affected; the Asset Details sidebar still
          shows the full preview.
        </p>
        <div className="mt-3">
          <Switch
            checked={hideThumbnails}
            onCheckedChange={setHideThumbnails}
          />
        </div>
      </div>
    </div>
  );
}
