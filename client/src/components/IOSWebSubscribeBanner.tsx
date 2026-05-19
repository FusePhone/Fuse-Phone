import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Globe, Copy, Check, ExternalLink, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface IOSWebSubscribeBannerProps {
  title?: string;
  description?: string;
  compact?: boolean;
}

const SUBSCRIBE_URL = "https://app.fusephone.com/billing";

export function IOSWebSubscribeBanner({
  title = "Manage Subscription on the Web",
  description = "To subscribe or manage your plan, visit app.fusephone.com in your browser. Subscriptions are managed through our website.",
  compact = false,
}: IOSWebSubscribeBannerProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      const { copyToClipboard } = await import("@/lib/clipboard");
      const ok = await copyToClipboard(SUBSCRIBE_URL);
      if (ok) {
        setCopied(true);
        toast({ title: "Link copied", description: "Open it in your browser to subscribe." });
        setTimeout(() => setCopied(false), 2000);
      } else {
        toast({ title: "Could not copy", description: "Please visit app.fusephone.com/billing in your browser.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Could not copy", description: "Please visit app.fusephone.com/billing in your browser.", variant: "destructive" });
    }
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800" data-testid="ios-web-subscribe-compact">
        <Globe className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
        <p className="text-sm text-blue-700 dark:text-blue-300 flex-1">{description}</p>
        <Button size="sm" variant="outline" onClick={handleCopy} className="shrink-0" data-testid="button-copy-subscribe-link">
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
        </Button>
      </div>
    );
  }

  return (
    <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20" data-testid="ios-web-subscribe-banner">
      <CardContent className="pt-6">
        <div className="flex flex-col items-center text-center gap-4">
          <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
            <Globe className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h3 className="font-semibold text-lg mb-1">{title}</h3>
            <p className="text-sm text-muted-foreground max-w-md">{description}</p>
          </div>
          <div className="flex items-center gap-2 bg-white dark:bg-gray-900 rounded-lg border px-3 py-2 w-full max-w-sm">
            <ExternalLink className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-sm text-muted-foreground flex-1 truncate">app.fusephone.com/billing</span>
            <Button size="sm" variant="ghost" onClick={handleCopy} data-testid="button-copy-subscribe-link-full">
              {copied ? (
                <><Check className="w-4 h-4 mr-1" /> Copied</>
              ) : (
                <><Copy className="w-4 h-4 mr-1" /> Copy Link</>
              )}
            </Button>
          </div>
          <Button
            variant="default"
            size="sm"
            onClick={() => window.open(SUBSCRIBE_URL, '_blank')}
            data-testid="button-open-subscribe-safari"
            className="w-full max-w-sm"
          >
            <ExternalLink className="w-4 h-4 mr-2" /> Open in Safari
          </Button>
          <Badge variant="secondary" className="text-xs">
            Sign in with your FusePhone email and password to manage your subscription
          </Badge>
          <div className="mt-2 w-full max-w-md rounded-lg border border-muted bg-muted/30 p-3" data-testid="ios-subscription-terms">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
              <div className="text-left">
                <p className="text-xs font-medium text-foreground mb-1">Subscription Terms</p>
                <ul className="text-[11px] text-muted-foreground space-y-1">
                  <li>All Fuse Phone CRM subscriptions and add-ons are managed exclusively through our website at app.fusephone.com, not through the App Store or Play Store.</li>
                  <li>Payments are processed securely by Stripe. Apple and Google are not involved in billing, refunds, or subscription management.</li>
                  <li>To subscribe, upgrade, downgrade, or cancel your plan, visit app.fusephone.com/billing in any web browser.</li>
                  <li>Your subscription gives you full access to Fuse Phone CRM across all devices, including this app.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
