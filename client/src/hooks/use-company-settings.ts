import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type UpdateCompanySettingsRequest } from "@shared/routes";
import { authFetch } from "@/lib/queryClient";

export function useCompanySettings() {
  return useQuery({
    queryKey: [api.companySettings.get.path],
    queryFn: async () => {
      const res = await authFetch(api.companySettings.get.path);
      if (!res.ok) throw new Error(`${res.status}: Failed to fetch company settings`);
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
  });
}

export function useUpdateCompanySettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: UpdateCompanySettingsRequest) => {
      const res = await authFetch(api.companySettings.update.path, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update settings");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.companySettings.get.path] });
    },
  });
}

export function useTwilioNumbers() {
  return useQuery({
    queryKey: [api.twilio.getNumbers.path],
    queryFn: async () => {
      const res = await authFetch(api.twilio.getNumbers.path);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to fetch Twilio numbers");
      }
      return res.json();
    },
    enabled: false,
    retry: false,
  });
}

export function useSendSms() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { to: string; body: string; contactId?: number; mediaUrl?: string; mediaUrls?: string[]; skipAutoSend?: boolean }) => {
      const res = await authFetch(api.twilio.sendSms.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to send SMS");
      }
      return res.json();
    },
    // NOTE: Optimistic insert for instant outbound display lives at the
    // call site (Messages.tsx ~3375), which uses negative numeric IDs
    // (compatible with the realtime dedup-by-id check) and deterministic
    // onSuccess cleanup, plus _failed/_errorMessage state for the UI.
    // Do NOT add a hook-level optimistic insert here — it would double up.
    onSuccess: () => {
      // List-level only. The active thread cache is updated atomically by
      // the call site (Messages.tsx swap) and by the realtime "sms.sent"
      // upsert handler — invalidating the per-thread caches here would
      // trigger a redundant refetch that races with the optimistic write
      // and causes a visible flicker on slow networks (iOS cellular).
      queryClient.invalidateQueries({ queryKey: ["/api/communications/conversation-contacts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/communications/project-conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/communications/unknown-numbers"] });
    },
  });
}

export function useMakeCall() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { to: string; contactId?: number; contactName?: string }) => {
      const res = await authFetch(api.twilio.makeCall.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to make call");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.communications.list.path] });
    },
  });
}

export function useCommunications(contactId?: number) {
  return useQuery({
    queryKey: [api.communications.list.path, contactId],
    queryFn: async () => {
      const url = contactId 
        ? `${api.communications.list.path}?contactId=${contactId}` 
        : api.communications.list.path;
      const res = await authFetch(url);
      if (!res.ok) throw new Error(`${res.status}: Failed to fetch communications`);
      return res.json();
    },
    enabled: !!contactId,
    // Show persisted/cached thread immediately on cold-start. Realtime
    // WebSocket upserts keep this cache fresh while the app is open.
    //
    // staleTime: 30s means cached data is trusted for 30 seconds — no
    // background refetch on every tap/navigation. The WebSocket is the
    // primary freshness channel; opening a thread within 30s of last
    // sync just shows the cached messages instantly with zero network.
    // Anything older than 30s triggers a one-time background refresh.
    //
    // refetchOnWindowFocus is INTENTIONALLY DISABLED. On iOS, tapping
    // Send closes the keyboard, which fires a focus event, which would
    // trigger a refetch that races with the optimistic write — the GET
    // returns before the just-sent message is visible to it and replaces
    // the cache, making the bubble disappear for 1-2s before the WS
    // sms.sent event re-adds it (the user-reported "flicker" bug).
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    staleTime: 30_000,
  });
}

export function useSendEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { to: string; subject: string; body: string; fromName?: string; ctaText?: string; ctaUrl?: string; contactId?: number }) => {
      const res = await authFetch('/api/email/send', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to send email");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.communications.list.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/communications/conversation-contacts"] });
    },
  });
}
