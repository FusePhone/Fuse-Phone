import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Copy, Gift, Users, DollarSign, Sparkles } from "lucide-react";

function isCapacitorNative(): boolean {
  if (typeof window === "undefined") return false;
  return !!(window as any).__CAPACITOR_NATIVE || !!(window as any).Capacitor?.isNativePlatform?.();
}

interface ReferralSummary {
  referralCode: string | null;
  referralLink: string | null;
  creditCents: number;
  payingFriends: number;
  pendingFriends: number;
  role: "user" | "affiliate";
  eligibleForAffiliate: boolean;
}

export function ReferAndEarnCard() {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  if (isCapacitorNative()) return null;

  const { data, isLoading } = useQuery<ReferralSummary>({
    queryKey: ["/api/referrals/me"],
  });

  const useCreditMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/referrals/use-credit"),
    onSuccess: () => {
      toast({ title: "Credit applied", description: "Your credit was added to your Stripe billing balance." });
      queryClient.invalidateQueries({ queryKey: ["/api/referrals/me"] });
    },
    onError: (e: any) => toast({ title: "Could not apply credit", description: e?.message || "Try again", variant: "destructive" }),
  });

  const giftCardMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/gift-cards/request"),
    onSuccess: () => {
      toast({ title: "Gift card requested", description: "We'll email you a virtual Visa within 5 business days." });
      queryClient.invalidateQueries({ queryKey: ["/api/referrals/me"] });
    },
    onError: (e: any) => toast({ title: "Could not request gift card", description: e?.message || "Try again", variant: "destructive" }),
  });

  if (isLoading || !data) {
    return (
      <Card data-testid="card-refer-earn-loading">
        <CardHeader>
          <CardTitle>Refer & Earn</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-20 animate-pulse bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  // Affiliates see their own dashboard, not this card
  if (data.role === "affiliate") {
    return (
      <Card data-testid="card-refer-earn-affiliate">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-500" />
            You're an Affiliate
          </CardTitle>
          <CardDescription>You earn 10% recurring commission for 12 months on every paying customer you refer.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild data-testid="button-affiliate-dashboard">
            <a href="https://affiliate.fusephone.com/dashboard">Open Affiliate Dashboard</a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const balance = (data.creditCents / 100).toFixed(2);

  const handleCopy = async () => {
    if (!data.referralLink) return;
    try {
      await navigator.clipboard.writeText(data.referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: "Link copied" });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  return (
    <Card data-testid="card-refer-earn">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gift className="w-5 h-5 text-emerald-500" />
          Refer & Earn $10
        </CardTitle>
        <CardDescription>Your friends save $10 on their first month. You get $10 for every friend who pays.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {data.eligibleForAffiliate && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 flex items-start gap-3" data-testid="banner-apply-affiliate">
            <Sparkles className="w-5 h-5 text-amber-500 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-sm">You've referred 10+ paying customers!</p>
              <p className="text-sm text-muted-foreground">Apply to the Affiliate Program and earn 10% recurring for 12 months instead.</p>
            </div>
            <Button asChild size="sm" variant="default" data-testid="button-apply-affiliate">
              <a href="https://affiliate.fusephone.com/apply">Apply</a>
            </Button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <DollarSign className="w-3.5 h-3.5" />
              Your balance
            </div>
            <div className="text-2xl font-semibold" data-testid="text-referral-balance">${balance}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Users className="w-3.5 h-3.5" />
              Paying friends
            </div>
            <div className="text-2xl font-semibold" data-testid="text-referral-paying">
              {data.payingFriends}
              {data.pendingFriends > 0 && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">+{data.pendingFriends} pending</span>
              )}
            </div>
          </div>
        </div>

        {data.referralLink && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Your referral link</label>
            <div className="flex gap-2">
              <Input readOnly value={data.referralLink} className="font-mono text-sm" data-testid="input-referral-link" />
              <Button onClick={handleCopy} variant="outline" data-testid="button-copy-referral">
                <Copy className="w-4 h-4 mr-1.5" />
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          <Button
            disabled={data.creditCents <= 0 || useCreditMutation.isPending}
            onClick={() => useCreditMutation.mutate()}
            data-testid="button-use-credit"
          >
            {useCreditMutation.isPending ? "Applying..." : `Use $${balance} Credit`}
          </Button>
          <Button
            variant="outline"
            disabled={data.creditCents <= 0 || giftCardMutation.isPending}
            onClick={() => giftCardMutation.mutate()}
            data-testid="button-request-gift-card"
          >
            Request as Gift Card
          </Button>
          <Badge variant="secondary" className="ml-auto self-center">Web only</Badge>
        </div>

        <p className="text-xs text-muted-foreground pt-1">
          $10 friend-referral credit is paid after your friend completes their first paid month.
          By using this program you agree to the <Link href="/terms" className="underline">Referral Terms</Link>.
        </p>
      </CardContent>
    </Card>
  );
}
