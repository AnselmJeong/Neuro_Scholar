'use client';

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useChatStore, Chat } from '@/store/useChatStore';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, MessageSquare, MoreHorizontal, Pencil, Trash, X, Check, Search, Settings } from 'lucide-react';
import { useSettingsStore } from '@/store/useSettingsStore';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface ChatSidebarProps {
  className?: string;
  onSelect?: () => void;
}

export function ChatSidebar({ className, onSelect }: ChatSidebarProps) {
  const navigate = useNavigate();
  const params = useParams();
  const activeChatId = params?.chatId as string;

  const { chats, fetchChats, createChat, deleteChat, updateChat } = useChatStore();
  const { setSettingsOpen } = useSettingsStore();
  const [loading, setLoading] = useState(false);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [deleteChatId, setDeleteChatId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  useEffect(() => {
    fetchChats();
  }, [fetchChats]);

  const handleNewChat = async () => {
    try {
      setLoading(true);
      const newChat = await createChat('research');
      navigate(`/chat/${newChat.id}`);
      onSelect?.();
    } catch (error) {
      console.error('Failed to create chat', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChatSelect = (chatId: string) => {
    navigate(`/chat/${chatId}`);
    onSelect?.();
  };

  const handleRenameStart = (chat: Chat, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingChatId(chat.id);
    setEditTitle(chat.title || "");
  };

  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingChatId) return;
    try {
      updateChat(editingChatId, { title: editTitle });
      setEditingChatId(null);
    } catch (err) {
      console.error("Failed to rename chat", err);
    }
  };

  const handleDeleteClick = (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteChatId(chatId);
  };

  const confirmDelete = async () => {
    if (!deleteChatId) return;
    try {
      await deleteChat(deleteChatId);
      if (activeChatId === deleteChatId) {
        navigate('/chat');
      }
    } catch (err) {
      console.error("Failed to delete chat", err);
    } finally {
      setDeleteChatId(null);
    }
  };

  const getModeIcon = (mode: string) => {
    return mode === 'research' ? (
      <Search className="h-4 w-4 flex-shrink-0" />
    ) : (
      <MessageSquare className="h-4 w-4 flex-shrink-0" />
    );
  };

  return (
    <div className={cn("h-full border-r bg-background flex flex-col", className)}>
      {/* Top padding for macOS traffic lights */}
      <div className="h-12 shrink-0" />

      <div className="space-y-4 flex-1 flex flex-col overflow-hidden">
        <div className="px-3">
          <Button onClick={handleNewChat} disabled={loading} className="w-full justify-start gap-2">
            <Plus className="h-4 w-4" />
            New Research
          </Button>
        </div>
        <div className="flex-1 overflow-hidden px-3">
          <ScrollArea className="h-full">
            <div className="space-y-1">
              {chats.map((chat) => (
                <div
                  key={chat.id}
                  className={cn(
                    "group flex items-center w-full gap-1 rounded-md px-2 py-1 hover:bg-accent/50",
                    activeChatId === chat.id ? "bg-accent" : "transparent"
                  )}
                >
                  {editingChatId === chat.id ? (
                    <form
                      onSubmit={handleRenameSubmit}
                      className="flex-1 flex items-center gap-1"
                    >
                      <Input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="h-7 text-sm px-2"
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                      <Button
                        type="submit"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingChatId(null);
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </form>
                  ) : (
                    <>
                      <Button
                        variant="ghost"
                        className="flex-1 justify-start gap-2 font-normal truncate h-auto p-0 hover:bg-transparent min-w-0"
                        onClick={() => handleChatSelect(chat.id)}
                      >
                        {getModeIcon(chat.mode)}
                        <span className="text-left flex-1 min-w-0">
                          {(chat.title || "Untitled").length > 17
                            ? (chat.title || "Untitled").substring(0, 17) + "..."
                            : (chat.title || "Untitled")}
                        </span>
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-accent text-foreground focus:outline-none focus:ring-2 focus:ring-ring z-10">
                            <MoreHorizontal className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={(e) => handleRenameStart(chat, e)}
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => handleDeleteClick(chat.id, e)}
                            className="text-red-600 focus:text-red-600"
                          >
                            <Trash className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </>
                  )}
                </div>
              ))}
              {chats.length === 0 && (
                <div className="text-sm text-muted-foreground p-2 text-center">
                  No chats yet. Start a new research!
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Settings Button */}
      <div className="px-3 py-3 border-t">
        <Button
          variant="ghost"
          className="w-full justify-start gap-2"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings className="h-4 w-4" />
          Settings
        </Button>
      </div>

      <Dialog open={!!deleteChatId} onOpenChange={(open) => !open && setDeleteChatId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Chat</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this chat? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteChatId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
