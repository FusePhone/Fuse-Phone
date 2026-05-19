import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2, RefreshCw } from "lucide-react";
import { FusePhoneLogoImage } from "@/components/FusePhoneLogo";
import { useToast } from "@/hooks/use-toast";

export default function VerifyEmailPage() {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<"loading" | "success" | "error" | "expired">("loading");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [isResending, setIsResending] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const verifyEmail = async () => {
      const params = new URLSearchParams(window.location.search);
      const token = params.get("token");

      if (!token) {
        setStatus("error");
        setMessage("Invalid verification link. Please request a new one.");
        return;
      }

      try {
        const response = await fetch(`/api/auth/verify-email?token=${token}`);
        const data = await response.json();

        if (response.ok) {
          setStatus("success");
          setMessage(data.message);
          setEmail(data.email);
        } else if (data.expired) {
          setStatus("expired");
          setMessage(data.message);
          setEmail(data.email);
        } else {
          setStatus("error");
          setMessage(data.message);
        }
      } catch {
        setStatus("error");
        setMessage("Failed to verify email. Please try again.");
      }
    };

    verifyEmail();
  }, []);

  const handleResendVerification = async () => {
    if (!email) return;
    setIsResending(true);
    try {
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      toast({
        title: "Verification Email",
        description: data.message,
      });
    } catch {
      toast({
        title: "Error",
        description: "Failed to resend verification email",
        variant: "destructive",
      });
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <div className="absolute top-10 left-10 w-64 h-64 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-10 right-10 w-96 h-96 bg-accent/5 rounded-full blur-3xl" />
      </div>

      <Card className="w-full max-w-md border-2 border-primary/10 shadow-xl z-10">
        <CardContent className="p-8 text-center">
          <div className="flex items-center justify-center gap-2 mb-8">
            <FusePhoneLogoImage size="lg" />
            <span className="font-display font-bold text-2xl tracking-tight">Fuse Phone</span>
          </div>

          {status === "loading" && (
            <div className="py-8">
              <Loader2 className="w-12 h-12 mx-auto mb-4 text-primary animate-spin" />
              <p className="text-muted-foreground">Verifying your email...</p>
            </div>
          )}

          {status === "success" && (
            <div className="py-4">
              <div className="w-16 h-16 mx-auto mb-4 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <h2 className="text-xl font-bold mb-2">Email Verified!</h2>
              <p className="text-muted-foreground mb-6">{message}</p>
              <Button
                onClick={() => setLocation("/auth")}
                className="w-full"
                data-testid="button-go-to-login"
              >
                Go to Sign In
              </Button>
            </div>
          )}

          {status === "error" && (
            <div className="py-4">
              <div className="w-16 h-16 mx-auto mb-4 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                <XCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
              </div>
              <h2 className="text-xl font-bold mb-2">Verification Failed</h2>
              <p className="text-muted-foreground mb-6">{message}</p>
              <Button
                onClick={() => setLocation("/auth")}
                className="w-full"
                data-testid="button-go-to-login"
              >
                Go to Sign In
              </Button>
            </div>
          )}

          {status === "expired" && (
            <div className="py-4">
              <div className="w-16 h-16 mx-auto mb-4 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center">
                <XCircle className="w-8 h-8 text-yellow-600 dark:text-yellow-400" />
              </div>
              <h2 className="text-xl font-bold mb-2">Link Expired</h2>
              <p className="text-muted-foreground mb-6">{message}</p>
              <div className="space-y-3">
                <Button
                  onClick={handleResendVerification}
                  disabled={isResending}
                  variant="outline"
                  className="w-full"
                  data-testid="button-resend-verification"
                >
                  {isResending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <RefreshCw className="w-4 h-4 mr-2" />
                  )}
                  Resend Verification Email
                </Button>
                <Button
                  onClick={() => setLocation("/auth")}
                  variant="ghost"
                  className="w-full"
                  data-testid="button-go-to-login"
                >
                  Go to Sign In
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
