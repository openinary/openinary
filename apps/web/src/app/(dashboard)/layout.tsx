import { SidebarProvider } from "@/components/ui/sidebar";
import { ChatbotButton } from "@/components/chatbot-button";
import { cookies } from "next/headers";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const sidebarOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider defaultOpen={sidebarOpen}>
      {children}
      <ChatbotButton />
    </SidebarProvider>
  );
}