"use client"

import { useQueryState } from "nuqs"
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { AccountTab } from "./account-tab"
import { ApiKeysTab } from "./api-keys-tab"

interface SettingsDialogProps {
  userName: string
  userEmail: string
  userAvatar: string
}

export function SettingsDialog({
  userName,
  userEmail,
  userAvatar,
}: SettingsDialogProps) {
  const [tab, setTab] = useQueryState("settings")
  
  const dialogOpen = tab !== null
  const activeTab = tab || "account"

  const handleDialogOpenChange = (open: boolean) => {
    if (!open) {
      setTab(null)
    }
  }

  return (
    <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="!flex flex-col gap-0 p-0 h-[min(640px,80vh)] w-full sm:max-w-4xl">
        <ScrollArea className="h-full flex flex-col">
          <DialogTitle className="p-6">Settings</DialogTitle>
          <div className="space-y-6 px-4 pb-6">
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
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

