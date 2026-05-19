import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertCircle, LogIn, Mail, X, ExternalLink, Trash2 } from "lucide-react";

export interface OtherAccountModalProps {
  open: boolean;
  maskedEmail: string;
  onSignInAsOther: () => void;
  onContactSupport: () => void;
  onCancel: () => void;
  /**
   * Opens the iPhone Settings → Subscriptions screen so the user can
   * cancel the subscription that's blocking them. Optional for
   * backward compatibility; if not provided, the in-modal "Open
   * Subscriptions" button falls back to the iTunes deep link directly.
   */
  onOpenAppleSubscriptions?: () => void;
}

export function OtherAccountModal({
  open,
  maskedEmail,
  onSignInAsOther,
  onContactSupport,
  onCancel,
  onOpenAppleSubscriptions,
}: OtherAccountModalProps) {
  const handleOpenSubscriptions = () => {
    if (onOpenAppleSubscriptions) {
      onOpenAppleSubscriptions();
      return;
    }
    // Fallback deep link directly to Apple's Subscriptions screen
    try {
      window.location.href = "itms-apps://apps.apple.com/account/subscriptions";
      setTimeout(() => {
        try {
          window.open("https://apps.apple.com/account/subscriptions", "_blank", "noopener,noreferrer");
        } catch { /* non-fatal */ }
      }, 500);
    } catch {
      window.open("https://apps.apple.com/account/subscriptions", "_blank", "noopener,noreferrer");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" data-testid="dialog-other-account">
        <DialogHeader>
          <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto mb-2">
            <AlertCircle className="w-6 h-6 text-amber-600 dark:text-amber-400" />
          </div>
          <DialogTitle className="text-center" data-testid="text-other-account-title">
            Subscription already linked
          </DialogTitle>
          <DialogDescription className="text-center pt-2" data-testid="text-other-account-body">
            Your Apple ID's FusePhone subscription is tied to{" "}
            <span className="font-semibold text-foreground" data-testid="text-other-account-email">
              {maskedEmail}
            </span>
            .
            <br /><br />
            Apple only allows one FusePhone subscription per Apple ID, so we
            can't add a second one to this account. Pick the path that fits
            your situation:
          </DialogDescription>
        </DialogHeader>

        {/* OPTION A — use the existing account */}
        <div
          className="rounded-md border bg-muted/30 p-3 mt-2"
          data-testid="section-other-account-option-a"
        >
          <div className="text-sm font-semibold mb-1">
            Option A — Use the existing account
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            If <span className="font-medium text-foreground">{maskedEmail}</span>{" "}
            is also yours and you'd rather keep using it, just sign back in
            there. The subscription is already active on that account.
          </p>
          <Button
            onClick={onSignInAsOther}
            className="w-full"
            data-testid="button-sign-in-as-other"
          >
            <LogIn className="w-4 h-4 mr-2" />
            Sign in as {maskedEmail}
          </Button>
        </div>

        {/* OPTION B — move the sub over to this new account */}
        <div
          className="rounded-md border bg-muted/30 p-3 mt-3"
          data-testid="section-other-account-option-b"
        >
          <div className="text-sm font-semibold mb-1">
            Option B — Move the subscription to this account
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            You'll need to cancel and delete the old account first, then
            subscribe again here. Walk through the steps in order:
          </p>
          <ol className="text-xs space-y-3 list-decimal list-inside text-muted-foreground">
            <li>
              <span className="text-foreground font-medium">
                Cancel the subscription in iPhone Settings.
              </span>{" "}
              Apple has to release the Apple ID before any new FusePhone account
              can use it.
              <Button
                size="sm"
                variant="outline"
                onClick={handleOpenSubscriptions}
                className="w-full mt-2"
                data-testid="button-open-apple-subscriptions"
              >
                <ExternalLink className="w-3.5 h-3.5 mr-2" />
                Open iPhone Subscriptions
              </Button>
            </li>
            <li>
              <span className="text-foreground font-medium">
                Sign in to {maskedEmail} and delete that account.
              </span>{" "}
              In FusePhone tap Profile → Delete Account at the bottom of the
              settings page.
              <Button
                size="sm"
                variant="outline"
                onClick={onSignInAsOther}
                className="w-full mt-2"
                data-testid="button-sign-in-to-delete"
              >
                <Trash2 className="w-3.5 h-3.5 mr-2" />
                Sign in to delete {maskedEmail}
              </Button>
            </li>
            <li>
              <span className="text-foreground font-medium">
                Come back to this account.
              </span>{" "}
              Sign out, log in to your new account, and tap Subscribe — the
              Apple ID will be free to use again.
            </li>
          </ol>
        </div>

        <DialogFooter className="flex flex-col gap-2 sm:flex-col mt-3">
          <Button
            variant="outline"
            onClick={onContactSupport}
            className="w-full"
            data-testid="button-other-account-contact-support"
          >
            <Mail className="w-4 h-4 mr-2" />
            Need help? Contact support
          </Button>
          <Button
            variant="ghost"
            onClick={onCancel}
            className="w-full"
            data-testid="button-other-account-cancel"
          >
            <X className="w-4 h-4 mr-2" />
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
