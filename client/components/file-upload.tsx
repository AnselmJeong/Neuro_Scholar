"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { filesApi } from "@/lib/ipc";
import { useToast } from "@/hooks/use-toast";
import {
  Upload,
  FileText,
  File,
  X,
  Loader2,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface UploadedFile {
  id: string;
  filename: string;
  file_type: "pdf" | "md" | "qmd";
  content_length: number;
  created_at: string;
}

interface FileUploadProps {
  chatId: string;
  onFilesChange?: (files: UploadedFile[]) => void;
}

export function FileUpload({ chatId, onFilesChange }: FileUploadProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();

  // Load existing files for this chat
  useEffect(() => {
    const loadFiles = async () => {
      try {
        const existingFiles = await filesApi.list(chatId);
        setFiles(existingFiles);
        onFilesChange?.(existingFiles);
      } catch (error) {
        console.error("[FileUpload] Failed to load files:", error);
      }
    };

    if (chatId) {
      loadFiles();
    }
  }, [chatId, onFilesChange]);

  const handleUpload = async () => {
    setIsUploading(true);
    try {
      const result = await filesApi.upload(chatId);

      if (result) {
        const updatedFiles = [...files, result];
        setFiles(updatedFiles);
        onFilesChange?.(updatedFiles);

        toast({
          title: "File Uploaded",
          description: `${result.filename} has been added as reference material.`,
        });
      }
    } catch (error: any) {
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload file.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (fileId: string) => {
    try {
      await filesApi.delete(fileId);
      const updatedFiles = files.filter((f) => f.id !== fileId);
      setFiles(updatedFiles);
      onFilesChange?.(updatedFiles);

      toast({
        title: "File Removed",
        description: "Reference file has been removed.",
      });
    } catch (error: any) {
      toast({
        title: "Delete Failed",
        description: error.message || "Failed to remove file.",
        variant: "destructive",
      });
    }
  };

  const getFileIcon = (type: string) => {
    switch (type) {
      case "pdf":
        return <FileText className="h-4 w-4 text-red-500" />;
      case "md":
      case "qmd":
        return <File className="h-4 w-4 text-blue-500" />;
      default:
        return <File className="h-4 w-4" />;
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-2">
      {/* Upload Button */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={handleUpload}
              disabled={isUploading}
              className="gap-2"
            >
              {isUploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Attach File
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Upload PDF, Markdown, or Quarto files as reference</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Uploaded Files List */}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((file) => (
            <div
              key={file.id}
              className="flex items-center gap-2 px-2 py-1 rounded-md bg-muted text-sm"
            >
              {getFileIcon(file.file_type)}
              <span className="max-w-[150px] truncate" title={file.filename}>
                {file.filename}
              </span>
              <span className="text-xs text-muted-foreground">
                ({formatFileSize(file.content_length)})
              </span>
              <button
                onClick={() => handleDelete(file.id)}
                className="ml-1 text-muted-foreground hover:text-destructive transition-colors"
                title="Remove file"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default FileUpload;
