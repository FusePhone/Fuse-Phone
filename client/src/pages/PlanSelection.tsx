import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Zap, Crown, Sparkles } from "lucide-react";
import { PRICE_LABELS } from "@shared/pricing";

const STARTER_FEATURES = [
  "Contacts, leads & 8-stage pipeline",
  "Unlimited proposals & invoices",
  "Digital signatures & customer portal",
  "Unlimited photos with annotations",
  "10 AI estimate interactions / month",
  "Gmail & Google Calendar sync",
  "Online booking page",
  "Customizable automated follow-ups (5 lead, 3 viewed, 3 unviewed)",
  "Email notifications",
];

const CORE_FEATURES = [
  "Everything in Starter",
  "Unlimited photos with annotations",
  "20 AI estimate interactions / month",
  "Stripe payments",
  "AI receipt scanner",
  "Crew time tracking (basic)",
  "Unlimited automated follow-ups",
];

const ELITE_FEATURES = [
  "Everything in Core",
  "FuseAI included — Proposal Builder, Production Rate Estimator, Job Costing & P&L, Scheduling Assistant & AI Lead Suggestions",
  "Unlimited photos & AI estimates",
  "Full VoIP phone system + SMS",
  "Crew payroll, GPS tracking & roles",
  "Bulk SMS + email campaigns",
  "Thumbtack, Zapier, FB Lead Ads, CompanyCam",
];

interface PlanSelectionProps {
  onSelectPlan: (plan: 'starter' | 'core' | 'elite') => void;
  isLoading?: boolean;
}

export default function PlanSelection({ onSelectPlan, isLoading }: PlanSelectionProps) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4 py-10">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2" data-testid="text-choose-plan">Choose Your Plan</h1>
        <p className="text-muted-foreground max-w-md mx-auto">
          Start your free trial today. Credit card required — cancel anytime.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl w-full">
        {/* STARTER */}
        <Card data-testid="card-plan-starter">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5" />
              Starter
            </CardTitle>
            <CardDescription>For solo painters getting organized</CardDescription>
            <div className="mt-2">
              <span className="text-3xl font-bold" data-testid="text-starter-price">{PRICE_LABELS.starterMonthly}</span>
              <span className="text-muted-foreground">/month</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">after 14-day free trial</p>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 mb-6">
              {STARTER_FEATURES.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <Button
              className="w-full"
              variant="outline"
              onClick={() => onSelectPlan('starter')}
              disabled={isLoading}
              data-testid="button-select-starter"
            >
              Start Free Trial
            </Button>
          </CardContent>
        </Card>

        {/* CORE — Most Popular */}
        <Card className="border-primary relative" data-testid="card-plan-core">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2">
            <Badge className="bg-primary text-primary-foreground shadow-md px-3 py-0.5 text-xs no-default-hover-elevate no-default-active-elevate">
              Most Popular
            </Badge>
          </div>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5" />
              Core
            </CardTitle>
            <CardDescription>For growing painting businesses</CardDescription>
            <div className="mt-2">
              <span className="text-3xl font-bold text-primary" data-testid="text-core-price">{PRICE_LABELS.coreMonthly}</span>
              <span className="text-muted-foreground">/month</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">after 14-day free trial</p>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 mb-6">
              {CORE_FEATURES.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <Button
              className="w-full"
              onClick={() => onSelectPlan('core')}
              disabled={isLoading}
              data-testid="button-select-core"
            >
              Start Free Trial
            </Button>
          </CardContent>
        </Card>

        {/* ELITE */}
        <Card data-testid="card-plan-elite">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Crown className="w-5 h-5" />
              Elite
            </CardTitle>
            <CardDescription>The full machine for established companies</CardDescription>
            <div className="mt-2">
              <span className="text-3xl font-bold" data-testid="text-elite-price">{PRICE_LABELS.eliteMonthly}</span>
              <span className="text-muted-foreground">/month</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">after 14-day free trial</p>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 mb-6">
              {ELITE_FEATURES.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                  <span>{feature}</span>
                </li>
              ))}
              <li className="flex items-start gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                <span>Optional add-on: Custom Branded Portal ({PRICE_LABELS.makeItYourOwnMonthly}/mo)</span>
              </li>
              <li className="flex items-start gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                <span>Optional add-on: AI Virtual Assistant ({PRICE_LABELS.aiAssistantMonthly}/mo · {PRICE_LABELS.aiAssistantMinutes} min)</span>
              </li>
            </ul>
            <Button
              className="w-full"
              variant="outline"
              onClick={() => onSelectPlan('elite')}
              disabled={isLoading}
              data-testid="button-select-elite"
            >
              Start Free Trial
            </Button>
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground mt-6 text-center max-w-md">
        Credit card required for all plans. Cancel anytime before your trial ends — no charge.
        You'll receive a reminder 2 days before your trial expires.
      </p>
    </div>
  );
}
