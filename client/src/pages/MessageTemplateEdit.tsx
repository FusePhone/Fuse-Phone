import { useMessageTemplates, useUpdateMessageTemplate } from "@/hooks/use-templates";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useRef } from "react";
import { Loader2, ArrowLeft, Save, Tag, MessageSquare, Mail, Clock } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRoute, useLocation } from "wouter";
import { useSafeBack } from "@/hooks/use-safe-back";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface TagConfig {
  tag: string;
  label: string;
  description: string;
}

const AVAILABLE_TAGS: TagConfig[] = [
  { tag: "{{client_name}}", label: "Client Name", description: "Contact's full name" },
  { tag: "{{client_first_name}}", label: "First Name", description: "Contact's first name" },
  { tag: "{{client_phone}}", label: "Client Phone", description: "Contact's phone number" },
  { tag: "{{client_email}}", label: "Client Email", description: "Contact's email" },
  { tag: "{{company_name}}", label: "Company Name", description: "Your business name" },
  { tag: "{{company_phone}}", label: "Company Phone", description: "Your business phone" },
  { tag: "{{company_email}}", label: "Company Email", description: "Your business email" },
  { tag: "{{document_link}}", label: "Document Link", description: "Link to the current document" },
  { tag: "{{proposal_link}}", label: "Proposal Link", description: "Link to the proposal" },
  { tag: "{{estimate_link}}", label: "Proposal Link", description: "Link to the proposal" },
  { tag: "{{invoice_link}}", label: "Invoice Link", description: "Link to the invoice" },
  { tag: "{{change_order_link}}", label: "Change Order Link", description: "Link to the change order" },
  { tag: "{{amount}}", label: "Amount", description: "Document or payment amount" },
  { tag: "{{payment_label}}", label: "Payment Label", description: "e.g. Down Payment, Final Payment" },
  { tag: "{{remaining_balance}}", label: "Remaining Balance", description: "Amount still owed after payment" },
  { tag: "{{total_amount}}", label: "Total Amount", description: "Total invoice/document amount" },
  { tag: "{{document_type}}", label: "Document Type", description: "Proposal, Invoice, etc." },
  { tag: "{{review_link}}", label: "Review Link", description: "Link for customers to leave a review" },
  { tag: "{{scheduled_date}}", label: "Scheduled Date", description: "Job start date" },
  { tag: "{{scheduled_time}}", label: "Scheduled Time", description: "Job start time" },
  { tag: "{{job_address}}", label: "Job Address", description: "Address of the job site" },
  { tag: "{{crew_lead}}", label: "Crew Lead", description: "Name of the lead assigned to the job" },
  { tag: "{{sales_rep}}", label: "Sales Rep", description: "Name of the sales person" },
  { tag: "{{crew_member}}", label: "Team Member", description: "Name of a team member" },
];

function applyPreviewTags(text: string): string {
  return text
    .replace(/\{\{client_name\}\}/g, 'John Smith')
    .replace(/\{\{client_first_name\}\}/g, 'John')
    .replace(/\{\{client_phone\}\}/g, '(555) 123-4567')
    .replace(/\{\{client_email\}\}/g, 'john@example.com')
    .replace(/\{\{company_name\}\}/g, 'Your Company')
    .replace(/\{\{company_phone\}\}/g, '(555) 987-6543')
    .replace(/\{\{company_email\}\}/g, 'info@yourcompany.com')
    .replace(/\{\{document_link\}\}/g, 'https://example.com/doc/123')
    .replace(/\{\{proposal_link\}\}/g, 'https://example.com/proposal/123')
    .replace(/\{\{estimate_link\}\}/g, 'https://example.com/proposal/456')
    .replace(/\{\{invoice_link\}\}/g, 'https://example.com/invoice/789')
    .replace(/\{\{change_order_link\}\}/g, 'https://example.com/change-order/101')
    .replace(/\{\{amount\}\}/g, '$1,500.00')
    .replace(/\{\{payment_label\}\}/g, 'Down Payment')
    .replace(/\{\{remaining_balance\}\}/g, '$3,500.00')
    .replace(/\{\{total_amount\}\}/g, '$5,000.00')
    .replace(/\{\{document_type\}\}/g, 'Proposal')
    .replace(/\{\{review_link\}\}/g, 'https://g.page/yourcompany/review')
    .replace(/\{\{scheduled_date\}\}/g, 'Monday, April 14, 2026')
    .replace(/\{\{scheduled_time\}\}/g, '9:00 AM')
    .replace(/\{\{job_address\}\}/g, 'Address: 123 Main St, New York, NY')
    .replace(/\{\{crew_lead\}\}/g, 'Mike Johnson')
    .replace(/\{\{sales_rep\}\}/g, 'Sarah Williams')
    .replace(/\{\{crew_member\}\}/g, 'Carlos Garcia');
}

export default function MessageTemplateEdit() {
  const [, params] = useRoute("/settings/message-templates/:slug/edit");
  const [, navigate] = useLocation();
  const handleBack = useSafeBack("/settings/message-templates");
  const { toast } = useToast();

  const { data: msgTemplates, isLoading } = useMessageTemplates();
  const { mutate: updateTemplate, isPending } = useUpdateMessageTemplate();

  const [content, setContent] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailContent, setEmailContent] = useState('');
  const [delayValue, setDelayValue] = useState<string>('0');
  const [delayUnit, setDelayUnit] = useState<'minutes' | 'hours' | 'days'>('hours');
  const [hasLoaded, setHasLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState('sms');
  const smsTextareaRef = useRef<HTMLTextAreaElement>(null);
  const emailSubjectRef = useRef<HTMLInputElement>(null);
  const emailContentRef = useRef<HTMLTextAreaElement>(null);
  const lastFocusedRef = useRef<'sms' | 'emailSubject' | 'emailContent'>('sms');

  const slug = params?.slug || '';
  const template = msgTemplates?.find(t => t.slug === slug);

  // Defaults for follow-up slugs (matches LEAD_FOLLOWUP_SCHEDULE on the server).
  const FOLLOWUP_DEFAULTS_MIN: Record<string, number> = {
    lead_welcome: 0,
    lead_followup_2_hours: 120,
    lead_followup_1_day: 1440,
    lead_followup_2_days: 2880,
    lead_followup_5_days: 7200,
    lead_followup_9_days: 12960,
    lead_followup_15_days: 21600,
    lead_followup_30_days: 43200,
    followup_not_viewed_1_day: 1440,
    followup_not_viewed_3_days: 4320,
    followup_not_viewed_7_days: 10080,
    followup_viewed_1_day: 1440,
    followup_viewed_2_days: 2880,
    followup_viewed_5_days: 7200,
  };
  const supportsTiming = template
    ? template.category === 'lead_followup'
      || template.category === 'followup_not_viewed'
      || template.category === 'followup_viewed'
    : false;

  useEffect(() => {
    if (template && !hasLoaded) {
      setContent(template.content || '');
      setEmailSubject(template.emailSubject || '');
      setEmailContent(template.emailContent || '');
      const minutes = template.delayMinutes != null
        ? template.delayMinutes
        : (FOLLOWUP_DEFAULTS_MIN[template.slug] ?? 0);
      if (minutes === 0) {
        setDelayValue('0');
        setDelayUnit('minutes');
      } else if (minutes % 1440 === 0) {
        setDelayValue(String(minutes / 1440));
        setDelayUnit('days');
      } else if (minutes % 60 === 0) {
        setDelayValue(String(minutes / 60));
        setDelayUnit('hours');
      } else {
        setDelayValue(String(minutes));
        setDelayUnit('minutes');
      }
      setHasLoaded(true);
    }
  }, [template, hasLoaded]);

  const computeDelayMinutes = (): number => {
    const n = parseInt(delayValue, 10);
    if (isNaN(n) || n < 0) return 0;
    if (delayUnit === 'minutes') return n;
    if (delayUnit === 'hours') return n * 60;
    return n * 1440;
  };

  const handleInsertTag = (tag: string) => {
    if (activeTab === 'sms') {
      const textarea = smsTextareaRef.current;
      if (!textarea) return;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newContent = content.substring(0, start) + tag + content.substring(end);
      setContent(newContent);
      requestAnimationFrame(() => {
        textarea.focus();
        const cursorPos = start + tag.length;
        textarea.setSelectionRange(cursorPos, cursorPos);
      });
    } else {
      if (lastFocusedRef.current === 'emailSubject') {
        const input = emailSubjectRef.current;
        if (!input) return;
        const start = input.selectionStart || 0;
        const end = input.selectionEnd || 0;
        const newSubject = emailSubject.substring(0, start) + tag + emailSubject.substring(end);
        setEmailSubject(newSubject);
        requestAnimationFrame(() => {
          input.focus();
          const cursorPos = start + tag.length;
          input.setSelectionRange(cursorPos, cursorPos);
        });
      } else {
        const textarea = emailContentRef.current;
        if (!textarea) return;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newContent = emailContent.substring(0, start) + tag + emailContent.substring(end);
        setEmailContent(newContent);
        requestAnimationFrame(() => {
          textarea.focus();
          const cursorPos = start + tag.length;
          textarea.setSelectionRange(cursorPos, cursorPos);
        });
      }
    }
  };

  const handleSave = () => {
    if (!slug) return;

    updateTemplate(
      {
        slug,
        content,
        emailSubject,
        emailContent,
        delayMinutes: supportsTiming ? computeDelayMinutes() : undefined,
      },
      {
        onSuccess: () => {
          toast({
            title: "Template saved",
            description: `${template?.title || 'Template'} has been updated.`
          });
          navigate('/settings/message-templates');
        },
        onError: () => {
          toast({
            title: "Error",
            description: "Failed to save template. Please try again.",
            variant: "destructive"
          });
        }
      }
    );
  };

  if (!slug) {
    return (
      <div className="p-4">
        <p>Template not found</p>
        <Button variant="ghost" onClick={handleBack} data-testid="button-back-msg-templates">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Message Templates
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!template) {
    return (
      <div className="p-4">
        <p>Template not found</p>
        <Button variant="ghost" onClick={handleBack} data-testid="button-back-msg-templates">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Message Templates
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col" data-testid="message-template-editor">
      <div className="sticky top-0 z-50 bg-background border-b">
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleBack}
              data-testid="button-back-msg-templates"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-lg font-bold truncate">{template.title}</h1>
          </div>
          <Button
            onClick={handleSave}
            disabled={isPending}
            data-testid="button-save-msg-template"
          >
            {isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save
          </Button>
        </div>
      </div>

      <div className="flex-1 p-4 space-y-4 overflow-y-auto">
        {supportsTiming && (
          <div className="rounded-md border border-border bg-muted/30 p-4" data-testid="card-send-timing">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Send Timing</span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              {template.category === 'lead_followup'
                ? 'How long after a new lead is captured should this message send?'
                : 'How long after the document is sent (or viewed) should this follow-up go out?'}
              {' '}Set to 0 minutes to send immediately.
            </p>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                value={delayValue}
                onChange={(e) => setDelayValue(e.target.value)}
                className="w-24"
                data-testid="input-delay-value"
              />
              <Select value={delayUnit} onValueChange={(v) => setDelayUnit(v as 'minutes' | 'hours' | 'days')}>
                <SelectTrigger className="w-32" data-testid="select-delay-unit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="minutes">Minutes</SelectItem>
                  <SelectItem value="hours">Hours</SelectItem>
                  <SelectItem value="days">Days</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground ml-2">after trigger</span>
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center gap-2 mb-2">
            <Tag className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">Insert Tags</span>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Tap a tag to insert it at cursor position. Tags will be replaced with real data when sending.
          </p>
          <div className="flex flex-wrap gap-2" data-testid="tag-buttons-container">
            {AVAILABLE_TAGS.map((tagConfig) => (
              <Badge
                key={tagConfig.tag}
                variant="outline"
                className="cursor-pointer text-xs py-1 px-2"
                onClick={() => handleInsertTag(tagConfig.tag)}
                title={tagConfig.description}
                data-testid={`tag-${tagConfig.tag.replace(/[{}]/g, '')}`}
              >
                {tagConfig.label}
              </Badge>
            ))}
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList data-testid="tabs-sms-email">
            <TabsTrigger value="sms" data-testid="tab-sms">
              <MessageSquare className="w-4 h-4 mr-1.5" />
              SMS
            </TabsTrigger>
            <TabsTrigger value="email" data-testid="tab-email">
              <Mail className="w-4 h-4 mr-1.5" />
              Email
            </TabsTrigger>
          </TabsList>

          <TabsContent value="sms" className="space-y-4 mt-4">
            <Textarea
              ref={smsTextareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Type your SMS message template..."
              className="min-h-[250px] resize-none text-base leading-relaxed"
              data-testid="textarea-msg-template-content"
            />

            {content && (
              <div data-testid="sms-preview">
                <p className="text-sm font-medium mb-2">SMS Preview</p>
                <div className="bg-muted rounded-md p-3 text-sm whitespace-pre-wrap">
                  {applyPreviewTags(content)}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="email" className="space-y-4 mt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="email-subject">Subject Line</label>
              <Input
                id="email-subject"
                ref={emailSubjectRef}
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                onFocus={() => { lastFocusedRef.current = 'emailSubject'; }}
                placeholder="Email subject line..."
                data-testid="input-email-subject"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="email-content">Email Body</label>
              <Textarea
                id="email-content"
                ref={emailContentRef}
                value={emailContent}
                onChange={(e) => setEmailContent(e.target.value)}
                onFocus={() => { lastFocusedRef.current = 'emailContent'; }}
                placeholder="Type your email message template..."
                className="min-h-[250px] resize-none text-base leading-relaxed"
                data-testid="textarea-email-content"
              />
            </div>

            {(emailSubject || emailContent) && (
              <div data-testid="email-preview">
                <p className="text-sm font-medium mb-2">Email Preview</p>
                <div className="bg-muted rounded-md p-3 text-sm space-y-2">
                  {emailSubject && (
                    <div>
                      <span className="text-muted-foreground text-xs uppercase tracking-wide">Subject:</span>
                      <p className="font-medium">{applyPreviewTags(emailSubject)}</p>
                    </div>
                  )}
                  {emailContent && (
                    <div className="whitespace-pre-wrap border-t pt-2 mt-2">
                      {applyPreviewTags(emailContent)}
                    </div>
                  )}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
