import { useTemplates, useProposalTemplates, useMessageTemplates } from "@/hooks/use-templates";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, FileText, ChevronRight, ChevronLeft, ClipboardList, MessageSquareText, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { useSafeBack } from "@/hooks/use-safe-back";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";

interface TemplateConfig {
  slug: 'terms_and_conditions' | 'standard_expectations' | 'payment_instructions';
  title: string;
}

const templateConfigs: TemplateConfig[] = [
  {
    slug: 'terms_and_conditions',
    title: 'Terms and Conditions',
  },
  {
    slug: 'standard_expectations',
    title: 'Standard Expectations',
  },
  {
    slug: 'payment_instructions',
    title: 'Payment Instructions',
  },
];

function stripHtml(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
}

function getPreview(content: string, maxLength: number = 100): string {
  const text = stripHtml(content).trim();
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + '...';
}

export default function Templates() {
  const [, navigate] = useLocation();
  const { data: templates, isLoading } = useTemplates();
  const { data: proposalTemplates, isLoading: isLoadingProposalTemplates } = useProposalTemplates();
  const { data: msgTemplates, isLoading: isLoadingMsgTemplates } = useMessageTemplates();
  const { data: serviceTemplates } = useQuery<any[]>({ queryKey: ['/api/service-templates'] });

  const handleBack = useSafeBack("/settings/company");
  const { toast } = useToast();
  const qc = useQueryClient();

  const getTemplateContent = (slug: string): string => {
    const template = templates?.find(t => t.slug === slug);
    return template?.content || '';
  };

  const isTemplateEnabled = (slug: string): boolean => {
    const template = templates?.find(t => t.slug === slug);
    return template?.enabled !== false;
  };

  const toggleTemplate = useMutation({
    mutationFn: async ({ slug, enabled }: { slug: string; enabled: boolean }) => {
      await apiRequest('PATCH', `/api/templates/${slug}/toggle`, { enabled });
    },
    onMutate: async ({ slug, enabled }) => {
      await qc.cancelQueries({ queryKey: ['/api/templates'] });
      const previous = qc.getQueryData(['/api/templates']);
      qc.setQueryData(['/api/templates'], (old: any[] | undefined) =>
        old?.map(t => t.slug === slug ? { ...t, enabled } : t)
      );
      toast({ title: enabled ? 'Template will show on documents' : 'Template hidden from documents' });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(['/api/templates'], context.previous);
      toast({ title: 'Failed to update', variant: 'destructive' });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['/api/templates'] });
    },
  });

  if (isLoading || isLoadingProposalTemplates || isLoadingMsgTemplates) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary" data-testid="loader-templates" />
      </div>
    );
  }

  const proposalTemplateCount = proposalTemplates?.length || 0;
  const msgTemplateCount = msgTemplates?.length || 0;

  return (
    <div className="container mx-auto px-4 py-6 pb-20 max-w-3xl animate-in fade-in duration-300">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={handleBack} data-testid="button-back">
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <FileText className="w-6 h-6 text-primary" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold font-display">Templates</h1>
          <p className="text-muted-foreground text-sm">Manage reusable content for your documents</p>
        </div>
      </div>

      <div className="flex-1 space-y-3">
        {/* Proposal Templates - links to list page */}
        <Card 
          className="cursor-pointer hover-elevate transition-all"
          onClick={() => navigate('/settings/proposal-templates')}
          data-testid="card-proposal-templates"
        >
          <CardHeader className="py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <ClipboardList className="w-5 h-5 text-primary shrink-0" />
                <div>
                  <CardTitle className="text-base">Proposal Templates</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    {proposalTemplateCount === 0 
                      ? 'Create reusable proposal templates with line items' 
                      : `${proposalTemplateCount} template${proposalTemplateCount !== 1 ? 's' : ''}`
                    }
                  </p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
            </div>
          </CardHeader>
        </Card>

        {/* Service Templates - links to list page */}
        <Card 
          className="cursor-pointer hover-elevate transition-all"
          onClick={() => navigate('/settings/service-templates')}
          data-testid="card-service-templates"
        >
          <CardHeader className="py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <Wrench className="w-5 h-5 text-primary shrink-0" />
                <div>
                  <CardTitle className="text-base">Service Templates</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1" data-testid="text-service-templates-count">
                    {(serviceTemplates?.length || 0) === 0
                      ? 'Reusable production blocks and line items you can drop into any proposal'
                      : `${serviceTemplates!.length} template${serviceTemplates!.length !== 1 ? 's' : ''}`
                    }
                  </p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
            </div>
          </CardHeader>
        </Card>

        {/* Message Templates - links to list page */}
        <Card 
          className="cursor-pointer hover-elevate transition-all"
          onClick={() => navigate('/settings/message-templates')}
          data-testid="card-message-templates"
        >
          <CardHeader className="py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <MessageSquareText className="w-5 h-5 text-primary shrink-0" />
                <div>
                  <CardTitle className="text-base">Message Templates</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    {msgTemplateCount === 0 
                      ? 'Automated reply templates for sending documents, payments, and follow-ups' 
                      : `${msgTemplateCount} template${msgTemplateCount !== 1 ? 's' : ''}`
                    }
                  </p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
            </div>
          </CardHeader>
        </Card>

        {templateConfigs.map((config) => {
          const preview = getPreview(getTemplateContent(config.slug));
          const enabled = isTemplateEnabled(config.slug);
          const hasContent = !!getTemplateContent(config.slug);
          return (
            <Card 
              key={config.slug} 
              className={`hover-elevate transition-all ${!enabled ? 'opacity-60' : ''}`}
              data-testid={`card-${config.slug}`}
            >
              <CardHeader className="py-4">
                <div className="flex items-center justify-between gap-3">
                  <div 
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => navigate(`/settings/templates/${config.slug}/edit`)}
                  >
                    <CardTitle className="text-base">{config.title}</CardTitle>
                    {preview && (
                      <p className="text-sm text-muted-foreground mt-1 truncate">{preview}</p>
                    )}
                    {!preview && (
                      <p className="text-sm text-muted-foreground mt-1 italic">Click to add content</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {hasContent && (
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <span className="text-xs text-muted-foreground">{enabled ? 'Showing' : 'Hidden'}</span>
                        <Switch
                          checked={enabled}
                          onCheckedChange={(checked) => toggleTemplate.mutate({ slug: config.slug, enabled: checked })}
                          data-testid={`toggle-${config.slug}`}
                        />
                      </div>
                    )}
                    <ChevronRight 
                      className="w-5 h-5 text-muted-foreground shrink-0 cursor-pointer" 
                      onClick={() => navigate(`/settings/templates/${config.slug}/edit`)}
                    />
                  </div>
                </div>
              </CardHeader>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
