'use client';

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChatStore } from '@/store/useChatStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { researchApi, ollamaApi } from '@/lib/ipc';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Send, Bot, Loader2 } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChatModeToggle } from '@/components/chat-mode-toggle';
import { LanguageToggle } from '@/components/language-toggle';
import { FileUpload } from '@/components/file-upload';
import { useToast } from '@/hooks/use-toast';

export default function NewChatPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { createChat, startResearch } = useChatStore();
  const {
    selectedModel,
    setSelectedModel,
    availableModels,
    chatMode,
    reportLanguage,
    isOllamaInitialized,
  } = useSettingsStore();

  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const handleModelChange = (value: string) => {
    setSelectedModel(value);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();

    if (!input.trim()) return;

    if (!isOllamaInitialized) {
      toast('Please configure your Ollama API key in Settings.', 'error');
      return;
    }

    if (sending) return;

    const content = input.trim();
    setInput('');
    setSending(true);

    try {
      // 1. Create a new chat
      const newChat = await createChat(chatMode);

      if (chatMode === 'research') {
        // 2. Start research
        const sessionId = await researchApi.start({
          chatId: newChat.id,
          query: content,
          model: selectedModel,
          language: reportLanguage,
        });

        // 3. Initialize research state in store
        startResearch(sessionId);

        // 4. Navigate to chat page
        navigate(`/chat/${newChat.id}`);
      } else {
        // Plain chat mode - just send a direct message
        // Save user message first
        await useChatStore.getState().saveMessage(newChat.id, {
          role: 'user',
          content,
        });

        // Get response from Ollama
        const response = await ollamaApi.chat({
          model: selectedModel,
          messages: [{ role: 'user', content }],
        });

        // Save assistant response
        await useChatStore.getState().saveMessage(newChat.id, {
          role: 'assistant',
          content: response.content,
        });

        navigate(`/chat/${newChat.id}`);
      }
    } catch (error: any) {
      console.error('Failed to create chat', error);
      toast(error.message || 'Failed to start chat.', 'error');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex-1 overflow-hidden relative">
        <ScrollArea className="h-full">
          <div className="flex flex-col items-center justify-center min-h-full p-4">
            <div className="max-w-2xl w-full space-y-8 text-center">
              <div className="space-y-4">
                <Avatar className="h-20 w-20 mx-auto">
                  <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                    <Bot className="h-10 w-10" />
                  </AvatarFallback>
                </Avatar>
                <h1 className="text-3xl font-bold tracking-tight">
                  {chatMode === 'research'
                    ? 'What would you like to research?'
                    : 'How can I help you today?'}
                </h1>
                <p className="text-muted-foreground text-lg">
                  {chatMode === 'research'
                    ? 'I will search PubMed and Google Scholar to find relevant academic sources with DOIs.'
                    : 'Ask me anything - I\'ll respond directly without academic search.'}
                </p>
              </div>
            </div>
          </div>
        </ScrollArea>
      </div>

      <div className="p-4 bg-background border-t">
        <div className="max-w-3xl mx-auto">
          <form
            onSubmit={handleSubmit}
            className="relative rounded-xl border bg-background focus-within:ring-1 focus-within:ring-ring p-3 shadow-sm transition-all duration-200"
          >
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                chatMode === 'research'
                  ? 'Enter your research question...'
                  : 'Ask anything...'
              }
              className="min-h-[60px] w-full resize-none bg-transparent border-0 p-1 placeholder:text-muted-foreground focus-visible:ring-0 shadow-none text-base"
              rows={1}
              autoFocus
            />
            <div className="flex justify-between items-center mt-3 pt-2">
              <div className="flex items-center gap-2 flex-wrap">
                <ChatModeToggle />
                <LanguageToggle />

                <Select value={selectedModel} onValueChange={handleModelChange}>
                  <SelectTrigger className="h-8 border-0 shadow-none focus:ring-0 w-auto gap-2 px-2 text-muted-foreground hover:text-foreground bg-transparent hover:bg-muted/50 rounded-md transition-colors">
                    <SelectValue placeholder="Select model" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableModels.length > 0 ? (
                      availableModels.map((model) => (
                        <SelectItem key={model.name} value={model.name}>
                          {model.name}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value={selectedModel}>
                        {selectedModel}
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <Button
                type="submit"
                size="icon"
                disabled={!input.trim() || sending || !isOllamaInitialized}
                className="h-8 w-8 transition-all duration-200"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </form>

          {!isOllamaInitialized && (
            <p className="text-sm text-destructive text-center mt-2">
              Please configure your Ollama API key in Settings to start.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
