import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, MailX, CheckCircle, AlertCircle } from "lucide-react";

export default function Unsubscribe() {
  const [, params] = useRoute("/unsubscribe/:token");
  const token = params?.token || "";

  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<{ contactName: string; companyName: string; alreadyUnsubscribed: boolean } | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/unsubscribe/${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.message) setError(data.message);
        else setInfo(data);
      })
      .catch(() => setError("Something went wrong"))
      .finally(() => setLoading(false));
  }, [token]);

  const handleUnsubscribe = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/unsubscribe/${token}`, { method: "POST" });
      const data = await res.json();
      if (data.success) setDone(true);
      else setError(data.message || "Failed to unsubscribe");
    } catch {
      setError("Something went wrong");
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
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
            <h2 className="text-xl font-semibold">Invalid Link</h2>
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (done || info?.alreadyUnsubscribed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto" />
            <h2 className="text-xl font-semibold">You're Unsubscribed</h2>
            <p className="text-muted-foreground">
              You've been removed from marketing emails from <strong>{info?.companyName}</strong>.
            </p>
            <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-1">Important:</p>
              <p>You'll still receive transactional emails like proposals, estimates, invoices, and payment receipts. Only marketing and promotional emails will stop.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full">
        <CardContent className="pt-8 pb-8 text-center space-y-6">
          <MailX className="w-12 h-12 text-muted-foreground mx-auto" />
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">Unsubscribe from Marketing Emails</h2>
            <p className="text-muted-foreground">
              Hi {info?.contactName}, would you like to stop receiving marketing emails from <strong>{info?.companyName}</strong>?
            </p>
          </div>
          <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground text-left">
            <p className="font-medium text-foreground mb-1">What this means:</p>
            <ul className="space-y-1 list-disc list-inside">
              <li>You'll stop getting promotional and campaign emails</li>
              <li>You'll still receive important emails like proposals, estimates, invoices, and payment receipts</li>
            </ul>
          </div>
          <Button
            onClick={handleUnsubscribe}
            disabled={submitting}
            variant="destructive"
            className="w-full"
            data-testid="btn-unsubscribe"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Unsubscribe
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
