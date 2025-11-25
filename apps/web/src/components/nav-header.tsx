"use client";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { LogOut, Home, Key } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

interface NavHeaderProps {
  currentPage?: "home" | "api-keys";
}

export function NavHeader({ currentPage = "home" }: NavHeaderProps) {
  const router = useRouter();

  const handleLogout = async () => {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center justify-between px-6">
        <Link href="/" className="flex items-center">
          <Image
            src="/openinary.svg"
            alt="Openinary"
            width={80}
            height={80}
          />
        </Link>
        <div className="flex items-center gap-2">
          {currentPage === "home" ? (
            <Link href="/api-keys">
              <Button variant="outline" size="sm">
                API Keys
              </Button>
            </Link>
          ) : (
            <Link href="/">
              <Button variant="outline" size="sm">
                Home
              </Button>
            </Link>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="gap-2"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}

