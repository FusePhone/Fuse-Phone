import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor, stripHtmlForValidation } from "./RichTextEditor";
import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Save, Trash2, Sparkles, Send, Loader2, X, GripVertical, ChevronUp, ChevronDown, Calculator } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

export interface LineItem {
  name?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  taxable?: boolean;
  isOptional?: boolean;
  descriptionOnly?: boolean;
  hidePrice?: boolean;
  isOverallPrep?: boolean;
  scopeNoteHtml?: string;
  surfaces?: import("@shared/schema").ItemSurface[];
  pricingDetails?: import("@shared/schema").ItemPricingDetails;
  paintAssignment?: import("@shared/schema").ItemPaintAssignment;
  displayOverrides?: import("@shared/schema").ItemDisplayOverrides;
  debug?: import("@shared/schema").ItemDebug;
}

interface LineItemEditorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: LineItem;
  onSave: (item: LineItem) => void;
  onAutoSave?: (item: LineItem) => void;
  itemIndex: number;
  onSaveAll?: (item: LineItem) => void;
  taxRate?: number;
  taxProfileName?: string | null;
  taxProfiles?: any[];
  onTaxProfileChange?: (profile: { id: number; name: string; rate: string }) => void;
  projectId?: number;
  readOnly?: boolean;
}

export function LineItemEditorModal({ 
  open, 
  onOpenChange, 
  item, 
  onSave, 
  onAutoSave,
  itemIndex,
  onSaveAll,
  taxRate,
  taxProfileName,
  taxProfiles,
  onTaxProfileChange,
  projectId,
  readOnly = false,
}: LineItemEditorModalProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const userTier = user?.subscriptionTier || 'starter';
  const [name, setName] = useState(item.name || '');
  const [description, setDescription] = useState(item.description || '');
  const [quantity, setQuantity] = useState(item.quantity?.toString() || '1');
  const [unitPrice, setUnitPrice] = useState(item.unitPrice?.toString() || '');
  const [taxable, setTaxable] = useState(item.taxable ?? false);
  const [isOptional, setIsOptional] = useState(item.isOptional ?? false);
  const [descriptionOnly, setDescriptionOnly] = useState(item.descriptionOnly ?? false);
  const [hidePrice, setHidePrice] = useState(item.hidePrice ?? false);
  const [showDescriptionEditor, setShowDescriptionEditor] = useState(false);
  const [aiExpanded, setAiExpanded] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiInputFocused, setAiInputFocused] = useState(false);
  const [validationErrors, setValidationErrors] = useState<{name?: boolean; unitPrice?: boolean; description?: boolean}>({});
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const originalItemRef = useRef<LineItem | null>(null);
  const hasAutoSavedRef = useRef(false);
  const aiInputRef = useRef<HTMLTextAreaElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const intentionalCloseRef = useRef(false);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);

  useEffect(() => {
    if (!open) { setViewportHeight(null); return; }
    const vv = window.visualViewport;
    const update = () => {
      const winH = window.innerHeight;
      const vvH = vv ? vv.height : winH;
      // Use the smaller of the two so we always shrink when keyboard is open,
      // whether iOS resizes the WKWebView (native) or just the visual viewport (web).
      const visibleH = Math.min(winH, vvH);
      // Always set so iOS native (where vv events may not fire after WKWebView resize) still shrinks.
      setViewportHeight(visibleH);
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

  const checkHasChanges = useCallback(() => {
    return name !== (item.name || '') || 
      description !== (item.description || '') || 
      quantity !== (item.quantity?.toString() || '1') || 
      unitPrice !== (item.unitPrice?.toString() || '') ||
      taxable !== (item.taxable ?? false) ||
      isOptional !== (item.isOptional ?? false) ||
      descriptionOnly !== (item.descriptionOnly ?? false) ||
      hidePrice !== (item.hidePrice ?? false);
  }, [name, description, quantity, unitPrice, taxable, isOptional, descriptionOnly, hidePrice, item]);

  const closeDialog = useCallback(() => {
    intentionalCloseRef.current = true;
    if (dialogRef.current?.open) {
      try { dialogRef.current.close(); } catch (_) {}
    }
    onOpenChange(false);
  }, [onOpenChange]);

  useEffect(() => {
    if (open) {
      intentionalCloseRef.current = false;
      originalItemRef.current = {
        name: item.name || '',
        description: item.description || '',
        quantity: item.quantity ?? 1,
        unitPrice: item.unitPrice ?? 0,
        total: (item.quantity ?? 1) * (item.unitPrice ?? 0),
        taxable: item.taxable ?? false,
        isOptional: item.isOptional ?? false,
        descriptionOnly: item.descriptionOnly ?? false,
      };
      hasAutoSavedRef.current = false;
      setName(item.name || '');
      setDescription(item.description || '');
      setQuantity(item.quantity?.toString() || '1');
      setUnitPrice(item.unitPrice?.toString() || '');
      setTaxable(item.taxable ?? false);
      setIsOptional(item.isOptional ?? false);
      setDescriptionOnly(item.descriptionOnly ?? false);
      setHidePrice(item.hidePrice ?? false);
      setShowDescriptionEditor(false);
      setAiExpanded(false);
      setAiPrompt('');
      setAiLoading(false);
      setValidationErrors({});
      setShowUnsavedWarning(false);
      
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      
      if (dialogRef.current && !dialogRef.current.open) {
        dialogRef.current.showModal();
      }
      
      return () => {
        document.body.style.overflow = prevOverflow;
        intentionalCloseRef.current = true;
        if (dialogRef.current?.open) {
          try { dialogRef.current.close(); } catch (_) {}
        }
      };
    } else {
      intentionalCloseRef.current = true;
      if (dialogRef.current?.open) {
        try { dialogRef.current.close(); } catch (_) {}
      }
    }
  }, [open, item]);

  const handleAiRefine = async () => {
    if (!aiPrompt.trim() || aiLoading) return;
    setAiLoading(true);
    try {
      const res = await fetch('/api/ai/refine-line-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          prompt: aiPrompt.trim(),
          currentItem: {
            name,
            description: stripHtmlForValidation(description),
            quantity: parseFloat(quantity) || 1,
            unitPrice: parseFloat(unitPrice) || 0,
          },
          projectId,
        }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Failed to refine' }));
        throw new Error(errorData.error || 'Failed to refine item');
      }
      const data = await res.json();
      if (data.name !== undefined && typeof data.name === 'string') setName(data.name);
      if (data.description !== undefined && typeof data.description === 'string') setDescription(data.description);
      if (data.quantity !== undefined) {
        const q = Number(data.quantity);
        if (!isNaN(q) && q > 0) setQuantity(String(q));
      }
      if (data.unitPrice !== undefined) {
        const p = Number(data.unitPrice);
        if (!isNaN(p)) setUnitPrice(String(p / 100));
      }
      toast({ title: "Item updated by AI", description: "Review the changes and save" });
      setAiPrompt('');
      setAiExpanded(false);
    } catch (error: any) {
      toast({
        title: "AI Refinement Failed",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setAiLoading(false);
    }
  };

  const buildItem = useCallback((): LineItem | null => {
    const errors: {name?: boolean; unitPrice?: boolean; description?: boolean} = {};
    if (!name.trim()) errors.name = true;
    if (!descriptionOnly && (!unitPrice.trim() || isNaN(parseFloat(unitPrice)))) errors.unitPrice = true;
    if (stripHtmlForValidation(description).length === 0) errors.description = true;
    if (Object.keys(errors).length > 0) return null;

    const qty = descriptionOnly ? 0 : (parseFloat(quantity) || 1);
    const price = descriptionOnly ? 0 : (parseFloat(unitPrice) || 0);
    const total = qty * price;
    return {
      name,
      description,
      quantity: qty,
      unitPrice: price,
      total,
      taxable: descriptionOnly ? false : taxable,
      isOptional,
      descriptionOnly,
      hidePrice: descriptionOnly ? false : hidePrice,
    };
  }, [name, description, quantity, unitPrice, taxable, isOptional, descriptionOnly, hidePrice]);

  const handleSave = useCallback(() => {
    const built = buildItem();
    if (!built) {
      const errors: {name?: boolean; unitPrice?: boolean; description?: boolean} = {};
      if (!name.trim()) errors.name = true;
      if (!descriptionOnly && (!unitPrice.trim() || isNaN(parseFloat(unitPrice)))) errors.unitPrice = true;
      if (stripHtmlForValidation(description).length === 0) errors.description = true;
      setValidationErrors(errors);
      const missing: string[] = [];
      if (errors.name) missing.push("name");
      if (errors.unitPrice) missing.push("price");
      if (errors.description) missing.push("description");
      toast({
        title: "Missing required fields",
        description: `Please fill in the item ${missing.join(", ")}`,
        variant: "destructive",
      });
      return;
    }
    if (autoSaveTimerRef.current) { clearTimeout(autoSaveTimerRef.current); autoSaveTimerRef.current = null; }
    hasAutoSavedRef.current = false;
    onSave(built);
    closeDialog();
  }, [buildItem, name, descriptionOnly, unitPrice, onSave, closeDialog, toast]);

  const revertAndClose = useCallback(() => {
    if (autoSaveTimerRef.current) { clearTimeout(autoSaveTimerRef.current); autoSaveTimerRef.current = null; }
    if (hasAutoSavedRef.current && onAutoSave && originalItemRef.current) {
      onAutoSave(originalItemRef.current);
    }
    hasAutoSavedRef.current = false;
    closeDialog();
  }, [onAutoSave, closeDialog]);

  const cancelAutoSaveTimer = useCallback(() => {
    if (autoSaveTimerRef.current) { clearTimeout(autoSaveTimerRef.current); autoSaveTimerRef.current = null; }
  }, []);

  const scheduleAutoSave = useCallback(() => {
    if (readOnly) return;
    if (!onAutoSave) return;
    cancelAutoSaveTimer();
    autoSaveTimerRef.current = setTimeout(() => {
      const built = buildItem();
      if (!built) return;
      setAutoSaveStatus('saving');
      hasAutoSavedRef.current = true;
      onAutoSave(built);
      setAutoSaveStatus('saved');
      if (autoSaveSavedTimerRef.current) clearTimeout(autoSaveSavedTimerRef.current);
      autoSaveSavedTimerRef.current = setTimeout(() => setAutoSaveStatus('idle'), 3000);
    }, 3000);
  }, [buildItem, onAutoSave, cancelAutoSaveTimer]);

  useEffect(() => {
    if (!open) return;
    if (checkHasChanges()) {
      scheduleAutoSave();
    }
  }, [name, description, quantity, unitPrice, taxable, isOptional, descriptionOnly, hidePrice]);

  useEffect(() => {
    if (!open) {
      cancelAutoSaveTimer();
      if (autoSaveSavedTimerRef.current) { clearTimeout(autoSaveSavedTimerRef.current); autoSaveSavedTimerRef.current = null; }
      setAutoSaveStatus('idle');
    }
  }, [open, cancelAutoSaveTimer]);

  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      if (autoSaveSavedTimerRef.current) clearTimeout(autoSaveSavedTimerRef.current);
    };
  }, []);

  const handleBack = useCallback(() => {
    if (checkHasChanges() || hasAutoSavedRef.current) {
      setShowUnsavedWarning(true);
    } else {
      closeDialog();
    }
  }, [checkHasChanges, closeDialog]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const onCancel = (e: Event) => {
      e.preventDefault();
      if (intentionalCloseRef.current) return;
      if (showDescriptionEditor) {
        setShowDescriptionEditor(false);
      } else if (checkHasChanges() || hasAutoSavedRef.current) {
        setShowUnsavedWarning(true);
      } else {
        closeDialog();
      }
    };

    dialog.addEventListener('cancel', onCancel);
    return () => dialog.removeEventListener('cancel', onCancel);
  }, [showDescriptionEditor, checkHasChanges, closeDialog]);

  return createPortal(
    <dialog 
      ref={dialogRef} 
      className="fixed inset-0 m-0 w-screen max-w-none max-h-none p-0 bg-background text-foreground border-0 outline-none backdrop:bg-black/80"
      style={{ 
        zIndex: 2147483646,
        touchAction: 'manipulation',
        WebkitOverflowScrolling: 'touch',
        height: viewportHeight ? `${viewportHeight}px` : '100dvh',
      }}
      data-testid="line-item-editor-dialog"
      data-edit-readonly={readOnly ? 'true' : undefined}
    >
      {showDescriptionEditor ? (
        <div 
          className="h-full w-screen overflow-hidden bg-background text-foreground"
          style={{ touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' }}
        >
          <RichTextEditor
            content={description}
            onChange={setDescription}
            placeholder="Enter detailed description, scope of work, materials, specifications..."
            headerMode
            autoSaveStatus={autoSaveStatus}
            onBack={() => setShowDescriptionEditor(false)}
            onSave={() => setShowDescriptionEditor(false)}
          />
        </div>
      ) : (
        <>
          {/* Fixed header - Mobile */}
          <div className="lg:hidden fixed left-0 right-0 top-0 z-50 bg-slate-800 dark:bg-slate-900 shadow-md pt-[env(safe-area-inset-top,0px)]">
            <div className="flex items-center justify-between px-3 py-2">
              <button
                type="button"
                className="px-3 py-1.5 rounded-md border border-white/20 text-white/70 text-sm font-medium hover:bg-white/10 active:bg-white/20 transition-colors"
                onClick={handleBack}
                data-testid="button-cancel-line-item"
              >
                {readOnly ? 'Close' : 'Cancel'}
              </button>
              <span className="font-medium truncate flex-1 text-center px-2 text-white">
                {name || `Line Item ${itemIndex + 1}`}
              </span>
              <div className="flex items-center gap-2">
                {readOnly ? (
                  <span
                    className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-200 border border-amber-300/30"
                    data-testid="badge-line-item-view-only"
                  >
                    View only
                  </span>
                ) : (
                  <>
                    {autoSaveStatus === 'saving' && (
                      <span className="text-xs text-white/50 flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> Saving...
                      </span>
                    )}
                    {autoSaveStatus === 'saved' && (
                      <span className="text-xs text-green-400">Saved</span>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleSave}
                      className="bg-primary text-primary-foreground"
                      data-testid="button-save-line-item"
                    >
                      <Save className="w-4 h-4 mr-1" />
                      Save
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
          
          {/* Desktop header */}
          <div className="hidden lg:block sticky top-0 z-50 bg-slate-800 dark:bg-slate-900 shadow-md">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-md border border-white/20 text-white/70 text-sm font-medium hover:bg-white/10 active:bg-white/20 transition-colors"
                  onClick={handleBack}
                  data-testid="button-cancel-line-item-desktop"
                >
                  {readOnly ? 'Close' : 'Cancel'}
                </button>
                <span className="font-semibold text-lg text-white">
                  {name || `Line Item ${itemIndex + 1}`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {readOnly ? (
                  <span
                    className="text-[11px] uppercase tracking-wide font-semibold px-2 py-1 rounded-md bg-amber-400/20 text-amber-200 border border-amber-300/30"
                    data-testid="badge-line-item-view-only-desktop"
                  >
                    View only
                  </span>
                ) : (
                  <>
                    {autoSaveStatus === 'saving' && (
                      <span className="text-xs text-white/50 flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> Saving...
                      </span>
                    )}
                    {autoSaveStatus === 'saved' && (
                      <span className="text-xs text-green-400">Saved</span>
                    )}
                    <Button
                      type="button"
                      onClick={handleSave}
                      className="bg-primary text-primary-foreground"
                      data-testid="button-save-line-item-desktop"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      Save
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Content with padding for fixed header + safe area */}
          <div 
            ref={scrollContainerRef}
            className="lg:pt-0 p-4 space-y-6 overflow-y-auto overflow-x-hidden"
            style={{ 
              paddingTop: 'calc(3.5rem + env(safe-area-inset-top, 0px))', 
              paddingBottom: viewportHeight ? '2rem' : '5rem',
              touchAction: 'pan-y', 
              WebkitOverflowScrolling: 'touch',
              height: viewportHeight ? `${viewportHeight}px` : '100dvh',
            }}
          >
            {/* Item Name */}
            <div className="space-y-2">
              <Label htmlFor="line-item-name" className="text-base font-medium">Item Name <span className="text-destructive">*</span></Label>
              <input 
                id="line-item-name"
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (validationErrors.name && e.target.value.trim()) setValidationErrors(prev => ({...prev, name: false}));
                }}
                placeholder="e.g. Kitchen Renovation, Bathroom Remodel..."
                className={`flex h-12 w-full rounded-md border ${validationErrors.name ? 'border-destructive border-2' : 'border-input'} bg-background text-foreground px-3 py-2 text-lg ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`}
                style={{ touchAction: 'manipulation' }}
                data-testid="input-item-name"
                autoComplete="off"
              />
              {validationErrors.name && <span className="text-destructive text-xs">Item name is required</span>}
            </div>

            {!descriptionOnly && (
              <>
                {/* Quantity and Price row */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="line-item-qty" className="text-base font-medium">Quantity</Label>
                    <input 
                      id="line-item-qty"
                      type="text"
                      inputMode="text"
                      value={quantity}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === '' || v === '-' || /^-?\d*\.?\d*$/.test(v)) setQuantity(v);
                      }}
                      placeholder="1"
                      className="flex h-12 w-full rounded-md border border-input bg-background text-foreground px-3 py-2 text-lg ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      style={{ touchAction: 'manipulation' }}
                      data-testid="input-item-qty"
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="line-item-price" className="text-base font-medium">Price ($) <span className="text-destructive">*</span></Label>
                    <input 
                      id="line-item-price"
                      type="text"
                      inputMode="text"
                      value={unitPrice}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === '' || v === '-' || /^-?\d*\.?\d*$/.test(v)) {
                          setUnitPrice(v);
                          if (validationErrors.unitPrice && v.trim() && !isNaN(parseFloat(v))) setValidationErrors(prev => ({...prev, unitPrice: false}));
                        }
                      }}
                      placeholder="0.00 (use negative for discount)"
                      className={`flex h-12 w-full rounded-md border ${validationErrors.unitPrice ? 'border-destructive border-2' : 'border-input'} bg-background text-foreground px-3 py-2 text-lg ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`}
                      style={{ touchAction: 'manipulation' }}
                      data-testid="input-item-price"
                      autoComplete="off"
                    />
                    {validationErrors.unitPrice && <span className="text-destructive text-xs">Price is required</span>}
                  </div>
                </div>

                {/* Tax checkbox + profile selector */}
                <div className="flex items-center gap-3 flex-wrap">
                  {(taxRate ?? 0) > 0 && (
                    <>
                      <label className="flex items-center gap-2.5 cursor-pointer" data-testid="checkbox-taxable">
                        <input
                          type="checkbox"
                          checked={taxable}
                          onChange={(e) => setTaxable(e.target.checked)}
                          className="h-4 w-4 rounded border-input"
                        />
                        <span className="text-sm">Taxable</span>
                      </label>
                      {taxable && taxProfiles && taxProfiles.length > 0 && (
                        <select
                          value={taxProfiles.find(p => p.name === taxProfileName)?.id || taxProfiles.find(p => p.isDefault)?.id || ''}
                          onChange={(e) => {
                            const profileId = e.target.value ? parseInt(e.target.value) : undefined;
                            if (profileId && onTaxProfileChange) {
                              const profile = taxProfiles.find(p => p.id === profileId);
                              if (profile) {
                                onTaxProfileChange(profile);
                                toast({ title: "Tax profile updated", description: `${profile.name} (${profile.rate}%) will apply to all taxable items in this document.` });
                              }
                            }
                          }}
                          className="h-7 text-xs rounded border border-input bg-background px-2"
                          data-testid="select-line-item-tax-profile"
                        >
                          {taxProfiles.map((p: any) => (
                            <option key={p.id} value={p.id}>{p.name} ({p.rate}%)</option>
                          ))}
                        </select>
                      )}
                      {taxable && (!taxProfiles || taxProfiles.length === 0) && (
                        <span className="text-xs text-muted-foreground">({taxRate}%)</span>
                      )}
                    </>
                  )}
                </div>
              </>
            )}

            {/* Optional Item Toggle */}
            <div
              className={`rounded-lg border p-3 transition-colors cursor-pointer ${
                isOptional
                  ? 'bg-emerald-50 border-emerald-300 dark:bg-emerald-950/30 dark:border-emerald-700'
                  : 'bg-background border-input'
              }`}
              onClick={() => setIsOptional(!isOptional)}
              data-testid="container-optional-toggle"
            >
              <label className="flex items-center gap-2.5 cursor-pointer" data-testid="checkbox-optional">
                <input
                  type="checkbox"
                  checked={isOptional}
                  onChange={(e) => {
                    e.stopPropagation();
                    setIsOptional(e.target.checked);
                  }}
                  className="h-4 w-4 rounded border-input accent-emerald-600"
                />
                <span className={`text-sm font-medium ${isOptional ? 'text-emerald-700 dark:text-emerald-400' : ''}`}>Optional item</span>
              </label>
              <p className="text-xs text-muted-foreground mt-1.5 pl-[26px] leading-snug">
                Optional items appear at the bottom and customers can choose to add them
              </p>
            </div>

            {/* Description Only Toggle */}
            <div
              className={`rounded-lg border p-3 transition-colors cursor-pointer ${
                descriptionOnly
                  ? 'bg-blue-50 border-blue-300 dark:bg-blue-950/30 dark:border-blue-700'
                  : 'bg-background border-input'
              }`}
              onClick={() => setDescriptionOnly(!descriptionOnly)}
              data-testid="container-description-only-toggle"
            >
              <label className="flex items-center gap-2.5 cursor-pointer" data-testid="checkbox-description-only">
                <input
                  type="checkbox"
                  checked={descriptionOnly}
                  onChange={(e) => {
                    e.stopPropagation();
                    setDescriptionOnly(e.target.checked);
                  }}
                  className="h-4 w-4 rounded border-input accent-blue-600"
                />
                <span className={`text-sm font-medium ${descriptionOnly ? 'text-blue-700 dark:text-blue-400' : ''}`}>Description only</span>
              </label>
              <p className="text-xs text-muted-foreground mt-1.5 pl-[26px] leading-snug">
                No quantity or price — use for terms, conditions, or notes
              </p>
            </div>

            {/* Hide Price Toggle */}
            {!descriptionOnly && (
              <div
                className={`rounded-lg border p-3 transition-colors cursor-pointer ${
                  hidePrice
                    ? 'bg-amber-50 border-amber-300 dark:bg-amber-950/30 dark:border-amber-700'
                    : 'bg-background border-input'
                }`}
                onClick={() => setHidePrice(!hidePrice)}
                data-testid="container-hide-price-toggle"
              >
                <label className="flex items-center gap-2.5 cursor-pointer" data-testid="checkbox-hide-price">
                  <input
                    type="checkbox"
                    checked={hidePrice}
                    onChange={(e) => {
                      e.stopPropagation();
                      setHidePrice(e.target.checked);
                    }}
                    className="h-4 w-4 rounded border-input accent-amber-600"
                  />
                  <span className={`text-sm font-medium ${hidePrice ? 'text-amber-700 dark:text-amber-400' : ''}`}>Hide item price</span>
                </label>
                <p className="text-xs text-muted-foreground mt-1.5 pl-[26px] leading-snug">
                  Price is included in the total but not shown on the customer view, portal, or PDF
                </p>
              </div>
            )}

            {/* Description - tap to edit */}
            <div className="space-y-2">
              <Label className="text-base font-medium">Description <span className="text-destructive">*</span></Label>
              <Card 
                className={`p-4 min-h-[150px] cursor-pointer active:bg-muted/50 bg-background overflow-hidden ${validationErrors.description ? 'border-destructive border-2' : ''}`}
                onClick={() => setShowDescriptionEditor(true)}
                data-testid="button-edit-description"
              >
                {description && stripHtmlForValidation(description).length > 0 ? (
                  <div 
                    className="prose prose-sm dark:prose-invert max-w-none break-words overflow-hidden"
                    style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                    dangerouslySetInnerHTML={{ __html: description }}
                  />
                ) : (
                  <p className="text-muted-foreground">Tap to add description...</p>
                )}
              </Card>
              {validationErrors.description && <span className="text-destructive text-xs">Description is required</span>}
            </div>

            {/* Fuse AI - Elite only */}
            {userTier === 'elite' && !readOnly && <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setAiExpanded(!aiExpanded);
                    if (!aiExpanded) {
                      setTimeout(() => aiInputRef.current?.focus(), 100);
                    }
                  }}
                  className="inline-flex items-center gap-2 rounded-md bg-black dark:bg-white px-3 py-1.5 min-h-8 transition-opacity hover:opacity-80 active:opacity-70"
                  data-testid="button-ai-refine-item"
                >
                  <Sparkles className="w-4 h-4 text-red-500" />
                  <span className="text-white dark:text-black uppercase text-sm font-extrabold tracking-wider">Fuse</span>
                  <span className="border border-white dark:border-black text-white dark:text-black rounded px-1.5 py-0.5 uppercase text-sm font-extrabold tracking-wider leading-none">AI</span>
                </button>
                <span className="text-[10px] text-muted-foreground font-medium" data-testid="badge-elite-ai-refine">Elite feature</span>
              </div>

              {aiExpanded && (
                <div className="space-y-2 rounded-lg border p-3 bg-muted/30" data-testid="ai-refine-panel">
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p className="font-medium">Give a command and AI will format this item:</p>
                    <ul className="list-disc pl-4 space-y-0.5">
                      <li>Describe: <span className="text-foreground">"Master bedroom walls and ceiling, 2 coats"</span></li>
                      <li>Set price: <span className="text-foreground">"Kitchen repaint $2,500"</span></li>
                      <li>Edit: <span className="text-foreground">"change price to $3,000" "add note about 2 coats"</span></li>
                    </ul>
                  </div>
                  <Textarea
                    ref={aiInputRef}
                    value={aiPrompt}
                    onChange={(e) => {
                      setAiPrompt(e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = Math.min(e.target.scrollHeight, 150) + 'px';
                    }}
                    onFocus={() => {
                      setAiInputFocused(true);
                      const scrollToAi = () => {
                        if (aiInputRef.current) {
                          aiInputRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                      };
                      setTimeout(scrollToAi, 100);
                      setTimeout(scrollToAi, 400);
                      setTimeout(scrollToAi, 800);
                    }}
                    onBlur={() => setAiInputFocused(false)}
                    placeholder="Tell AI what to format: describe the work, set a price, add notes..."
                    className="resize-none text-sm min-h-[60px] w-full"
                    style={{ maxHeight: '150px', overflowY: 'auto' }}
                    disabled={aiLoading}
                    data-testid="input-ai-refine-prompt"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setAiExpanded(false);
                        setAiPrompt('');
                      }}
                      data-testid="button-ai-refine-close"
                    >
                      <X className="w-4 h-4 mr-1" />
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleAiRefine}
                      disabled={!aiPrompt.trim() || aiLoading}
                      data-testid="button-ai-refine-send"
                    >
                      {aiLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-1" />
                      ) : (
                        <Send className="w-4 h-4 mr-1" />
                      )}
                      Apply
                    </Button>
                  </div>
                  {aiLoading && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Updating item...
                    </p>
                  )}
                </div>
              )}
            </div>}

            {/* Total */}
            <div className="pt-4 border-t space-y-1">
              {taxable && (taxRate ?? 0) > 0 && (() => {
                const lineSubtotal = (parseFloat(quantity) || 0) * (parseFloat(unitPrice) || 0);
                const lineTax = lineSubtotal * ((taxRate ?? 0) / 100);
                return (
                  <>
                    <div className="flex justify-between items-center text-sm text-muted-foreground">
                      <span>Subtotal</span>
                      <span className={`tabular-nums ${lineSubtotal < 0 ? 'text-destructive' : ''}`}>{lineSubtotal < 0 ? '-' : ''}${Math.abs(lineSubtotal).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm text-muted-foreground">
                      <span>{taxProfileName ? `${taxProfileName} (${taxRate}%)` : `Tax (${taxRate}%)`}</span>
                      <span className="tabular-nums">${lineTax.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center text-lg font-semibold">
                      <span>Total:</span>
                      <span className={`tabular-nums ${(lineSubtotal + lineTax) < 0 ? 'text-destructive' : ''}`}>{(lineSubtotal + lineTax) < 0 ? '-' : ''}${Math.abs(lineSubtotal + lineTax).toFixed(2)}</span>
                    </div>
                  </>
                );
              })()}
              {(!taxable || (taxRate ?? 0) <= 0) && (() => {
                const lineTotal = (parseFloat(quantity) || 0) * (parseFloat(unitPrice) || 0);
                return (
                  <div className="flex justify-between items-center text-lg font-semibold">
                    <span>Total:</span>
                    <span className={`tabular-nums ${lineTotal < 0 ? 'text-destructive' : ''}`}>{lineTotal < 0 ? '-' : ''}${Math.abs(lineTotal).toFixed(2)}</span>
                  </div>
                );
              })()}
            </div>

            {aiInputFocused && (
              <div style={{ height: '50vh', flexShrink: 0 }} aria-hidden="true" />
            )}
          </div>
        </>
      )}

      {showUnsavedWarning && (
        <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/60 p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowUnsavedWarning(false); }}>
          <div className="bg-background rounded-lg shadow-xl max-w-sm w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div>
              <h3 className="text-lg font-semibold">Unsaved Changes</h3>
              <p className="text-sm text-muted-foreground mt-1">
                You have unsaved changes. Are you sure you want to leave? Your changes will be lost.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowUnsavedWarning(false)}
                data-testid="button-cancel-unsaved"
              >
                Keep Editing
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  setShowUnsavedWarning(false);
                  revertAndClose();
                }}
                data-testid="button-discard-changes"
              >
                Discard Changes
              </Button>
            </div>
          </div>
        </div>
      )}
    </dialog>,
    document.body
  );
}

interface LineItemCardProps {
  item: LineItem;
  index: number;
  onClick: () => void;
  onRemove: () => void;
  canRemove?: boolean;
  isDragOver?: boolean;
  isDragging?: boolean;
  onDragStart?: (index: number) => void;
  onDragOver?: (index: number) => void;
  onDragEnd?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  isFirst?: boolean;
  isLast?: boolean;
  totalItems?: number;
}

export function LineItemCard({ item, index, onClick, onRemove, canRemove = true, isDragOver, isDragging, onDragStart, onDragOver, onDragEnd, onMoveUp, onMoveDown, isFirst, isLast, totalItems = 1 }: LineItemCardProps) {
  const hasDescription = item.description && stripHtmlForValidation(item.description).length > 0;
  const total = (item.quantity || 0) * (item.unitPrice || 0);
  const showReorder = totalItems > 1 && (onMoveUp || onMoveDown);
  const [longPressActive, setLongPressActive] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchMovedRef = useRef(false);
  const longPressActiveRef = useRef(false);
  const dragFromRef = useRef<number | null>(null);
  const dragOverRef = useRef<number | null>(null);
  const onDragStartRef = useRef(onDragStart);
  const onDragOverRef = useRef(onDragOver);
  const onDragEndRef = useRef(onDragEnd);
  onDragStartRef.current = onDragStart;
  onDragOverRef.current = onDragOver;
  onDragEndRef.current = onDragEnd;

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  // Drag is initiated only from the grip handle on the left of the card.
  // No long-press wait — touching the grip starts the drag immediately.
  const handleHandleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!showReorder) return;
    e.stopPropagation();
    longPressActiveRef.current = true;
    setLongPressActive(true);
    touchMovedRef.current = true;
    dragFromRef.current = index;
    if (navigator.vibrate) navigator.vibrate(15);
    onDragStartRef.current?.(index);
  }, [showReorder, index]);

  const handleHandleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!longPressActiveRef.current) return;
    if (e.cancelable) e.preventDefault();
    const touch = e.touches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    if (el) {
      const card = el.closest('[data-entry-index]');
      if (card) {
        const overIdx = parseInt(card.getAttribute('data-entry-index') || '0');
        dragOverRef.current = overIdx;
        onDragOverRef.current?.(overIdx);
      }
    }
  }, []);

  const handleHandleTouchEnd = useCallback(() => {
    if (longPressActiveRef.current) {
      onDragEndRef.current?.();
      longPressActiveRef.current = false;
      setLongPressActive(false);
    }
    touchMovedRef.current = false;
  }, []);

  const handleClick = useCallback(() => {
    if (touchMovedRef.current || longPressActiveRef.current) return;
    onClick();
  }, [onClick]);

  return (
    <div
      className={`rounded-xl border-2 ${item.isOptional ? 'border-emerald-300 dark:border-emerald-600' : item.descriptionOnly ? 'border-blue-300 dark:border-blue-600' : item.hidePrice ? 'border-amber-300 dark:border-amber-600' : 'border-card-border'} bg-card overflow-hidden transition-all duration-150 ${isDragOver ? 'ring-2 ring-primary shadow-lg shadow-primary/20' : 'shadow-sm'} ${isDragging ? 'opacity-40 scale-95' : ''} ${longPressActive ? 'scale-[1.03] shadow-xl ring-2 ring-primary z-10 select-none' : ''}`}
      draggable={!!showReorder}
      onDragStart={(e) => { if (showReorder) { e.dataTransfer.effectAllowed = 'move'; onDragStart?.(index); } }}
      onDragEnd={() => onDragEnd?.()}
      onDragOver={(e) => { e.preventDefault(); onDragOver?.(index); }}
      onDrop={(e) => { e.preventDefault(); onDragEnd?.(); }}
      data-testid={`card-line-item-${index}`}
      data-entry-index={index}
      style={longPressActive
        ? { pointerEvents: 'none', WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none' }
        : (showReorder ? { WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none' } : undefined)}
    >
      <div className="flex items-stretch">
        {showReorder && (
          <div
            className="flex flex-col items-center justify-center px-1.5 cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground bg-muted/20 shrink-0 border-r border-border/40 gap-1"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={handleHandleTouchStart}
            onTouchMove={handleHandleTouchMove}
            onTouchEnd={handleHandleTouchEnd}
            onTouchCancel={handleHandleTouchEnd}
            style={{ touchAction: 'none', WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none' }}
            data-testid={`drag-handle-${index}`}
            data-mutating="true"
          >
            <button
              type="button"
              className={`p-0.5 rounded transition-colors ${isFirst ? 'text-muted-foreground/20' : 'text-muted-foreground/60 hover:text-foreground active:bg-muted'}`}
              onClick={(e) => { e.stopPropagation(); onMoveUp?.(); }}
              disabled={isFirst}
              data-testid={`button-move-up-${index}`}
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
            <GripVertical className="w-4 h-4 text-muted-foreground/30" />
            <button
              type="button"
              className={`p-0.5 rounded transition-colors ${isLast ? 'text-muted-foreground/20' : 'text-muted-foreground/60 hover:text-foreground active:bg-muted'}`}
              onClick={(e) => { e.stopPropagation(); onMoveDown?.(); }}
              disabled={isLast}
              data-testid={`button-move-down-${index}`}
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        <div
          className="flex-1 min-w-0 p-3 cursor-pointer active:bg-muted/50"
          onClick={handleClick}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0 overflow-hidden">
              <div className="font-medium truncate text-sm">
                {item.name || `Item ${index + 1}`}
              </div>
              {hasDescription ? (
                <div 
                  className="text-xs text-muted-foreground line-clamp-1 mt-0.5 break-words overflow-hidden rich-text-content"
                  style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                  dangerouslySetInnerHTML={{ __html: item.description }}
                />
              ) : null}
              <div className="text-xs mt-1 flex items-center gap-1.5 flex-wrap">
                {item.descriptionOnly ? (
                  <span className="text-muted-foreground italic">Description only</span>
                ) : item.hidePrice ? (
                  <span className="text-muted-foreground italic">Price hidden · counted in total ({total < 0 ? '-' : ''}${Math.abs(total).toFixed(2)})</span>
                ) : (
                  <span>{item.quantity} x {(item.unitPrice || 0) < 0 ? '-' : ''}${Math.abs(item.unitPrice || 0).toFixed(2)} = <span className={`font-medium ${total < 0 ? 'text-destructive' : ''}`}>{total < 0 ? '-' : ''}${Math.abs(total).toFixed(2)}</span></span>
                )}
                {item.taxable && !item.descriptionOnly && (
                  <span className="text-[10px] text-muted-foreground bg-muted px-1 py-0.5 rounded" data-testid={`badge-taxable-${index}`}>TAX</span>
                )}
                {item.isOptional && (
                  <span className="text-[11px] text-emerald-700 dark:text-emerald-400 bg-emerald-100/80 dark:bg-emerald-900/40 px-1.5 py-0.5 rounded font-semibold" data-testid={`badge-optional-${index}`}>OPTIONAL</span>
                )}
                {item.descriptionOnly && (
                  <span className="text-[11px] text-blue-700 dark:text-blue-400 bg-blue-100/80 dark:bg-blue-900/40 px-1.5 py-0.5 rounded font-semibold" data-testid={`badge-desc-only-${index}`}>INFO</span>
                )}
                {item.hidePrice && !item.descriptionOnly && (
                  <span className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-100/80 dark:bg-amber-900/40 px-1.5 py-0.5 rounded font-semibold" data-testid={`badge-hide-price-${index}`}>PRICE HIDDEN</span>
                )}
              </div>
            </div>
            {canRemove && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 text-muted-foreground hover:text-destructive h-7 w-7"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove();
                }}
                data-testid={`button-remove-item-${index}`}
                data-mutating="true"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface ProductionRateBlockCardProps {
  block: { id: string; name: string; taxable?: boolean; isOptional?: boolean; roomBuilderData: { rooms: any[]; totalLaborHours: number; grandTotal: number } };
  index: number;
  onClick: () => void;
  onRemove: () => void;
  onToggleOptional?: () => void;
  isDragOver?: boolean;
  isDragging?: boolean;
  onDragStart?: (index: number) => void;
  onDragOver?: (index: number) => void;
  onDragEnd?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  isFirst?: boolean;
  isLast?: boolean;
  totalItems?: number;
  testIdPrefix?: string;
}

export function ProductionRateBlockCard({ block, index, onClick, onRemove, onToggleOptional, isDragOver, isDragging, onDragStart, onDragOver, onDragEnd, onMoveUp, onMoveDown, isFirst, isLast, totalItems = 1, testIdPrefix = '' }: ProductionRateBlockCardProps) {
  const showReorder = totalItems > 1;
  const [longPressActive, setLongPressActive] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchMovedRef = useRef(false);
  const longPressActiveRef = useRef(false);
  const onDragStartRef = useRef(onDragStart);
  const onDragOverRef = useRef(onDragOver);
  const onDragEndRef = useRef(onDragEnd);
  onDragStartRef.current = onDragStart;
  onDragOverRef.current = onDragOver;
  onDragEndRef.current = onDragEnd;

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  // Drag is initiated only from the grip handle on the left of the card.
  const handleHandleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!showReorder) return;
    e.stopPropagation();
    longPressActiveRef.current = true;
    setLongPressActive(true);
    touchMovedRef.current = true;
    if (navigator.vibrate) navigator.vibrate(15);
    onDragStartRef.current?.(index);
  }, [showReorder, index]);

  const handleHandleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!longPressActiveRef.current) return;
    if (e.cancelable) e.preventDefault();
    const touch = e.touches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    if (el) {
      const card = el.closest('[data-entry-index]');
      if (card) {
        const overIdx = parseInt(card.getAttribute('data-entry-index') || '0');
        onDragOverRef.current?.(overIdx);
      }
    }
  }, []);

  const handleHandleTouchEnd = useCallback(() => {
    if (longPressActiveRef.current) {
      onDragEndRef.current?.();
      longPressActiveRef.current = false;
      setLongPressActive(false);
    }
    touchMovedRef.current = false;
  }, []);

  const handleClick = useCallback(() => {
    if (touchMovedRef.current || longPressActiveRef.current) return;
    onClick();
  }, [onClick]);

  return (
    <div
      key={`block-${block.id}`}
      className={`rounded-xl border-2 ${block.isOptional ? 'border-emerald-300 dark:border-emerald-600' : 'border-primary/20'} bg-muted/20 dark:bg-muted/10 overflow-hidden transition-all duration-150 ${isDragOver ? 'ring-2 ring-primary shadow-lg shadow-primary/20' : 'shadow-sm'} ${isDragging ? 'opacity-40 scale-95' : ''} ${longPressActive ? 'scale-[1.03] shadow-xl ring-2 ring-primary z-10 select-none' : ''}`}
      draggable={showReorder}
      onDragStart={(e) => { if (showReorder) { e.dataTransfer.effectAllowed = 'move'; onDragStart?.(index); } }}
      onDragEnd={() => onDragEnd?.()}
      onDragOver={(e) => { e.preventDefault(); onDragOver?.(index); }}
      onDrop={(e) => e.preventDefault()}
      data-testid={`production-block-${testIdPrefix}${block.id}`}
      data-entry-index={index}
      style={longPressActive
        ? { pointerEvents: 'none', WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none' }
        : (showReorder ? { WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none' } : undefined)}
    >
      <div className="flex items-stretch">
        {showReorder && (
          <div
            className="flex flex-col items-center justify-center px-1.5 cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground bg-muted/30 shrink-0 border-r border-border/40 gap-1"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={handleHandleTouchStart}
            onTouchMove={handleHandleTouchMove}
            onTouchEnd={handleHandleTouchEnd}
            onTouchCancel={handleHandleTouchEnd}
            style={{ touchAction: 'none', WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none' }}
            data-testid={`drag-handle-block-${block.id}`}
            data-mutating="true"
          >
            <button
              type="button"
              className={`p-0.5 rounded transition-colors ${isFirst ? 'text-muted-foreground/20' : 'text-muted-foreground/60 hover:text-foreground active:bg-muted'}`}
              onClick={(e) => { e.stopPropagation(); onMoveUp?.(); }}
              disabled={isFirst}
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
            <GripVertical className="w-4 h-4 text-muted-foreground/30" />
            <button
              type="button"
              className={`p-0.5 rounded transition-colors ${isLast ? 'text-muted-foreground/20' : 'text-muted-foreground/60 hover:text-foreground active:bg-muted'}`}
              onClick={(e) => { e.stopPropagation(); onMoveDown?.(); }}
              disabled={isLast}
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        <div
          className="flex-1 p-3 cursor-pointer active:bg-muted/50"
          onClick={handleClick}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Calculator className="w-4 h-4 text-primary shrink-0" />
              <div className="min-w-0">
                <span className="text-sm font-semibold truncate block">{block.name}</span>
                <span className="text-xs text-muted-foreground">
                  {block.roomBuilderData.rooms.length} area{block.roomBuilderData.rooms.length !== 1 ? 's' : ''} — {block.roomBuilderData.totalLaborHours.toFixed(1)} hrs
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {block.isOptional && (
                <span className="text-[10px] text-emerald-700 dark:text-emerald-400 bg-emerald-100/60 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded font-medium" data-testid={`badge-optional-block-${testIdPrefix}${block.id}`}>OPTIONAL</span>
              )}
              {block.taxable && (
                <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">TAX</span>
              )}
              <span className="text-sm font-semibold tabular-nums">${block.roomBuilderData.grandTotal.toFixed(0)}</span>
              {onToggleOptional && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleOptional();
                  }}
                  className={`p-1 rounded transition-colors ${block.isOptional ? 'text-emerald-600 hover:text-emerald-700' : 'text-muted-foreground/40 hover:text-emerald-600'}`}
                  data-testid={`button-toggle-optional-block-${testIdPrefix}${block.id}`}
                  title={block.isOptional ? 'Mark as required' : 'Mark as optional'}
                  data-mutating="true"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </button>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove();
                }}
                className="p-1 text-destructive/60 hover:text-destructive"
                data-testid={`button-remove-block-${testIdPrefix}${block.id}`}
                data-mutating="true"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
