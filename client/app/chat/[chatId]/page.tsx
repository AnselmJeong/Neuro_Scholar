'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useChatStore, Message } from '@/store/useChatStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { researchApi, ollamaApi } from '@/lib/ipc';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Send, User as UserIcon, Bot, Loader2 } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from '@/lib/utils';

import { useResearchEvents } from '@/hooks/use-research-events';
import { StatusIndicator } from '@/components/chat/status-indicator';
import { ProgressSteps } from '@/components/chat/progress-steps';
import { SearchQueries } from '@/components/chat/search-queries';
import { SourceCarousel } from '@/components/chat/source-carousel';
import { ReportRenderer } from '@/components/chat/report-renderer';
import { ResearchControls } from '@/components/research-controls';
import { ChatModeToggle } from '@/components/chat-mode-toggle';
import { LanguageToggle } from '@/components/language-toggle';
import { FileUpload } from '@/components/file-upload';
import { useToast } from '@/hooks/use-toast';

export default function ChatPage() {
  const params = useParams();
  const chatId = params?.chatId as string;
  const { toast } = useToast();

  // Initialize research event handler
  useResearchEvents();

  const {
    selectedModel,
    setSelectedModel,
    availableModels,
    chatMode,
    reportLanguage,
    isOllamaInitialized,
  } = useSettingsStore();

  const {
    messages,
    activeResearch,
    setActiveChat,
    saveMessage,
    startResearch,
  } = useChatStore();

  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
    shouldAutoScrollRef.current = isAtBottom;
  };

  const handleModelChange = (value: string) => {
    setSelectedModel(value);
  };

  useEffect(() => {
    if (chatId) {
      setActiveChat(chatId);
    }
  }, [chatId, setActiveChat]);

  useEffect(() => {
    if (shouldAutoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, activeResearch]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || sending) return;

    if (!isOllamaInitialized) {
      toast('Please configure your Ollama API key in Settings.', 'error');
      return;
    }

    const content = input.trim();
    setInput('');
    setSending(true);

    try {
      shouldAutoScrollRef.current = true;

      // Save user message
      await saveMessage(chatId, {
        role: 'user',
        content,
      });

      if (chatMode === 'research') {
        // Start research
        const sessionId = await researchApi.start({
          chatId,
          query: content,
          model: selectedModel,
          language: reportLanguage,
        });
        startResearch(sessionId);
      } else {
        // Plain chat - get direct response
        const allMessages = useChatStore.getState().messages;
        const response = await ollamaApi.chat({
          model: selectedModel,
          messages: allMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        });

        await saveMessage(chatId, {
          role: 'assistant',
          content: response.content,
        });
      }
    } catch (error: any) {
      console.error('Failed to send message', error);
      toast(error.message || 'Failed to send message.', 'error');
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

  const isStreaming = !!(
    activeResearch &&
    activeResearch.isActive &&
    activeResearch.status !== 'completed'
  );

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex-1 overflow-hidden relative">
        <ScrollArea className="h-full p-4" onScroll={handleScroll}>
          <div className="max-w-3xl mx-auto space-y-6 pb-20">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  'flex gap-2 md:gap-4',
                  msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                )}
              >
                <Avatar
                  className={cn(
                    'h-8 w-8 shrink-0',
                    msg.role === 'assistant' ? 'hidden md:flex' : 'flex'
                  )}
                >
                  <AvatarFallback
                    className={
                      msg.role === 'assistant'
                        ? 'bg-primary text-primary-foreground'
                        : ''
                    }
                  >
                    {msg.role === 'user' ? (
                      <UserIcon className="h-4 w-4" />
                    ) : (
                      <Bot className="h-4 w-4" />
                    )}
                  </AvatarFallback>
                </Avatar>
                <div
                  className={cn(
                    'flex flex-col gap-2 max-w-[95%] md:max-w-[85%]',
                    msg.role === 'user' ? 'items-end' : 'items-start'
                  )}
                >
                  <div
                    className={cn(
                      'rounded-lg px-4 py-2 text-sm',
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-foreground'
                    )}
                  >
                    {msg.role === 'user' ? (
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                    ) : (
                      <ReportRenderer content={msg.content} showExport={true} title="Research Report" />
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Active Research Progress */}
            {activeResearch &&
              activeResearch.isActive &&
              activeResearch.status !== 'completed' && (
                <div className="flex gap-2 md:gap-4 flex-row animate-in fade-in slide-in-from-bottom-2">
                  <Avatar className="h-8 w-8 shrink-0 hidden md:flex">
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      <Bot className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col gap-2 max-w-[95%] md:max-w-[85%] w-full">
                    <div className="rounded-lg px-4 py-4 text-sm bg-muted/50 text-foreground w-full border border-border/50">
                      <StatusIndicator
                        status={activeResearch.status}
                        message={activeResearch.message}
                      />

                      {/* Research Controls */}
                      <div className="my-3">
                        <ResearchControls
                          sessionId={activeResearch.requestId}
                          status={
                            activeResearch.status === 'idle'
                              ? 'pending'
                              : activeResearch.status === 'error'
                                ? 'running'
                                : 'running'
                          }
                          currentQuery=""
                        />
                      </div>

                      <SearchQueries queries={activeResearch.queries} />
                      <SourceCarousel sources={activeResearch.sources} />
                      <ProgressSteps
                        steps={activeResearch.plan}
                        isComplete={false}
                      />

                      {activeResearch.reportContent && (
                        <div className="mt-4 pt-4 border-t border-border/50">
                          <ReportRenderer content={activeResearch.reportContent} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

            <div ref={scrollRef} />
          </div>
        </ScrollArea>
      </div>

      <div className="p-4 bg-background border-t">
        <div className="max-w-3xl mx-auto">
          {/* File Upload */}
          <div className="mb-2">
            <FileUpload chatId={chatId} />
          </div>

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
                disabled={!input.trim() || sending || isStreaming || !isOllamaInitialized}
                className="h-8 w-8 transition-all duration-200"
              >
                {sending || isStreaming ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
