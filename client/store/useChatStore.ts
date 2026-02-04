import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { chatApi } from '@/lib/ipc';

// Types
export interface Chat {
  id: string;
  title: string;
  mode: 'research' | 'chat';
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  chat_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: {
    sources?: ResearchSource[];
    [key: string]: any;
  };
  created_at: string;
}

export interface ResearchSource {
  title: string;
  url: string;
  doi?: string;
  journal?: string;
}

export interface ResearchStep {
  id: number;
  title: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export interface ResearchState {
  isActive: boolean;
  status: 'idle' | 'thinking' | 'planning' | 'researching' | 'writing' | 'completed' | 'error';
  message: string;
  plan: ResearchStep[];
  currentStepIndex: number;
  queries: string[];
  sources: ResearchSource[];
  requestId: string;
  reportContent: string;
}

interface ChatState {
  // Data
  chats: Chat[];
  activeChatId: string | null;
  messages: Message[];
  isLoading: boolean;

  // Research State
  activeResearch: ResearchState | null;

  // Chat Actions
  fetchChats: () => Promise<void>;
  createChat: (mode: 'research' | 'chat') => Promise<Chat>;
  deleteChat: (chatId: string) => Promise<void>;
  setActiveChat: (chatId: string | null) => void;
  updateChat: (chatId: string, updates: Partial<Chat>) => void;

  // Message Actions
  fetchMessages: (chatId: string) => Promise<void>;
  addMessage: (message: Message) => void;
  saveMessage: (
    chatId: string,
    message: { role: 'user' | 'assistant'; content: string; metadata?: any }
  ) => Promise<Message>;

  // Research Actions
  startResearch: (requestId: string) => void;
  updateResearchStatus: (status: ResearchState['status'], message: string) => void;
  setResearchPlan: (steps: ResearchStep[]) => void;
  setCurrentStep: (index: number) => void;
  addQuery: (query: string) => void;
  addSource: (source: ResearchSource) => void;
  addReportChunk: (chunk: string) => void;
  completeResearch: () => void;
  resetResearch: () => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      // Initial state
      chats: [],
      activeChatId: null,
      messages: [],
      isLoading: false,
      activeResearch: null,

      // Fetch all chats from database
      fetchChats: async () => {
        set({ isLoading: true });
        try {
          const chats = await chatApi.list();
          set({ chats, isLoading: false });
        } catch (error) {
          console.error('[ChatStore] Failed to fetch chats:', error);
          set({ isLoading: false });
        }
      },

      // Create a new chat
      createChat: async (mode: 'research' | 'chat') => {
        try {
          const chat = await chatApi.create(mode);
          set((state) => ({
            chats: [chat, ...state.chats],
            activeChatId: chat.id,
            messages: [],
          }));
          return chat;
        } catch (error) {
          console.error('[ChatStore] Failed to create chat:', error);
          throw error;
        }
      },

      // Delete a chat
      deleteChat: async (chatId: string) => {
        try {
          await chatApi.delete(chatId);
          set((state) => ({
            chats: state.chats.filter((c) => c.id !== chatId),
            activeChatId: state.activeChatId === chatId ? null : state.activeChatId,
            messages: state.activeChatId === chatId ? [] : state.messages,
          }));
        } catch (error) {
          console.error('[ChatStore] Failed to delete chat:', error);
          throw error;
        }
      },

      // Set active chat
      setActiveChat: (chatId: string | null) => {
        set({ activeChatId: chatId, messages: [] });
        if (chatId) {
          get().fetchMessages(chatId);
        }
      },

      // Update chat locally (title, mode, etc.)
      updateChat: (chatId: string, updates: Partial<Chat>) => {
        set((state) => ({
          chats: state.chats.map((c) => (c.id === chatId ? { ...c, ...updates } : c)),
        }));
        // Also update in database
        chatApi.update(chatId, updates).catch(console.error);
      },

      // Fetch messages for a chat
      fetchMessages: async (chatId: string) => {
        set({ isLoading: true });
        try {
          const messages = await chatApi.getMessages(chatId);
          set({ messages, isLoading: false });
        } catch (error) {
          console.error('[ChatStore] Failed to fetch messages:', error);
          set({ isLoading: false });
        }
      },

      // Add message locally (for optimistic updates)
      addMessage: (message: Message) => {
        set((state) => ({ messages: [...state.messages, message] }));
      },

      // Save message to database
      saveMessage: async (chatId, message) => {
        try {
          const saved = await chatApi.saveMessage(chatId, message);
          set((state) => ({ messages: [...state.messages, saved] }));
          return saved;
        } catch (error) {
          console.error('[ChatStore] Failed to save message:', error);
          throw error;
        }
      },

      // === Research Actions ===

      startResearch: (requestId: string) =>
        set({
          activeResearch: {
            isActive: true,
            status: 'thinking',
            message: 'Initializing research...',
            plan: [],
            currentStepIndex: -1,
            queries: [],
            sources: [],
            requestId,
            reportContent: '',
          },
        }),

      updateResearchStatus: (status, message) =>
        set((state) => {
          if (!state.activeResearch) return {};
          return {
            activeResearch: {
              ...state.activeResearch,
              status,
              message,
            },
          };
        }),

      setResearchPlan: (steps: ResearchStep[]) =>
        set((state) => {
          if (!state.activeResearch) return {};
          return {
            activeResearch: {
              ...state.activeResearch,
              plan: steps,
              currentStepIndex: 0,
              status: 'planning',
            },
          };
        }),

      setCurrentStep: (index: number) =>
        set((state) => {
          if (!state.activeResearch) return {};
          const newPlan = state.activeResearch.plan.map((step, i) => ({
            ...step,
            status:
              i < index
                ? ('completed' as const)
                : i === index
                  ? ('in_progress' as const)
                  : step.status,
          }));

          return {
            activeResearch: {
              ...state.activeResearch,
              plan: newPlan,
              currentStepIndex: index,
              status: 'researching',
            },
          };
        }),

      addQuery: (query: string) =>
        set((state) => {
          if (!state.activeResearch) return {};
          if (state.activeResearch.queries.includes(query)) return {};
          return {
            activeResearch: {
              ...state.activeResearch,
              queries: [...state.activeResearch.queries, query],
            },
          };
        }),

      addSource: (source: ResearchSource) =>
        set((state) => {
          if (!state.activeResearch) return {};
          if (state.activeResearch.sources.some((s) => s.url === source.url)) return {};
          return {
            activeResearch: {
              ...state.activeResearch,
              sources: [...state.activeResearch.sources, source],
            },
          };
        }),

      addReportChunk: (chunk: string) =>
        set((state) => {
          if (!state.activeResearch) return {};
          return {
            activeResearch: {
              ...state.activeResearch,
              reportContent: state.activeResearch.reportContent + chunk,
              status: 'writing',
            },
          };
        }),

      completeResearch: () =>
        set((state) => {
          if (!state.activeResearch) return {};

          // Mark all steps complete
          const completedPlan = state.activeResearch.plan.map((s) => ({
            ...s,
            status: 'completed' as const,
          }));

          // Create a message for the report
          const reportMessage: Message = {
            id: `report-${Date.now()}`,
            chat_id: state.activeChatId || '',
            role: 'assistant',
            content: state.activeResearch.reportContent,
            metadata: {
              sources: state.activeResearch.sources,
            },
            created_at: new Date().toISOString(),
          };

          return {
            messages: [...state.messages, reportMessage],
            activeResearch: {
              ...state.activeResearch,
              isActive: false,
              status: 'completed',
              message: 'Research complete',
              plan: completedPlan,
            },
          };
        }),

      resetResearch: () => set({ activeResearch: null }),
    }),
    {
      name: 'neuro-scholar-chat',
      partialize: () => ({}), // Don't persist chat data, always fetch fresh
    }
  )
);

export default useChatStore;
