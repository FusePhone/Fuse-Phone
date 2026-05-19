import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { formatPhoneDisplay } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { UserCog, Plus, MoreVertical, Mail, Shield, Clock, Crown, Loader2, UserX, Send, Trash2, Lock, ChevronDown, ChevronUp, Settings2, Link2, RefreshCw, AlertTriangle, Copy, Check, PlusCircle, X, Smartphone, HardHat, Briefcase } from "lucide-react";
import { isFieldWorkerRole, canAssignCapabilityToRole, FREE_FIELD_WORKER_SEATS, FREE_OFFICE_SEATS } from "@shared/teamRoles";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

// True ONLY when running inside the iOS native app shell (Capacitor). Apple
// requires IAP for digital subscriptions, so paid-seat purchase UI must be
// hidden on iOS. Android Capacitor and web both keep the Stripe purchase
// flow visible — Capacitor.getPlatform() returns 'ios' | 'android' | 'web'.
function isIosNative(): boolean {
  try {
    const cap = (window as any).Capacitor;
    return cap?.getPlatform?.() === 'ios';
  } catch { return false; }
}

interface CompanyUserWithDetails {
  id: number;
  ownerId: string;
  userId: string;
  role: string;
  status: string;
  capabilities: Record<string, boolean> | null;
  createdAt: string;
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    profileImageUrl: string | null;
    lastActiveAt: string | null;
  } | null;
}

interface CompanyInvitation {
  id: number;
  ownerId: string;
  email: string;
  role: string;
  token: string;
  status: string;
  expiresAt: string;
  createdAt: string;
}

const ROLE_OPTIONS = [
  { value: "office_manager", label: "Office Manager", description: "Full access to CRM, documents, and settings" },
  { value: "project_manager", label: "Project Manager", description: "Manage projects, crews, and scheduling" },
  { value: "sales_rep", label: "Sales Rep", description: "Handle leads, estimates, and proposals" },
  { value: "crew_lead", label: "Crew Lead", description: "Field supervisor — work orders, crew management, photos" },
  { value: "laborer", label: "Field Employee", description: "Field employee — assigned jobs, clock in/out, messaging" },
];

const CAPABILITY_DEFINITIONS = [
  { key: "viewTeamMessages", label: "View Team Messages", description: "See internal team conversations" },
  { key: "viewCustomerMessages", label: "View Customer Messages", description: "See customer SMS and email conversations" },
  { key: "sendMessages", label: "Send Messages", description: "Send SMS and emails to customers" },
  { key: "viewContacts", label: "View Contacts", description: "See contact list and details" },
  { key: "manageContacts", label: "Manage Contacts", description: "Create, edit, and delete contacts" },
  { key: "viewProjects", label: "View Projects", description: "See project pipeline and details" },
  { key: "manageProjects", label: "Manage Projects", description: "Create and edit projects, update stages" },
  { key: "viewDocuments", label: "View Documents", description: "See estimates, proposals, and invoices" },
  { key: "createDocuments", label: "Create Documents", description: "Create and edit estimates, proposals, invoices" },
  { key: "viewFinancials", label: "View Financials", description: "See revenue, expenses, and financial data" },
  { key: "manageCalendar", label: "Manage Calendar", description: "Create and edit appointments and events" },
  { key: "manageCrew", label: "Manage Crew", description: "Manage team members and time tracking" },
  { key: "makeCalls", label: "Make Calls", description: "Place and receive phone calls" },
  { key: "viewAssignedJobs", label: "View Assigned Jobs", description: "See jobs assigned to them" },
  { key: "viewWorkOrders", label: "View Work Orders", description: "See full work order details and scope of work" },
  { key: "viewCrewCalendar", label: "View Crew Calendar", description: "See calendar with assigned/scheduled jobs" },
  { key: "clockInOut", label: "Clock In/Out", description: "Use crew clock time tracking" },
  { key: "manageCrewClock", label: "Manage Crew Clock", description: "Clock in/out other team members" },
  { key: "uploadPhotos", label: "Upload Photos", description: "Add job site photos to projects" },
  { key: "addDailyLogs", label: "Add Daily Logs", description: "Add notes and updates to project timelines" },
];

const DEFAULT_ROLE_CAPABILITIES: Record<string, Record<string, boolean>> = {
  office_manager: {
    viewTeamMessages: true, viewCustomerMessages: true, sendMessages: true, viewContacts: true, manageContacts: true,
    viewProjects: true, manageProjects: true, viewDocuments: true, createDocuments: true,
    viewFinancials: true, manageCalendar: true, manageCrew: true, makeCalls: true,
  },
  project_manager: {
    viewTeamMessages: true, viewCustomerMessages: true, sendMessages: true, viewContacts: true, manageContacts: false,
    viewProjects: true, manageProjects: true, viewDocuments: true, createDocuments: true,
    viewFinancials: false, manageCalendar: true, manageCrew: true, makeCalls: false,
  },
  sales_rep: {
    viewTeamMessages: true, viewCustomerMessages: true, sendMessages: true, viewContacts: true, manageContacts: true,
    viewProjects: true, manageProjects: false, viewDocuments: true, createDocuments: true,
    viewFinancials: false, manageCalendar: true, manageCrew: false, makeCalls: true,
  },
  crew_lead: {
    viewTeamMessages: true, viewCustomerMessages: false, sendMessages: false, viewContacts: false, manageContacts: false,
    viewProjects: true, manageProjects: false, viewDocuments: false, createDocuments: false,
    viewFinancials: false, manageCalendar: false, manageCrew: true, makeCalls: false,
    viewAssignedJobs: true, viewWorkOrders: true, viewCrewCalendar: true,
    clockInOut: true, manageCrewClock: true, uploadPhotos: true, addDailyLogs: true,
  },
  laborer: {
    viewTeamMessages: true, viewCustomerMessages: false, sendMessages: false, viewContacts: false, manageContacts: false,
    viewProjects: false, manageProjects: false, viewDocuments: false, createDocuments: false,
    viewFinancials: false, manageCalendar: false, manageCrew: false, makeCalls: false,
    viewAssignedJobs: true, viewWorkOrders: false, viewCrewCalendar: true,
    clockInOut: true, manageCrewClock: false, uploadPhotos: true, addDailyLogs: false,
  },
};

interface CustomRole {
  value: string;
  label: string;
  description: string;
}

function getRoleLabel(role: string, customRoles: CustomRole[] = []): string {
  if (role === "owner") return "Owner";
  const found = ROLE_OPTIONS.find(r => r.value === role);
  if (found) return found.label;
  const custom = customRoles.find(r => r.value === role);
  return custom?.label || role;
}

function getRoleBadgeVariant(role: string): "default" | "secondary" | "outline" | "destructive" {
  switch (role) {
    case "owner": return "default";
    case "office_manager": return "default";
    case "project_manager": return "secondary";
    case "sales_rep": return "secondary";
    case "crew_lead": return "outline";
    default: return "outline";
  }
}

function getAllRoleOptions(customRoles: CustomRole[]): Array<{ value: string; label: string; description: string }> {
  return [
    ...ROLE_OPTIONS,
    ...customRoles,
  ];
}

function getUserInitials(user: CompanyUserWithDetails["user"]): string {
  if (!user) return "?";
  const first = user.firstName?.[0] || "";
  const last = user.lastName?.[0] || "";
  if (first || last) return (first + last).toUpperCase();
  return user.email?.[0]?.toUpperCase() || "?";
}

function getUserDisplayName(user: CompanyUserWithDetails["user"]): string {
  if (!user) return "Unknown User";
  if (user.firstName || user.lastName) {
    return [user.firstName, user.lastName].filter(Boolean).join(" ");
  }
  return user.email || "Unknown";
}

function ComingSoonState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center" data-testid="users-coming-soon">
      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-6">
        <UserCog className="w-8 h-8 text-primary" />
      </div>
      <h2 className="text-2xl font-bold mb-2">Team Users</h2>
      <Badge variant="secondary" className="mb-4">Coming Soon</Badge>
      <p className="text-muted-foreground max-w-md mb-6">
        Invite team members to your Fuse Phone CRM with role-based access. 
        Assign roles like Office Manager, Project Manager, Sales Rep, and Crew Lead 
        to control what each user can see and do.
      </p>
      <div className="grid grid-cols-2 gap-3 max-w-sm w-full">
        {ROLE_OPTIONS.map(role => (
          <div key={role.value} className="flex items-start gap-2 p-3 rounded-lg border bg-card text-left">
            <Shield className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium">{role.label}</p>
              <p className="text-xs text-muted-foreground">{role.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RoleDefaultsTab({ roleDefaults, onSave, isSaving, customRoles, onSaveCustomRoles, isSavingCustomRoles }: {
  roleDefaults: Record<string, Record<string, boolean>>;
  onSave: (defaults: Record<string, Record<string, boolean>>) => void;
  isSaving: boolean;
  customRoles: CustomRole[];
  onSaveCustomRoles: (roles: CustomRole[]) => void;
  isSavingCustomRoles: boolean;
}) {
  const { toast } = useToast();
  const allRoles = getAllRoleOptions(customRoles);
  const [localDefaults, setLocalDefaults] = useState<Record<string, Record<string, boolean>>>(roleDefaults);
  const [selectedRole, setSelectedRole] = useState("office_manager");
  const [showCreateRole, setShowCreateRole] = useState(false);
  const [newRoleLabel, setNewRoleLabel] = useState("");
  const [newRoleDescription, setNewRoleDescription] = useState("");

  const toggleCapability = (role: string, cap: string) => {
    setLocalDefaults(prev => ({
      ...prev,
      [role]: {
        ...prev[role],
        [cap]: !prev[role]?.[cap],
      },
    }));
  };

  const hasChanges = JSON.stringify(localDefaults) !== JSON.stringify(roleDefaults);

  const handleCreateRole = () => {
    if (!newRoleLabel.trim()) {
      toast({ title: "Role name is required", variant: "destructive" });
      return;
    }
    if (customRoles.length >= 10) {
      toast({ title: "Maximum 10 custom roles allowed", variant: "destructive" });
      return;
    }
    const value = newRoleLabel.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    const builtInValues = ROLE_OPTIONS.map(r => r.value);
    if (builtInValues.includes(value) || value === 'owner' || customRoles.some(r => r.value === value)) {
      toast({ title: "A role with this name already exists", variant: "destructive" });
      return;
    }
    const newRole: CustomRole = {
      value,
      label: newRoleLabel.trim(),
      description: newRoleDescription.trim() || `Custom role: ${newRoleLabel.trim()}`,
    };
    const updated = [...customRoles, newRole];
    onSaveCustomRoles(updated);
    setNewRoleLabel("");
    setNewRoleDescription("");
    setShowCreateRole(false);
    setSelectedRole(value);
    setLocalDefaults(prev => ({ ...prev, [value]: {} }));
  };

  const handleDeleteCustomRole = (roleValue: string) => {
    const updated = customRoles.filter(r => r.value !== roleValue);
    onSaveCustomRoles(updated);
    const newDefaults = { ...localDefaults };
    delete newDefaults[roleValue];
    onSave(newDefaults);
    setSelectedRole("office_manager");
  };

  const isCustomRole = (role: string) => customRoles.some(r => r.value === role);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium mb-1">Default Capabilities by Role</h3>
          <p className="text-xs text-muted-foreground">
            Set what each role can do by default. Individual users can have additional capabilities added on their profile.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowCreateRole(true)}
          disabled={customRoles.length >= 10}
          data-testid="button-create-custom-role"
        >
          <PlusCircle className="w-4 h-4 mr-1.5" />
          Create Role
        </Button>
      </div>

      {showCreateRole && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Create Custom Role</CardTitle>
            <CardDescription className="text-xs">
              {customRoles.length}/10 custom roles used
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Role Name</Label>
              <Input
                value={newRoleLabel}
                onChange={e => setNewRoleLabel(e.target.value)}
                placeholder="e.g. Estimator, Foreman, Apprentice"
                data-testid="input-custom-role-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Description (optional)</Label>
              <Input
                value={newRoleDescription}
                onChange={e => setNewRoleDescription(e.target.value)}
                placeholder="Brief description of this role"
                data-testid="input-custom-role-description"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => { setShowCreateRole(false); setNewRoleLabel(""); setNewRoleDescription(""); }}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleCreateRole}
                disabled={!newRoleLabel.trim() || isSavingCustomRoles}
                data-testid="button-confirm-create-role"
              >
                {isSavingCustomRoles ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
                Create Role
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2 flex-wrap">
        {allRoles.map(role => (
          <Button
            key={role.value}
            variant={selectedRole === role.value ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedRole(role.value)}
            data-testid={`button-role-tab-${role.value}`}
          >
            {role.label}
            {isCustomRole(role.value) && (
              <Badge variant="secondary" className="ml-1.5 text-[9px] px-1 py-0 h-3.5">custom</Badge>
            )}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">{getRoleLabel(selectedRole, customRoles)} Capabilities</CardTitle>
              <CardDescription className="text-xs">
                {allRoles.find(r => r.value === selectedRole)?.description}
              </CardDescription>
            </div>
            {isCustomRole(selectedRole) && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => {
                  if (confirm(`Delete the "${getRoleLabel(selectedRole, customRoles)}" role? Users with this role will need to be reassigned.`)) {
                    handleDeleteCustomRole(selectedRole);
                  }
                }}
                data-testid={`button-delete-role-${selectedRole}`}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Delete Role
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {CAPABILITY_DEFINITIONS.map(cap => {
              const blockedForRole = !canAssignCapabilityToRole(selectedRole, cap.key);
              return (
                <div
                  key={cap.key}
                  className={`flex items-center justify-between gap-4 py-1.5 ${blockedForRole ? 'opacity-60' : ''}`}
                  title={blockedForRole ? 'Field worker seats can\'t have this. Switch the role to Sales Rep, Project Manager, or Office Manager to enable it.' : undefined}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium flex items-center gap-1.5">
                      {cap.label}
                      {blockedForRole && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5">office only</Badge>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">{cap.description}</p>
                  </div>
                  <Switch
                    checked={!!localDefaults[selectedRole]?.[cap.key]}
                    onCheckedChange={() => {
                      if (blockedForRole) {
                        toast({
                          title: "Needs an office seat",
                          description: "Field worker roles can't have this capability. Use a Sales Rep, Project Manager, or Office Manager role instead.",
                          variant: "destructive",
                        });
                        return;
                      }
                      toggleCapability(selectedRole, cap.key);
                    }}
                    disabled={blockedForRole}
                    data-testid={`switch-default-${selectedRole}-${cap.key}`}
                  />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {hasChanges && (
        <div className="flex justify-end">
          <Button
            onClick={() => onSave(localDefaults)}
            disabled={isSaving}
            data-testid="button-save-role-defaults"
          >
            {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Save Role Defaults
          </Button>
        </div>
      )}
    </div>
  );
}

function UserCapabilitiesPanel({ user: cu, roleDefaults, onUpdate, isUpdating }: {
  user: CompanyUserWithDetails;
  roleDefaults: Record<string, Record<string, boolean>>;
  onUpdate: (id: number, capabilities: Record<string, boolean>) => void;
  isUpdating: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const roleBaseCapabilities = roleDefaults[cu.role] || DEFAULT_ROLE_CAPABILITIES[cu.role] || {};
  const userOverrides = cu.capabilities || {};

  const effectiveCapabilities: Record<string, boolean> = {};
  CAPABILITY_DEFINITIONS.forEach(cap => {
    effectiveCapabilities[cap.key] = userOverrides[cap.key] !== undefined
      ? userOverrides[cap.key]
      : !!roleBaseCapabilities[cap.key];
  });

  const hasOverrides = Object.keys(userOverrides).length > 0;
  const overrideCount = Object.entries(userOverrides).filter(([key, val]) => {
    return val !== !!roleBaseCapabilities[key];
  }).length;

  const toggleCap = (capKey: string) => {
    const newOverrides = { ...userOverrides };
    const roleDefault = !!roleBaseCapabilities[capKey];
    const currentValue = newOverrides[capKey] !== undefined ? newOverrides[capKey] : roleDefault;
    const newValue = !currentValue;

    if (newValue === roleDefault) {
      delete newOverrides[capKey];
    } else {
      newOverrides[capKey] = newValue;
    }

    onUpdate(cu.id, newOverrides);
  };

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        data-testid={`button-expand-capabilities-${cu.id}`}
      >
        <Settings2 className="w-3.5 h-3.5" />
        <span>Capabilities</span>
        {overrideCount > 0 && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">{overrideCount} custom</Badge>
        )}
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      {expanded && (
        <div className="mt-3 pl-1 space-y-2 border-l-2 border-muted ml-1.5">
          {CAPABILITY_DEFINITIONS.map(cap => {
            const isRoleDefault = !!roleBaseCapabilities[cap.key];
            const isOverridden = userOverrides[cap.key] !== undefined && userOverrides[cap.key] !== isRoleDefault;
            const isEnabled = effectiveCapabilities[cap.key];
            const blockedForRole = !canAssignCapabilityToRole(cu.role, cap.key);

            return (
              <div
                key={cap.key}
                className={`flex items-center justify-between gap-3 pl-3 py-0.5 ${blockedForRole ? 'opacity-60' : ''}`}
                title={blockedForRole ? 'Field worker seats can\'t have this. Change the role to enable it.' : undefined}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs">{cap.label}</span>
                  {blockedForRole && (
                    <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5">office only</Badge>
                  )}
                  {isOverridden && !blockedForRole && (
                    <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 border-primary/40 text-primary">custom</Badge>
                  )}
                </div>
                <Switch
                  checked={isEnabled && !blockedForRole}
                  onCheckedChange={() => !blockedForRole && toggleCap(cap.key)}
                  disabled={blockedForRole}
                  className="scale-75"
                  data-testid={`switch-user-cap-${cu.id}-${cap.key}`}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface SeatRowData {
  used: number;
  activeCount: number;
  pendingCount: number;
  freeAllowance: number;
  paidSeats: number;
  totalAllowance: number;
  extraPriceCents: number;
}
interface SeatUsage {
  field: SeatRowData;
  office: SeatRowData;
  adminBypass: boolean;
  hasStripeSubscription: boolean;
}

// Inline row inside SeatUsageCard for either field worker or office seats.
// Renders Buy/Release buttons on web only (hidden on iOS — see isIosNative).
function SeatRow({
  label,
  icon: Icon,
  seat,
  seatType,
  hasStripeSubscription,
  adminBypass,
  showPaidControls,
  onMutate,
  pending,
}: {
  label: string;
  icon: typeof HardHat;
  seat: SeatRowData;
  seatType: 'field_worker' | 'office';
  hasStripeSubscription: boolean;
  adminBypass: boolean;
  showPaidControls: boolean;
  onMutate: (action: 'purchase' | 'release', seatType: 'field_worker' | 'office') => void;
  pending: boolean;
}) {
  const fmt = (c: number) => `$${(c / 100).toFixed(0)}/mo`;
  return (
    <div className="rounded-md border p-3" data-testid={`seat-${seatType === 'field_worker' ? 'field' : 'office'}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <p className="text-2xl font-bold" data-testid={`text-${seatType === 'field_worker' ? 'field' : 'office'}-used`}>
        {seat.used}<span className="text-sm font-normal text-muted-foreground"> / {seat.totalAllowance}</span>
      </p>
      <p className="text-xs text-muted-foreground">
        {seat.freeAllowance} free + {seat.paidSeats} paid · {seat.activeCount} active · {seat.pendingCount} invited
      </p>
      <p className="text-xs mt-1.5 text-muted-foreground">
        Extra seats {fmt(seat.extraPriceCents)}
      </p>
      {showPaidControls && (
        <div className="flex gap-1.5 mt-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs flex-1"
            disabled={pending || !hasStripeSubscription}
            onClick={() => onMutate('purchase', seatType)}
            data-testid={`button-buy-${seatType === 'field_worker' ? 'field' : 'office'}-seat`}
          >
            <Plus className="w-3 h-3 mr-1" />Buy seat
          </Button>
          {seat.paidSeats > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              disabled={pending}
              onClick={() => onMutate('release', seatType)}
              data-testid={`button-release-${seatType === 'field_worker' ? 'field' : 'office'}-seat`}
            >
              Release
            </Button>
          )}
        </div>
      )}
      {showPaidControls && !hasStripeSubscription && (
        <p className="text-[10px] text-muted-foreground mt-1.5">Subscribe to Elite to add paid seats.</p>
      )}
    </div>
  );
}

function SeatUsageCard() {
  const { data, isLoading } = useQuery<SeatUsage>({ queryKey: ["/api/company/seat-usage"] });
  const { toast } = useToast();
  const onIos = isIosNative();

  const seatMutation = useMutation({
    mutationFn: async ({ action, seatType }: { action: 'purchase' | 'release'; seatType: 'field_worker' | 'office' }) => {
      const res = await apiRequest("POST", `/api/company/seats/${action}`, { seatType, quantity: 1 });
      return res.json();
    },
    onSuccess: (_, { action, seatType }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/company/seat-usage"] });
      const label = seatType === 'field_worker' ? 'field worker' : 'office';
      const cents = seatType === 'field_worker' ? 1900 : 4900;
      toast({
        title: action === 'purchase' ? `Added 1 ${label} seat` : `Released 1 ${label} seat`,
        description: action === 'purchase'
          ? `Your subscription is updated. Prorated charge of ~$${(cents / 100).toFixed(0)} applied for the rest of this period.`
          : `You'll get a prorated credit on your next invoice.`,
      });
    },
    onError: (err: any) => {
      toast({ title: 'Could not update seat', description: err.message, variant: 'destructive' });
    },
  });

  if (isLoading || !data) return null;
  const showPaidControls = !onIos && !data.adminBypass;
  return (
    <Card data-testid="card-seat-usage">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="w-4 h-4" />
          Team Seats
        </CardTitle>
        <CardDescription className="text-xs">
          Owner is always free. Field worker seats (Crew Lead, Field Employee) include 3 free with Elite. Office seats (Sales Rep, Project Manager, Office Manager, custom) are a paid add-on.{onIos ? ' Manage paid seats from the web at fusephone.com.' : ''}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          <SeatRow
            label="Field Workers"
            icon={HardHat}
            seat={data.field}
            seatType="field_worker"
            hasStripeSubscription={data.hasStripeSubscription}
            adminBypass={data.adminBypass}
            showPaidControls={showPaidControls}
            onMutate={(a, s) => seatMutation.mutate({ action: a, seatType: s })}
            pending={seatMutation.isPending}
          />
          <SeatRow
            label="Office Seats"
            icon={Briefcase}
            seat={data.office}
            seatType="office"
            hasStripeSubscription={data.hasStripeSubscription}
            adminBypass={data.adminBypass}
            showPaidControls={showPaidControls}
            onMutate={(a, s) => seatMutation.mutate({ action: a, seatType: s })}
            pending={seatMutation.isPending}
          />
        </div>
        {data.adminBypass && (
          <p className="text-[10px] text-muted-foreground mt-3" data-testid="text-admin-bypass">
            Admin account — seat limits do not apply to you.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// Confirm dialog for purchasing a paid seat when an invite hit the 402
// seat-limit gate. Shown only on web. On confirm, calls the purchase
// endpoint then retries the invite the user was attempting.
function SeatPurchaseConfirmDialog({
  open,
  onOpenChange,
  pendingInvite,
  onConfirmed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pendingInvite: { seatType: 'field_worker' | 'office'; priceCents: number; retry: () => void } | null;
  onConfirmed: () => void;
}) {
  const { toast } = useToast();
  const purchase = useMutation({
    mutationFn: async (seatType: 'field_worker' | 'office') => {
      const res = await apiRequest("POST", "/api/company/seats/purchase", { seatType, quantity: 1 });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company/seat-usage"] });
      onConfirmed();
      onOpenChange(false);
      if (pendingInvite) pendingInvite.retry();
    },
    onError: (err: any) => {
      toast({ title: 'Purchase failed', description: err.message, variant: 'destructive' });
    },
  });
  if (!pendingInvite) return null;
  const label = pendingInvite.seatType === 'field_worker' ? 'field worker' : 'office';
  const dollars = (pendingInvite.priceCents / 100).toFixed(0);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-seat-purchase-confirm">
        <DialogHeader>
          <DialogTitle>Add a paid {label} seat?</DialogTitle>
          <DialogDescription>
            You've used all your free {label} seats. Adding one more is ${dollars}/month, added to your existing FusePhone Elite subscription with a prorated charge for the rest of this billing period. After confirming, your invite will be sent automatically.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={purchase.isPending} data-testid="button-cancel-purchase">Cancel</Button>
          <Button
            onClick={() => purchase.mutate(pendingInvite.seatType)}
            disabled={purchase.isPending}
            data-testid="button-confirm-purchase"
          >
            {purchase.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processing...</> : `Add seat for $${dollars}/mo`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function UserManagement() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePhone, setInvitePhone] = useState("");
  const [inviteRole, setInviteRole] = useState("");
  const [inviteLinkedTeamMemberId, setInviteLinkedTeamMemberId] = useState<string>("");
  const [editingUser, setEditingUser] = useState<CompanyUserWithDetails | null>(null);
  const [expandedInvite, setExpandedInvite] = useState<number | null>(null);
  const [copiedLink, setCopiedLink] = useState<number | null>(null);
  const [editRole, setEditRole] = useState("");
  const [seatPurchasePrompt, setSeatPurchasePrompt] = useState<{ seatType: 'field_worker' | 'office'; priceCents: number; retry: () => void } | null>(null);
  const onIos = isIosNative();

  const isAdmin = user?.isAdmin === true;

  const { data: companyUsers = [], isLoading: usersLoading } = useQuery<CompanyUserWithDetails[]>({
    queryKey: ["/api/company/users"],
    enabled: isAdmin,
  });

  const { data: invitations = [], isLoading: invitationsLoading } = useQuery<CompanyInvitation[]>({
    queryKey: ["/api/company/invitations"],
    enabled: isAdmin,
  });

  const { data: savedRoleDefaults } = useQuery<Record<string, Record<string, boolean>> | null>({
    queryKey: ["/api/company/role-defaults"],
    enabled: isAdmin,
  });

  const { data: teamMembersData = [] } = useQuery<any[]>({
    queryKey: ["/api/team-members"],
    enabled: isAdmin,
  });

  const { data: customRolesData = [] } = useQuery<CustomRole[]>({
    queryKey: ["/api/company/custom-roles"],
    enabled: isAdmin,
  });

  const isFieldRole = (role: string) => role === "crew_lead" || role === "laborer";

  const roleDefaults = savedRoleDefaults || DEFAULT_ROLE_CAPABILITIES;
  const allRoles = getAllRoleOptions(customRolesData);

  // Helper: apiRequest throws "STATUS: BODY". Parse out a 402 seat-limit
  // payload so we can prompt the owner to buy a paid seat and auto-retry.
  function parseSeatLimitError(err: any): { seatType: 'field_worker' | 'office'; priceCents: number } | null {
    const msg = String(err?.message || "");
    if (!msg.startsWith("402:")) return null;
    try {
      const body = JSON.parse(msg.slice(msg.indexOf("{")));
      if (body?.code === 'SEAT_LIMIT_FIELD_WORKER' || body?.code === 'SEAT_LIMIT_OFFICE') {
        return { seatType: body.seatType, priceCents: body.priceCents };
      }
    } catch {}
    return null;
  }

  const inviteMutation = useMutation({
    mutationFn: async (data: { email?: string; phone?: string; role: string; linkedTeamMemberId?: number }) => {
      const res = await apiRequest("POST", "/api/company/users/invite", data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/company/invitations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/company/seat-usage"] });
      setInviteOpen(false);
      setInviteEmail("");
      setInvitePhone("");
      setInviteRole("");
      setInviteLinkedTeamMemberId("");
      if (data.emailSent || data.smsSent) {
        const method = data.emailSent && data.smsSent ? "email & text" : data.smsSent ? "text" : "email";
        const target = data.invitation?.email || data.invitation?.phone || "the user";
        toast({ title: "Invitation sent!", description: `Invitation sent via ${method} to ${target}.` });
      } else {
        toast({
          title: "Invitation created",
          description: `${data.emailError || 'Could not send invitation.'} Copy the invite link to share manually.`,
          variant: "destructive",
        });
      }
    },
    onError: (err: any, vars) => {
      const seatLimit = parseSeatLimitError(err);
      if (seatLimit && !onIos) {
        // Stash the invite payload so we can retry after purchase.
        setSeatPurchasePrompt({
          seatType: seatLimit.seatType,
          priceCents: seatLimit.priceCents,
          retry: () => inviteMutation.mutate(vars),
        });
        return;
      }
      toast({ title: "Failed to send invitation", description: err.message, variant: "destructive" });
    },
  });

  const resendInviteMutation = useMutation({
    mutationFn: async (data: { email: string; role: string }) => {
      const res = await apiRequest("POST", "/api/company/users/invite", data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/company/invitations"] });
      if (data.emailSent || data.smsSent) {
        toast({ title: "Invitation resent!", description: `Sent to ${data.invitation?.email || data.invitation?.phone || "the user"}` });
      } else {
        toast({
          title: "Invitation refreshed",
          description: data.emailError || "Could not send. Use Copy Link to share manually.",
          variant: "destructive",
        });
      }
    },
    onError: (err: any) => {
      toast({ title: "Failed to resend", description: err.message, variant: "destructive" });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: { role?: string; status?: string; capabilities?: Record<string, boolean> } }) => {
      const res = await apiRequest("PATCH", `/api/company/users/${id}`, updates);
      return res.json();
    },
    onMutate: async ({ id, updates }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/company/users"] });
      const previousUsers = queryClient.getQueryData<CompanyUserWithDetails[]>(["/api/company/users"]);
      if (previousUsers && updates.capabilities !== undefined) {
        queryClient.setQueryData<CompanyUserWithDetails[]>(["/api/company/users"], (old) =>
          old?.map(u => u.id === id ? { ...u, capabilities: updates.capabilities! } : u) ?? []
        );
      }
      return { previousUsers };
    },
    onError: (err: any, _vars, context) => {
      if (context?.previousUsers) {
        queryClient.setQueryData(["/api/company/users"], context.previousUsers);
      }
      toast({ title: "Failed to update user", description: err.message, variant: "destructive" });
    },
    onSuccess: (_data, { updates }) => {
      if (!updates.capabilities) {
        setEditingUser(null);
      }
      if (updates.role || updates.status) {
        toast({ title: "User updated" });
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company/users"] });
    },
  });

  const removeUserMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/company/users/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company/users"] });
      toast({ title: "User removed" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to remove user", description: err.message, variant: "destructive" });
    },
  });

  const cancelInvitationMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/company/invitations/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company/invitations"] });
      toast({ title: "Invitation cancelled" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to cancel invitation", description: err.message, variant: "destructive" });
    },
  });

  const saveRoleDefaultsMutation = useMutation({
    mutationFn: async (defaults: Record<string, Record<string, boolean>>) => {
      const res = await apiRequest("PUT", "/api/company/role-defaults", defaults);
      return res.json();
    },
    onMutate: async (defaults) => {
      await queryClient.cancelQueries({ queryKey: ["/api/company/role-defaults"] });
      const previous = queryClient.getQueryData(["/api/company/role-defaults"]);
      queryClient.setQueryData(["/api/company/role-defaults"], defaults);
      return { previous };
    },
    onError: (err: any, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["/api/company/role-defaults"], context.previous);
      }
      toast({ title: "Failed to save role defaults", description: err.message, variant: "destructive" });
    },
    onSuccess: () => {
      toast({ title: "Role defaults saved" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company/role-defaults"] });
    },
  });

  const saveCustomRolesMutation = useMutation({
    mutationFn: async (roles: CustomRole[]) => {
      const res = await apiRequest("PUT", "/api/company/custom-roles", roles);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company/custom-roles"] });
      toast({ title: "Custom roles saved" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to save custom roles", description: err.message, variant: "destructive" });
    },
  });

  if (!isAdmin) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <UserCog className="w-6 h-6" />
          <h1 className="text-2xl font-bold">Users</h1>
        </div>
        <Card>
          <CardContent className="p-0">
            <ComingSoonState />
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleUpdateCapabilities = (id: number, capabilities: Record<string, boolean>) => {
    updateUserMutation.mutate({ id, updates: { capabilities } });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <UserCog className="w-6 h-6" />
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-users-title">Team Users</h1>
            <p className="text-sm text-muted-foreground">Manage who has access to your Fuse Phone CRM</p>
          </div>
        </div>
        <Button onClick={() => setInviteOpen(true)} data-testid="button-invite-user">
          <Plus className="w-4 h-4 mr-2" />
          Invite User
        </Button>
      </div>

      <SeatUsageCard />

      <Tabs defaultValue="users">
        <TabsList data-testid="tabs-user-management">
          <TabsTrigger value="users" data-testid="tab-users">Users</TabsTrigger>
          <TabsTrigger value="settings" data-testid="tab-settings">Role Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-6 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Active Users</CardTitle>
              <CardDescription>{companyUsers.length} user{companyUsers.length !== 1 ? "s" : ""}</CardDescription>
            </CardHeader>
            <CardContent>
              {usersLoading ? (
                <div className="space-y-3">
                  {[1, 2].map(i => (
                    <div key={i} className="flex items-center gap-3 p-3">
                      <Skeleton className="w-10 h-10 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-48" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="divide-y" data-testid="users-list">
                  {companyUsers.map((cu) => (
                    <div key={cu.id} className="py-3 first:pt-0 last:pb-0" data-testid={`user-row-${cu.id}`}>
                      <div className="flex items-center gap-3">
                        <Avatar className="w-10 h-10">
                          <AvatarImage src={cu.user?.profileImageUrl || undefined} />
                          <AvatarFallback className="text-sm">{getUserInitials(cu.user)}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm truncate" data-testid={`text-user-name-${cu.id}`}>
                              {getUserDisplayName(cu.user)}
                            </span>
                            {cu.role === "owner" && <Crown className="w-4 h-4 text-amber-500 shrink-0" />}
                          </div>
                          <p className="text-xs text-muted-foreground truncate" data-testid={`text-user-email-${cu.id}`}>
                            {cu.user?.email || "No email"}
                          </p>
                        </div>
                        <Badge variant={getRoleBadgeVariant(cu.role)} className="shrink-0" data-testid={`badge-role-${cu.id}`}>
                          {getRoleLabel(cu.role, customRolesData)}
                        </Badge>
                        {cu.status === "suspended" && (
                          <Badge variant="destructive" className="shrink-0">Suspended</Badge>
                        )}
                        {cu.role !== "owner" && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="shrink-0" data-testid={`button-user-actions-${cu.id}`}>
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => { setEditingUser(cu); setEditRole(cu.role); }}>
                                <Shield className="w-4 h-4 mr-2" />
                                Change Role
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => updateUserMutation.mutate({
                                  id: cu.id,
                                  updates: { status: cu.status === "active" ? "suspended" : "active" },
                                })}
                              >
                                {cu.status === "active" ? (
                                  <><Lock className="w-4 h-4 mr-2" />Suspend</>
                                ) : (
                                  <><Shield className="w-4 h-4 mr-2" />Activate</>
                                )}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => {
                                  if (confirm("Remove this user from your company? They will lose access immediately.")) {
                                    removeUserMutation.mutate(cu.id);
                                  }
                                }}
                              >
                                <UserX className="w-4 h-4 mr-2" />
                                Remove User
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                      {cu.role !== "owner" && (
                        <div className="mt-2 ml-[52px]">
                          <UserCapabilitiesPanel
                            user={cu}
                            roleDefaults={roleDefaults}
                            onUpdate={handleUpdateCapabilities}
                            isUpdating={updateUserMutation.isPending}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {(invitations.length > 0 || invitationsLoading) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Pending Invitations</CardTitle>
                <CardDescription>{invitations.length} pending</CardDescription>
              </CardHeader>
              <CardContent>
                {invitationsLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-12 w-full" />
                  </div>
                ) : (
                  <div className="divide-y" data-testid="invitations-list">
                    {invitations.map((inv) => {
                      const isExpanded = expandedInvite === inv.id;
                      const isExpired = new Date(inv.expiresAt) <= new Date();
                      const inviteLink = `${window.location.origin}/invite/${inv.token}`;

                      return (
                        <div key={inv.id} data-testid={`invitation-row-${inv.id}`}>
                          <button
                            type="button"
                            className="flex items-center gap-3 py-3 first:pt-0 w-full text-left hover:bg-muted/50 rounded-md px-2 -mx-2 transition-colors"
                            onClick={() => setExpandedInvite(isExpanded ? null : inv.id)}
                            data-testid={`button-expand-invitation-${inv.id}`}
                          >
                            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                              {inv.email ? <Mail className="w-4 h-4 text-muted-foreground" /> : <Smartphone className="w-4 h-4 text-muted-foreground" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate" data-testid={`text-invitation-email-${inv.id}`}>{inv.email || formatPhoneDisplay(inv.phone)}</p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Clock className="w-3 h-3" />
                                {isExpired ? (
                                  <span className="text-destructive">Expired</span>
                                ) : (
                                  <span>Expires {new Date(inv.expiresAt).toLocaleDateString()}</span>
                                )}
                              </div>
                            </div>
                            <Badge variant={isExpired ? "destructive" : "outline"} className="shrink-0">
                              {isExpired ? "Expired" : getRoleLabel(inv.role, customRolesData)}
                            </Badge>
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                            )}
                          </button>

                          {isExpanded && (
                            <div className="pb-3 pl-14 pr-2 space-y-2">
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    resendInviteMutation.mutate({ email: inv.email || '', phone: inv.phone || '', role: inv.role });
                                    setExpandedInvite(null);
                                  }}
                                  disabled={resendInviteMutation.isPending}
                                  data-testid={`button-resend-invitation-${inv.id}`}
                                >
                                  {resendInviteMutation.isPending ? (
                                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                                  ) : (
                                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                                  )}
                                  Resend
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={async () => {
                                    const { copyToClipboard } = await import("@/lib/clipboard");
                                    const ok = await copyToClipboard(inviteLink);
                                    if (ok) {
                                      setCopiedLink(inv.id);
                                      toast({ title: "Link copied!" });
                                      setTimeout(() => setCopiedLink(null), 2000);
                                    } else {
                                      toast({ title: "Could not copy link", description: inviteLink, variant: "destructive" });
                                    }
                                  }}
                                  data-testid={`button-copy-link-${inv.id}`}
                                >
                                  {copiedLink === inv.id ? (
                                    <Check className="w-3.5 h-3.5 mr-1.5 text-green-500" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5 mr-1.5" />
                                  )}
                                  {copiedLink === inv.id ? "Copied!" : "Copy Link"}
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => {
                                    cancelInvitationMutation.mutate(inv.id);
                                    setExpandedInvite(null);
                                  }}
                                  disabled={cancelInvitationMutation.isPending}
                                  data-testid={`button-cancel-invitation-${inv.id}`}
                                >
                                  <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Settings2 className="w-5 h-5" />
                Role Settings
              </CardTitle>
              <CardDescription>
                Configure what each role can do by default. You can also customize individual users on the Users tab.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RoleDefaultsTab
                roleDefaults={roleDefaults}
                onSave={(defaults) => saveRoleDefaultsMutation.mutate(defaults)}
                isSaving={saveRoleDefaultsMutation.isPending}
                customRoles={customRolesData}
                onSaveCustomRoles={(roles) => saveCustomRolesMutation.mutate(roles)}
                isSavingCustomRoles={saveCustomRolesMutation.isPending}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Team Member</DialogTitle>
            <DialogDescription>
              Send an invitation by email or text message.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email Address</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="team@example.com"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                data-testid="input-invite-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-phone">Phone Number</Label>
              <Input
                id="invite-phone"
                type="tel"
                placeholder="(555) 123-4567"
                value={invitePhone}
                onChange={e => setInvitePhone(e.target.value)}
                data-testid="input-invite-phone"
              />
              <p className="text-xs text-muted-foreground">
                {inviteEmail ? "Optional — also send invite by text" : "Enter a phone number to send the invite by text"}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger data-testid="select-invite-role">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {allRoles.map(role => {
                    const fieldWorker = isFieldWorkerRole(role.value);
                    const priceHint = fieldWorker ? '$19/mo after 3 free' : '$49/mo each';
                    return (
                      <SelectItem key={role.value} value={role.value}>
                        <div>
                          <span className="font-medium">{role.label}</span>
                          <span className="text-xs text-muted-foreground ml-2">— {role.description}</span>
                          <span className="text-[10px] text-muted-foreground ml-2">({priceHint})</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {inviteRole && !isFieldWorkerRole(inviteRole) && (
                <p className="text-xs text-amber-600 dark:text-amber-400" data-testid="text-office-seat-warning">
                  {onIos
                    ? 'Office seats are a paid add-on at $49/month each — manage them from the web at fusephone.com.'
                    : "Office seats are $49/month each. If you don't have a free office seat available, we'll ask you to confirm before charging."}
                </p>
              )}
            </div>
            {isFieldRole(inviteRole) && (
              <div className="space-y-2">
                <Label>Link to Team Member (optional)</Label>
                <Select value={inviteLinkedTeamMemberId} onValueChange={setInviteLinkedTeamMemberId}>
                  <SelectTrigger data-testid="select-invite-team-member">
                    <SelectValue placeholder="Select a team member" />
                  </SelectTrigger>
                  <SelectContent>
                    {teamMembersData.filter((m: any) => m.isActive !== false).map((m: any) => (
                      <SelectItem key={m.id} value={m.id.toString()}>
                        {m.name} {m.role ? `(${m.role})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Links this user account to their crew profile so they see their assigned jobs.</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button
              onClick={() => inviteMutation.mutate({
                ...(inviteEmail ? { email: inviteEmail } : {}),
                ...(invitePhone ? { phone: invitePhone } : {}),
                role: inviteRole,
                ...(inviteLinkedTeamMemberId ? { linkedTeamMemberId: parseInt(inviteLinkedTeamMemberId) } : {}),
              })}
              disabled={(!inviteEmail && !invitePhone) || !inviteRole || inviteMutation.isPending}
              data-testid="button-send-invite"
            >
              {inviteMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending...</>
              ) : (
                <><Send className="w-4 h-4 mr-2" />Send Invitation</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingUser} onOpenChange={(open) => { if (!open) setEditingUser(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Role</DialogTitle>
            <DialogDescription>
              Update the role for {editingUser ? getUserDisplayName(editingUser.user) : ""}. Current: {editingUser ? getRoleLabel(editingUser.role, customRolesData) : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>Role</Label>
            <Select value={editRole} onValueChange={setEditRole}>
              <SelectTrigger className="mt-2" data-testid="select-edit-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allRoles.map(role => (
                  <SelectItem key={role.value} value={role.value}>
                    {role.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)}>Cancel</Button>
            <Button
              onClick={() => {
                if (editingUser) {
                  updateUserMutation.mutate({ id: editingUser.id, updates: { role: editRole } });
                }
              }}
              disabled={updateUserMutation.isPending || editRole === editingUser?.role}
              data-testid="button-save-role"
            >
              {updateUserMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SeatPurchaseConfirmDialog
        open={!!seatPurchasePrompt}
        onOpenChange={(open) => { if (!open) setSeatPurchasePrompt(null); }}
        pendingInvite={seatPurchasePrompt}
        onConfirmed={() => setSeatPurchasePrompt(null)}
      />
    </div>
  );
}
