"use client";

import { useEffect } from "react";
import { useSettingsStore } from "@/store/useSettingsStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RefreshCw, CheckCircle, XCircle, Loader2 } from "lucide-react";

export function SettingsDialog() {
  const {
    isSettingsOpen,
    setSettingsOpen,
    ollamaApiKey,
    setOllamaApiKey,
    selectedModel,
    setSelectedModel,
    availableModels,
    fetchModels,
    isOllamaInitialized,
    isLoadingModels,
    initialize,
  } = useSettingsStore();

  // Initialize settings when dialog opens
  useEffect(() => {
    if (isSettingsOpen) {
      initialize();
    }
  }, [isSettingsOpen, initialize]);

  const handleApiKeyChange = async (value: string) => {
    await setOllamaApiKey(value);
  };

  const handleRefreshModels = async () => {
    await fetchModels();
  };

  const formatModelSize = (size: number): string => {
    const gb = size / (1024 * 1024 * 1024);
    return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(size / (1024 * 1024)).toFixed(0)} MB`;
  };

  return (
    <Dialog open={isSettingsOpen} onOpenChange={setSettingsOpen}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Ollama Settings</DialogTitle>
          <DialogDescription>
            Configure your Ollama Cloud API key and select a model for research and chat.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          {/* Connection Status */}
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted">
            {isOllamaInitialized ? (
              <>
                <CheckCircle className="h-5 w-5 text-green-500" />
                <span className="text-sm text-green-700 dark:text-green-400">
                  Connected to Ollama Cloud
                </span>
              </>
            ) : (
              <>
                <XCircle className="h-5 w-5 text-destructive" />
                <span className="text-sm text-destructive">
                  Not connected. Please enter your API key.
                </span>
              </>
            )}
          </div>

          {/* API Key Input */}
          <div className="space-y-2">
            <label htmlFor="ollama-api-key" className="text-sm font-medium">
              Ollama Cloud API Key
            </label>
            <Input
              id="ollama-api-key"
              type="password"
              placeholder="Enter your Ollama Cloud API key..."
              value={ollamaApiKey}
              onChange={(e) => handleApiKeyChange(e.target.value)}
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Get your API key from{" "}
              <a
                href="https://ollama.com/settings/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Ollama Cloud Settings
              </a>
            </p>
          </div>

          {/* Model Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="model-select" className="text-sm font-medium">
                Model
              </label>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefreshModels}
                disabled={isLoadingModels || !isOllamaInitialized}
              >
                {isLoadingModels ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                <span className="ml-1">Refresh</span>
              </Button>
            </div>

            <Select
              value={selectedModel}
              onValueChange={setSelectedModel}
              disabled={!isOllamaInitialized || availableModels.length === 0}
            >
              <SelectTrigger id="model-select">
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent>
                {availableModels.length > 0 ? (
                  availableModels.map((model) => (
                    <SelectItem key={model.name} value={model.name}>
                      <div className="flex items-center justify-between w-full">
                        <span>{model.name}</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {model.details?.parameter_size || formatModelSize(model.size)}
                        </span>
                      </div>
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="llama3.2" disabled>
                    {isOllamaInitialized
                      ? "No models available. Click Refresh."
                      : "Connect to load models"}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>

            {selectedModel && (
              <p className="text-xs text-muted-foreground">
                Selected: <span className="font-medium">{selectedModel}</span>
              </p>
            )}
          </div>

          {/* Info Section */}
          <div className="p-3 rounded-lg border bg-card">
            <h4 className="text-sm font-medium mb-2">About Ollama Cloud</h4>
            <p className="text-xs text-muted-foreground">
              Neuro Scholar uses Ollama Cloud for AI-powered research. Your API key enables:
            </p>
            <ul className="text-xs text-muted-foreground mt-2 space-y-1 list-disc list-inside">
              <li>Access to various LLM models</li>
              <li>Web search capabilities for academic research</li>
              <li>Web page fetching for source content</li>
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default SettingsDialog;
