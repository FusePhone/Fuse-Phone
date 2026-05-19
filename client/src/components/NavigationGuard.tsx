import { useState, useEffect, useCallback } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { registerDialogHandler, confirmNavigation, hasUnsavedChanges } from "@/hooks/use-navigation-guard";

const UPLOAD_MSG_PREFIX = "Photos are still uploading";

export function NavigationGuardDialog() {
  const [open, setOpen] = useState(false);
  const [onConfirmAction, setOnConfirmAction] = useState<(() => void) | null>(null);
  const [guardMessage, setGuardMessage] = useState<string | undefined>();

  const isUploadGuard = guardMessage?.startsWith(UPLOAD_MSG_PREFIX);

  useEffect(() => {
    registerDialogHandler((onConfirm, message) => {
      setGuardMessage(message);
      setOnConfirmAction(() => onConfirm);
      setOpen(true);
    });

    const handlePopState = () => {
      if (hasUnsavedChanges()) {
        window.history.pushState(null, '', window.location.href);
        confirmNavigation(() => {
          window.history.back();
        });
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const handleConfirm = useCallback(() => {
    setOpen(false);
    if (onConfirmAction) {
      onConfirmAction();
      setOnConfirmAction(null);
    }
  }, [onConfirmAction]);

  const handleCancel = useCallback(() => {
    setOpen(false);
    setOnConfirmAction(null);
  }, []);

  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!v) handleCancel(); }}>
      <AlertDialogContent data-testid="dialog-unsaved-changes">
        <AlertDialogHeader>
          <AlertDialogTitle>{isUploadGuard ? "Photos Uploading" : "Unsaved Changes"}</AlertDialogTitle>
          <AlertDialogDescription>
            {isUploadGuard
              ? "Photos are still uploading. Please keep the app open until the upload is complete. If you leave now, photos may be lost."
              : "You have unsaved changes that will be lost if you leave this page. Would you like to stay and save, or leave without saving?"}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel} data-testid="button-stay-on-page">
            {isUploadGuard ? "Keep Open" : "Stay"}
          </AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="button-leave-page">
            {isUploadGuard ? "Close Anyway" : "Leave Without Saving"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
