import { SidebarProvider } from "@/components/ui/sidebar";
import { ChatbotButton } from "@/components/chatbot-button";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <SidebarProvider>
      {children}
      <ChatbotButton />
    </SidebarProvider>
  );
}