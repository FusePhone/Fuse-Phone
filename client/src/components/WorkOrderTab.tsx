import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ClipboardList,
  Send,
  Settings,
  Eye,
  EyeOff,
  Check,
  Clock,
  AlertCircle,
  Users,
  MapPin,
  Calendar,
  FileText,
  Phone,
  Mail,
  User,
  Loader2,
  ExternalLink,
  RefreshCw,
  HardHat,
  Share2,
  Link2,
  CheckCircle,
  MessageSquare,
  X,
  Plus,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { cn, formatPhoneDisplay } from "@/lib/utils";
import type { CrewAssignmentWithMember, TeamMember } from "@shared/schema";

interface WorkOrderTabProps {
  projectId: number;
  project: any;
  contact: any;
  docs: any[];
  crewAssignments: CrewAssignmentWithMember[];
  allTeamMembers: TeamMember[];
}

export function WorkOrderTab({ projectId, project, contact, docs, crewAssignments, allTeamMembers }: WorkOrderTabProps) {
  const { toast } = useToast();
  const [showSettings, setShowSettings] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [selectedMemberIds, setSelectedMemberIds] = useState<number[]>([]);
  const [phoneRecipients, setPhoneRecipients] = useState<string[]>([]);
  const [emailRecipients, setEmailRecipients] = useState<string[]>([]);
  const [linkCopied, setLinkCopied] = useState(false);

  const { data: workOrder, isLoading } = useQuery<any>({
    queryKey: ['/api/projects', projectId, 'work-order'],
    queryFn: () => fetch(`/api/projects/${projectId}/work-order`, { credentials: 'include' }).then(r => r.json()),
  });

  const acceptedProposal = docs.find(d =>
    (d.type === 'proposal' || d.type === 'estimate') && (d.status === 'accepted' || d.status === 'signed')
  );

  const createOrUpdateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/work-order`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'work-order'] });
      toast({ title: "Work order saved" });
    },
    onError: () => {
      toast({ title: "Failed to save work order", variant: "destructive" });
    },
  });

  const sendMutation = useMutation({
    mutationFn: async (payload: { teamMemberIds: number[]; phoneNumbers: string[]; emails: string[] }) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/work-order/send`, payload);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'work-order'] });
      const total = (data?.sentSms || 0) + (data?.sentEmail || 0);
      const failures: any[] = data?.failures || [];
      if (total > 0) {
        const parts: string[] = [];
        if (data.sentSms) parts.push(`${data.sentSms} text${data.sentSms !== 1 ? 's' : ''}`);
        if (data.sentEmail) parts.push(`${data.sentEmail} email${data.sentEmail !== 1 ? 's' : ''}`);
        toast({ title: `Work order sent — ${parts.join(' + ')}` });
        setShowShareDialog(false);
        setPhoneRecipients([]);
        setEmailRecipients([]);
      }
      if (failures.length > 0) {
        toast({
          title: `${failures.length} delivery failed`,
          description: failures.slice(0, 3).map((f: any) => `${f.recipient}: ${f.error}`).join(' · '),
          variant: "destructive",
        });
      }
    },
    onError: (err: any) => {
      toast({ title: "Failed to send work order", description: err?.message, variant: "destructive" });
    },
  });

  const handleCreateWorkOrder = async () => {
    // Auto-create then open the share sheet so the user lands directly
    // on the same flow they'll use forever after. We write the response
    // straight into the query cache so the share dialog has shareUrl
    // immediately — invalidate alone would race the dialog open.
    const created = await createOrUpdateMutation.mutateAsync({});
    queryClient.setQueryData(['/api/projects', projectId, 'work-order'], created);
    setSelectedMemberIds(crewAssignments.map(a => a.teamMemberId));
    setShowShareDialog(true);
  };

  const handleToggleVisibility = (field: string, value: boolean) => {
    createOrUpdateMutation.mutate({ [field]: value });
  };

  const handleSaveNotes = (notes: string) => {
    createOrUpdateMutation.mutate({ additionalNotes: notes });
  };

  const handleShare = async () => {
    // Ensure a work order exists before opening the share sheet, and
    // write the fresh response straight into the query cache so the
    // dialog renders with shareUrl populated on first paint (not after
    // a background refetch).
    if (!workOrder) {
      const created = await createOrUpdateMutation.mutateAsync({});
      queryClient.setQueryData(['/api/projects', projectId, 'work-order'], created);
    }
    setSelectedMemberIds(crewAssignments.map(a => a.teamMemberId));
    setPhoneRecipients([]);
    setEmailRecipients([]);
    setShowShareDialog(true);
  };

  const handleConfirmSend = () => {
    sendMutation.mutate({
      teamMemberIds: selectedMemberIds,
      phoneNumbers: phoneRecipients,
      emails: emailRecipients,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!workOrder) {
    return (
      <div className="text-center py-8">
        <ClipboardList className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
        <h3 className="font-semibold mb-1">No Work Order Yet</h3>
        <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
          Create a work order to share job details with your crew.
          {acceptedProposal ? " It will pull details from your accepted proposal." : ""}
        </p>
        <Button
          onClick={handleCreateWorkOrder}
          disabled={createOrUpdateMutation.isPending}
          data-testid="button-create-work-order"
        >
          {createOrUpdateMutation.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Share2 className="w-4 h-4 mr-2" />
          )}
          Create &amp; Share
        </Button>
      </div>
    );
  }

  const lineItems = acceptedProposal?.lineItems as any[] | undefined;
  const views = workOrder.views || [];
  const sends = workOrder.sends || [];

  const viewedMemberIds = new Set(views.map((v: any) => v.teamMemberId));
  const assignedMembers = crewAssignments.map(a => ({
    ...a.teamMember,
    viewed: viewedMemberIds.has(a.teamMemberId),
    viewedAt: views.find((v: any) => v.teamMemberId === a.teamMemberId)?.viewedAt,
  }));

  const fullAddress = [project.jobAddress, project.jobCity, project.jobState, project.jobZipCode]
    .filter(Boolean).join(', ');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant={workOrder.status === 'sent' ? 'default' : 'secondary'} data-testid="badge-work-order-status">
            {workOrder.status === 'sent' ? 'Sent' : 'Draft'}
          </Badge>
          {workOrder.sentAt && (
            <span className="text-xs text-muted-foreground">
              Sent {formatDistanceToNow(new Date(workOrder.sentAt), { addSuffix: true })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSettings(true)}
            data-testid="button-work-order-settings"
          >
            <Settings className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            onClick={handleShare}
            disabled={createOrUpdateMutation.isPending}
            data-testid="button-share-work-order"
          >
            {createOrUpdateMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Share2 className="w-4 h-4 mr-1" />
            )}
            Share Work Order
          </Button>
        </div>
      </div>

      <Card data-testid="card-crew-status">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Users className="w-4 h-4" />
            Crew Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {assignedMembers.length === 0 && (
            <p className="text-sm text-muted-foreground py-1" data-testid="text-no-crew-assigned">
              No crew assigned yet — share the link via phone, email, or copy it directly. You can assign crew later from the Costing tab.
            </p>
          )}
          {assignedMembers.map((member: any) => (
            <div key={member.id} className="flex items-center justify-between py-1.5" data-testid={`crew-status-${member.id}`}>
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium",
                  member.viewed
                    ? "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-500"
                )}>
                  {member.viewed ? <Check className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                </div>
                <div>
                  <p className="text-sm font-medium">{member.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{member.role}</p>
                </div>
              </div>
              <div className="text-right">
                {member.viewed ? (
                  <span className="text-xs text-green-600 dark:text-green-400" data-testid={`text-viewed-${member.id}`}>
                    Viewed {formatDistanceToNow(new Date(member.viewedAt), { addSuffix: true })}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground" data-testid={`text-not-viewed-${member.id}`}>
                    Not yet viewed
                  </span>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card
        className="cursor-pointer hover:border-primary/40 transition-colors"
        onClick={() => setShowPreview(true)}
        data-testid="card-work-order-preview"
      >
        <CardContent className="py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Eye className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-sm" data-testid="text-preview-title">View Work Order Details</h3>
                <p className="text-xs text-muted-foreground">See exactly what your crew will see</p>
              </div>
            </div>
            <ExternalLink className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5 pl-[52px]">
            {workOrder.showCustomerName && contact && (
              <Badge variant="outline" className="text-xs font-normal">
                <User className="w-3 h-3 mr-1" />
                {contact.firstName} {contact.lastName || ''}
              </Badge>
            )}
            {workOrder.showJobAddress && fullAddress && (
              <Badge variant="outline" className="text-xs font-normal">
                <MapPin className="w-3 h-3 mr-1" />
                Address
              </Badge>
            )}
            {lineItems && lineItems.length > 0 && workOrder.showLineItems && (
              <Badge variant="outline" className="text-xs font-normal">
                <FileText className="w-3 h-3 mr-1" />
                {lineItems.length} item{lineItems.length !== 1 ? 's' : ''}
              </Badge>
            )}
            {workOrder.showScheduledDates && project.scheduledDate && (
              <Badge variant="outline" className="text-xs font-normal">
                <Calendar className="w-3 h-3 mr-1" />
                Scheduled
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Additional Instructions for Crew</CardTitle>
        </CardHeader>
        <CardContent>
          <AdditionalNotesEditor
            initialValue={workOrder.additionalNotes || ''}
            onSave={handleSaveNotes}
            isPending={createOrUpdateMutation.isPending}
          />
        </CardContent>
      </Card>

      <SettingsDialog
        open={showSettings}
        onOpenChange={setShowSettings}
        workOrder={workOrder}
        onToggle={handleToggleVisibility}
        onUpdate={(data: any) => createOrUpdateMutation.mutate(data)}
        isPending={createOrUpdateMutation.isPending}
      />

      <ShareDialog
        open={showShareDialog}
        onOpenChange={setShowShareDialog}
        shareUrl={workOrder.shareUrl || ''}
        crewAssignments={crewAssignments}
        allTeamMembers={allTeamMembers}
        selectedIds={selectedMemberIds}
        onSelectedChange={setSelectedMemberIds}
        phoneRecipients={phoneRecipients}
        onPhoneRecipientsChange={setPhoneRecipients}
        emailRecipients={emailRecipients}
        onEmailRecipientsChange={setEmailRecipients}
        linkCopied={linkCopied}
        onLinkCopied={setLinkCopied}
        onSend={handleConfirmSend}
        isPending={sendMutation.isPending}
        views={views}
      />

      <WorkOrderPreviewDialog
        open={showPreview}
        onOpenChange={setShowPreview}
        publicToken={workOrder.publicToken}
      />
    </div>
  );
}

function AdditionalNotesEditor({ initialValue, onSave, isPending }: { initialValue: string; onSave: (v: string) => void; isPending: boolean }) {
  const [value, setValue] = useState(initialValue);
  const changed = value !== initialValue;

  return (
    <div className="space-y-2">
      <Textarea
        placeholder="Add special instructions, safety notes, material details, paint colors, etc."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={3}
        data-testid="input-additional-notes"
      />
      {changed && (
        <Button size="sm" onClick={() => onSave(value)} disabled={isPending} data-testid="button-save-notes">
          {isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
          Save Notes
        </Button>
      )}
    </div>
  );
}

function SettingsDialog({ open, onOpenChange, workOrder, onToggle, onUpdate, isPending }: any) {
  const visibilityFields = [
    { key: 'showCustomerName', label: 'Customer Name', icon: User },
    { key: 'showCustomerPhone', label: 'Customer Phone', icon: Phone },
    { key: 'showCustomerEmail', label: 'Customer Email', icon: Mail },
    { key: 'showJobAddress', label: 'Job Address', icon: MapPin },
    { key: 'showLineItems', label: 'Line Items / Scope', icon: FileText },
    { key: 'showNotes', label: 'Proposal Notes', icon: FileText },
    { key: 'showScheduledDates', label: 'Scheduled Dates', icon: Calendar },
    { key: 'showProjectDescription', label: 'Project Description', icon: ClipboardList },
    { key: 'showAssignedCrew', label: 'Assigned Crew', icon: HardHat },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Work Order Settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-medium mb-3">What to show on the work order</h4>
            <div className="space-y-3">
              {visibilityFields.map(field => (
                <div key={field.key} className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    <field.icon className="w-4 h-4 text-muted-foreground" />
                    {field.label}
                  </div>
                  <Switch
                    checked={workOrder[field.key]}
                    onCheckedChange={(checked) => onToggle(field.key, checked)}
                    data-testid={`switch-${field.key}`}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="border-t pt-4">
            <h4 className="text-sm font-medium mb-3">Auto-Send Settings</h4>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Send Timing</Label>
                <Select
                  value={workOrder.autoSendTiming || 'on_acceptance'}
                  onValueChange={(v) => onUpdate({ autoSendTiming: v })}
                >
                  <SelectTrigger data-testid="select-send-timing">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="on_acceptance">On proposal acceptance</SelectItem>
                    <SelectItem value="days_before">Days before project start</SelectItem>
                    <SelectItem value="manual">Manual only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {workOrder.autoSendTiming === 'days_before' && (
                <div>
                  <Label className="text-xs">Days before start</Label>
                  <Select
                    value={String(workOrder.autoSendDaysBefore || 1)}
                    onValueChange={(v) => onUpdate({ autoSendDaysBefore: parseInt(v) })}
                  >
                    <SelectTrigger data-testid="select-days-before">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 day before</SelectItem>
                      <SelectItem value="2">2 days before</SelectItem>
                      <SelectItem value="3">3 days before</SelectItem>
                      <SelectItem value="7">1 week before</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label className="text-xs">Send to roles</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {['crew', 'lead', 'helper', 'sales'].map(role => {
                    const selected = (workOrder.sendToRoles || ['crew', 'lead']).includes(role);
                    return (
                      <Badge
                        key={role}
                        variant={selected ? 'default' : 'outline'}
                        className="cursor-pointer capitalize"
                        onClick={() => {
                          const current = workOrder.sendToRoles || ['crew', 'lead'];
                          const updated = selected
                            ? current.filter((r: string) => r !== role)
                            : [...current, role];
                          onUpdate({ sendToRoles: updated });
                        }}
                        data-testid={`badge-role-${role}`}
                      >
                        {role}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-close-settings">
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ShareDialog({
  open,
  onOpenChange,
  shareUrl,
  crewAssignments,
  allTeamMembers,
  selectedIds,
  onSelectedChange,
  phoneRecipients,
  onPhoneRecipientsChange,
  emailRecipients,
  onEmailRecipientsChange,
  linkCopied,
  onLinkCopied,
  onSend,
  isPending,
  views,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  shareUrl: string;
  crewAssignments: CrewAssignmentWithMember[];
  allTeamMembers: TeamMember[];
  selectedIds: number[];
  onSelectedChange: (ids: number[]) => void;
  phoneRecipients: string[];
  onPhoneRecipientsChange: (v: string[]) => void;
  emailRecipients: string[];
  onEmailRecipientsChange: (v: string[]) => void;
  linkCopied: boolean;
  onLinkCopied: (v: boolean) => void;
  onSend: () => void;
  isPending: boolean;
  views: any[];
}) {
  const { toast } = useToast();
  const [phoneInput, setPhoneInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const viewedIds = new Set(views.map((v: any) => v.teamMemberId));

  const toggleMember = (id: number) => {
    onSelectedChange(
      selectedIds.includes(id)
        ? selectedIds.filter((i: number) => i !== id)
        : [...selectedIds, id]
    );
  };

  // Show assigned crew first, then any other team members the user
  // might want to share with (e.g. a roving project manager). Each row
  // shows whichever channel(s) we can deliver on.
  const assignedIdsSet = new Set(crewAssignments.map(a => a.teamMemberId));
  const assignedRows = crewAssignments
    .map(a => a.teamMember)
    .filter(m => !!m);
  const otherTeamRows = allTeamMembers.filter(
    m => !assignedIdsSet.has(m.id) && (m.phone || m.email)
  );

  const handleCopyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      onLinkCopied(true);
      toast({ title: "Link copied!" });
      setTimeout(() => onLinkCopied(false), 3000);
    } catch {
      toast({ title: "Couldn't copy — try long-pressing the link", variant: "destructive" });
    }
  };

  const addPhone = () => {
    const trimmed = phoneInput.trim();
    if (!trimmed) return;
    // Light validation: must contain at least 7 digits.
    const digits = trimmed.replace(/\D/g, '');
    if (digits.length < 7) {
      toast({ title: "That doesn't look like a phone number", variant: "destructive" });
      return;
    }
    if (phoneRecipients.includes(trimmed)) {
      setPhoneInput("");
      return;
    }
    onPhoneRecipientsChange([...phoneRecipients, trimmed]);
    setPhoneInput("");
  };

  const addEmail = () => {
    const trimmed = emailInput.trim();
    if (!trimmed) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast({ title: "That doesn't look like an email", variant: "destructive" });
      return;
    }
    if (emailRecipients.includes(trimmed)) {
      setEmailInput("");
      return;
    }
    onEmailRecipientsChange([...emailRecipients, trimmed]);
    setEmailInput("");
  };

  const totalRecipients = selectedIds.length + phoneRecipients.length + emailRecipients.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto" data-testid="dialog-share-work-order">
        <DialogHeader>
          <DialogTitle>Share Work Order</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Copy link — always available, mirrors the photo-share UX */}
          <div className="p-3 border rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              <Link2 className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Shareable Link</span>
            </div>
            <div className="text-xs text-muted-foreground break-all">
              {shareUrl || "Generating link..."}
            </div>
            <button
              type="button"
              disabled={!shareUrl}
              className={cn(
                "w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                linkCopied
                  ? "bg-green-500/10 text-green-600"
                  : "bg-muted hover:bg-muted/80 text-foreground",
                !shareUrl && "opacity-50 cursor-not-allowed"
              )}
              onClick={handleCopyLink}
              data-testid="button-copy-work-order-link"
            >
              {linkCopied ? <CheckCircle className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
              {linkCopied ? "Link Copied!" : "Copy Link"}
            </button>
          </div>

          {/* Team-member picker */}
          {(assignedRows.length > 0 || otherTeamRows.length > 0) && (
            <div className="p-3 border rounded-lg space-y-2">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Send to Team Members</span>
              </div>
              <p className="text-xs text-muted-foreground">
                We'll text and email each person using whatever info they have on file.
              </p>

              {assignedRows.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground/70 mt-1">Assigned to this job</p>
                  {assignedRows.map((m: any) => (
                    <MemberRow
                      key={m.id}
                      member={m}
                      checked={selectedIds.includes(m.id)}
                      onToggle={() => toggleMember(m.id)}
                      viewed={viewedIds.has(m.id)}
                    />
                  ))}
                </div>
              )}

              {otherTeamRows.length > 0 && (
                <details className="mt-1">
                  <summary className="text-[11px] uppercase tracking-wide text-muted-foreground/70 cursor-pointer select-none">
                    Other team members ({otherTeamRows.length})
                  </summary>
                  <div className="space-y-1 mt-1">
                    {otherTeamRows.map((m: any) => (
                      <MemberRow
                        key={m.id}
                        member={m}
                        checked={selectedIds.includes(m.id)}
                        onToggle={() => toggleMember(m.id)}
                        viewed={viewedIds.has(m.id)}
                      />
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}

          {/* Free-form phone */}
          <div className="p-3 border rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Send by Text</span>
            </div>
            <p className="text-xs text-muted-foreground">Add any phone number — even people who aren't in your team list.</p>
            <div className="flex gap-2">
              <Input
                type="tel"
                placeholder="(555) 123-4567"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPhone(); } }}
                className="flex-1"
                data-testid="input-share-phone"
              />
              <Button type="button" size="sm" variant="outline" onClick={addPhone} data-testid="button-add-share-phone">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            {phoneRecipients.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {phoneRecipients.map((p) => (
                  <Badge key={p} variant="secondary" className="text-xs gap-1" data-testid={`chip-phone-${p}`}>
                    {formatPhoneDisplay(p)}
                    <button
                      type="button"
                      onClick={() => onPhoneRecipientsChange(phoneRecipients.filter((x) => x !== p))}
                      className="hover:text-destructive"
                      aria-label="Remove"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Free-form email */}
          <div className="p-3 border rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Send by Email</span>
            </div>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="name@example.com"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEmail(); } }}
                className="flex-1"
                data-testid="input-share-email"
              />
              <Button type="button" size="sm" variant="outline" onClick={addEmail} data-testid="button-add-share-email">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            {emailRecipients.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {emailRecipients.map((e) => (
                  <Badge key={e} variant="secondary" className="text-xs gap-1" data-testid={`chip-email-${e}`}>
                    {e}
                    <button
                      type="button"
                      onClick={() => onEmailRecipientsChange(emailRecipients.filter((x) => x !== e))}
                      className="hover:text-destructive"
                      aria-label="Remove"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-share">
            Done
          </Button>
          <Button
            onClick={onSend}
            disabled={isPending || totalRecipients === 0}
            data-testid="button-confirm-share-send"
          >
            {isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
            Send {totalRecipients > 0 ? `(${totalRecipients})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MemberRow({ member, checked, onToggle, viewed }: { member: any; checked: boolean; onToggle: () => void; viewed: boolean }) {
  const channels: string[] = [];
  if (member.phone) channels.push("text");
  if (member.email) channels.push("email");
  const channelLabel = channels.length === 0
    ? "no contact info"
    : channels.join(" + ");

  return (
    <label
      className={cn(
        "flex items-center gap-3 py-2 px-2 rounded-md cursor-pointer hover:bg-muted/50",
        !member.phone && !member.email && "opacity-50 cursor-not-allowed"
      )}
      data-testid={`share-member-${member.id}`}
    >
      <Checkbox
        checked={checked}
        onCheckedChange={onToggle}
        disabled={!member.phone && !member.email}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{member.name}</p>
        <p className="text-xs text-muted-foreground capitalize truncate">
          {member.role} · {channelLabel}
        </p>
      </div>
      {viewed && (
        <Badge variant="secondary" className="text-xs bg-green-100 dark:bg-green-900/30 text-green-600">
          <Check className="w-3 h-3 mr-1" /> Viewed
        </Badge>
      )}
    </label>
  );
}

function WorkOrderPreviewDialog({ open, onOpenChange, publicToken }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  publicToken: string;
}) {
  const { data, isLoading } = useQuery<any>({
    queryKey: ['/api/work-order/view', publicToken],
    queryFn: () => fetch(`/api/work-order/view/${publicToken}`).then(r => {
      if (!r.ok) throw new Error('Not found');
      return r.json();
    }),
    enabled: open && !!publicToken,
  });

  if (!open) return null;

  const wo = data?.workOrder;
  const project = data?.project;
  const contact = data?.contact;
  const companySettings = data?.companySettings;
  const lineItems = data?.lineItems;
  const notes = data?.notes;
  const crewAssignments = data?.crewAssignments;
  const brandColor = companySettings?.brandColor || 'hsl(var(--primary))';

  const fullAddress = project ? [project.jobAddress, project.jobCity, project.jobState, project.jobZipCode]
    .filter(Boolean).join(', ') : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto p-0" data-testid="dialog-work-order-preview">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : !data ? (
          <div className="text-center py-12">
            <ClipboardList className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">Could not load work order preview</p>
          </div>
        ) : (
          <>
            <DialogHeader className="sr-only">
              <DialogTitle>Work Order Preview</DialogTitle>
            </DialogHeader>

            <div className="px-5 pt-5 pb-4 space-y-4">
              {companySettings?.logoUrl && (
                <div className="flex justify-center">
                  <img src={companySettings.logoUrl} alt={companySettings?.companyName || ''} className="w-20 h-20 object-contain" data-testid="img-wo-preview-logo" />
                </div>
              )}

              <div className="text-center space-y-1 border-b pb-4">
                <h2 className="text-xl font-bold" style={brandColor !== 'hsl(var(--primary))' ? { color: brandColor } : undefined} data-testid="text-preview-dialog-title">
                  {companySettings?.companyName || 'Work Order'}
                </h2>
                {companySettings?.companyLicense && (
                  <p className="text-muted-foreground text-xs">License: {companySettings.companyLicense}</p>
                )}
                {companySettings?.address && (
                  <p className="text-muted-foreground text-sm">{companySettings.address}</p>
                )}
                {(companySettings?.city || companySettings?.state || companySettings?.zipCode) && (
                  <p className="text-muted-foreground text-sm">
                    {[companySettings.city, companySettings.state].filter(Boolean).join(', ')}
                    {companySettings.zipCode && ` ${companySettings.zipCode}`}
                  </p>
                )}
                <div className="flex justify-center gap-4 text-muted-foreground text-sm">
                  {companySettings?.phone && <span>{formatPhoneDisplay(companySettings.phone)}</span>}
                  {companySettings?.email && <span>{companySettings.email}</span>}
                </div>
              </div>

              <div className="text-center border-b pb-4">
                <p className="text-xs font-bold uppercase text-muted-foreground mb-1">Work Order</p>
                <h3 className="text-lg font-bold" data-testid="text-preview-project-title">{project?.title}</h3>
                {project?.description && (
                  <p className="text-sm text-muted-foreground mt-1" data-testid="text-preview-description">{project.description}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 border-b pb-4">
                {(contact?.name || contact?.phone || contact?.email) && (
                  <div>
                    <h4 className="text-xs font-bold uppercase text-muted-foreground mb-1">Customer</h4>
                    {contact?.name && <p className="text-sm font-medium" data-testid="text-preview-customer">{contact.name}</p>}
                    {contact?.phone && <p className="text-sm text-muted-foreground" data-testid="text-preview-phone">{formatPhoneDisplay(contact.phone)}</p>}
                    {contact?.email && <p className="text-sm text-muted-foreground" data-testid="text-preview-email">{contact.email}</p>}
                  </div>
                )}

                <div>
                  {fullAddress && (
                    <div className="mb-2">
                      <h4 className="text-xs font-bold uppercase text-muted-foreground mb-1">Job Address</h4>
                      <p className="text-sm" data-testid="text-preview-address">{fullAddress}</p>
                    </div>
                  )}
                  {project?.scheduledDate && (
                    <div>
                      <h4 className="text-xs font-bold uppercase text-muted-foreground mb-1">Schedule</h4>
                      <p className="text-sm" data-testid="text-preview-dates">
                        {project.scheduledDate}
                        {project.scheduledTime && ` at ${project.scheduledTime}`}
                        {project.scheduledEndDate && ` — ${project.scheduledEndDate}`}
                        {project.scheduledEndTime && ` at ${project.scheduledEndTime}`}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {lineItems && lineItems.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Scope of Work
                  </h3>
                  <div className="space-y-1.5">
                    {lineItems.map((item: any, idx: number) => (
                      <div key={idx} className="py-2 border-l-2 border-primary pl-3 ml-1" data-testid={`preview-line-item-${idx}`}>
                        <div className="text-sm font-medium prose prose-sm dark:prose-invert max-w-none [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_p]:my-1" dangerouslySetInnerHTML={{ __html: item.description || item.name || `Item ${idx + 1}` }} />
                        {item.notes && <p className="text-xs text-muted-foreground mt-0.5">{item.notes}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {notes && (
                <div>
                  <h3 className="text-sm font-semibold mb-1">Notes</h3>
                  <p className="text-sm text-muted-foreground">{notes}</p>
                </div>
              )}

              {wo?.additionalNotes && (
                <div>
                  <h3 className="text-sm font-semibold mb-1">Additional Instructions</h3>
                  <p className="text-sm text-muted-foreground">{wo.additionalNotes}</p>
                </div>
              )}

              {crewAssignments && crewAssignments.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <HardHat className="w-4 h-4" />
                    Assigned Crew
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {crewAssignments.map((a: any, idx: number) => (
                      <Badge key={idx} variant="secondary" className="capitalize">
                        {a.teamMember.name} · {a.teamMember.role}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
