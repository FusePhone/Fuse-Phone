import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ChevronDown, Eye, EyeOff, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProposalDisplayDefaults, ItemDisplayOverrides } from "@shared/schema";
import { DEFAULT_PROPOSAL_DISPLAY } from "@shared/schema";

const STORAGE_KEY = "proposal_visibility_panel_collapsed";
const ADVANCED_STORAGE_KEY = "proposal_visibility_advanced_collapsed";

interface CustomerVisibilityPanelProps {
  defaults: ProposalDisplayDefaults;
  onDefaultsChange: (defaults: ProposalDisplayDefaults) => void;
  customerPreview: boolean;
  onCustomerPreviewChange: (preview: boolean) => void;
  onApplyToAllItems: (field: keyof ProposalDisplayDefaults | "all") => void;
  itemCount: number;
}

function StatusBadge({ label, on }: { label: string; on: boolean }) {
  return (
    <Badge
      variant={on ? "default" : "secondary"}
      className="text-[10px] px-1.5 py-0"
      data-testid={`badge-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      {label}: {on ? "ON" : "OFF"}
    </Badge>
  );
}

export function CustomerVisibilityPanel({
  defaults,
  onDefaultsChange,
  customerPreview,
  onCustomerPreviewChange,
  onApplyToAllItems,
  itemCount,
}: CustomerVisibilityPanelProps) {
  const [collapsed, setCollapsed] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored !== null ? stored === "true" : true;
  });

  const [advancedCollapsed, setAdvancedCollapsed] = useState(() => {
    const stored = localStorage.getItem(ADVANCED_STORAGE_KEY);
    return stored !== null ? stored === "true" : true;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    localStorage.setItem(ADVANCED_STORAGE_KEY, String(advancedCollapsed));
  }, [advancedCollapsed]);

  const updateDefault = (key: keyof ProposalDisplayDefaults, value: boolean) => {
    onDefaultsChange({ ...defaults, [key]: value });
  };

  const materialsOn = (defaults.showMaterialQty || defaults.showMaterialPrice) && defaults.pricingDetails;
  const laborHrsOn = defaults.showLaborHrs && defaults.pricingDetails;

  return (
    <div className="border rounded-lg" data-testid="customer-visibility-panel">
      <button
        type="button"
        className="flex items-center justify-between gap-2 w-full text-left px-3 py-2.5"
        onClick={() => setCollapsed(!collapsed)}
        data-testid="button-toggle-visibility-panel"
      >
        <div className="flex items-center gap-2 min-w-0">
          {customerPreview ? (
            <Eye className="w-4 h-4 text-primary shrink-0" />
          ) : (
            <EyeOff className="w-4 h-4 text-muted-foreground shrink-0" />
          )}
          <span className="text-sm font-medium">Customer Visibility</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {collapsed && (
            <div className="flex items-center gap-1 flex-wrap justify-end">
              <StatusBadge label="Preview" on={customerPreview} />
              <StatusBadge label="Pricing" on={defaults.pricingDetails} />
              <StatusBadge label="Coats" on={defaults.showCoats} />
              {defaults.pricingDetails && (
                <>
                  <StatusBadge label="Labor Hrs" on={laborHrsOn} />
                  <StatusBadge label="Materials" on={materialsOn} />
                </>
              )}
            </div>
          )}
          <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform shrink-0", !collapsed && "rotate-180")} />
        </div>
      </button>

      {!collapsed && (
        <div className="px-3 pb-3 space-y-4 border-t pt-3">
          <div className="flex items-center justify-between gap-3" data-testid="toggle-customer-preview">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium cursor-pointer">Customer Preview</Label>
              <p className="text-xs text-muted-foreground">Preview exactly what the customer will see.</p>
            </div>
            <Switch
              checked={customerPreview}
              onCheckedChange={onCustomerPreviewChange}
              data-testid="switch-customer-preview"
            />
          </div>

          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between gap-3" data-testid="toggle-pricing-details">
              <Label className="text-sm cursor-pointer">Pricing Details</Label>
              <Switch
                checked={defaults.pricingDetails}
                onCheckedChange={(v) => updateDefault("pricingDetails", v)}
                data-testid="switch-pricing-details"
              />
            </div>

            <div className="flex items-center justify-between gap-3" data-testid="toggle-coats">
              <Label className="text-sm cursor-pointer">Coats</Label>
              <Switch
                checked={defaults.showCoats}
                onCheckedChange={(v) => updateDefault("showCoats", v)}
                data-testid="switch-coats"
              />
            </div>
          </div>

          <div className="border rounded-md" data-testid="advanced-details-section">
            <button
              type="button"
              className="flex items-center justify-between gap-2 w-full text-left px-2.5 py-2"
              onClick={() => setAdvancedCollapsed(!advancedCollapsed)}
              data-testid="button-toggle-advanced"
            >
              <span className="text-xs font-medium text-muted-foreground">Advanced details</span>
              <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform", !advancedCollapsed && "rotate-180")} />
            </button>

            {!advancedCollapsed && (
              <div className="px-2.5 pb-2.5 space-y-2.5 border-t pt-2.5">
                <div className="flex items-center justify-between gap-3" data-testid="toggle-surface-details">
                  <Label className="text-xs cursor-pointer">Surface Details</Label>
                  <Switch
                    checked={defaults.showSurfaceDetails}
                    onCheckedChange={(v) => updateDefault("showSurfaceDetails", v)}
                    disabled={!defaults.pricingDetails}
                    data-testid="switch-surface-details"
                  />
                </div>
                <div className="flex items-center justify-between gap-3" data-testid="toggle-labor-hrs">
                  <Label className="text-xs cursor-pointer">Labor Hours</Label>
                  <Switch
                    checked={defaults.showLaborHrs}
                    onCheckedChange={(v) => updateDefault("showLaborHrs", v)}
                    disabled={!defaults.pricingDetails}
                    data-testid="switch-labor-hrs"
                  />
                </div>
                <div className="flex items-center justify-between gap-3" data-testid="toggle-labor-rate">
                  <Label className="text-xs cursor-pointer">Labor Rate ($/hr)</Label>
                  <Switch
                    checked={defaults.showLaborRate}
                    onCheckedChange={(v) => updateDefault("showLaborRate", v)}
                    disabled={!defaults.pricingDetails}
                    data-testid="switch-labor-rate"
                  />
                </div>
                <div className="flex items-center justify-between gap-3" data-testid="toggle-labor-price">
                  <Label className="text-xs cursor-pointer">Labor Price ($)</Label>
                  <Switch
                    checked={defaults.showLaborPrice}
                    onCheckedChange={(v) => updateDefault("showLaborPrice", v)}
                    disabled={!defaults.pricingDetails}
                    data-testid="switch-labor-price"
                  />
                </div>
                <div className="flex items-center justify-between gap-3" data-testid="toggle-material-qty">
                  <Label className="text-xs cursor-pointer">Material Qty</Label>
                  <Switch
                    checked={defaults.showMaterialQty}
                    onCheckedChange={(v) => updateDefault("showMaterialQty", v)}
                    disabled={!defaults.pricingDetails}
                    data-testid="switch-material-qty"
                  />
                </div>
                <div className="flex items-center justify-between gap-3" data-testid="toggle-material-price">
                  <Label className="text-xs cursor-pointer">Material Price ($)</Label>
                  <Switch
                    checked={defaults.showMaterialPrice}
                    onCheckedChange={(v) => updateDefault("showMaterialPrice", v)}
                    disabled={!defaults.pricingDetails}
                    data-testid="switch-material-price"
                  />
                </div>
              </div>
            )}
          </div>

          {itemCount > 0 && (
            <div className="flex items-center gap-2 flex-wrap pt-1" data-testid="apply-to-all-section">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onApplyToAllItems("all")}
                data-testid="button-apply-all-settings"
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                Apply all settings to items
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ItemVisibilityOverridesProps {
  overrides: ItemDisplayOverrides | undefined;
  onOverridesChange: (overrides: ItemDisplayOverrides | undefined) => void;
}

export function ItemVisibilityOverrides({ overrides, onOverridesChange }: ItemVisibilityOverridesProps) {
  const [expanded, setExpanded] = useState(false);

  const hasOverrides = overrides && Object.values(overrides).some((v) => v != null);

  const updateOverride = (key: keyof ItemDisplayOverrides, value: boolean) => {
    const current = overrides || {};
    onOverridesChange({ ...current, [key]: value });
  };

  const resetToDefaults = () => {
    onOverridesChange(undefined);
  };

  return (
    <div className="border rounded-md mt-2" data-testid="item-visibility-overrides">
      <button
        type="button"
        className="flex items-center justify-between gap-2 w-full text-left px-2.5 py-1.5"
        onClick={() => setExpanded(!expanded)}
        data-testid="button-toggle-item-visibility"
      >
        <div className="flex items-center gap-1.5">
          <Eye className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">Visibility</span>
          {hasOverrides && <Badge variant="secondary" className="text-[10px] px-1 py-0">Custom</Badge>}
        </div>
        <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform", expanded && "rotate-180")} />
      </button>

      {expanded && (
        <div className="px-2.5 pb-2 space-y-2 border-t pt-2">
          <div className="flex items-center justify-between gap-3">
            <Label className="text-xs cursor-pointer">Pricing Details</Label>
            <Switch
              checked={overrides?.pricingDetails ?? false}
              onCheckedChange={(v) => updateOverride("pricingDetails", v)}
              data-testid="switch-item-pricing-details"
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label className="text-xs cursor-pointer">Coats</Label>
            <Switch
              checked={overrides?.showCoats ?? true}
              onCheckedChange={(v) => updateOverride("showCoats", v)}
              data-testid="switch-item-coats"
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label className="text-xs cursor-pointer">Surface Details</Label>
            <Switch
              checked={overrides?.showSurfaceDetails ?? false}
              onCheckedChange={(v) => updateOverride("showSurfaceDetails", v)}
              data-testid="switch-item-surface-details"
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label className="text-xs cursor-pointer">Labor Hours</Label>
            <Switch
              checked={overrides?.showLaborHrs ?? false}
              onCheckedChange={(v) => updateOverride("showLaborHrs", v)}
              data-testid="switch-item-labor-hrs"
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label className="text-xs cursor-pointer">Labor Rate</Label>
            <Switch
              checked={overrides?.showLaborRate ?? false}
              onCheckedChange={(v) => updateOverride("showLaborRate", v)}
              data-testid="switch-item-labor-rate"
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label className="text-xs cursor-pointer">Labor Price</Label>
            <Switch
              checked={overrides?.showLaborPrice ?? false}
              onCheckedChange={(v) => updateOverride("showLaborPrice", v)}
              data-testid="switch-item-labor-price"
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label className="text-xs cursor-pointer">Material Qty</Label>
            <Switch
              checked={overrides?.showMaterialQty ?? false}
              onCheckedChange={(v) => updateOverride("showMaterialQty", v)}
              data-testid="switch-item-material-qty"
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label className="text-xs cursor-pointer">Material Price</Label>
            <Switch
              checked={overrides?.showMaterialPrice ?? false}
              onCheckedChange={(v) => updateOverride("showMaterialPrice", v)}
              data-testid="switch-item-material-price"
            />
          </div>

          {hasOverrides && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={resetToDefaults}
              className="w-full mt-1"
              data-testid="button-reset-item-visibility"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
              Reset to Proposal Defaults
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
