import { ArrowLeft, Mail, Clock, HelpCircle, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useSafeBack } from "@/hooks/use-safe-back";

export default function SupportPage() {
  const handleBack = useSafeBack("/");
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-[1000] border-b bg-background/95 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={handleBack} data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <span className="font-display font-bold text-xl tracking-tight">Fuse Phone</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2" data-testid="text-support-title">Support</h1>
        <p className="text-muted-foreground mb-8">We're here to help you get the most out of Fuse Phone.</p>

        <div className="max-w-md mb-12">
          <Card data-testid="card-support-email">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="p-2.5 rounded-lg bg-primary/10">
                  <Mail className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Email Support</h3>
                  <p className="text-sm text-muted-foreground mb-3">Send us a message and we'll get back to you as soon as possible.</p>
                  <a href="mailto:support@fusephone.com" className="text-sm font-medium text-primary hover:underline" data-testid="link-support-email">
                    support@fusephone.com
                  </a>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <h2 className="text-2xl font-display font-bold mb-6" data-testid="text-faq-title">Frequently Asked Questions</h2>

        <div className="space-y-6">
          <section className="border-b pb-6">
            <div className="flex items-start gap-3">
              <HelpCircle className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <h3 className="font-semibold mb-2">How do I get started with Fuse Phone?</h3>
                <p className="text-sm text-muted-foreground">Sign up at fusephone.com and log in using the mobile app or web dashboard. Once you're in, you can start adding contacts, creating projects, and building documents right away.</p>
              </div>
            </div>
          </section>

          <section className="border-b pb-6">
            <div className="flex items-start gap-3">
              <HelpCircle className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <h3 className="font-semibold mb-2">How do I manage my account?</h3>
                <p className="text-sm text-muted-foreground">Open the app and tap the menu to access your profile, account settings, and team management. To manage or cancel a subscription purchased through the App Store, go to Settings → your name → Subscriptions on your iPhone.</p>
              </div>
            </div>
          </section>

          <section className="border-b pb-6">
            <div className="flex items-start gap-3">
              <HelpCircle className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <h3 className="font-semibold mb-2">Can I use Fuse Phone on multiple devices?</h3>
                <p className="text-sm text-muted-foreground">Yes. Log in with the same account on any device — your data syncs automatically across the mobile app and web dashboard.</p>
              </div>
            </div>
          </section>

          <section className="border-b pb-6">
            <div className="flex items-start gap-3">
              <HelpCircle className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <h3 className="font-semibold mb-2">How do I create and send documents?</h3>
                <p className="text-sm text-muted-foreground">Navigate to any project and use the Documents tab to create proposals, estimates, invoices, or change orders. You can share documents with clients via a secure link, QR code, or email.</p>
              </div>
            </div>
          </section>

          <section className="border-b pb-6">
            <div className="flex items-start gap-3">
              <Clock className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <h3 className="font-semibold mb-2">What are your support hours and response times?</h3>
                <p className="text-sm text-muted-foreground mb-2">Our support team is available Monday through Friday, 9 AM – 6 PM Eastern Time. Response times depend on your plan:</p>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-5">
                  <li><span className="font-medium text-foreground">Starter</span> — Email support, best-effort response (typically 2–3 business days)</li>
                  <li><span className="font-medium text-foreground">Core</span> — Email support within 24 hours on business days</li>
                  <li><span className="font-medium text-foreground">Elite</span> — Priority email support during business hours, typically same-day response</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="pb-6">
            <div className="flex items-start gap-3">
              <Shield className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <h3 className="font-semibold mb-2">Is my data secure?</h3>
                <p className="text-sm text-muted-foreground">Yes. Fuse Phone uses encrypted connections, secure authentication, and follows industry best practices to protect your business data. See our <a href="/privacy" className="text-primary hover:underline">Privacy Policy</a> for details.</p>
              </div>
            </div>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t text-center">
          <p className="text-sm text-muted-foreground">
            <a href="/privacy" className="hover:text-foreground/70" data-testid="link-privacy">Privacy Policy</a>
            <span className="mx-3">·</span>
            <a href="/terms" className="hover:text-foreground/70" data-testid="link-terms">Terms of Service</a>
          </p>
          <p className="text-xs text-muted-foreground mt-4">© {new Date().getFullYear()} Fuse Phone. All rights reserved.</p>
        </div>
      </main>
    </div>
  );
}
