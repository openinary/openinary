"use client";

import { ChevronRight, Image as ImageIcon, Plug, Video } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { useOnboarding } from "@/components/get-started/use-onboarding";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const items = [
  { title: "Integrate", url: "/get-started/integrate", icon: Plug },
  { title: "Images", url: "/get-started/images", icon: ImageIcon },
  { title: "Videos", url: "/get-started/videos", icon: Video },
];

export function NavGetStarted() {
  const pathname = usePathname();
  const { isComplete, isReady } = useOnboarding();
  // Uncontrolled `defaultOpen` would be read at mount, before the checklist
  // sources have answered, so it would always resolve to "open". Null means
  // "the user hasn't decided" - until they click, the checklist decides.
  const [userToggled, setUserToggled] = useState<boolean | null>(null);
  const open = userToggled ?? (isReady ? !isComplete : true);

  return (
    <Collapsible open={open} onOpenChange={setUserToggled} className="group/gs">
      <SidebarGroup>
        <SidebarGroupLabel asChild>
          <CollapsibleTrigger className="flex w-full items-center">
            Get started
            <ChevronRight className="ml-auto transition-transform group-data-[state=open]/gs:rotate-90" />
          </CollapsibleTrigger>
        </SidebarGroupLabel>
        <CollapsibleContent>
          <SidebarMenu>
            {items.map((item) => (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  asChild
                  tooltip={item.title}
                  isActive={pathname === item.url}
                >
                  <Link href={item.url}>
                    <item.icon />
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}
