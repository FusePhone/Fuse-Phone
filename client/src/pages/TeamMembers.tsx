import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { formatPhoneDisplay } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type { TeamMember } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Users, HardHat, Star, DollarSign, Phone, Mail, Loader2, Clock } from "lucide-react";

const ROLE_CONFIG = {
  crew: { label: "Team Member", icon: HardHat, color: "bg-blue-500/10 text-blue-700 dark:text-blue-400" },
  lead: { label: "Lead", icon: Star, color: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  sales: { label: "Sales", icon: DollarSign, color: "bg-green-500/10 text-green-700 dark:text-green-400" },
};

type Role = keyof typeof ROLE_CONFIG;

export default function TeamMembers() {
  const { toast } = useToast();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [deletingMember, setDeletingMember] = useState<TeamMember | null>(null);
  const [formName, setFormName] = useState("");
  const [formRole, setFormRole] = useState<Role>("crew");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formHourlyRate, setFormHourlyRate] = useState("");
  const [formPin, setFormPin] = useState("");

  const { data: members = [], isLoading } = useQuery<TeamMember[]>({
    queryKey: ["/api/team-members"],
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; role: string; phone?: string; email?: string }) =>
      apiRequest("POST", "/api/team-members", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team-members"] });
      toast({ title: "Team member added" });
      resetForm();
      setShowAddDialog(false);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: number; name: string; role: string; phone?: string; email?: string }) =>
      apiRequest("PATCH", `/api/team-members/${id}`, data),
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

  function resetForm() {
    setFormName("");
    setFormRole("crew");
    setFormPhone("");
    setFormEmail("");
    setFormHourlyRate("");
    setFormPin("");
  }

  function openEdit(member: TeamMember) {
    setFormName(member.name);
    setFormRole(member.role as Role);
    setFormPhone(member.phone || "");
    setFormEmail(member.email || "");
    setFormHourlyRate(member.hourlyRate ? (member.hourlyRate / 100).toString() : "");
    setFormPin(member.pin || "");
    setEditingMember(member);
  }

  function handleSubmit() {
    if (!formName.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    const hourlyRateCents = formHourlyRate ? Math.round(parseFloat(formHourlyRate) * 100) : null;
    const data: any = {
      name: formName.trim(),
      role: formRole,
      phone: formPhone.trim() || undefined,
      email: formEmail.trim() || undefined,
      hourlyRate: hourlyRateCents,
      pin: formPin.trim() || null,
    };
    if (editingMember) {
      updateMutation.mutate({ id: editingMember.id, ...data });
    } else {
      createMutation.mutate(data);
    }
  }

  const crewMembers = members.filter((m) => m.role === "crew");
  const leadMembers = members.filter((m) => m.role === "lead");
  const salesMembers = members.filter((m) => m.role === "sales");

  const isFormPending = createMutation.isPending || updateMutation.isPending;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-team-title">Team Members</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage your crew, leads, and sales team. These names become available as tags in your message templates.
          </p>
        </div>
        <Button onClick={() => { resetForm(); setShowAddDialog(true); }} data-testid="button-add-team-member">
          <Plus className="w-4 h-4 mr-2" />
          Add Member
        </Button>
      </div>

      {members.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-1">No team members yet</h3>
            <p className="text-muted-foreground text-sm mb-4">Add your team members, leads, and sales people to use them in templates.</p>
            <Button onClick={() => { resetForm(); setShowAddDialog(true); }} data-testid="button-add-first-member">
              <Plus className="w-4 h-4 mr-2" />
              Add Your First Team Member
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {[
            { title: "Leads", desc: "Experienced team members who lead jobs", members: leadMembers, role: "lead" as Role },
            { title: "Team Members", desc: "Workers and painters on your team", members: crewMembers, role: "crew" as Role },
            { title: "Sales", desc: "Team members handling sales and proposals", members: salesMembers, role: "sales" as Role },
          ].map(({ title, desc, members: roleMembers, role }) => (
            <Card key={role}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      {ROLE_CONFIG[role].icon && (() => { const Icon = ROLE_CONFIG[role].icon; return <Icon className="w-5 h-5" />; })()}
                      {title}
                      <Badge variant="secondary" className="ml-1">{roleMembers.length}</Badge>
                    </CardTitle>
                    <CardDescription>{desc}</CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { resetForm(); setFormRole(role); setShowAddDialog(true); }}
                    data-testid={`button-add-${role}`}
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Add
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {roleMembers.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic py-2">No {title.toLowerCase()} added yet</p>
                ) : (
                  <div className="space-y-2">
                    {roleMembers.map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center justify-between gap-3 p-3 rounded-md border flex-wrap"
                        data-testid={`team-member-${member.id}`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate" data-testid={`text-member-name-${member.id}`}>{member.name}</p>
                          <div className="flex items-center gap-3 mt-1 flex-wrap">
                            {member.phone && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Phone className="w-3 h-3" />
                                {formatPhoneDisplay(member.phone)}
                              </span>
                            )}
                            {member.email && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Mail className="w-3 h-3" />
                                {member.email}
                              </span>
                            )}
                            {member.hourlyRate != null && member.hourlyRate > 0 && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1" data-testid={`text-rate-${member.id}`}>
                                <DollarSign className="w-3 h-3" />
                                ${(member.hourlyRate / 100).toFixed(2)}/hr
                              </span>
                            )}
                            {member.pin && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1" data-testid={`text-pin-${member.id}`}>
                                <Clock className="w-3 h-3" />
                                PIN set
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEdit(member)}
                            data-testid={`button-edit-member-${member.id}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeletingMember(member)}
                            data-testid={`button-delete-member-${member.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Template Tags</CardTitle>
          <CardDescription>
            Use these tags in your message templates to automatically insert team member names.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[
              { tag: "{{crew_lead}}", desc: "Name of the lead assigned to the job" },
              { tag: "{{sales_rep}}", desc: "Name of the sales person on the job" },
              { tag: "{{crew_member}}", desc: "Name of a crew member on the job" },
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingMember ? "Edit Team Member" : "Add Team Member"}</DialogTitle>
            <DialogDescription>
              {editingMember ? "Update this team member's information." : "Add a new member to your team."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Full name"
                data-testid="input-member-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Role *</Label>
              <Select value={formRole} onValueChange={(v) => setFormRole(v as Role)}>
                <SelectTrigger data-testid="select-member-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lead">Lead</SelectItem>
                  <SelectItem value="crew">Crew Member</SelectItem>
                  <SelectItem value="sales">Sales</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                placeholder="(555) 123-4567"
                data-testid="input-member-phone"
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                placeholder="name@example.com"
                data-testid="input-member-email"
              />
            </div>
            <div className="space-y-2">
              <Label>Hourly Rate ($)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={formHourlyRate}
                onChange={(e) => setFormHourlyRate(e.target.value)}
                placeholder="25.00"
                data-testid="input-member-hourly-rate"
              />
            </div>
            <div className="space-y-2">
              <Label>Clock In/Out PIN</Label>
              <Input
                type="text"
                value={formPin}
                onChange={(e) => setFormPin(e.target.value)}
                placeholder="4-digit PIN"
                maxLength={6}
                data-testid="input-member-pin"
              />
              <p className="text-xs text-muted-foreground">Used for crew to clock in/out on the time tracking page</p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setShowAddDialog(false); setEditingMember(null); resetForm(); }}>
              Cancel
            </Button>
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
            <AlertDialogDescription>
              Are you sure you want to remove {deletingMember?.name}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingMember && deleteMutation.mutate(deletingMember.id)}
              data-testid="button-confirm-delete-member"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
