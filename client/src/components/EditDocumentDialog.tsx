import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { useUpdateDocument } from "@/hooks/use-documents";
import { useProposalTemplates } from "@/hooks/use-templates";
import { useCompanySettings } from "@/hooks/use-company-settings";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Loader2, Pencil, Plus, Save, X, ChevronDown, ChevronUp, DollarSign, Calculator, AlertTriangle, GripVertical, Tag, Percent, Trash2, Layers, Home, Building2, PaintBucket, Fence, CookingPot, Grid3X3, Wrench, BookOpen } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Document, DEFAULT_PROPOSAL_DISPLAY } from "@shared/schema";
import type { PaymentSettings, RoomBuilderData, ProductionRateBlock, ProposalDisplayDefaults, DocumentDiscount } from "@shared/schema";
import { stripHtmlForValidation } from "./RichTextEditor";
import { LineItemEditorModal, LineItemCard, ProductionRateBlockCard, type LineItem } from "./LineItemEditorModal";
import { DiscountBuilderModal } from "./DiscountBuilderModal";
import { LineItemRenderer } from "./LineItemRenderer";
import { PaymentSettingsSection } from "./PaymentSettingsSection";
import { RoomBuilder, type RoomBuilderHandle } from "./RoomBuilder";
import { CustomerVisibilityPanel } from "./CustomerVisibilityPanel";
import { InlinePackageEditor, ProposalPackageSettingsModal } from "./InlinePackageEditor";
import { ServiceLibraryPicker } from "./ServiceLibraryPicker";
import type { PackageSnapshot, ProposalPackage } from "@shared/schema";
import { packageToSnapshot } from "@/lib/packagePricing";
import { formatCurrency, cn } from "@/lib/utils";

type DocEntry =
  | { type: 'block'; block: ProductionRateBlock }
  | { type: 'item'; item: LineItem };

function isEntryOptional(e: DocEntry): boolean {
  return e.type === 'block' ? !!e.block.isOptional : !!e.item.isOptional;
}

function sortEntriesOptionalLast(entries: DocEntry[]): DocEntry[] {
  const regular = entries.filter(e => !isEntryOptional(e));
  const optional = entries.filter(e => isEntryOptional(e));
  return [...regular, ...optional];
}

export type EditFocusEntry =
  | { kind: 'block'; blockId: string; roomId?: string }
  | { kind: 'item'; itemId: string };

interface EditDocumentDialogProps {
  document: Document;
  externalOpen?: boolean;
  onExternalOpenChange?: (open: boolean) => void;
  focusEntry?: EditFocusEntry | null;
  hideTrigger?: boolean;
  readOnly?: boolean;
}

export function EditDocumentDialog({ document, externalOpen, onExternalOpenChange, focusEntry, hideTrigger, readOnly = false }: EditDocumentDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = externalOpen !== undefined;
  const open = isControlled ? externalOpen! : internalOpen;
  const setOpen = useCallback((v: boolean) => {
    if (isControlled) {
      onExternalOpenChange?.(v);
    } else {
      setInternalOpen(v);
    }
  }, [isControlled, onExternalOpenChange]);
  const [vpState, setVpState] = useState({ top: 0, height: 0 });

  useEffect(() => {
    if (!open) { setVpState({ top: 0, height: 0 }); return; }
    const vv = window.visualViewport;
    const update = () => {
      const winH = window.innerHeight;
      if (vv) {
        setVpState({ top: vv.offsetTop, height: Math.min(winH, vv.height) });
      } else {
        setVpState({ top: 0, height: winH });
      }
    };
    update();
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  const [editingLineItem, setEditingLineItem] = useState<LineItem | null>(null);
  const [editingLineItemIndex, setEditingLineItemIndex] = useState<number | null>(null);
  const [isLineItemModalOpen, setIsLineItemModalOpen] = useState(false);
  const { user } = useAuth();
  const userTier = user?.subscriptionTier || 'starter';
  const { mutate: updateDoc, isPending } = useUpdateDocument();
  const { data: proposalTemplates } = useProposalTemplates();
  const { data: compSettings } = useCompanySettings();
  const { data: taxProfilesList = [] } = useQuery<any[]>({ queryKey: ['/api/tax-profiles'] });
  const { data: estimateTypes } = useQuery<string[]>({ queryKey: ['/api/surfaces/estimate-types'] });
  const taxRate = taxProfilesList.length > 0
    ? parseFloat(taxProfilesList.find((p: any) => p.isDefault)?.rate || taxProfilesList[0]?.rate || '0')
    : (compSettings?.taxRate ? parseFloat(compSettings.taxRate) : 0);
  const { toast } = useToast();
  const { data: globalPackages } = useQuery<ProposalPackage[]>({ queryKey: ['/api/proposal-packages'] });
  
  const [title, setTitle] = useState(document.title);
  const [notes, setNotes] = useState(document.content.notes || '');
  const [validUntil, setValidUntil] = useState(document.content.validUntil || '');
  const [entries, setEntries] = useState<DocEntry[]>([]);
  const [discounts, setDiscounts] = useState<DocumentDiscount[]>([]);
  const [showDiscountBuilder, setShowDiscountBuilder] = useState(false);
  const [editingDiscountIdx, setEditingDiscountIdx] = useState<number | null>(null);

  const items = useMemo(() => entries.filter(e => e.type === 'item').map(e => e.item), [entries]);
  const productionRateBlocks = useMemo(() => entries.filter(e => e.type === 'block').map(e => e.block), [entries]);
  const activeTaxProfileName = useMemo(() => {
    const blocks = entries.filter(e => e.type === 'block').map(e => e.block);
    const taxBlock = blocks.find(b => b.taxable && b.taxProfileName);
    if (taxBlock?.taxProfileName) return taxBlock.taxProfileName;
    if (taxProfilesList.length > 0) {
      const def = taxProfilesList.find((p: any) => p.isDefault) || taxProfilesList[0];
      return def?.name || null;
    }
    return null;
  }, [entries, taxProfilesList]);
  const activeTaxRate = useMemo(() => {
    const blocks = entries.filter(e => e.type === 'block').map(e => e.block);
    const taxBlock = blocks.find(b => b.taxable && b.taxProfileRate != null);
    if (taxBlock?.taxProfileRate != null) return parseFloat(String(taxBlock.taxProfileRate));
    return taxRate;
  }, [entries, taxRate]);

  const itemsOnlyIndexToEntriesIndex = (itemOnlyIdx: number): number => {
    let count = 0;
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].type === 'item') {
        if (count === itemOnlyIdx) return i;
        count++;
      }
    }
    return -1;
  };

  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings | undefined>(document.content.paymentSettings);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const paymentSettingsSnapshotRef = useRef<PaymentSettings | undefined>(undefined);
  const openPaymentModal = useCallback(() => {
    paymentSettingsSnapshotRef.current = paymentSettings;
    setShowPaymentModal(true);
  }, [paymentSettings]);
  const [showPkgModal, setShowPkgModal] = useState(false);
  const [showLibraryPicker, setShowLibraryPicker] = useState(false);
  const [proposalPackagesEnabled, setProposalPackagesEnabled] = useState<boolean>(
    !!(document.content as any).proposalPackagesEnabled
  );
  const [proposalPackagesData, setProposalPackagesData] = useState<PackageSnapshot[]>(
    (document.content as any).proposalPackagesData || []
  );
  const [proposalMaterialAdjustments, setProposalMaterialAdjustments] = useState<boolean>(
    (document.content as any).proposalMaterialAdjustments ?? false
  );

  const handleTogglePackages = useCallback((enabled: boolean) => {
    setProposalPackagesEnabled(enabled);
    markDirty();
    if (enabled && proposalPackagesData.length === 0 && globalPackages && globalPackages.length > 0) {
      const pkgSnapshots = globalPackages.map(p => packageToSnapshot(p));
      setProposalPackagesData(pkgSnapshots);
      setProposalMaterialAdjustments(!!compSettings?.packageMaterialAdjustments);
    }
  }, [globalPackages, proposalPackagesData.length, compSettings?.packageMaterialAdjustments]);

  const [showRoomBuilder, setShowRoomBuilder] = useState(false);
  const [initialEditingRoomId, setInitialEditingRoomId] = useState<string | null>(null);
  const [showServicePicker, setShowServicePicker] = useState(false);
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [showAmountWarning, setShowAmountWarning] = useState(false);
  const roomBuilderRef = useRef<RoomBuilderHandle | null>(null);
  const roomBuilderAutoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRoomBuilderAutoSaveRef = useRef(false);
  const [roomBuilderAutoSaveStatus, setRoomBuilderAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const roomBuilderSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const entriesBeforeBuilderRef = useRef<typeof entries | null>(null);

  const scrollContentRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (showServicePicker) {
      const el = scrollContentRef.current;
      if (el) {
        const prevOverflow = el.style.overflow;
        el.style.overflow = 'hidden';
        const blockTouch = (e: TouchEvent) => { e.preventDefault(); };
        el.addEventListener('touchmove', blockTouch, { passive: false });
        return () => {
          el.style.overflow = prevOverflow;
          el.removeEventListener('touchmove', blockTouch);
        };
      }
    }
  }, [showServicePicker]);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const docSellRateSnapshot = useMemo<number | null>(() => {
    const snap = (document.content as any).sellRateSnapshot;
    if (typeof snap === 'number' && snap > 0) return snap;
    const blocks = (document.content as any).productionRateBlocks || [];
    const fromBlock = blocks.find((b: any) => b?.roomBuilderData?.sellRate)?.roomBuilderData?.sellRate;
    return typeof fromBlock === 'number' && fromBlock > 0 ? fromBlock : null;
  }, [document.content]);

  const [proposalDisplayDefaults, setProposalDisplayDefaults] = useState<ProposalDisplayDefaults>(
    document.content.proposalDisplayDefaults || { ...DEFAULT_PROPOSAL_DISPLAY }
  );
  const [customerPreview, setCustomerPreview] = useState(false);
  const [dragFromIndex, _setDragFromIndex] = useState<number | null>(null);
  const [dragOverIndex, _setDragOverIndex] = useState<number | null>(null);
  const dragFromRef = useRef<number | null>(null);
  const dragOverRef = useRef<number | null>(null);
  const setDragFromIndex = useCallback((v: number | null) => { dragFromRef.current = v; _setDragFromIndex(v); }, []);
  const setDragOverIndex = useCallback((v: number | null) => { dragOverRef.current = v; _setDragOverIndex(v); }, []);

  const [initializedForDocId, setInitializedForDocId] = useState<number | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveGenerationRef = useRef(0);
  const originalDocSnapshotRef = useRef<{ title: string; content: any; totalAmount: number } | null>(null);
  const focusHandledRef = useRef<string | null>(null);
  const openedViaFocusRef = useRef(false);
  const [focusMode, setFocusMode] = useState(false);

  useEffect(() => {
    if (open && initializedForDocId !== document.id) {
      originalDocSnapshotRef.current = {
        title: document.title,
        content: JSON.parse(JSON.stringify(document.content)),
        totalAmount: document.totalAmount,
      };
      console.log('[CompanyCam] EditDocumentDialog init', {
        docId: document.id,
        currentCcId: document.companyCamProjectId || null,
        currentCcName: document.companyCamProjectName || null,
        note: 'editor will not send CC fields on save (managed via proposal photo card)',
      });
      setTitle(document.title);
      setNotes(document.content.notes || '');
      const defaultValidUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      setValidUntil(document.content.validUntil || defaultValidUntil);
      const loadedItems: LineItem[] = document.content.items.map((item, i) => ({
        name: item.name || '',
        description: item.description || '',
        quantity: item.quantity || 1,
        unitPrice: (item.unitPrice || 0) / 100,
        total: (item.total || 0) / 100,
        taxable: item.taxable ?? false,
        isOptional: item.isOptional ?? false,
        descriptionOnly: item.descriptionOnly ?? false,
        hidePrice: (item as any).hidePrice ?? false,
        isOverallPrep: item.isOverallPrep,
        scopeNoteHtml: item.scopeNoteHtml,
        surfaces: item.surfaces,
        pricingDetails: item.pricingDetails,
        paintAssignment: item.paintAssignment,
        displayOverrides: item.displayOverrides,
        debug: item.debug,
        _srcIdx: i,
      } as LineItem & { _srcIdx: number }));
      const loadedBlocks: ProductionRateBlock[] = document.content.productionRateBlocks || [];
      const savedOrder: string[] | undefined = (document.content as any).itemOrder;
      if (savedOrder && Array.isArray(savedOrder)) {
        let bIdx = 0, iIdx = 0;
        const rebuilt: DocEntry[] = [];
        for (const t of savedOrder) {
          if (t === 'block' && bIdx < loadedBlocks.length) {
            rebuilt.push({ type: 'block', block: loadedBlocks[bIdx++] });
          } else if (t === 'item' && iIdx < loadedItems.length) {
            rebuilt.push({ type: 'item', item: loadedItems[iIdx++] });
          }
        }
        while (bIdx < loadedBlocks.length) rebuilt.push({ type: 'block', block: loadedBlocks[bIdx++] });
        while (iIdx < loadedItems.length) rebuilt.push({ type: 'item', item: loadedItems[iIdx++] });
        setEntries(sortEntriesOptionalLast(rebuilt));
      } else {
        setEntries(sortEntriesOptionalLast([
          ...loadedBlocks.map(block => ({ type: 'block' as const, block })),
          ...loadedItems.map(item => ({ type: 'item' as const, item })),
        ]));
      }
      setPaymentSettings(document.content.paymentSettings);
      setEditingBlockId(null);
      setShowRoomBuilder(false);
      setProposalDisplayDefaults(document.content.proposalDisplayDefaults || { ...DEFAULT_PROPOSAL_DISPLAY });
      setProposalPackagesEnabled(!!(document.content as any).proposalPackagesEnabled);
      setProposalPackagesData((document.content as any).proposalPackagesData || []);
      setProposalMaterialAdjustments((document.content as any).proposalMaterialAdjustments ?? false);
      const loadedDiscounts: DocumentDiscount[] = document.content.discounts || [];
      if (!loadedDiscounts.length && document.content.discount?.value) {
        loadedDiscounts.push({ ...document.content.discount, id: crypto.randomUUID() });
      }
      setDiscounts(loadedDiscounts);
      setCustomerPreview(false);
      setHasUnsavedChanges(false);
      setInitializedForDocId(document.id);
    }
    if (!open) {
      setInitializedForDocId(null);
      setHasUnsavedChanges(false);
      setAutoSaveStatus('idle');
      saveGenerationRef.current += 1;
      if (autoSaveTimerRef.current) { clearTimeout(autoSaveTimerRef.current); autoSaveTimerRef.current = null; }
      if (autoSaveSavedTimerRef.current) { clearTimeout(autoSaveSavedTimerRef.current); autoSaveSavedTimerRef.current = null; }
      focusHandledRef.current = null;
      openedViaFocusRef.current = false;
      setFocusMode(false);
    }
  }, [open, document, initializedForDocId]);

  const closeIfFocused = useCallback(() => {
    if (openedViaFocusRef.current) {
      openedViaFocusRef.current = false;
      setFocusMode(false);
      setOpen(false);
    }
  }, [setOpen]);

  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      if (autoSaveSavedTimerRef.current) clearTimeout(autoSaveSavedTimerRef.current);
      if (roomBuilderAutoSaveTimerRef.current) clearTimeout(roomBuilderAutoSaveTimerRef.current);
      if (roomBuilderSavedTimerRef.current) clearTimeout(roomBuilderSavedTimerRef.current);
    };
  }, []);

  const isLocked = ['accepted', 'paid', 'rejected'].includes(document.status);

  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const saveDocRef = useRef<(e: DocEntry[], c: boolean) => void>(() => {});

  const cancelAutoSave = useCallback(() => {
    if (autoSaveTimerRef.current) { clearTimeout(autoSaveTimerRef.current); autoSaveTimerRef.current = null; }
  }, []);

  const scheduleAutoSave = useCallback(() => {
    if (readOnly) return;
    cancelAutoSave();
    autoSaveTimerRef.current = setTimeout(() => {
      if (isPending) return;
      setAutoSaveStatus('saving');
      saveDocRef.current(entriesRef.current, false);
    }, 3000);
  }, [isPending, cancelAutoSave, readOnly]);

  const markDirty = () => {
    if (readOnly) return;
    setHasUnsavedChanges(true);
    saveGenerationRef.current += 1;
    setAutoSaveStatus('idle');
    scheduleAutoSave();
  };

  const openItemEditor = (entriesIdx: number) => {
    const entry = entries[entriesIdx];
    if (entry?.type === 'item') {
      setEditingLineItem({ ...entry.item });
      setEditingLineItemIndex(entriesIdx);
      setIsLineItemModalOpen(true);
    }
  };

  useEffect(() => {
    if (!open) return;
    if (initializedForDocId !== document.id) return;
    if (!focusEntry) return;
    if (entries.length === 0) return;
    const key = focusEntry.kind === 'block' ? `b:${focusEntry.blockId}` : `i:${focusEntry.itemId}`;
    if (focusHandledRef.current === key) return;
    focusHandledRef.current = key;
    if (focusEntry.kind === 'block') {
      const blockExists = entries.some(e => e.type === 'block' && e.block.id === focusEntry.blockId);
      if (!blockExists) return;
      openedViaFocusRef.current = true;
      setFocusMode(true);
      setEditingBlockId(focusEntry.blockId);
      setInitialEditingRoomId(focusEntry.roomId ?? null);
      entriesBeforeBuilderRef.current = entries;
      setShowRoomBuilder(true);
    } else {
      const targetIdx = parseInt(focusEntry.itemId, 10);
      if (!isNaN(targetIdx)) {
        const entriesIdx = entries.findIndex(e => e.type === 'item' && (e.item as any)._srcIdx === targetIdx);
        if (entriesIdx >= 0) {
          openedViaFocusRef.current = true;
          setFocusMode(true);
          openItemEditor(entriesIdx);
        }
      }
    }
  }, [open, initializedForDocId, document.id, focusEntry, entries]);

  const addItem = () => {
    const newItem: LineItem = { name: '', description: '', quantity: 1, unitPrice: 0, total: 0 };
    setEditingLineItem(newItem);
    setEditingLineItemIndex(null);
    setIsLineItemModalOpen(true);
  };

  const [pendingDeleteIdx, setPendingDeleteIdx] = useState<number | null>(null);
  const [pendingDeleteDiscountIdx, setPendingDeleteDiscountIdx] = useState<number | null>(null);
  const removeEntry = (entriesIdx: number) => {
    setPendingDeleteIdx(entriesIdx);
  };
  const confirmDeleteEntry = () => {
    if (pendingDeleteIdx !== null) {
      setEntries(prev => prev.filter((_, i) => i !== pendingDeleteIdx));
      markDirty();
      setPendingDeleteIdx(null);
    }
  };


  const handleLoadTemplate = (templateId: string) => {
    const template = proposalTemplates?.find(t => t.id === Number(templateId));
    if (template) {
      const templateItems = (template.lineItems || [])
        .filter((item: any) => item != null)
        .map((item: any) => ({
          ...item,
          name: item.name || '',
          description: item.description || '',
          quantity: item.quantity ?? (item.descriptionOnly ? 0 : 1),
          unitPrice: (item.unitPrice || 0) / 100,
          total: (item.total || 0) / 100,
          taxable: item.taxable ?? false,
          isOptional: item.isOptional ?? false,
          descriptionOnly: item.descriptionOnly ?? false,
        }));
      const newEntries: DocEntry[] = [];
      const blocks = (template as any).productionRateBlocks;
      let strippedBlocks = 0;
      if (blocks && Array.isArray(blocks) && blocks.length > 0) {
        if (userTier === 'elite') {
          blocks.forEach((b: ProductionRateBlock) => newEntries.push({ type: 'block', block: b }));
        } else {
          strippedBlocks = blocks.length;
        }
      }
      templateItems.forEach(item => newEntries.push({ type: 'item', item }));
      setEntries(prev => sortEntriesOptionalLast([...prev, ...newEntries]));
      markDirty();
      if (strippedBlocks > 0 && newEntries.length === 0) {
        toast({ title: 'Template requires Elite', description: 'This template only contains Production Rate items, available on the Elite plan.', variant: 'destructive' });
      } else if (strippedBlocks > 0) {
        toast({ title: `Template "${template.name}" loaded`, description: `${strippedBlocks} Production Rate item${strippedBlocks > 1 ? 's' : ''} skipped (Elite only).` });
      } else {
        toast({ title: `Template "${template.name}" loaded` });
      }
    }
  };

  const blocksTotal = productionRateBlocks.filter(b => !b.isOptional).reduce((sum, block) => sum + (block.roomBuilderData.grandTotal || 0), 0);
  const subtotalBeforeDiscount = items.filter(i => !i.isOptional && !i.descriptionOnly).reduce((sum, item) => sum + ((item.quantity || 0) * (item.unitPrice || 0)), 0) + blocksTotal;
  let displayDiscountTotal = 0;
  for (const d of discounts) {
    if (d.value > 0) {
      displayDiscountTotal += d.type === 'percentage'
        ? subtotalBeforeDiscount * (Math.min(d.value, 100) / 100)
        : d.value;
    }
  }
  displayDiscountTotal = Math.min(displayDiscountTotal, Math.max(0, subtotalBeforeDiscount));
  const subtotal = subtotalBeforeDiscount - displayDiscountTotal;
  const editorTaxBuckets: Record<number, number> = {};
  const addEditorBucket = (rate: number, amount: number) => {
    if (rate <= 0 || amount === 0) return;
    editorTaxBuckets[rate] = (editorTaxBuckets[rate] || 0) + amount;
  };
  for (const item of items.filter(i => i.taxable && !i.isOptional && !i.descriptionOnly)) {
    addEditorBucket(taxRate, (item.quantity || 0) * (item.unitPrice || 0));
  }
  for (const block of productionRateBlocks.filter(b => b.taxable && !b.isOptional)) {
    const bRate = block.taxProfileRate != null ? parseFloat(String(block.taxProfileRate)) : taxRate;
    addEditorBucket(bRate, block.roomBuilderData.grandTotal || 0);
  }
  const discRatio = subtotalBeforeDiscount > 0 && displayDiscountTotal > 0 ? subtotal / subtotalBeforeDiscount : 1;
  let taxAmount = 0;
  for (const [rateKey, amount] of Object.entries(editorTaxBuckets)) {
    const rate = parseFloat(rateKey);
    if (rate <= 0 || amount <= 0) continue;
    taxAmount += (amount * discRatio) * (rate / 100);
  }
  const totalAmount = subtotal + taxAmount;
  const optionalItemsTotal = items.filter(i => i.isOptional && !i.descriptionOnly).reduce((sum, item) => sum + ((item.quantity || 0) * (item.unitPrice || 0)), 0);
  const optionalBlocksTotal = productionRateBlocks.filter(b => b.isOptional).reduce((sum, block) => sum + (block.roomBuilderData.grandTotal || 0), 0);
  const optionalTotal = optionalItemsTotal + optionalBlocksTotal;

  const saveDocument = (entriesToSave: DocEntry[], closeAfterSave: boolean = true) => {
    if (readOnly) {
      // Hard guard: in view-only mode no mutations may persist, even if a child
      // editor or autosave path slips through. Just close if asked.
      if (closeAfterSave) setOpen(false);
      return;
    }
    const saveItems = entriesToSave.filter(e => e.type === 'item').map(e => e.item);
    const saveBlocks = entriesToSave.filter(e => e.type === 'block').map(e => e.block);
    const itemOrder = entriesToSave.map(e => e.type === 'block' ? 'block' : 'item');

    const finalItems = saveItems.map(item => ({
      ...item,
      unitPrice: Math.round((item.unitPrice || 0) * 100),
      total: Math.round((item.quantity || 0) * (item.unitPrice || 0) * 100),
    }));

    const saveBTotal = saveBlocks.filter(b => !b.isOptional).reduce((sum, block) => sum + (block.roomBuilderData.grandTotal || 0), 0);
    const saveSubtotal = saveItems.filter(i => !i.isOptional && !i.descriptionOnly).reduce((sum, item) => sum + ((item.quantity || 0) * (item.unitPrice || 0)), 0) + saveBTotal;
    let totalDiscountDollars = 0;
    for (const d of discounts) {
      if (d.value > 0) {
        totalDiscountDollars += d.type === 'percentage'
          ? saveSubtotal * (Math.min(d.value, 100) / 100)
          : d.value;
      }
    }
    totalDiscountDollars = Math.min(totalDiscountDollars, Math.max(0, saveSubtotal));
    const afterDiscount = saveSubtotal - totalDiscountDollars;
    const saveTaxBuckets: Record<number, number> = {};
    const addSaveBucket = (rate: number, amount: number) => {
      if (rate <= 0 || amount === 0) return;
      saveTaxBuckets[rate] = (saveTaxBuckets[rate] || 0) + amount;
    };
    for (const item of saveItems.filter(i => i.taxable && !i.isOptional && !i.descriptionOnly)) {
      addSaveBucket(taxRate, (item.quantity || 0) * (item.unitPrice || 0));
    }
    for (const block of saveBlocks.filter(b => b.taxable && !b.isOptional)) {
      const bRate = block.taxProfileRate != null ? parseFloat(String(block.taxProfileRate)) : taxRate;
      addSaveBucket(bRate, block.roomBuilderData.grandTotal || 0);
    }
    const saveDiscRatio = saveSubtotal > 0 && totalDiscountDollars > 0 ? afterDiscount / saveSubtotal : 1;
    let saveTax = 0;
    for (const [rateKey, amount] of Object.entries(saveTaxBuckets)) {
      const rate = parseFloat(rateKey);
      if (rate <= 0 || amount <= 0) continue;
      saveTax += (amount * saveDiscRatio) * (rate / 100);
    }
    const totalDollars = afterDiscount + saveTax;

    const contentData: any = {
      items: finalItems,
      notes: notes || undefined,
      validUntil: validUntil || undefined,
      itemOrder,
    };
    if (paymentSettings) {
      contentData.paymentSettings = paymentSettings;
    }
    if (saveBlocks.length > 0) {
      contentData.productionRateBlocks = saveBlocks;
    }
    const preservedSnapshot = (document.content as any).sellRateSnapshot;
    if (typeof preservedSnapshot === 'number' && preservedSnapshot > 0) {
      contentData.sellRateSnapshot = preservedSnapshot;
    } else if (docSellRateSnapshot != null && docSellRateSnapshot > 0) {
      contentData.sellRateSnapshot = docSellRateSnapshot;
    }
    if (document.type === 'proposal') {
      contentData.proposalDisplayDefaults = proposalDisplayDefaults;
    }

    contentData.proposalPackagesEnabled = proposalPackagesEnabled;
    contentData.proposalPackagesData = proposalPackagesData.length > 0 ? proposalPackagesData : [];
    contentData.proposalMaterialAdjustments = proposalMaterialAdjustments;
    if (discounts.length > 0) {
      contentData.discounts = discounts.filter(d => d.value > 0);
    }
    delete contentData.discount;

    if (closeAfterSave) {
      setOpen(false);
    }

    const thisGeneration = saveGenerationRef.current;

    const updatePayload = {
      title,
      content: contentData,
      totalAmount: Math.round(totalDollars * 100),
    };
    console.log('[CompanyCam] EditDocumentDialog.saveDocument sending PUT', {
      docId: document.id,
      closeAfterSave,
      payloadKeys: Object.keys(updatePayload),
      includesCcFields: false,
    });

    updateDoc({
      id: document.id,
      data: updatePayload,
    }, {
      onSuccess: () => {
        if (saveGenerationRef.current !== thisGeneration) return;
        setHasUnsavedChanges(false);
        if (closeAfterSave) {
          toast({ title: "Document saved" });
        } else {
          setAutoSaveStatus('saved');
          if (autoSaveSavedTimerRef.current) clearTimeout(autoSaveSavedTimerRef.current);
          autoSaveSavedTimerRef.current = setTimeout(() => setAutoSaveStatus('idle'), 3000);
        }
      },
      onError: (error) => {
        if (saveGenerationRef.current !== thisGeneration) return;
        setAutoSaveStatus('idle');
        toast({ title: "Failed to save document", description: error.message, variant: "destructive" });
      }
    });
  };

  saveDocRef.current = saveDocument;

  const onSubmit = () => {
    if (autoSaveTimerRef.current) { clearTimeout(autoSaveTimerRef.current); autoSaveTimerRef.current = null; }
    originalDocSnapshotRef.current = null;
    try {
      const hasEmptyDescription = items.some(item => stripHtmlForValidation(item.description).length === 0);
      if (items.length > 0 && hasEmptyDescription) {
        toast({ title: "Error", description: "All line items need a description", variant: "destructive" });
        return;
      }
      const newTotalCents = Math.round(totalAmount * 100);
      const originalTotalCents = document.totalAmount || 0;
      if (document.status === 'sent' && originalTotalCents > 0) {
        const changePercent = Math.abs(newTotalCents - originalTotalCents) / originalTotalCents;
        if (changePercent > 0.1) {
          setShowAmountWarning(true);
          return;
        }
      }
      saveDocument(entries, true);
    } catch (err) {
      console.error('[EditDocument] Save error:', err);
      toast({ title: "Save failed", description: "An unexpected error occurred. Please try again.", variant: "destructive" });
    }
  };

  if (isLocked && !readOnly) {
    return null;
  }

  return (
    <>
      {!hideTrigger && (
        <Button variant="outline" size="default" onClick={() => setOpen(true)} data-testid="button-edit-document">
          <Pencil className="w-4 h-4 mr-2" />
          Edit
        </Button>
      )}

      {open && (() => {
        const hideShell = focusMode || (!!focusEntry && focusHandledRef.current === null);
        const preMountBuilder = showRoomBuilder;
        return createPortal(
        <>
        <div className="fixed inset-0 z-[9998] bg-background" style={{ display: hideShell ? 'none' : 'block' }} />
        <div
          className="fixed left-0 right-0 z-[9999] bg-background overflow-hidden flex flex-col select-none [&_input]:select-text [&_textarea]:select-text [&_[contenteditable='true']]:select-text"
          style={{
            top: vpState.height > 0 ? `${vpState.top}px` : 0,
            height: vpState.height > 0 ? `${vpState.height}px` : '100%',
            display: hideShell ? 'none' : 'flex',
            WebkitUserSelect: 'none',
            WebkitTouchCallout: 'none',
          }}
          data-testid="edit-document-page"
          data-edit-readonly={readOnly ? 'true' : undefined}
        >
            <div className="shrink-0 z-50 bg-slate-800 dark:bg-slate-900 shadow-md pt-[env(safe-area-inset-top,0px)]">
              <div className="flex items-center justify-between gap-4 px-4 py-2 lg:px-8">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="px-3 py-1.5 rounded-md border border-white/20 text-white/70 text-sm font-medium hover:bg-white/10 transition-colors"
                    onClick={() => {
                      if (!readOnly && hasUnsavedChanges) {
                        setShowUnsavedWarning(true);
                      } else {
                        setOpen(false);
                      }
                    }}
                    data-testid="button-back-edit"
                  >
                    {readOnly ? 'Close' : 'Cancel'}
                  </button>
                  <h1 className="text-lg lg:text-2xl font-bold font-display truncate text-white">
                    {readOnly ? 'View' : 'Edit'} {document.type.replace('_', ' ')}
                  </h1>
                </div>
                <div className="flex items-center gap-2">
                  {readOnly ? (
                    <span
                      className="text-[11px] uppercase tracking-wide font-semibold px-2 py-1 rounded-md bg-amber-400/20 text-amber-200 border border-amber-300/30"
                      data-testid="badge-view-only"
                    >
                      View only
                    </span>
                  ) : (
                    <>
                      {autoSaveStatus === 'saving' && (
                        <span className="text-xs text-white/60 flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" /> Saving...
                        </span>
                      )}
                      {autoSaveStatus === 'saved' && !hasUnsavedChanges && (
                        <span className="text-xs text-green-400">Saved</span>
                      )}
                      <Button
                        onClick={onSubmit}
                        disabled={isPending}
                        className="bg-primary text-primary-foreground"
                        data-testid="button-save-document"
                      >
                        {isPending ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Save className="w-4 h-4 mr-2" />
                        )}
                        Save
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {!readOnly && (
                <div className="flex items-center gap-2 px-4 pb-2 lg:px-8 flex-wrap">
                  {userTier === 'elite' && (
                    <button
                      type="button"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-white/20 text-white/80 text-xs font-medium hover:bg-white/10 transition-colors"
                      onClick={() => {
                        setEditingBlockId(null);
                        setSelectedService(null);
                        setShowServicePicker(true);
                      }}
                      data-testid="button-room-builder-edit"
                    >
                      <Calculator className="w-3.5 h-3.5" />
                      Add Estimate
                    </button>
                  )}
                  <button
                    type="button"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-white/20 text-white/80 text-xs font-medium hover:bg-white/10 transition-colors"
                    onClick={addItem}
                    data-testid="button-add-item"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Item
                  </button>
                  <button
                    type="button"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-white/20 text-white/80 text-xs font-medium hover:bg-white/10 transition-colors"
                    onClick={() => setShowLibraryPicker(true)}
                    data-testid="button-from-library"
                  >
                    <BookOpen className="w-3.5 h-3.5" /> From Library
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
              )}
            </div>

            {readOnly && (
              <div
                className="shrink-0 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900 px-4 py-2 lg:px-8 flex items-start gap-2"
                data-testid="banner-view-only"
              >
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-800 dark:text-amber-200 leading-snug">
                  <span className="font-semibold">View only.</span>{' '}
                  This {document.type.replace('_', ' ')} is locked because it was {document.status}.
                  You can open items and blocks to inspect overrides, but no changes can be saved.
                </p>
              </div>
            )}

            <div ref={scrollContentRef} className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
              <div className="max-w-3xl mx-auto px-4 py-6 lg:px-8 space-y-6">
                <div className="flex items-center gap-3">
                  <Label htmlFor="validUntil" className="text-sm text-muted-foreground whitespace-nowrap shrink-0">Valid Until</Label>
                  <Input 
                    id="validUntil" 
                    type="date" 
                    value={validUntil} 
                    onChange={(e) => { setValidUntil(e.target.value); markDirty(); }} 
                    className="max-w-[180px] h-9"
                    data-testid="input-valid-until"
                  />
                </div>

                {(document.type === 'proposal' || document.type === 'invoice') && (
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="gap-1.5 w-full min-w-0 justify-start border-2 shadow-sm px-2"
                      onClick={openPaymentModal}
                      data-testid="button-toggle-payment-settings"
                    >
                      <DollarSign className="w-4 h-4 shrink-0" />
                      <span className="truncate">Payment</span>
                      {paymentSettings?.depositRequired && (
                        <Badge variant="secondary" className="ml-auto shrink-0 text-[10px] px-1.5">
                          {paymentSettings.depositType === 'percentage' 
                            ? `${paymentSettings.depositAmount}%` 
                            : formatCurrency(paymentSettings.depositAmount)}
                        </Badge>
                      )}
                    </Button>
                    {userTier === 'elite' && (document.type === 'proposal' || document.type === 'estimate') && (
                      <Button
                        type="button"
                        variant="outline"
                        className="gap-1.5 w-full min-w-0 justify-start border-2 shadow-sm px-2"
                        onClick={() => setShowPkgModal(true)}
                        data-testid="button-package-settings"
                      >
                        <Layers className="w-4 h-4 shrink-0" />
                        <span className="truncate">Packages</span>
                        <Badge variant={proposalPackagesEnabled ? "default" : "secondary"} className="ml-auto shrink-0 text-[10px] px-1.5">
                          {proposalPackagesEnabled ? "On" : "Off"}
                        </Badge>
                      </Button>
                    )}
                  </div>
                )}

                <div className="space-y-4">
                  {proposalTemplates && proposalTemplates.length > 0 && (
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Load Template</Label>
                      <Select onValueChange={handleLoadTemplate}>
                        <SelectTrigger data-testid="select-template-edit">
                          <SelectValue placeholder="Choose a template..." />
                        </SelectTrigger>
                        <SelectContent className="z-[10000]">
                          {proposalTemplates.map((template) => (
                            <SelectItem key={template.id} value={String(template.id)} data-testid={`template-option-edit-${template.id}`}>
                              {template.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}


                  {showServicePicker && createPortal(
                    <div className="fixed inset-0 z-[10000] bg-black/60 flex items-center justify-center p-4 touch-none overscroll-none" onClick={() => setShowServicePicker(false)} onTouchMove={e => e.preventDefault()} data-testid="service-picker-overlay">
                      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()} onTouchMove={e => e.stopPropagation()} data-testid="service-picker-modal">
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
                                    entriesBeforeBuilderRef.current = entries;
                                    setShowRoomBuilder(true);
                                  }}
                                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 ${config.bg} hover:scale-[1.03] active:scale-[0.98] transition-all duration-150 cursor-pointer`}
                                  data-testid={`service-option-${t}`}
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
                          <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={() => setShowServicePicker(false)} data-testid="button-cancel-service-picker">
                            Cancel
                          </Button>
                        </div>
                      </div>
                    </div>,
                    window.document.body
                  )}

                  {preMountBuilder && createPortal(
                    <div
                      className="fixed inset-0 z-[10000] bg-background flex flex-col"
                      data-testid="fullscreen-room-builder-edit"
                      data-edit-readonly={readOnly ? 'true' : undefined}
                      style={{ display: hideShell ? 'none' : 'flex' }}
                    >
                      <div className="shrink-0 z-50 bg-slate-800 dark:bg-slate-900 text-white shadow-md" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
                        <div className="flex items-center justify-between px-3 py-2.5 lg:px-8">
                          <div className="flex items-center gap-2 min-w-0">
                            <Calculator className="w-5 h-5 text-blue-300 shrink-0" />
                            <span className="font-semibold text-sm truncate text-white">
                              {readOnly ? 'View Estimate' : (editingBlockId ? 'Edit Estimate' : 'Add Estimate')}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {!readOnly && roomBuilderAutoSaveStatus === 'saving' && (
                              <span className="text-xs text-white/50 flex items-center gap-1">
                                <Loader2 className="w-3 h-3 animate-spin" /> Saving...
                              </span>
                            )}
                            {!readOnly && roomBuilderAutoSaveStatus === 'saved' && (
                              <span className="text-xs text-emerald-400">Saved</span>
                            )}
                            <button
                              type="button"
                              onClick={() => roomBuilderRef.current?.requestClose()}
                              className="text-xs px-3 py-1.5 rounded-lg border border-white/20 text-white/70 hover:text-white hover:bg-white/10 font-medium"
                              data-testid="button-close-fullscreen-builder-edit"
                            >
                              {readOnly ? 'Close' : 'Cancel'}
                            </button>
                            {!readOnly && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (roomBuilderAutoSaveTimerRef.current) { clearTimeout(roomBuilderAutoSaveTimerRef.current); roomBuilderAutoSaveTimerRef.current = null; }
                                  isRoomBuilderAutoSaveRef.current = false;
                                  roomBuilderRef.current?.requestSave();
                                }}
                                className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90"
                                data-testid="button-save-estimate-header-edit"
                              >
                                <Save className="w-3.5 h-3.5 inline mr-1" />
                                Save
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                      {readOnly && (
                        <div
                          className="shrink-0 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800 px-4 py-2 text-xs text-amber-900 dark:text-amber-200 text-center font-medium"
                          data-testid="banner-readonly-builder"
                        >
                          View only — this {document.type.replace('_', ' ')} has been accepted. Changes cannot be saved.
                        </div>
                      )}
                      <div className="flex-1 overflow-y-auto px-1.5 py-3 lg:px-8 lg:py-6">
                        <div className="max-w-3xl mx-auto">
                          <RoomBuilder
                            builderRef={roomBuilderRef}
                            projectId={document.projectId || undefined}
                            taxRate={taxRate}
                            taxProfiles={taxProfilesList}
                            sellRateSnapshot={docSellRateSnapshot}
                            initialService={selectedService || undefined}
                            onGenerateLineItems={(newItems) => {
                              if (readOnly) {
                                setShowRoomBuilder(false);
                                return;
                              }
                              entriesBeforeBuilderRef.current = null;
                              setEntries(prev => [...prev, ...newItems.map(item => ({ type: 'item' as const, item }))]);
                              setShowRoomBuilder(false);
                              markDirty();
                              closeIfFocused();
                            }}
                            onCancel={() => {
                              if (roomBuilderAutoSaveTimerRef.current) { clearTimeout(roomBuilderAutoSaveTimerRef.current); roomBuilderAutoSaveTimerRef.current = null; }
                              if (roomBuilderSavedTimerRef.current) { clearTimeout(roomBuilderSavedTimerRef.current); roomBuilderSavedTimerRef.current = null; }
                              setRoomBuilderAutoSaveStatus('idle');
                              if (entriesBeforeBuilderRef.current) {
                                setEntries(entriesBeforeBuilderRef.current);
                                saveDocument(entriesBeforeBuilderRef.current, false);
                                entriesBeforeBuilderRef.current = null;
                              }
                              setShowRoomBuilder(false);
                              setEditingBlockId(null);
                              closeIfFocused();
                            }}
                            initialRoomData={editingBlockId ? productionRateBlocks.find(b => b.id === editingBlockId)?.roomBuilderData : undefined}
                            initialEditingRoomId={initialEditingRoomId || undefined}
                            onInitialRoomConsumed={() => setInitialEditingRoomId(null)}
                            initialBlockName={editingBlockId ? productionRateBlocks.find(b => b.id === editingBlockId)?.name : undefined}
                            initialTaxable={editingBlockId ? productionRateBlocks.find(b => b.id === editingBlockId)?.taxable : undefined}
                            initialTaxProfileId={editingBlockId ? productionRateBlocks.find(b => b.id === editingBlockId)?.taxProfileId : (productionRateBlocks.find(b => b.taxable && b.taxProfileId)?.taxProfileId)}
                            onDirty={() => {
                              if (readOnly) return;
                              if (roomBuilderAutoSaveTimerRef.current) clearTimeout(roomBuilderAutoSaveTimerRef.current);
                              setRoomBuilderAutoSaveStatus('idle');
                              roomBuilderAutoSaveTimerRef.current = setTimeout(() => {
                                if (!roomBuilderRef.current) return;
                                isRoomBuilderAutoSaveRef.current = true;
                                setRoomBuilderAutoSaveStatus('saving');
                                roomBuilderRef.current.requestAutoSave();
                              }, 3000);
                            }}
                            onSaveRoomData={(data, newItems, bName, bTaxable, taxProfileInfo) => {
                              const isAutoSave = isRoomBuilderAutoSaveRef.current;
                              isRoomBuilderAutoSaveRef.current = false;
                              if (!isAutoSave) entriesBeforeBuilderRef.current = null;
                              const blockTaxFields = { taxable: bTaxable, taxProfileId: taxProfileInfo?.taxProfileId, taxProfileName: taxProfileInfo?.taxProfileName, taxProfileRate: taxProfileInfo?.taxProfileRate };
                              const propagateTaxProfile = (prevEntries: typeof entries) => {
                                if (!taxProfileInfo) return prevEntries;
                                return prevEntries.map(e => {
                                  if (e.type !== 'block') return e;
                                  if (editingBlockId && e.block.id === editingBlockId) return e;
                                  if (!e.block.taxable) return e;
                                  return { ...e, block: { ...e.block, taxProfileId: taxProfileInfo.taxProfileId, taxProfileName: taxProfileInfo.taxProfileName, taxProfileRate: taxProfileInfo.taxProfileRate } };
                                });
                              };
                              const currentBlockId = editingBlockId || `prb-${Date.now()}`;
                              if (!editingBlockId) {
                                setEditingBlockId(currentBlockId);
                              }
                              const blockPayload = { name: bName, roomBuilderData: data, ...blockTaxFields, lineItems: newItems.map(li => ({ ...li, unitPrice: Math.round(li.unitPrice * 100), total: Math.round(li.total * 100) })) };
                              if (editingBlockId) {
                                setEntries(prev => propagateTaxProfile(prev.map(e =>
                                  e.type === 'block' && e.block.id === currentBlockId
                                    ? { ...e, block: { ...e.block, ...blockPayload } }
                                    : e
                                )));
                              } else {
                                setEntries(prev => propagateTaxProfile([...prev, { type: 'block', block: { id: currentBlockId, ...blockPayload } }]));
                              }
                              const updatedEntries = propagateTaxProfile(
                                entries.some(e => e.type === 'block' && e.block.id === currentBlockId)
                                  ? entries.map(e =>
                                      e.type === 'block' && e.block.id === currentBlockId
                                        ? { ...e, block: { ...e.block, ...blockPayload } }
                                        : e
                                    )
                                  : [...entries, { type: 'block' as const, block: { id: currentBlockId, ...blockPayload } }]
                              );
                              if (isAutoSave) {
                                cancelAutoSave();
                                saveDocument(updatedEntries, false);
                                setRoomBuilderAutoSaveStatus('saved');
                                if (roomBuilderSavedTimerRef.current) clearTimeout(roomBuilderSavedTimerRef.current);
                                roomBuilderSavedTimerRef.current = setTimeout(() => setRoomBuilderAutoSaveStatus('idle'), 3000);
                                return;
                              }
                              setShowRoomBuilder(false);
                              setEditingBlockId(null);
                              if (openedViaFocusRef.current) {
                                cancelAutoSave();
                                setAutoSaveStatus('idle');
                                saveDocument(updatedEntries, false);
                              } else {
                                markDirty();
                              }
                              toast({
                                title: editingBlockId ? `"${bName}" updated` : `"${bName}" added`,
                                description: `${data.rooms.length} area${data.rooms.length !== 1 ? 's' : ''} — $${data.grandTotal.toFixed(0)} total`,
                              });
                              closeIfFocused();
                            }}
                            onSectionEditorClose={(saved) => {
                              if (!openedViaFocusRef.current) return;
                              if (saved) {
                                isRoomBuilderAutoSaveRef.current = false;
                                setTimeout(() => {
                                  roomBuilderRef.current?.requestAutoSave();
                                }, 0);
                              } else {
                                if (roomBuilderAutoSaveTimerRef.current) { clearTimeout(roomBuilderAutoSaveTimerRef.current); roomBuilderAutoSaveTimerRef.current = null; }
                                if (roomBuilderSavedTimerRef.current) { clearTimeout(roomBuilderSavedTimerRef.current); roomBuilderSavedTimerRef.current = null; }
                                setRoomBuilderAutoSaveStatus('idle');
                                if (entriesBeforeBuilderRef.current) {
                                  setEntries(entriesBeforeBuilderRef.current);
                                  saveDocument(entriesBeforeBuilderRef.current, false);
                                  entriesBeforeBuilderRef.current = null;
                                }
                                setShowRoomBuilder(false);
                                setEditingBlockId(null);
                                closeIfFocused();
                              }
                            }}
                          />
                        </div>
                      </div>
                    </div>,
                    window.document.body
                  )}

                  {(() => {
                    const firstOptionalIdx = entries.findIndex(e => isEntryOptional(e));
                    const regularEntries = firstOptionalIdx === -1 ? entries : entries.slice(0, firstOptionalIdx);
                    const optionalEntries = firstOptionalIdx === -1 ? [] : entries.slice(firstOptionalIdx);

                    const handleZoneDragEnd = () => {
                      const from = dragFromRef.current;
                      const over = dragOverRef.current;
                      if (from !== null && over !== null && from !== over) {
                        const fromOptional = isEntryOptional(entries[from]);
                        const overOptional = isEntryOptional(entries[over]);
                        if (fromOptional !== overOptional) {
                          toast({ title: "Can't move between sections", description: "Optional items stay in the Optional section. Uncheck 'Optional' to move it to the main items.", variant: "destructive" });
                          setDragFromIndex(null);
                          setDragOverIndex(null);
                          return;
                        }
                        setEntries(prev => {
                          const next = [...prev];
                          const [moved] = next.splice(from, 1);
                          next.splice(over, 0, moved);
                          return next;
                        });
                        markDirty();
                      }
                      setDragFromIndex(null);
                      setDragOverIndex(null);
                    };

                    const handleZoneMoveUp = (eIdx: number) => {
                      const isOpt = isEntryOptional(entries[eIdx]);
                      const boundary = isOpt ? firstOptionalIdx : 0;
                      if (eIdx <= boundary) {
                        if (isOpt) toast({ title: "Can't move outside optional section", description: "Uncheck 'Optional' to move this item to the main items." });
                        return;
                      }
                      setEntries(prev => {
                        const next = [...prev];
                        [next[eIdx - 1], next[eIdx]] = [next[eIdx], next[eIdx - 1]];
                        return next;
                      });
                      markDirty();
                    };

                    const handleZoneMoveDown = (eIdx: number) => {
                      const isOpt = isEntryOptional(entries[eIdx]);
                      const lastRegularIdx = firstOptionalIdx === -1 ? entries.length - 1 : firstOptionalIdx - 1;
                      const lastIdx = entries.length - 1;
                      const boundary = isOpt ? lastIdx : lastRegularIdx;
                      if (eIdx >= boundary) {
                        if (!isOpt && firstOptionalIdx !== -1) toast({ title: "Can't move into optional section", description: "Check 'Optional' on this item to move it to the optional section." });
                        return;
                      }
                      setEntries(prev => {
                        const next = [...prev];
                        [next[eIdx], next[eIdx + 1]] = [next[eIdx + 1], next[eIdx]];
                        return next;
                      });
                      markDirty();
                    };

                    const renderEntry = (entry: DocEntry, eIdx: number, zoneFirst: boolean, zoneLast: boolean) => {
                      if (entry.type === 'block') {
                        const block = entry.block;
                        return (
                          <div key={`block-wrap-${block.id}`} className="relative">
                          <ProductionRateBlockCard
                            key={`block-${block.id}`}
                            block={block}
                            index={eIdx}
                            onClick={() => {
                              setEditingBlockId(block.id);
                              entriesBeforeBuilderRef.current = entries;
                              setShowRoomBuilder(true);
                            }}
                            onRemove={() => removeEntry(eIdx)}
                            onToggleOptional={() => {
                              setEntries(prev => sortEntriesOptionalLast(prev.map((e, i) => i === eIdx && e.type === 'block' ? { ...e, block: { ...e.block, isOptional: !e.block.isOptional } } : e)));
                              markDirty();
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
                            testIdPrefix="edit-"
                          />
                          </div>
                        );
                      }

                      const item = entry.item;
                      if (customerPreview && document.type === 'proposal') {
                        return (
                          <div key={`preview-${eIdx}`} className="border-b pb-4 last:border-0" data-testid={`preview-line-item-${eIdx}`}>
                            <LineItemRenderer
                              item={{
                                ...item,
                                unitPrice: Math.round((item.unitPrice || 0) * 100),
                                total: Math.round((item.quantity || 0) * (item.unitPrice || 0) * 100),
                              }}
                              index={eIdx}
                              mode="customer"
                              proposalDefaults={proposalDisplayDefaults}
                              pricesInCents={true}
                            />
                          </div>
                        );
                      }

                      return (
                        <div key={`item-wrap-${eIdx}`} className="relative">
                        <LineItemCard
                          key={`item-${eIdx}`}
                          item={item}
                          index={eIdx}
                          onClick={() => openItemEditor(eIdx)}
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
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400"><path d="M20 6 9 17l-5-5" /></svg>
                                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">Optional Items</span>
                              </div>
                              <div className="flex-1 h-px bg-emerald-300 dark:bg-emerald-700" />
                            </div>
                            <div className="space-y-3">
                              {optionalEntries.map((entry, i) => {
                                const globalIdx = firstOptionalIdx + i;
                                return renderEntry(entry, globalIdx, i === 0, i === optionalEntries.length - 1);
                              })}
                            </div>
                          </>
                        )}
                      </>
                    );
                  })()}

                  {discounts.length > 0 && (
                    <>
                      <div className="flex items-center gap-3 pt-4 pb-2">
                        <div className="flex-1 h-px bg-amber-300 dark:bg-amber-700" />
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800">
                          <Tag className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                          <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">Discounts</span>
                        </div>
                        <div className="flex-1 h-px bg-amber-300 dark:bg-amber-700" />
                      </div>
                      <div className="space-y-2">
                        {discounts.map((disc, dIdx) => (
                          <div
                            key={disc.id || dIdx}
                            className="border rounded-lg p-3 bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 cursor-pointer hover:border-amber-400 dark:hover:border-amber-600 transition-colors"
                            onClick={() => { setEditingDiscountIdx(dIdx); setShowDiscountBuilder(true); }}
                            data-testid={`discount-card-${dIdx}`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <Tag className="w-4 h-4 text-amber-600 shrink-0" />
                                <span className="font-medium text-sm truncate">{disc.label || `Discount ${dIdx + 1}`}</span>
                                {disc.description && <span className="text-xs text-muted-foreground truncate hidden sm:inline">— {disc.description}</span>}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <Badge variant="secondary" className="text-xs">
                                  {disc.type === 'percentage' ? `${disc.value}%` : `$${(disc.value || 0).toFixed(2)}`}
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

                  <DiscountBuilderModal
                    open={showDiscountBuilder}
                    onOpenChange={(open) => { setShowDiscountBuilder(open); if (!open) setEditingDiscountIdx(null); }}
                    discount={editingDiscountIdx !== null ? discounts[editingDiscountIdx] : null}
                    onSave={(saved) => {
                      if (editingDiscountIdx !== null) {
                        setDiscounts(prev => prev.map((d, i) => i === editingDiscountIdx ? saved : d));
                      } else {
                        setDiscounts(prev => [...prev, saved]);
                      }
                      markDirty();
                    }}
                    subtotal={subtotalBeforeDiscount}
                  />

                  {(items.length > 0 || productionRateBlocks.length > 0) && (
                    <div className="border-t pt-4 space-y-1">
                      {(displayDiscountTotal > 0 || taxAmount > 0) && (
                        <div className="flex justify-end text-sm text-muted-foreground gap-4" data-testid="text-subtotal-before-discount">
                          <span>Subtotal</span>
                          <span className="tabular-nums">{formatCurrency(subtotalBeforeDiscount)}</span>
                        </div>
                      )}
                      {displayDiscountTotal > 0 && discounts.map((d, i) => {
                        if (!d.value) return null;
                        const amt = d.type === 'percentage'
                          ? subtotalBeforeDiscount * (Math.min(d.value, 100) / 100)
                          : d.value;
                        return (
                          <div key={i} className="flex justify-end text-sm text-emerald-600 gap-4" data-testid={`text-discount-line-${i}`}>
                            <span>{d.label || 'Discount'}{d.type === 'percentage' ? ` (${d.value}%)` : ''}</span>
                            <span className="tabular-nums">-{formatCurrency(amt)}</span>
                          </div>
                        );
                      })}
                      {taxAmount > 0 && (
                        <div className="flex justify-end text-sm text-muted-foreground gap-4" data-testid="text-tax">
                          <span>{activeTaxProfileName ? `${activeTaxProfileName} (${activeTaxRate}%)` : `Tax${Object.keys(editorTaxBuckets).length === 1 ? ` (${Object.keys(editorTaxBuckets)[0]}%)` : ''}`}</span>
                          <span className="tabular-nums">{formatCurrency(taxAmount)}</span>
                        </div>
                      )}
                      <div className="flex justify-end text-lg font-bold gap-4" data-testid="text-total">
                        <span>Total</span>
                        <span className="tabular-nums">{formatCurrency(totalAmount)}</span>
                      </div>
                      {optionalTotal > 0 && (
                        <div className="flex justify-end text-sm text-emerald-700 dark:text-emerald-400 gap-4 pt-1" data-testid="text-optional-total">
                          <span>Optional items (not included)</span>
                          <span className="tabular-nums">{formatCurrency(optionalTotal)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes (optional)</Label>
                  <Textarea 
                    id="notes" 
                    value={notes} 
                    onChange={(e) => { setNotes(e.target.value); markDirty(); }} 
                    placeholder="Additional notes, terms, or conditions"
                    rows={3}
                    data-testid="input-notes"
                  />
                </div>
              </div>
            </div>
        </div>
        </>,
        window.document.body
      );
      })()}

      <LineItemEditorModal
        open={isLineItemModalOpen}
        onOpenChange={(openState) => {
          if (!openState) {
            setIsLineItemModalOpen(false);
            setEditingLineItem(null);
            setEditingLineItemIndex(null);
            closeIfFocused();
          }
        }}
        item={editingLineItem || { name: '', description: '', quantity: 1, unitPrice: 0, total: 0 }}
        projectId={document.projectId || undefined}
        onSave={(updatedItem) => {
          if (editingLineItemIndex !== null) {
            const newEntries = entries.map((e, i) =>
              i === editingLineItemIndex ? { type: 'item' as const, item: updatedItem } : e
            );
            setEntries(newEntries);
            setHasUnsavedChanges(true);
            cancelAutoSave();
            saveDocument(newEntries, false);
          } else {
            const newEntries = sortEntriesOptionalLast([...entries, { type: 'item' as const, item: updatedItem }]);
            setEntries(newEntries);
            setHasUnsavedChanges(true);
            cancelAutoSave();
            saveDocument(newEntries, false);
          }
          setIsLineItemModalOpen(false);
          setEditingLineItem(null);
          setEditingLineItemIndex(null);
          closeIfFocused();
        }}
        onAutoSave={(updatedItem) => {
          if (editingLineItemIndex !== null) {
            const newEntries = entries.map((e, i) =>
              i === editingLineItemIndex ? { type: 'item' as const, item: updatedItem } : e
            );
            setEntries(newEntries);
            cancelAutoSave();
            saveDocument(newEntries, false);
          }
        }}
        itemIndex={editingLineItemIndex ?? entries.length}
        readOnly={readOnly}
        taxRate={activeTaxRate}
        taxProfileName={activeTaxProfileName}
        taxProfiles={taxProfilesList}
        onTaxProfileChange={(profile) => {
          setEntries(prev => prev.map(e => {
            if (e.type === 'block' && e.block.taxable) {
              return { ...e, block: { ...e.block, taxProfileId: profile.id, taxProfileName: profile.name, taxProfileRate: parseFloat(profile.rate) } };
            }
            return e;
          }));
          setHasUnsavedChanges(true);
        }}
      />
      <AlertDialog open={showAmountWarning} onOpenChange={setShowAmountWarning}>
        <AlertDialogContent className="z-[10001]" overlayClassName="z-[10000]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Amount Changed on Sent Document
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>This document has already been sent to the customer. The total amount is changing significantly:</p>
              <div className="flex items-center gap-4 py-2">
                <div>
                  <p className="text-xs text-muted-foreground">Original Amount</p>
                  <p className="text-lg font-bold">${((document.totalAmount || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                </div>
                <span className="text-muted-foreground">→</span>
                <div>
                  <p className="text-xs text-muted-foreground">New Amount</p>
                  <p className="text-lg font-bold">${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                </div>
              </div>
              <p>Are you sure you want to save this change?</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-amount-warning">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowAmountWarning(false);
                saveDocument(entries, true);
              }}
              data-testid="button-confirm-amount-warning"
            >
              Save Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={showUnsavedWarning} onOpenChange={setShowUnsavedWarning}>
        <AlertDialogContent className="z-[10001]" overlayClassName="z-[10000]">
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Are you sure you want to leave? Your changes will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-unsaved">Keep Editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowUnsavedWarning(false);
                setHasUnsavedChanges(false);
                if (autoSaveTimerRef.current) { clearTimeout(autoSaveTimerRef.current); autoSaveTimerRef.current = null; }
                const snap = originalDocSnapshotRef.current;
                if (snap) {
                  console.log('[CompanyCam] EditDocumentDialog discard-changes reverting', {
                    docId: document.id,
                    note: 'CC fields not included in revert (managed via proposal photo card)',
                  });
                  updateDoc({
                    id: document.id,
                    data: {
                      title: snap.title,
                      content: snap.content,
                      totalAmount: snap.totalAmount,
                    }
                  });
                  originalDocSnapshotRef.current = null;
                }
                setOpen(false);
              }}
              data-testid="button-discard-changes"
              className="bg-destructive text-destructive-foreground"
            >
              Discard Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showPaymentModal} onOpenChange={setShowPaymentModal}>
        <DialogContent hideCloseButton className="max-w-md max-h-[85vh] overflow-y-auto z-[10001] border-2 shadow-2xl" overlayClassName="z-[10000]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Payment & Deposit Settings
            </DialogTitle>
          </DialogHeader>
          <PaymentSettingsSection
            totalAmount={Math.round(totalAmount * 100)}
            paymentSettings={paymentSettings}
            onPaymentSettingsChange={(val) => { setPaymentSettings(val); markDirty(); }}
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

      <AlertDialog open={pendingDeleteIdx !== null} onOpenChange={(open) => { if (!open) setPendingDeleteIdx(null); }}>
        <AlertDialogContent className="z-[10001]" overlayClassName="z-[10000]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-destructive" />
              Delete Line Item
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDeleteIdx !== null && entries[pendingDeleteIdx] && (
                <>Are you sure you want to delete <strong>"{entries[pendingDeleteIdx].name || 'Untitled'}"</strong>? This cannot be undone.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-item">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteEntry}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete-item"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={pendingDeleteDiscountIdx !== null} onOpenChange={(open) => { if (!open) setPendingDeleteDiscountIdx(null); }}>
        <AlertDialogContent className="z-[10001]" overlayClassName="z-[10000]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-destructive" />
              Delete Discount
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDeleteDiscountIdx !== null && discounts[pendingDeleteDiscountIdx] && (
                <>Are you sure you want to delete <strong>"{discounts[pendingDeleteDiscountIdx].label || `Discount ${pendingDeleteDiscountIdx + 1}`}"</strong>? This cannot be undone.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-discount">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDeleteDiscountIdx !== null) {
                  setDiscounts(prev => prev.filter((_, i) => i !== pendingDeleteDiscountIdx));
                  markDirty();
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

      <ServiceLibraryPicker
        open={showLibraryPicker}
        onClose={() => setShowLibraryPicker(false)}
        onPickBlock={(block) => {
          setEntries((prev) => [...prev, { type: 'block', block } as DocEntry]);
          markDirty();
          setEditingBlockId(block.id);
          entriesBeforeBuilderRef.current = entries;
          setShowRoomBuilder(true);
        }}
        onPickLineItem={(li) => {
          const item: LineItem = { name: li.name || '', description: li.description, quantity: li.quantity, unitPrice: li.unitPrice, total: li.total };
          let newIdx = 0;
          setEntries((prev) => {
            newIdx = prev.length;
            return [...prev, { type: 'item', item } as DocEntry];
          });
          markDirty();
          openItemEditor(newIdx);
        }}
      />

      {showPkgModal && (
        <ProposalPackageSettingsModal
          open={showPkgModal}
          onClose={() => setShowPkgModal(false)}
          packages={proposalPackagesData}
          materialAdjustments={proposalMaterialAdjustments}
          onPackagesChange={(pkgs) => { setProposalPackagesData(pkgs); markDirty(); }}
          onMaterialAdjustmentsChange={(v) => { setProposalMaterialAdjustments(v); markDirty(); }}
          packagesEnabled={proposalPackagesEnabled}
          onTogglePackagesEnabled={(val) => { handleTogglePackages(val); markDirty(); }}
          librarySeed={(globalPackages || []).map(p => packageToSnapshot(p))}
        />
      )}
    </>
  );
}
