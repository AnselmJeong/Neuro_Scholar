import { useEffect, useRef } from 'react';
import { events } from '@/lib/ipc';
import { useChatStore } from '@/store/useChatStore';
import { useToast } from '@/hooks/use-toast';

/**
 * Hook to handle research events from the main process
 * Replaces WebSocket connection with IPC events
 */
export function useResearchEvents() {
  const {
    activeChatId,
    setResearchPlan,
    setCurrentStep,
    addQuery,
    addSource,
    addReportChunk,
    updateResearchStatus,
    completeResearch,
    resetResearch,
  } = useChatStore();

  const { toast } = useToast();
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Subscribe to research updates
    unsubscribeRef.current = events.onResearchUpdate((update) => {
      console.log('[ResearchEvents] Received:', update);

      switch (update.event_type) {
        case 'status':
          updateResearchStatus('thinking', update.message || 'Processing...');
          if (update.data?.title_generated) {
            // Title was generated, could update UI
          }
          break;

        case 'plan_created':
          if (update.data?.toc) {
            setResearchPlan(
              update.data.toc.map((title: string, index: number) => ({
                id: index,
                title,
                status: index === 0 ? 'in_progress' : 'pending',
              }))
            );
            updateResearchStatus('planning', 'Research plan created');
          }
          break;

        case 'research_started':
          if (update.data?.section_index !== undefined) {
            setCurrentStep(update.data.section_index);
            updateResearchStatus('researching', `Researching: ${update.data.topic}`);
          }
          break;

        case 'tool_start':
          if (update.data?.query) {
            addQuery(update.data.query);
            updateResearchStatus('researching', `Searching: ${update.data.query}`);
          }
          break;

        case 'source_found':
          if (update.data) {
            addSource({
              title: update.data.title,
              url: update.data.url,
              doi: update.data.doi,
            });
          }
          break;

        case 'report_chunk':
          if (update.data?.chunk) {
            addReportChunk(update.data.chunk);
            updateResearchStatus('writing', 'Writing report...');
          }
          break;

        case 'completed':
          completeResearch();
          toast('Your research report is ready.', 'success');
          break;

        case 'paused':
          updateResearchStatus('idle', 'Research paused');
          toast(update.message || 'Research has been paused.', 'info');
          break;

        case 'cancelled':
          resetResearch();
          toast(update.message || 'Research has been cancelled.', 'info');
          break;

        case 'error':
          updateResearchStatus('error', update.message || 'An error occurred');
          toast(update.message || 'An error occurred during research.', 'error');
          break;

        default:
          console.log('[ResearchEvents] Unknown event type:', update.event_type);
      }
    });

    // Cleanup on unmount
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [
    activeChatId,
    setResearchPlan,
    setCurrentStep,
    addQuery,
    addSource,
    addReportChunk,
    updateResearchStatus,
    completeResearch,
    resetResearch,
    toast,
  ]);
}

/**
 * Hook to handle streaming chat chunks
 */
export function useChatChunks(onChunk: (chunk: any) => void) {
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    unsubscribeRef.current = events.onChatChunk((chunk) => {
      onChunk(chunk);
    });

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [onChunk]);
}

export default useResearchEvents;
