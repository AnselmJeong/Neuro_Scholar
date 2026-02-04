"use client";

import { cn } from "@/lib/utils";

interface TitleBarProps {
  className?: string;
}

export function TitleBar({ className }: TitleBarProps) {
  return (
    <div
      className={cn(
        "h-12 flex items-center justify-center bg-background border-b shrink-0",
        "select-none", // Prevent text selection while dragging
        className
      )}
      style={{
        // Make the title bar draggable on macOS/Windows
        WebkitAppRegion: "drag",
      } as React.CSSProperties}
    >
      {/* Left padding for macOS traffic lights */}
      <div className="w-20" />

      {/* App title - centered */}
      <div className="flex-1 flex items-center justify-center">
        <span className="text-sm font-medium text-muted-foreground">
          Neuro Scholar
        </span>
      </div>

      {/* Right padding for balance */}
      <div className="w-20" />
    </div>
  );
}

export default TitleBar;
