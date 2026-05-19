// Restore screen shown when a user signs in to an account that was
// scheduled for deletion. Per Apple Guideline 5.1.1(v) the user must be
// able to either restore the account or permanently delete it now.

import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Undo2, Trash2, LogOut, AlertTriangle, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

const RESTORE_TOKEN_KEY = "fp_restore_token";
const RESTORE_EMAIL_KEY = "fp_restore_email";

function getRestoreToken(): string | null {
  try { return sessionStorage.getItem(RESTORE_TOKEN_KEY); } catch { return null; }
}

function clearRestoreContext() {
  try {
    sessionStorage.removeItem(RESTORE_TOKEN_KEY);
    sessionStorage.removeItem(RESTORE_EMAIL_KEY);
  } catch {}
}

interface DeletionStatus {
  accountStatus: string;
  deletedAt: string | null;
  scheduledPurgeAt: string | null;
  email?: string;
  graceDays?: number;
}

async function authedFetch(path: string, init?: RequestInit) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init?.headers as any || {}) };
  const token = getRestoreToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(path, { ...init, headers, credentials: 'include' });
}

export default function RestoreAccount() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [status, setStatus] = useState<DeletionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(false);
  const [purging, setPurging] = useState(false);
  const [purgeConfirm, setPurgeConfirm] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authedFetch('/api/account/deletion-status');
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          // Restore session expired or token bad — back to login.
          toast({ title: 'Session expired', description: 'Please sign in again.', variant: 'destructive' });
          clearRestoreContext();
          setLocation('/');
          return;
        }
        if (data.accountStatus !== 'deleted') {
          // Already restored or purged — go home.
          clearRestoreContext();
          setLocation('/');
          return;
        }
        setStatus(data);
      } catch {
        if (!cancelled) {
          toast({ title: 'Error', description: 'Could not load account status.', variant: 'destructive' });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [setLocation, toast]);

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const res = await authedFetch('/api/account/restore', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to restore account');

      // Native: store new tokens.
      const isNative = !!(window as any).__CAPACITOR_NATIVE || !!(window as any).Capacitor?.isNativePlatform?.();
      if (isNative && data.accessToken && data.refreshToken) {
        try {
          const { storeTokens } = await import('@/lib/native-auth');
          await storeTokens(data.accessToken, data.refreshToken);
        } catch {}
      }

      clearRestoreContext();
      try {
        const { clearLogoutFlag } = await import('@/hooks/use-auth');
        clearLogoutFlag();
      } catch {}
      queryClient.setQueryData(['/api/auth/user'], data.user);
      queryClient.invalidateQueries();
      toast({ title: 'Welcome back!', description: 'Your account has been restored.' });
      setLocation('/');
    } catch (err: any) {
      toast({ title: 'Restore failed', description: err.message, variant: 'destructive' });
      setRestoring(false);
    }
  };

  const handlePurgeNow = async () => {
    setPurging(true);
    try {
      const res = await authedFetch('/api/account/purge-now', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to delete account');

      const isNative = !!(window as any).__CAPACITOR_NATIVE || !!(window as any).Capacitor?.isNativePlatform?.();
      if (isNative) {
        try {
          const { clearTokens } = await import('@/lib/native-auth');
          await clearTokens();
        } catch {}
      }
      try {
        const { clearPersistedCache, resetPersisterToAnonymous } = await import('@/lib/query-persister');
        await clearPersistedCache();
        resetPersisterToAnonymous();
      } catch {}
      clearRestoreContext();
      queryClient.removeQueries();
      toast({ title: 'Account deleted', description: 'Your account and all data have been permanently removed.' });
      window.location.href = '/';
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err.message, variant: 'destructive' });
      setPurging(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await authedFetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    const isNative = !!(window as any).__CAPACITOR_NATIVE || !!(window as any).Capacitor?.isNativePlatform?.();
    if (isNative) {
      try {
        const { clearTokens } = await import('@/lib/native-auth');
        await clearTokens();
      } catch {}
    }
    clearRestoreContext();
    queryClient.removeQueries();
    window.location.href = '/';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!status) return null;

  const purgeDate = status.scheduledPurgeAt ? new Date(status.scheduledPurgeAt) : null;
  const daysLeft = purgeDate
    ? Math.max(0, Math.ceil((purgeDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
    : 0;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md" data-testid="card-restore-account">
        <CardHeader>
          <CardTitle className="text-xl flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Account scheduled for deletion
          </CardTitle>
          <CardDescription>
            {status.email ? <>Signed in as <strong>{status.email}</strong>.</> : null}
            {' '}You scheduled this account for deletion. You can restore it or permanently delete it now.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-muted/40 p-4 text-sm">
            <p>
              All data will be permanently removed on{' '}
              <strong data-testid="text-restore-purge-date">
                {purgeDate ? purgeDate.toLocaleDateString(undefined, { dateStyle: 'long' }) : 'soon'}
              </strong>.
            </p>
            <p className="mt-1 text-muted-foreground" data-testid="text-restore-days-left">
              {daysLeft} day{daysLeft === 1 ? '' : 's'} remaining.
            </p>
          </div>

          <Button
            className="w-full"
            onClick={handleRestore}
            disabled={restoring || purging}
            data-testid="button-restore"
          >
            {restoring ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Undo2 className="w-4 h-4 mr-2" />}
            Restore my account
          </Button>

          {!purgeConfirm ? (
            <Button
              variant="outline"
              className="w-full text-destructive border-destructive/40 hover:bg-destructive/10"
              onClick={() => setPurgeConfirm(true)}
              disabled={restoring || purging}
              data-testid="button-purge-now"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Permanently delete now
            </Button>
          ) : (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-3">
              <p className="text-sm font-medium text-destructive">
                This permanently deletes everything immediately. It cannot be undone.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={handlePurgeNow}
                  disabled={purging}
                  data-testid="button-confirm-purge-now"
                >
                  {purging && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Yes, delete forever
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setPurgeConfirm(false)}
                  disabled={purging}
                  data-testid="button-cancel-purge-now"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          <Button
            variant="ghost"
            className="w-full"
            onClick={handleSignOut}
            disabled={restoring || purging}
            data-testid="button-restore-sign-out"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign out (decide later)
          </Button>

          <p className="text-xs text-muted-foreground text-center pt-2">
            Need help? Email{' '}
            <a href="mailto:support@fusephone.com" className="underline inline-flex items-center gap-1">
              support@fusephone.com <ExternalLink className="w-3 h-3" />
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// Helper exported so login screens can stash the restore token before
// navigating to /restore-account.
export function setRestoreContext(token: string, email?: string) {
  try {
    sessionStorage.setItem(RESTORE_TOKEN_KEY, token);
    if (email) sessionStorage.setItem(RESTORE_EMAIL_KEY, email);
  } catch {}
}
