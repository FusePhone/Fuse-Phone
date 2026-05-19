import { useMessageTemplates } from "@/hooks/use-templates";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ArrowLeft, ChevronRight, Send, DollarSign, Eye, EyeOff, MessageSquare, Mail, UserPlus, Briefcase, Lock } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { useSafeBack } from "@/hooks/use-safe-back";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSubscription } from "@/hooks/use-subscription";
import type { MessageTemplate } from "@shared/schema";

interface CategoryConfig {
  key: string;
  label: string;
  icon: typeof Send;
  description: string;
}

const CATEGORY_CONFIGS: CategoryConfig[] = [
  { key: "document_sending", label: "Document Sending", icon: Send, description: "Messages sent when sharing documents" },
  { key: "payments", label: "Payments", icon: DollarSign, description: "Payment requests and confirmations" },
  { key: "followup_not_viewed", label: "Follow-ups: Not Viewed", icon: EyeOff, description: "When the client hasn't opened the document" },
  { key: "followup_viewed", label: "Follow-ups: Viewed", icon: Eye, description: "When the client viewed but hasn't signed" },
  { key: "lead_followup", label: "Lead Follow-up", icon: UserPlus, description: "Automated messages for new leads at timed intervals" },
  { key: "jobs", label: "Jobs", icon: Briefcase, description: "Job scheduling, reminders, progress updates, and completion" },
  { key: "general", label: "General", icon: MessageSquare, description: "Appointment reminders, thank you messages, and more" },
];

function getPreview(content: string, maxLength: number = 80): string {
  const text = content.trim();
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + '...';
}

const STARTER_ALLOWED_SLUGS: Record<string, string[]> = {
  payments: [],
  followup_not_viewed: ['followup_not_viewed_1_day', 'followup_not_viewed_2_days', 'followup_not_viewed_5_days'],
  followup_viewed: ['followup_viewed_1_day', 'followup_viewed_2_days', 'followup_viewed_5_days'],
  lead_followup: ['lead_welcome', 'lead_followup_2_hours', 'lead_followup_1_day', 'lead_followup_2_days', 'lead_followup_5_days'],
  jobs: ['job_completed'],
  general: ['appointment_confirmation', 'appointment_reminder', 'thank_you'],
};

const HIDDEN_TEMPLATES = ['job_in_progress', 'sending_estimate'];

export default function MessageTemplates() {
  const [, navigate] = useLocation();
  const handleBack = useSafeBack("/settings/templates");
  const { data: msgTemplates, isLoading } = useMessageTemplates();
  const { baseTier, isNativeApp } = useSubscription();
  const qc = useQueryClient();
  const isStarter = baseTier === 'starter';

  const toggleEnabled = useMutation({
    mutationFn: async ({ slug, isEnabled }: { slug: string; isEnabled: boolean }) => {
      await apiRequest('PATCH', `/api/message-templates/${slug}`, { isEnabled });
    },
    onMutate: async ({ slug, isEnabled }) => {
      await qc.cancelQueries({ queryKey: ['/api/message-templates'] });
      const previous = qc.getQueryData(['/api/message-templates']);
      qc.setQueryData(['/api/message-templates'], (old: any[] | undefined) =>
        old?.map(t => t.slug === slug ? { ...t, isEnabled } : t)
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(['/api/message-templates'], context.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['/api/message-templates'] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary" data-testid="loader-message-templates" />
      </div>
    );
  }

  const templatesByCategory = (category: string): MessageTemplate[] => {
    return (msgTemplates || []).filter(t => t.category === category && !HIDDEN_TEMPLATES.includes(t.slug));
  };

  return (
    <div className="h-full flex flex-col p-6 pb-24 lg:p-8 lg:pb-24 animate-in fade-in duration-300">
      <div className="flex items-center gap-3 mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleBack}
          data-testid="button-back-templates"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold font-display" data-testid="text-page-title">Message Templates</h1>
          <p className="text-muted-foreground">Automated reply templates with smart tags</p>
        </div>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto">
        {CATEGORY_CONFIGS.map((category) => {
          const allTemplates = templatesByCategory(category.key);
          if (allTemplates.length === 0) return null;

          const CategoryIcon = category.icon;
          const allowedSlugs = STARTER_ALLOWED_SLUGS[category.key];
          const hasStarterRestriction = isStarter && allowedSlugs !== undefined;

          const allowed = hasStarterRestriction
            ? allTemplates.filter(t => allowedSlugs.includes(t.slug))
            : allTemplates;
          const locked = hasStarterRestriction
            ? allTemplates.filter(t => !allowedSlugs.includes(t.slug))
            : [];

          if (allowed.length === 0 && !hasStarterRestriction) return null;

          return (
            <div key={category.key} data-testid={`category-${category.key}`}>
              <div className="flex items-center gap-2 mb-2">
                <CategoryIcon className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{category.label}</h2>
                {hasStarterRestriction && (
                  <Badge variant="outline" className="text-[10px]">
                    {allowed.length} of {allTemplates.length} on Starter
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mb-3">{category.description}</p>
              <div className="space-y-2">
                {allowed.map((tmpl) => {
                  const hasSms = !!tmpl.content;
                  const hasEmail = !!(tmpl.emailSubject || tmpl.emailContent);
                  return (
                    <Card
                      key={tmpl.slug}
                      className="cursor-pointer hover-elevate transition-all"
                      onClick={() => navigate(`/settings/message-templates/${tmpl.slug}/edit`)}
                      data-testid={`card-msg-template-${tmpl.slug}`}
                    >
                      <CardHeader className="py-3 px-4">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <CardTitle className="text-sm">{tmpl.title}</CardTitle>
                              <div className="flex items-center gap-1">
                                {hasSms && (
                                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0" data-testid={`badge-sms-${tmpl.slug}`}>
                                    <MessageSquare className="w-3 h-3 mr-0.5" />
                                    SMS
                                  </Badge>
                                )}
                                {hasEmail && (
                                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0" data-testid={`badge-email-${tmpl.slug}`}>
                                    <Mail className="w-3 h-3 mr-0.5" />
                                    Email
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1 truncate">
                              {getPreview(tmpl.content) || <span className="italic">Click to add content</span>}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Switch
                              checked={tmpl.isEnabled !== false}
                              onCheckedChange={(checked) => {
                                toggleEnabled.mutate({ slug: tmpl.slug, isEnabled: checked });
                              }}
                              onClick={(e) => e.stopPropagation()}
                              data-testid={`switch-enabled-${tmpl.slug}`}
                            />
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                          </div>
                        </div>
                      </CardHeader>
                    </Card>
                  );
                })}

                {locked.length > 0 && (
                  <>
                    <div className="flex items-center gap-3 my-4" data-testid={`divider-starter-${category.key}`}>
                      <div className="flex-1 border-t border-dashed border-muted-foreground/40" />
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1.5 shrink-0">
                        <Lock className="w-3 h-3" />
                        Available on Core & Elite
                      </span>
                      <div className="flex-1 border-t border-dashed border-muted-foreground/40" />
                    </div>
                    {locked.map((tmpl) => {
                      const hasSms = !!tmpl.content;
                      const hasEmail = !!(tmpl.emailSubject || tmpl.emailContent);
                      return (
                        <Card
                          key={tmpl.slug}
                          className="opacity-40 cursor-not-allowed"
                          data-testid={`card-msg-template-${tmpl.slug}`}
                        >
                          <CardHeader className="py-3 px-4">
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <CardTitle className="text-sm">{tmpl.title}</CardTitle>
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                    <Lock className="w-3 h-3 mr-0.5" />
                                    {isNativeApp ? "Locked" : "Upgrade"}
                                  </Badge>
                                  <div className="flex items-center gap-1">
                                    {hasSms && (
                                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                        <MessageSquare className="w-3 h-3 mr-0.5" />
                                        SMS
                                      </Badge>
                                    )}
                                    {hasEmail && (
                                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                        <Mail className="w-3 h-3 mr-0.5" />
                                        Email
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1 truncate">
                                  {getPreview(tmpl.content) || <span className="italic">Click to add content</span>}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <Switch
                                  checked={tmpl.isEnabled !== false}
                                  disabled
                                  data-testid={`switch-enabled-${tmpl.slug}`}
                                />
                                <ChevronRight className="w-4 h-4 text-muted-foreground" />
                              </div>
                            </div>
                          </CardHeader>
                        </Card>
                      );
                    })}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
