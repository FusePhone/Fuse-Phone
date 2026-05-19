import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, Save, DollarSign, Percent, Tag } from "lucide-react";
import type { DocumentDiscount } from "@shared/schema";

const DISCOUNT_PRESETS = [
  { value: "Cash", label: "Cash" },
  { value: "Special Discount", label: "Special Discount" },
  { value: "Season Discount", label: "Season Discount" },
  { value: "custom", label: "Custom" },
];

interface DiscountBuilderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  discount?: DocumentDiscount | null;
  onSave: (discount: DocumentDiscount) => void;
  subtotal?: number;
}

export function DiscountBuilderModal({
  open,
  onOpenChange,
  discount,
  onSave,
  subtotal = 0,
}: DiscountBuilderModalProps) {
  const isEditing = !!discount;
  const [preset, setPreset] = useState("Cash");
  const [customLabel, setCustomLabel] = useState("");
  const [discountType, setDiscountType] = useState<"percentage" | "flat">("percentage");
  const [value, setValue] = useState("1");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (open) {
      if (discount) {
        const matchedPreset = DISCOUNT_PRESETS.find(p => p.value === discount.label);
        if (matchedPreset && matchedPreset.value !== "custom") {
          setPreset(matchedPreset.value);
          setCustomLabel("");
        } else {
          setPreset("custom");
          setCustomLabel(discount.label || "");
        }
        setDiscountType(discount.type || "percentage");
        setValue(discount.value?.toString() || "1");
        setDescription(discount.description || "");
      } else {
        setPreset("Cash");
        setCustomLabel("");
        setDiscountType("percentage");
        setValue("1");
        setDescription("");
      }
    }
  }, [open, discount]);

  const handleSave = useCallback(() => {
    const parsedValue = parseFloat(value) || 0;
    if (parsedValue <= 0) return;
    const label = preset === "custom" ? customLabel.trim() : preset;
    const saved: DocumentDiscount = {
      id: discount?.id || crypto.randomUUID(),
      type: discountType,
      value: parsedValue,
      label: label || "Discount",
      description: description.trim() || "",
    };
    onSave(saved);
    onOpenChange(false);
  }, [value, preset, customLabel, discountType, description, discount, onSave, onOpenChange]);

  const handleBack = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const handleFieldFocus = useCallback((e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const target = e.currentTarget;
    setTimeout(() => {
      try {
        target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      } catch {}
    }, 300);
  }, []);

  // Track the visual viewport height so the modal can shrink to the
  // visible area above the on-screen keyboard. Without this the modal
  // is centered in the full viewport and its lower half (Description
  // field) ends up hidden behind the keyboard on mobile.
  const [viewportHeight, setViewportHeight] = useState<number>(
    typeof window !== "undefined" ? window.visualViewport?.height ?? window.innerHeight : 0
  );

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setViewportHeight(vv.height);
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [open]);

  const parsedVal = parseFloat(value) || 0;
  const discountAmount = discountType === "percentage"
    ? subtotal * (Math.min(parsedVal, 100) / 100)
    : parsedVal;

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 flex items-start justify-center pt-4 sm:items-center sm:pt-0"
      style={{ zIndex: 10002 }}
      data-testid="discount-builder-modal"
    >
      <div className="fixed inset-0 bg-black/50" onClick={handleBack} />
      <div
        className="relative bg-background rounded-xl shadow-xl w-full max-w-md mx-4 overflow-y-auto"
        style={{ zIndex: 10003, maxHeight: viewportHeight ? `${viewportHeight - 32}px` : "90vh" }}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b sticky top-0 bg-background rounded-t-xl">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-primary" />
            <span className="font-semibold">
              {isEditing ? "Edit Discount" : "Add Discount"}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleBack}
            data-testid="button-close-discount-builder"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="p-5 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Discount Name</Label>
            <Select value={preset} onValueChange={(val) => { setPreset(val); if (val !== "custom") setCustomLabel(""); }}>
              <SelectTrigger data-testid="select-discount-preset" className="bg-background">
                <SelectValue placeholder="Select discount type" />
              </SelectTrigger>
              <SelectContent style={{ zIndex: 10010 }}>
                {DISCOUNT_PRESETS.map((p) => (
                  <SelectItem key={p.value} value={p.value} data-testid={`select-preset-${p.value}`}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {preset === "custom" && (
              <Input
                placeholder="Enter discount name"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                onFocus={handleFieldFocus}
                data-testid="input-discount-custom-name"
                className="mt-1.5"
              />
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Type</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDiscountType("percentage")}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-all flex-1 justify-center ${
                  discountType === "percentage"
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-background border-input hover:bg-accent"
                }`}
                data-testid="button-discount-type-percentage"
              >
                <Percent className="w-3.5 h-3.5" />
                Percentage
              </button>
              <button
                type="button"
                onClick={() => setDiscountType("flat")}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-all flex-1 justify-center ${
                  discountType === "flat"
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-background border-input hover:bg-accent"
                }`}
                data-testid="button-discount-type-flat"
              >
                <DollarSign className="w-3.5 h-3.5" />
                Flat Amount
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              {discountType === "percentage" ? "Percentage (%)" : "Amount ($)"}
            </Label>
            <Input
              type="number"
              min="0"
              step={discountType === "percentage" ? "1" : "0.01"}
              max={discountType === "percentage" ? "100" : undefined}
              value={value}
              placeholder={discountType === "percentage" ? "1" : "0.00"}
              onChange={(e) => setValue(e.target.value)}
              onFocus={handleFieldFocus}
              data-testid="input-discount-value"
            />
            {parsedVal > 0 && subtotal > 0 && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium" data-testid="text-discount-preview">
                Saves customer ${discountAmount.toFixed(2)}
                {discountType === "percentage" && ` (${parsedVal}% of $${subtotal.toFixed(2)})`}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Description (optional)</Label>
            <Textarea
              placeholder="e.g. 10% off for booking this week"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onFocus={handleFieldFocus}
              rows={2}
              data-testid="input-discount-description"
            />
          </div>
        </div>

        <div className="px-5 pb-5 pt-1 flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={handleBack}
          >
            Cancel
          </Button>
          <Button
            className="flex-1"
            onClick={handleSave}
            disabled={parsedVal <= 0}
            data-testid="button-save-discount"
          >
            <Save className="w-4 h-4 mr-1.5" />
            {isEditing ? "Update" : "Add"}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
