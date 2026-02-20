'use client';

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useChatStore, Chat } from '@/store/useChatStore';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, MessageSquare, Pencil, Trash, X, Check, Search, Settings } from 'lucide-react';
import { useSettingsStore } from '@/store/useSettingsStore';
import { cn } from '@/lib/utils';
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

interface ContextMenuState {
  chatId: string;
  x: number;
  y: number;
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
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

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
    setContextMenu(null);
  };

  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingChatId) return;
    const nextTitle = editTitle.trim();
    if (!nextTitle) return;
    try {
      updateChat(editingChatId, { title: nextTitle });
      setEditingChatId(null);
    } catch (err) {
      console.error("Failed to rename chat", err);
    }
  };

  const handleDeleteClick = (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteChatId(chatId);
    setContextMenu(null);
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

  const handleContextMenu = (chat: Chat, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const menuWidth = 160;
    const menuHeight = 92;
    const maxX = Math.max(8, window.innerWidth - menuWidth - 8);
    const maxY = Math.max(8, window.innerHeight - menuHeight - 8);
    setContextMenu({
      chatId: chat.id,
      x: Math.min(e.clientX, maxX),
      y: Math.min(e.clientY, maxY),
    });
  };

  const openRenameFromContextMenu = () => {
    if (!contextMenu) return;
    const target = chats.find((c) => c.id === contextMenu.chatId);
    if (!target) {
      setContextMenu(null);
      return;
    }
    setEditingChatId(target.id);
    setEditTitle(target.title || "");
    setContextMenu(null);
  };

  const openDeleteFromContextMenu = () => {
    if (!contextMenu) return;
    setDeleteChatId(contextMenu.chatId);
    setContextMenu(null);
  };

  return (
    <div
      className={cn("h-full border-r bg-background flex flex-col", className)}
      onClick={() => setContextMenu(null)}
      onContextMenu={(e) => {
        if ((e.target as HTMLElement).closest('[data-chat-row]')) return;
        e.preventDefault();
        setContextMenu(null);
      }}
    >
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
                  data-chat-row
                  className={cn(
                    "group flex w-full items-center rounded-md px-2 py-1 hover:bg-accent/50",
                    activeChatId === chat.id ? "bg-accent" : "transparent"
                  )}
                  onContextMenu={(e) => handleContextMenu(chat, e)}
                >
                  {editingChatId === chat.id ? (
                    <form
                      onSubmit={handleRenameSubmit}
                      className="flex flex-1 items-center gap-1"
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
                        className="flex-1 min-w-0 justify-start gap-2 font-normal h-auto p-0 hover:bg-transparent"
                        onClick={() => handleChatSelect(chat.id)}
                      >
                        {getModeIcon(chat.mode)}
                        <span className="block min-w-0 flex-1 truncate text-left" title={chat.title || "Untitled"}>
                          {(chat.title || "Untitled").length > 24
                            ? `${(chat.title || "Untitled").slice(0, 24)}...`
                            : (chat.title || "Untitled")}
                        </span>
                      </Button>
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

      {contextMenu && (
        <div
          className="fixed inset-0 z-50"
          onClick={() => setContextMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            setContextMenu(null);
          }}
        >
          <div
            className="fixed z-50 min-w-[160px] rounded-xl border bg-popover p-1 shadow-lg"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
              onClick={openRenameFromContextMenu}
            >
              <Pencil className="h-4 w-4" />
              Rename
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-red-600 hover:bg-accent hover:text-red-700"
              onClick={openDeleteFromContextMenu}
            >
              <Trash className="h-4 w-4" />
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
