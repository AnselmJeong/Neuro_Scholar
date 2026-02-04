import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { settingsApi, ollamaApi } from '@/lib/ipc';

// Ollama model interface
interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    format: string;
    family: string;
    families: string[] | null;
    parameter_size: string;
    quantization_level: string;
  };
}

interface SettingsState {
  // Ollama settings
  ollamaApiKey: string;
  selectedModel: string;
  availableModels: OllamaModel[];
  isOllamaInitialized: boolean;

  // Chat mode
  chatMode: 'research' | 'chat';

  // UI state
  isSettingsOpen: boolean;
  isLoadingModels: boolean;

  // Actions
  setOllamaApiKey: (key: string) => Promise<void>;
  setSelectedModel: (model: string) => void;
  fetchModels: () => Promise<void>;
  checkOllamaStatus: () => Promise<void>;
  setChatMode: (mode: 'research' | 'chat') => void;
  setSettingsOpen: (open: boolean) => void;

  // Initialize from IPC on app start
  initialize: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      // Initial state
      ollamaApiKey: '',
      selectedModel: 'llama3.2',
      availableModels: [],
      isOllamaInitialized: false,
      chatMode: 'research',
      isSettingsOpen: false,
      isLoadingModels: false,

      // Set Ollama API key and update in main process
      setOllamaApiKey: async (key: string) => {
        set({ ollamaApiKey: key });
        try {
          await settingsApi.setOllamaApiKey(key);
          // Check status and fetch models after setting key
          await get().checkOllamaStatus();
          await get().fetchModels();
        } catch (error) {
          console.error('[Settings] Failed to set Ollama API key:', error);
        }
      },

      // Set selected model
      setSelectedModel: (model: string) => {
        set({ selectedModel: model });
        // Persist to main process
        settingsApi.set('selectedOllamaModel', model).catch(console.error);
      },

      // Fetch available models from Ollama
      fetchModels: async () => {
        set({ isLoadingModels: true });
        try {
          const models = await ollamaApi.getModels();
          set({ availableModels: models, isLoadingModels: false });
        } catch (error) {
          console.error('[Settings] Failed to fetch models:', error);
          set({ availableModels: [], isLoadingModels: false });
        }
      },

      // Check Ollama initialization status
      checkOllamaStatus: async () => {
        try {
          const initialized = await ollamaApi.isInitialized();
          set({ isOllamaInitialized: initialized });
        } catch (error) {
          console.error('[Settings] Failed to check Ollama status:', error);
          set({ isOllamaInitialized: false });
        }
      },

      // Set chat mode
      setChatMode: (mode: 'research' | 'chat') => {
        set({ chatMode: mode });
      },

      // Set settings dialog open state
      setSettingsOpen: (open: boolean) => {
        set({ isSettingsOpen: open });
      },

      // Initialize settings from main process
      initialize: async () => {
        try {
          const settings = await settingsApi.get();

          set({
            ollamaApiKey: settings.ollamaApiKey || '',
            selectedModel: settings.selectedOllamaModel || 'llama3.2',
          });

          await get().checkOllamaStatus();

          if (get().isOllamaInitialized) {
            await get().fetchModels();
          }
        } catch (error) {
          console.error('[Settings] Failed to initialize:', error);
        }
      },
    }),
    {
      name: 'neuro-scholar-settings',
      partialize: (state) => ({
        ollamaApiKey: state.ollamaApiKey,
        selectedModel: state.selectedModel,
        chatMode: state.chatMode,
      }),
    }
  )
);

export default useSettingsStore;
