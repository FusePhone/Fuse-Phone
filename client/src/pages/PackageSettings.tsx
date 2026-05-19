import { useState, useCallback, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Pencil, Trash2, Star, Check, X, Layers, Package, BookOpen, Copy, GripVertical, Lock, Gift, Settings2, ChevronLeft } from "lucide-react";
import { useLocation } from "wouter";
import { useSafeBack } from "@/hooks/use-safe-back";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useIsNativeApp } from "@/hooks/use-ios-app";
import type { ProposalPackage, CompanySettings, PackageFeatureLibrary, PackageFeatureAssignment } from "@shared/schema";

function SortablePackageItem({
  pkg,
  libraryFeatures,
  featureAssignments,
  packages,
  onEdit,
  onDelete,
}: {
  pkg: ProposalPackage;
  libraryFeatures: PackageFeatureLibrary[];
  featureAssignments: PackageFeatureAssignment[];
  packages: ProposalPackage[];
  onEdit: (pkg: ProposalPackage) => void;
  onDelete: (id: number) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: pkg.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="p-4 rounded-xl border bg-card"
      data-testid={`package-item-${pkg.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <button
            type="button"
            className="mt-1 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
            {...attributes}
            {...listeners}
            data-testid={`drag-handle-package-${pkg.id}`}
          >
            <GripVertical className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-base font-semibold">{pkg.name}</span>
              {pkg.recommended && (
                <span className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400">
                  <Star className="w-3 h-3 fill-current" />
                  Recommended
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                {pkg.priceAdjustmentType === 'percent' ? `+${pkg.adjustmentValue}%` : `+$${pkg.adjustmentValue}`}
              </span>
            </div>
            {pkg.description && <p className="text-xs text-muted-foreground mt-0.5">{pkg.description}</p>}
          </div>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(pkg)} data-testid={`button-edit-package-${pkg.id}`}>
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive/70 hover:text-destructive" onClick={() => onDelete(pkg.id)} data-testid={`button-delete-package-${pkg.id}`}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {libraryFeatures.length > 0 && (
        <InlineFeatureMatrix
          pkg={pkg}
          allFeatures={libraryFeatures}
          assignments={featureAssignments}
          packages={packages}
        />
      )}
    </div>
  );
}

function FeatureForm({
  open,
  onClose,
  editFeature,
}: {
  open: boolean;
  onClose: () => void;
  editFeature?: PackageFeatureLibrary | null;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState(editFeature?.title || '');
  const [description, setDescription] = useState(editFeature?.description || '');

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      if (editFeature) {
        return apiRequest('PATCH', `/api/package-features/${editFeature.id}`, data);
      }
      return apiRequest('POST', '/api/package-features', data);
    },
    onSuccess: () => {
      toast({ title: editFeature ? "Feature updated" : "Feature created" });
      queryClient.invalidateQueries({ queryKey: ['/api/package-features'] });
      queryClient.invalidateQueries({ queryKey: ['/api/package-feature-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/proposal-packages'] });
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleSave = () => {
    if (!title.trim()) return;
    mutation.mutate({
      title: title.trim(),
      description: description.trim() || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{editFeature ? 'Edit Feature' : 'Add Feature'}</DialogTitle>
          <DialogDescription>
            {editFeature ? 'Update this reusable feature' : 'Create a reusable feature for your packages'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Feature Title</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Premium materials" data-testid="input-feature-title" />
          </div>
          <div className="space-y-1.5">
            <Label>Description (optional)</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Brief description..." rows={2} data-testid="input-feature-description" />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0 mt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!title.trim() || mutation.isPending} data-testid="button-save-feature">
            {mutation.isPending ? 'Saving...' : editFeature ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InlineFeatureMatrix({
  pkg,
  allFeatures,
  assignments,
  packages,
}: {
  pkg: ProposalPackage;
  allFeatures: PackageFeatureLibrary[];
  assignments: PackageFeatureAssignment[];
  packages: ProposalPackage[];
}) {
  const { toast } = useToast();
  const pkgAssignments = assignments.filter(a => a.packageId === pkg.id);
  const serverStatusMap = new Map(pkgAssignments.map(a => [a.featureId, a.included]));

  const [optimisticOverrides, setOptimisticOverrides] = useState<Map<number, boolean>>(new Map());
  const pendingRef = useRef<Set<number>>(new Set());

  const getStatus = useCallback((featureId: number): boolean => {
    if (optimisticOverrides.has(featureId)) return optimisticOverrides.get(featureId)!;
    return serverStatusMap.get(featureId) === true;
  }, [optimisticOverrides, serverStatusMap]);

  const toggleMutation = useMutation({
    mutationFn: async ({ featureId, included }: { featureId: number; included: boolean }) => {
      return apiRequest('POST', `/api/proposal-packages/${pkg.id}/features/toggle`, { featureId, included });
    },
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['/api/package-feature-assignments'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/proposal-packages'] });
      pendingRef.current.delete(variables.featureId);
      setOptimisticOverrides(prev => {
        const next = new Map(prev);
        next.delete(variables.featureId);
        return next;
      });
    },
    onError: (err: any, variables) => {
      pendingRef.current.delete(variables.featureId);
      setOptimisticOverrides(prev => {
        const next = new Map(prev);
        next.delete(variables.featureId);
        return next;
      });
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const copyMutation = useMutation({
    mutationFn: async (toPackageId: number) => {
      return apiRequest('POST', '/api/proposal-packages/copy-features', {
        fromPackageId: pkg.id,
        toPackageId,
      });
    },
    onSuccess: () => {
      toast({ title: "Features copied" });
      queryClient.invalidateQueries({ queryKey: ['/api/package-feature-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/proposal-packages'] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleToggle = (featureId: number) => {
    if (pendingRef.current.has(featureId)) return;
    const currentStatus = getStatus(featureId);
    const newIncluded = !currentStatus;

    pendingRef.current.add(featureId);
    setOptimisticOverrides(prev => {
      const next = new Map(prev);
      next.set(featureId, newIncluded);
      return next;
    });

    toggleMutation.mutate({ featureId, included: newIncluded });
  };

  const activeFeatures = allFeatures.filter(f => f.active !== false);
  const otherPackages = packages.filter(p => p.id !== pkg.id);
  const includedCount = activeFeatures.filter(f => getStatus(f.id)).length;

  const globalFeatureOrder = useMemo(() => {
    const order: number[] = [];
    const seen = new Set<number>();
    for (const p of packages) {
      const pAssigns = assignments.filter(a => a.packageId === p.id);
      const pMap = new Map(pAssigns.map(a => [a.featureId, a.included]));
      for (const f of allFeatures) {
        if (!seen.has(f.id) && pMap.get(f.id) === true) {
          order.push(f.id);
          seen.add(f.id);
        }
      }
    }
    for (const f of allFeatures) {
      if (!seen.has(f.id)) {
        order.push(f.id);
        seen.add(f.id);
      }
    }
    return order;
  }, [packages, assignments, allFeatures]);

  const featureIdMap = useMemo(() => new Map(allFeatures.map(f => [f.id, f])), [allFeatures]);
  const activeIds = new Set(activeFeatures.map(f => f.id));
  const sortedFeatures = globalFeatureOrder.filter(id => featureIdMap.has(id) && activeIds.has(id)).map(id => featureIdMap.get(id)!);

  if (activeFeatures.length === 0) return null;

  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-xs text-muted-foreground">
          {includedCount} of {activeFeatures.length} included
        </span>
        {otherPackages.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Copy to:</span>
            {otherPackages.map(op => (
              <Button
                key={op.id}
                variant="outline"
                size="sm"
                className="h-6 text-[11px] gap-1 px-2"
                onClick={() => copyMutation.mutate(op.id)}
                disabled={copyMutation.isPending}
                data-testid={`button-copy-${pkg.id}-to-${op.id}`}
              >
                <Copy className="w-3 h-3" />
                {op.name}
              </Button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-1">
        {sortedFeatures.map(feat => {
          const isIncluded = getStatus(feat.id);
          return (
            <button
              key={feat.id}
              type="button"
              onClick={() => handleToggle(feat.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all text-left ${
                isIncluded
                  ? 'bg-emerald-500/8 hover:bg-emerald-500/12'
                  : 'bg-muted/20 hover:bg-muted/40'
              }`}
              data-testid={`feature-toggle-${pkg.id}-${feat.id}`}
            >
              <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                isIncluded
                  ? 'bg-emerald-500 text-white'
                  : 'bg-gray-300 dark:bg-gray-600 text-white'
              }`}>
                {isIncluded ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
              </div>
              <div className="flex-1 min-w-0">
                <span className={`text-sm ${isIncluded ? 'font-medium' : 'text-muted-foreground'}`}>
                  {feat.title}
                </span>
              </div>
              <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                isIncluded
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
              }`}>
                {isIncluded ? 'Included' : 'Excluded'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PackageForm({
  open,
  onClose,
  editPkg,
  materialAdjEnabled,
}: {
  open: boolean;
  onClose: () => void;
  editPkg?: ProposalPackage | null;
  materialAdjEnabled: boolean;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(editPkg?.name || '');
  const [description, setDescription] = useState(editPkg?.description || '');
  const [recommended, setRecommended] = useState(editPkg?.recommended || false);
  const [priceType, setPriceType] = useState<string>(editPkg?.priceAdjustmentType || 'percent');
  const [adjustmentValue, setAdjustmentValue] = useState<string>(String(editPkg?.adjustmentValue || 0));
  const [materialMultiplier, setMaterialMultiplier] = useState<string>(String(editPkg?.materialMultiplier || 1.0));

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      if (editPkg) {
        return apiRequest('PATCH', `/api/proposal-packages/${editPkg.id}`, data);
      }
      return apiRequest('POST', '/api/proposal-packages', data);
    },
    onSuccess: () => {
      toast({ title: editPkg ? "Package updated" : "Package created" });
      queryClient.invalidateQueries({ queryKey: ['/api/proposal-packages'] });
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleSave = () => {
    if (!name.trim()) return;
    mutation.mutate({
      name: name.trim(),
      description: description.trim() || null,
      recommended,
      priceAdjustmentType: priceType,
      adjustmentValue: parseFloat(adjustmentValue) || 0,
      materialMultiplier: parseFloat(materialMultiplier) || 1.0,
      features: editPkg?.features || [],
      sortOrder: editPkg?.sortOrder || 0,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editPkg ? 'Edit Package' : 'Add Package'}</DialogTitle>
          <DialogDescription>
            {editPkg ? 'Update this pricing package' : 'Create a new pricing package for your proposals'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Package Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Premium" data-testid="input-package-name" />
          </div>
          <div className="space-y-1.5">
            <Label>Description (optional)</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Brief description..." rows={2} data-testid="input-package-description" />
          </div>
          <div className="flex items-center justify-between">
            <Label>Recommended Package</Label>
            <Switch checked={recommended} onCheckedChange={setRecommended} data-testid="switch-recommended" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Price Adjustment</Label>
              <Select value={priceType} onValueChange={setPriceType}>
                <SelectTrigger data-testid="select-price-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">Percent (%)</SelectItem>
                  <SelectItem value="flat">Flat ($)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{priceType === 'percent' ? 'Percent Increase' : 'Dollar Increase'}</Label>
              <Input
                type="number"
                value={adjustmentValue}
                onChange={e => setAdjustmentValue(e.target.value)}
                placeholder={priceType === 'percent' ? '20' : '500'}
                data-testid="input-adjustment-value"
              />
            </div>
          </div>
          {materialAdjEnabled && (
            <div className="space-y-1.5">
              <Label>Material Multiplier</Label>
              <Input
                type="number"
                step="0.01"
                value={materialMultiplier}
                onChange={e => setMaterialMultiplier(e.target.value)}
                placeholder="1.08"
                data-testid="input-material-multiplier"
              />
              <p className="text-xs text-muted-foreground">1.0 = no change, 1.08 = 8% more materials</p>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-0 mt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!name.trim() || mutation.isPending} data-testid="button-save-package">
            {mutation.isPending ? 'Saving...' : editPkg ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function PackageSettings() {
  const { user } = useAuth();
  const userTier = user?.subscriptionTier || 'starter';
  const isNativeApp = useIsNativeApp();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const handleBack = useSafeBack("/settings/company");
  const [featureDialog, setFeatureDialog] = useState<{ open: boolean; edit?: PackageFeatureLibrary | null }>({ open: false });
  const [pkgDialog, setPkgDialog] = useState<{ open: boolean; edit?: ProposalPackage | null }>({ open: false });

  const { data: settings } = useQuery<CompanySettings>({ queryKey: ['/api/settings/company'] });
  const { data: packages = [] } = useQuery<ProposalPackage[]>({ queryKey: ['/api/proposal-packages'] });
  const { data: libraryFeatures = [] } = useQuery<PackageFeatureLibrary[]>({ queryKey: ['/api/package-features'] });
  const { data: featureAssignments = [] } = useQuery<PackageFeatureAssignment[]>({ queryKey: ['/api/package-feature-assignments'] });

  const updateSettings = useMutation({
    mutationFn: (updates: any) => apiRequest('PUT', '/api/settings/company', updates),
    onMutate: async (updates: any) => {
      await queryClient.cancelQueries({ queryKey: ['/api/settings/company'] });
      const previous = queryClient.getQueryData<CompanySettings>(['/api/settings/company']);
      queryClient.setQueryData(['/api/settings/company'], (old: any) => ({ ...old, ...updates }));
      return { previous };
    },
    onError: (_err: any, _updates: any, context: any) => {
      if (context?.previous) {
        queryClient.setQueryData(['/api/settings/company'], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/settings/company'] });
    },
  });

  const deletePkg = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/proposal-packages/${id}`),
    onSuccess: () => {
      toast({ title: "Package deleted" });
      queryClient.invalidateQueries({ queryKey: ['/api/proposal-packages'] });
      queryClient.invalidateQueries({ queryKey: ['/api/package-feature-assignments'] });
    },
  });

  const deleteFeature = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/package-features/${id}`),
    onSuccess: () => {
      toast({ title: "Feature deleted" });
      queryClient.invalidateQueries({ queryKey: ['/api/package-features'] });
      queryClient.invalidateQueries({ queryKey: ['/api/package-feature-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/proposal-packages'] });
    },
  });

  const toggleFeatureActive = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      apiRequest('PATCH', `/api/package-features/${id}`, { active }),
    onMutate: async ({ id, active }) => {
      await queryClient.cancelQueries({ queryKey: ['/api/package-features'] });
      const prev = queryClient.getQueryData<PackageFeatureLibrary[]>(['/api/package-features']);
      queryClient.setQueryData(['/api/package-features'], (old: PackageFeatureLibrary[] | undefined) =>
        old?.map(f => f.id === id ? { ...f, active } : f)
      );
      return { prev };
    },
    onError: (_err: any, _vars: any, context: any) => {
      if (context?.prev) queryClient.setQueryData(['/api/package-features'], context.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/package-features'] });
      queryClient.invalidateQueries({ queryKey: ['/api/proposal-packages'] });
      queryClient.invalidateQueries({ queryKey: ['/api/package-feature-assignments'] });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: number[]) => apiRequest('PUT', '/api/proposal-packages/reorder', { orderedIds }),
    onError: () => {
      toast({ title: "Failed to save order", variant: "destructive" });
      queryClient.invalidateQueries({ queryKey: ['/api/proposal-packages'] });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/proposal-packages'] });
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || reorderMutation.isPending) return;
    const oldIndex = packages.findIndex(p => p.id === active.id);
    const newIndex = packages.findIndex(p => p.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(packages, oldIndex, newIndex);
    queryClient.setQueryData(['/api/proposal-packages'], reordered);
    reorderMutation.mutate(reordered.map(p => p.id));
  };

  if (userTier !== 'elite' && !user?.isAdmin) {
    return (
      <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
        <div className="text-center py-16">
          <Lock className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Elite Plan Feature</h2>
          <p className="text-muted-foreground mb-4">
            {isNativeApp
              ? "Packages is available to accounts with Elite access."
              : "Packages is available exclusively on the Elite plan."}
          </p>
          {!isNativeApp && (
            <Button onClick={() => window.location.href = '/settings/subscription'} data-testid="button-upgrade-elite">
              Upgrade to Elite
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 pb-40 space-y-6">
      <div>
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="ghost" size="icon" onClick={handleBack} data-testid="button-back">
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Layers className="w-6 h-6" />
            Packages
          </h1>
          {!isNativeApp && (
            <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 border-0" data-testid="badge-free-addon">
              <Gift className="w-3 h-3 mr-1" />
              Free Add-On — Limited Time
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground mt-1">
          Create pricing packages for your proposals
        </p>
      </div>

      {/* 1. Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Settings</CardTitle>
          <CardDescription>Configure package behavior for your proposals</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Enable Proposal Packages</Label>
              <p className="text-xs text-muted-foreground">Show pricing packages on your proposals</p>
            </div>
            <Switch
              checked={settings?.packagesEnabled || false}
              onCheckedChange={(checked) => updateSettings.mutate({ packagesEnabled: checked })}
              data-testid="switch-packages-enabled"
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Allow Package Material Adjustments</Label>
              <p className="text-xs text-muted-foreground">Let packages apply material cost multipliers</p>
            </div>
            <Switch
              checked={settings?.packageMaterialAdjustments || false}
              onCheckedChange={(checked) => updateSettings.mutate({ packageMaterialAdjustments: checked })}
              data-testid="switch-material-adjustments"
            />
          </div>
        </CardContent>
      </Card>

      {/* 2. Feature Library */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen className="w-4 h-4" />
              Feature Library
            </CardTitle>
            <CardDescription>Define features that appear across all packages</CardDescription>
          </div>
          <Button size="sm" onClick={() => setFeatureDialog({ open: true, edit: null })} data-testid="button-add-feature">
            <Plus className="w-4 h-4 mr-1" />
            Add Feature
          </Button>
        </CardHeader>
        <CardContent>
          {libraryFeatures.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No features yet. Add features here, then mark them as included or excluded per package below.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {libraryFeatures.map(feat => {
                const includedInPkgs = feat.active !== false
                  ? packages.filter(p => {
                      const assigns = featureAssignments.filter(a => a.packageId === p.id && a.featureId === feat.id);
                      return assigns.some(a => a.included);
                    })
                  : [];
                return (
                  <div
                    key={feat.id}
                    className={`flex flex-col gap-1 p-2.5 rounded-lg border bg-card ${feat.active === false ? 'opacity-50' : ''}`}
                    data-testid={`feature-library-item-${feat.id}`}
                  >
                    <div className="flex items-start gap-2.5">
                      <Switch
                        checked={feat.active !== false}
                        onCheckedChange={(checked) => {
                          if (!checked && includedInPkgs.length > 0) {
                            const names = includedInPkgs.map(p => p.name).join(', ');
                            if (!window.confirm(`"${feat.title}" is included in: ${names}.\n\nTurning it off will remove it from these packages. Continue?`)) {
                              return;
                            }
                          }
                          toggleFeatureActive.mutate({ id: feat.id, active: checked });
                        }}
                        className="mt-0.5 scale-75"
                        data-testid={`switch-feature-active-${feat.id}`}
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium">{feat.title}</span>
                        {feat.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{feat.description}</p>}
                      </div>
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setFeatureDialog({ open: true, edit: feat })} data-testid={`button-edit-feature-${feat.id}`}>
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive/70 hover:text-destructive" onClick={() => deleteFeature.mutate(feat.id)} data-testid={`button-delete-feature-${feat.id}`}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                    {feat.active !== false && includedInPkgs.length > 0 && (
                      <p className="text-[11px] text-muted-foreground ml-10">
                        Included in: {includedInPkgs.map(p => p.name).join(', ')}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3. Packages — stacked cards, each with inline feature matrix */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="w-4 h-4" />
              Packages
            </CardTitle>
            <CardDescription>Pricing tiers — tap features to toggle included/excluded</CardDescription>
          </div>
          <Button size="sm" onClick={() => setPkgDialog({ open: true, edit: null })} data-testid="button-add-package">
            <Plus className="w-4 h-4 mr-1" />
            Add Package
          </Button>
        </CardHeader>
        <CardContent>
          {packages.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No packages yet. Create your first pricing package.</p>
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={packages.map(p => p.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-4">
                  {packages.map(pkg => (
                    <SortablePackageItem
                      key={pkg.id}
                      pkg={pkg}
                      libraryFeatures={libraryFeatures}
                      featureAssignments={featureAssignments}
                      packages={packages}
                      onEdit={(p) => setPkgDialog({ open: true, edit: p })}
                      onDelete={(id) => deletePkg.mutate(id)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      {featureDialog.open && (
        <FeatureForm
          open={featureDialog.open}
          onClose={() => setFeatureDialog({ open: false })}
          editFeature={featureDialog.edit}
        />
      )}

      {pkgDialog.open && (
        <PackageForm
          open={pkgDialog.open}
          onClose={() => setPkgDialog({ open: false })}
          editPkg={pkgDialog.edit}
          materialAdjEnabled={settings?.packageMaterialAdjustments || false}
        />
      )}

    </div>
  );
}
