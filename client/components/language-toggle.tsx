"use client";

import { useSettingsStore, ReportLanguage } from "@/store/useSettingsStore";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface LanguageToggleProps {
  className?: string;
}

export function LanguageToggle({ className }: LanguageToggleProps) {
  const { reportLanguage, setReportLanguage } = useSettingsStore();

  return (
    <TooltipProvider>
      <div className={cn("flex items-center rounded-lg border p-1 gap-1", className)}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={reportLanguage === "en" ? "default" : "ghost"}
              size="sm"
              onClick={() => setReportLanguage("en")}
              className="px-2 text-xs"
            >
              EN
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Write report in English</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={reportLanguage === "ko" ? "default" : "ghost"}
              size="sm"
              onClick={() => setReportLanguage("ko")}
              className="px-2 text-xs"
            >
              KO
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>보고서를 한국어로 작성</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}

export default LanguageToggle;
