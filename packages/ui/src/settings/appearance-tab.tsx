"use client";

import { useEffect, useState } from "react";
import { Laptop, Moon, Sun } from "lucide-react";
import { motion } from "framer-motion";
import { useTheme } from "next-themes";
import { SettingsList, SettingsRow, SettingsSection } from "./settings-section";
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
    <SettingsSection
      title="Interface"
      description="How this dashboard looks and behaves in this browser."
    >
      <SettingsList>
        <SettingsRow
          label="Theme"
          description={
            <>
              Pick a theme. &quot;System&quot; follows your OS appearance
              setting and updates automatically when it changes.
            </>
          }
        >
          <div className="flex w-fit gap-0.5 rounded-xl bg-muted p-[3px]">
            {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setTheme(value)}
                className={cn(
                  "relative flex h-8 items-center gap-1.5 rounded-[9px] px-2.5 text-sm font-medium transition-colors",
                  mounted && theme === value
                    ? "font-semibold text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {mounted && theme === value && (
                  <motion.div
                    layoutId="theme-active"
                    className="absolute inset-0 rounded-[9px] border bg-background shadow-xs dark:bg-input"
                    transition={{ type: "tween", duration: 0.2, ease: "easeOut" }}
                  />
                )}
                <Icon className="relative size-4" />
                <span className="relative">{label}</span>
              </button>
            ))}
          </div>
        </SettingsRow>
        <SettingsRow
          label="Hide thumbnails"
          description="Show a generic icon per file type or folder instead of a thumbnail preview, for better performance in the dashboard. Grid and list views are affected; the Asset Details sidebar still shows the full preview."
        >
          <Switch
            checked={hideThumbnails}
            onCheckedChange={setHideThumbnails}
          />
        </SettingsRow>
      </SettingsList>
    </SettingsSection>
  );
}
