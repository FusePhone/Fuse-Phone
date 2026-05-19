import { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Layers, Check, X, Star, Plus, Trash2, Settings, ArrowLeft, AlertTriangle, Pencil, Package, Copy } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import type { PackageSnapshot, PackageFeature } from "@shared/schema";

interface InlinePackageEditorProps {
  docType: string;
  userTier: string;
  packagesGlobalEnabled: boolean;
  proposalPackagesEnabled: boolean;
  onTogglePackages: (enabled: boolean) => void;
  proposalPackagesData: PackageSnapshot[];
  proposalMaterialAdjustments: boolean;
  onProposalPackagesDataChange: (packages: PackageSnapshot[]) => void;
  onProposalMaterialAdjustmentsChange: (val: boolean) => void;
}

export function InlinePackageEditor({
  docType,
  userTier,
  packagesGlobalEnabled,
  proposalPackagesEnabled,
  onTogglePackages,
  proposalPackagesData,
  proposalMaterialAdjustments,
  onProposalPackagesDataChange,
  onProposalMaterialAdjustmentsChange,
}: InlinePackageEditorProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (docType !== 'proposal' && docType !== 'estimate') {
    return null;
  }

  if (userTier !== 'elite') {
    return null;
  }

  return (
    <>
      <div className="border rounded-lg p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Packages</span>
            {proposalPackagesEnabled && proposalPackagesData.filter(p => p.active !== false).length > 0 && (
              <Badge variant="secondary" data-testid="badge-package-count">
                {proposalPackagesData.filter(p => p.active !== false).length} package{proposalPackagesData.filter(p => p.active !== false).length !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {proposalPackagesEnabled && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={(e) => { e.stopPropagation(); setSettingsOpen(true); }}
                data-testid="button-package-settings"
              >
                <Settings className="w-4 h-4" />
              </Button>
            )}
            <Switch
              checked={proposalPackagesEnabled}
              onCheckedChange={onTogglePackages}
              data-testid="switch-packages-enabled"
            />
          </div>
        </div>

        {proposalPackagesEnabled && proposalPackagesData.length > 0 && (
          <div className="mt-3 space-y-2">
            {proposalPackagesData.filter(pkg => pkg.active !== false).map(pkg => (
              <div key={pkg.id} className="flex items-center gap-2 text-xs text-muted-foreground" data-testid={`pkg-summary-${pkg.id}`}>
                {pkg.recommended && <Star className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />}
                <span className={cn("font-medium", pkg.recommended && "text-foreground")}>{pkg.name}</span>
                <span>
                  {pkg.priceAdjustmentType === 'percent'
                    ? `+${pkg.adjustmentValue}%`
                    : `+${formatCurrency(pkg.adjustmentValue)}`
                  }
                </span>
                <span>· {pkg.features.filter(f => f.included && f.active !== false).length}/{pkg.features.filter(f => f.active !== false).length} features</span>
              </div>
            ))}
            {proposalPackagesData.some(pkg => pkg.active === false) && (
              <div className="text-xs text-muted-foreground italic">
                {proposalPackagesData.filter(pkg => pkg.active === false).length} package{proposalPackagesData.filter(pkg => pkg.active === false).length !== 1 ? 's' : ''} hidden
              </div>
            )}
          </div>
        )}
      </div>

      {settingsOpen && (
        <ProposalPackageSettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          packages={proposalPackagesData}
          materialAdjustments={proposalMaterialAdjustments}
          onPackagesChange={onProposalPackagesDataChange}
          onMaterialAdjustmentsChange={onProposalMaterialAdjustmentsChange}
        />
      )}
    </>
  );
}

interface ProposalPackageSettingsModalProps {
  open: boolean;
  onClose: () => void;
  packages: PackageSnapshot[];
  materialAdjustments: boolean;
  onPackagesChange: (packages: PackageSnapshot[]) => void;
  onMaterialAdjustmentsChange: (val: boolean) => void;
  packagesEnabled?: boolean;
  onTogglePackagesEnabled?: (val: boolean) => void;
  librarySeed?: PackageSnapshot[];
}

function SnapshotFeatureMatrix({
  pkg,
  allPackages,
  onToggleFeature,
  onCopyFeatures,
}: {
  pkg: PackageSnapshot;
  allPackages: PackageSnapshot[];
  onToggleFeature: (pkgId: number, featureIdx: number) => void;
  onCopyFeatures: (fromPkgId: number, toPkgId: number) => void;
}) {
  const allFeatures = pkg.features || [];
  const featuresWithOrigIdx = allFeatures
    .map((f, origIdx) => ({ ...f, origIdx }))
    .filter(f => f.active !== false);
  const includedCount = featuresWithOrigIdx.filter(f => f.included).length;
  const otherPackages = allPackages.filter(p => p.id !== pkg.id);

  if (featuresWithOrigIdx.length === 0) return null;

  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-xs text-muted-foreground">
          {includedCount} of {featuresWithOrigIdx.length} included
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
                onClick={() => onCopyFeatures(pkg.id, op.id)}
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
        {featuresWithOrigIdx.map((feat) => (
          <button
            key={feat.origIdx}
            type="button"
            onClick={() => onToggleFeature(pkg.id, feat.origIdx)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all text-left ${
              feat.included
                ? 'bg-emerald-500/8 hover:bg-emerald-500/12'
                : 'bg-muted/20 hover:bg-muted/40'
            }`}
            data-testid={`feature-toggle-${pkg.id}-${feat.origIdx}`}
          >
            <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
              feat.included
                ? 'bg-emerald-500 text-white'
                : 'bg-gray-300 dark:bg-gray-600 text-white'
            }`}>
              {feat.included ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
            </div>
            <div className="flex-1 min-w-0">
              <span className={`text-sm ${feat.included ? 'font-medium' : 'text-muted-foreground'}`}>
                {feat.name}
              </span>
              {feat.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{feat.description}</p>}
            </div>
            <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${
              feat.included
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
            }`}>
              {feat.included ? 'Included' : 'Excluded'}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SnapshotPackageForm({
  open,
  onClose,
  editPkg,
  materialAdjEnabled,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  editPkg?: PackageSnapshot | null;
  materialAdjEnabled: boolean;
  onSave: (pkg: PackageSnapshot) => void;
}) {
  const [name, setName] = useState(editPkg?.name || '');
  const [description, setDescription] = useState(editPkg?.description || '');
  const [recommended, setRecommended] = useState(editPkg?.recommended || false);
  const [priceType, setPriceType] = useState<string>(editPkg?.priceAdjustmentType || 'percent');
  const [adjustmentValue, setAdjustmentValue] = useState<string>(String(editPkg?.adjustmentValue || 0));
  const [materialMultiplier, setMaterialMultiplier] = useState<string>(String(editPkg?.materialMultiplier || 1.0));

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      id: editPkg?.id || Date.now(),
      name: name.trim(),
      description: description.trim() || undefined,
      recommended,
      priceAdjustmentType: priceType as 'percent' | 'flat',
      adjustmentValue: parseFloat(adjustmentValue) || 0,
      materialMultiplier: parseFloat(materialMultiplier) || 1.0,
      features: editPkg?.features || [],
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md z-[10002]">
        <DialogHeader>
          <DialogTitle>{editPkg ? 'Edit Package' : 'Add Package'}</DialogTitle>
          <DialogDescription>
            {editPkg ? 'Update this pricing package' : 'Create a new pricing package for this proposal'}
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
                <SelectContent className="z-[10003]">
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
          <Button onClick={handleSave} disabled={!name.trim()} data-testid="button-save-package">
            {editPkg ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SnapshotFeatureForm({
  open,
  onClose,
  editFeature,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  editFeature?: PackageFeature | null;
  onSave: (feature: PackageFeature) => void;
}) {
  const [title, setTitle] = useState(editFeature?.name || '');
  const [description, setDescription] = useState(editFeature?.description || '');

  const handleSave = () => {
    if (!title.trim()) return;
    onSave({
      name: title.trim(),
      description: description.trim() || undefined,
      included: editFeature?.included ?? true,
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm z-[10002]">
        <DialogHeader>
          <DialogTitle>{editFeature ? 'Edit Feature' : 'Add Feature'}</DialogTitle>
          <DialogDescription>
            {editFeature ? 'Update this feature' : 'Create a feature that appears across all packages'}
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
          <Button onClick={handleSave} disabled={!title.trim()} data-testid="button-save-feature">
            {editFeature ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ProposalPackageSettingsModal({
  open,
  onClose,
  packages: initialPackages,
  materialAdjustments: initialMaterialAdj,
  onPackagesChange,
  onMaterialAdjustmentsChange,
  packagesEnabled,
  onTogglePackagesEnabled,
  librarySeed,
}: ProposalPackageSettingsModalProps) {
  const [localPackages, setLocalPackages] = useState<PackageSnapshot[]>(initialPackages);
  const [localMaterialAdj, setLocalMaterialAdj] = useState(initialMaterialAdj);
  const [localEnabled, setLocalEnabled] = useState(packagesEnabled ?? false);
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);
  const [pkgDialog, setPkgDialog] = useState<{ open: boolean; edit?: PackageSnapshot | null }>({ open: false });
  const [featureDialog, setFeatureDialog] = useState<{ open: boolean; edit?: PackageFeature | null; editIdx?: number; editName?: string }>({ open: false });

  useEffect(() => {
    if (open) {
      setLocalPackages(initialPackages);
      setLocalMaterialAdj(initialMaterialAdj);
      setLocalEnabled(packagesEnabled ?? false);
    }
  }, [open, initialPackages, initialMaterialAdj, packagesEnabled]);

  const isDirty = useCallback(() => {
    return JSON.stringify(localPackages) !== JSON.stringify(initialPackages) ||
      localMaterialAdj !== initialMaterialAdj ||
      localEnabled !== (packagesEnabled ?? false);
  }, [localPackages, localMaterialAdj, localEnabled, initialPackages, initialMaterialAdj, packagesEnabled]);

  const handleBack = () => {
    if (isDirty()) {
      setShowUnsavedWarning(true);
    } else {
      onClose();
    }
  };

  const handleSave = () => {
    onPackagesChange(localPackages);
    onMaterialAdjustmentsChange(localMaterialAdj);
    if (onTogglePackagesEnabled) onTogglePackagesEnabled(localEnabled);
    onClose();
  };

  const handleDiscardAndClose = () => {
    setShowUnsavedWarning(false);
    onClose();
  };

  const allFeatureNames = useMemo(() => {
    const names: string[] = [];
    const seen = new Set<string>();
    for (const pkg of localPackages) {
      for (const f of (pkg.features || [])) {
        if (!seen.has(f.name)) {
          names.push(f.name);
          seen.add(f.name);
        }
      }
    }
    return names;
  }, [localPackages]);

  const handleToggleFeature = (pkgId: number, featureIdx: number) => {
    setLocalPackages(prev => prev.map(p => {
      if (p.id !== pkgId) return p;
      const features = [...p.features];
      features[featureIdx] = { ...features[featureIdx], included: !features[featureIdx].included };
      return { ...p, features };
    }));
  };

  const handleCopyFeatures = (fromPkgId: number, toPkgId: number) => {
    const fromPkg = localPackages.find(p => p.id === fromPkgId);
    if (!fromPkg) return;
    setLocalPackages(prev => prev.map(p => {
      if (p.id !== toPkgId) return p;
      return { ...p, features: fromPkg.features.map(f => ({ ...f })) };
    }));
  };

  const handleAddFeatureToAll = (feature: PackageFeature) => {
    setLocalPackages(prev => prev.map(p => ({
      ...p,
      features: [...p.features, { ...feature }],
    })));
  };

  const handleUpdateFeatureInAll = (oldName: string, feature: PackageFeature) => {
    setLocalPackages(prev => prev.map(p => ({
      ...p,
      features: p.features.map(f => f.name === oldName ? { ...f, name: feature.name, description: feature.description } : f),
    })));
  };

  const handleDeleteFeatureFromAll = (featureName: string) => {
    setLocalPackages(prev => prev.map(p => ({
      ...p,
      features: p.features.filter(f => f.name !== featureName),
    })));
  };

  const handleSavePackage = (pkg: PackageSnapshot) => {
    setLocalPackages(prev => {
      const existing = prev.find(p => p.id === pkg.id);
      if (existing) {
        return prev.map(p => p.id === pkg.id ? { ...pkg, features: p.features } : p);
      }
      return [...prev, pkg];
    });
  };

  const handleDeletePackage = (id: number) => {
    setLocalPackages(prev => prev.filter(p => p.id !== id));
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[10001] bg-background overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch', touchAction: 'manipulation' }}>
      <div className="sticky top-0 z-[10002] bg-slate-800 dark:bg-slate-900 shadow-md pt-safe-top">
        <div className="max-w-4xl mx-auto px-3 sm:px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              className="px-3 py-1.5 rounded-md border border-white/20 text-white/70 text-sm font-medium hover:bg-white/10 transition-colors shrink-0"
              onClick={handleBack}
              data-testid="button-back-package-settings"
            >
              Cancel
            </button>
            <Layers className="w-5 h-5 shrink-0 text-white/80" />
            <span className="text-lg font-bold truncate text-white">Packages</span>
          </div>
          <Button className="shrink-0 bg-primary text-primary-foreground" onClick={handleSave} data-testid="button-save-package-settings">
            Save
          </Button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6 pb-24">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Settings</CardTitle>
            <CardDescription>Configure package behavior for this proposal</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {onTogglePackagesEnabled && (
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Enable Packages</Label>
                  <p className="text-xs text-muted-foreground">Show package options on this proposal</p>
                </div>
                <Switch
                  checked={localEnabled}
                  onCheckedChange={(val) => {
                    setLocalEnabled(val);
                    if (val && localPackages.length === 0 && librarySeed && librarySeed.length > 0) {
                      setLocalPackages(librarySeed);
                    }
                  }}
                  data-testid="switch-packages-enabled"
                />
              </div>
            )}
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Allow Package Material Adjustments</Label>
                <p className="text-xs text-muted-foreground">Let packages apply material cost multipliers</p>
              </div>
              <Switch
                checked={localMaterialAdj}
                onCheckedChange={setLocalMaterialAdj}
                data-testid="switch-material-adjustments"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="w-4 h-4" />
                Features
              </CardTitle>
              <CardDescription>Features that appear across all packages</CardDescription>
            </div>
            <Button size="sm" onClick={() => setFeatureDialog({ open: true, edit: null })} data-testid="button-add-feature">
              <Plus className="w-4 h-4 mr-1" />
              Add Feature
            </Button>
          </CardHeader>
          <CardContent>
            {allFeatureNames.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No features yet. Add features here, then mark them as included or excluded per package below.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {allFeatureNames.map(name => {
                  const allMatchingFeatures = localPackages.flatMap(p => (p.features || []).filter(f => f.name === name));
                  const sample = allMatchingFeatures[0];
                  const isActive = sample?.active !== false;
                  const includedInPkgs = isActive
                    ? localPackages.filter(p => (p.features || []).some(f => f.name === name && f.included))
                    : [];
                  return (
                    <div
                      key={name}
                      className={`flex flex-col gap-1 p-2.5 rounded-lg border bg-card ${!isActive ? 'opacity-50' : ''}`}
                      data-testid={`feature-library-item-${name}`}
                    >
                      <div className="flex items-start gap-2.5">
                        <Switch
                          checked={isActive}
                          onCheckedChange={(checked) => {
                            if (!checked && includedInPkgs.length > 0) {
                              const pkgNames = includedInPkgs.map(p => p.name).join(', ');
                              if (!window.confirm(`"${name}" is included in: ${pkgNames}.\n\nTurning it off will remove it from these packages. Continue?`)) {
                                return;
                              }
                            }
                            setLocalPackages(prev => prev.map(p => ({
                              ...p,
                              features: p.features.map(f => f.name === name
                                ? { ...f, active: checked, included: checked ? f.included : false }
                                : f),
                            })));
                          }}
                          className="mt-0.5 scale-75"
                          data-testid={`switch-feature-active-${name}`}
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium">{name}</span>
                          {sample?.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{sample.description}</p>}
                        </div>
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setFeatureDialog({ open: true, edit: sample || { name, included: true }, editIdx: undefined, editName: name })} data-testid={`button-edit-feature-${name}`}>
                            <Pencil className="w-3 h-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive/70 hover:text-destructive" onClick={() => handleDeleteFeatureFromAll(name)} data-testid={`button-delete-feature-${name}`}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                      {isActive && includedInPkgs.length > 0 && (
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
            {localPackages.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No packages yet. Create your first pricing package.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {localPackages.map(pkg => (
                  <div
                    key={pkg.id}
                    className={`p-4 rounded-xl border bg-card transition-opacity ${pkg.active === false ? 'opacity-50' : ''}`}
                    data-testid={`package-item-${pkg.id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5 flex-1 min-w-0">
                        <Switch
                          checked={pkg.active !== false}
                          onCheckedChange={(checked) => {
                            setLocalPackages(prev => prev.map(p => p.id === pkg.id ? { ...p, active: checked } : p));
                          }}
                          className="mt-1 scale-75"
                          data-testid={`switch-package-active-${pkg.id}`}
                        />
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
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPkgDialog({ open: true, edit: pkg })} data-testid={`button-edit-package-${pkg.id}`}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive/70 hover:text-destructive" onClick={() => handleDeletePackage(pkg.id)} data-testid={`button-delete-package-${pkg.id}`}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>

                    {pkg.active !== false && (
                      <SnapshotFeatureMatrix
                        pkg={pkg}
                        allPackages={localPackages.filter(p => p.active !== false)}
                        onToggleFeature={handleToggleFeature}
                        onCopyFeatures={handleCopyFeatures}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

      </div>

      {pkgDialog.open && (
        <SnapshotPackageForm
          open={pkgDialog.open}
          onClose={() => setPkgDialog({ open: false })}
          editPkg={pkgDialog.edit}
          materialAdjEnabled={localMaterialAdj}
          onSave={handleSavePackage}
        />
      )}

      {featureDialog.open && (
        <SnapshotFeatureForm
          open={featureDialog.open}
          onClose={() => setFeatureDialog({ open: false })}
          editFeature={featureDialog.edit}
          onSave={(feature) => {
            if (featureDialog.editName) {
              handleUpdateFeatureInAll(featureDialog.editName, feature);
            } else {
              handleAddFeatureToAll(feature);
            }
          }}
        />
      )}

      <AlertDialog open={showUnsavedWarning} onOpenChange={setShowUnsavedWarning}>
        <AlertDialogContent className="z-[10003]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Unsaved Changes
            </AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes to the package settings for this proposal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleDiscardAndClose} data-testid="button-discard-changes">Discard</AlertDialogCancel>
            <AlertDialogAction onClick={handleSave} data-testid="button-save-changes">Save Changes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>,
    document.body
  );
}
