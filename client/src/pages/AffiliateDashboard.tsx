import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Copy, DollarSign, Users, TrendingUp, Wallet, LogOut } from "lucide-react";
import { queryClient } from "@/lib/queryClient";

interface DashboardData {
  affiliate: any;
  payoutsEnabled?: boolean;
  stats: {
    signups: number;
    active: number;
    totalEarnedCents: number;
    unpaidCents: number;
    thisMonthCents: number;
  };
  payouts: any[];
}

export default function AffiliateDashboard() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [copied, setCopied] = useState(false);
  const { data: me, isLoading: meLoading, isFetched: meFetched } = useQuery<{ id: string; referralCode?: string | null; firstName?: string | null; lastName?: string | null; email?: string | null } | null>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  const handleLogout = async () => {
    try {
      await apiRequest("POST", "/api/auth/logout");
    } catch (_) { /* ignore */ }
    queryClient.clear();
    navigate("/login");
  };

  // Bounce unauthenticated visitors to the affiliate login page
  useEffect(() => {
    if (meFetched && !me?.id) navigate("/login");
  }, [meFetched, me?.id, navigate]);

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["/api/affiliate/me"],
    retry: false,
    enabled: !!me?.id,
  });

  const onboard = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/affiliate/connect/onboard"),
    onSuccess: async (res: any) => {
      const json = await res.json();
      if (json?.url) window.location.href = json.url;
    },
    onError: (e: any) => {
      const raw = String(e?.message || "");
      const urlMatch = raw.match(/https?:\/\/[^\s"')]+/);
      const isPlatformProfile = /platform[_\s-]?profile|review the responsibilities/i.test(raw);
      if (isPlatformProfile) {
        toast({
          title: "One-time Stripe setup needed",
          description:
            "Stripe needs you to finish your platform profile before we can onboard your account. This only takes a minute and only the platform owner needs to do it.",
          variant: "destructive",
          duration: 12000,
          action: (
            <button
              onClick={() => window.open(urlMatch?.[0] || "https://dashboard.stripe.com/settings/connect/platform_profile", "_blank")}
              className="shrink-0 px-3 py-1.5 rounded-md bg-white text-red-700 text-xs font-semibold hover:bg-gray-100"
              data-testid="button-open-stripe-platform-profile"
            >
              Open Stripe
            </button>
          ),
        });
        return;
      }
      toast({
        title: "Could not start onboarding",
        description: raw || "Try again",
        variant: "destructive",
        duration: 10000,
        ...(urlMatch
          ? {
              action: (
                <button
                  onClick={() => window.open(urlMatch[0], "_blank")}
                  className="shrink-0 px-3 py-1.5 rounded-md bg-white text-red-700 text-xs font-semibold hover:bg-gray-100"
                  data-testid="button-open-stripe-link"
                >
                  Open link
                </button>
              ),
            }
          : {}),
      });
    },
  });

  if (meLoading || (me?.id && isLoading)) {
    return <div className="p-10 text-center text-muted-foreground">Loading...</div>;
  }
  if (!me?.id) {
    return <div className="p-10 text-center text-muted-foreground">Redirecting to sign in…</div>;
  }

  if (!data?.affiliate) {
    return (
      <div className="max-w-xl mx-auto p-10">
        <Card>
          <CardHeader>
            <CardTitle>You haven't applied yet</CardTitle>
            <CardDescription>Apply to the Affiliate Program to access your dashboard.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/affiliate"><Button data-testid="button-go-apply">Apply now</Button></Link>
          </CardContent>
        </Card>
      </div>
    );
  }
  if (data.affiliate.status !== "approved") {
    return (
      <div className="max-w-xl mx-auto p-10">
        <Card>
          <CardHeader>
            <CardTitle>Application status: {data.affiliate.status}</CardTitle>
          </CardHeader>
          <CardContent>
            <Link href="/affiliate"><Button data-testid="button-view-application">View application</Button></Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Always point referral links at the main marketing/signup site
  // (fusephone.com), never the affiliate subdomain. In dev we fall back to
  // the current host so local testing still works.
  const referralHost = (() => {
    const h = window.location.host;
    if (/^(affiliate\.)?fusephone\.com$/i.test(h)) return "fusephone.com";
    return h;
  })();
  const link = me?.referralCode
    ? `${window.location.protocol}//${referralHost}/r/${me.referralCode}`
    : "";

  const handleCopy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Link copied" });
  };

  const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-welcome">
            Welcome{me?.firstName ? `, ${me.firstName}` : ""}
          </h1>
          <p className="text-sm text-muted-foreground" data-testid="text-welcome-sub">
            10% recurring for 12 months on every customer you refer.
          </p>
          {data.affiliate.approvedAt && (
            <p className="text-xs text-muted-foreground mt-1" data-testid="text-member-since">
              Member since {new Date(data.affiliate.approvedAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!data.affiliate.stripeOnboardingComplete && data.payoutsEnabled && (
            <Button onClick={() => onboard.mutate()} disabled={onboard.isPending} data-testid="button-connect-onboard">
              {onboard.isPending ? "Loading..." : data.affiliate.stripeConnectAccountId ? "Continue payout setup" : "Set up payouts"}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleLogout} data-testid="button-logout">
            <LogOut className="w-4 h-4 mr-1.5" /> Log out
          </Button>
        </div>
        {!data.affiliate.stripeOnboardingComplete && !data.payoutsEnabled && (
          <div
            className="text-xs text-muted-foreground bg-muted/60 border rounded-md px-3 py-2 w-full"
            data-testid="text-payouts-coming-soon"
          >
            Payouts open soon - you can already start sharing your link and earning commissions.
          </div>
        )}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card><CardContent className="pt-5"><Users className="w-5 h-5 text-muted-foreground" /><p className="text-xs text-muted-foreground mt-1">Signups</p><p className="text-2xl font-semibold" data-testid="stat-signups">{data.stats.signups}</p></CardContent></Card>
        <Card><CardContent className="pt-5"><TrendingUp className="w-5 h-5 text-muted-foreground" /><p className="text-xs text-muted-foreground mt-1">Active customers</p><p className="text-2xl font-semibold" data-testid="stat-active">{data.stats.active}</p></CardContent></Card>
        <Card><CardContent className="pt-5"><DollarSign className="w-5 h-5 text-muted-foreground" /><p className="text-xs text-muted-foreground mt-1">This month earnings</p><p className="text-2xl font-semibold" data-testid="stat-this-month">{fmt(data.stats.thisMonthCents)}</p></CardContent></Card>
        <Card><CardContent className="pt-5"><Wallet className="w-5 h-5 text-muted-foreground" /><p className="text-xs text-muted-foreground mt-1">Pending payout</p><p className="text-2xl font-semibold" data-testid="stat-unpaid">{fmt(data.stats.unpaidCents)}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your link</CardTitle>
          <CardDescription>Share this link. Sign-ups get $10 off their first month, you earn 10% recurring.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input readOnly value={link} className="font-mono text-sm" data-testid="input-affiliate-link" />
            <Button onClick={handleCopy} variant="outline" data-testid="button-copy-affiliate-link">
              <Copy className="w-4 h-4 mr-1.5" />
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payout history</CardTitle>
          <CardDescription>Monthly payouts include commissions older than 7 days.</CardDescription>
        </CardHeader>
        <CardContent>
          {data.payouts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payouts yet. Your first payout will appear here after the next monthly cycle.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Paid at</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.payouts.map((p) => (
                  <TableRow key={p.id} data-testid={`row-payout-${p.id}`}>
                    <TableCell>{new Date(p.periodStart).toLocaleDateString()} – {new Date(p.periodEnd).toLocaleDateString()}</TableCell>
                    <TableCell>{fmt(p.amountCents)}</TableCell>
                    <TableCell><Badge variant={p.status === "paid" ? "default" : "secondary"}>{p.status}</Badge></TableCell>
                    <TableCell>{p.paidAt ? new Date(p.paidAt).toLocaleDateString() : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
