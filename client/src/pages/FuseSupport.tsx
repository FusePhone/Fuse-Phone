import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { LifeBuoy, GraduationCap, Mail, Send, Loader2, CheckCircle } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

export default function FuseSupport() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState(user?.email || "");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  const sendMutation = useMutation({
    mutationFn: async (data: { email: string; subject: string; message: string }) => {
      const res = await apiRequest("POST", "/api/support/submit", data);
      return res.json();
    },
    onSuccess: () => {
      setSent(true);
      setSubject("");
      setMessage("");
      toast({ title: "Message sent", description: "We'll get back to you as soon as possible." });
    },
    onError: () => {
      toast({ title: "Failed to send", description: "Please try again or email us directly at support@fusephone.com", variant: "destructive" });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !subject.trim() || !message.trim()) return;
    sendMutation.mutate({ email: email.trim(), subject: subject.trim(), message: message.trim() });
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <LifeBuoy className="w-7 h-7 text-primary" />
        <h1 className="text-2xl font-bold" data-testid="text-support-title">Fuse Support</h1>
      </div>
      <p className="text-muted-foreground text-sm mb-6">
        We're here to help you get the most out of Fuse Phone.
      </p>

      <Card className="mb-6" data-testid="card-support-form">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4 mb-5">
            <div className="p-2.5 rounded-lg bg-primary/10 shrink-0">
              <Mail className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold mb-1">Contact Support</h3>
              <p className="text-sm text-muted-foreground">
                Describe the issue below and we'll get back to you as soon as possible. Please include your account number so we can look into it quickly.
              </p>
            </div>
          </div>

          {sent ? (
            <div className="text-center py-8" data-testid="support-sent-confirmation">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
              <h3 className="font-semibold text-lg mb-1">Message Sent</h3>
              <p className="text-sm text-muted-foreground mb-4">We'll review your request and get back to you soon.</p>
              <Button variant="outline" onClick={() => setSent(false)} data-testid="button-send-another">
                Send Another Message
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Your Email</label>
                <Input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  data-testid="input-support-email"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Subject</label>
                <Input
                  placeholder="Brief description of the issue"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  required
                  data-testid="input-support-subject"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Message</label>
                <Textarea
                  placeholder="Please describe the problem in detail. Include your account number if possible."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={5}
                  required
                  data-testid="input-support-message"
                />
              </div>
              <Button
                type="submit"
                disabled={!email.trim() || !subject.trim() || !message.trim() || sendMutation.isPending}
                className="w-full"
                data-testid="button-submit-support"
              >
                {sendMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Send Message
                  </>
                )}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <Link href="/academy">
        <Card className="cursor-pointer hover:border-primary/40 transition-colors" data-testid="link-to-university">
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <GraduationCap className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-sm">Fuse University</p>
              <p className="text-xs text-muted-foreground">Browse video tutorials and guides</p>
            </div>
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}
