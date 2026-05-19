// Shared registry for active call recording metadata.
// Used by both routes.ts (registers meta when calls are placed/answered)
// and aiAssistantCall.ts (registers meta the moment AI initiates a transfer
// to office, so the office-leg recording webhook can find it without racing
// against the dial 'action' callback).
//
// LOCKED 2026-04-25: This module is intentionally tiny and dependency-free.
// Both routes.ts and aiAssistantCall.ts MUST import from here — do not
// re-create a local Map in either file or transferred-call recordings will
// be silently dropped.

export interface CallRecordingMeta {
  userId: string;
  contactId?: number;
  contactName?: string;
  customerPhone: string;
  direction: 'inbound' | 'outbound';
  startedAt: number;
  projectId?: number;
  communicationId?: number;
}

export const conferenceCallMeta = new Map<string, CallRecordingMeta>();

export function setCallMeta(conferenceName: string, meta: CallRecordingMeta) {
  conferenceCallMeta.set(conferenceName, meta);
}

export function getCallMeta(conferenceName: string): CallRecordingMeta | undefined {
  return conferenceCallMeta.get(conferenceName);
}

export function deleteCallMeta(conferenceName: string) {
  conferenceCallMeta.delete(conferenceName);
}
