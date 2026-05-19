import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

export function useCallEvents() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    function connect() {
      if (closed) return;
      eventSource = new EventSource('/api/calls/events', { withCredentials: true });

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'call-update') {
            queryClient.invalidateQueries({ queryKey: ['/api/communications/calls'] });
            queryClient.invalidateQueries({ queryKey: ['/api/calls/active'] });
            queryClient.invalidateQueries({ queryKey: ['/api/notifications/unread'] });
          }
        } catch (e) {}
      };

      eventSource.onerror = () => {
        eventSource?.close();
        if (!closed) {
          retryTimeout = setTimeout(connect, 5000);
        }
      };
    }

    connect();

    return () => {
      closed = true;
      eventSource?.close();
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, [queryClient]);
}
