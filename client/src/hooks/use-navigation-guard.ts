import { useEffect, useRef } from "react";

type GuardCallback = () => boolean;

export interface GuardEntry {
  check: GuardCallback;
  message?: string;
}

const guards = new Set<GuardEntry>();

let bypassing = false;
let showDialogFn: ((onConfirm: () => void, message?: string) => void) | null = null;

export function registerDialogHandler(handler: (onConfirm: () => void, message?: string) => void) {
  showDialogFn = handler;
}

export function getActiveGuardMessage(): string | undefined {
  if (bypassing) return undefined;
  for (const g of guards) {
    if (g.check()) return g.message;
  }
  return undefined;
}

export function hasUnsavedChanges(): boolean {
  return getActiveGuardMessage() !== undefined;
}

export function confirmNavigation(onConfirm: () => void): boolean {
  const msg = getActiveGuardMessage();
  if (msg === undefined) return true;
  if (showDialogFn) {
    showDialogFn(() => {
      bypassing = true;
      onConfirm();
      setTimeout(() => { bypassing = false; }, 100);
    }, msg);
    return false;
  }
  const confirmed = window.confirm(msg || "You have unsaved changes. Are you sure you want to leave?");
  if (confirmed) {
    bypassing = true;
    setTimeout(() => { bypassing = false; }, 100);
    return true;
  }
  return false;
}

export function useNavigationGuard(isDirty: () => boolean, message?: string) {
  const guardRef = useRef(isDirty);
  guardRef.current = isDirty;
  const messageRef = useRef(message);
  messageRef.current = message;

  useEffect(() => {
    const entry: GuardEntry = {
      check: () => guardRef.current(),
      get message() { return messageRef.current; },
    };
    guards.add(entry);

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (guardRef.current()) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      guards.delete(entry);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);
}
