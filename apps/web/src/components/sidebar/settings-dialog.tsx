"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQueryState } from "nuqs";
import DefaultDialog from "../default-dialog";
import { AccountTab } from "./account-tab";
import { ApiKeysTab } from "./api-keys-tab";

interface SettingsDialogProps {
  userName: string;
  userEmail: string;
  userAvatar: string;
}

export function SettingsDialog({
  userName,
  userEmail,
  userAvatar,
}: SettingsDialogProps) {
  const [tab, setTab] = useQueryState("settings");

  const dialogOpen = tab !== null;
  const activeTab = tab || "account";

  return (
    <DefaultDialog
      isOpen={dialogOpen}
      onClose={() => setTab(null)}
      title="Settings"
    >
      <ScrollArea className="h-full flex flex-col">
        <Tabs
          className="w-full flex flex-row gap-4"
          value={activeTab}
          onValueChange={(value) => setTab(value)}
          orientation="vertical"
        >
          <TabsList className="flex-col gap-1 bg-transparent py-0 justify-start">
            <TabsTrigger
              className="w-full justify-start data-[state=active]:bg-muted data-[state=active]:shadow-none"
              value="account"
            >
              Account
            </TabsTrigger>
            <TabsTrigger
              className="w-full justify-start data-[state=active]:bg-muted data-[state=active]:shadow-none"
              value="api-keys"
            >
              API Keys
            </TabsTrigger>
          </TabsList>
          <div className="grow rounded-md border text-start">
            <TabsContent value="account" className="px-4 py-3">
              <AccountTab
                userName={userName}
                userEmail={userEmail}
                userAvatar={userAvatar}
                isOpen={dialogOpen && activeTab === "account"}
              />
            </TabsContent>
            <TabsContent value="api-keys" className="px-4 py-3">
              <ApiKeysTab />
            </TabsContent>
          </div>
        </Tabs>
      </ScrollArea>
    </DefaultDialog>
  );
}
