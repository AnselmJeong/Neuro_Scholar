import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/toaster';
import { SettingsDialog } from '@/components/settings-dialog';
import { TitleBar } from '@/components/title-bar';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useResearchEvents } from '@/hooks/use-research-events';
import '@/app/globals.css';

// Import page components
import ChatLayout from '@/app/chat/layout';
import ChatPage from '@/app/chat/page';
import ChatDetailPage from '@/app/chat/[chatId]/page';

// App wrapper component to initialize stores and event handlers
function AppWrapper({ children }: { children: React.ReactNode }) {
  const { initialize } = useSettingsStore();

  // Initialize settings on mount
  React.useEffect(() => {
    initialize();
  }, [initialize]);

  // Subscribe to research events
  useResearchEvents();

  return <>{children}</>;
}

// Root App component
function App() {
  return (
    <HashRouter>
      <AppWrapper>
        <div className="h-screen flex flex-col bg-background">
          {/* Draggable title bar */}
          <TitleBar />

          {/* Main content area */}
          <div className="flex-1 overflow-hidden">
            <Routes>
              {/* Redirect root to chat */}
              <Route path="/" element={<Navigate to="/chat" replace />} />

              {/* Chat routes */}
              <Route path="/chat" element={<ChatLayout />}>
                <Route index element={<ChatPage />} />
                <Route path=":chatId" element={<ChatDetailPage />} />
              </Route>

              {/* Catch-all redirect */}
              <Route path="*" element={<Navigate to="/chat" replace />} />
            </Routes>
          </div>

          {/* Global components */}
          <SettingsDialog />
          <Toaster />
        </div>
      </AppWrapper>
    </HashRouter>
  );
}

// Mount the app - handle HMR by reusing existing root
const container = document.getElementById('root')!;

// Store root on the container to reuse during HMR
let root = (container as any)._reactRoot;
if (!root) {
  root = ReactDOM.createRoot(container);
  (container as any)._reactRoot = root;
}

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
