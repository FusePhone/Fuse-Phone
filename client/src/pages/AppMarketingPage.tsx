/* ============================================================================
 * ⚠️  DO NOT MODIFY THIS FILE WITHOUT EXPLICIT OWNER APPROVAL  ⚠️
 * ----------------------------------------------------------------------------
 * This page (/app-info) is the APPLE APP STORE REVIEW page ONLY.
 * It exists so Apple reviewers can see what the app does during submission.
 *
 * THE REAL PUBLIC MARKETING SITE LIVES AT fusephone.com — NOT IN THIS FILE.
 * Marketing copy, pricing, SEO, and sales enhancements belong on fusephone.com,
 * which is a SEPARATE project / codebase.
 *
 * If the user asks to "update the marketing page", ask them whether they mean
 * fusephone.com (the public marketing site) or this Apple-review page before
 * making any changes here.
 * ==========================================================================*/

import { ArrowLeft, Smartphone, FileText, Palette, Calculator, Users, MessageSquare, Camera, Bell, Shield, BarChart3, Calendar, Map, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useSafeBack } from "@/hooks/use-safe-back";

const features = [
  {
    icon: FileText,
    title: "Proposals & Invoices",
    description: "Create professional proposals, estimates, invoices, and change orders with digital signatures and customer portals."
  },
  {
    icon: BarChart3,
    title: "9-Stage Lead Pipeline",
    description: "Track every lead from first contact to project completion with automated stage progression and visual tracking."
  },
  {
    icon: MessageSquare,
    title: "Unified Communications",
    description: "Manage calls, SMS, and emails from one place. AI-powered response suggestions and automated follow-ups."
  },
  {
    icon: Palette,
    title: "Paint Color Library",
    description: "Browse 5,700+ colors from Benjamin Moore, Sherwin-Williams, and Farrow & Ball. Share selections with customers for approval."
  },
  {
    icon: Calculator,
    title: "Job Costing & Rates",
    description: "Accurate job costing with material markup, multi-coat rates, complexity tracking, and real-time profit & loss."
  },
  {
    icon: Users,
    title: "Team Management",
    description: "Manage crews, assign jobs, broadcast notes, and track time with GPS-assisted appointment logging."
  },
  {
    icon: Camera,
    title: "Unlimited Job Site Photos",
    description: "Unlimited photos with annotations on every plan. Document every job, mark up arrows, text, and color callouts, and keep organized galleries on every project."
  },
  {
    icon: Calendar,
    title: "Smart Scheduling",
    description: "AI scheduling assistant with Google Calendar integration, automated reminders, and crew coordination."
  },
  {
    icon: Bell,
    title: "Instant Notifications",
    description: "Real-time push notifications for new leads, messages, appointment reminders, and team updates."
  },
  {
    icon: Map,
    title: "GPS & Directions",
    description: "Job site addresses with one-tap navigation, location-based check-ins, and service area management."
  },
  {
    icon: Zap,
    title: "AI-Powered Tools",
    description: "FuseAI project assistant and automated lead suggestions."
  },
  {
    icon: Shield,
    title: "Secure & Reliable",
    description: "Enterprise-grade security with encrypted data, secure customer portals, and automatic backups."
  }
];

export default function AppMarketingPage() {
  const handleBack = useSafeBack("/");
  return (
    <div className="min-h-screen bg-background" data-testid="page-app-marketing">
      <header className="sticky top-0 z-[1000] border-b bg-background/95 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={handleBack} data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <span className="font-display font-bold text-xl tracking-tight">Fuse Phone</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6" data-testid="badge-app-available">
            <Smartphone className="w-4 h-4" />
            Available on iOS
          </div>
          <h1 className="text-4xl sm:text-5xl font-display font-bold mb-4 tracking-tight" data-testid="text-hero-title">
            The CRM Built for
            <br />
            <span className="text-primary">Painting Contractors</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto" data-testid="text-hero-subtitle">
            Fuse Phone centralizes your leads, clients, documents, and communication
            in one powerful app — so you can focus on growing your business.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-16">
          {features.map((feature, index) => (
            <Card key={index} className="border bg-card hover:shadow-md transition-shadow" data-testid={`card-feature-${index}`}>
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <div className="p-2.5 rounded-lg bg-primary/10 shrink-0">
                    <feature.icon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground">{feature.description}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="rounded-2xl bg-primary/5 border border-primary/10 p-8 sm:p-12 text-center mb-16" data-testid="section-cta">
          <h2 className="text-2xl sm:text-3xl font-display font-bold mb-3">
            Run Your Painting Business Smarter
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto mb-6">
            From the first phone call to the final invoice, Fuse Phone keeps everything
            organized and your customers happy.
          </p>
        </div>

        <div className="text-center text-sm text-muted-foreground space-y-2" data-testid="section-footer-links">
          <div className="flex items-center justify-center gap-4">
            <a href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</a>
            <span>·</span>
            <a href="/terms" className="hover:text-foreground transition-colors">Terms of Service</a>
            <span>·</span>
            <a href="/support" className="hover:text-foreground transition-colors">Support</a>
          </div>
          <p>© {new Date().getFullYear()} Fuse Phone. All rights reserved.</p>
        </div>
      </main>
    </div>
  );
}
