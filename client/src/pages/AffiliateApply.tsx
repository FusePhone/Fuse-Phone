import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Sparkles, DollarSign, Calendar, CheckCircle2 } from "lucide-react";

export default function AffiliateApply() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [fullName, setFullName] = useState("");
  const [socialPlatform, setSocialPlatform] = useState("instagram");
  const [socialHandle, setSocialHandle] = useState("");
  const [followerCount, setFollowerCount] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [applicationNotes, setApplicationNotes] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const { data: me } = useQuery<{ id: string; firstName?: string; lastName?: string; email?: string } | null>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  const { data: existing } = useQuery<{ affiliate: any }>({
    queryKey: ["/api/affiliate/me"],
    enabled: !!me,
    retry: false,
  });

  useEffect(() => {
    if (me && !fullName) setFullName([me.firstName, me.lastName].filter(Boolean).join(" ").trim());
  }, [me, fullName]);

  const submit = useMutation({
    mutationFn: async () =>
      apiRequest("POST", "/api/affiliate/apply", {
        fullName,
        socialPlatform,
        socialHandle,
        followerCount: followerCount ? Number(followerCount) : null,
        websiteUrl,
        applicationNotes,
        agreedToTerms,
      }),
    onSuccess: () => {
      toast({ title: "Application submitted", description: "We review most applications within 2 business days." });
      queryClient.invalidateQueries({ queryKey: ["/api/affiliate/me"] });
    },
    onError: (e: any) => toast({ title: "Submission failed", description: e?.message || "Try again", variant: "destructive" }),
  });

  if (!me) {
    return (
      <div className="max-w-2xl mx-auto py-10 px-4">
        <Card>
          <CardHeader>
            <CardTitle>Sign in to apply</CardTitle>
            <CardDescription>You need a Fuse Phone account to apply for the Affiliate Program.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate("/auth?next=/affiliate")} data-testid="button-signin-to-apply">Sign in or create account</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (existing?.affiliate) {
    const a = existing.affiliate;
    return (
      <div className="max-w-2xl mx-auto py-10 px-4">
        <Card data-testid="card-affiliate-status">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              Affiliate Application
            </CardTitle>
            <CardDescription>Status: <strong className="capitalize">{a.status}</strong></CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {a.status === "applied" && <p>We're reviewing your application. We'll email you within 2 business days.</p>}
            {a.status === "approved" && (
              <>
                <p>You're approved! Open your dashboard to grab your link and set up payouts.</p>
                <Link href="/affiliate/dashboard"><Button data-testid="button-go-dashboard">Open Dashboard</Button></Link>
              </>
            )}
            {a.status === "rejected" && (
              <>
                <p>Your application wasn't accepted at this time.</p>
                {a.rejectionReason && <p className="text-sm text-muted-foreground">Reason: {a.rejectionReason}</p>}
              </>
            )}
            {a.status === "paused" && <p>Your account is currently paused. Contact support@fusephone.com for help.</p>}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-10 px-4 space-y-6">
      <div className="text-center space-y-3">
        <Sparkles className="w-10 h-10 text-amber-500 mx-auto" />
        <h1 className="text-3xl font-bold">Fuse Phone Affiliate Program</h1>
        <p className="text-muted-foreground max-w-xl mx-auto">
          Earn 10% recurring commission for 12 months on every customer you refer. Monthly payouts via Stripe.
        </p>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <Card><CardContent className="pt-6"><DollarSign className="w-6 h-6 mb-2 text-emerald-500" /><p className="font-semibold">10% recurring</p><p className="text-sm text-muted-foreground">On every paid month</p></CardContent></Card>
        <Card><CardContent className="pt-6"><Calendar className="w-6 h-6 mb-2 text-emerald-500" /><p className="font-semibold">12 months</p><p className="text-sm text-muted-foreground">Of commission per signup</p></CardContent></Card>
        <Card><CardContent className="pt-6"><CheckCircle2 className="w-6 h-6 mb-2 text-emerald-500" /><p className="font-semibold">Monthly payouts</p><p className="text-sm text-muted-foreground">Via Stripe Connect</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Apply</CardTitle>
          <CardDescription>Tell us about yourself. Bank/tax info is collected later, when you request your first payout.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              submit.mutate();
            }}
          >
            <div>
              <Label>Full name</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required data-testid="input-affiliate-fullname" />
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <Label>Platform</Label>
                <Select value={socialPlatform} onValueChange={setSocialPlatform}>
                  <SelectTrigger data-testid="select-affiliate-platform"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="instagram">Instagram</SelectItem>
                    <SelectItem value="youtube">YouTube</SelectItem>
                    <SelectItem value="tiktok">TikTok</SelectItem>
                    <SelectItem value="facebook">Facebook</SelectItem>
                    <SelectItem value="twitter">X / Twitter</SelectItem>
                    <SelectItem value="linkedin">LinkedIn</SelectItem>
                    <SelectItem value="blog">Blog / Newsletter</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label>Handle / URL</Label>
                <Input value={socialHandle} onChange={(e) => setSocialHandle(e.target.value)} placeholder="@yourhandle" data-testid="input-affiliate-handle" />
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label>Audience size</Label>
                <Input type="number" value={followerCount} onChange={(e) => setFollowerCount(e.target.value)} placeholder="e.g. 12000" data-testid="input-affiliate-followers" />
              </div>
              <div>
                <Label>Website (optional)</Label>
                <Input value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://..." data-testid="input-affiliate-website" />
              </div>
            </div>
            <div>
              <Label>Why are you a good fit?</Label>
              <Textarea
                value={applicationNotes}
                onChange={(e) => setApplicationNotes(e.target.value)}
                placeholder="Tell us about your audience and how you'd promote Fuse Phone."
                rows={4}
                data-testid="textarea-affiliate-notes"
              />
            </div>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={agreedToTerms} onCheckedChange={(v) => setAgreedToTerms(v === true)} data-testid="checkbox-affiliate-terms" />
              <span>
                I agree to the <Link href="/terms" className="underline">Affiliate Terms</Link>, including the 10% / 12-month commission structure,
                7-day commission hold, monthly payouts, fraud rules, and 1099 tax reporting (US).
              </span>
            </label>
            <Button type="submit" disabled={!agreedToTerms || !fullName || submit.isPending} data-testid="button-submit-affiliate-application">
              {submit.isPending ? "Submitting..." : "Submit application"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
