import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Trash2,
  AlertTriangle,
  ExternalLink,
  CheckCircle,
  Loader2,
  ShieldOff,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useScrollFocusedIntoView } from "@/hooks/use-scroll-focused-into-view";
import { openManageSubscriptions } from "@/lib/iap";

export function DeleteAccountCard() {
  const { toast } = useToast();
  // Two-step intent flow:
  //   step 'idle'    -> just the red "Delete My Account" button
  //   step 'review'  -> warnings + (Cancel-sub button) + (Delete now button)
  //   step 'confirm' -> type "DELETE MY ACCOUNT" + final destructive button
  const [step, setStep] = useState<"idle" | "review" | "confirm">("idle");
  const [confirmText, setConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [scheduledPurgeAt, setScheduledPurgeAt] = useState<string | null>(null);
  const confirmScrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the focused field above the iOS soft keyboard.
  useScrollFocusedIntoView(confirmScrollRef);

  const { data: subscription } = useQuery<any>({
    queryKey: ["/api/subscription"],
  });
  const hasAppleSub = !!(
    subscription?.appleOriginalTransactionId ||
    subscription?.appleWhiteLabelOriginalTxnId ||
    subscription?.appleFuseAiOriginalTxnId ||
    subscription?.appleAiAssistantOriginalTxnId
  );
  const hasStripeSub = !!subscription?.stripeSubscriptionId;

  const openAppleSubscriptions = openManageSubscriptions;

  const reset = () => {
    setStep("idle");
    setConfirmText("");
  };

  const handleDelete = async () => {
    if (confirmText !== "DELETE MY ACCOUNT") return;
    setIsDeleting(true);
    try {
      const isNative =
        !!(window as any).__CAPACITOR_NATIVE ||
        !!(window as any).Capacitor?.isNativePlatform?.();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (isNative) {
        try {
          const { getAccessToken } = await import("@/lib/native-auth");
          const tok = await getAccessToken();
          if (tok) headers["Authorization"] = `Bearer ${tok}`;
        } catch {}
      }
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({ confirmation: confirmText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to delete account");

      setScheduledPurgeAt(data.scheduledPurgeAt || null);
      setStep("idle");
      setShowSuccess(true);

      // Wipe all local auth state.
      try {
        const { clearLogoutFlag } = await import("@/hooks/use-auth");
        const { queryClient } = await import("@/lib/queryClient");
        const { clearPersistedCache, resetPersisterToAnonymous } = await import(
          "@/lib/query-persister"
        );
        clearLogoutFlag();
        queryClient.setQueryData(["/api/auth/user"], null);
        queryClient.removeQueries();
        await clearPersistedCache();
        resetPersisterToAnonymous();
        if (isNative) {
          const { clearTokens } = await import("@/lib/native-auth");
          await clearTokens();
        }
      } catch {}
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      setIsDeleting(false);
    }
  };

  if (showSuccess) {
    const purgeDate = scheduledPurgeAt ? new Date(scheduledPurgeAt) : null;
    return (
      <Card className="border-green-500/40" data-testid="card-delete-success">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2 text-green-700 dark:text-green-400">
            <CheckCircle className="w-5 h-5" />
            Account Scheduled for Deletion
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">
            Your account has been scheduled for deletion. All your data will be
            permanently removed on{" "}
            <strong data-testid="text-purge-date">
              {purgeDate
                ? purgeDate.toLocaleDateString(undefined, { dateStyle: "long" })
                : "in 60 days"}
            </strong>
            .
          </p>
          <p className="text-sm text-muted-foreground">
            Changed your mind? Just sign back in any time before that date and
            we'll restore your account.
          </p>
          {hasAppleSub && (
            <div className="rounded-md border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm">
              <p className="font-medium text-amber-800 dark:text-amber-200 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> One more step
              </p>
              <p className="mt-1 text-amber-800 dark:text-amber-200">
                You also need to cancel your subscription in your Apple ID
                settings to stop future charges.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={openAppleSubscriptions}
                className="mt-2 border-amber-600/40 text-amber-900 dark:text-amber-100"
                data-testid="link-apple-subscriptions"
              >
                Manage Apple subscriptions
                <ExternalLink className="w-3 h-3 ml-1" />
              </Button>
            </div>
          )}
          <Button
            onClick={() => {
              window.location.href = "/";
            }}
            className="w-full"
            data-testid="button-sign-out-after-delete"
          >
            Sign Out
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className="border-destructive/30"
      data-testid="card-delete-account"
    >
      <CardHeader>
        <CardTitle className="text-lg text-destructive flex items-center gap-2">
          <Trash2 className="w-5 h-5" />
          Delete Account
        </CardTitle>
        <CardDescription>
          Schedule your account for deletion. You'll have 60 days to change
          your mind by signing back in.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {step === "idle" && (
          <Button
            variant="destructive"
            onClick={() => setStep("review")}
            data-testid="button-delete-account"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete My Account
          </Button>
        )}

        {step === "review" && (
          <div
            ref={confirmScrollRef}
            className="space-y-4 p-4 border border-destructive/30 rounded-lg bg-destructive/5"
          >
            <div className="space-y-2 text-sm">
              <p className="font-medium text-destructive">This will:</p>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                <li>Sign you out and lock your account immediately.</li>
                <li>
                  Permanently delete all contacts, projects, documents, photos,
                  templates, and settings after 60 days.
                </li>
                {hasStripeSub && (
                  <li>
                    Cancel your active web subscription so you aren't billed
                    again.
                  </li>
                )}
                <li>
                  You can restore everything by signing back in within 60 days.
                </li>
              </ul>
            </div>

            {hasAppleSub && (
              <div className="rounded-md border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm space-y-2">
                <p className="font-medium text-amber-800 dark:text-amber-200 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" /> Cancel your Apple
                  subscription first
                </p>
                <p className="text-amber-800 dark:text-amber-200">
                  Apple manages your in-app subscription, not us. Deleting your
                  account here will <strong>not</strong> stop Apple from
                  billing you. Tap below to cancel in your Apple ID settings,
                  then come back any time to delete your account.
                </p>
              </div>
            )}

            <div className="flex flex-col gap-2">
              {hasAppleSub && (
                <Button
                  type="button"
                  onClick={openAppleSubscriptions}
                  className="w-full"
                  data-testid="button-cancel-subscription-first"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Cancel my subscription first
                </Button>
              )}
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  setStep("confirm");
                  setTimeout(() => inputRef.current?.focus(), 50);
                }}
                className="w-full"
                data-testid="button-proceed-delete"
              >
                <ShieldOff className="w-4 h-4 mr-2" />
                Delete my account now
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={reset}
                data-testid="button-cancel-delete-review"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {step === "confirm" && (
          <div
            ref={confirmScrollRef}
            className="space-y-4 p-4 border border-destructive/30 rounded-lg bg-destructive/5"
          >
            <p className="text-sm text-destructive font-medium">
              Last step. This cannot be undone after 60 days.
            </p>
            <div className="space-y-2">
              <Label className="text-sm">
                Type <strong>DELETE MY ACCOUNT</strong> to confirm:
              </Label>
              <Input
                ref={inputRef}
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="DELETE MY ACCOUNT"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                data-testid="input-delete-confirm"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={
                  confirmText !== "DELETE MY ACCOUNT" || isDeleting
                }
                data-testid="button-confirm-delete"
              >
                {isDeleting && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                Schedule Deletion
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setStep("review");
                  setConfirmText("");
                }}
                disabled={isDeleting}
                data-testid="button-back-delete"
              >
                Back
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
