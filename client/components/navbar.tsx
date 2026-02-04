"use client";

import { Link, useLocation } from "react-router-dom";
import { useSettingsStore } from "@/store/useSettingsStore";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Settings, Brain } from "lucide-react";

export function Navbar() {
  const location = useLocation();
  const setSettingsOpen = useSettingsStore((state) => state.setSettingsOpen);

  const isChatPage = location.pathname?.startsWith('/chat');

  return (
    <nav className={cn(
      "border-b bg-background sticky top-0 z-40 w-full",
      isChatPage && "hidden md:block"
    )}>
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center gap-2">
              <Link to="/" className="flex items-center gap-2">
                <Brain className="h-8 w-8 text-primary" />
                <span className="text-xl font-bold text-primary">Neuro Scholar</span>
              </Link>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <Link to="/chat">
              <Button variant="ghost">Research</Button>
            </Link>
            <Button variant="ghost" size="icon" onClick={() => setSettingsOpen(true)}>
              <Settings className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
}
