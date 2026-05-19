import { useCallback, useState } from "react";
import { useCompanySettings, useMakeCall } from "@/hooks/use-company-settings";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Loader2, Phone } from "lucide-react";

/**
 * Shared "tap Call" behavior used by every Call button outside the
 * Contact Detail page (calendar cards, project cards, etc).
 *
 * - With Twilio configured: shows the SAME "Place a Call?" confirmation
 *   banner the Contact Detail and Project Detail pages use, then bridges
 *   through the office phone via the makeCall API on confirm. This runs
 *   on iOS native too — matching Project Detail and Messages, which
 *   always bridge through the office number.
 * - With OpenPhone configured: shows the OpenPhone choose-line dialog so
 *   the user picks between the OpenPhone web app and the device dialer.
 * - Otherwise: fall back to the device's tel: handler.
 *
 * Returns `{ callContact, isCalling, dialog }`. The consumer must render
 * `dialog` once inside its component tree so the confirmation UI can
 * appear when `callContact` is invoked. Each invocation of `useCallContact`
 * gets its own dialog state, so it's safe to call in multiple components.
 */
interface CallParams {
  phone: string;
  contactId?: number;
  contactName?: string;
}

export function useCallContact() {
  const { data: companySettings } = useCompanySettings();
  const { mutate: makeCall, isPending: isCalling } = useMakeCall();
  const { toast } = useToast();
  const [pendingCall, setPendingCall] = useState<CallParams | null>(null);
  const [showOpenPhoneDialog, setShowOpenPhoneDialog] = useState(false);

  const isOpenPhoneProvider = companySettings?.phoneProvider === "openphone";
  const isOpenPhoneConfigured = isOpenPhoneProvider && !!companySettings?.openphonePhoneNumber;
  const isTwilioConfigured =
    !isOpenPhoneProvider &&
    !!companySettings?.twilioAccountSid &&
    !!companySettings?.twilioAuthToken &&
    !!companySettings?.twilioPhoneNumber;
  const hasOfficePhone = !!companySettings?.twilioOfficePhone;

  const callContact = useCallback(
    (params: CallParams) => {
      if (!params.phone) {
        toast({
          title: "No phone number",
          description: "There's no phone number to call.",
          variant: "destructive",
        });
        return;
      }
      if (isOpenPhoneProvider) {
        // Match Contact/Project Detail flow: choose-line dialog.
        setPendingCall(params);
        setShowOpenPhoneDialog(true);
        return;
      }
      if (isTwilioConfigured) {
        // Match Contact/Project Detail flow: confirmation banner first,
        // never an immediate call. Same office-phone bridge on confirm.
        setPendingCall(params);
        return;
      }
      // No phone provider — let the device handle it.
      window.location.href = `tel:${params.phone}`;
    },
    [isOpenPhoneProvider, isTwilioConfigured, toast]
  );

  const performCall = useCallback(() => {
    if (!pendingCall) return;
    const { phone, contactId, contactName } = pendingCall;
    setPendingCall(null);
    makeCall(
      { to: phone, contactId, contactName },
      {
        onSuccess: (data: any) => {
          if (data?.twoLeg) {
            toast({
              title: "Calling your office first",
              description: contactName
                ? `Answer to be connected to ${contactName}`
                : "Answer to be connected.",
            });
          } else {
            toast({
              title: "Call initiated",
              description: contactName ? `Calling ${contactName}...` : `Calling ${phone}...`,
            });
          }
        },
        onError: (err: Error) => {
          toast({ title: "Failed to call", description: err.message, variant: "destructive" });
        },
      }
    );
  }, [pendingCall, makeCall, toast]);

  const showTwilioConfirm = !!pendingCall && !showOpenPhoneDialog && isTwilioConfigured;

  const dialog = (
    <>
      <Dialog
        open={showTwilioConfirm}
        onOpenChange={(open) => {
          if (!open) setPendingCall(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
              Place a Call?
            </DialogTitle>
            <DialogDescription>
              {pendingCall?.contactName
                ? `You are about to place a call to ${pendingCall.contactName}`
                : `You are about to place a call to ${pendingCall?.phone || ""}`}
            </DialogDescription>
          </DialogHeader>
          {!hasOfficePhone && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md p-3 text-sm text-amber-700 dark:text-amber-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>
                Office phone not set. Go to Settings &gt; Integrations &gt; Twilio to add your
                office or cell number for call bridging.
              </span>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setPendingCall(null)}
              data-testid="button-cancel-call"
            >
              Cancel
            </Button>
            <Button
              onClick={performCall}
              disabled={!hasOfficePhone || isCalling}
              data-testid="button-confirm-call"
            >
              {isCalling ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Phone className="w-4 h-4 mr-2" />
              )}
              Call via Office Phone
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showOpenPhoneDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowOpenPhoneDialog(false);
            setPendingCall(null);
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Phone className="w-5 h-5" />
              {pendingCall?.contactName ? `Call ${pendingCall.contactName}` : "Place a Call"}
            </DialogTitle>
            <DialogDescription>
              Your phone system is managed through OpenPhone. You can make the call from OpenPhone
              or use your device directly.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Button
              onClick={() => {
                setShowOpenPhoneDialog(false);
                setPendingCall(null);
                window.open("https://app.openphone.com", "_blank");
              }}
              data-testid="button-open-openphone"
            >
              Open OpenPhone
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const ph = pendingCall?.phone;
                setShowOpenPhoneDialog(false);
                setPendingCall(null);
                if (ph) window.location.href = `tel:${ph}`;
              }}
              data-testid="button-call-device"
            >
              <Phone className="w-4 h-4 mr-2" />
              Use Device to Call
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setShowOpenPhoneDialog(false);
                setPendingCall(null);
              }}
              data-testid="button-cancel-openphone"
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );

  // Suppress unused warning for isOpenPhoneConfigured (kept for clarity/future use).
  void isOpenPhoneConfigured;

  return { callContact, isCalling, dialog };
}
