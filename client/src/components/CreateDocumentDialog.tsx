import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateDocument } from "@/hooks/use-documents";
import { useProposalTemplates } from "@/hooks/use-templates";
import { useContact } from "@/hooks/use-contacts";
import { useCompanySettings } from "@/hooks/use-company-settings";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { ArrowLeft, Plus, Loader2, Save, X, ChevronDown, ChevronUp, DollarSign, Calculator, GripVertical, Tag, Percent, Trash2, Home, Building2, PaintBucket, Fence, CookingPot, Grid3X3, Wrench, Layers, BookOpen, ClipboardList, FileText } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { LineItemEditorModal, LineItemCard, ProductionRateBlockCard, type LineItem } from "./LineItemEditorModal";
import { DiscountBuilderModal } from "./DiscountBuilderModal";
import { formatCurrency, cn } from "@/lib/utils";
import { createPortal } from "react-dom";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { PaymentSettingsSection } from "./PaymentSettingsSection";
import { RoomBuilder, type RoomBuilderHandle } from "./RoomBuilder";
import { stripHtmlForValidation } from "./RichTextEditor";
import type { PaymentSettings, RoomBuilderData, ProductionRateBlock, ProposalDisplayDefaults, PackageSnapshot, ProposalPackage, DocumentDiscount } from "@shared/schema";
import { DEFAULT_PROPOSAL_DISPLAY } from "@shared/schema";
import { useQuery } from "@tanstack/react-query";
import { packageToSnapshot } from "@/lib/packagePricing";
import { ProposalPackageSettingsModal } from "./InlinePackageEditor";
import { ServiceLibraryPicker } from "./ServiceLibraryPicker";
import { LineItemRenderer } from "./LineItemRenderer";

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

interface CreateDocumentDialogProps {
  contactId: number;
  projectId?: number;
  triggerLabel?: string;
  onDocumentCreated?: (documentId: number) => void;
  autoOpen?: boolean;
  onClose?: () => void;
  defaultDocType?: string;
}

export function CreateDocumentDialog({ contactId, projectId, triggerLabel = "Create Document", onDocumentCreated, autoOpen, onClose, defaultDocType }: CreateDocumentDialogProps) {
  const [open, setOpen] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
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

  const { user } = useAuth();
  const userTier = user?.subscriptionTier || 'starter';
  const { mutate, isPending } = useCreateDocument();
  const { data: proposalTemplates } = useProposalTemplates();
  const { data: contact } = useContact(contactId);
  const { data: compSettings } = useCompanySettings();
  const { data: taxProfilesList = [] } = useQuery<any[]>({ queryKey: ['/api/tax-profiles'] });
  const { data: estimateTypes } = useQuery<string[]>({ queryKey: ['/api/surfaces/estimate-types'] });
  const taxRate = taxProfilesList.length > 0
    ? parseFloat(taxProfilesList.find((p: any) => p.isDefault)?.rate || taxProfilesList[0]?.rate || '0')
    : (compSettings?.taxRate ? parseFloat(compSettings.taxRate) : 0);
  const { toast } = useToast();
  const { data: globalPackages } = useQuery<ProposalPackage[]>({ queryKey: ['/api/proposal-packages'] });

  const [title, setTitle] = useState('');
  const [docType, setDocType] = useState(defaultDocType || 'proposal');
  const [entries, setEntries] = useState<DocEntry[]>([]);
  const [discounts, setDiscounts] = useState<DocumentDiscount[]>([]);
  const [showDiscountBuilder, setShowDiscountBuilder] = useState(false);
  const [editingDiscountIdx, setEditingDiscountIdx] = useState<number | null>(null);

  const lineItems = useMemo(() => entries.filter(e => e.type === 'item').map(e => e.item), [entries]);
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

  useEffect(() => {
    if (defaultDocType) setDocType(defaultDocType);
  }, [defaultDocType]);

  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [templateValidUntilDays, setTemplateValidUntilDays] = useState<number | null>(null);
  const [pendingStart, setPendingStart] = useState(false);

  const isTemplateDocType = (type: string) =>
    type === 'proposal' || type === 'estimate' || type === 'invoice';

  const shouldShowPickerFirst = (type: string) =>
    isTemplateDocType(type) && (proposalTemplates?.length || 0) > 0;

  useEffect(() => {
    if (autoOpen && !open && !showTemplatePicker && !pendingStart) {
      if (isTemplateDocType(docType) && !selectedTemplateId && entries.length === 0) {
        setPendingStart(true);
      } else {
        setOpen(true);
      }
    }
  }, [autoOpen]);

  useEffect(() => {
    if (pendingStart && !open && !showTemplatePicker && proposalTemplates !== undefined) {
      if ((proposalTemplates?.length || 0) > 0 && !selectedTemplateId && entries.length === 0) {
        setShowTemplatePicker(true);
      } else {
        setOpen(true);
      }
      setPendingStart(false);
    }
  }, [pendingStart, proposalTemplates]);

  const [jobAddress, setJobAddress] = useState('');
  const [jobCity, setJobCity] = useState('');
  const [jobState, setJobState] = useState('');
  const [jobZipCode, setJobZipCode] = useState('');
  const [jobAddressSameAsBilling, setJobAddressSameAsBilling] = useState(true);

  const [editingLineItem, setEditingLineItem] = useState<LineItem | null>(null);
  const [editingLineItemIndex, setEditingLineItemIndex] = useState<number | null>(null);
  const [isLineItemModalOpen, setIsLineItemModalOpen] = useState(false);

  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings | undefined>(undefined);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const paymentSettingsSnapshotRef = useRef<PaymentSettings | undefined>(undefined);
  const openPaymentModal = useCallback(() => {
    paymentSettingsSnapshotRef.current = paymentSettings;
    setShowPaymentModal(true);
  }, [paymentSettings]);
  const [showPkgModal, setShowPkgModal] = useState(false);
  const [showLibraryPicker, setShowLibraryPicker] = useState(false);
  const [defaultsApplied, setDefaultsApplied] = useState(false);
  const [proposalPackagesEnabled, setProposalPackagesEnabled] = useState(false);
  const [proposalPackagesData, setProposalPackagesData] = useState<PackageSnapshot[]>([]);
  const [proposalMaterialAdjustments, setProposalMaterialAdjustments] = useState(false);

  const handleTogglePackages = useCallback((enabled: boolean) => {
    setProposalPackagesEnabled(enabled);
    if (enabled && proposalPackagesData.length === 0 && globalPackages && globalPackages.length > 0) {
      setProposalPackagesData(globalPackages.map(p => packageToSnapshot(p)));
      setProposalMaterialAdjustments(!!compSettings?.packageMaterialAdjustments);
    }
  }, [globalPackages, proposalPackagesData.length, compSettings?.packageMaterialAdjustments]);

  

  useEffect(() => {
    if (open && !defaultsApplied && compSettings?.defaultPaymentSettings && !paymentSettings) {
      const dps = compSettings.defaultPaymentSettings as PaymentSettings;
      setPaymentSettings(dps);
      setDefaultsApplied(true);
    }
  }, [open, compSettings, defaultsApplied, paymentSettings]);

  const [showRoomBuilder, setShowRoomBuilder] = useState(false);
  const [showServicePicker, setShowServicePicker] = useState(false);
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [sellRateSnapshot, setSellRateSnapshot] = useState<number | null>(null);
  const roomBuilderRef = useRef<RoomBuilderHandle | null>(null);

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

  const [proposalDisplayDefaults, setProposalDisplayDefaults] = useState<ProposalDisplayDefaults>({ ...DEFAULT_PROPOSAL_DISPLAY });
  const [customerPreview, setCustomerPreview] = useState(false);
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);
  const [dragFromIndex, _setDragFromIndex] = useState<number | null>(null);
  const [dragOverIndex, _setDragOverIndex] = useState<number | null>(null);
  const dragFromRef = useRef<number | null>(null);
  const dragOverRef = useRef<number | null>(null);
  const setDragFromIndex = useCallback((v: number | null) => { dragFromRef.current = v; _setDragFromIndex(v); }, []);
  const setDragOverIndex = useCallback((v: number | null) => { dragOverRef.current = v; _setDragOverIndex(v); }, []);

  const calculateSubtotalBeforeDiscount = (): number => {
    const itemsTotal = lineItems.filter(i => !i.isOptional && !i.descriptionOnly).reduce((sum, item) => sum + ((item.quantity || 0) * (item.unitPrice || 0)), 0);
    const blocksTotal = productionRateBlocks.filter(b => !b.isOptional).reduce((sum, block) => sum + (block.roomBuilderData.grandTotal || 0), 0);
    return itemsTotal + blocksTotal;
  };
  const calculateDiscountTotal = (): number => {
    const sub = calculateSubtotalBeforeDiscount();
    let total = 0;
    for (const d of discounts) {
      if (d.value > 0) {
        total += d.type === 'percentage' ? sub * (Math.min(d.value, 100) / 100) : d.value;
      }
    }
    return Math.min(total, Math.max(0, sub));
  };
  const calculateSubtotal = (): number => calculateSubtotalBeforeDiscount() - calculateDiscountTotal();
  const calculateTaxAmount = (): number => {
    const createTaxBuckets: Record<number, number> = {};
    const addCreateBucket = (rate: number, amount: number) => {
      if (rate <= 0 || amount === 0) return;
      createTaxBuckets[rate] = (createTaxBuckets[rate] || 0) + amount;
    };
    for (const item of lineItems.filter(i => i.taxable && !i.isOptional && !i.descriptionOnly)) {
      addCreateBucket(taxRate, (item.quantity || 0) * (item.unitPrice || 0));
    }
    for (const block of productionRateBlocks.filter(b => b.taxable && !b.isOptional)) {
      const bRate = block.taxProfileRate != null ? parseFloat(String(block.taxProfileRate)) : taxRate;
      addCreateBucket(bRate, block.roomBuilderData.grandTotal || 0);
    }
    const sub = calculateSubtotalBeforeDiscount();
    const discTotal = calculateDiscountTotal();
    const discRatio = sub > 0 && discTotal > 0 ? (sub - discTotal) / sub : 1;
    let total = 0;
    for (const [rateKey, amount] of Object.entries(createTaxBuckets)) {
      const rate = parseFloat(rateKey);
      if (rate <= 0 || amount <= 0) continue;
      total += (amount * discRatio) * (rate / 100);
    }
    return total;
  };
  const calculateTotal = (): number => calculateSubtotal() + calculateTaxAmount();

  const handleAddLineItem = () => {
    setEditingLineItem({
      name: '',
      description: '',
      quantity: 1,
      unitPrice: 0,
      total: 0,
    });
    setEditingLineItemIndex(null);
    setIsLineItemModalOpen(true);
  };

  const handleEditLineItem = (entriesIdx: number) => {
    const entry = entries[entriesIdx];
    if (entry?.type === 'item') {
      setEditingLineItem({ ...entry.item });
      setEditingLineItemIndex(entriesIdx);
      setIsLineItemModalOpen(true);
    }
  };

  const handleSaveLineItem = (item: LineItem) => {
    if (editingLineItemIndex !== null) {
      setEntries(prev => sortEntriesOptionalLast(prev.map((e, i) =>
        i === editingLineItemIndex ? { type: 'item' as const, item } : e
      )));
    } else {
      setEntries(prev => sortEntriesOptionalLast([...prev, { type: 'item' as const, item }]));
    }
    setIsLineItemModalOpen(false);
    setEditingLineItem(null);
    setEditingLineItemIndex(null);
  };

  const handleDeleteEntry = (entriesIdx: number) => {
    setEntries(prev => prev.filter((_, i) => i !== entriesIdx));
  };

  const handleApplyTemplate = (templateId: string) => {
    if (templateId === 'scratch') {
      setSelectedTemplateId(null);
      return;
    }
    setSelectedTemplateId(templateId);
    const template = proposalTemplates?.find(t => t.id === Number(templateId));
    if (template) {
      setTitle(template.name);
      const templateItems = (template.lineItems || [])
        .filter(item => item != null)
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
      if (blocks && Array.isArray(blocks) && blocks.length > 0) {
        blocks.forEach((b: ProductionRateBlock) => newEntries.push({ type: 'block', block: b }));
      }
      templateItems.forEach(item => newEntries.push({ type: 'item', item }));
      setEntries(newEntries);
      const tmplPayment = (template as any).paymentSettings;
      if (tmplPayment) {
        setPaymentSettings(tmplPayment);
      } else {
        setPaymentSettings(undefined);
      }
      const tmplValidDays = (template as any).validUntilDays;
      setTemplateValidUntilDays(tmplValidDays && tmplValidDays > 0 ? tmplValidDays : null);
      const tmplDiscounts = ((template as any).discounts as DocumentDiscount[]) || [];
      setDiscounts(tmplDiscounts);
      const tmplPkgEnabled = !!(template as any).proposalPackagesEnabled;
      const tmplPkgData = ((template as any).proposalPackagesData as PackageSnapshot[]) || [];
      setProposalPackagesEnabled(tmplPkgEnabled);
      setProposalPackagesData(tmplPkgData);
    }
  };


  const handleSave = () => {
    const autoTitle = title.trim() || contact?.name || docType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
    if (lineItems.length === 0 && productionRateBlocks.length === 0) {
      toast({ title: "Please add at least one item or estimate", variant: "destructive" });
      return;
    }
    const hasEmptyDescription = lineItems.some(item => stripHtmlForValidation(item.description).length === 0);
    if (lineItems.length > 0 && hasEmptyDescription) {
      toast({ title: "Error", description: "All line items need a description", variant: "destructive" });
      return;
    }

    const finalItems = lineItems.map(item => ({
      ...item,
      unitPrice: Math.round(item.unitPrice * 100),
      total: Math.round((item.quantity || 0) * (item.unitPrice || 0) * 100),
    }));

    const jobData = jobAddressSameAsBilling
      ? {
          jobAddress: contact?.address || '',
          jobCity: contact?.city || '',
          jobState: contact?.state || '',
          jobZipCode: contact?.zipCode || '',
          jobAddressSameAsBilling: true,
        }
      : {
          jobAddress,
          jobCity,
          jobState,
          jobZipCode,
          jobAddressSameAsBilling: false,
        };

    const validDays = templateValidUntilDays && templateValidUntilDays > 0 ? templateValidUntilDays : 30;
    const defaultValidUntil = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const itemOrder = entries.map(e => e.type === 'block' ? 'block' : 'item');
    const contentData: any = { items: finalItems, validUntil: defaultValidUntil, itemOrder };
    if (docType === 'proposal') {
      contentData.proposalDisplayDefaults = proposalDisplayDefaults;
    }
    if (paymentSettings) {
      contentData.paymentSettings = paymentSettings;
    }
    if (productionRateBlocks.length > 0) {
      contentData.productionRateBlocks = productionRateBlocks;
    }
    const snapshotForSave = sellRateSnapshot ?? productionRateBlocks.find(b => b.roomBuilderData?.sellRate)?.roomBuilderData?.sellRate ?? null;
    if (snapshotForSave != null && snapshotForSave > 0) {
      contentData.sellRateSnapshot = snapshotForSave;
    }

    contentData.proposalPackagesEnabled = proposalPackagesEnabled;
    contentData.proposalPackagesData = proposalPackagesData.length > 0 ? proposalPackagesData : [];
    contentData.proposalMaterialAdjustments = proposalMaterialAdjustments;
    const validDiscounts = discounts.filter(d => d.value > 0);
    if (validDiscounts.length > 0) {
      contentData.discounts = validDiscounts;
    }

    mutate({
      contactId,
      ...(projectId ? { projectId } : {}),
      type: docType,
      status: 'draft',
      title: autoTitle,
      content: contentData,
      totalAmount: Math.round(calculateTotal() * 100),
      ...(productionRateBlocks.length > 0 ? { lineItemSource: 'production_rates' } : {}),
      ...jobData,
    }, {
      onSuccess: (createdDoc) => {
        if (onDocumentCreated) {
          onDocumentCreated(createdDoc.id);
        }
        setOpen(false);
        resetForm();
        onClose?.();
      },
      onError: () => {
        toast({ title: "Failed to create document", variant: "destructive" });
      },
    });
  };

  const resetForm = () => {
    setTitle('');
    setDocType(defaultDocType || 'proposal');
    setEntries([]);
    setJobAddress('');
    setJobCity('');
    setJobState('');
    setJobZipCode('');
    setJobAddressSameAsBilling(true);
    setPaymentSettings(undefined);
    setShowPaymentModal(false);
    setShowPkgModal(false);
    setDefaultsApplied(false);
    setSelectedTemplateId(null);
    setShowRoomBuilder(false);
    setEditingBlockId(null);
    setProposalDisplayDefaults({ ...DEFAULT_PROPOSAL_DISPLAY });
    setCustomerPreview(false);
    setProposalPackagesData([]);
    setProposalMaterialAdjustments(false);
    setDiscounts([]);
    setShowDiscountBuilder(false);
    setEditingDiscountIdx(null);
  };

  const closeDialog = () => {
    setOpen(false);
    resetForm();
    onClose?.();
  };

  const handleBack = () => {
    const hasChanges = title.trim() !== '' || entries.length > 0 || discounts.length > 0;
    if (hasChanges) {
      setShowUnsavedWarning(true);
    } else {
      closeDialog();
    }
  };

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [open]);

  const templatePickerNode = showTemplatePicker && proposalTemplates && proposalTemplates.length > 0 ? createPortal(
    <div
      className="fixed inset-0 z-[2147483646] bg-black/70 flex items-center justify-center p-4"
      data-testid="template-picker-overlay"
      onClick={() => { setShowTemplatePicker(false); setPendingStart(false); if (!open && onClose) onClose(); }}
    >
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 pt-5 pb-4 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent border-b">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center text-primary">
              <ClipboardList className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold">Start your proposal</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Pick a template to prefill the builder.</p>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          <button
            type="button"
            onClick={() => { setSelectedTemplateId(null); setShowTemplatePicker(false); setPendingStart(false); setOpen(true); }}
            className="w-full text-left p-4 rounded-xl border-2 border-dashed border-border bg-muted/30 hover:bg-muted/60 hover:border-primary/40 transition-all flex items-center gap-3 active:scale-[0.99]"
            data-testid="button-start-blank"
          >
            <div className="w-10 h-10 rounded-lg bg-background border flex items-center justify-center text-muted-foreground shrink-0">
              <Plus className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Start blank</p>
              <p className="text-xs text-muted-foreground mt-0.5">Build from scratch</p>
            </div>
          </button>
          {proposalTemplates.map((t, idx) => {
            const palette = [
              { ring: 'border-blue-200 dark:border-blue-900', bg: 'bg-blue-50/60 dark:bg-blue-950/30', icon: 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300' },
              { ring: 'border-emerald-200 dark:border-emerald-900', bg: 'bg-emerald-50/60 dark:bg-emerald-950/30', icon: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-300' },
              { ring: 'border-amber-200 dark:border-amber-900', bg: 'bg-amber-50/60 dark:bg-amber-950/30', icon: 'bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-300' },
              { ring: 'border-purple-200 dark:border-purple-900', bg: 'bg-purple-50/60 dark:bg-purple-950/30', icon: 'bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-300' },
              { ring: 'border-rose-200 dark:border-rose-900', bg: 'bg-rose-50/60 dark:bg-rose-950/30', icon: 'bg-rose-100 dark:bg-rose-900/50 text-rose-600 dark:text-rose-300' },
              { ring: 'border-teal-200 dark:border-teal-900', bg: 'bg-teal-50/60 dark:bg-teal-950/30', icon: 'bg-teal-100 dark:bg-teal-900/50 text-teal-600 dark:text-teal-300' },
            ];
            const c = palette[idx % palette.length];
            const itemCount = (t.lineItems || []).length;
            const blockCount = ((t as any).productionRateBlocks || []).length;
            const total = itemCount + blockCount;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => { handleApplyTemplate(String(t.id)); setShowTemplatePicker(false); setPendingStart(false); setOpen(true); }}
                className={`w-full text-left p-4 rounded-xl border-2 ${c.ring} ${c.bg} hover:shadow-md hover:-translate-y-0.5 transition-all flex items-center gap-3 active:scale-[0.99]`}
                data-testid={`template-pick-${t.id}`}
              >
                <div className={`w-10 h-10 rounded-lg ${c.icon} flex items-center justify-center shrink-0 shadow-sm`}>
                  <FileText className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{t.name}</p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    {blockCount > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Layers className="w-3 h-3" /> {blockCount} block{blockCount !== 1 ? 's' : ''}
                      </span>
                    )}
                    {itemCount > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <FileText className="w-3 h-3" /> {itemCount} item{itemCount !== 1 ? 's' : ''}
                      </span>
                    )}
                    {total === 0 && <span>Empty template</span>}
                  </div>
                </div>
                <ChevronDown className="w-4 h-4 text-muted-foreground -rotate-90 shrink-0" />
              </button>
            );
          })}
        </div>
        <div className="px-4 py-3 border-t flex items-center justify-end">
          <Button variant="ghost" size="sm" onClick={() => { setShowTemplatePicker(false); setPendingStart(false); if (!open && onClose) onClose(); }} data-testid="button-cancel-template-picker">
            Cancel
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  ) : null;

  if (!open) {
    if (autoOpen) return <>{templatePickerNode}</>;
    return (
      <>
        {templatePickerNode}
        <Button
          variant="outline"
          size="sm"
          className="text-xs sm:text-sm min-h-8 w-full md:w-auto justify-center"
          onClick={() => {
            if (shouldShowPickerFirst(docType) && !selectedTemplateId && entries.length === 0) {
              setShowTemplatePicker(true);
            } else {
              setOpen(true);
            }
          }}
          data-testid="button-create-document-trigger"
        >
          <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-2 shrink-0" />
          <span className="hidden sm:inline">{triggerLabel}</span>
          <span className="sm:hidden">Create</span>
        </Button>
      </>
    );
  }

  return (
    <>
      {createPortal(
        <>
        <div className="fixed inset-0 z-[9998] bg-background" />
        <div
          className="fixed left-0 right-0 z-[9999] bg-background overflow-hidden flex flex-col"
          style={{
            top: vpState.height > 0 ? `${vpState.top}px` : 0,
            height: vpState.height > 0 ? `${vpState.height}px` : '100%',
          }}
          data-testid="create-document-page"
          onTouchMove={(e) => e.stopPropagation()}
        >
            <div className="shrink-0 z-50 bg-slate-800 dark:bg-slate-900 shadow-md pt-[env(safe-area-inset-top,0px)]">
              <div className="flex items-center justify-between gap-4 px-4 py-3 lg:px-8">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="px-3 py-1.5 rounded-md border border-white/20 text-white/70 text-sm font-medium hover:bg-white/10 transition-colors"
                    onClick={handleBack}
                    data-testid="button-back"
                  >
                    Cancel
                  </button>
                  <h1 className="text-lg lg:text-2xl font-bold font-display truncate text-white">
                    Create Document
                  </h1>
                </div>
                <Button
                  onClick={handleSave}
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
              </div>
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
                    data-testid="button-room-builder"
                  >
                    <Calculator className="w-3.5 h-3.5" />
                    Add Estimate
                  </button>
                )}
                <button
                  type="button"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-white/20 text-white/80 text-xs font-medium hover:bg-white/10 transition-colors"
                  onClick={handleAddLineItem}
                  data-testid="button-add-line-item"
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
                  onClick={() => { setEditingDiscountIdx(null); setShowDiscountBuilder(true); }}
                  data-testid="button-add-discount"
                >
                  <Tag className="w-3.5 h-3.5" /> Discount
                </button>
              </div>
            </div>

            <div ref={scrollContentRef} className="flex-1 overflow-auto overscroll-contain p-4 lg:p-8">
              <Card>
                <CardContent className="pt-6 space-y-4">
                  {proposalTemplates && proposalTemplates.length > 0 && selectedTemplateId && (
                    <div className="flex items-center gap-2 pb-3 border-b text-sm">
                      <span className="text-muted-foreground">Template:</span>
                      <span className="font-medium" data-testid="text-current-template">
                        {proposalTemplates.find(t => String(t.id) === selectedTemplateId)?.name || 'Custom'}
                      </span>
                    </div>
                  )}

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">Job Address</Label>
                      <label className="flex items-center gap-2 cursor-pointer" data-testid="checkbox-same-as-billing">
                        <input
                          type="checkbox"
                          checked={jobAddressSameAsBilling}
                          onChange={(e) => setJobAddressSameAsBilling(e.target.checked)}
                          className="h-4 w-4 rounded border-input"
                        />
                        <span className="text-sm text-muted-foreground">Same as billing</span>
                      </label>
                    </div>
                    {jobAddressSameAsBilling && contact && (
                      <p className="text-sm text-muted-foreground">
                        {contact.address ? `${contact.address}, ${contact.city || ''} ${contact.state || ''} ${contact.zipCode || ''}`.trim() : 'No billing address on file'}
                      </p>
                    )}
                    {!jobAddressSameAsBilling && (
                      <div className="space-y-3">
                        <Input
                          value={jobAddress}
                          onChange={(e) => setJobAddress(e.target.value)}
                          placeholder="Street address"
                          data-testid="input-job-address"
                        />
                        <div className="grid grid-cols-3 gap-3">
                          <Input
                            value={jobCity}
                            onChange={(e) => setJobCity(e.target.value)}
                            placeholder="City"
                            data-testid="input-job-city"
                          />
                          <Input
                            value={jobState}
                            onChange={(e) => setJobState(e.target.value)}
                            placeholder="State"
                            data-testid="input-job-state"
                          />
                          <Input
                            value={jobZipCode}
                            onChange={(e) => setJobZipCode(e.target.value)}
                            placeholder="ZIP"
                            data-testid="input-job-zip"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Payment & Packages buttons */}
                  {(docType === 'proposal' || docType === 'invoice') && (
                    <div className="pt-2 border-t grid grid-cols-2 gap-2">
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
                      {docType === 'proposal' && userTier === 'elite' && !!compSettings?.packagesEnabled && (
                        <Button
                          type="button"
                          variant="outline"
                          className="gap-1.5 w-full min-w-0 justify-start border-2 shadow-sm px-2"
                          onClick={() => setShowPkgModal(true)}
                          data-testid="button-package-settings"
                        >
                          <Layers className="w-4 h-4 shrink-0" />
                          <span className="truncate">Packages</span>
                          <Badge variant={proposalPackagesEnabled ? 'default' : 'secondary'} className="ml-auto shrink-0 text-[10px] px-1.5">
                            {proposalPackagesEnabled ? 'On' : 'Off'}
                          </Badge>
                        </Button>
                      )}
                    </div>
                  )}


                  <div className="pt-2 border-t space-y-3">
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

                    {showRoomBuilder && createPortal(
                      <div
                        className="fixed inset-0 z-[10000] bg-background flex flex-col"
                        data-testid="fullscreen-room-builder"
                      >
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
                                data-testid="button-close-fullscreen-builder"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => roomBuilderRef.current?.requestSave()}
                                className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90"
                                data-testid="button-save-estimate-header"
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
                              projectId={projectId}
                              taxRate={taxRate}
                              taxProfiles={taxProfilesList}
                              sellRateSnapshot={sellRateSnapshot}
                              initialService={selectedService || undefined}
                              onGenerateLineItems={(newItems) => {
                                setEntries(prev => [...prev, ...newItems.map(item => ({ type: 'item' as const, item }))]);
                                setShowRoomBuilder(false);
                              }}
                              onCancel={() => { setShowRoomBuilder(false); setEditingBlockId(null); }}
                              initialRoomData={editingBlockId ? productionRateBlocks.find(b => b.id === editingBlockId)?.roomBuilderData : undefined}
                              initialBlockName={editingBlockId ? productionRateBlocks.find(b => b.id === editingBlockId)?.name : undefined}
                              initialTaxable={editingBlockId ? productionRateBlocks.find(b => b.id === editingBlockId)?.taxable : undefined}
                              initialTaxProfileId={editingBlockId ? productionRateBlocks.find(b => b.id === editingBlockId)?.taxProfileId : (productionRateBlocks.find(b => b.taxable && b.taxProfileId)?.taxProfileId)}
                              onSaveRoomData={(data, newItems, bName, bTaxable, taxProfileInfo) => {
                                if (sellRateSnapshot == null && data.sellRate && data.sellRate > 0) {
                                  setSellRateSnapshot(data.sellRate);
                                }
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
                                if (editingBlockId) {
                                  setEntries(prev => propagateTaxProfile(prev.map(e =>
                                    e.type === 'block' && e.block.id === editingBlockId
                                      ? { ...e, block: { ...e.block, name: bName, roomBuilderData: data, ...blockTaxFields, lineItems: newItems.map(li => ({ ...li, unitPrice: Math.round(li.unitPrice * 100), total: Math.round(li.total * 100) })) } }
                                      : e
                                  )));
                                } else {
                                  const newBlock: ProductionRateBlock = {
                                    id: `prb-${Date.now()}`,
                                    name: bName,
                                    roomBuilderData: data,
                                    ...blockTaxFields,
                                    lineItems: newItems.map(li => ({ ...li, unitPrice: Math.round(li.unitPrice * 100), total: Math.round(li.total * 100) })),
                                  };
                                  setEntries(prev => propagateTaxProfile([...prev, { type: 'block', block: newBlock }]));
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

                    {entries.length === 0 && !showRoomBuilder ? (
                      <div className="text-center py-6 text-muted-foreground">
                        <p>No items yet</p>
                        <p className="text-sm mt-1">
                          {userTier === 'elite' ? 'Use "Add Estimate" to build from production rates or "Add Item" manually' : 'Use "Add Item" to add line items manually'}
                        </p>
                      </div>
                    ) : entries.length === 0 && showRoomBuilder ? null : (() => {
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
                                setShowRoomBuilder(true);
                              }}
                              onRemove={() => handleDeleteEntry(eIdx)}
                              onToggleOptional={() => {
                                setEntries(prev => sortEntriesOptionalLast(prev.map((e, i) => i === eIdx && e.type === 'block' ? { ...e, block: { ...e.block, isOptional: !e.block.isOptional } } : e)));
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
                            />
                            </div>
                          );
                        }

                        const item = entry.item;
                        if (customerPreview && docType === 'proposal') {
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
                                      setDiscounts(prev => prev.filter((_, i) => i !== dIdx));
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
                      }}
                      subtotal={calculateSubtotalBeforeDiscount()}
                    />

                    {entries.length > 0 && (
                      <div className="pt-3 border-t space-y-1">
                        {(calculateDiscountTotal() > 0 || calculateTaxAmount() > 0) && (
                          <div className="flex items-center justify-between text-sm text-muted-foreground" data-testid="text-subtotal-before-discount">
                            <span>Subtotal</span>
                            <span className="tabular-nums">{formatCurrency(calculateSubtotalBeforeDiscount())}</span>
                          </div>
                        )}
                        {calculateDiscountTotal() > 0 && discounts.map((d, i) => {
                          if (!d.value) return null;
                          const sub = calculateSubtotalBeforeDiscount();
                          const amt = d.type === 'percentage' ? sub * (Math.min(d.value, 100) / 100) : d.value;
                          return (
                            <div key={i} className="flex items-center justify-between text-sm text-emerald-600" data-testid={`text-discount-line-${i}`}>
                              <span>{d.label || 'Discount'}{d.type === 'percentage' ? ` (${d.value}%)` : ''}</span>
                              <span className="tabular-nums">-{formatCurrency(amt)}</span>
                            </div>
                          );
                        })}
                        {calculateTaxAmount() > 0 && (
                          <div className="flex items-center justify-between text-sm text-muted-foreground" data-testid="text-tax">
                            <span>{activeTaxProfileName ? `${activeTaxProfileName} (${activeTaxRate}%)` : `Tax (${activeTaxRate}%)`}</span>
                            <span className="tabular-nums">{formatCurrency(calculateTaxAmount())}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between text-lg font-semibold" data-testid="text-total">
                          <span>Total</span>
                          <span className="tabular-nums">{formatCurrency(calculateTotal())}</span>
                        </div>
                        {(lineItems.some(i => i.isOptional) || productionRateBlocks.some(b => b.isOptional)) && (
                          <div className="flex items-center justify-between text-sm text-emerald-700 dark:text-emerald-400 pt-1" data-testid="text-optional-total">
                            <span>Optional items (not included)</span>
                            <span className="tabular-nums">{formatCurrency(
                              lineItems.filter(i => i.isOptional).reduce((sum, item) => sum + ((item.quantity || 0) * (item.unitPrice || 0)), 0)
                              + productionRateBlocks.filter(b => b.isOptional).reduce((sum, block) => sum + (block.roomBuilderData.grandTotal || 0), 0)
                            )}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                </CardContent>
              </Card>
            </div>
        </div>
        </>,
        document.body
      )}

      {/* Payment Settings Modal — matches EditDocumentDialog exactly */}
      <Dialog open={showPaymentModal} onOpenChange={setShowPaymentModal}>
        <DialogContent hideCloseButton className="max-w-md max-h-[85vh] overflow-y-auto z-[10001] border-2 shadow-2xl" overlayClassName="z-[10000]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Payment & Deposit Settings
            </DialogTitle>
          </DialogHeader>
          <PaymentSettingsSection
            totalAmount={Math.round(calculateTotal() * 100)}
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

      {templatePickerNode}

      <ServiceLibraryPicker
        open={showLibraryPicker}
        onClose={() => setShowLibraryPicker(false)}
        onPickBlock={(block) => {
          setEntries((prev) => [...prev, { type: 'block', block } as DocEntry]);
          setEditingBlockId(block.id);
          setShowRoomBuilder(true);
        }}
        onPickLineItem={(li) => {
          const item: LineItem = { name: li.name || '', description: li.description, quantity: li.quantity, unitPrice: li.unitPrice, total: li.total };
          let newIdx = 0;
          setEntries((prev) => {
            newIdx = prev.length;
            return [...prev, { type: 'item', item } as DocEntry];
          });
          setEditingLineItem(item);
          setEditingLineItemIndex(newIdx);
          setIsLineItemModalOpen(true);
        }}
      />

      {/* Packages Modal — matches EditDocumentDialog exactly */}
      {showPkgModal && (
        <ProposalPackageSettingsModal
          open={showPkgModal}
          onClose={() => setShowPkgModal(false)}
          packages={proposalPackagesData}
          materialAdjustments={proposalMaterialAdjustments}
          onPackagesChange={setProposalPackagesData}
          onMaterialAdjustmentsChange={setProposalMaterialAdjustments}
          packagesEnabled={proposalPackagesEnabled}
          onTogglePackagesEnabled={handleTogglePackages}
          librarySeed={(globalPackages || []).map(p => packageToSnapshot(p))}
        />
      )}

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
        itemIndex={editingLineItemIndex ?? entries.length}
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
        }}
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
              onClick={() => {
                setShowUnsavedWarning(false);
                closeDialog();
              }}
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
