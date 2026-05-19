import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useSubscription } from "@/hooks/use-subscription";
import { useIsIOSApp } from "@/hooks/use-ios-app";
import {
  Loader2,
  Sparkles,
  Brain,
  MessageSquare,
  FileText,
  Calculator,
  Calendar,
  CheckCircle2,
  Zap,
  TrendingUp,
  AlertTriangle,
  Settings,
  BotMessageSquare,
  Crown,
  Clock,
  Send,
  Eye,
  Save,
  UserPlus,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useSearch } from "wouter";
import { FeatureTipBanner } from "@/components/FeatureTipBanner";

const FUSE_AI_FEATURES = [
  {
    icon: FileText,
    title: "AI Proposal Builder",
    description: "Generate detailed line items from natural language descriptions. Describe the job and get accurate, professional proposals instantly.",
  },
  {
    icon: Calculator,
    title: "Production Rate Estimator",
    description: "Build estimates with Block, Area, and Surface hierarchies. Material Groups with per-area material selection for precise job costing.",
  },
  {
    icon: TrendingUp,
    title: "Job Costing & P&L",
    description: "Real-time profit/loss tracking per project. Revenue from documents vs labor and material costs, with margin analysis.",
  },
  {
    icon: Calendar,
    title: "AI Scheduling Assistant",
    description: "Automatically recognize scheduling intent in messages and suggest available appointment slots based on your calendar.",
  },
];

const FUSE_AI_PRICE_MONTHLY = 5999;

function FuseAiSettings() {
  const { toast } = useToast();

  const { data: companySettings, isLoading: companyLoading } = useQuery<any>({
    queryKey: ["/api/settings/company"],
  });

  const { data: financialData, isLoading: financialLoading } = useQuery<any>({
    queryKey: ["/api/financial-settings"],
  });

  if (companyLoading || financialLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card data-testid="card-ai-lead-suggestions">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-green-600" />
            AI Lead Suggestions
          </CardTitle>
          <CardDescription>Automatically extract lead info from calls and texts</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1 flex-1">
              <p className="text-sm text-muted-foreground">
                When someone calls or texts from an unknown number, AI reads the conversation and suggests creating a new lead with their name, address, and project details pre-filled. Also suggests updates for existing contacts missing info.
              </p>
            </div>
            <Switch
              checked={companySettings?.aiLeadSuggestionsEnabled !== false}
              onCheckedChange={(checked) => {
                apiRequest("PUT", "/api/settings/company", { aiLeadSuggestionsEnabled: checked })
                  .then(() => {
                    queryClient.invalidateQueries({ queryKey: ["/api/settings/company"] });
                    toast({ title: checked ? "AI lead suggestions enabled" : "AI lead suggestions disabled" });
                  })
                  .catch((err: any) => toast({ title: "Failed to update", description: err.message, variant: "destructive" }));
              }}
              data-testid="switch-ai-lead-suggestions"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function isCapacitorNative(): boolean {
  if ((window as any).__CAPACITOR_NATIVE) return true;
  if (document.documentElement.classList.contains('capacitor-native')) return true;
  const Cap = (window as any).Capacitor;
  return !!(Cap?.isNativePlatform?.() || Cap?.isNative);
}

export default function FuseAI() {
  const isIOSApp = useIsIOSApp();
  const isNativeApp = isCapacitorNative();
  const { toast } = useToast();
  const { subscription, isLoading: subLoading, hasFuseAi, fuseAiStatus, isElite } = useSubscription();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const hasHandledReturn = useRef(false);

  useEffect(() => {
    if (hasHandledReturn.current) return;
    if (params.get('success') === 'true' || params.get('canceled') === 'true') {
      hasHandledReturn.current = true;
      window.history.replaceState({}, '', '/fuse-ai');
    }
  }, []);

  if (subLoading) {
    return (
      <div className="flex items-center justify-center h-full" data-testid="loading-fuse-ai">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isNativeApp && !hasFuseAi) {
    return (
      <div className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-md">
              <Sparkles className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
            <h1 className="text-2xl font-bold" data-testid="text-fuse-ai-title">FuseAI</h1>
          </div>
          <p className="text-muted-foreground" data-testid="text-fuse-ai-overview">
            FuseAI helps contractors work smarter with intelligent tools built for the trades.
          </p>
          <div>
            <h2 className="text-xl font-semibold mb-4">Capabilities</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {FUSE_AI_FEATURES.map((feature) => (
                <Card key={feature.title} data-testid={`card-feature-${feature.title.toLowerCase().replace(/\s+/g, '-')}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-md bg-purple-100 dark:bg-purple-900/30">
                        <feature.icon className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                      </div>
                      <CardTitle className="text-sm">{feature.title}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{feature.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
          <p className="text-sm text-muted-foreground" data-testid="text-fuse-ai-access-note">
            This feature is available to accounts with AI access enabled.
          </p>
        </div>
      </div>
    );
  }

  if (isNativeApp && hasFuseAi) {
    return (
      <div className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-md">
              <Sparkles className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
            <h1 className="text-2xl font-bold" data-testid="text-fuse-ai-title">FuseAI</h1>
          </div>
          <FuseAiSettings />
          <div>
            <h2 className="text-xl font-semibold mb-4" data-testid="text-features-heading">What's Included</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {FUSE_AI_FEATURES.map((feature) => (
                <Card key={feature.title} data-testid={`card-feature-${feature.title.toLowerCase().replace(/\s+/g, '-')}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-md bg-purple-100 dark:bg-purple-900/30">
                        <feature.icon className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                      </div>
                      <CardTitle className="text-sm">{feature.title}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{feature.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        <FeatureTipBanner
          id="fuse-ai"
          title="FuseAI"
          description="AI-powered tools built for your business — proposals, scheduling, negotiations, and more."
        />
        <div className="relative overflow-visible rounded-md bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 p-8 text-white">
          <div className="absolute inset-0 rounded-md bg-black/10" />
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-white/20 rounded-md">
                <Sparkles className="w-8 h-8" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-3xl font-bold tracking-tight" data-testid="text-fuse-ai-title">FuseAI</h1>
                  <Badge className="bg-emerald-400/90 text-emerald-950 border-emerald-300 text-xs no-default-hover-elevate no-default-active-elevate" data-testid="badge-fuseai-included">Included with Elite</Badge>
                </div>
                <p className="text-white/80 text-sm">AI features built into your Elite plan</p>
              </div>
            </div>
            <p className="text-lg text-white/90 max-w-2xl mb-6">
              Supercharge your workflow with AI-powered messaging, smart proposals, production rate estimation, customer sentiment, receipt info extraction, and automated scheduling — all trained on your business data.
            </p>
            <div className="flex items-end gap-4 flex-wrap">
              {hasFuseAi && (
                <Badge className="bg-white/20 text-white border-white/30 text-sm py-1 px-3">
                  <CheckCircle2 className="w-4 h-4 mr-1.5" />
                  Active
                </Badge>
              )}
              {!hasFuseAi && (
                <Badge className="bg-white/20 text-white border-white/30 text-sm py-1 px-3">
                  Upgrade to Elite to unlock
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-4" data-testid="text-features-heading">What's Included</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {FUSE_AI_FEATURES.map((feature) => (
              <Card key={feature.title} data-testid={`card-feature-${feature.title.toLowerCase().replace(/\s+/g, '-')}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-md bg-purple-100 dark:bg-purple-900/30">
                      <feature.icon className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    </div>
                    <CardTitle className="text-sm">{feature.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {hasFuseAi && <FuseAiSettings />}

        {!hasFuseAi && (
          <Card className="border-dashed" data-testid="card-fuse-ai-cta">
            <CardContent className="flex flex-col items-center justify-center py-10 text-center">
              <Sparkles className="w-12 h-12 text-purple-400 mb-4" />
              <h3 className="text-lg font-semibold mb-2">FuseAI is included with Elite</h3>
              <p className="text-sm text-muted-foreground max-w-md mb-6">
                Upgrade to the Elite plan to unlock smart messaging, AI proposals, customer sentiment, receipt info extraction, production rate estimating, and more — all included at no extra cost.
              </p>
              {!isIOSApp && (
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => window.location.href = '/billing'}
                  data-testid="button-upgrade-to-elite"
                >
                  <Crown className="w-4 h-4 mr-2" />
                  Upgrade to Elite
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
