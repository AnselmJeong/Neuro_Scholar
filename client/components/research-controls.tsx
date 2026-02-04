"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { researchApi } from "@/lib/ipc";
import { useToast } from "@/hooks/use-toast";
import {
  Pause,
  Play,
  Square,
  Edit,
  Loader2,
} from "lucide-react";

interface ResearchControlsProps {
  sessionId: string;
  status: "running" | "paused" | "pending";
  currentQuery?: string;
  onQueryUpdated?: (newQuery: string) => void;
}

export function ResearchControls({
  sessionId,
  status,
  currentQuery = "",
  onQueryUpdated,
}: ResearchControlsProps) {
  const [isUpdatingQuery, setIsUpdatingQuery] = useState(false);
  const [showQueryDialog, setShowQueryDialog] = useState(false);
  const [newQuery, setNewQuery] = useState(currentQuery);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handlePauseResume = async () => {
    setIsLoading(true);
    try {
      if (status === "paused") {
        await researchApi.resume(sessionId);
        toast("Research will continue from where it left off.", 'success');
      } else {
        await researchApi.pause(sessionId);
        toast("Research has been paused. You can resume at any time.", 'info');
      }
    } catch (error: any) {
      toast(error.message || "Failed to pause/resume research.", 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = async () => {
    setIsLoading(true);
    try {
      await researchApi.cancel(sessionId);
      toast("Research has been cancelled.", 'info');
    } catch (error: any) {
      toast(error.message || "Failed to cancel research.", 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateQuery = async () => {
    if (!newQuery.trim() || newQuery === currentQuery) {
      setShowQueryDialog(false);
      return;
    }

    setIsUpdatingQuery(true);
    try {
      await researchApi.updateQuery(sessionId, newQuery);
      onQueryUpdated?.(newQuery);
      setShowQueryDialog(false);
      toast("Please restart the research with the new query.", 'success');
    } catch (error: any) {
      toast(error.message || "Failed to update query.", 'error');
    } finally {
      setIsUpdatingQuery(false);
    }
  };

  const isPaused = status === "paused";
  const isRunning = status === "running";

  return (
    <>
      <div className="flex items-center gap-2">
        {/* Pause/Resume Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={handlePauseResume}
          disabled={isLoading || status === "pending"}
          className="gap-2"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isPaused ? (
            <Play className="h-4 w-4" />
          ) : (
            <Pause className="h-4 w-4" />
          )}
          {isPaused ? "Resume" : "Pause"}
        </Button>

        {/* Cancel Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleCancel}
          disabled={isLoading || status === "pending"}
          className="gap-2 text-destructive hover:text-destructive"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Square className="h-4 w-4" />
          )}
          Cancel
        </Button>

        {/* Update Query Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setNewQuery(currentQuery);
            setShowQueryDialog(true);
          }}
          disabled={isLoading || isRunning}
          className="gap-2"
        >
          <Edit className="h-4 w-4" />
          Update Query
        </Button>
      </div>

      {/* Update Query Dialog */}
      <Dialog open={showQueryDialog} onOpenChange={setShowQueryDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Research Query</DialogTitle>
            <DialogDescription>
              Modify your research query. This will require restarting the research from the beginning.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <Input
              value={newQuery}
              onChange={(e) => setNewQuery(e.target.value)}
              placeholder="Enter your updated research query..."
              className="w-full"
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowQueryDialog(false)}
              disabled={isUpdatingQuery}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdateQuery}
              disabled={isUpdatingQuery || !newQuery.trim()}
            >
              {isUpdatingQuery ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Updating...
                </>
              ) : (
                "Update & Restart"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default ResearchControls;
