import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useLocation, useRoute } from "wouter";
import { useSafeBack } from "@/hooks/use-safe-back";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  Plus,
  Loader2,
  Save,
  Trash2,
  Calculator,
  X,
  CalendarClock,
  DollarSign,
  Layers,
  Tag,
  Home,
  Building2,
  Fence,
  CookingPot,
  Grid3X3,
  Wrench,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  useProposalTemplate,
  useCreateProposalTemplate,
  useUpdateProposalTemplate,
} from "@/hooks/use-templates";
import { LineItemEditorModal, LineItemCard, ProductionRateBlockCard, type LineItem } from "@/components/LineItemEditorModal";
import { DiscountBuilderModal } from "@/components/DiscountBuilderModal";
import { PaymentSettingsSection } from "@/components/PaymentSettingsSection";
import { RoomBuilder, type RoomBuilderHandle } from "@/components/RoomBuilder";
import { ProposalPackageSettingsModal } from "@/components/InlinePackageEditor";
import { packageToSnapshot } from "@/lib/packagePricing";
import { formatCurrency, cn } from "@/lib/utils";
import { useCompanySettings } from "@/hooks/use-company-settings";
import type {
  ProductionRateBlock,
  PaymentSettings,
  DocumentDiscount,
  PackageSnapshot,
  ProposalPackage,
} from "@shared/schema";

type DocEntry =
  | { type: 'block'; block: ProductionRateBlock }
  | { type: 'item'; item: LineItem };

function isEntryOptional(e: DocEntry): boolean {
  return e.type === 'block' ? !!(e.block as any).isOptional : !!e.item.isOptional;
}

function sortEntriesOptionalLast(entries: DocEntry[]): DocEntry[] {
  const regular = entries.filter(e => !isEntryOptional(e));
  const optional = entries.filter(e => isEntryOptional(e));
  return [...regular, ...optional];
}

export default function ProposalTemplateEdit() {
  const [, navigate] = useLocation();
  const handleBack = useSafeBack("/settings/proposal-templates");
  const [, params] = useRoute("/settings/proposal-templates/:id/edit");
  const id = params?.id ? Number(params.id) : null;
  const isNew = !id;

  const { user } = useAuth();
  const { data: compSettings } = useCompanySettings();
  const userTier = user?.subscriptionTier || "starter";
  const { data: template, isLoading } = useProposalTemplate(id || 0);
  const createTemplate = useCreateProposalTemplate();
  const updateTemplate = useUpdateProposalTemplate();
  const { toast } = useToast();
  const { data: globalPackages } = useQuery<ProposalPackage[]>({
    queryKey: ["/api/proposal-packages"],
  });
  const { data: estimateTypes } = useQuery<string[]>({
    queryKey: ["/api/surfaces/estimate-types"],
  });

  const [name, setName] = useState("");
  const [entries, setEntries] = useState<DocEntry[]>([]);
  const lineItems = useMemo(() => entries.filter(e => e.type === 'item').map(e => (e as any).item as LineItem), [entries]);
  const productionRateBlocks = useMemo(() => entries.filter(e => e.type === 'block').map(e => (e as any).block as ProductionRateBlock), [entries]);
  const [dragFromIndex, setDragFromIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [validUntilDays, setValidUntilDays] = useState<number | null>(null);
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings | undefined>(undefined);
  const [discounts, setDiscounts] = useState<DocumentDiscount[]>([]);
  const [proposalPackagesEnabled, setProposalPackagesEnabled] = useState<boolean>(false);
  const [proposalPackagesData, setProposalPackagesData] = useState<PackageSnapshot[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Modals
  const [editingLineItem, setEditingLineItem] = useState<LineItem | null>(null);
  const [editingLineItemIndex, setEditingLineItemIndex] = useState<number | null>(null);
  const [isLineItemModalOpen, setIsLineItemModalOpen] = useState(false);

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const paymentSettingsSnapshotRef = useRef<PaymentSettings | undefined>(undefined);
  const [showPkgModal, setShowPkgModal] = useState(false);

  const [showDiscountBuilder, setShowDiscountBuilder] = useState(false);
  const [editingDiscountIdx, setEditingDiscountIdx] = useState<number | null>(null);
  const [pendingDeleteDiscountIdx, setPendingDeleteDiscountIdx] = useState<number | null>(null);

  const [showServicePicker, setShowServicePicker] = useState(false);
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [showRoomBuilder, setShowRoomBuilder] = useState(false);
  const roomBuilderRef = useRef<RoomBuilderHandle | null>(null);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);

  useEffect(() => {
    if (template && !isNew) {
      setName(template.name);
      const itemsInDollars = (template.lineItems || [])
        .filter((item) => item != null)
        .map((item: any) => ({
          name: item.name || "",
          description: item.description || "",
          quantity: item.quantity || 1,
          unitPrice: (item.unitPrice || 0) / 100,
          total: (item.total || 0) / 100,
          isOptional: item.isOptional,
          descriptionOnly: item.descriptionOnly,
          hidePrice: item.hidePrice,
          taxable: item.taxable,
        }));
      const blockEntries: DocEntry[] = ((template as any).productionRateBlocks || []).map((b: ProductionRateBlock) => ({ type: 'block' as const, block: b }));
      const itemEntries: DocEntry[] = itemsInDollars.map((it) => ({ type: 'item' as const, item: it }));
      const orderedRaw = (template as any).entryOrder as Array<{ kind: 'block' | 'item'; key: string | number }> | undefined;
      let combined: DocEntry[];
      if (Array.isArray(orderedRaw) && orderedRaw.length > 0) {
        const blocksById = new Map<string, DocEntry>();
        for (const be of blockEntries) blocksById.set((be as any).block.id, be);
        const itemsRemaining = [...itemEntries];
        const ordered: DocEntry[] = [];
        for (const ref of orderedRaw) {
          if (ref.kind === 'block') {
            const m = blocksById.get(String(ref.key));
            if (m) { ordered.push(m); blocksById.delete(String(ref.key)); }
          } else if (ref.kind === 'item') {
            const idx = Number(ref.key);
            if (Number.isFinite(idx) && itemsRemaining[idx]) {
              ordered.push(itemsRemaining[idx]);
              itemsRemaining[idx] = null as any;
            }
          }
        }
        for (const be of blocksById.values()) ordered.push(be);
        for (const ie of itemsRemaining) if (ie) ordered.push(ie);
        combined = ordered;
      } else {
        combined = [...blockEntries, ...itemEntries];
      }
      setEntries(sortEntriesOptionalLast(combined));
      setValidUntilDays((template as any).validUntilDays ?? null);
      const tmplPayment = (template as any).paymentSettings;
      if (tmplPayment) setPaymentSettings(tmplPayment);
      setDiscounts(((template as any).discounts as DocumentDiscount[]) || []);
      setProposalPackagesEnabled(!!(template as any).proposalPackagesEnabled);
      setProposalPackagesData(((template as any).proposalPackagesData as PackageSnapshot[]) || []);
    }
  }, [template, isNew]);

  const handleTogglePackages = useCallback(
    (enabled: boolean) => {
      setProposalPackagesEnabled(enabled);
      if (enabled && proposalPackagesData.length === 0 && globalPackages && globalPackages.length > 0) {
        setProposalPackagesData(globalPackages.map((p) => packageToSnapshot(p)));
      }
    },
    [globalPackages, proposalPackagesData.length]
  );

  // Totals
  const blocksTotal = productionRateBlocks
    .filter((b) => !b.isOptional)
    .reduce((sum, block) => sum + (block.roomBuilderData.grandTotal || 0), 0);
  const itemsTotal = lineItems
    .filter((i) => !i.isOptional && !i.descriptionOnly)
    .reduce((sum, item) => sum + (item.quantity || 0) * (item.unitPrice || 0), 0);
  const subtotalBeforeDiscount = itemsTotal + blocksTotal;
  let displayDiscountTotal = 0;
  for (const d of discounts) {
    if (d.value > 0) {
      displayDiscountTotal +=
        d.type === "percentage"
          ? subtotalBeforeDiscount * (Math.min(d.value, 100) / 100)
          : d.value;
    }
  }
  displayDiscountTotal = Math.min(displayDiscountTotal, Math.max(0, subtotalBeforeDiscount));
  const totalAmount = subtotalBeforeDiscount - displayDiscountTotal;

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: "Please enter a template name", variant: "destructive" });
      return;
    }
    if (lineItems.length === 0 && productionRateBlocks.length === 0) {
      toast({ title: "Please add at least one item or estimate", variant: "destructive" });
      return;
    }

    setIsSaving(true);
    try {
      const lineItemsInCents = lineItems.map((item) => ({
        ...item,
        unitPrice: Math.round(item.unitPrice * 100),
        total: Math.round((item.quantity || 0) * (item.unitPrice || 0) * 100),
      }));

      // Capture the unified entry order so it persists across reloads.
      let itemOrdinal = 0;
      const entryOrder = entries.map((e) => {
        if (e.type === 'block') return { kind: 'block' as const, key: (e.block as any).id };
        return { kind: 'item' as const, key: itemOrdinal++ };
      });

      const data: any = {
        name: name.trim(),
        lineItems: lineItemsInCents,
        productionRateBlocks: productionRateBlocks.length > 0 ? productionRateBlocks : undefined,
        entryOrder,
        totalAmount: Math.round(totalAmount * 100),
        validUntilDays: validUntilDays || null,
        paymentSettings: paymentSettings || null,
        discounts: discounts.filter((d) => d.value > 0),
        proposalPackagesEnabled,
        proposalPackagesData: proposalPackagesData.length > 0 ? proposalPackagesData : [],
      };

      if (isNew) {
        await createTemplate.mutateAsync(data);
        toast({ title: "Template created" });
      } else {
        await updateTemplate.mutateAsync({ id: id!, ...data });
        toast({ title: "Template saved" });
      }
      navigate("/settings/proposal-templates");
    } catch (error) {
      toast({ title: "Failed to save template", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddLineItem = () => {
    setEditingLineItem({
      name: "",
      description: "",
      quantity: 1,
      unitPrice: 0,
      total: 0,
    });
    setEditingLineItemIndex(null);
    setIsLineItemModalOpen(true);
  };

  // editingLineItemIndex now tracks the index into `entries`, not into items-only.
  const openItemEditorAtEntry = (entryIdx: number) => {
    const entry = entries[entryIdx];
    if (!entry || entry.type !== 'item') return;
    setEditingLineItem({ ...entry.item });
    setEditingLineItemIndex(entryIdx);
    setIsLineItemModalOpen(true);
  };

  const handleSaveLineItem = (item: LineItem) => {
    if (editingLineItemIndex !== null) {
      setEntries(prev => sortEntriesOptionalLast(prev.map((e, i) =>
        i === editingLineItemIndex && e.type === 'item' ? { type: 'item' as const, item } : e
      )));
    } else {
      setEntries(prev => sortEntriesOptionalLast([...prev, { type: 'item' as const, item }]));
    }
    setIsLineItemModalOpen(false);
    setEditingLineItem(null);
    setEditingLineItemIndex(null);
  };

  const removeEntry = (entryIdx: number) => {
    setEntries(prev => prev.filter((_, i) => i !== entryIdx));
  };

  const handleAddEstimate = () => {
    setEditingBlockId(null);
    setSelectedService(null);
    setShowServicePicker(true);
  };

  const handleEditBlock = (blockId: string) => {
    setEditingBlockId(blockId);
    setShowRoomBuilder(true);
  };

  // ----- Drag & drop reordering (mirrors EditDocumentDialog) -----
  const firstOptionalIdx = entries.findIndex(e => isEntryOptional(e));
  const regularEntries = firstOptionalIdx === -1 ? entries : entries.slice(0, firstOptionalIdx);
  const optionalEntries = firstOptionalIdx === -1 ? [] : entries.slice(firstOptionalIdx);

  const handleZoneDragEnd = () => {
    if (dragFromIndex === null || dragOverIndex === null || dragFromIndex === dragOverIndex) {
      setDragFromIndex(null);
      setDragOverIndex(null);
      return;
    }
    const fromOptional = isEntryOptional(entries[dragFromIndex]);
    const toOptional = isEntryOptional(entries[dragOverIndex]);
    if (fromOptional !== toOptional) {
      // Don't allow dragging across the optional boundary; toggle Optional first.
      setDragFromIndex(null);
      setDragOverIndex(null);
      return;
    }
    setEntries(prev => {
      const next = [...prev];
      const [moved] = next.splice(dragFromIndex, 1);
      next.splice(dragOverIndex, 0, moved);
      return next;
    });
    setDragFromIndex(null);
    setDragOverIndex(null);
  };

  const handleZoneMoveUp = (eIdx: number) => {
    const isOpt = isEntryOptional(entries[eIdx]);
    const firstAllowed = isOpt ? (firstOptionalIdx === -1 ? 0 : firstOptionalIdx) : 0;
    if (eIdx <= firstAllowed) return;
    setEntries(prev => {
      const next = [...prev];
      [next[eIdx - 1], next[eIdx]] = [next[eIdx], next[eIdx - 1]];
      return next;
    });
  };

  const handleZoneMoveDown = (eIdx: number) => {
    const isOpt = isEntryOptional(entries[eIdx]);
    const lastRegularIdx = firstOptionalIdx === -1 ? entries.length - 1 : firstOptionalIdx - 1;
    const lastIdx = entries.length - 1;
    const boundary = isOpt ? lastIdx : lastRegularIdx;
    if (eIdx >= boundary) return;
    setEntries(prev => {
      const next = [...prev];
      [next[eIdx], next[eIdx + 1]] = [next[eIdx + 1], next[eIdx]];
      return next;
    });
  };

  if (isLoading && !isNew) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary" data-testid="loader-template-edit" />
      </div>
    );
  }

  const showEliteFeatures = userTier === "elite";

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-300">
      {/* Header */}
      <div className="shrink-0 bg-slate-800 dark:bg-slate-900 shadow-md">
        <div className="flex items-center justify-between gap-4 px-4 py-2 lg:px-8">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              className="px-3 py-1.5 rounded-md border border-white/20 text-white/70 text-sm font-medium hover:bg-white/10 transition-colors"
              onClick={handleBack}
              data-testid="button-back"
            >
              Cancel
            </button>
            <h1 className="text-lg lg:text-2xl font-bold font-display truncate text-white">
              {isNew ? "New Template" : "Edit Template"}
            </h1>
          </div>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="bg-primary text-primary-foreground"
            data-testid="button-save"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-1" />
            )}
            Save
          </Button>
        </div>
        <div className="flex items-center gap-2 px-4 py-1.5 lg:px-8 border-t border-white/10 flex-wrap">
          <button
            type="button"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-white/20 text-white/80 text-xs font-medium hover:bg-white/10 transition-colors"
            onClick={handleAddEstimate}
            data-testid="button-add-production-rate-header"
          >
            <Calculator className="w-3.5 h-3.5" /> Add Estimate
          </button>
          <button
            type="button"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-white/20 text-white/80 text-xs font-medium hover:bg-white/10 transition-colors"
            onClick={handleAddLineItem}
            data-testid="button-add-item-header"
          >
            <Plus className="w-3.5 h-3.5" /> Add Item
          </button>
          <button
            type="button"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-white/20 text-white/80 text-xs font-medium hover:bg-white/10 transition-colors"
            onClick={() => {
              setEditingDiscountIdx(null);
              setShowDiscountBuilder(true);
            }}
            data-testid="button-add-discount"
          >
            <Tag className="w-3.5 h-3.5" /> Discount
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto px-4 py-6 lg:px-8 space-y-6">
          {/* Template Name */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Template Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Interior Repaint - Standard, Exterior Full Paint"
              data-testid="input-template-name"
            />
          </div>

          {/* Valid Until (days) */}
          <div className="flex items-center gap-3">
            <Label htmlFor="validUntilDays" className="text-sm text-muted-foreground whitespace-nowrap shrink-0 flex items-center gap-1.5">
              <CalendarClock className="w-4 h-4" />
              Valid For
            </Label>
            <Input
              id="validUntilDays"
              type="number"
              min={1}
              max={365}
              value={validUntilDays ?? ""}
              onChange={(e) => setValidUntilDays(e.target.value ? parseInt(e.target.value) : null)}
              placeholder="30"
              className="max-w-[100px] h-9"
              data-testid="input-valid-until-days"
            />
            <span className="text-xs text-muted-foreground">days from proposal date</span>
          </div>

          {/* Payment + Packages buttons */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="gap-1.5 w-full min-w-0 justify-start border-2 shadow-sm px-2"
              onClick={() => { paymentSettingsSnapshotRef.current = paymentSettings; setShowPaymentModal(true); }}
              data-testid="button-toggle-payment-settings"
            >
              <DollarSign className="w-4 h-4 shrink-0" />
              <span className="truncate">Payment</span>
              {paymentSettings?.depositRequired && (
                <Badge variant="secondary" className="ml-auto shrink-0 text-[10px] px-1.5">
                  {paymentSettings.depositType === "percentage"
                    ? `${paymentSettings.depositAmount}%`
                    : formatCurrency(paymentSettings.depositAmount)}
                </Badge>
              )}
            </Button>
            {showEliteFeatures && compSettings?.packagesEnabled && (
              <Button
                type="button"
                variant="outline"
                className="gap-1.5 w-full min-w-0 justify-start border-2 shadow-sm px-2"
                onClick={() => setShowPkgModal(true)}
                data-testid="button-package-settings"
              >
                <Layers className="w-4 h-4 shrink-0" />
                <span className="truncate">Packages</span>
                <Badge
                  variant={proposalPackagesEnabled ? "default" : "secondary"}
                  className="ml-auto shrink-0 text-[10px] px-1.5"
                >
                  {proposalPackagesEnabled ? "On" : "Off"}
                </Badge>
              </Button>
            )}
          </div>

          {/* Items */}
          <div className="space-y-3">
            {entries.length === 0 ? (
              <div className="rounded-lg border-2 border-dashed border-border py-10 text-center text-muted-foreground">
                <p>No items yet</p>
                <p className="text-sm mt-1">Add an estimate or line item to get started</p>
              </div>
            ) : (
              (() => {
                const renderEntry = (entry: DocEntry, eIdx: number, zoneFirst: boolean, zoneLast: boolean) => {
                  if (entry.type === 'block') {
                    const block = entry.block;
                    return (
                      <div key={`block-wrap-${block.id}`} className="relative">
                        <ProductionRateBlockCard
                          key={`block-${block.id}`}
                          block={block}
                          index={eIdx}
                          onClick={() => handleEditBlock(block.id)}
                          onRemove={() => removeEntry(eIdx)}
                          onToggleOptional={() => {
                            setEntries(prev => sortEntriesOptionalLast(prev.map((e, i) =>
                              i === eIdx && e.type === 'block'
                                ? { type: 'block' as const, block: { ...e.block, isOptional: !(e.block as any).isOptional } }
                                : e
                            )));
                          }}
                          isDragOver={dragOverIndex === eIdx && dragFromIndex !== eIdx}
                          isDragging={dragFromIndex === eIdx}
                          onDragStart={(i) => setDragFromIndex(i)}
                          onDragOver={(i) => setDragOverIndex(i)}
                          onDragEnd={handleZoneDragEnd}
                          onMoveUp={() => handleZoneMoveUp(eIdx)}
                          onMoveDown={() => handleZoneMoveDown(eIdx)}
                          isFirst={zoneFirst}
                          isLast={zoneLast}
                          totalItems={entries.length}
                          testIdPrefix="template-"
                        />
                      </div>
                    );
                  }
                  const item = entry.item;
                  return (
                    <div key={`item-wrap-${eIdx}`} className="relative">
                      <LineItemCard
                        key={`item-${eIdx}`}
                        item={item}
                        index={eIdx}
                        onClick={() => openItemEditorAtEntry(eIdx)}
                        onRemove={() => removeEntry(eIdx)}
                        canRemove={true}
                        totalItems={entries.length}
                        isFirst={zoneFirst}
                        isLast={zoneLast}
                        isDragging={dragFromIndex === eIdx}
                        isDragOver={dragOverIndex === eIdx && dragFromIndex !== eIdx}
                        onDragStart={(i) => setDragFromIndex(i)}
                        onDragOver={(i) => setDragOverIndex(i)}
                        onDragEnd={handleZoneDragEnd}
                        onMoveUp={() => handleZoneMoveUp(eIdx)}
                        onMoveDown={() => handleZoneMoveDown(eIdx)}
                      />
                    </div>
                  );
                };
                return (
                  <>
                    <div className="space-y-3">
                      {regularEntries.map((entry, i) => renderEntry(entry, i, i === 0, i === regularEntries.length - 1))}
                    </div>
                    {optionalEntries.length > 0 && (
                      <>
                        <div className="flex items-center gap-3 pt-4 pb-2" data-testid="optional-section-divider">
                          <div className="flex-1 h-px bg-emerald-300 dark:bg-emerald-700" />
                          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
                            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">Optional Add-Ons</span>
                          </div>
                          <div className="flex-1 h-px bg-emerald-300 dark:bg-emerald-700" />
                        </div>
                        <div className="space-y-3">
                          {optionalEntries.map((entry, i) => renderEntry(entry, regularEntries.length + i, i === 0, i === optionalEntries.length - 1))}
                        </div>
                      </>
                    )}
                  </>
                );
              })()
            )}

            {/* Discounts */}
            {discounts.length > 0 && (
              <>
                <div className="flex items-center gap-3 pt-2 pb-1">
                  <div className="flex-1 h-px bg-amber-300 dark:bg-amber-700" />
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800">
                    <Tag className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                    <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">
                      Discounts
                    </span>
                  </div>
                  <div className="flex-1 h-px bg-amber-300 dark:bg-amber-700" />
                </div>
                <div className="space-y-2">
                  {discounts.map((disc, dIdx) => (
                    <div
                      key={disc.id || dIdx}
                      className="border rounded-lg p-3 bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 cursor-pointer hover:border-amber-400 dark:hover:border-amber-600 transition-colors"
                      onClick={() => {
                        setEditingDiscountIdx(dIdx);
                        setShowDiscountBuilder(true);
                      }}
                      data-testid={`discount-card-${dIdx}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Tag className="w-4 h-4 text-amber-600 shrink-0" />
                          <span className="font-medium text-sm truncate">
                            {disc.label || `Discount ${dIdx + 1}`}
                          </span>
                          {disc.description && (
                            <span className="text-xs text-muted-foreground truncate hidden sm:inline">
                              — {disc.description}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="secondary" className="text-xs">
                            {disc.type === "percentage"
                              ? `${disc.value}%`
                              : `$${(disc.value || 0).toFixed(2)}`}
                          </Badge>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPendingDeleteDiscountIdx(dIdx);
                            }}
                            data-testid={`button-remove-discount-${dIdx}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Totals */}
          {(lineItems.length > 0 || productionRateBlocks.length > 0) && (
            <div className="rounded-lg border bg-card p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular-nums">{formatCurrency(subtotalBeforeDiscount)}</span>
              </div>
              {displayDiscountTotal > 0 && (
                <div className="flex justify-between text-sm text-amber-700 dark:text-amber-400">
                  <span>Discount</span>
                  <span className="tabular-nums">−{formatCurrency(displayDiscountTotal)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-semibold pt-2 border-t">
                <span>Total</span>
                <span className="tabular-nums" data-testid="text-total">
                  {formatCurrency(totalAmount)}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Payment Modal */}
      <Dialog open={showPaymentModal} onOpenChange={setShowPaymentModal}>
        <DialogContent hideCloseButton className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Payment & Deposit Settings
            </DialogTitle>
          </DialogHeader>
          <PaymentSettingsSection
            totalAmount={Math.round(totalAmount * 100)}
            paymentSettings={paymentSettings}
            onPaymentSettingsChange={setPaymentSettings}
            userTier={userTier}
            financingAvailable={!!compSettings?.financingEnabled && !!compSettings?.financingLink}
            companyState={compSettings?.state}
          />
          <DialogFooter className="flex-row justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setPaymentSettings(paymentSettingsSnapshotRef.current);
                setShowPaymentModal(false);
              }}
              data-testid="button-cancel-payment-settings"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => setShowPaymentModal(false)}
              data-testid="button-save-payment-settings"
            >
              <Save className="w-4 h-4 mr-1" /> Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Packages Modal */}
      {showPkgModal && (
        <ProposalPackageSettingsModal
          open={showPkgModal}
          onClose={() => setShowPkgModal(false)}
          packages={proposalPackagesData}
          materialAdjustments={false}
          onPackagesChange={(pkgs) => setProposalPackagesData(pkgs)}
          onMaterialAdjustmentsChange={() => {}}
          packagesEnabled={proposalPackagesEnabled}
          onTogglePackagesEnabled={handleTogglePackages}
          librarySeed={(globalPackages || []).map((p) => packageToSnapshot(p))}
        />
      )}

      {/* Discount Builder Modal */}
      <DiscountBuilderModal
        open={showDiscountBuilder}
        onOpenChange={(open) => {
          setShowDiscountBuilder(open);
          if (!open) setEditingDiscountIdx(null);
        }}
        discount={editingDiscountIdx !== null ? discounts[editingDiscountIdx] : null}
        onSave={(saved) => {
          if (editingDiscountIdx !== null) {
            setDiscounts((prev) => prev.map((d, i) => (i === editingDiscountIdx ? saved : d)));
          } else {
            setDiscounts((prev) => [...prev, saved]);
          }
        }}
        subtotal={subtotalBeforeDiscount}
      />

      {/* Delete discount confirmation */}
      <AlertDialog
        open={pendingDeleteDiscountIdx !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteDiscountIdx(null);
        }}
      >
        <AlertDialogContent className="z-[10001]" overlayClassName="z-[10000]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-destructive" />
              Delete Discount
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDeleteDiscountIdx !== null && discounts[pendingDeleteDiscountIdx] && (
                <>
                  Are you sure you want to delete{" "}
                  <strong>
                    "
                    {discounts[pendingDeleteDiscountIdx].label ||
                      `Discount ${pendingDeleteDiscountIdx + 1}`}
                    "
                  </strong>
                  ? This cannot be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-discount">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDeleteDiscountIdx !== null) {
                  setDiscounts((prev) => prev.filter((_, i) => i !== pendingDeleteDiscountIdx));
                  setPendingDeleteDiscountIdx(null);
                }
              }}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete-discount"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Service Picker */}
      {showServicePicker &&
        createPortal(
          <div
            className="fixed inset-0 z-[10000] bg-black/60 flex items-center justify-center p-4 touch-none overscroll-none"
            onClick={() => setShowServicePicker(false)}
            onTouchMove={(e) => e.preventDefault()}
            data-testid="service-picker-overlay"
          >
            <div
              className="bg-background rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
              onClick={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
              data-testid="service-picker-modal"
            >
              <div className="px-6 pt-6 pb-4">
                <h3 className="text-xl font-bold">Select Service</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  What type of work is this estimate for?
                </p>
              </div>
              <div className="px-4 pb-4 grid grid-cols-2 gap-3" style={{ overscrollBehavior: "contain" }}>
                {(() => {
                  const serviceConfig: Record<
                    string,
                    { icon: typeof Home; color: string; bg: string; desc: string }
                  > = {
                    "Residential Interior": {
                      icon: Home,
                      color: "text-blue-600 dark:text-blue-400",
                      bg: "bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800",
                      desc: "Rooms & living spaces",
                    },
                    "Residential Exterior": {
                      icon: Fence,
                      color: "text-green-600 dark:text-green-400",
                      bg: "bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-800",
                      desc: "Siding, trim & decks",
                    },
                    "Commercial Interior": {
                      icon: Building2,
                      color: "text-purple-600 dark:text-purple-400",
                      bg: "bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800",
                      desc: "Offices & retail",
                    },
                    "Commercial Exterior": {
                      icon: Building2,
                      color: "text-orange-600 dark:text-orange-400",
                      bg: "bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-800",
                      desc: "Building exteriors",
                    },
                    "Kitchen Cabinets": {
                      icon: CookingPot,
                      color: "text-amber-600 dark:text-amber-400",
                      bg: "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800",
                      desc: "Cabinet refinishing",
                    },
                    "Flooring Installation": {
                      icon: Grid3X3,
                      color: "text-teal-600 dark:text-teal-400",
                      bg: "bg-teal-50 dark:bg-teal-950/40 border-teal-200 dark:border-teal-800",
                      desc: "Floor surfaces",
                    },
                  };
                  const allTypes = Object.keys(serviceConfig);
                  const extraTypes = (estimateTypes || []).filter((t) => !allTypes.includes(t));
                  const fullTypes = [...allTypes, ...extraTypes];
                  return fullTypes.map((t) => {
                    const config = serviceConfig[t] || {
                      icon: Wrench,
                      color: "text-slate-600 dark:text-slate-400",
                      bg: "bg-slate-50 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800",
                      desc: "Custom service",
                    };
                    const Icon = config.icon;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => {
                          setSelectedService(t);
                          setShowServicePicker(false);
                          setShowRoomBuilder(true);
                        }}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 ${config.bg} hover:scale-[1.03] active:scale-[0.98] transition-all duration-150 cursor-pointer`}
                        data-testid={`service-option-${t}`}
                      >
                        <div
                          className={`w-11 h-11 rounded-full flex items-center justify-center bg-white dark:bg-background shadow-sm ${config.color}`}
                        >
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-semibold leading-tight">{t}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">{config.desc}</p>
                        </div>
                      </button>
                    );
                  });
                })()}
              </div>
              <div className="px-6 pb-5 pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-muted-foreground"
                  onClick={() => setShowServicePicker(false)}
                  data-testid="button-cancel-service-picker"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Fullscreen Room Builder */}
      {showRoomBuilder &&
        createPortal(
          <div
            className="fixed inset-0 z-[10000] bg-background flex flex-col"
            data-testid="fullscreen-room-builder-template"
          >
            <div
              className="shrink-0 z-50 bg-slate-800 dark:bg-slate-900 text-white shadow-md"
              style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
            >
              <div className="flex items-center justify-between px-3 py-2.5 lg:px-8">
                <div className="flex items-center gap-2 min-w-0">
                  <Calculator className="w-5 h-5 text-blue-300 shrink-0" />
                  <span className="font-semibold text-sm truncate text-white">
                    {editingBlockId ? "Edit Estimate" : "Add Estimate"}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => roomBuilderRef.current?.requestClose()}
                    className="text-xs px-3 py-1.5 rounded-lg border border-white/20 text-white/70 hover:text-white hover:bg-white/10 font-medium"
                    data-testid="button-close-fullscreen-builder-template"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => roomBuilderRef.current?.requestSave()}
                    className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90"
                    data-testid="button-save-estimate-header-template"
                  >
                    <Save className="w-3.5 h-3.5 inline mr-1" />
                    Save
                  </button>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-1.5 py-3 lg:px-8 lg:py-6">
              <div className="max-w-3xl mx-auto">
                <RoomBuilder
                  builderRef={roomBuilderRef}
                  initialService={selectedService || undefined}
                  onGenerateLineItems={(newItems) => {
                    setEntries((prev) => sortEntriesOptionalLast([
                      ...prev,
                      ...newItems.map((item) => ({ type: 'item' as const, item })),
                    ]));
                    setShowRoomBuilder(false);
                    setSelectedService(null);
                  }}
                  onCancel={() => {
                    setShowRoomBuilder(false);
                    setEditingBlockId(null);
                    setSelectedService(null);
                  }}
                  initialRoomData={
                    editingBlockId
                      ? productionRateBlocks.find((b) => b.id === editingBlockId)?.roomBuilderData
                      : undefined
                  }
                  initialBlockName={
                    editingBlockId
                      ? productionRateBlocks.find((b) => b.id === editingBlockId)?.name
                      : undefined
                  }
                  onSaveRoomData={(data, newItems, bName) => {
                    if (editingBlockId) {
                      setEntries((prev) => sortEntriesOptionalLast(prev.map((e) =>
                        e.type === 'block' && (e.block as any).id === editingBlockId
                          ? {
                              type: 'block' as const,
                              block: {
                                ...e.block,
                                name: bName,
                                roomBuilderData: data,
                                lineItems: newItems.map((li) => ({
                                  ...li,
                                  unitPrice: Math.round(li.unitPrice * 100),
                                  total: Math.round(li.total * 100),
                                })),
                              } as ProductionRateBlock,
                            }
                          : e
                      )));
                    } else {
                      const newBlock: ProductionRateBlock = {
                        id: `prb-${Date.now()}`,
                        name: bName,
                        roomBuilderData: data,
                        lineItems: newItems.map((li) => ({
                          ...li,
                          unitPrice: Math.round(li.unitPrice * 100),
                          total: Math.round(li.total * 100),
                        })),
                      };
                      setEntries((prev) => sortEntriesOptionalLast([
                        ...prev,
                        { type: 'block' as const, block: newBlock },
                      ]));
                    }
                    setShowRoomBuilder(false);
                    setEditingBlockId(null);
                    setSelectedService(null);
                    toast({
                      title: editingBlockId ? `"${bName}" updated` : `"${bName}" added`,
                      description: `${data.rooms.length} area${data.rooms.length !== 1 ? "s" : ""} — $${data.grandTotal.toFixed(0)} total`,
                    });
                  }}
                />
              </div>
            </div>
          </div>,
          document.body
        )}

      <LineItemEditorModal
        open={isLineItemModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsLineItemModalOpen(false);
            setEditingLineItem(null);
            setEditingLineItemIndex(null);
          }
        }}
        item={editingLineItem || { name: "", description: "", quantity: 1, unitPrice: 0, total: 0 }}
        onSave={handleSaveLineItem}
        itemIndex={editingLineItemIndex ?? 0}
        taxRate={0}
      />
    </div>
  );
}
