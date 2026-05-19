import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ExternalLink, Loader2, Undo2 } from "lucide-react";
import { openManageSubscriptions, purchaseTier, type Tier } from "@/lib/iap";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const tierLabel = (t: string | null | undefined): string => {
  if (!t) return "";
  if (t === "starter") return "Starter";
  if (t === "core") return "Core";
  if (t === "elite" || t === "early_access") return "Elite";
  return t.charAt(0).toUpperCase() + t.slice(1);
};

const formatDate = (iso: string): string => {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "your next renewal";
    return d.toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "your next renewal";
  }
};

interface BannerSub {
  baseTier?: string | null;
  tier?: string | null;
  pendingTier?: string | null;
  pendingTierEffectiveAt?: string | null;
  whiteLabelStatus?: string;
  aiAssistantStatus?: string;
  fuseAiStatus?: string;
  // When set, the add-on is already cancelling in Apple Settings — Apple
  // stops billing it at that date, so we should NOT warn the user that
  // they need to cancel it.
  appleWhiteLabelExpiresAt?: string | null;
  appleAiAssistantExpiresAt?: string | null;
  appleFuseAiExpiresAt?: string | null;
  appleWhiteLabelAutoRenewOff?: boolean;
  appleAiAssistantAutoRenewOff?: boolean;
  appleFuseAiAutoRenewOff?: boolean;
}

/**
 * Apple-only "Downgrading to X on Y" banner. Renders nothing when no
 * downgrade is queued. Apple keeps the higher tier active until the
 * current paid period ends — Apple does not cancel cross-group add-ons
 * automatically, so we also warn the user about Elite-only add-ons that
 * will stop working AND keep being billed unless they cancel them in
 * Apple's Subscriptions screen.
 */
export function PendingDowngradeBanner({ subscription }: { subscription?: BannerSub | null }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [keeping, setKeeping] = useState(false);

  if (!subscription?.pendingTier || !subscription?.pendingTierEffectiveAt) return null;
  const dateStr = formatDate(subscription.pendingTierEffectiveAt);
  const currentTierRaw = (subscription.baseTier || subscription.tier || "").toLowerCase();
  const currentLabel = tierLabel(subscription.baseTier || subscription.tier);
  const pendingLabel = tierLabel(subscription.pendingTier);
  const isLeavingElite = currentTierRaw === "elite" || currentTierRaw === "early_access";

  // Cancelling a queued Apple downgrade: re-purchase the current (higher)
  // tier. Apple cancels the queued lower-tier sub in the same subscription
  // group automatically. Our IAP sync webhook then clears pendingTier on
  // the next event. One tap, no Settings detour.
  const handleKeepCurrent = async () => {
    const keepTier: Tier | null =
      currentTierRaw === "elite" || currentTierRaw === "early_access" ? "elite"
      : currentTierRaw === "core" ? "core"
      : currentTierRaw === "starter" ? "starter"
      : null;
    if (!keepTier) return;
    setKeeping(true);
    try {
      const result = await purchaseTier(keepTier);
      if (!result.ok) {
        if (!(result as any).userCancelled) {
          toast({
            title: "Couldn't cancel the downgrade",
            description: (result as any).message || "Please try again, or use Apple Subscriptions.",
            variant: "destructive",
          });
        }
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
      await queryClient.refetchQueries({ queryKey: ["/api/subscription"] });
      toast({
        title: "Downgrade cancelled",
        description: `You're staying on ${currentLabel}.`,
      });
    } finally {
      setKeeping(false);
    }
  };
  const losingAddons: string[] = [];
  if (isLeavingElite) {
    if (subscription.whiteLabelStatus === "active" && !subscription.appleWhiteLabelAutoRenewOff) losingAddons.push("Make It Your Own");
    if (subscription.aiAssistantStatus === "active" && !subscription.appleAiAssistantAutoRenewOff) losingAddons.push("AI Virtual Assistant");
    if (subscription.fuseAiStatus === "active" && !subscription.appleFuseAiAutoRenewOff) losingAddons.push("FuseAI");
  }
  return (
    <Card
      className="mb-4 border-amber-500/60 bg-amber-50 dark:bg-amber-950/30"
      data-testid="banner-pending-downgrade"
    >
      <CardContent className="pt-4 pb-4">
        <div className="flex gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-2">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-100" data-testid="text-pending-downgrade-title">
              Downgrading to {pendingLabel} on {dateStr}
            </p>
            <p className="text-xs text-amber-900/90 dark:text-amber-100/90 leading-relaxed">
              You're still on {currentLabel} until then. After {dateStr} your plan switches to {pendingLabel}.
            </p>
            {losingAddons.length > 0 && (
              <p
                className="text-xs text-amber-900 dark:text-amber-100 leading-relaxed"
                data-testid="text-pending-downgrade-addons"
              >
                <span className="font-medium">Heads up:</span>{" "}
                {losingAddons.join(", ")} {losingAddons.length === 1 ? "only works" : "only work"} on Elite.
                {" "}
                {losingAddons.length === 1 ? "It" : "They"} will stop working on {dateStr}, and Apple will keep
                billing you for {losingAddons.length === 1 ? "it" : "them"} unless you cancel{" "}
                {losingAddons.length === 1 ? "it" : "them"} in your Apple subscription settings.
              </p>
            )}
            <div className="pt-1 flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={handleKeepCurrent}
                disabled={keeping}
                className="bg-amber-600 hover:bg-amber-700 text-white"
                data-testid="button-pending-downgrade-keep"
              >
                {keeping ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Undo2 className="w-3.5 h-3.5 mr-1.5" />
                )}
                Keep {currentLabel}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={openManageSubscriptions}
                className="border-amber-500/60 text-amber-900 hover:bg-amber-100 dark:text-amber-100 dark:hover:bg-amber-900/40"
                data-testid="button-pending-downgrade-manage"
              >
                <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                Open Apple Subscriptions
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default PendingDowngradeBanner;
