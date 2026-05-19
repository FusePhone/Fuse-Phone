import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { isValidPhone, stripPhoneInput } from "@/lib/phone";
import { formatPhoneDisplay } from "@/lib/utils";
import type { TeamMember, TimeEntryWithMember, CrewGroup, CompanyInvitation, Supplier } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import {
  Plus, Pencil, Trash2, Users, HardHat, Star, DollarSign, Phone, Mail, Loader2,
  Clock, Play, Square, Copy, Link, ExternalLink, ChevronDown, ChevronRight, CalendarDays, Wrench, Headphones, Briefcase, FolderOpen, X, UserPlus, ClipboardList, Calendar, MapPin, FileText, User as UserIcon, Send, Smartphone, CheckCircle2, AlertCircle, Megaphone, Store
} from "lucide-react";
import { CrewNotesSection } from "@/components/CrewNotes";
import ProjectPicker from "@/components/ProjectPicker";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { format, startOfWeek, endOfWeek, addDays, subWeeks, addWeeks } from "date-fns";
import { useSubscription } from "@/hooks/use-subscription";

const PRODUCTION_ROLES = ["crew", "lead", "helper", "mechanic"];
const NON_PRODUCTION_ROLES = ["va", "secretary", "sales"];

const ROLE_CONFIG: Record<string, { label: string; icon: any }> = {
  crew: { label: "Team Member", icon: HardHat },
  lead: { label: "Lead", icon: Star },
  helper: { label: "Helper", icon: Users },
  mechanic: { label: "Mechanic", icon: Wrench },
  va: { label: "VA", icon: Headphones },
  secretary: { label: "Secretary", icon: Briefcase },
  sales: { label: "Sales", icon: DollarSign },
};

function getRoleLabel(role: string) {
  return ROLE_CONFIG[role]?.label || role;
}

function isProductionRole(role: string) {
  return PRODUCTION_ROLES.includes(role);
}

interface PayrollEntry {
  id: number;
  projectId: number | null;
  projectTitle: string | null;
  clockIn: string;
  clockOut: string;
  totalMinutes: number;
  cost: number;
  notes: string | null;
  clockInLat: string | null;
  clockInLng: string | null;
  clockOutLat: string | null;
  clockOutLng: string | null;
}

interface PayrollMember {
  memberId: number;
  memberName: string;
  role: string;
  hourlyRate: number;
  totalMinutes: number;
  totalCost: number;
  entries: PayrollEntry[];
}

interface PayrollReport {
  report: PayrollMember[];
  grandTotalMinutes: number;
  grandTotalCost: number;
}

export default function CrewManagement() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("members");

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-2xl font-bold" data-testid="text-crew-title">Crew Management</h1>
          <Badge variant="secondary" className="text-xs gap-1" data-testid="badge-elite-crew">
            <Star className="w-3 h-3" />
            Elite
          </Badge>
        </div>
        <p className="text-muted-foreground text-sm mt-1">
          Manage team members, track time, and review payroll.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="overflow-x-auto -mx-4 px-4 scrollbar-hide">
          <TabsList className="inline-flex gap-1.5 w-max bg-transparent h-auto p-0">
            <TabsTrigger value="members" className="rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none" data-testid="tab-members">
              <Users className="w-4 h-4 mr-1.5" />
              Members
            </TabsTrigger>
            <TabsTrigger value="time-tracking" className="rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none" data-testid="tab-time-tracking">
              <Clock className="w-4 h-4 mr-1.5" />
              Time
            </TabsTrigger>
            <TabsTrigger value="payroll" className="rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none" data-testid="tab-payroll">
              <DollarSign className="w-4 h-4 mr-1.5" />
              Payroll
            </TabsTrigger>
            <TabsTrigger value="work-orders" className="rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none" data-testid="tab-work-orders">
              <ClipboardList className="w-4 h-4 mr-1.5" />
              Work Orders
            </TabsTrigger>
            <TabsTrigger value="notes" className="rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none" data-testid="tab-notes">
              <Megaphone className="w-4 h-4 mr-1.5" />
              Notes
            </TabsTrigger>
            <TabsTrigger value="suppliers" className="rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none" data-testid="tab-suppliers">
              <Store className="w-4 h-4 mr-1.5" />
              Suppliers
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="members" className="mt-6">
          <MembersTab />
        </TabsContent>
        <TabsContent value="time-tracking" className="mt-6">
          <TimeTrackingTab />
        </TabsContent>
        <TabsContent value="payroll" className="mt-6">
          <PayrollTab />
        </TabsContent>
        <TabsContent value="work-orders" className="mt-6">
          <WorkOrderDefaultsTab />
        </TabsContent>
        <TabsContent value="notes" className="mt-6">
          <CrewNotesSection isOwner={true} />
        </TabsContent>
        <TabsContent value="suppliers" className="mt-6">
          <SuppliersTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MembersTab() {
  const { toast } = useToast();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addingCategory, setAddingCategory] = useState<"production" | "non_production">("production");
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [deletingMember, setDeletingMember] = useState<TeamMember | null>(null);
  const [formName, setFormName] = useState("");
  const [formRole, setFormRole] = useState("crew");
  const [formCustomRole, setFormCustomRole] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formHourlyRate, setFormHourlyRate] = useState("");
  const [formPin, setFormPin] = useState("");
  const [formActive, setFormActive] = useState(true);
  const [formActiveForPricing, setFormActiveForPricing] = useState(true);
  const [formPayrollBurden, setFormPayrollBurden] = useState("12");
  const [formWorkersComp, setFormWorkersComp] = useState("18");
  const [formBenefitsPerHour, setFormBenefitsPerHour] = useState("0");

  const [invitingMember, setInvitingMember] = useState<TeamMember | null>(null);
  const [inviteMethod, setInviteMethod] = useState<"email" | "phone" | "both">("phone");
  const [inviteRole, setInviteRole] = useState("laborer");

  const { data: members = [], isLoading } = useQuery<TeamMember[]>({
    queryKey: ["/api/team-members"],
  });

  interface CompanyUserBasic { id: number; linkedTeamMemberId?: number | null; role: string; status: string }
  const { data: companyUsers = [] } = useQuery<CompanyUserBasic[]>({
    queryKey: ["/api/company/users"],
  });

  const { data: invitations = [] } = useQuery<CompanyInvitation[]>({
    queryKey: ["/api/company/invitations"],
  });

  const linkedTeamMemberIds = new Set([
    ...companyUsers.filter(cu => cu.linkedTeamMemberId).map(cu => cu.linkedTeamMemberId!),
    ...invitations.filter(inv => inv.linkedTeamMemberId && inv.status === 'pending').map(inv => inv.linkedTeamMemberId!),
  ]);

  const pendingInviteByTeamMember = new Map<number, CompanyInvitation>();
  invitations.filter(inv => inv.linkedTeamMemberId && inv.status === 'pending')
    .forEach(inv => pendingInviteByTeamMember.set(inv.linkedTeamMemberId!, inv));

  const crewInviteMutation = useMutation({
    mutationFn: async (data: { email?: string; phone?: string; role: string; linkedTeamMemberId: number }) => {
      const res = await apiRequest("POST", "/api/company/users/invite", data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/company/invitations"] });
      setInvitingMember(null);
      if (data.emailSent || data.smsSent) {
        const method = data.emailSent && data.smsSent ? "email & text" : data.smsSent ? "text" : "email";
        toast({ title: "Invitation sent!", description: `Sent via ${method} to ${data.invitation?.email || data.invitation?.phone || "the team member"}.` });
      } else {
        toast({
          title: "Invitation created",
          description: `${data.emailError || 'Could not send.'} You can copy the invite link from User Management.`,
          variant: "destructive",
        });
      }
    },
    onError: (err: any) => toast({ title: "Failed to send invitation", description: err.message, variant: "destructive" }),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/team-members", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team-members"] });
      toast({ title: "Team member added" });
      resetForm();
      setShowAddDialog(false);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest("PATCH", `/api/team-members/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team-members"] });
      toast({ title: "Team member updated" });
      resetForm();
      setEditingMember(null);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/team-members/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team-members"] });
      toast({ title: "Team member removed" });
      setDeletingMember(null);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const ALL_KNOWN_ROLES = [...PRODUCTION_ROLES, ...NON_PRODUCTION_ROLES];

  function resetForm(category?: "production" | "non_production") {
    setFormName(""); setFormRole(category === "non_production" ? "va" : "crew"); setFormCustomRole(""); setFormPhone(""); setFormEmail(""); setFormHourlyRate(""); setFormPin("");
    setFormActive(true); setFormActiveForPricing(true);
    setFormPayrollBurden("12");
    setFormWorkersComp(category === "non_production" ? "3" : "18");
    setFormBenefitsPerHour("0");
  }

  function openEdit(member: TeamMember) {
    setFormName(member.name);
    const isKnown = ALL_KNOWN_ROLES.includes(member.role);
    setFormRole(isKnown ? member.role : "other");
    setFormCustomRole(isKnown ? "" : member.role);
    setAddingCategory(isProductionRole(member.role) ? "production" : "non_production");
    setFormPhone(member.phone || "");
    setFormEmail(member.email || "");
    setFormHourlyRate(member.hourlyRate ? (member.hourlyRate / 100).toString() : "");
    setFormPin(member.pin || "");
    setFormActive(member.isActive !== false);
    setFormActiveForPricing(member.activeForPricing !== false);
    setFormPayrollBurden(((member.payrollBurdenPercentage ?? 0.12) * 100).toString());
    const isProduction = isProductionRole(member.role);
    const wcDefault = isProduction ? 0.18 : 0.03;
    setFormWorkersComp(((member.workersCompPercentage ?? wcDefault) * 100).toString());
    setFormBenefitsPerHour((member.benefitsPerHour ?? 0).toString());
    setEditingMember(member);
  }

  function handleSubmit() {
    if (!formName.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    const resolvedRole = formRole === "other" ? formCustomRole.trim() : formRole;
    if (!resolvedRole) {
      toast({ title: "Role is required", variant: "destructive" });
      return;
    }
    const employeeType = isProductionRole(resolvedRole) ? "production" : "not_production";
    if (formPhone.length > 0 && !isValidPhone(formPhone)) {
      toast({ title: "Invalid phone number", description: "Enter a valid US/Canada phone number", variant: "destructive" });
      return;
    }
    const hourlyRateCents = formHourlyRate ? Math.round(parseFloat(formHourlyRate) * 100) : null;
    const phoneDigits = stripPhoneInput(formPhone);
    const data: any = {
      name: formName.trim(),
      role: resolvedRole,
      employeeType,
      phone: phoneDigits || undefined,
      email: formEmail.trim() || undefined,
      hourlyRate: hourlyRateCents,
      pin: formPin.trim() || null,
      isActive: formActive,
      activeForPricing: formActiveForPricing,
      payrollBurdenPercentage: (parseFloat(formPayrollBurden) || 0) / 100,
      workersCompPercentage: (parseFloat(formWorkersComp) || 0) / 100,
      benefitsPerHour: parseFloat(formBenefitsPerHour) || 0,
    };
    if (editingMember) {
      updateMutation.mutate({ id: editingMember.id, ...data });
    } else {
      createMutation.mutate(data);
    }
  }

  const productionMembers = members.filter(m => PRODUCTION_ROLES.includes(m.role));
  const nonProductionMembers = members.filter(m => NON_PRODUCTION_ROLES.includes(m.role) || !ALL_KNOWN_ROLES.includes(m.role));
  const isFormPending = createMutation.isPending || updateMutation.isPending;

  if (isLoading && members.length === 0) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-2 flex-wrap">
        <Button onClick={() => { resetForm("production"); setAddingCategory("production"); setShowAddDialog(true); }} data-testid="button-add-member">
          <Plus className="w-4 h-4 mr-2" />
          Add Member
        </Button>
      </div>

      {members.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-1">No team members yet</h3>
            <p className="text-muted-foreground text-sm mb-4">Add your production crew and non-production staff.</p>
            <Button onClick={() => { resetForm("production"); setAddingCategory("production"); setShowAddDialog(true); }} data-testid="button-add-first-member">
              <Plus className="w-4 h-4 mr-2" />
              Add Your First Team Member
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card data-testid="card-production-members">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <HardHat className="w-5 h-5" />
                    Production Members
                    <Badge variant="secondary" className="ml-1">{productionMembers.length}</Badge>
                  </CardTitle>
                  <CardDescription>Team members, leads, helpers, and mechanics on your team</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => { resetForm("production"); setAddingCategory("production"); setShowAddDialog(true); }} data-testid="button-add-production">
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Add
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {productionMembers.length === 0 ? (
                <p className="text-sm text-muted-foreground italic py-2">No production members added yet</p>
              ) : (
                <div className="space-y-2">
                  {productionMembers.map((member) => {
                    const wage = (member.hourlyRate || 0) / 100;
                    const burden = member.payrollBurdenPercentage ?? 0.12;
                    const wc = member.workersCompPercentage ?? 0.18;
                    const bph = member.benefitsPerHour ?? 0;
                    const trueCost = wage * (1 + burden + wc) + bph;
                    return (
                      <div key={member.id} className={`p-3 rounded-md border ${member.isActive === false ? "opacity-50" : ""}`} data-testid={`team-member-${member.id}`}>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-sm truncate" data-testid={`text-member-name-${member.id}`}>{member.name}</p>
                            <Badge variant="secondary" className="text-xs">{getRoleLabel(member.role)}</Badge>
                            {member.isActive === false && <Badge variant="outline" className="text-xs">Inactive</Badge>}
                            {member.activeForPricing === false && member.isActive !== false && <Badge variant="outline" className="text-xs">Not in pricing</Badge>}
                          </div>
                          <div className="flex items-center gap-3 mt-1 flex-wrap">
                            {member.phone && <span className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" />{formatPhoneDisplay(member.phone)}</span>}
                            {member.email && <span className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="w-3 h-3" />{member.email}</span>}
                            {wage > 0 && <span className="text-xs text-muted-foreground flex items-center gap-1" data-testid={`text-rate-${member.id}`}><DollarSign className="w-3 h-3" />${wage.toFixed(2)}/hr</span>}
                            {wage > 0 && <span className="text-xs font-medium flex items-center gap-1" data-testid={`text-true-cost-${member.id}`}>True: ${trueCost.toFixed(2)}/hr</span>}
                            {member.pin && <span className="text-xs text-muted-foreground flex items-center gap-1" data-testid={`text-pin-${member.id}`}><Clock className="w-3 h-3" />PIN set</span>}
                          </div>
                        </div>
                      <div className="flex items-center gap-1 mt-2 pt-2 border-t">
                        {companyUsers.some(cu => cu.linkedTeamMemberId === member.id) ? (
                          <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-200 gap-1"><CheckCircle2 className="w-3 h-3" />App Access</Badge>
                        ) : pendingInviteByTeamMember.has(member.id) ? (
                          <Badge variant="outline" className="text-xs text-amber-600 border-amber-200 gap-1"><Clock className="w-3 h-3" />Invite Pending</Badge>
                        ) : (member.phone || member.email) ? (
                          <Button variant="ghost" size="sm" className="text-xs h-7 gap-1" onClick={() => { setInvitingMember(member); setInviteMethod(member.phone ? "phone" : "email"); setInviteRole(member.role === "lead" ? "crew_lead" : "laborer"); }} data-testid={`button-invite-member-${member.id}`}>
                            <Send className="w-3 h-3" />Invite to App
                          </Button>
                        ) : null}
                        <div className="ml-auto flex items-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(member)} data-testid={`button-edit-member-${member.id}`}><Pencil className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeletingMember(member)} data-testid={`button-delete-member-${member.id}`}><Trash2 className="w-4 h-4" /></Button>
                        </div>
                      </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-non-production-members">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Briefcase className="w-5 h-5" />
                    Non-Production Members
                    <Badge variant="secondary" className="ml-1">{nonProductionMembers.length}</Badge>
                  </CardTitle>
                  <CardDescription>VAs, secretaries, sales staff, and other support roles</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => { resetForm("non_production"); setAddingCategory("non_production"); setShowAddDialog(true); }} data-testid="button-add-non-production">
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Add
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {nonProductionMembers.length === 0 ? (
                <p className="text-sm text-muted-foreground italic py-2">No non-production members added yet</p>
              ) : (
                <div className="space-y-2">
                  {nonProductionMembers.map((member) => {
                    const wage = (member.hourlyRate || 0) / 100;
                    const burden = member.payrollBurdenPercentage ?? 0.12;
                    const wc = member.workersCompPercentage ?? 0.03;
                    const bph = member.benefitsPerHour ?? 0;
                    const trueCost = wage * (1 + burden + wc) + bph;
                    return (
                      <div key={member.id} className={`p-3 rounded-md border ${member.isActive === false ? "opacity-50" : ""}`} data-testid={`team-member-${member.id}`}>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-sm truncate" data-testid={`text-member-name-${member.id}`}>{member.name}</p>
                            <Badge variant="secondary" className="text-xs">{getRoleLabel(member.role)}</Badge>
                            {member.isActive === false && <Badge variant="outline" className="text-xs">Inactive</Badge>}
                          </div>
                          <div className="flex items-center gap-3 mt-1 flex-wrap">
                            {member.phone && <span className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" />{formatPhoneDisplay(member.phone)}</span>}
                            {member.email && <span className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="w-3 h-3" />{member.email}</span>}
                            {wage > 0 && <span className="text-xs text-muted-foreground flex items-center gap-1" data-testid={`text-rate-${member.id}`}><DollarSign className="w-3 h-3" />${wage.toFixed(2)}/hr</span>}
                            {wage > 0 && <span className="text-xs font-medium flex items-center gap-1" data-testid={`text-true-cost-${member.id}`}>True: ${trueCost.toFixed(2)}/hr</span>}
                            {member.pin && <span className="text-xs text-muted-foreground flex items-center gap-1" data-testid={`text-pin-${member.id}`}><Clock className="w-3 h-3" />PIN set</span>}
                          </div>
                        </div>
                      <div className="flex items-center gap-1 mt-2 pt-2 border-t">
                        {companyUsers.some(cu => cu.linkedTeamMemberId === member.id) ? (
                          <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-200 gap-1"><CheckCircle2 className="w-3 h-3" />App Access</Badge>
                        ) : pendingInviteByTeamMember.has(member.id) ? (
                          <Badge variant="outline" className="text-xs text-amber-600 border-amber-200 gap-1"><Clock className="w-3 h-3" />Invite Pending</Badge>
                        ) : (member.phone || member.email) ? (
                          <Button variant="ghost" size="sm" className="text-xs h-7 gap-1" onClick={() => { setInvitingMember(member); setInviteMethod(member.phone ? "phone" : "email"); setInviteRole("office_manager"); }} data-testid={`button-invite-member-${member.id}`}>
                            <Send className="w-3 h-3" />Invite to App
                          </Button>
                        ) : null}
                        <div className="ml-auto flex items-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(member)} data-testid={`button-edit-member-${member.id}`}><Pencil className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeletingMember(member)} data-testid={`button-delete-member-${member.id}`}><Trash2 className="w-4 h-4" /></Button>
                        </div>
                      </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={!!invitingMember} onOpenChange={(open) => { if (!open) setInvitingMember(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite {invitingMember?.name} to App</DialogTitle>
            <DialogDescription>
              Send an app invitation so they can access their jobs, calendar, and clock in/out.
            </DialogDescription>
          </DialogHeader>
          {invitingMember && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Send via</Label>
                <Select value={inviteMethod} onValueChange={(v: any) => setInviteMethod(v)}>
                  <SelectTrigger data-testid="select-invite-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {invitingMember.phone && <SelectItem value="phone"><Smartphone className="w-3.5 h-3.5 inline mr-1.5" />Text to {formatPhoneDisplay(invitingMember.phone)}</SelectItem>}
                    {invitingMember.email && <SelectItem value="email"><Mail className="w-3.5 h-3.5 inline mr-1.5" />Email to {invitingMember.email}</SelectItem>}
                    {invitingMember.phone && invitingMember.email && <SelectItem value="both">Both text & email</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>App Role</Label>
                <Select value={inviteRole} onValueChange={setInviteRole}>
                  <SelectTrigger data-testid="select-crew-invite-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="laborer">Field Employee</SelectItem>
                    <SelectItem value="crew_lead">Crew Lead</SelectItem>
                    <SelectItem value="project_manager">Project Manager</SelectItem>
                    <SelectItem value="office_manager">Office Manager</SelectItem>
                    <SelectItem value="sales_rep">Sales Rep</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="bg-muted/50 rounded-md p-3 text-sm text-muted-foreground">
                This will create an app account linked to {invitingMember.name}'s crew profile so they see their assigned jobs.
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setInvitingMember(null)}>Cancel</Button>
            <Button
              disabled={crewInviteMutation.isPending}
              onClick={() => {
                if (!invitingMember) return;
                const payload: any = {
                  role: inviteRole,
                  linkedTeamMemberId: invitingMember.id,
                };
                if ((inviteMethod === "phone" || inviteMethod === "both") && invitingMember.phone) {
                  payload.phone = invitingMember.phone;
                }
                if ((inviteMethod === "email" || inviteMethod === "both") && invitingMember.email) {
                  payload.email = invitingMember.email;
                }
                crewInviteMutation.mutate(payload);
              }}
              data-testid="button-send-crew-invite"
            >
              {crewInviteMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending...</>
              ) : (
                <><Send className="w-4 h-4 mr-2" />Send Invitation</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CrewGroupsSection members={members} />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Template Tags</CardTitle>
          <CardDescription>Use these tags in your message templates to automatically insert team member names.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[
              { tag: "{{crew_lead}}", desc: "Name of the lead assigned to the job" },
              { tag: "{{crew_member}}", desc: "Name of a team member on the job" },
            ].map(({ tag, desc }) => (
              <div key={tag} className="flex items-center gap-3 text-sm">
                <Badge variant="outline" className="font-mono text-xs shrink-0">{tag}</Badge>
                <span className="text-muted-foreground">{desc}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={showAddDialog || !!editingMember} onOpenChange={(open) => { if (!open) { setShowAddDialog(false); setEditingMember(null); resetForm(); } }}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingMember ? "Edit Team Member" : "Add Team Member"}</DialogTitle>
            <DialogDescription>{editingMember ? "Update this team member's information." : "Add a new member to your team."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Label>Active</Label>
                <InfoTooltip text="Turn OFF if this worker is not currently active." />
              </div>
              <Switch checked={formActive} onCheckedChange={setFormActive} data-testid="switch-member-active" />
            </div>

            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Full name" data-testid="input-member-name" />
            </div>
            <div className="space-y-2">
              <Label>Role *</Label>
              <Select value={formRole} onValueChange={(v) => { setFormRole(v); if (v !== "other") setFormCustomRole(""); }}>
                <SelectTrigger data-testid="select-member-role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {addingCategory === "production" ? (
                    <>
                      <SelectItem value="crew">Team Member</SelectItem>
                      <SelectItem value="lead">Lead</SelectItem>
                      <SelectItem value="helper">Helper</SelectItem>
                      <SelectItem value="mechanic">Mechanic</SelectItem>
                    </>
                  ) : (
                    <>
                      <SelectItem value="va">VA</SelectItem>
                      <SelectItem value="secretary">Secretary</SelectItem>
                      <SelectItem value="sales">Sales</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
              {formRole === "other" && (
                <Input
                  value={formCustomRole}
                  onChange={(e) => setFormCustomRole(e.target.value)}
                  placeholder="Enter custom role name..."
                  className="mt-2"
                  autoFocus
                  data-testid="input-custom-role"
                />
              )}
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={formPhone} onChange={(e) => setFormPhone(stripPhoneInput(e.target.value))} inputMode="tel" placeholder="+15551234567" data-testid="input-member-phone" />
              {formPhone && formPhone.length > 0 && !isValidPhone(formPhone) && (
                <p className="text-xs text-amber-500 mt-1">Enter a valid US/Canada phone number</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="name@example.com" data-testid="input-member-email" />
            </div>
            <div className="space-y-2">
              <Label>Hourly Wage ($)</Label>
              <Input type="number" step="0.01" min="0" value={formHourlyRate} onChange={(e) => setFormHourlyRate(e.target.value)} placeholder="25.00" data-testid="input-member-hourly-rate" />
            </div>

            <div className="rounded-md border p-3 space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Cost Factors</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1">
                    <Label className="text-xs">Payroll Burden (%)</Label>
                    <InfoTooltip text="Extra payroll taxes on top of wages (Social Security, Medicare, unemployment, etc.). Example: 12 = 12%." />
                  </div>
                  <Input type="number" step="0.1" min="0" value={formPayrollBurden} onChange={(e) => setFormPayrollBurden(e.target.value)} placeholder="12" data-testid="input-member-payroll-burden" />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1">
                    <Label className="text-xs">Workers Comp (%)</Label>
                    <InfoTooltip text="Workers comp rate as a % of wages for THIS role/classification. Not your monthly insurance bill. Example: 18 = 18%." />
                  </div>
                  <Input type="number" step="0.1" min="0" value={formWorkersComp} onChange={(e) => setFormWorkersComp(e.target.value)} placeholder={addingCategory === "production" ? "18" : "3"} data-testid="input-member-workers-comp" />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1">
                    <Label className="text-xs">Benefits/hr ($)</Label>
                    <InfoTooltip text="Any benefits added per hour (paid time, bonuses, allowances). If none, leave 0." />
                  </div>
                  <Input type="number" step="0.01" min="0" value={formBenefitsPerHour} onChange={(e) => setFormBenefitsPerHour(e.target.value)} placeholder="0.00" data-testid="input-member-benefits-per-hour" />
                </div>
              </div>
              {(() => {
                const wage = parseFloat(formHourlyRate) || 0;
                const burden = (parseFloat(formPayrollBurden) || 0) / 100;
                const wc = (parseFloat(formWorkersComp) || 0) / 100;
                const benefits = parseFloat(formBenefitsPerHour) || 0;
                const trueCost = wage * (1 + burden + wc) + benefits;
                return (
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground">True cost/hr:</span>
                      <InfoTooltip text="Calculated true cost per labor hour: wage + payroll burden + workers comp + benefits." />
                    </div>
                    <span className="text-sm font-bold tabular-nums" data-testid="text-member-true-cost">${trueCost.toFixed(2)}</span>
                  </div>
                );
              })()}
            </div>

            {addingCategory === "production" && (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Label>Active for Pricing</Label>
                  <InfoTooltip text="Include this worker in the average production labor cost used for pricing." />
                </div>
                <Switch checked={formActiveForPricing} onCheckedChange={setFormActiveForPricing} data-testid="switch-member-active-for-pricing" />
              </div>
            )}

            <div className="space-y-2">
              <Label>Clock In/Out PIN</Label>
              <Input type="text" value={formPin} onChange={(e) => setFormPin(e.target.value)} placeholder="4-digit PIN" maxLength={6} data-testid="input-member-pin" />
              <p className="text-xs text-muted-foreground">Used for crew to clock in/out on the shared time clock page</p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setShowAddDialog(false); setEditingMember(null); resetForm(); }}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={isFormPending} data-testid="button-save-member">
              {isFormPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingMember ? "Save Changes" : "Add Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingMember} onOpenChange={(open) => { if (!open) setDeletingMember(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Team Member</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to remove {deletingMember?.name}? This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deletingMember && deleteMutation.mutate(deletingMember.id)} data-testid="button-confirm-delete-member">Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface CrewGroupWithMembers {
  id: number;
  name: string;
  memberIds: number[];
}

function CrewGroupsSection({ members }: { members: TeamMember[] }) {
  const { toast } = useToast();
  const [showGroupDialog, setShowGroupDialog] = useState(false);
  const [editingGroup, setEditingGroup] = useState<CrewGroupWithMembers | null>(null);
  const [groupName, setGroupName] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState<number[]>([]);
  const [deletingGroup, setDeletingGroup] = useState<CrewGroupWithMembers | null>(null);

  const { data: groups = [] } = useQuery<CrewGroupWithMembers[]>({
    queryKey: ["/api/crew-groups"],
  });

  const activeMembers = members.filter(m => m.isActive !== false);

  const createGroupMutation = useMutation({
    mutationFn: (data: { name: string; memberIds: number[] }) => apiRequest("POST", "/api/crew-groups", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crew-groups"] });
      toast({ title: "Crew group created" });
      closeDialog();
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateGroupMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: number; name: string; memberIds: number[] }) => apiRequest("PATCH", `/api/crew-groups/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crew-groups"] });
      toast({ title: "Crew group updated" });
      closeDialog();
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteGroupMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/crew-groups/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crew-groups"] });
      toast({ title: "Crew group deleted" });
      setDeletingGroup(null);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  function closeDialog() {
    setShowGroupDialog(false);
    setEditingGroup(null);
    setGroupName("");
    setSelectedMemberIds([]);
  }

  function openEdit(group: CrewGroupWithMembers) {
    setGroupName(group.name);
    setSelectedMemberIds([...group.memberIds]);
    setEditingGroup(group);
    setShowGroupDialog(true);
  }

  function openCreate() {
    setGroupName("");
    setSelectedMemberIds([]);
    setEditingGroup(null);
    setShowGroupDialog(true);
  }

  function handleSaveGroup() {
    if (!groupName.trim()) {
      toast({ title: "Group name is required", variant: "destructive" });
      return;
    }
    if (editingGroup) {
      updateGroupMutation.mutate({ id: editingGroup.id, name: groupName, memberIds: selectedMemberIds });
    } else {
      createGroupMutation.mutate({ name: groupName, memberIds: selectedMemberIds });
    }
  }

  function toggleMember(memberId: number) {
    setSelectedMemberIds(prev =>
      prev.includes(memberId) ? prev.filter(id => id !== memberId) : [...prev, memberId]
    );
  }

  const isSaving = createGroupMutation.isPending || updateGroupMutation.isPending;

  return (
    <>
      <Card data-testid="card-crew-groups">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <FolderOpen className="w-5 h-5" />
                Crew Groups
                <Badge variant="secondary" className="ml-1">{groups.length}</Badge>
              </CardTitle>
              <CardDescription>Create named groups to assign entire crews to jobs at once</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={openCreate} data-testid="button-add-crew-group">
              <Plus className="w-3.5 h-3.5 mr-1" />
              New Group
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {groups.length === 0 ? (
            <div className="text-center py-6">
              <FolderOpen className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground mb-3">No crew groups yet. Create a group to quickly assign entire teams to jobs.</p>
              <Button variant="outline" size="sm" onClick={openCreate} data-testid="button-create-first-group">
                <Plus className="w-3.5 h-3.5 mr-1" />
                Create First Group
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {groups.map(group => {
                const groupMembers = members.filter(m => group.memberIds.includes(m.id));
                return (
                  <div key={group.id} className="p-3 rounded-md border" data-testid={`crew-group-${group.id}`}>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <FolderOpen className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium text-sm" data-testid={`text-group-name-${group.id}`}>{group.name}</span>
                        <Badge variant="secondary" className="text-xs">{groupMembers.length} members</Badge>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(group)} data-testid={`button-edit-group-${group.id}`}><Pencil className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeletingGroup(group)} data-testid={`button-delete-group-${group.id}`}><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </div>
                    {groupMembers.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {groupMembers.map(m => (
                          <Badge key={m.id} variant="outline" className="text-xs" data-testid={`badge-group-member-${group.id}-${m.id}`}>
                            {m.name}
                            <span className="ml-1 text-muted-foreground">({getRoleLabel(m.role)})</span>
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">No members in this group</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showGroupDialog} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingGroup ? "Edit Crew Group" : "Create Crew Group"}</DialogTitle>
            <DialogDescription>Name your group and select the team members who belong to it.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Group Name *</Label>
              <Input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="e.g. A Team, Interior Crew"
                data-testid="input-group-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Members</Label>
              {activeMembers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active team members to add.</p>
              ) : (
                <div className="space-y-1 max-h-64 overflow-y-auto border rounded-md p-2">
                  {activeMembers.map(m => (
                    <div
                      key={m.id}
                      className="flex items-center gap-2 p-2 rounded hover:bg-muted/50 cursor-pointer"
                      onClick={() => toggleMember(m.id)}
                      data-testid={`checkbox-group-member-${m.id}`}
                    >
                      <Checkbox checked={selectedMemberIds.includes(m.id)} onCheckedChange={() => toggleMember(m.id)} />
                      <span className="text-sm">{m.name}</span>
                      <Badge variant="secondary" className="text-xs ml-auto">{getRoleLabel(m.role)}</Badge>
                    </div>
                  ))}
                </div>
              )}
              {selectedMemberIds.length > 0 && (
                <p className="text-xs text-muted-foreground">{selectedMemberIds.length} member{selectedMemberIds.length !== 1 ? 's' : ''} selected</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button onClick={handleSaveGroup} disabled={isSaving} data-testid="button-save-group">
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingGroup ? "Update Group" : "Create Group"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingGroup} onOpenChange={(open) => { if (!open) setDeletingGroup(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Crew Group</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingGroup?.name}"? This won't remove the team members themselves.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingGroup && deleteGroupMutation.mutate(deletingGroup.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-group"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function TimeTrackingTab() {
  const { toast } = useToast();
  const [showManualDialog, setShowManualDialog] = useState(false);
  const [manualMemberId, setManualMemberId] = useState("");
  const [manualDate, setManualDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [manualHours, setManualHours] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [clockInMemberId, setClockInMemberId] = useState<number | null>(null);
  const [clockInProjectId, setClockInProjectId] = useState("");
  const [clockInTime, setClockInTime] = useState("");
  const [editingEntryId, setEditingEntryId] = useState<number | null>(null);
  const [editingProjectId, setEditingProjectId] = useState("");
  const [editHoursEntry, setEditHoursEntry] = useState<TimeEntryWithMember | null>(null);
  const [editClockIn, setEditClockIn] = useState("");
  const [editClockOut, setEditClockOut] = useState("");
  const [editReason, setEditReason] = useState("");

  const { data: members = [] } = useQuery<TeamMember[]>({ queryKey: ["/api/team-members"] });
  const { data: timeEntries = [] } = useQuery<TimeEntryWithMember[]>({ queryKey: ["/api/time-entries"] });
  const { data: projects = [] } = useQuery<any[]>({ queryKey: ["/api/projects"] });
  const { data: companySettings, isLoading: settingsLoading } = useQuery<any>({ queryKey: ["/api/settings/company"] });
  const companySlug = companySettings?.bookingSlug || '';
  const hasCompanyName = companySettings?.companyName && companySettings.companyName !== 'My Company';
  const hasCustomDomain = companySettings?.customDomain && companySettings?.customDomainVerified;
  const appDomain = hasCustomDomain ? `https://${companySettings.customDomain}` : window.location.origin;

  const clockInMutation = useMutation({
    mutationFn: (data: { teamMemberId: number; projectId?: number; clockInTime?: string }) => apiRequest("POST", "/api/crew/clock-in", data),
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: ["/api/time-entries"] });
      const prev = queryClient.getQueryData<any[]>(["/api/time-entries"]);
      if (prev) {
        const member = members.find((m: any) => m.id === data.teamMemberId);
        queryClient.setQueryData(["/api/time-entries"], [
          ...prev,
          { id: Date.now(), teamMemberId: data.teamMemberId, projectId: data.projectId || null, clockIn: data.clockInTime || new Date().toISOString(), clockOut: null, totalMinutes: null, notes: null, userId: '', memberName: member?.name || '', memberRole: member?.role || '' },
        ]);
      }
      return { prev };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      setClockInMemberId(null);
      setClockInProjectId("");
      setClockInTime("");
      toast({ title: "Clocked in" });
    },
    onError: (err: any, _vars, context) => {
      if (context?.prev) queryClient.setQueryData(["/api/time-entries"], context.prev);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const clockOutMutation = useMutation({
    mutationFn: (data: { teamMemberId: number }) => apiRequest("POST", "/api/crew/clock-out", data),
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: ["/api/time-entries"] });
      const prev = queryClient.getQueryData<any[]>(["/api/time-entries"]);
      if (prev) {
        queryClient.setQueryData(["/api/time-entries"],
          prev.map((e: any) => e.teamMemberId === data.teamMemberId && !e.clockOut
            ? { ...e, clockOut: new Date().toISOString(), totalMinutes: Math.round((Date.now() - new Date(e.clockIn).getTime()) / 60000) }
            : e
          )
        );
      }
      return { prev };
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] }); toast({ title: "Clocked out" }); },
    onError: (err: any, _vars, context) => {
      if (context?.prev) queryClient.setQueryData(["/api/time-entries"], context.prev);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const [editingOldProjectId, setEditingOldProjectId] = useState<number | null>(null);

  const updateEntryProjectMutation = useMutation({
    mutationFn: (data: { id: number; projectId: number | null }) => apiRequest("PATCH", `/api/time-entries/${data.id}`, { projectId: data.projectId }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      if (variables.projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", variables.projectId.toString(), "job-costing"] });
        queryClient.invalidateQueries({ queryKey: [`/api/time-entries?projectId=${variables.projectId}`] });
      }
      if (editingOldProjectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", editingOldProjectId.toString(), "job-costing"] });
        queryClient.invalidateQueries({ queryKey: [`/api/time-entries?projectId=${editingOldProjectId}`] });
      }
      setEditingEntryId(null);
      setEditingProjectId("");
      setEditingOldProjectId(null);
      toast({ title: "Project updated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const createEntryMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/time-entries", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      toast({ title: "Time entry added" });
      setShowManualDialog(false);
      setManualMemberId(""); setManualHours(""); setManualNotes("");
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteEntryMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/time-entries/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] }); toast({ title: "Time entry removed" }); },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const editHoursMutation = useMutation({
    mutationFn: (data: { id: number; clockIn: string; clockOut: string; editReason: string }) =>
      apiRequest("PATCH", `/api/time-entries/${data.id}`, { clockIn: data.clockIn, clockOut: data.clockOut, editReason: data.editReason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      toast({ title: "Time entry updated" });
      setEditHoursEntry(null);
      setEditReason("");
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  function openEditHoursDialog(entry: TimeEntryWithMember) {
    setEditHoursEntry(entry);
    setEditClockIn(format(new Date(entry.clockIn), "yyyy-MM-dd'T'HH:mm"));
    setEditClockOut(entry.clockOut ? format(new Date(entry.clockOut), "yyyy-MM-dd'T'HH:mm") : "");
    setEditReason("");
  }

  function handleEditHoursSubmit() {
    if (!editHoursEntry || !editClockIn || !editClockOut) {
      toast({ title: "Clock in and clock out times are required", variant: "destructive" });
      return;
    }
    if (!editReason.trim()) {
      toast({ title: "Please provide a reason for this edit", variant: "destructive" });
      return;
    }
    const ci = new Date(editClockIn);
    const co = new Date(editClockOut);
    if (co <= ci) {
      toast({ title: "Clock out must be after clock in", variant: "destructive" });
      return;
    }
    editHoursMutation.mutate({ id: editHoursEntry.id, clockIn: ci.toISOString(), clockOut: co.toISOString(), editReason: editReason.trim() });
  }

  const crewMembers = members.filter(m => ["crew", "lead", "helper", "mechanic"].includes(m.role));
  const activeEntries = timeEntries.filter(e => !e.clockOut);
  const recentEntries = timeEntries.filter(e => e.clockOut).slice(0, 20);
  const activeProjects = projects.filter((p: any) => ["accepted", "scheduled", "in_progress"].includes(p.stage) && !p.archived);

  function isClocked(memberId: number) { return activeEntries.some(e => e.teamMemberId === memberId); }
  function getActiveEntry(memberId: number) { return activeEntries.find(e => e.teamMemberId === memberId); }
  function getProjectTitle(projectId: number | null | undefined) {
    if (!projectId) return null;
    const proj = projects.find((p: any) => p.id === projectId);
    return proj ? (proj.title || `Project #${proj.projectNumber}`) : null;
  }

  function handleManualSubmit() {
    if (!manualMemberId || !manualHours) {
      toast({ title: "Please fill in all required fields", variant: "destructive" });
      return;
    }
    const hours = parseFloat(manualHours);
    if (isNaN(hours) || hours <= 0) {
      toast({ title: "Invalid hours", variant: "destructive" });
      return;
    }
    const clockIn = new Date(`${manualDate}T08:00:00`);
    const clockOut = new Date(clockIn.getTime() + hours * 60 * 60 * 1000);
    createEntryMutation.mutate({
      teamMemberId: parseInt(manualMemberId),
      projectId: selectedProjectId && selectedProjectId !== "none" ? parseInt(selectedProjectId) : null,
      clockIn: clockIn.toISOString(),
      clockOut: clockOut.toISOString(),
      totalMinutes: Math.round(hours * 60),
      notes: manualNotes || null,
    });
  }

  const clockUrl = hasCustomDomain
    ? `${appDomain}/crew-clock`
    : companySlug ? `${appDomain}/${companySlug}/crew-clock` : null;

  async function copyClockLink() {
    if (clockUrl) {
      const { copyToClipboard } = await import("@/lib/clipboard");
      const ok = await copyToClipboard(clockUrl);
      toast({ title: ok ? "Link copied to clipboard" : "Could not copy link", description: ok ? undefined : clockUrl, variant: ok ? "default" : "destructive" });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-2 flex-wrap">
        <Button onClick={() => setShowManualDialog(true)} data-testid="button-add-manual-entry">
          <Plus className="w-4 h-4 mr-2" />
          Manual Entry
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Link className="w-5 h-5" />
            Crew Clock Link
          </CardTitle>
          <CardDescription>
            Share this link with your crew so they can clock in and out using their PIN. No login needed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {settingsLoading ? (
            <div className="flex items-center gap-2 py-2">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Loading...</span>
            </div>
          ) : !hasCompanyName && !companySlug ? (
            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md" data-testid="banner-setup-company-crew">
              <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-700 dark:text-amber-300">Set up your company profile first</p>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  Your crew clock link is based on your company name. Go to Company Profile in Settings to set it up.
                </p>
              </div>
            </div>
          ) : clockUrl ? (
            <div className="space-y-3">
              <Label className="text-xs text-muted-foreground">Your Crew Clock URL</Label>
              <div className="p-3 bg-muted rounded-md font-mono text-sm break-all select-all" data-testid="text-crew-clock-url">
                {clockUrl}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={copyClockLink} data-testid="button-copy-clock-link">
                  <Copy className="w-4 h-4 mr-2" />
                  Copy Link
                </Button>
                <Button variant="outline" size="sm" onClick={() => window.open(`/${companySlug}/crew-clock`, "_blank")} data-testid="button-open-clock-link">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Open
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md">
              <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-700 dark:text-amber-300">Generate your booking URL first</p>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  Your crew clock link uses your company URL. Go to Company Profile and generate your booking URL to enable this feature.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Clock className="w-5 h-5" />
            Clock In / Out
          </CardTitle>
          <CardDescription>Tap to clock team members in or out. Active members show in green.</CardDescription>
        </CardHeader>
        <CardContent>
          {crewMembers.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-2">No team members added yet. Add them in the Members tab.</p>
          ) : (
            <div className="space-y-2">
              {crewMembers.map((member) => {
                const active = isClocked(member.id);
                const activeEntry = getActiveEntry(member.id);
                const elapsed = activeEntry ? Math.round((Date.now() - new Date(activeEntry.clockIn).getTime()) / 60000) : 0;
                const elapsedHrs = Math.floor(elapsed / 60);
                const elapsedMins = elapsed % 60;
                return (
                  <div key={member.id} className={`flex items-center justify-between gap-3 p-3 rounded-md border flex-wrap ${active ? "border-green-500/50 bg-green-50 dark:bg-green-950/20" : ""}`} data-testid={`clock-member-${member.id}`}>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{member.name}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <Badge variant="secondary" className="text-xs">{member.role === "lead" ? "Lead" : "Crew"}</Badge>
                        {member.hourlyRate != null && member.hourlyRate > 0 && <span className="text-xs text-muted-foreground">${(member.hourlyRate / 100).toFixed(2)}/hr</span>}
                        {active && <span className="text-xs font-medium text-green-700 dark:text-green-400">Active: {elapsedHrs}h {elapsedMins}m</span>}
                        {active && activeEntry?.projectId && (
                          <Badge variant="outline" className="text-[10px]">
                            <FolderOpen className="w-3 h-3 mr-1" />
                            {getProjectTitle(activeEntry.projectId) || "Project"}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Button
                      variant={active ? "destructive" : "default"}
                      size="sm"
                      onClick={() => {
                        if (active) clockOutMutation.mutate({ teamMemberId: member.id });
                        else {
                          setClockInMemberId(member.id);
                          setClockInProjectId("");
                        }
                      }}
                      disabled={clockInMutation.isPending || clockOutMutation.isPending}
                      data-testid={active ? `button-clock-out-${member.id}` : `button-clock-in-${member.id}`}
                    >
                      {active ? (<><Square className="w-3.5 h-3.5 mr-1" />Clock Out</>) : (<><Play className="w-3.5 h-3.5 mr-1" />Clock In</>)}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg"><Users className="w-5 h-5" />Recent Time Entries</CardTitle>
          <CardDescription>Completed time entries from your crew</CardDescription>
        </CardHeader>
        <CardContent>
          {recentEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-2">No completed time entries yet</p>
          ) : (
            <div className="space-y-2">
              {recentEntries.map((entry) => {
                const hours = entry.totalMinutes ? (entry.totalMinutes / 60).toFixed(1) : "-";
                const cost = entry.totalMinutes && entry.teamMember?.hourlyRate
                  ? ((entry.totalMinutes / 60) * entry.teamMember.hourlyRate / 100).toFixed(2) : null;
                const projectTitle = getProjectTitle(entry.projectId);
                return (
                  <div key={entry.id} className="flex items-center justify-between gap-3 p-3 rounded-md border flex-wrap" data-testid={`time-entry-${entry.id}`}>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{entry.teamMember?.name || "Unknown"}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        <span>{format(new Date(entry.clockIn), "MMM d, yyyy")}</span>
                        <span>{format(new Date(entry.clockIn), "h:mm a")} - {entry.clockOut ? format(new Date(entry.clockOut), "h:mm a") : "--"}</span>
                        <span className="font-medium">{hours}h</span>
                        {cost && <span className="text-green-700 dark:text-green-400">${cost}</span>}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        {projectTitle ? (
                          <Badge variant="secondary" className="text-[10px]" data-testid={`badge-project-${entry.id}`}>
                            <FolderOpen className="w-3 h-3 mr-1" />
                            {projectTitle}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-700" data-testid={`badge-no-project-${entry.id}`}>
                            No project linked
                          </Badge>
                        )}
                        <button
                          className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline"
                          onClick={() => {
                            setEditingEntryId(entry.id);
                            setEditingProjectId(entry.projectId ? entry.projectId.toString() : "none");
                            setEditingOldProjectId(entry.projectId || null);
                          }}
                          data-testid={`button-edit-project-${entry.id}`}
                        >
                          {projectTitle ? "Change" : "Assign"}
                        </button>
                      </div>
                      {entry.notes && <p className="text-xs text-muted-foreground mt-1">{entry.notes}</p>}
                      {(entry as any).editedAt && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="inline-flex items-center gap-1 mt-1 text-xs text-amber-600 dark:text-amber-400" data-testid={`badge-edited-${entry.id}`}>
                                <AlertCircle className="w-3 h-3" />
                                Edited {format(new Date((entry as any).editedAt), "MMM d 'at' h:mm a")}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-xs">
                              <p className="text-xs font-medium">Reason: {(entry as any).editReason || "No reason provided"}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEditHoursDialog(entry)} data-testid={`button-edit-hours-${entry.id}`}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteEntryMutation.mutate(entry.id)} data-testid={`button-delete-entry-${entry.id}`}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showManualDialog} onOpenChange={setShowManualDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Manual Time Entry</DialogTitle>
            <DialogDescription>Record hours worked by a team member</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Team Member *</Label>
              <Select value={manualMemberId} onValueChange={setManualMemberId}>
                <SelectTrigger data-testid="select-manual-member"><SelectValue placeholder="Select team member" /></SelectTrigger>
                <SelectContent>
                  {crewMembers.map(m => (<SelectItem key={m.id} value={m.id.toString()}>{m.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Project (optional)</Label>
              <ProjectPicker
                projects={projects}
                value={selectedProjectId}
                onValueChange={setSelectedProjectId}
                placeholder="Select project"
                data-testid="select-manual-project"
              />
            </div>
            <div className="space-y-2">
              <Label>Date *</Label>
              <Input type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} data-testid="input-manual-date" />
            </div>
            <div className="space-y-2">
              <Label>Hours Worked *</Label>
              <Input type="number" step="0.5" min="0.5" value={manualHours} onChange={(e) => setManualHours(e.target.value)} placeholder="8" data-testid="input-manual-hours" />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input value={manualNotes} onChange={(e) => setManualNotes(e.target.value)} placeholder="Optional notes" data-testid="input-manual-notes" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowManualDialog(false)}>Cancel</Button>
            <Button onClick={handleManualSubmit} disabled={createEntryMutation.isPending} data-testid="button-save-time-entry">
              {createEntryMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Add Entry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={clockInMemberId !== null} onOpenChange={(open) => { if (!open) { setClockInMemberId(null); setClockInProjectId(""); setClockInTime(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Clock In — Select Project</DialogTitle>
            <DialogDescription>Which project is this team member working on?</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Project</Label>
              <ProjectPicker
                projects={activeProjects}
                value={clockInProjectId}
                onValueChange={setClockInProjectId}
                placeholder="Select project"
                data-testid="select-clockin-project"
              />
            </div>
            <div className="space-y-2">
              <Label>Start Time</Label>
              <Input
                type="time"
                value={clockInTime}
                onChange={(e) => setClockInTime(e.target.value)}
                placeholder="Leave blank for now"
                data-testid="input-clockin-time"
              />
              <p className="text-xs text-muted-foreground">Leave blank to use the current time</p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setClockInMemberId(null); setClockInProjectId(""); setClockInTime(""); }}>Cancel</Button>
            <Button
              onClick={() => {
                if (clockInMemberId) {
                  let clockInTimeISO: string | undefined;
                  if (clockInTime) {
                    const [h, m] = clockInTime.split(':').map(Number);
                    const d = new Date();
                    d.setHours(h, m, 0, 0);
                    clockInTimeISO = d.toISOString();
                  }
                  clockInMutation.mutate({
                    teamMemberId: clockInMemberId,
                    projectId: clockInProjectId && clockInProjectId !== "none" ? parseInt(clockInProjectId) : undefined,
                    clockInTime: clockInTimeISO,
                  });
                }
              }}
              disabled={clockInMutation.isPending}
              data-testid="button-confirm-clock-in"
            >
              {clockInMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Clock In
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editingEntryId !== null} onOpenChange={(open) => { if (!open) { setEditingEntryId(null); setEditingProjectId(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assign to Project</DialogTitle>
            <DialogDescription>Link this time entry to a project so the hours show in job costing.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Project</Label>
              <ProjectPicker
                projects={projects}
                value={editingProjectId}
                onValueChange={setEditingProjectId}
                placeholder="Select project"
                noneLabel="No project"
                data-testid="select-edit-project"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setEditingEntryId(null); setEditingProjectId(""); }}>Cancel</Button>
            <Button
              onClick={() => {
                if (editingEntryId) {
                  updateEntryProjectMutation.mutate({
                    id: editingEntryId,
                    projectId: editingProjectId && editingProjectId !== "none" ? parseInt(editingProjectId) : null,
                  });
                }
              }}
              disabled={updateEntryProjectMutation.isPending}
              data-testid="button-save-project-assignment"
            >
              {updateEntryProjectMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editHoursEntry} onOpenChange={(open) => { if (!open) setEditHoursEntry(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Time Entry</DialogTitle>
            <DialogDescription>
              {editHoursEntry?.teamMember?.name ? `Editing hours for ${editHoursEntry.teamMember.name}` : "Adjust clock in/out times"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Clock In *</Label>
              <Input type="datetime-local" value={editClockIn} onChange={(e) => setEditClockIn(e.target.value)} data-testid="input-edit-clock-in" />
            </div>
            <div className="space-y-2">
              <Label>Clock Out *</Label>
              <Input type="datetime-local" value={editClockOut} onChange={(e) => setEditClockOut(e.target.value)} data-testid="input-edit-clock-out" />
            </div>
            {editClockIn && editClockOut && new Date(editClockOut) > new Date(editClockIn) && (
              <div className="text-sm text-muted-foreground bg-muted/50 rounded-md p-2">
                Total: {((new Date(editClockOut).getTime() - new Date(editClockIn).getTime()) / 3600000).toFixed(1)} hours
              </div>
            )}
            <div className="space-y-2">
              <Label>Reason for Edit *</Label>
              <Textarea value={editReason} onChange={(e) => setEditReason(e.target.value)} placeholder="Explain why this entry is being changed..." rows={3} data-testid="input-edit-reason" />
              <p className="text-xs text-muted-foreground">The team member will see this note on their time entry.</p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditHoursEntry(null)}>Cancel</Button>
            <Button onClick={handleEditHoursSubmit} disabled={editHoursMutation.isPending} data-testid="button-save-edit-hours">
              {editHoursMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PayrollTab() {
  const { toast } = useToast();
  const [weekOffset, setWeekOffset] = useState(0);
  const [expandedMembers, setExpandedMembers] = useState<Set<number>>(new Set());
  const [assignEntryId, setAssignEntryId] = useState<number | null>(null);
  const [assignProjectId, setAssignProjectId] = useState("");

  const currentDate = useMemo(() => addWeeks(new Date(), weekOffset), [weekOffset]);
  const weekStart = useMemo(() => startOfWeek(currentDate, { weekStartsOn: 1 }), [currentDate]);
  const weekEnd = useMemo(() => endOfWeek(currentDate, { weekStartsOn: 1 }), [currentDate]);

  const startStr = format(weekStart, "yyyy-MM-dd");
  const endStr = format(weekEnd, "yyyy-MM-dd");

  const { data: payroll, isLoading } = useQuery<PayrollReport>({
    queryKey: [`/api/payroll?startDate=${startStr}&endDate=${endStr}`],
  });

  const { data: projects = [] } = useQuery<any[]>({ queryKey: ["/api/projects"] });

  const assignProjectMutation = useMutation({
    mutationFn: (data: { id: number; projectId: number | null }) =>
      apiRequest("PATCH", `/api/time-entries/${data.id}`, { projectId: data.projectId }),
    onSuccess: () => {
      toast({ title: "Project assigned" });
      queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0] || "").startsWith("/api/payroll") });
      queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0] || "").startsWith("/api/time-entries") });
      setAssignEntryId(null);
      setAssignProjectId("");
    },
    onError: (error: any) => {
      toast({ title: "Failed to assign project", description: error.message, variant: "destructive" });
    },
  });

  function toggleExpand(memberId: number) {
    setExpandedMembers(prev => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <CalendarDays className="w-5 h-5" />
                Payroll Report
              </CardTitle>
              <CardDescription>
                Weekly breakdown of crew hours and pay
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setWeekOffset(w => w - 1)} data-testid="button-prev-week">
                Previous
              </Button>
              <span className="text-sm font-medium min-w-[180px] text-center" data-testid="text-payroll-week">
                {format(weekStart, "MMM d")} - {format(weekEnd, "MMM d, yyyy")}
              </span>
              <Button variant="outline" size="sm" onClick={() => setWeekOffset(w => w + 1)} disabled={weekOffset >= 0} data-testid="button-next-week">
                Next
              </Button>
              {weekOffset !== 0 && (
                <Button variant="ghost" size="sm" onClick={() => setWeekOffset(0)} data-testid="button-current-week">
                  This Week
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading && !payroll ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : !payroll || payroll.report.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-4 text-center">No time entries for this week</p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2 sm:gap-4">
                <Card>
                  <CardContent className="p-3 sm:p-4 text-center">
                    <p className="text-[10px] sm:text-xs text-muted-foreground">Total Hours</p>
                    <p className="text-lg sm:text-2xl font-bold" data-testid="text-payroll-total-hours">{(payroll.grandTotalMinutes / 60).toFixed(1)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 sm:p-4 text-center">
                    <p className="text-[10px] sm:text-xs text-muted-foreground">Total Pay</p>
                    <p className="text-base sm:text-2xl font-bold text-green-700 dark:text-green-400" data-testid="text-payroll-total-cost">
                      {(payroll.grandTotalCost / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 sm:p-4 text-center">
                    <p className="text-[10px] sm:text-xs text-muted-foreground">Workers</p>
                    <p className="text-lg sm:text-2xl font-bold" data-testid="text-payroll-worker-count">{payroll.report.length}</p>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-2">
                {payroll.report.map((member) => {
                  const isExpanded = expandedMembers.has(member.memberId);
                  const hours = (member.totalMinutes / 60).toFixed(1);
                  const pay = (member.totalCost / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
                  const rate = member.hourlyRate > 0 ? `$${(member.hourlyRate / 100).toFixed(2)}/hr` : "No rate";

                  return (
                    <Card key={member.memberId}>
                      <div
                        className="flex items-center justify-between gap-3 p-4 cursor-pointer hover-elevate rounded-md"
                        onClick={() => toggleExpand(member.memberId)}
                        data-testid={`payroll-member-${member.memberId}`}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="flex items-center">
                            {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{member.memberName}</p>
                            <p className="text-xs text-muted-foreground">{rate}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-right">
                          <div>
                            <p className="text-sm font-medium">{hours}h</p>
                            <p className="text-xs text-muted-foreground">{member.entries.length} entries</p>
                          </div>
                          <div>
                            <p className="text-sm font-bold text-green-700 dark:text-green-400" data-testid={`text-payroll-pay-${member.memberId}`}>{pay}</p>
                          </div>
                        </div>
                      </div>
                      {isExpanded && member.entries.length > 0 && (
                        <div className="border-t px-4 pb-3 pt-2 space-y-2">
                          {member.entries.map((entry) => (
                            <div key={entry.id} className="rounded-lg border bg-muted/30 p-3 space-y-1.5" data-testid={`payroll-entry-${entry.id}`}>
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <Calendar className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                                  <span className="text-sm font-medium">{format(new Date(entry.clockIn), "EEE, MMM d")}</span>
                                </div>
                                <div className="flex items-center gap-3 text-sm">
                                  <span className="text-muted-foreground">{(entry.totalMinutes / 60).toFixed(1)}h</span>
                                  <span className="font-medium">${(entry.cost / 100).toFixed(2)}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Clock className="w-3 h-3 flex-shrink-0" />
                                <span>{format(new Date(entry.clockIn), "h:mm a")} - {format(new Date(entry.clockOut), "h:mm a")}</span>
                                {(entry.clockInLat || entry.clockOutLat) && (
                                  <div className="flex items-center gap-1.5 ml-1">
                                    {entry.clockInLat && entry.clockInLng && (
                                      <a href={`https://www.google.com/maps?q=${entry.clockInLat},${entry.clockInLng}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-blue-600 dark:text-blue-400 hover:underline" data-testid={`link-payroll-clockin-gps-${entry.id}`}>
                                        <MapPin className="w-2.5 h-2.5" />In
                                      </a>
                                    )}
                                    {entry.clockOutLat && entry.clockOutLng && (
                                      <a href={`https://www.google.com/maps?q=${entry.clockOutLat},${entry.clockOutLng}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-blue-600 dark:text-blue-400 hover:underline" data-testid={`link-payroll-clockout-gps-${entry.id}`}>
                                        <MapPin className="w-2.5 h-2.5" />Out
                                      </a>
                                    )}
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-xs">
                                <Briefcase className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                                {entry.projectTitle ? (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setAssignEntryId(entry.id);
                                      setAssignProjectId(entry.projectId ? entry.projectId.toString() : "none");
                                    }}
                                    className="text-muted-foreground hover:text-foreground hover:underline transition-colors truncate text-left"
                                    data-testid={`button-change-project-${entry.id}`}
                                  >
                                    {entry.projectTitle}
                                  </button>
                                ) : (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setAssignEntryId(entry.id);
                                      setAssignProjectId("");
                                    }}
                                    className="text-amber-500 hover:text-amber-600 dark:hover:text-amber-400 hover:underline transition-colors font-medium"
                                    data-testid={`button-assign-project-${entry.id}`}
                                  >
                                    No project — tap to assign
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={assignEntryId !== null} onOpenChange={(open) => { if (!open) { setAssignEntryId(null); setAssignProjectId(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assign to Project</DialogTitle>
            <DialogDescription>Link this time entry to a project so the hours show in job costing.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Project</Label>
              <Select value={assignProjectId} onValueChange={setAssignProjectId}>
                <SelectTrigger data-testid="select-payroll-project"><SelectValue placeholder="Select project" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No project</SelectItem>
                  {projects.map((p: any) => (
                    <SelectItem key={p.id} value={p.id.toString()}>{p.title || `Project #${p.projectNumber}`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setAssignEntryId(null); setAssignProjectId(""); }}>Cancel</Button>
            <Button
              onClick={() => {
                if (assignEntryId) {
                  assignProjectMutation.mutate({
                    id: assignEntryId,
                    projectId: assignProjectId && assignProjectId !== "none" ? parseInt(assignProjectId) : null,
                  });
                }
              }}
              disabled={assignProjectMutation.isPending || !assignProjectId}
              data-testid="button-save-payroll-project"
            >
              {assignProjectMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WorkOrderDefaultsTab() {
  const { toast } = useToast();

  const { data: settings, isLoading } = useQuery<any>({
    queryKey: ['/api/work-order-settings'],
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PUT", "/api/work-order-settings", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/work-order-settings'] });
      toast({ title: "Work order defaults saved" });
    },
    onError: () => {
      toast({ title: "Failed to save settings", variant: "destructive" });
    },
  });

  if (isLoading && !settings) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const s = settings || {};

  const visibilityFields = [
    { key: 'showCustomerName', label: 'Customer Name', icon: UserIcon },
    { key: 'showCustomerPhone', label: 'Customer Phone', icon: Phone },
    { key: 'showCustomerEmail', label: 'Customer Email', icon: Mail },
    { key: 'showJobAddress', label: 'Job Address', icon: MapPin },
    { key: 'showLineItems', label: 'Line Items / Scope of Work', icon: FileText },
    { key: 'showNotes', label: 'Proposal Notes', icon: FileText },
    { key: 'showScheduledDates', label: 'Scheduled Dates', icon: Calendar },
    { key: 'showProjectDescription', label: 'Project Description', icon: ClipboardList },
  ];

  return (
    <div className="space-y-6 max-w-lg">
      <Card>
        <CardContent className="p-5">
          <h3 className="font-semibold mb-1">Work Order Defaults</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Set the default visibility and auto-send settings for all new work orders. Individual projects can override these.
          </p>

          <div className="space-y-5">
            <div>
              <h4 className="text-sm font-medium mb-3">Information Visible to Crew</h4>
              <div className="space-y-3">
                {visibilityFields.map(field => (
                  <div key={field.key} className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm">
                      <field.icon className="w-4 h-4 text-muted-foreground" />
                      {field.label}
                    </div>
                    <Switch
                      checked={s[field.key] ?? true}
                      onCheckedChange={(checked) => updateMutation.mutate({ [field.key]: checked })}
                      data-testid={`default-switch-${field.key}`}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t pt-5">
              <h4 className="text-sm font-medium mb-3">Auto-Send</h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm">Enable auto-send</div>
                  <Switch
                    checked={s.autoSendEnabled ?? false}
                    onCheckedChange={(checked) => updateMutation.mutate({ autoSendEnabled: checked })}
                    data-testid="default-switch-autoSendEnabled"
                  />
                </div>

                {s.autoSendEnabled && (
                  <>
                    <div>
                      <Label className="text-xs">When to send</Label>
                      <Select
                        value={s.autoSendTiming || 'on_acceptance'}
                        onValueChange={(v) => updateMutation.mutate({ autoSendTiming: v })}
                      >
                        <SelectTrigger data-testid="default-select-timing">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="on_acceptance">On proposal acceptance</SelectItem>
                          <SelectItem value="days_before">Days before project start</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {s.autoSendTiming === 'days_before' && (
                      <div>
                        <Label className="text-xs">Days before start</Label>
                        <Select
                          value={String(s.autoSendDaysBefore || 1)}
                          onValueChange={(v) => updateMutation.mutate({ autoSendDaysBefore: parseInt(v) })}
                        >
                          <SelectTrigger data-testid="default-select-days">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">1 day</SelectItem>
                            <SelectItem value="2">2 days</SelectItem>
                            <SelectItem value="3">3 days</SelectItem>
                            <SelectItem value="7">1 week</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <div>
                      <Label className="text-xs">Send to roles</Label>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {['crew', 'lead', 'helper', 'sales'].map(role => {
                          const currentRoles = s.autoSendToRoles || ['crew', 'lead'];
                          const selected = currentRoles.includes(role);
                          return (
                            <Badge
                              key={role}
                              variant={selected ? 'default' : 'outline'}
                              className="cursor-pointer capitalize"
                              onClick={() => {
                                const updated = selected
                                  ? currentRoles.filter((r: string) => r !== role)
                                  : [...currentRoles, role];
                                updateMutation.mutate({ autoSendToRoles: updated });
                              }}
                              data-testid={`default-badge-role-${role}`}
                            >
                              {role}
                            </Badge>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="text-sm">Send day-before reminder</div>
                      <Switch
                        checked={s.sendReminderEnabled ?? false}
                        onCheckedChange={(checked) => updateMutation.mutate({ sendReminderEnabled: checked })}
                        data-testid="default-switch-reminder"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SuppliersTab() {
  const { toast } = useToast();
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [deleting, setDeleting] = useState<Supplier | null>(null);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formNotes, setFormNotes] = useState('');

  const { data: suppliersList = [], isLoading } = useQuery<Supplier[]>({
    queryKey: ['/api/suppliers'],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; phone: string; email: string; notes: string }) => {
      const res = await apiRequest('POST', '/api/suppliers', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/suppliers'] });
      toast({ title: 'Supplier added' });
      closeDialog();
    },
    onError: (err: any) => toast({ title: err.message || 'Failed to add', variant: 'destructive' }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest('PATCH', `/api/suppliers/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/suppliers'] });
      toast({ title: 'Supplier updated' });
      closeDialog();
    },
    onError: (err: any) => toast({ title: err.message || 'Failed to update', variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('DELETE', `/api/suppliers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/suppliers'] });
      toast({ title: 'Supplier removed' });
      setDeleting(null);
    },
    onError: (err: any) => toast({ title: err.message || 'Failed to delete', variant: 'destructive' }),
  });

  function openAdd() {
    setEditing(null);
    setFormName('');
    setFormPhone('');
    setFormEmail('');
    setFormNotes('');
    setShowDialog(true);
  }

  function openEdit(s: Supplier) {
    setEditing(s);
    setFormName(s.name);
    setFormPhone(s.phone || '');
    setFormEmail(s.email || '');
    setFormNotes(s.notes || '');
    setShowDialog(true);
  }

  function closeDialog() {
    setShowDialog(false);
    setEditing(null);
  }

  function handleSave() {
    if (!formName.trim()) {
      toast({ title: 'Name is required', variant: 'destructive' });
      return;
    }
    const data = { name: formName.trim(), phone: formPhone.trim(), email: formEmail.trim(), notes: formNotes.trim() };
    if (editing) {
      updateMutation.mutate({ id: editing.id, data });
    } else {
      createMutation.mutate(data);
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold" data-testid="text-suppliers-title">Suppliers</h3>
          <p className="text-sm text-muted-foreground">Paint stores and material suppliers</p>
        </div>
        <Button size="sm" onClick={openAdd} data-testid="button-add-supplier">
          <Plus className="w-4 h-4 mr-1.5" />
          Add Supplier
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : suppliersList.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Store className="w-10 h-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground text-sm">No suppliers yet</p>
            <p className="text-muted-foreground text-xs mt-1">Add your paint stores so you can quickly send them orders</p>
            <Button size="sm" variant="outline" className="mt-4" onClick={openAdd} data-testid="button-add-supplier-empty">
              <Plus className="w-4 h-4 mr-1.5" />
              Add Your First Supplier
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {suppliersList.map((s) => (
            <Card key={s.id} data-testid={`card-supplier-${s.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Store className="w-4 h-4 text-primary shrink-0" />
                      <h4 className="font-medium truncate" data-testid={`text-supplier-name-${s.id}`}>{s.name}</h4>
                    </div>
                    <div className="mt-2 space-y-1">
                      {s.phone && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Phone className="w-3.5 h-3.5" />
                          <span data-testid={`text-supplier-phone-${s.id}`}>{formatPhoneDisplay(s.phone)}</span>
                        </div>
                      )}
                      {s.email && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Mail className="w-3.5 h-3.5" />
                          <span data-testid={`text-supplier-email-${s.id}`}>{s.email}</span>
                        </div>
                      )}
                      {s.notes && (
                        <p className="text-xs text-muted-foreground mt-1.5 pl-5.5" data-testid={`text-supplier-notes-${s.id}`}>{s.notes}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0 ml-2">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(s)} data-testid={`button-edit-supplier-${s.id}`}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setDeleting(s)} data-testid={`button-delete-supplier-${s.id}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={(o) => { if (!o) closeDialog(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Supplier' : 'Add Supplier'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Update supplier details' : 'Add a new paint store or material supplier'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                placeholder="e.g. Sherwin-Williams Downtown"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                data-testid="input-supplier-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input
                placeholder="(555) 123-4567"
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                data-testid="input-supplier-phone"
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                placeholder="orders@store.com"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                data-testid="input-supplier-email"
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                placeholder="e.g. Benjamin Moore dealer, ask for contractor discount"
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                rows={2}
                data-testid="input-supplier-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} data-testid="button-cancel-supplier">Cancel</Button>
            <Button onClick={handleSave} disabled={isPending} data-testid="button-save-supplier">
              {isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              {editing ? 'Save Changes' : 'Add Supplier'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => { if (!o) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Supplier</AlertDialogTitle>
            <AlertDialogDescription>
              Remove "{deleting?.name}" from your suppliers? This won't affect any existing paint orders.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-supplier">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleting && deleteMutation.mutate(deleting.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-supplier"
            >
              {deleteMutation.isPending ? 'Removing...' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
