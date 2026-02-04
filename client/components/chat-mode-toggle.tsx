"use client";

import { useSettingsStore } from "@/store/useSettingsStore";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Search, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatModeToggleProps {
  className?: string;
}

export function ChatModeToggle({ className }: ChatModeToggleProps) {
  const { chatMode, setChatMode } = useSettingsStore();

  return (
    <TooltipProvider>
      <div className={cn("flex items-center rounded-lg border p-1 gap-1", className)}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={chatMode === "research" ? "default" : "ghost"}
              size="sm"
              onClick={() => setChatMode("research")}
              className="gap-2 px-3"
            >
              <Search className="h-4 w-4" />
              <span className="hidden sm:inline">Research</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Research Mode: Academic search with PubMed/Scholar, DOI citations</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={chatMode === "chat" ? "default" : "ghost"}
              size="sm"
              onClick={() => setChatMode("chat")}
              className="gap-2 px-3"
            >
              <MessageCircle className="h-4 w-4" />
              <span className="hidden sm:inline">Chat</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Plain Chat: Direct conversation without academic search</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}

export default ChatModeToggle;
