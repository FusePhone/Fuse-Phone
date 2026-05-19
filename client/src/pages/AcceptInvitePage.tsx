import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Building2, Shield, AlertCircle, CheckCircle2, Mail, Lock, User } from "lucide-react";
import { SiGoogle } from "react-icons/si";
import { FusePhoneLogoImage } from "@/components/FusePhoneLogo";
import { isCustomDomain } from "@/lib/domain";

interface InviteInfo {
  companyName: string;
  logo: string | null;
  role: string;
  email: string;
}

export default function AcceptInvitePage() {
  const [, params] = useRoute("/invite/:token");
  const token = params?.token || "";
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"signup" | "signin">("signup");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetch(`/api/company/invitations/info/${token}`)
      .then(async (res) => {
        if (res.status === 410) {
          setError("This invitation has expired. Please ask the company owner to send a new one.");
          return;
        }
        if (res.status === 404) {
          setError("This invitation is no longer valid. It may have already been used or cancelled.");
          return;
        }
        if (!res.ok) {
          setError("Something went wrong loading this invitation.");
          return;
        }
        const data = await res.json();
        setInviteInfo(data);
        setEmail(data.email || "");
      })
      .catch(() => setError("Could not load invitation details."))
      .finally(() => setLoading(false));
  }, [token]);

  const handleGoogleSignIn = () => {
    window.location.href = `/api/auth/google?intent=signup&invite=${token}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setSubmitting(true);

    try {
      const endpoint = mode === "signup" ? "/api/auth/register" : "/api/auth/login";
      const body: Record<string, string> = {
        email,
        password,
        inviteToken: token,
      };
      if (mode === "signup") {
        body.firstName = firstName;
        body.lastName = lastName;
        body.selectedPlan = "core";
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.requiresVerification) {
          toast({
            title: "Please verify your email first",
            description: "Check your inbox for a verification link, then come back and sign in.",
          });
          setMode("signin");
          setSubmitting(false);
          return;
        }
        toast({ title: "Error", description: data.message, variant: "destructive" });
        setSubmitting(false);
        return;
      }

      if (data.requiresVerification) {
        toast({
          title: "Please verify your email first",
          description: "Check your inbox for a verification link, then come back and sign in.",
        });
        setMode("signin");
        setSubmitting(false);
        return;
      }

      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "Welcome!", description: `You've joined ${inviteInfo?.companyName || "the team"}.` });
      setLocation("/");
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Something went wrong", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-6 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
              <AlertCircle className="w-8 h-8 text-destructive" />
            </div>
            <h2 className="text-xl font-semibold">Invitation Unavailable</h2>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" onClick={() => setLocation("/auth")} data-testid="link-go-to-login">
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!inviteInfo) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/30 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-4">
          {inviteInfo.logo ? (
            <img
              src={inviteInfo.logo}
              alt={inviteInfo.companyName}
              className="w-20 h-20 object-contain mx-auto rounded-xl"
            />
          ) : (
            <div className="w-20 h-20 rounded-xl bg-primary/10 flex items-center justify-center mx-auto">
              <Building2 className="w-10 h-10 text-primary" />
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold">You're Invited!</h1>
            <p className="text-muted-foreground mt-1">
              Join <strong>{inviteInfo.companyName}</strong>{isCustomDomain() ? '' : ' on Fuse Phone'}
            </p>
          </div>
          <Badge variant="secondary" className="text-sm py-1 px-3">
            <Shield className="w-3.5 h-3.5 mr-1.5" />
            {inviteInfo.role === 'crew_lead' ? 'Crew Lead' : inviteInfo.role === 'laborer' ? 'Field Employee' : inviteInfo.role === 'office_manager' ? 'Office Manager' : inviteInfo.role === 'project_manager' ? 'Project Manager' : inviteInfo.role === 'sales_rep' ? 'Sales Rep' : inviteInfo.role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
          </Badge>
        </div>

        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="text-center text-sm text-muted-foreground">
              <p>
                {mode === "signup"
                  ? "Create your account to get started"
                  : "Sign in to accept the invitation"}
              </p>
            </div>

            <Button
              variant="outline"
              className="w-full h-11 gap-2"
              onClick={handleGoogleSignIn}
              data-testid="button-google-invite"
            >
              <SiGoogle className="w-4 h-4" />
              Continue with Google
            </Button>

            <div className="flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground">or</span>
              <Separator className="flex-1" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              {mode === "signup" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="invite-first-name" className="text-xs">First Name</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="invite-first-name"
                        placeholder="First"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="pl-9"
                        data-testid="input-invite-first-name"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="invite-last-name" className="text-xs">Last Name</Label>
                    <Input
                      id="invite-last-name"
                      placeholder="Last"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      data-testid="input-invite-last-name"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="invite-email" className="text-xs">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="invite-email"
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-9"
                    required
                    data-testid="input-invite-email"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="invite-password" className="text-xs">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="invite-password"
                    type="password"
                    placeholder={mode === "signup" ? "Create a password (8+ chars)" : "Enter your password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9"
                    required
                    minLength={mode === "signup" ? 8 : undefined}
                    data-testid="input-invite-password"
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-11"
                disabled={submitting || !email || !password}
                data-testid="button-invite-submit"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                )}
                {mode === "signup" ? "Create Account & Join" : "Sign In & Join"}
              </Button>
            </form>

            <div className="text-center">
              {mode === "signup" ? (
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => setMode("signin")}
                  data-testid="link-switch-to-signin"
                >
                  Already have an account? Sign in
                </button>
              ) : (
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => setMode("signup")}
                  data-testid="link-switch-to-signup"
                >
                  Don't have an account? Sign up
                </button>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col items-center justify-center gap-2 pb-4">
          <div className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center overflow-hidden">
            <FusePhoneLogoImage size="sm" className="!h-7 !w-7" />
          </div>
          <p className="text-xs font-medium text-foreground/60">Powered by Fuse Phone CRM</p>
        </div>
      </div>
    </div>
  );
}
