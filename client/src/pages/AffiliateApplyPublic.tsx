import { useState } from "react";
import { Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { FusePhoneLogoImage } from "@/components/FusePhoneLogo";
import { CheckCircle2, ChevronLeft, Sparkles } from "lucide-react";

export default function AffiliateApplyPublic() {
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [socialPlatform, setSocialPlatform] = useState("tiktok");
  const [socialHandle, setSocialHandle] = useState("");
  const [followerCount, setFollowerCount] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [applicationNotes, setApplicationNotes] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const submit = useMutation({
    mutationFn: async () =>
      apiRequest("POST", "/api/affiliate/apply", {
        email,
        fullName,
        phone,
        socialPlatform,
        socialHandle,
        followerCount: followerCount ? Number(followerCount) : null,
        websiteUrl,
        applicationNotes,
        agreedToTerms,
      }),
    onSuccess: () => {
      setSubmitted(true);
    },
    onError: async (e: any) => {
      let msg = "Please review your application and try again.";
      try {
        const r = await e?.response?.json?.();
        if (r?.message) msg = r.message;
      } catch {}
      if (typeof e?.message === "string" && e.message.length < 200) msg = e.message;
      toast({ title: "Could not submit", description: msg, variant: "destructive" });
    },
  });

  const onSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    submit.mutate();
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2" data-testid="link-home">
            <FusePhoneLogoImage size="md" />
            <div className="flex items-baseline gap-2">
              <span className="font-display font-bold text-xl tracking-tight">Fuse Phone</span>
              <span className="text-xs uppercase tracking-widest text-amber-500 font-semibold">Partners</span>
            </div>
          </Link>
          <Button variant="ghost" asChild size="sm" data-testid="button-back-landing">
            <Link href="/"><ChevronLeft className="w-4 h-4 mr-1" />Back</Link>
          </Button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
        {submitted ? (
          <Card data-testid="card-success">
            <CardContent className="p-10 text-center">
              <div className="w-14 h-14 mx-auto rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-4">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h2 className="font-display font-bold text-2xl mb-2" data-testid="text-success-title">Application received</h2>
              <p className="text-muted-foreground mb-6">
                Thanks, {fullName.split(" ")[0] || "there"}. We review every application personally and you'll hear back from us, usually within 48 hours, at <span className="font-medium text-foreground">{email}</span>.
              </p>
              <div className="flex justify-center gap-2">
                <Button asChild variant="outline" data-testid="button-back-home"><Link href="/">Back to home</Link></Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card data-testid="card-apply-form">
            <CardHeader>
              <div className="inline-flex items-center gap-2 text-amber-500 text-xs font-semibold uppercase tracking-wider mb-2">
                <Sparkles className="w-3.5 h-3.5" /> Partner Application
              </div>
              <CardTitle className="text-2xl">Apply to the Fuse Phone Partner Program</CardTitle>
              <CardDescription>
                Tell us about you and where you reach contractors. Takes about 2 minutes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={onSubmit} className="space-y-5">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="fullName">Full name *</Label>
                    <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} required data-testid="input-fullname" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email *</Label>
                    <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required data-testid="input-email" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="phone">Phone (optional)</Label>
                  <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} data-testid="input-phone" />
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Primary platform *</Label>
                    <Select value={socialPlatform} onValueChange={setSocialPlatform}>
                      <SelectTrigger data-testid="select-platform"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="tiktok">TikTok</SelectItem>
                        <SelectItem value="instagram">Instagram</SelectItem>
                        <SelectItem value="youtube">YouTube</SelectItem>
                        <SelectItem value="facebook">Facebook</SelectItem>
                        <SelectItem value="x">X / Twitter</SelectItem>
                        <SelectItem value="linkedin">LinkedIn</SelectItem>
                        <SelectItem value="podcast">Podcast</SelectItem>
                        <SelectItem value="newsletter">Newsletter / Blog</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="socialHandle">Handle / channel name *</Label>
                    <Input id="socialHandle" value={socialHandle} onChange={(e) => setSocialHandle(e.target.value)} required placeholder="@yourhandle" data-testid="input-handle" />
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="followerCount">Audience size (optional)</Label>
                    <Input id="followerCount" type="number" inputMode="numeric" value={followerCount} onChange={(e) => setFollowerCount(e.target.value)} placeholder="e.g. 12000" data-testid="input-followers" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="websiteUrl">Website / channel URL (optional)</Label>
                    <Input id="websiteUrl" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://..." data-testid="input-website" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="applicationNotes">Why do you want to partner with Fuse Phone? *</Label>
                  <Textarea id="applicationNotes" value={applicationNotes} onChange={(e) => setApplicationNotes(e.target.value)} required rows={4} placeholder="Who's your audience? How do you plan to share Fuse Phone? Any past experience with affiliate programs?" data-testid="input-notes" />
                </div>

                <div className="flex items-start gap-2">
                  <Checkbox id="terms" checked={agreedToTerms} onCheckedChange={(v) => setAgreedToTerms(!!v)} data-testid="checkbox-terms" />
                  <label htmlFor="terms" className="text-sm text-muted-foreground leading-snug">
                    I agree to the Fuse Phone Partner Program terms. I understand commissions are paid only on active paying customers and that inactive partner accounts may be paused.
                  </label>
                </div>

                <Button type="submit" size="lg" disabled={submit.isPending || !agreedToTerms} className="w-full" data-testid="button-submit">
                  {submit.isPending ? "Submitting..." : "Submit application"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
