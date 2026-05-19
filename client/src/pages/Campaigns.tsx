import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useCallback } from "react";
import { formatPhoneDisplay } from "@/lib/utils";
import { useKeyboardOffset, getKeyboardAwareStyles } from "@/hooks/use-keyboard-offset";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Loader2, Plus, Megaphone, Mail, MessageSquare, Play, Pause, Trash2, Users, Send, Eye, AlertTriangle, Sparkles, TestTube, Tag, X, Search, UserPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import type { Campaign } from "@shared/schema";
import { useSubscription } from "@/hooks/use-subscription";

const SEGMENT_LABELS: Record<string, string> = {
  all_contacts: 'All Contacts',
  active_leads: 'Active Leads',
  sent_estimates: 'Sent Estimates',
  active_projects: 'Active Projects',
  completed_jobs: 'Completed Jobs',
  specific_contacts: 'Specific Contacts',
};

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  active: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  paused: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300',
  completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
};

type CampaignWithMessages = Campaign & { messages?: any[] };

export default function Campaigns() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasAiAssistant } = useSubscription();
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState<number | null>(null);
  const [showPreview, setShowPreview] = useState<number | null>(null);
  const [showAiDraft, setShowAiDraft] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [contactSearch, setContactSearch] = useState('');
  const { keyboardOffset } = useKeyboardOffset(showAiDraft);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    name: '',
    channel: 'email',
    segment: 'all_contacts',
    specificContactIds: [] as number[],
    subject: '',
    body: '',
    ctaText: '',
    ctaUrl: '',
    dailySmsLimit: 20,
    dailyEmailLimit: 50,
  });

  const { data: campaignsList, isLoading } = useQuery<Campaign[]>({
    queryKey: ['/api/campaigns'],
  });

  const { data: segmentCounts } = useQuery<Record<string, number>>({
    queryKey: ['/api/campaigns/segments/counts'],
  });

  const { data: availableTags } = useQuery<Array<{ tag: string; description: string; example: string }>>({
    queryKey: ['/api/campaigns/tags'],
  });

  const { data: allContacts } = useQuery<Array<{ id: number; name: string; email: string; phone: string; type: string }>>({
    queryKey: ['/api/contacts'],
  });

  const { data: detailCampaign, isLoading: isLoadingDetail } = useQuery<CampaignWithMessages>({
    queryKey: ['/api/campaigns', showDetail],
    enabled: !!showDetail,
  });

  const { data: previewData, isLoading: isLoadingPreview } = useQuery<{ channel: string; subject?: string; html?: string; body: string }>({
    queryKey: ['/api/campaigns', showPreview, 'preview'],
    queryFn: async () => {
      const res = await apiRequest('POST', `/api/campaigns/${showPreview}/preview`);
      return res.json();
    },
    enabled: !!showPreview,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const payload: any = { ...data };
      if (data.segment !== 'specific_contacts') {
        delete payload.specificContactIds;
      }
      return apiRequest('POST', '/api/campaigns', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns'] });
      toast({ title: "Campaign created" });
      setShowCreate(false);
      resetForm();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const startMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('POST', `/api/campaigns/${id}/start`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns'] });
      toast({ title: "Campaign started", description: "Messages are being sent" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const pauseMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('POST', `/api/campaigns/${id}/pause`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns'] });
      toast({ title: "Campaign paused" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `/api/campaigns/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns'] });
      toast({ title: "Campaign deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const testSendMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('POST', `/api/campaigns/${id}/test-send`);
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Test sent", description: data.message });
    },
    onError: (err: Error) => {
      toast({ title: "Test send failed", description: err.message, variant: "destructive" });
    },
  });

  const [aiResult, setAiResult] = useState<{ email_subject?: string; email_body?: string; sms_body?: string } | null>(null);

  const aiDraftMutation = useMutation({
    mutationFn: async (data: { description: string; channel: string; segment: string }) => {
      const res = await apiRequest('POST', '/api/campaigns/ai-draft', data);
      return res.json();
    },
    onSuccess: (data: any) => {
      setAiResult(data);
      const isEmail = formData.channel === 'email';
      setFormData(prev => ({
        ...prev,
        body: isEmail ? (data.email_body || prev.body) : (data.sms_body || prev.body),
        subject: data.email_subject || prev.subject,
      }));
      setShowAiDraft(false);
      setAiPrompt('');
      toast({ title: "Both versions drafted by FuseAI", description: "Switch channels to see the other version" });
    },
    onError: (err: Error) => {
      toast({ title: "AI Error", description: err.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      channel: 'email',
      segment: 'all_contacts',
      specificContactIds: [],
      subject: '',
      body: '',
      ctaText: '',
      ctaUrl: '',
      dailySmsLimit: 20,
      dailyEmailLimit: 50,
    });
  };

  const handleCreate = () => {
    if (!formData.name || !formData.body) {
      toast({ title: "Missing fields", description: "Campaign name and message are required", variant: "destructive" });
      return;
    }
    if (formData.channel === 'email' && !formData.subject) {
      toast({ title: "Missing subject", description: "Email campaigns require a subject line", variant: "destructive" });
      return;
    }
    if (formData.segment === 'specific_contacts' && formData.specificContactIds.length === 0) {
      toast({ title: "No contacts selected", description: "Please select at least one contact", variant: "destructive" });
      return;
    }
    createMutation.mutate(formData);
  };

  const insertTag = useCallback((tag: string) => {
    const textarea = bodyRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = formData.body;
      const newText = text.substring(0, start) + tag + text.substring(end);
      setFormData(prev => ({ ...prev, body: newText }));
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + tag.length, start + tag.length);
      }, 0);
    } else {
      setFormData(prev => ({ ...prev, body: prev.body + tag }));
    }
  }, [formData.body]);

  const toggleContact = (contactId: number) => {
    setFormData(prev => ({
      ...prev,
      specificContactIds: prev.specificContactIds.includes(contactId)
        ? prev.specificContactIds.filter(id => id !== contactId)
        : [...prev.specificContactIds, contactId],
    }));
  };

  const getProgress = (c: Campaign) => {
    const total = c.totalRecipients || 0;
    if (total === 0) return 0;
    return Math.round(((c.sentCount || 0) + (c.failedCount || 0)) / total * 100);
  };

  const filteredContacts = allContacts?.filter(c =>
    contactSearch ? c.name.toLowerCase().includes(contactSearch.toLowerCase()) ||
    c.email?.toLowerCase().includes(contactSearch.toLowerCase()) ||
    c.phone?.includes(contactSearch) : true
  ) || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64" data-testid="campaigns-loading">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6" data-testid="campaigns-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-campaigns-title">Campaigns</h1>
          <p className="text-sm text-muted-foreground mt-1">Send bulk SMS and email campaigns to your contacts</p>
        </div>
        <Button onClick={() => setShowCreate(true)} data-testid="button-create-campaign">
          <Plus className="w-4 h-4 mr-2" />
          New Campaign
        </Button>
      </div>

      {segmentCounts && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {Object.entries(SEGMENT_LABELS).filter(([key]) => key !== 'specific_contacts').map(([key, label]) => (
            <Card key={key} className="p-3" data-testid={`card-segment-${key}`}>
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className="text-xl font-bold mt-1">{segmentCounts[key] ?? 0}</div>
            </Card>
          ))}
        </div>
      )}

      {(!campaignsList || campaignsList.length === 0) ? (
        <Card className="p-8 text-center" data-testid="campaigns-empty">
          <Megaphone className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-semibold text-lg">No campaigns yet</h3>
          <p className="text-sm text-muted-foreground mt-1 mb-4">Create your first campaign to reach out to your contacts</p>
          <Button onClick={() => setShowCreate(true)} data-testid="button-create-first-campaign">
            <Plus className="w-4 h-4 mr-2" />
            Create Campaign
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {campaignsList.map((campaign) => (
            <Card key={campaign.id} className="hover:shadow-sm transition-shadow" data-testid={`card-campaign-${campaign.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold truncate" data-testid={`text-campaign-name-${campaign.id}`}>{campaign.name}</h3>
                      <Badge variant="outline" className={STATUS_STYLES[campaign.status] || ''} data-testid={`badge-campaign-status-${campaign.id}`}>
                        {campaign.status}
                      </Badge>
                      <Badge variant="outline" className="gap-1">
                        {campaign.channel === 'sms' ? <MessageSquare className="w-3 h-3" /> : <Mail className="w-3 h-3" />}
                        {campaign.channel === 'sms' ? 'SMS' : 'Email'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {SEGMENT_LABELS[campaign.segment] || campaign.segment}
                      </span>
                      {campaign.createdAt && (
                        <span>{format(new Date(campaign.createdAt), 'MMM d, yyyy')}</span>
                      )}
                    </div>
                    {(campaign.status === 'active' || campaign.status === 'completed') && (campaign.totalRecipients || 0) > 0 && (
                      <div className="mt-2 space-y-1">
                        <Progress value={getProgress(campaign)} className="h-2" data-testid={`progress-campaign-${campaign.id}`} />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{campaign.sentCount || 0} sent</span>
                          {(campaign.failedCount || 0) > 0 && (
                            <span className="text-destructive flex items-center gap-0.5">
                              <AlertTriangle className="w-3 h-3" />
                              {campaign.failedCount} failed
                            </span>
                          )}
                          <span>{campaign.totalRecipients} total</span>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowPreview(campaign.id)}
                      title="Preview"
                      data-testid={`button-preview-campaign-${campaign.id}`}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowDetail(campaign.id)}
                      title="Details"
                      data-testid={`button-view-campaign-${campaign.id}`}
                    >
                      <Users className="w-4 h-4" />
                    </Button>
                    {campaign.status === 'draft' && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => testSendMutation.mutate(campaign.id)}
                          disabled={testSendMutation.isPending}
                          title="Send test to yourself"
                          data-testid={`button-test-campaign-${campaign.id}`}
                        >
                          {testSendMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <TestTube className="w-4 h-4 text-purple-600" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => startMutation.mutate(campaign.id)}
                          disabled={startMutation.isPending}
                          title="Start campaign"
                          data-testid={`button-start-campaign-${campaign.id}`}
                        >
                          {startMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 text-green-600" />}
                        </Button>
                      </>
                    )}
                    {campaign.status === 'active' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => pauseMutation.mutate(campaign.id)}
                        disabled={pauseMutation.isPending}
                        data-testid={`button-pause-campaign-${campaign.id}`}
                      >
                        <Pause className="w-4 h-4 text-amber-600" />
                      </Button>
                    )}
                    {campaign.status === 'paused' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => startMutation.mutate(campaign.id)}
                        disabled={startMutation.isPending}
                        data-testid={`button-resume-campaign-${campaign.id}`}
                      >
                        <Play className="w-4 h-4 text-green-600" />
                      </Button>
                    )}
                    {(campaign.status === 'draft' || campaign.status === 'completed') && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (confirm('Delete this campaign?')) {
                            deleteMutation.mutate(campaign.id);
                          }
                        }}
                        data-testid={`button-delete-campaign-${campaign.id}`}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Campaign Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-create-campaign">
          <DialogHeader>
            <DialogTitle>Create Campaign</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Campaign Name</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Spring Promotion"
                data-testid="input-campaign-name"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Channel</Label>
                <Select
                  value={formData.channel}
                  onValueChange={(v) => {
                    setFormData(prev => {
                      const updated = { ...prev, channel: v };
                      if (aiResult) {
                        if (v === 'email') {
                          updated.body = aiResult.email_body || prev.body;
                          updated.subject = aiResult.email_subject || prev.subject;
                        } else {
                          updated.body = aiResult.sms_body || prev.body;
                        }
                      }
                      return updated;
                    });
                  }}
                >
                  <SelectTrigger data-testid="select-campaign-channel">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="sms">SMS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Target Audience</Label>
                <Select
                  value={formData.segment}
                  onValueChange={(v) => {
                    setFormData(prev => ({ ...prev, segment: v }));
                    if (v === 'specific_contacts') setShowContactPicker(true);
                  }}
                >
                  <SelectTrigger data-testid="select-campaign-segment">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(SEGMENT_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label} {key !== 'specific_contacts' && segmentCounts ? `(${segmentCounts[key] ?? 0})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {formData.segment === 'specific_contacts' && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Selected Contacts ({formData.specificContactIds.length})</Label>
                  <Button variant="outline" size="sm" onClick={() => setShowContactPicker(true)} data-testid="button-pick-contacts">
                    <UserPlus className="w-3 h-3 mr-1" />
                    Pick Contacts
                  </Button>
                </div>
                {formData.specificContactIds.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {allContacts?.filter(c => formData.specificContactIds.includes(c.id)).map((contact) => (
                      <Badge key={contact.id} variant="secondary" className="gap-1 pr-1">
                        {contact.name}
                        <button
                          onClick={() => toggleContact(contact.id)}
                          className="ml-0.5 rounded-full hover:bg-muted p-0.5"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No contacts selected yet. Click "Pick Contacts" above.</p>
                )}
              </div>
            )}

            {formData.channel === 'email' && (
              <div>
                <Label>Subject Line</Label>
                <Input
                  ref={subjectRef}
                  value={formData.subject}
                  onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
                  placeholder="Your email subject (supports merge tags)"
                  data-testid="input-campaign-subject"
                />
              </div>
            )}
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label>Message</Label>
                {hasAiAssistant && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1 text-xs h-7"
                    onClick={() => setShowAiDraft(true)}
                    data-testid="button-ai-draft"
                  >
                    <Sparkles className="w-3 h-3" />
                    FuseAI Draft
                  </Button>
                )}
              </div>
              <Textarea
                ref={bodyRef}
                value={formData.body}
                onChange={(e) => setFormData(prev => ({ ...prev, body: e.target.value }))}
                placeholder={formData.channel === 'sms' ? 'Your SMS message...' : 'Your email message...'}
                rows={6}
                data-testid="input-campaign-body"
              />
              <div className="flex items-center justify-between mt-1">
                {formData.channel === 'sms' ? (
                  <p className="text-xs text-muted-foreground">{formData.body.length}/160 characters</p>
                ) : <span />}
                {aiResult && (
                  <p className="text-xs text-primary" data-testid="text-ai-both-hint">
                    AI drafted both email + SMS — switch channel to see the other
                  </p>
                )}
              </div>
            </div>

            {/* Merge Tags Bar */}
            <div>
              <div className="flex items-center gap-1 mb-1.5">
                <Tag className="w-3 h-3 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">Insert merge tag:</span>
              </div>
              <div className="flex flex-wrap gap-1.5" data-testid="merge-tags-bar">
                {(availableTags || []).map((t) => (
                  <button
                    key={t.tag}
                    onClick={() => insertTag(t.tag)}
                    className="text-xs px-2 py-1 rounded-md border border-dashed border-muted-foreground/30 hover:border-primary hover:bg-primary/5 text-muted-foreground hover:text-primary transition-colors"
                    title={`${t.description} (e.g. ${t.example})`}
                    data-testid={`tag-${t.tag.replace(/[{}]/g, '')}`}
                  >
                    {t.tag}
                  </button>
                ))}
              </div>
            </div>

            {formData.channel === 'email' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Button Text (optional)</Label>
                  <Input
                    value={formData.ctaText}
                    onChange={(e) => setFormData(prev => ({ ...prev, ctaText: e.target.value }))}
                    placeholder="e.g., Learn More"
                    data-testid="input-campaign-cta-text"
                  />
                </div>
                <div>
                  <Label>Button Link (optional)</Label>
                  <Input
                    value={formData.ctaUrl}
                    onChange={(e) => setFormData(prev => ({ ...prev, ctaUrl: e.target.value }))}
                    placeholder="https://..."
                    data-testid="input-campaign-cta-url"
                  />
                </div>
              </div>
            )}
            <div>
              <Label>Daily Send Limit</Label>
              <Input
                type="number"
                value={formData.channel === 'sms' ? formData.dailySmsLimit : formData.dailyEmailLimit}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 1;
                  setFormData(prev => ({
                    ...prev,
                    ...(formData.channel === 'sms'
                      ? { dailySmsLimit: Math.min(val, 100) }
                      : { dailyEmailLimit: Math.min(val, 200) }),
                  }));
                }}
                min={1}
                max={formData.channel === 'sms' ? 100 : 200}
                data-testid="input-campaign-daily-limit"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Messages will be throttled to this daily limit to prevent delivery issues
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreate(false); resetForm(); }} data-testid="button-cancel-campaign">
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending} data-testid="button-save-campaign">
              {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Create Campaign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Draft Dialog */}
      <Dialog open={showAiDraft} onOpenChange={setShowAiDraft}>
        <DialogContent
          className="max-w-md p-4 gap-3 sm:p-6 [&>button]:top-2 [&>button]:right-2"
          style={getKeyboardAwareStyles(keyboardOffset)}
          data-testid="dialog-ai-draft"
        >
          <DialogHeader className="pb-0 space-y-1">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Sparkles className="w-4 h-4 text-primary" />
              FuseAI Campaign Writer
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              Describe what you want and FuseAI will draft both email and SMS versions.
            </p>
          </DialogHeader>
          <Textarea
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder="e.g., Spring special - 15% off interior painting. Create urgency."
            rows={3}
            className="text-base resize-none"
            data-testid="input-ai-prompt"
          />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => setShowAiDraft(false)}>Cancel</Button>
            <Button
              size="sm"
              onClick={() => aiDraftMutation.mutate({
                description: aiPrompt,
                channel: formData.channel,
                segment: formData.segment,
              })}
              disabled={aiDraftMutation.isPending || !aiPrompt.trim()}
              data-testid="button-generate-draft"
            >
              {aiDraftMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  Writing...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-1" />
                  Generate Both
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Contact Picker Dialog */}
      <Dialog open={showContactPicker} onOpenChange={setShowContactPicker}>
        <DialogContent className="max-w-md max-h-[80vh]" data-testid="dialog-contact-picker">
          <DialogHeader>
            <DialogTitle>Select Contacts</DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input
              value={contactSearch}
              onChange={(e) => setContactSearch(e.target.value)}
              placeholder="Search contacts..."
              className="pl-9"
              data-testid="input-contact-search"
            />
          </div>
          <div className="max-h-64 overflow-y-auto border rounded-md divide-y" data-testid="contact-picker-list">
            {filteredContacts.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">No contacts found</div>
            ) : (
              filteredContacts.map(contact => {
                const isSelected = formData.specificContactIds.includes(contact.id);
                return (
                  <button
                    key={contact.id}
                    onClick={() => toggleContact(contact.id)}
                    className={`w-full px-3 py-2 flex items-center justify-between text-left hover:bg-muted/50 transition-colors ${isSelected ? 'bg-primary/5' : ''}`}
                    data-testid={`contact-option-${contact.id}`}
                  >
                    <div>
                      <p className="text-sm font-medium">{contact.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formData.channel === 'sms' ? formatPhoneDisplay(contact.phone) : contact.email}
                      </p>
                    </div>
                    {isSelected && (
                      <Badge variant="default" className="text-xs">Selected</Badge>
                    )}
                  </button>
                );
              })
            )}
          </div>
          <DialogFooter>
            <p className="text-xs text-muted-foreground mr-auto">{formData.specificContactIds.length} selected</p>
            <Button onClick={() => setShowContactPicker(false)} data-testid="button-done-contacts">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={!!showPreview} onOpenChange={(open) => { if (!open) setShowPreview(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-campaign-preview">
          <DialogHeader>
            <DialogTitle>Campaign Preview</DialogTitle>
          </DialogHeader>
          {isLoadingPreview ? (
            <div className="flex justify-center p-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : previewData ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Tags are replaced with sample data. Actual sends will use each contact's real information.
              </p>
              {previewData.channel === 'email' ? (
                <>
                  {previewData.subject && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Subject</Label>
                      <p className="text-sm font-medium">{previewData.subject}</p>
                    </div>
                  )}
                  <div className="border rounded-lg overflow-hidden">
                    <iframe
                      srcDoc={previewData.html}
                      className="w-full h-[500px] border-0"
                      title="Email Preview"
                      data-testid="preview-email-iframe"
                    />
                  </div>
                </>
              ) : (
                <div className="max-w-xs mx-auto">
                  <div className="bg-muted rounded-2xl rounded-bl-sm p-3 text-sm" data-testid="preview-sms-bubble">
                    {previewData.body}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!showDetail} onOpenChange={(open) => { if (!open) setShowDetail(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="dialog-campaign-detail">
          <DialogHeader>
            <DialogTitle>{detailCampaign?.name || 'Campaign Details'}</DialogTitle>
          </DialogHeader>
          {isLoadingDetail ? (
            <div className="flex justify-center p-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : detailCampaign ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={STATUS_STYLES[detailCampaign.status] || ''}>
                  {detailCampaign.status}
                </Badge>
                <Badge variant="outline" className="gap-1">
                  {detailCampaign.channel === 'sms' ? <MessageSquare className="w-3 h-3" /> : <Mail className="w-3 h-3" />}
                  {detailCampaign.channel === 'sms' ? 'SMS' : 'Email'}
                </Badge>
                <Badge variant="outline">
                  <Users className="w-3 h-3 mr-1" />
                  {SEGMENT_LABELS[detailCampaign.segment] || detailCampaign.segment}
                </Badge>
              </div>

              {detailCampaign.subject && (
                <div>
                  <Label className="text-xs text-muted-foreground">Subject</Label>
                  <p className="text-sm" data-testid="text-detail-subject">{detailCampaign.subject}</p>
                </div>
              )}

              <div>
                <Label className="text-xs text-muted-foreground">Message</Label>
                <div className="text-sm bg-muted/50 rounded-md p-3 whitespace-pre-wrap" data-testid="text-detail-body">
                  {detailCampaign.body}
                </div>
              </div>

              {(detailCampaign.totalRecipients || 0) > 0 && (
                <div>
                  <Label className="text-xs text-muted-foreground">Progress</Label>
                  <Progress value={getProgress(detailCampaign)} className="h-3 mt-1" />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span className="text-green-600">{detailCampaign.sentCount || 0} sent</span>
                    {(detailCampaign.failedCount || 0) > 0 && (
                      <span className="text-destructive">{detailCampaign.failedCount} failed</span>
                    )}
                    <span>{(detailCampaign.totalRecipients || 0) - (detailCampaign.sentCount || 0) - (detailCampaign.failedCount || 0)} pending</span>
                  </div>
                </div>
              )}

              {detailCampaign.messages && detailCampaign.messages.length > 0 && (
                <div>
                  <Label className="text-xs text-muted-foreground">Recipients ({detailCampaign.messages.length})</Label>
                  <div className="max-h-48 overflow-y-auto border rounded-md mt-1 divide-y">
                    {detailCampaign.messages.map((msg: any) => (
                      <div key={msg.id} className="px-3 py-2 flex items-center justify-between text-xs">
                        <span className="truncate">{msg.to}</span>
                        <Badge variant="outline" className={
                          msg.status === 'sent' ? 'text-green-600' :
                          msg.status === 'failed' ? 'text-destructive' :
                          'text-muted-foreground'
                        }>
                          {msg.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="text-xs text-muted-foreground space-y-1">
                {detailCampaign.createdAt && <p>Created: {format(new Date(detailCampaign.createdAt), 'MMM d, yyyy h:mm a')}</p>}
                {detailCampaign.startedAt && <p>Started: {format(new Date(detailCampaign.startedAt), 'MMM d, yyyy h:mm a')}</p>}
                {detailCampaign.completedAt && <p>Completed: {format(new Date(detailCampaign.completedAt), 'MMM d, yyyy h:mm a')}</p>}
                <p>Daily limit: {detailCampaign.channel === 'sms' ? detailCampaign.dailySmsLimit : detailCampaign.dailyEmailLimit} per day</p>
              </div>

              <DialogFooter>
                {detailCampaign.status === 'draft' && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => { testSendMutation.mutate(detailCampaign.id); }}
                      disabled={testSendMutation.isPending}
                      data-testid="button-detail-test"
                    >
                      <TestTube className="w-4 h-4 mr-2" />
                      Send Test
                    </Button>
                    <Button
                      onClick={() => { startMutation.mutate(detailCampaign.id); setShowDetail(null); }}
                      disabled={startMutation.isPending}
                      data-testid="button-detail-start"
                    >
                      <Play className="w-4 h-4 mr-2" />
                      Start Campaign
                    </Button>
                  </>
                )}
                {detailCampaign.status === 'active' && (
                  <Button
                    variant="outline"
                    onClick={() => { pauseMutation.mutate(detailCampaign.id); setShowDetail(null); }}
                    disabled={pauseMutation.isPending}
                    data-testid="button-detail-pause"
                  >
                    <Pause className="w-4 h-4 mr-2" />
                    Pause
                  </Button>
                )}
                {detailCampaign.status === 'paused' && (
                  <Button
                    onClick={() => { startMutation.mutate(detailCampaign.id); setShowDetail(null); }}
                    disabled={startMutation.isPending}
                    data-testid="button-detail-resume"
                  >
                    <Play className="w-4 h-4 mr-2" />
                    Resume
                  </Button>
                )}
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
