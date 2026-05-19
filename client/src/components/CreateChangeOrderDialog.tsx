import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useCreateDocument } from "@/hooks/use-documents";
import { useCompanySettings } from "@/hooks/use-company-settings";
import { useAuth } from "@/hooks/use-auth";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Plus, Loader2, Save, Calculator, BookOpen, Home, Fence, Building2, CookingPot, Grid3X3, Wrench } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { LineItemEditorModal, LineItemCard, ProductionRateBlockCard, type LineItem } from "./LineItemEditorModal";
import { ServiceLibraryPicker } from "./ServiceLibraryPicker";
import { stripHtmlForValidation } from "./RichTextEditor";
import { formatCurrency } from "@/lib/utils";
import { createPortal } from "react-dom";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { queryClient } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import { RoomBuilder, type RoomBuilderHandle } from "./RoomBuilder";
import type { ProductionRateBlock } from "@shared/schema";

type COEntry =
  | { type: 'block'; block: ProductionRateBlock }
  | { type: 'item'; item: LineItem };

function isEntryOptional(e: COEntry): boolean {
  return e.type === 'block' ? !!e.block.isOptional : !!e.item.isOptional;
}
function sortEntriesOptionalLast(entries: COEntry[]): COEntry[] {
  const regular = entries.filter(e => !isEntryOptional(e));
  const optional = entries.filter(e => isEntryOptional(e));
  return [...regular, ...optional];
}

interface CreateChangeOrderDialogProps {
  contactId: number;
  sourceDocumentId: number;
  originalTotalAmount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChangeOrderCreated?: (doc: any) => void;
  projectId?: number;
  parentTaxRate?: number;
  parentTaxProfileName?: string | null;
}

export function CreateChangeOrderDialog({
  contactId,
  sourceDocumentId,
  originalTotalAmount,
  open,
  onOpenChange,
  onChangeOrderCreated,
  projectId,
  parentTaxRate,
  parentTaxProfileName,
}: CreateChangeOrderDialogProps) {
  const { mutate, isPending } = useCreateDocument();
  const { data: compSettings } = useCompanySettings();
  const { data: taxProfilesList = [] } = useQuery<any[]>({ queryKey: ['/api/tax-profiles'] });
  const taxRate = parentTaxRate ?? (compSettings?.taxRate ? parseFloat(compSettings.taxRate) : 0);
  const taxProfileName = parentTaxProfileName || null;
  const { toast } = useToast();
  const { user } = useAuth();
  const userTier = user?.subscriptionTier || 'starter';

  const [title, setTitle] = useState('');
  const [entries, setEntries] = useState<COEntry[]>([]);

  // Existing change orders on this proposal — used to compute a smart fallback
  // title ("Extra Work", "Extra Work 2", ...) when the user leaves the title blank.
  const { data: existingChangeOrders = [] } = useQuery<any[]>({
    queryKey: ['/api/documents', sourceDocumentId, 'change-orders'],
    enabled: !!sourceDocumentId && open,
  });

  const buildFallbackTitle = useCallback((): string => {
    const base = 'Extra Work';
    const used = new Set(
      (existingChangeOrders || [])
        .map((co: any) => (co?.title || '').trim())
        .filter(Boolean)
    );
    if (!used.has(base)) return base;
    for (let n = 2; n < 1000; n++) {
      const candidate = `${base} ${n}`;
      if (!used.has(candidate)) return candidate;
    }
    return `${base} ${Date.now()}`;
  }, [existingChangeOrders]);
  const lineItems = useMemo(() => entries.filter(e => e.type === 'item').map(e => (e as any).item as LineItem), [entries]);
  const productionRateBlocks = useMemo(() => entries.filter(e => e.type === 'block').map(e => (e as any).block as ProductionRateBlock), [entries]);

  const [editingLineItem, setEditingLineItem] = useState<LineItem | null>(null);
  const [editingLineItemIndex, setEditingLineItemIndex] = useState<number | null>(null);
  const [isLineItemModalOpen, setIsLineItemModalOpen] = useState(false);
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);
  const [showRoomBuilder, setShowRoomBuilder] = useState(false);
  const [sellRateSnapshot, setSellRateSnapshot] = useState<number | null>(null);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [showLibraryPicker, setShowLibraryPicker] = useState(false);
  const [showServicePicker, setShowServicePicker] = useState(false);
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const { data: estimateTypes } = useQuery<string[]>({ queryKey: ['/api/surfaces/estimate-types'] });
  const roomBuilderRef = useRef<RoomBuilderHandle | null>(null);

  const [dragFromIndex, _setDragFromIndex] = useState<number | null>(null);
  const [dragOverIndex, _setDragOverIndex] = useState<number | null>(null);
  const dragFromRef = useRef<number | null>(null);
  const dragOverRef = useRef<number | null>(null);
  const setDragFromIndex = useCallback((v: number | null) => { dragFromRef.current = v; _setDragFromIndex(v); }, []);
  const setDragOverIndex = useCallback((v: number | null) => { dragOverRef.current = v; _setDragOverIndex(v); }, []);

  const calculateSubtotal = (): number => {
    const itemsTotal = lineItems.filter(i => !i.isOptional).reduce((sum, item) => sum + ((item.quantity || 0) * (item.unitPrice || 0)), 0);
    const blocksTotal = productionRateBlocks.filter(b => !b.isOptional).reduce((sum, b) => sum + (b.roomBuilderData.grandTotal || 0), 0);
    return itemsTotal + blocksTotal;
  };
  const calculateTaxAmount = (): number => {
    if (taxRate <= 0 && productionRateBlocks.every(b => !b.taxProfileRate)) return 0;
    const buckets: Record<number, number> = {};
    const add = (rate: number, amount: number) => {
      if (rate <= 0 || amount === 0) return;
      buckets[rate] = (buckets[rate] || 0) + amount;
    };
    for (const item of lineItems.filter(i => i.taxable && !i.isOptional)) {
      add(taxRate, (item.quantity || 0) * (item.unitPrice || 0));
    }
    for (const b of productionRateBlocks.filter(b => b.taxable && !b.isOptional)) {
      const r = b.taxProfileRate != null ? parseFloat(String(b.taxProfileRate)) : taxRate;
      add(r, b.roomBuilderData.grandTotal || 0);
    }
    let total = 0;
    for (const [rk, amt] of Object.entries(buckets)) total += amt * (parseFloat(rk) / 100);
    return total;
  };
  const calculateTotal = (): number => calculateSubtotal() + calculateTaxAmount();

  const handleAddLineItem = () => {
    setEditingLineItem({ name: '', description: '', quantity: 1, unitPrice: 0, total: 0 });
    setEditingLineItemIndex(null);
    setIsLineItemModalOpen(true);
  };

  const handleEditLineItem = (eIdx: number) => {
    const entry = entries[eIdx];
    if (entry?.type === 'item') {
      setEditingLineItem({ ...entry.item });
      setEditingLineItemIndex(eIdx);
      setIsLineItemModalOpen(true);
    }
  };

  const handleSaveLineItem = (item: LineItem) => {
    if (editingLineItemIndex !== null) {
      setEntries(prev => sortEntriesOptionalLast(prev.map((e, i) => i === editingLineItemIndex ? { type: 'item' as const, item } : e)));
    } else {
      setEntries(prev => sortEntriesOptionalLast([...prev, { type: 'item' as const, item }]));
    }
    setIsLineItemModalOpen(false);
    setEditingLineItem(null);
    setEditingLineItemIndex(null);
  };

  const handleDeleteEntry = (eIdx: number) => {
    setEntries(prev => prev.filter((_, i) => i !== eIdx));
  };

  const handleSave = () => {
    // Smart fallback: if the title is blank, auto-fill with "Extra Work"
    // (or "Extra Work 2", "Extra Work 3", ... if a previous one exists on
    // the same proposal). This ensures the change order always has a title
    // and never silently saves blank.
    let effectiveTitle = title.trim();
    if (!effectiveTitle) {
      effectiveTitle = buildFallbackTitle();
      setTitle(effectiveTitle);
      toast({
        title: `Title was empty — used "${effectiveTitle}"`,
        description: "You can rename it any time before sending to the customer.",
      });
    }
    if (entries.length === 0) {
      toast({ title: "Please add at least one item or estimate", variant: "destructive" });
      return;
    }
    const hasEmptyDescription = lineItems.some(item => stripHtmlForValidation(item.description).length === 0);
    if (hasEmptyDescription) {
      toast({ title: "Error", description: "All line items need a description", variant: "destructive" });
      return;
    }

    const itemOrder = entries.map(e => e.type === 'block' ? 'block' : 'item');
    const finalItems = lineItems.map(item => ({
      ...item,
      unitPrice: Math.round((item.unitPrice || 0) * 100),
      total: Math.round((item.quantity || 0) * (item.unitPrice || 0) * 100),
      taxable: item.taxable ?? false,
    }));

    const contentData: any = { items: finalItems, itemOrder };
    const snapshotForSave = sellRateSnapshot ?? productionRateBlocks.find(b => b.roomBuilderData?.sellRate)?.roomBuilderData?.sellRate ?? null;
    if (snapshotForSave != null && snapshotForSave > 0) {
      contentData.sellRateSnapshot = snapshotForSave;
    }
    if (productionRateBlocks.length > 0) {
      contentData.productionRateBlocks = productionRateBlocks;
    }

    mutate({
      contactId,
      type: 'change_order',
      status: 'draft',
      title: effectiveTitle,
      content: contentData,
      totalAmount: Math.round(calculateTotal() * 100),
      sourceDocumentId,
      ...(productionRateBlocks.length > 0 ? { lineItemSource: 'production_rates' } : {}),
    } as any, {
      onSuccess: (newDoc) => {
        onOpenChange(false);
        resetForm();
        queryClient.invalidateQueries({ queryKey: ['/api/documents', sourceDocumentId, 'change-orders'] });
        toast({ title: "Change Order Created", description: "Change order added. Send it to the customer for approval." });
        onChangeOrderCreated?.(newDoc);
      },
      onError: () => {
        toast({ title: "Failed to create change order", variant: "destructive" });
      },
    });
  };

  const resetForm = () => {
    setTitle('');
    setEntries([]);
    setEditingBlockId(null);
    setShowRoomBuilder(false);
  };

  const closeDialog = () => {
    onOpenChange(false);
    resetForm();
  };

  const handleBack = () => {
    const hasChanges = title.trim() !== '' || entries.length > 0;
    if (hasChanges) setShowUnsavedWarning(true);
    else closeDialog();
  };

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [open]);

  if (!open) return null;

  const firstOptionalIdx = entries.findIndex(e => isEntryOptional(e));
  const regularEntries = firstOptionalIdx === -1 ? entries : entries.slice(0, firstOptionalIdx);
  const optionalEntries = firstOptionalIdx === -1 ? [] : entries.slice(firstOptionalIdx);

  const handleZoneDragEnd = () => {
    const from = dragFromRef.current;
    const over = dragOverRef.current;
    if (from !== null && over !== null && from !== over) {
      const fromOpt = isEntryOptional(entries[from]);
      const overOpt = isEntryOptional(entries[over]);
      if (fromOpt !== overOpt) {
        toast({ title: "Can't move between sections", description: "Optional items stay in the Optional section.", variant: "destructive" });
        setDragFromIndex(null); setDragOverIndex(null); return;
      }
      setEntries(prev => {
        const next = [...prev];
        const [moved] = next.splice(from, 1);
        next.splice(over, 0, moved);
        return next;
      });
    }
    setDragFromIndex(null); setDragOverIndex(null);
  };

  const handleZoneMoveUp = (eIdx: number) => {
    const isOpt = isEntryOptional(entries[eIdx]);
    const boundary = isOpt ? firstOptionalIdx : 0;
    if (eIdx <= boundary) return;
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

  const renderEntry = (entry: COEntry, eIdx: number, zoneFirst: boolean, zoneLast: boolean) => {
    if (entry.type === 'block') {
      const block = entry.block;
      return (
        <div key={`block-wrap-${block.id}`} className="relative">
          <ProductionRateBlockCard
            key={`block-${block.id}`}
            block={block}
            index={eIdx}
            onClick={() => { setEditingBlockId(block.id); setShowRoomBuilder(true); }}
            onRemove={() => handleDeleteEntry(eIdx)}
            onToggleOptional={() => {
              setEntries(prev => sortEntriesOptionalLast(prev.map((e, i) =>
                i === eIdx && e.type === 'block'
                  ? { ...e, block: { ...e.block, isOptional: !e.block.isOptional } }
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
            testIdPrefix="co-"
          />
        </div>
      );
    }
    return (
      <div key={`item-wrap-${eIdx}`} className="relative">
        <LineItemCard
          item={entry.item}
          index={eIdx}
          onClick={() => handleEditLineItem(eIdx)}
          onRemove={() => handleDeleteEntry(eIdx)}
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
      {createPortal(
        <>
        <div className="fixed inset-0 z-[9998] bg-background" />
        <div
          className="fixed top-0 left-0 right-0 bottom-0 z-[9999] bg-background overflow-hidden flex flex-col"
          data-testid="create-change-order-page"
          onTouchMove={(e) => e.stopPropagation()}
        >
          <div className="shrink-0 z-50 bg-slate-800 dark:bg-slate-900 shadow-md pt-[env(safe-area-inset-top,0px)]">
            <div className="flex items-center justify-between gap-4 px-4 py-3 lg:px-8">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-md border border-white/20 text-white/70 text-sm font-medium hover:bg-white/10 transition-colors shrink-0"
                  onClick={handleBack}
                  data-testid="button-back-change-order"
                >
                  Done
                </button>
                <h1 className="text-lg lg:text-2xl font-bold font-display truncate text-white">Create Change Order</h1>
              </div>
              <Button onClick={handleSave} disabled={isPending} className="bg-primary text-primary-foreground" data-testid="button-save-change-order">
                {isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Save
              </Button>
            </div>
            <div className={`grid ${userTier === 'elite' ? 'grid-cols-3' : 'grid-cols-2'} gap-2 px-4 pb-3 lg:px-8`}>
              {userTier === 'elite' && (
                <button
                  type="button"
                  className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md border border-white/20 text-white/90 text-xs font-medium hover:bg-white/10 transition-colors"
                  onClick={() => { setEditingBlockId(null); setShowServicePicker(true); }}
                  data-testid="button-co-add-estimate"
                >
                  <Calculator className="w-3.5 h-3.5" />
                  Add Estimate
                </button>
              )}
              <button
                type="button"
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md border border-white/20 text-white/90 text-xs font-medium hover:bg-white/10 transition-colors"
                onClick={handleAddLineItem}
                data-testid="button-add-co-item"
              >
                <Plus className="w-3.5 h-3.5" /> Add Item
              </button>
              <button
                type="button"
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md border border-white/20 text-white/90 text-xs font-medium hover:bg-white/10 transition-colors"
                onClick={() => setShowLibraryPicker(true)}
                data-testid="button-co-from-library"
              >
                <BookOpen className="w-3.5 h-3.5" /> From Library
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-auto p-3 lg:p-8">
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="space-y-1.5">
                  <Label className={!title.trim() ? "text-red-600 dark:text-red-400" : undefined}>
                    Title {!title.trim() && <span className="text-xs font-normal">(required)</span>}
                  </Label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Additional Features Request"
                    data-testid="input-change-order-title"
                    className={!title.trim() ? "border-red-400 focus-visible:ring-red-400 dark:border-red-500" : undefined}
                  />
                  {!title.trim() && (
                    <p className="text-xs text-muted-foreground">
                      Leave blank and we'll name it <span className="font-medium">"{buildFallbackTitle()}"</span>.
                    </p>
                  )}
                </div>

                <div className="pt-2 border-t space-y-3">
                  {entries.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground">
                      <p>No items yet</p>
                      <p className="text-sm mt-1">
                        {userTier === 'elite' ? 'Use "Add Estimate" to build from production rates or "Add Item" manually' : 'Tap "Add Item" to get started'}
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-3">
                        {regularEntries.map((entry, i) => renderEntry(entry, i, i === 0, i === regularEntries.length - 1))}
                      </div>
                      {optionalEntries.length > 0 && (
                        <>
                          <div className="flex items-center gap-3 pt-4 pb-2">
                            <div className="flex-1 h-px bg-emerald-300 dark:bg-emerald-700" />
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
                              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Optional Add-Ons</span>
                            </div>
                            <div className="flex-1 h-px bg-emerald-300 dark:bg-emerald-700" />
                          </div>
                          <div className="space-y-3">
                            {optionalEntries.map((entry, i) => {
                              const eIdx = firstOptionalIdx + i;
                              return renderEntry(entry, eIdx, i === 0, i === optionalEntries.length - 1);
                            })}
                          </div>
                        </>
                      )}
                    </>
                  )}
                  <div className="pt-3 border-t space-y-1">
                    {calculateTaxAmount() > 0 && (
                      <>
                        <div className="flex items-center justify-between text-sm text-muted-foreground" data-testid="text-co-subtotal">
                          <span>Subtotal</span>
                          <span className="tabular-nums">{formatCurrency(calculateSubtotal())}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm text-muted-foreground" data-testid="text-co-tax">
                          <span>{taxProfileName ? `${taxProfileName} (${taxRate}%)` : `Tax (${taxRate}%)`}</span>
                          <span className="tabular-nums">{formatCurrency(calculateTaxAmount())}</span>
                        </div>
                      </>
                    )}
                    <div className="flex items-center justify-between text-lg font-semibold">
                      <span>Change Order Total</span>
                      <span data-testid="text-co-total">{formatCurrency(calculateTotal())}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Original proposal: {formatCurrency(originalTotalAmount / 100)} &rarr; New total after approval: {formatCurrency((originalTotalAmount / 100) + calculateTotal())}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {showRoomBuilder && createPortal(
            <div className="fixed inset-0 z-[10000] bg-background flex flex-col" data-testid="co-fullscreen-room-builder">
              <div className="shrink-0 z-50 bg-slate-800 dark:bg-slate-900 text-white shadow-md pt-[env(safe-area-inset-top,0px)]">
                <div className="flex items-center justify-between px-3 py-2.5 lg:px-8">
                  <div className="flex items-center gap-2 min-w-0">
                    <Calculator className="w-5 h-5 text-blue-300 shrink-0" />
                    <span className="font-semibold text-sm truncate text-white">
                      {editingBlockId ? 'Edit Estimate' : 'Add Estimate'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => roomBuilderRef.current?.requestClose()}
                      className="text-xs px-3 py-1.5 rounded-lg border border-white/20 text-white/70 hover:text-white hover:bg-white/10 font-medium"
                      data-testid="button-co-close-builder"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => roomBuilderRef.current?.requestSave()}
                      className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90"
                      data-testid="button-co-save-estimate-header"
                    >
                      <Save className="w-3.5 h-3.5 inline mr-1" /> Save
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-1.5 py-3 lg:px-8 lg:py-6">
                <div className="max-w-3xl mx-auto">
                  <RoomBuilder
                    builderRef={roomBuilderRef}
                    projectId={projectId}
                    taxRate={taxRate}
                    taxProfiles={taxProfilesList}
                    sellRateSnapshot={sellRateSnapshot}
                    onGenerateLineItems={(newItems) => {
                      setEntries(prev => sortEntriesOptionalLast([...prev, ...newItems.map(item => ({ type: 'item' as const, item }))]));
                      setShowRoomBuilder(false);
                    }}
                    onCancel={() => { setShowRoomBuilder(false); setEditingBlockId(null); setSelectedService(null); }}
                    initialService={selectedService || undefined}
                    initialRoomData={editingBlockId ? productionRateBlocks.find(b => b.id === editingBlockId)?.roomBuilderData : undefined}
                    initialBlockName={editingBlockId ? productionRateBlocks.find(b => b.id === editingBlockId)?.name : undefined}
                    initialTaxable={editingBlockId ? productionRateBlocks.find(b => b.id === editingBlockId)?.taxable : undefined}
                    initialTaxProfileId={editingBlockId ? productionRateBlocks.find(b => b.id === editingBlockId)?.taxProfileId : (productionRateBlocks.find(b => b.taxable && b.taxProfileId)?.taxProfileId)}
                    onSaveRoomData={(data, newItems, bName, bTaxable, taxProfileInfo) => {
                      if (sellRateSnapshot == null && data.sellRate && data.sellRate > 0) {
                        setSellRateSnapshot(data.sellRate);
                      }
                      const blockTaxFields = { taxable: bTaxable, taxProfileId: taxProfileInfo?.taxProfileId, taxProfileName: taxProfileInfo?.taxProfileName, taxProfileRate: taxProfileInfo?.taxProfileRate };
                      if (editingBlockId) {
                        setEntries(prev => prev.map(e =>
                          e.type === 'block' && e.block.id === editingBlockId
                            ? { ...e, block: { ...e.block, name: bName, roomBuilderData: data, ...blockTaxFields, lineItems: newItems.map(li => ({ ...li, unitPrice: Math.round(li.unitPrice * 100), total: Math.round(li.total * 100) })) } }
                            : e
                        ));
                      } else {
                        const newBlock: ProductionRateBlock = {
                          id: `prb-${Date.now()}`,
                          name: bName,
                          roomBuilderData: data,
                          ...blockTaxFields,
                          lineItems: newItems.map(li => ({ ...li, unitPrice: Math.round(li.unitPrice * 100), total: Math.round(li.total * 100) })),
                        };
                        setEntries(prev => sortEntriesOptionalLast([...prev, { type: 'block', block: newBlock }]));
                      }
                      setShowRoomBuilder(false);
                      setEditingBlockId(null);
                      toast({
                        title: editingBlockId ? `"${bName}" updated` : `"${bName}" added`,
                        description: `${data.rooms.length} area${data.rooms.length !== 1 ? 's' : ''} — $${data.grandTotal.toFixed(0)} total`,
                      });
                    }}
                  />
                </div>
              </div>
            </div>,
            document.body
          )}
        </div>
        </>,
        document.body
      )}

      {showServicePicker && createPortal(
        <div className="fixed inset-0 z-[10001] bg-black/60 flex items-center justify-center p-4 touch-none overscroll-none" onClick={() => setShowServicePicker(false)} onTouchMove={e => e.preventDefault()} data-testid="co-service-picker-overlay">
          <div className="bg-background rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()} onTouchMove={e => e.stopPropagation()} data-testid="co-service-picker-modal">
            <div className="px-6 pt-6 pb-4">
              <h3 className="text-xl font-bold">Select Service</h3>
              <p className="text-sm text-muted-foreground mt-1">What type of work is this estimate for?</p>
            </div>
            <div className="px-4 pb-4 grid grid-cols-2 gap-3" style={{ overscrollBehavior: 'contain' }}>
              {(() => {
                const serviceConfig: Record<string, { icon: typeof Home; color: string; bg: string; desc: string }> = {
                  "Residential Interior": { icon: Home, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800", desc: "Rooms & living spaces" },
                  "Residential Exterior": { icon: Fence, color: "text-green-600 dark:text-green-400", bg: "bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-800", desc: "Siding, trim & decks" },
                  "Commercial Interior": { icon: Building2, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800", desc: "Offices & retail" },
                  "Commercial Exterior": { icon: Building2, color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-800", desc: "Building exteriors" },
                  "Kitchen Cabinets": { icon: CookingPot, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800", desc: "Cabinet refinishing" },
                  "Flooring Installation": { icon: Grid3X3, color: "text-teal-600 dark:text-teal-400", bg: "bg-teal-50 dark:bg-teal-950/40 border-teal-200 dark:border-teal-800", desc: "Floor surfaces" },
                };
                const allTypes = Object.keys(serviceConfig);
                const extraTypes = (estimateTypes || []).filter(t => !allTypes.includes(t));
                const fullTypes = [...allTypes, ...extraTypes];
                return fullTypes.map(t => {
                  const config = serviceConfig[t] || { icon: Wrench, color: "text-slate-600 dark:text-slate-400", bg: "bg-slate-50 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800", desc: "Custom service" };
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
                      data-testid={`co-service-option-${t}`}
                    >
                      <div className={`w-11 h-11 rounded-full flex items-center justify-center bg-white dark:bg-background shadow-sm ${config.color}`}>
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
              <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={() => setShowServicePicker(false)} data-testid="button-co-cancel-service-picker">
                Cancel
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <ServiceLibraryPicker
        open={showLibraryPicker}
        onClose={() => setShowLibraryPicker(false)}
        onPickBlock={(block) => {
          setEntries(prev => sortEntriesOptionalLast([...prev, { type: 'block', block }]));
          setEditingBlockId(block.id);
          setShowRoomBuilder(true);
        }}
        onPickLineItem={(li) => {
          const item: LineItem = { name: li.name || '', description: li.description, quantity: li.quantity, unitPrice: li.unitPrice, total: li.total };
          setEditingLineItem(item);
          setEditingLineItemIndex(null);
          setIsLineItemModalOpen(true);
        }}
      />

      <LineItemEditorModal
        open={isLineItemModalOpen}
        onOpenChange={(openState) => {
          if (!openState) {
            setIsLineItemModalOpen(false);
            setEditingLineItem(null);
            setEditingLineItemIndex(null);
          }
        }}
        item={editingLineItem || { name: '', description: '', quantity: 1, unitPrice: 0, total: 0 }}
        onSave={handleSaveLineItem}
        itemIndex={editingLineItemIndex ?? 0}
        taxRate={taxRate}
        taxProfileName={taxProfileName}
        taxProfiles={taxProfilesList}
        projectId={projectId}
      />

      <AlertDialog open={showUnsavedWarning} onOpenChange={setShowUnsavedWarning}>
        <AlertDialogContent className="z-[10001]" overlayClassName="z-[10001]">
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Are you sure you want to leave? Your changes will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-unsaved">Keep Editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { setShowUnsavedWarning(false); closeDialog(); }}
              data-testid="button-discard-changes"
              className="bg-destructive text-destructive-foreground"
            >
              Discard Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
