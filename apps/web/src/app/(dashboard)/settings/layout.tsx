import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { SidebarInset } from "@/components/ui/sidebar";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <AppSidebar />
      <SidebarInset>{children}</SidebarInset>
    </>
  );
}
