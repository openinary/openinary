"use client";

import { useHydrated } from "../hooks/use-hydrated";
import { SidebarInset } from "../ui/sidebar";
import { Sheet } from "./page";

/**
 * Where every page renders, beside the sidebar. Pages mount on the client
 * only, so their skeletons can draw the shape they remembered (useHydrated);
 * the server paints the bare sheet they will sit on.
 */
export function ShellInset({ children }: { children: React.ReactNode }) {
  const hydrated = useHydrated();
  return <SidebarInset>{hydrated ? children : <Sheet />}</SidebarInset>;
}
