import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { FusePhoneLogoImage } from "@/components/FusePhoneLogo";
import { Mail, KeyRound, Loader2, ChevronLeft } from "lucide-react";
import { Link } from "wouter";

export default function AffiliateLogin() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");

  const { data: me } = useQuery<{ id: string } | null>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  // If already signed in, jump straight to the dashboard
  useEffect(() => {
    if (me?.id) navigate("/dashboard");
  }, [me?.id, navigate]);

  const requestOtp = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/web/request-otp", { email: email.trim().toLowerCase() });
      return res.json();
    },
    onSuccess: (json: any) => {
      if (json?.success === false) {
        toast({ title: "Could not send code", description: json?.message || "Try again", variant: "destructive" });
        return;
      }
      setStep("code");
      toast({ title: "Code sent", description: "Check your email for a 6-digit code." });
    },
    onError: (e: any) => toast({ title: "Could not send code", description: e?.message || "Try again", variant: "destructive" }),
  });

  const verifyOtp = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/web/verify-otp", {
        email: email.trim().toLowerCase(),
        code: code.trim(),
      });
      return res.json();
    },
    onSuccess: async (json: any) => {
      if (json?.success === false || !json?.user) {
        toast({
          title: "Sign-in failed",
          description: json?.message || "That code didn't work. Try again.",
          variant: "destructive",
        });
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/affiliate/me"] });
      navigate("/dashboard");
    },
    onError: (e: any) => toast({ title: "Sign-in failed", description: e?.message || "Try again", variant: "destructive" }),
  });

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2" data-testid="link-home">
            <FusePhoneLogoImage size="md" />
            <div className="flex items-baseline gap-2">
              <span className="font-display font-bold text-xl tracking-tight">Fuse Phone</span>
              <span className="text-xs uppercase tracking-widest text-amber-500 font-semibold">Partners</span>
            </div>
          </Link>
          <Button asChild variant="ghost" size="sm" data-testid="button-back">
            <Link href="/"><ChevronLeft className="w-4 h-4 mr-1" />Home</Link>
          </Button>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-amber-500" />
              Affiliate sign-in
            </CardTitle>
            <CardDescription>
              {step === "email"
                ? "Enter the email you used to apply. We'll send you a 6-digit code."
                : `We sent a 6-digit code to ${email}. It expires in 10 minutes.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {step === "email" ? (
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (email.trim()) requestOtp.mutate();
                }}
              >
                <div>
                  <Label htmlFor="affiliate-login-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="affiliate-login-email"
                      type="email"
                      autoComplete="email"
                      autoFocus
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="pl-9"
                      required
                      data-testid="input-affiliate-login-email"
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={requestOtp.isPending || !email.trim()}
                  data-testid="button-affiliate-send-code"
                >
                  {requestOtp.isPending ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending code…</>
                  ) : (
                    "Email me a code"
                  )}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Don't have an affiliate account yet?{" "}
                  <Link href="/apply" className="underline" data-testid="link-apply">Apply here</Link>.
                </p>
              </form>
            ) : (
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (code.trim().length >= 4) verifyOtp.mutate();
                }}
              >
                <div>
                  <Label htmlFor="affiliate-login-code">6-digit code</Label>
                  <Input
                    id="affiliate-login-code"
                    inputMode="text"
                    autoComplete="one-time-code"
                    autoFocus
                    value={code}
                    onChange={(e) => setCode(e.target.value.slice(0, 8))}
                    placeholder="Enter code"
                    className="text-center text-xl tracking-[0.4em] font-mono"
                    maxLength={8}
                    required
                    data-testid="input-affiliate-login-code"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={verifyOtp.isPending || code.length < 4}
                  data-testid="button-affiliate-verify-code"
                >
                  {verifyOtp.isPending ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Signing in…</>
                  ) : (
                    "Sign in"
                  )}
                </Button>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <button
                    type="button"
                    className="underline"
                    onClick={() => { setStep("email"); setCode(""); }}
                    data-testid="button-change-email"
                  >
                    Use a different email
                  </button>
                  <button
                    type="button"
                    className="underline"
                    onClick={() => requestOtp.mutate()}
                    disabled={requestOtp.isPending}
                    data-testid="button-resend-code"
                  >
                    Resend code
                  </button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
