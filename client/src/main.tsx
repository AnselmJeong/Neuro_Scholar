import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/toaster';
import { SettingsDialog } from '@/components/settings-dialog';
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
    <BrowserRouter>
      <AppWrapper>
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

        {/* Global components */}
        <SettingsDialog />
        <Toaster />
      </AppWrapper>
    </BrowserRouter>
  );
}

// Mount the app
const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
