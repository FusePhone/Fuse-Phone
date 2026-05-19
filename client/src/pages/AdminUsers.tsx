import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useSubscription } from "@/hooks/use-subscription";
import { Loader2, Trash2, Users, Shield, FileText, UserPlus, Clock, Tag, Plus, CreditCard, Crown, CalendarDays, MessageCircle, Send, Check, Sparkles, HelpCircle, Video, GripVertical, Eye, EyeOff, Pencil, ExternalLink, ChevronDown, ChevronRight, UserCircle2 } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { useLocation } from "wouter";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

type AdminUser = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  authProvider: string | null;
  isAdmin: boolean | null;
  profileImageUrl: string | null;
  createdAt: string | null;
  contactCount: number;
  documentCount: number;
  subscriptionTier: string | null;
  subscriptionStatus: string | null;
  trialEndsAt: string | null;
  subscriptionEndsAt: string | null;
  stripeCustomerId: string | null;
  fuseAiStatus: string | null;
  fuseAiSubscriptionId: string | null;
  fuseAiTrialEndsAt: string | null;
  aiAssistantStatus: string | null;
  lastActiveAt: string | null;
  teamMembers?: AdminTeamMember[];
};

type AdminTeamMember = {
  id: number;
  userId: string;
  role: string;
  status: string;
  createdAt: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  lastActiveAt: string | null;
};

type HelpTutorial = {
  id: number;
  title: string;
  description: string | null;
  category: string;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  recordingNotes: string | null;
  sortOrder: number;
  published: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

const HELP_CATEGORIES = [
  { value: 'overview', label: 'Overview' },
  { value: 'settings', label: 'Settings' },
  { value: 'integrations', label: 'Integrations' },
  { value: 'documents', label: 'Documents' },
  { value: 'projects', label: 'Projects' },
  { value: 'contacts', label: 'Contacts' },
  { value: 'communication', label: 'Communication' },
  { value: 'billing', label: 'Billing' },
];

type PromoCode = {
  id: number;
  code: string;
  description: string | null;
  discountType: string;
  discountAmount: number;
  tier: string | null;
  appliesTo: string | null;
  durationMonths: number | null;
  trialDays: number | null;
  maxUses: number | null;
  currentUses: number | null;
  active: boolean;
  expiresAt: string | null;
  createdAt: string | null;
};

function getSubscriptionBadge(user: AdminUser) {
  const status = user.subscriptionStatus || 'trialing';
  const tier = user.subscriptionTier || 'core';
  const now = new Date();
  const isTrialing = status === 'trialing' && user.trialEndsAt && new Date(user.trialEndsAt) > now;
  const trialExpired = status === 'trialing' && user.trialEndsAt && new Date(user.trialEndsAt) <= now;

  if (user.isAdmin) {
    return <Badge variant="default">Admin (Elite)</Badge>;
  }
  if (status === 'active') {
    return <Badge variant="default">{tier === 'elite' ? 'Elite' : tier === 'starter' ? 'Starter' : 'Core'}</Badge>;
  }
  if (isTrialing) {
    const daysLeft = Math.ceil((new Date(user.trialEndsAt!).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return <Badge variant="secondary">Trial ({daysLeft}d left)</Badge>;
  }
  if (trialExpired) {
    return <Badge variant="outline">Trial Expired</Badge>;
  }
  return <Badge variant="outline">No Plan</Badge>;
}

function UserSubscriptionDialog({ user, open, onOpenChange }: { user: AdminUser; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const [trialDays, setTrialDays] = useState("30");
  const [tier, setTier] = useState(user.subscriptionTier || 'core');
  const toDateInput = (iso: string | null) => iso ? new Date(iso).toISOString().slice(0, 10) : "";
  const [trialEndDate, setTrialEndDate] = useState(toDateInput(user.trialEndsAt));
  const [subEndDate, setSubEndDate] = useState(toDateInput(user.subscriptionEndsAt));

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("PATCH", `/api/admin/users/${user.id}/subscription`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Subscription updated" });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({ title: "Failed to update", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage Subscription - {user.email}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <Label>Current Status</Label>
            <p className="text-sm text-muted-foreground mt-1">
              Tier: {user.subscriptionTier || 'core'} | Status: {user.subscriptionStatus || 'trialing'}
              {user.trialEndsAt && ` | Trial ends: ${format(new Date(user.trialEndsAt), "MMM d, yyyy")}`}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Set Tier</Label>
            <Select value={tier} onValueChange={setTier}>
              <SelectTrigger data-testid="select-tier">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="starter">Starter ($39.99/mo)</SelectItem>
                <SelectItem value="core">Core ($89.99/mo)</SelectItem>
                <SelectItem value="elite">Elite ($149/mo)</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={() => updateMutation.mutate({ tier })}
              disabled={updateMutation.isPending}
              data-testid="button-set-tier"
            >
              {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Set Tier"}
            </Button>
          </div>

          <div className="space-y-2">
            <Label>Extend Trial (days)</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={trialDays}
                onChange={(e) => setTrialDays(e.target.value)}
                className="w-24"
                data-testid="input-trial-days"
              />
              <Button
                variant="outline"
                onClick={() => updateMutation.mutate({ trialDaysExtension: parseInt(trialDays) })}
                disabled={updateMutation.isPending}
                data-testid="button-extend-trial"
              >
                {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Extend Trial"}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Set Status</Label>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => updateMutation.mutate({ status: 'active' })}
                disabled={updateMutation.isPending}
                data-testid="button-set-active"
              >
                Set Active
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => updateMutation.mutate({ status: 'canceled' })}
                disabled={updateMutation.isPending}
                data-testid="button-set-canceled"
              >
                Set Canceled
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => updateMutation.mutate({ action: 'reactivate' })}
                disabled={updateMutation.isPending}
                data-testid="button-reactivate"
              >
                Reactivate
              </Button>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t">
            <Label className="font-medium">Trial End Date</Label>
            <p className="text-xs text-muted-foreground">Set an exact date the trial ends (can shorten or extend).</p>
            <div className="flex items-center gap-2 flex-wrap">
              <Input
                type="date"
                value={trialEndDate}
                onChange={(e) => setTrialEndDate(e.target.value)}
                className="w-44"
                data-testid="input-trial-end-date"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => updateMutation.mutate({ trialEndsAt: trialEndDate ? new Date(trialEndDate).toISOString() : null })}
                disabled={updateMutation.isPending}
                data-testid="button-set-trial-end-date"
              >
                Save Date
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive"
                onClick={() => updateMutation.mutate({ action: 'end_trial_now' })}
                disabled={updateMutation.isPending}
                data-testid="button-end-trial-now"
              >
                End Trial Now
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => updateMutation.mutate({ trialEndsAt: null })}
                disabled={updateMutation.isPending}
                data-testid="button-clear-trial-end"
              >
                Clear
              </Button>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t">
            <Label className="font-medium">Subscription End Date</Label>
            <p className="text-xs text-muted-foreground">Schedule when the subscription stops (or end it immediately).</p>
            <div className="flex items-center gap-2 flex-wrap">
              <Input
                type="date"
                value={subEndDate}
                onChange={(e) => setSubEndDate(e.target.value)}
                className="w-44"
                data-testid="input-sub-end-date"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => updateMutation.mutate({ subscriptionEndsAt: subEndDate ? new Date(subEndDate).toISOString() : null })}
                disabled={updateMutation.isPending}
                data-testid="button-set-sub-end-date"
              >
                Save Date
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive"
                onClick={() => updateMutation.mutate({ action: 'end_subscription_now' })}
                disabled={updateMutation.isPending}
                data-testid="button-end-subscription-now"
              >
                End Subscription Now
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => updateMutation.mutate({ subscriptionEndsAt: null })}
                disabled={updateMutation.isPending}
                data-testid="button-clear-sub-end"
              >
                Clear
              </Button>
            </div>
          </div>

          <FuseAiAdminSection user={user} />
          <AiAssistantAdminSection user={user} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} data-testid="button-close-dialog">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FuseAiAdminSection({ user }: { user: AdminUser }) {
  const { toast } = useToast();
  const [fuseAiTrialDays, setFuseAiTrialDays] = useState("30");

  const fuseAiMutation = useMutation({
    mutationFn: async (data: { action: string; trialDays?: number }) => {
      await apiRequest("PATCH", `/api/admin/users/${user.id}/fuse-ai`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "FuseAI status updated" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update FuseAI", description: error.message, variant: "destructive" });
    },
  });

  const fuseAiActive = user.fuseAiStatus === 'active';
  const hasTrial = user.fuseAiTrialEndsAt && new Date(user.fuseAiTrialEndsAt) > new Date();

  return (
    <div className="space-y-2 pt-2 border-t">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-purple-500" />
        <Label className="font-medium">FuseAI Add-on</Label>
      </div>
      <p className="text-sm text-muted-foreground">
        Status: {fuseAiActive ? 'Active' : 'Inactive'}
        {user.fuseAiSubscriptionId && ' (Stripe)'}
        {hasTrial && ` | Trial ends: ${format(new Date(user.fuseAiTrialEndsAt!), "MMM d, yyyy")}`}
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <Input
          type="number"
          value={fuseAiTrialDays}
          onChange={(e) => setFuseAiTrialDays(e.target.value)}
          className="w-24"
          placeholder="Days"
          data-testid="input-fuse-ai-trial-days"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => fuseAiMutation.mutate({ action: 'grant_trial', trialDays: parseInt(fuseAiTrialDays) })}
          disabled={fuseAiMutation.isPending}
          data-testid="button-grant-fuse-ai-trial"
        >
          {fuseAiMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Grant Trial"}
        </Button>
        {!fuseAiActive && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => fuseAiMutation.mutate({ action: 'activate' })}
            disabled={fuseAiMutation.isPending}
            data-testid="button-activate-fuse-ai"
          >
            Activate
          </Button>
        )}
        {fuseAiActive && !user.fuseAiSubscriptionId && (
          <Button
            variant="outline"
            size="sm"
            className="text-destructive"
            onClick={() => fuseAiMutation.mutate({ action: 'deactivate' })}
            disabled={fuseAiMutation.isPending}
            data-testid="button-deactivate-fuse-ai"
          >
            Deactivate
          </Button>
        )}
      </div>
    </div>
  );
}

function AiAssistantAdminSection({ user }: { user: AdminUser }) {
  const { toast } = useToast();
  const mutation = useMutation({
    mutationFn: async (data: { action: string }) => {
      await apiRequest("PATCH", `/api/admin/users/${user.id}/ai-assistant`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "AI Assistant updated" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update AI Assistant", description: error.message, variant: "destructive" });
    },
  });
  const active = (user as any).aiAssistantStatus === 'active';
  return (
    <div className="space-y-2 pt-2 border-t">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-indigo-500" />
        <Label className="font-medium">AI Virtual Assistant</Label>
      </div>
      <p className="text-sm text-muted-foreground">Status: {active ? 'Active' : 'Inactive'}</p>
      <div className="flex items-center gap-2 flex-wrap">
        {!active && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => mutation.mutate({ action: 'activate' })}
            disabled={mutation.isPending}
            data-testid="button-activate-ai-assistant"
          >
            Activate
          </Button>
        )}
        {active && (
          <Button
            variant="outline"
            size="sm"
            className="text-destructive"
            onClick={() => mutation.mutate({ action: 'deactivate' })}
            disabled={mutation.isPending}
            data-testid="button-deactivate-ai-assistant"
          >
            Deactivate
          </Button>
        )}
      </div>
    </div>
  );
}

function CreatePromoCodeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [discountType, setDiscountType] = useState("fixed");
  const [discountAmount, setDiscountAmount] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [tier, setTier] = useState("any");
  const [appliesTo, setAppliesTo] = useState("plan");
  const [durationMonths, setDurationMonths] = useState("");
  const [trialDays, setTrialDays] = useState("");

  const createMutation = useMutation({
    mutationFn: async () => {
      const amount = discountAmount
        ? (discountType === 'fixed'
          ? Math.round(parseFloat(discountAmount) * 100)
          : parseInt(discountAmount))
        : 0;
      await apiRequest("POST", "/api/admin/promo-codes", {
        code,
        description,
        discountType,
        discountAmount: amount,
        tier: tier === 'any' ? null : tier,
        appliesTo,
        durationMonths: durationMonths ? parseInt(durationMonths) : null,
        trialDays: trialDays ? parseInt(trialDays) : null,
        maxUses: maxUses ? parseInt(maxUses) : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/promo-codes"] });
      toast({ title: "Promo code created" });
      onOpenChange(false);
      setCode(""); setDescription(""); setDiscountAmount(""); setMaxUses(""); setDurationMonths(""); setTrialDays("");
    },
    onError: (error: any) => {
      toast({ title: "Failed to create", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Promo Code</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Code</Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="FRIEND50"
              data-testid="input-promo-code"
            />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Friends & family discount"
              data-testid="input-promo-description"
            />
          </div>
          <div className="space-y-2">
            <Label>Applies To</Label>
            <Select value={appliesTo} onValueChange={setAppliesTo}>
              <SelectTrigger data-testid="select-applies-to">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="plan">Plan Subscription</SelectItem>
                <SelectItem value="all_addons">All Add-ons</SelectItem>
                <SelectItem value="fuse_ai">FuseAI Add-on</SelectItem>
                <SelectItem value="ai_assistant">AI Virtual Assistant Add-on</SelectItem>
                <SelectItem value="time_tracking">Time Tracking Add-on</SelectItem>
                <SelectItem value="job_costing">Job Costing Add-on</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Free Trial Days</Label>
            <Input
              type="number"
              value={trialDays}
              onChange={(e) => setTrialDays(e.target.value)}
              placeholder="Default (15 days)"
              data-testid="input-trial-days"
            />
            <p className="text-xs text-muted-foreground">Override default trial. E.g. 45 for 45-day free trial</p>
          </div>
          <div className="space-y-2">
            <Label>Discount Type</Label>
            <Select value={discountType} onValueChange={setDiscountType}>
              <SelectTrigger data-testid="select-discount-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed">Fixed Amount ($)</SelectItem>
                <SelectItem value="percent">Percentage (%)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{discountType === 'fixed' ? 'Discount Amount ($)' : 'Discount Percentage (%)'}</Label>
            <Input
              type="number"
              value={discountAmount}
              onChange={(e) => setDiscountAmount(e.target.value)}
              placeholder={discountType === 'fixed' ? '20.00' : '25'}
              data-testid="input-discount-amount"
            />
            <p className="text-xs text-muted-foreground">Leave empty if only extending trial</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Discount Duration</Label>
              <Input
                type="number"
                value={durationMonths}
                onChange={(e) => setDurationMonths(e.target.value)}
                placeholder="Forever"
                data-testid="input-duration-months"
              />
              <p className="text-xs text-muted-foreground">Empty = forever (until cancel)</p>
            </div>
            <div className="space-y-2">
              <Label>Max Uses</Label>
              <Input
                type="number"
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
                placeholder="Unlimited"
                data-testid="input-max-uses"
              />
              <p className="text-xs text-muted-foreground">Leave empty for unlimited</p>
            </div>
          </div>
          {appliesTo === 'plan' && (
            <div className="space-y-2">
              <Label>Apply to Tier</Label>
              <Select value={tier} onValueChange={setTier}>
                <SelectTrigger data-testid="select-promo-tier">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any Tier</SelectItem>
                  <SelectItem value="starter">Starter Only</SelectItem>
                  <SelectItem value="core">Core Only</SelectItem>
                  <SelectItem value="elite">Elite Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} data-testid="button-cancel-promo">Cancel</Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!code || (!discountAmount && !trialDays) || createMutation.isPending}
            data-testid="button-create-promo"
          >
            {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminUsers() {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const [, navigate] = useLocation();
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [showCreatePromo, setShowCreatePromo] = useState(false);
  const [expandedOwners, setExpandedOwners] = useState<Set<string>>(new Set());
  const toggleExpandOwner = (id: string) => setExpandedOwners(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const formatTeamRole = (role: string) => role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  const isAdminUser = !!currentUser?.isAdmin;
  const { baseTier } = useSubscription();
  const adminTierMutation = useMutation({
    mutationFn: async (newTier: string) => {
      await apiRequest("PATCH", "/api/subscription/admin-switch-tier", { tier: newTier });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "Tier switched", description: "Your view has been updated. Your real subscription is untouched." });
    },
    onError: (error: any) => {
      toast({ title: "Failed to switch tier", description: error.message, variant: "destructive" });
    },
  });

  const { data: adminUsers, isLoading } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
    enabled: isAdminUser,
  });

  const { data: promoCodesData, isLoading: promoLoading } = useQuery<PromoCode[]>({
    queryKey: ["/api/admin/promo-codes"],
    enabled: isAdminUser,
  });

  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      await apiRequest("DELETE", `/api/admin/users/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User deleted successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to delete user", description: error.message, variant: "destructive" });
    },
  });

  const cleanupMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await apiRequest("POST", "/api/admin/cleanup-user-data", { email });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({
        title: "Data cleaned up",
        description: `Deleted ${data.results?.projectsDeleted || 0} projects and ${data.results?.contactsDeleted || 0} contacts for ${data.email}`,
      });
    },
    onError: (error: any) => {
      toast({ title: "Cleanup failed", description: error.message, variant: "destructive" });
    },
  });

  const togglePromoMutation = useMutation({
    mutationFn: async ({ id, active }: { id: number; active: boolean }) => {
      await apiRequest("PATCH", `/api/admin/promo-codes/${id}`, { active });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/promo-codes"] });
      toast({ title: "Promo code updated" });
    },
  });

  const deletePromoMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/promo-codes/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/promo-codes"] });
      toast({ title: "Promo code deleted" });
    },
  });

  const { data: onboardingData } = useQuery<any[]>({
    queryKey: ["/api/admin/onboarding-bookings"],
    enabled: isAdminUser,
  });

  const confirmBookingMutation = useMutation({
    mutationFn: async ({ id, confirmedTime, status }: { id: number; confirmedTime?: string; status?: string }) => {
      await apiRequest("PATCH", `/api/admin/onboarding-bookings/${id}`, { confirmedTime, status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/onboarding-bookings"] });
      toast({ title: "Booking updated" });
    },
  });

  const { data: supportThreads } = useQuery<any[]>({
    queryKey: ["/api/admin/support-messages"],
    refetchOnWindowFocus: true,
    enabled: isAdminUser,
  });

  const [selectedThread, setSelectedThread] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const [newChatSearch, setNewChatSearch] = useState('');

  const replyMutation = useMutation({
    mutationFn: async ({ userId, message }: { userId: string; message: string }) => {
      await apiRequest("POST", `/api/admin/support-messages/${userId}/reply`, { message });
    },
    onSuccess: () => {
      setReplyText('');
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support-messages"] });
      toast({ title: "Reply sent" });
    },
  });

  const markReadMutation = useMutation({
    mutationFn: async (userId: string) => {
      await apiRequest("PATCH", `/api/admin/support-messages/${userId}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support-messages"] });
    },
  });

  const [bookingTimes, setBookingTimes] = useState<Record<number, string>>({});

  const [showTutorialForm, setShowTutorialForm] = useState(false);
  const [editingTutorial, setEditingTutorial] = useState<HelpTutorial | null>(null);
  const [tutorialTitle, setTutorialTitle] = useState('');
  const [tutorialDescription, setTutorialDescription] = useState('');
  const [tutorialCategory, setTutorialCategory] = useState('overview');
  const [tutorialVideoUrl, setTutorialVideoUrl] = useState('');
  const [tutorialPublished, setTutorialPublished] = useState(false);

  const { data: tutorials } = useQuery<HelpTutorial[]>({
    queryKey: ["/api/admin/help/tutorials"],
    enabled: isAdminUser,
  });

  const createTutorialMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("POST", "/api/admin/help/tutorials", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/help/tutorials"] });
      toast({ title: "Tutorial created" });
      resetTutorialForm();
    },
    onError: (error: any) => {
      toast({ title: "Failed to create tutorial", description: error.message, variant: "destructive" });
    },
  });

  const updateTutorialMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      await apiRequest("PATCH", `/api/admin/help/tutorials/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/help/tutorials"] });
      toast({ title: "Tutorial updated" });
      resetTutorialForm();
    },
    onError: (error: any) => {
      toast({ title: "Failed to update tutorial", description: error.message, variant: "destructive" });
    },
  });

  const deleteTutorialMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/help/tutorials/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/help/tutorials"] });
      toast({ title: "Tutorial deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to delete tutorial", description: error.message, variant: "destructive" });
    },
  });

  if (currentUser && !currentUser.isAdmin) {
    navigate("/");
    return null;
  }

  function resetTutorialForm() {
    setShowTutorialForm(false);
    setEditingTutorial(null);
    setTutorialTitle('');
    setTutorialDescription('');
    setTutorialCategory('overview');
    setTutorialVideoUrl('');
    setTutorialPublished(false);
  }

  function openEditTutorial(t: HelpTutorial) {
    setEditingTutorial(t);
    setTutorialTitle(t.title);
    setTutorialDescription(t.description || '');
    setTutorialCategory(t.category);
    setTutorialVideoUrl(t.videoUrl || '');
    setTutorialPublished(t.published);
    setShowTutorialForm(true);
  }

  function handleSaveTutorial() {
    const data = {
      title: tutorialTitle,
      description: tutorialDescription || null,
      category: tutorialCategory,
      videoUrl: tutorialVideoUrl || null,
      published: tutorialPublished,
      sortOrder: editingTutorial?.sortOrder ?? (tutorials?.length || 0),
    };
    if (editingTutorial) {
      updateTutorialMutation.mutate({ id: editingTutorial.id, data });
    } else {
      createTutorialMutation.mutate(data);
    }
  }

  function getLoomEmbedUrl(url: string) {
    const match = url.match(/loom\.com\/share\/([a-zA-Z0-9]+)/);
    if (match) return `https://www.loom.com/embed/${match[1]}`;
    if (url.includes('loom.com/embed/')) return url;
    return url;
  }

  const totalUnreadSupport = supportThreads?.reduce((sum: number, t: any) => sum + (t.unreadCount || 0), 0) || 0;

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary" data-testid="loading-spinner" />
      </div>
    );
  }

  const activeSubscribers = adminUsers?.filter(u => u.subscriptionStatus === 'active').length || 0;
  const trialingUsers = adminUsers?.filter(u => u.subscriptionStatus === 'trialing' && u.trialEndsAt && new Date(u.trialEndsAt) > new Date()).length || 0;
  const starterCount = adminUsers?.filter(u => (u.subscriptionTier === 'starter') && (u.subscriptionStatus === 'active' || (u.subscriptionStatus === 'trialing' && u.trialEndsAt && new Date(u.trialEndsAt) > new Date()))).length || 0;
  const coreCount = adminUsers?.filter(u => (u.subscriptionTier === 'core' || (!u.subscriptionTier && !u.isAdmin)) && (u.subscriptionStatus === 'active' || (u.subscriptionStatus === 'trialing' && u.trialEndsAt && new Date(u.trialEndsAt) > new Date()))).length || 0;
  const eliteCount = adminUsers?.filter(u => (u.subscriptionTier === 'elite' || u.isAdmin) && (u.subscriptionStatus === 'active' || (u.subscriptionStatus === 'trialing' && u.trialEndsAt && new Date(u.trialEndsAt) > new Date()))).length || 0;

  return (
    <div className="p-4 lg:p-6 pb-24 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <Shield className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold" data-testid="text-admin-title">Admin Dashboard</h1>
      </div>

      <Card className="mb-6 border-dashed border-primary/40">
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-primary mt-0.5" />
              <div>
                <p className="text-sm font-medium">Demo Mode — Switch Tier</p>
                <p className="text-xs text-muted-foreground">Flip your view between Starter, Core, or Elite for video demos. Your real subscription and data stay the same.</p>
              </div>
            </div>
            <div className="inline-flex items-center rounded-md border text-xs" data-testid="toggle-admin-tier">
              {(['starter', 'core', 'elite'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => adminTierMutation.mutate(t)}
                  disabled={adminTierMutation.isPending}
                  className={`px-3 py-1.5 transition-colors first:rounded-l-md last:rounded-r-md ${baseTier === t ? 'bg-primary text-primary-foreground font-medium' : 'text-muted-foreground'}`}
                  data-testid={`button-admin-tier-${t}`}
                >
                  {t === 'starter' ? 'Starter' : t === 'core' ? 'Core' : 'Elite'}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <Users className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold" data-testid="text-total-users">{adminUsers?.length || 0}</p>
                <p className="text-sm text-muted-foreground">Total Users</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <CreditCard className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold" data-testid="text-active-subscribers">{activeSubscribers}</p>
                <p className="text-sm text-muted-foreground">Active Subscribers</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold" data-testid="text-trialing-users">{trialingUsers}</p>
                <p className="text-sm text-muted-foreground">In Trial</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <Tag className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold" data-testid="text-promo-codes-count">{promoCodesData?.filter(p => p.active).length || 0}</p>
                <p className="text-sm text-muted-foreground">Active Promos</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardContent className="pt-4 pb-4">
          <p className="text-sm font-medium text-muted-foreground mb-3">Subscribers by Plan</p>
          <div className="flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-2" data-testid="stat-starter-count">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <span className="text-sm">Starter: <span className="font-bold">{starterCount}</span></span>
            </div>
            <div className="flex items-center gap-2" data-testid="stat-core-count">
              <div className="w-3 h-3 rounded-full bg-amber-500" />
              <span className="text-sm">Core: <span className="font-bold">{coreCount}</span></span>
            </div>
            <div className="flex items-center gap-2" data-testid="stat-elite-count">
              <div className="w-3 h-3 rounded-full bg-purple-500" />
              <span className="text-sm">Elite: <span className="font-bold">{eliteCount}</span></span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="users">
        <TabsList className="mb-4 flex-wrap gap-1">
          <TabsTrigger value="users" data-testid="tab-users">Users</TabsTrigger>
          <TabsTrigger value="promos" data-testid="tab-promos">Promo Codes</TabsTrigger>
          <TabsTrigger value="onboarding" data-testid="tab-onboarding">
            <CalendarDays className="w-3.5 h-3.5 mr-1" />
            Onboarding
            {onboardingData?.filter((b: any) => b.status === 'pending').length ? (
              <Badge variant="destructive" className="ml-1 text-[10px] px-1.5 py-0">
                {onboardingData.filter((b: any) => b.status === 'pending').length}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="help" data-testid="tab-help">
            <HelpCircle className="w-3.5 h-3.5 mr-1" />
            Help Center
          </TabsTrigger>
          <TabsTrigger value="support" data-testid="tab-support">
            <MessageCircle className="w-3.5 h-3.5 mr-1" />
            Support
            {totalUnreadSupport > 0 && (
              <Badge variant="destructive" className="ml-1 text-[10px] px-1.5 py-0">
                {totalUnreadSupport}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Registered Users</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {adminUsers?.map((user) => {
                  const teamCount = user.teamMembers?.length || 0;
                  const isExpanded = expandedOwners.has(user.id);
                  return (
                  <div key={user.id} className="space-y-0">
                  <div
                    className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-md border"
                    data-testid={`row-user-${user.id}`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {teamCount > 0 ? (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 shrink-0"
                          onClick={() => toggleExpandOwner(user.id)}
                          data-testid={`button-expand-team-${user.id}`}
                          title={isExpanded ? 'Collapse team' : 'Expand team'}
                        >
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </Button>
                      ) : (
                        <div className="w-7 shrink-0" />
                      )}
                      {user.profileImageUrl ? (
                        <img src={user.profileImageUrl} alt="" className="w-9 h-9 rounded-full shrink-0" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                          <Users className="w-4 h-4 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-medium truncate" data-testid={`text-user-name-${user.id}`}>
                          {user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.email}
                          {teamCount > 0 && (
                            <Badge variant="secondary" className="ml-2 text-[10px]" data-testid={`badge-team-count-${user.id}`}>
                              +{teamCount} team
                            </Badge>
                          )}
                        </p>
                        <p className="text-sm text-muted-foreground truncate" data-testid={`text-user-email-${user.id}`}>
                          {user.email}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {getSubscriptionBadge(user)}
                      {user.fuseAiStatus === 'active' && (
                        <Badge variant="secondary" className="text-purple-600 dark:text-purple-400" data-testid={`badge-fuse-ai-${user.id}`}>
                          <Sparkles className="w-3 h-3 mr-1" />
                          AI
                        </Badge>
                      )}
                      <Badge variant="outline" data-testid={`badge-contacts-${user.id}`}>
                        {user.contactCount} contacts
                      </Badge>
                      <Badge variant="outline" data-testid={`badge-docs-${user.id}`}>
                        {user.documentCount} docs
                      </Badge>
                      {user.lastActiveAt && (
                        <Badge variant="outline" className="text-xs" data-testid={`badge-last-active-${user.id}`}>
                          <Clock className="w-3 h-3 mr-1" />
                          {formatDistanceToNow(new Date(user.lastActiveAt), { addSuffix: true })}
                        </Badge>
                      )}
                      {user.createdAt && (
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          Joined {format(new Date(user.createdAt), "MMM d, yyyy")}
                        </span>
                      )}
                      {!user.isAdmin && (
                        <>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setSelectedUser(user)}
                            data-testid={`button-manage-sub-${user.id}`}
                            title="Manage subscription"
                          >
                            <Crown className="w-4 h-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="icon" variant="ghost" title="Wipe contacts & projects" data-testid={`button-cleanup-user-${user.id}`}>
                                <FileText className="w-4 h-4 text-amber-600" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Wipe Contacts & Projects</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently delete all contacts ({user.contactCount}) and projects for {user.email}. The user account will remain. This cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => cleanupMutation.mutate(user.email)}
                                  className="bg-amber-600 text-white hover:bg-amber-700"
                                  data-testid="button-confirm-cleanup"
                                >
                                  {cleanupMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Wipe Data"}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="icon" variant="ghost" data-testid={`button-delete-user-${user.id}`}>
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete User</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently delete {user.email} and all their data. This cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteMutation.mutate(user.id)}
                                  className="bg-destructive text-destructive-foreground hover-elevate"
                                  data-testid="button-confirm-delete"
                                >
                                  {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </>
                      )}
                    </div>
                  </div>
                  {isExpanded && teamCount > 0 && (
                    <div className="ml-10 mt-1 mb-2 space-y-1 border-l-2 border-muted pl-4" data-testid={`team-list-${user.id}`}>
                      {user.teamMembers!.map((m) => (
                        <div
                          key={m.id}
                          className="flex items-center justify-between gap-3 p-2 rounded-md bg-muted/30"
                          data-testid={`row-team-member-${m.id}`}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            {m.profileImageUrl ? (
                              <img src={m.profileImageUrl} alt="" className="w-7 h-7 rounded-full shrink-0" />
                            ) : (
                              <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                                <UserCircle2 className="w-4 h-4 text-muted-foreground" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">
                                {m.firstName && m.lastName ? `${m.firstName} ${m.lastName}` : (m.email || m.userId)}
                              </p>
                              {m.email && (
                                <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge variant="outline" className="text-[10px]">{formatTeamRole(m.role)}</Badge>
                            {m.lastActiveAt && (
                              <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                <Clock className="w-3 h-3 inline mr-0.5" />
                                {formatDistanceToNow(new Date(m.lastActiveAt), { addSuffix: true })}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  </div>
                  );
                })}
                {(!adminUsers || adminUsers.length === 0) && (
                  <p className="text-muted-foreground text-center py-8">No users found</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="promos">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle className="text-lg">Promo Codes</CardTitle>
              <Button onClick={() => setShowCreatePromo(true)} data-testid="button-new-promo">
                <Plus className="w-4 h-4 mr-2" />
                New Promo Code
              </Button>
            </CardHeader>
            <CardContent>
              {promoLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : (
                <div className="space-y-3">
                  {promoCodesData?.map((promo) => (
                    <div
                      key={promo.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-md border"
                      data-testid={`row-promo-${promo.id}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-mono font-bold" data-testid={`text-promo-code-${promo.id}`}>{promo.code}</p>
                          <Badge variant={promo.active ? "default" : "secondary"}>
                            {promo.active ? "Active" : "Inactive"}
                          </Badge>
                          {promo.tier && <Badge variant="outline">{promo.tier}</Badge>}
                          {promo.appliesTo && promo.appliesTo !== 'plan' && (
                            <Badge variant="outline" className="text-xs">
                              {promo.appliesTo === 'fuse_ai' ? 'FuseAI' : promo.appliesTo === 'ai_assistant' ? 'AI Assistant' : promo.appliesTo === 'time_tracking' ? 'Time Tracking' : promo.appliesTo === 'job_costing' ? 'Job Costing' : promo.appliesTo}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {promo.discountAmount > 0 ? (
                            promo.discountType === 'fixed'
                              ? `$${(promo.discountAmount / 100).toFixed(2)} off`
                              : `${promo.discountAmount}% off`
                          ) : ''}
                          {promo.discountAmount > 0 && !promo.durationMonths ? ' forever' : ''}
                          {promo.durationMonths ? ` for ${promo.durationMonths} mo` : ''}
                          {promo.trialDays ? `${promo.discountAmount > 0 ? ' + ' : ''}${promo.trialDays}-day free trial` : ''}
                          {promo.description && ` - ${promo.description}`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Used: {promo.currentUses || 0}{promo.maxUses ? `/${promo.maxUses}` : ''} times
                          {promo.expiresAt && ` | Expires: ${format(new Date(promo.expiresAt), "MMM d, yyyy")}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => togglePromoMutation.mutate({ id: promo.id, active: !promo.active })}
                          data-testid={`button-toggle-promo-${promo.id}`}
                        >
                          {promo.active ? "Disable" : "Enable"}
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost" data-testid={`button-delete-promo-${promo.id}`}>
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Promo Code</AlertDialogTitle>
                              <AlertDialogDescription>
                                Delete promo code "{promo.code}"? This cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deletePromoMutation.mutate(promo.id)}
                                className="bg-destructive text-destructive-foreground hover-elevate"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  ))}
                  {(!promoCodesData || promoCodesData.length === 0) && (
                    <p className="text-muted-foreground text-center py-8">No promo codes yet</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="onboarding">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Onboarding Bookings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {onboardingData?.map((booking: any) => (
                  <div
                    key={booking.id}
                    className="flex flex-wrap items-start justify-between gap-3 p-3 rounded-md border"
                    data-testid={`row-booking-${booking.id}`}
                  >
                    <div className="min-w-0">
                      <p className="font-medium">
                        {booking.userFirstName && booking.userLastName
                          ? `${booking.userFirstName} ${booking.userLastName}`
                          : booking.userEmail}
                      </p>
                      <p className="text-sm text-muted-foreground">{booking.userEmail}</p>
                      <p className="text-sm mt-1">
                        Preferred: <span className="font-medium">{format(new Date(booking.preferredDate), 'MMMM d, yyyy')}</span>
                      </p>
                      {booking.notes && (
                        <p className="text-sm text-muted-foreground mt-1">Notes: {booking.notes}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge variant={booking.status === 'pending' ? 'secondary' : booking.status === 'confirmed' ? 'default' : 'outline'}>
                        {booking.status}
                      </Badge>
                      {booking.status === 'pending' && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <Input
                            type="text"
                            placeholder="e.g. 2:00 PM"
                            className="w-28"
                            value={bookingTimes[booking.id] || ''}
                            onChange={(e) => setBookingTimes(prev => ({ ...prev, [booking.id]: e.target.value }))}
                            data-testid={`input-confirm-time-${booking.id}`}
                          />
                          <Button
                            size="sm"
                            disabled={confirmBookingMutation.isPending}
                            onClick={() => confirmBookingMutation.mutate({
                              id: booking.id,
                              confirmedTime: bookingTimes[booking.id] || undefined,
                              status: 'confirmed',
                            })}
                            data-testid={`button-confirm-booking-${booking.id}`}
                          >
                            <Check className="w-3.5 h-3.5 mr-1" /> Confirm
                          </Button>
                        </div>
                      )}
                      {booking.confirmedTime && (
                        <p className="text-sm text-muted-foreground">Time: {booking.confirmedTime}</p>
                      )}
                    </div>
                  </div>
                ))}
                {(!onboardingData || onboardingData.length === 0) && (
                  <p className="text-muted-foreground text-center py-8">No onboarding bookings yet</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="support">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-1">
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-lg">Conversations</CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setShowNewChat(true); setNewChatSearch(''); }}
                  data-testid="button-new-support-chat"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  New
                </Button>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {supportThreads?.map((thread: any) => (
                    <div
                      key={thread.userId}
                      className={`p-3 rounded-md border cursor-pointer hover-elevate ${selectedThread === thread.userId ? 'bg-muted' : ''}`}
                      onClick={() => {
                        setSelectedThread(thread.userId);
                        if (thread.unreadCount > 0) markReadMutation.mutate(thread.userId);
                      }}
                      data-testid={`thread-${thread.userId}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-sm truncate">
                          {thread.userFirstName && thread.userLastName
                            ? `${thread.userFirstName} ${thread.userLastName}`
                            : thread.userEmail}
                        </p>
                        {thread.unreadCount > 0 && (
                          <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                            {thread.unreadCount}
                          </Badge>
                        )}
                      </div>
                      {thread.lastMessage && (
                        <p className="text-xs text-muted-foreground truncate mt-1">{thread.lastMessage.message}</p>
                      )}
                    </div>
                  ))}
                  {(!supportThreads || supportThreads.length === 0) && (
                    <p className="text-muted-foreground text-center py-4 text-sm">No support messages yet</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-lg">
                  {selectedThread
                    ? (() => {
                        const thread = supportThreads?.find((t: any) => t.userId === selectedThread);
                        const adminUser = adminUsers?.find(u => u.id === selectedThread);
                        const firstName = thread?.userFirstName || adminUser?.firstName;
                        const lastName = thread?.userLastName || adminUser?.lastName;
                        const fullName = firstName && lastName ? `${firstName} ${lastName}` : firstName;
                        return `Chat with ${fullName || thread?.userEmail || adminUser?.email || 'User'}`;
                      })()
                    : 'Select a conversation'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {selectedThread ? (
                  <div className="space-y-4">
                    <div className="h-64 overflow-y-auto space-y-2 p-2 rounded-md border">
                      {(() => {
                        const threadMessages = supportThreads
                          ?.find((t: any) => t.userId === selectedThread)
                          ?.messages?.sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
                        if (!threadMessages || threadMessages.length === 0) {
                          const targetUser = adminUsers?.find(u => u.id === selectedThread);
                          return (
                            <p className="text-muted-foreground text-center py-8 text-sm">
                              No messages yet. Send a message to {targetUser?.firstName || targetUser?.email || 'this user'} below.
                            </p>
                          );
                        }
                        return threadMessages.map((msg: any) => (
                          <div
                            key={msg.id}
                            className={`max-w-[80%] rounded-md px-3 py-2 text-sm ${
                              msg.senderType === 'admin'
                                ? 'ml-auto bg-primary text-primary-foreground'
                                : 'mr-auto bg-muted'
                            }`}
                          >
                            <p>{msg.message}</p>
                            <p className={`text-[10px] mt-1 ${msg.senderType === 'admin' ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                              {format(new Date(msg.createdAt), 'MMM d, h:mm a')}
                            </p>
                          </div>
                        ));
                      })()}
                    </div>
                    <form
                      className="flex gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (replyText.trim() && selectedThread) {
                          replyMutation.mutate({ userId: selectedThread, message: replyText.trim() });
                        }
                      }}
                    >
                      <Input
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder="Type your reply..."
                        className="flex-1"
                        data-testid="input-admin-reply"
                      />
                      <Button
                        size="icon"
                        type="submit"
                        disabled={!replyText.trim() || replyMutation.isPending}
                        data-testid="button-admin-send-reply"
                      >
                        <Send className="w-4 h-4" />
                      </Button>
                    </form>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-8">Select a conversation to view messages</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="help">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Video className="w-5 h-5" />
                Help Center Tutorials
              </CardTitle>
              <Button
                size="sm"
                onClick={() => { resetTutorialForm(); setShowTutorialForm(true); }}
                data-testid="button-add-tutorial"
              >
                <Plus className="w-4 h-4 mr-1" /> Add Tutorial
              </Button>
            </CardHeader>
            <CardContent>
              {showTutorialForm && (
                <Card className="mb-6 border-primary/20">
                  <CardContent className="pt-4 space-y-4">
                    <h3 className="font-semibold text-sm">{editingTutorial ? 'Edit Tutorial' : 'New Tutorial'}</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label>Title</Label>
                        <Input
                          placeholder="e.g., Getting Started with Fuse Phone"
                          value={tutorialTitle}
                          onChange={(e) => setTutorialTitle(e.target.value)}
                          data-testid="input-tutorial-title"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Category</Label>
                        <Select value={tutorialCategory} onValueChange={setTutorialCategory}>
                          <SelectTrigger data-testid="select-tutorial-category">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {HELP_CATEGORIES.map(c => (
                              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Description</Label>
                      <Input
                        placeholder="Brief description of what this tutorial covers"
                        value={tutorialDescription}
                        onChange={(e) => setTutorialDescription(e.target.value)}
                        data-testid="input-tutorial-description"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Video URL (Loom share link)</Label>
                      <Input
                        placeholder="https://www.loom.com/share/abc123..."
                        value={tutorialVideoUrl}
                        onChange={(e) => setTutorialVideoUrl(e.target.value)}
                        data-testid="input-tutorial-video-url"
                      />
                    </div>
                    {editingTutorial?.recordingNotes && (
                      <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3">
                        <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1 flex items-center gap-1">
                          <Video className="w-3 h-3" /> Recording Guide
                        </p>
                        <p className="text-xs text-blue-600 dark:text-blue-400 leading-relaxed">{editingTutorial.recordingNotes}</p>
                      </div>
                    )}
                    {tutorialVideoUrl && tutorialVideoUrl.includes('loom.com') && (
                      <div className="rounded-lg overflow-hidden border bg-muted/30">
                        <p className="text-xs text-muted-foreground px-3 pt-2">Preview:</p>
                        <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                          <iframe
                            src={getLoomEmbedUrl(tutorialVideoUrl)}
                            className="absolute inset-0 w-full h-full"
                            frameBorder="0"
                            allowFullScreen
                          />
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={tutorialPublished}
                          onChange={(e) => setTutorialPublished(e.target.checked)}
                          className="rounded"
                          data-testid="checkbox-tutorial-published"
                        />
                        <span className="text-sm">Published (visible to users)</span>
                      </label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={handleSaveTutorial}
                        disabled={!tutorialTitle || createTutorialMutation.isPending || updateTutorialMutation.isPending}
                        data-testid="button-save-tutorial"
                      >
                        {(createTutorialMutation.isPending || updateTutorialMutation.isPending) ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-1" />
                        ) : null}
                        {editingTutorial ? 'Update' : 'Create'}
                      </Button>
                      <Button variant="outline" size="sm" onClick={resetTutorialForm} data-testid="button-cancel-tutorial">
                        Cancel
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {HELP_CATEGORIES.map(cat => {
                const catTutorials = tutorials?.filter(t => t.category === cat.value)
                  .sort((a, b) => a.sortOrder - b.sortOrder) || [];
                if (catTutorials.length === 0) return null;
                return (
                  <div key={cat.value} className="mb-6">
                    <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-3">{cat.label}</h3>
                    <div className="space-y-2">
                      {catTutorials.map(t => (
                        <div
                          key={t.id}
                          className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/30 transition-colors"
                          data-testid={`tutorial-item-${t.id}`}
                        >
                          <GripVertical className="w-4 h-4 text-muted-foreground/50 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium text-sm truncate">{t.title}</p>
                              {t.published ? (
                                <Badge variant="default" className="text-[10px] shrink-0">
                                  <Eye className="w-3 h-3 mr-0.5" /> Live
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="text-[10px] shrink-0">
                                  <EyeOff className="w-3 h-3 mr-0.5" /> Draft
                                </Badge>
                              )}
                              {!t.videoUrl && (
                                <Badge variant="outline" className="text-[10px] shrink-0 text-amber-600 border-amber-300">
                                  Needs Video
                                </Badge>
                              )}
                            </div>
                            {t.description && (
                              <p className="text-xs text-muted-foreground truncate mt-0.5">{t.description}</p>
                            )}
                            {t.videoUrl ? (
                              <a
                                href={t.videoUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-primary flex items-center gap-1 mt-0.5 hover:underline"
                              >
                                <ExternalLink className="w-3 h-3" /> View video
                              </a>
                            ) : t.recordingNotes ? (
                              <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5 truncate">
                                <Video className="w-3 h-3 inline mr-1" />{t.recordingNotes.slice(0, 80)}...
                              </p>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => updateTutorialMutation.mutate({
                                id: t.id,
                                data: { published: !t.published }
                              })}
                              data-testid={`button-toggle-tutorial-${t.id}`}
                            >
                              {t.published ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditTutorial(t)}
                              data-testid={`button-edit-tutorial-${t.id}`}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="sm" data-testid={`button-delete-tutorial-${t.id}`}>
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Tutorial</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete "{t.title}"? This cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => deleteTutorialMutation.mutate(t.id)}>
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              {(!tutorials || tutorials.length === 0) && !showTutorialForm && (
                <div className="text-center py-12">
                  <Video className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">No tutorials yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Click "Add Tutorial" to create your first help video</p>
                </div>
              )}

              {tutorials && tutorials.length > 0 && (
                <div className="mt-4 p-3 rounded-lg bg-muted/30 border border-dashed">
                  <p className="text-xs text-muted-foreground">
                    <strong>{tutorials.filter(t => t.videoUrl).length}</strong> of {tutorials.length} tutorials have videos.
                    Click the edit button on any tutorial to see recording instructions, then paste your Loom link and publish it.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {selectedUser && (
        <UserSubscriptionDialog
          user={selectedUser}
          open={!!selectedUser}
          onOpenChange={(open) => !open && setSelectedUser(null)}
        />
      )}

      <CreatePromoCodeDialog open={showCreatePromo} onOpenChange={setShowCreatePromo} />

      <Dialog open={showNewChat} onOpenChange={(open) => { setShowNewChat(open); if (!open) setNewChatSearch(''); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start New Conversation</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input
              placeholder="Search users by name or email..."
              value={newChatSearch}
              onChange={(e) => setNewChatSearch(e.target.value)}
              data-testid="input-new-chat-search"
              autoFocus
            />
            {newChatSearch.trim() ? (
              <div className="max-h-64 overflow-y-auto space-y-1">
                {adminUsers
                  ?.filter(u => {
                    if (u.isAdmin) return false;
                    const q = newChatSearch.toLowerCase();
                    const name = `${u.firstName || ''} ${u.lastName || ''}`.toLowerCase();
                    return name.includes(q) || u.email.toLowerCase().includes(q);
                  })
                  .map(u => {
                    const hasThread = supportThreads?.some((t: any) => t.userId === u.id);
                    return (
                      <div
                        key={u.id}
                        className="flex items-center justify-between gap-2 p-2.5 rounded-md border cursor-pointer hover-elevate"
                        onClick={() => {
                          setSelectedThread(u.id);
                          setShowNewChat(false);
                          setNewChatSearch('');
                        }}
                        data-testid={`new-chat-user-${u.id}`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm truncate">
                            {u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : u.email}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                        </div>
                        {hasThread && (
                          <Badge variant="secondary" className="text-[10px] shrink-0">Existing</Badge>
                        )}
                      </div>
                    );
                  })}
                {adminUsers?.filter(u => {
                  if (u.isAdmin) return false;
                  const q = newChatSearch.toLowerCase();
                  const name = `${u.firstName || ''} ${u.lastName || ''}`.toLowerCase();
                  return name.includes(q) || u.email.toLowerCase().includes(q);
                }).length === 0 && (
                  <p className="text-muted-foreground text-center py-4 text-sm">No users found</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-2">Type a name or email to find a user</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
