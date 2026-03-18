import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { API_BASE_URL } from '@/lib/constants';

const SSE_URL = `${API_BASE_URL}/api/v1/events`;
const RECONNECT_DELAYS = [1000, 2000, 5000, 10000];
const POLL_FALLBACK_INTERVAL = 10_000;

export function useSSE() {
  const queryClient = useQueryClient();
  const retryCount = useRef(0);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      const es = new EventSource(SSE_URL);
      eventSourceRef.current = es;

      es.onopen = () => {
        retryCount.current = 0;
        if (pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
        }
      };

      es.addEventListener('task_created', () => {
        queryClient.invalidateQueries({ queryKey: ['tasks'] });
      });

      es.addEventListener('task_updated', () => {
        queryClient.invalidateQueries({ queryKey: ['tasks'] });
      });

      es.addEventListener('task_deleted', () => {
        queryClient.invalidateQueries({ queryKey: ['tasks'] });
      });

      es.addEventListener('task_reassigned', () => {
        queryClient.invalidateQueries({ queryKey: ['tasks'] });
        queryClient.invalidateQueries({ queryKey: ['agents'] });
      });

      es.addEventListener('agent_state_changed', () => {
        queryClient.invalidateQueries({ queryKey: ['agents'] });
      });

      es.addEventListener('agent_workload_changed', () => {
        queryClient.invalidateQueries({ queryKey: ['agents'] });
      });

      es.addEventListener('snapshot', () => {
        queryClient.invalidateQueries({ queryKey: ['tasks'] });
        queryClient.invalidateQueries({ queryKey: ['agents'] });
      });

      es.onerror = () => {
        es.close();
        eventSourceRef.current = null;

        if (!pollInterval) {
          pollInterval = setInterval(() => {
            queryClient.invalidateQueries({ queryKey: ['tasks'] });
            queryClient.invalidateQueries({ queryKey: ['agents'] });
          }, POLL_FALLBACK_INTERVAL);
        }

        const delay =
          RECONNECT_DELAYS[
            Math.min(retryCount.current, RECONNECT_DELAYS.length - 1)
          ];
        retryCount.current++;
        reconnectTimeout = setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      eventSourceRef.current?.close();
      if (pollInterval) clearInterval(pollInterval);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [queryClient]);
}
