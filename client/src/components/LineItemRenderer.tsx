import { useState, useEffect } from "react";
import type {
  UnifiedLineItem,
  ItemDisplayOverrides,
  ItemSurface,
  ItemPricingDetails,
  ItemDebug,
  ProposalDisplayDefaults,
} from "@shared/schema";
import { DEFAULT_PROPOSAL_DISPLAY } from "@shared/schema";
import { RichTextDisplay } from "@/components/RichTextEditor";
import { ChevronRight, Pencil } from "lucide-react";

function pluralizeLabel(label: string, count: number): string {
  if (count === 1) return label;
  if (label === "pass") return "passes";
  return label + "s";
}

export interface ResolvedDisplayToggles {
  pricingDetails: boolean;
  showSurfaceDetails: boolean;
  showLaborHrs: boolean;
  showLaborRate: boolean;
  showLaborPrice: boolean;
  showMaterialQty: boolean;
  showMaterialPrice: boolean;
  showCoats: boolean;
}

export function resolveDisplayToggles(
  proposalDefaults: ProposalDisplayDefaults | undefined | null,
  itemOverrides: ItemDisplayOverrides | undefined | null
): ResolvedDisplayToggles {
  const d = proposalDefaults ?? DEFAULT_PROPOSAL_DISPLAY;

  const result: ResolvedDisplayToggles = {
    pricingDetails: d.pricingDetails,
    showSurfaceDetails: d.showSurfaceDetails,
    showLaborHrs: d.showLaborHrs,
    showLaborRate: d.showLaborRate,
    showLaborPrice: d.showLaborPrice,
    showMaterialQty: d.showMaterialQty,
    showMaterialPrice: d.showMaterialPrice,
    showCoats: d.showCoats,
  };

  if (itemOverrides) {
    if (itemOverrides.pricingDetails != null) result.pricingDetails = itemOverrides.pricingDetails;
    if (itemOverrides.showSurfaceDetails != null) result.showSurfaceDetails = itemOverrides.showSurfaceDetails;
    if (itemOverrides.showLaborHrs != null) result.showLaborHrs = itemOverrides.showLaborHrs;
    if (itemOverrides.showLaborRate != null) result.showLaborRate = itemOverrides.showLaborRate;
    if (itemOverrides.showLaborPrice != null) result.showLaborPrice = itemOverrides.showLaborPrice;
    if (itemOverrides.showMaterialQty != null) result.showMaterialQty = itemOverrides.showMaterialQty;
    if (itemOverrides.showMaterialPrice != null) result.showMaterialPrice = itemOverrides.showMaterialPrice;
    if (itemOverrides.showCoats != null) result.showCoats = itemOverrides.showCoats;
  }

  if (!result.pricingDetails) {
    result.showSurfaceDetails = false;
    result.showLaborHrs = false;
    result.showLaborRate = false;
    result.showLaborPrice = false;
    result.showMaterialQty = false;
    result.showMaterialPrice = false;
  }

  return result;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDollars(dollars: number): string {
  return `$${dollars.toFixed(2)}`;
}

function InternalOnlySeparator() {
  return null;
}

interface LineItemRendererProps {
  item: UnifiedLineItem;
  index: number;
  mode: "customer" | "internal";
  proposalDefaults?: ProposalDisplayDefaults | null;
  defaults?: any | null;
  pricesInCents?: boolean;
  hideNameAndTotal?: boolean;
  brandColor?: string | null;
  forceCollapsed?: boolean;
  onBodyClick?: () => void;
  onEdit?: () => void;
}

export function LineItemRenderer({ item, index, mode, proposalDefaults, defaults, pricesInCents = false, hideNameAndTotal = false, brandColor, forceCollapsed, onBodyClick, onEdit }: LineItemRendererProps) {
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    if (forceCollapsed) setExpanded(false);
  }, [forceCollapsed]);
  const toggles = resolveDisplayToggles(proposalDefaults, item.displayOverrides);
  const hasSurfaces = item.surfaces && item.surfaces.length > 0;
  const displayUnitPrice = pricesInCents ? item.unitPrice / 100 : item.unitPrice;
  const displayTotal = pricesInCents ? item.total / 100 : item.total;
  const hasPricingDetails = !!item.pricingDetails;
  const showSurfaces = hasSurfaces && (toggles.showSurfaceDetails || toggles.showCoats);
  const anyPricingVisible =
    toggles.showLaborHrs || toggles.showLaborRate || toggles.showLaborPrice || toggles.showMaterialQty || toggles.showMaterialPrice;

  const surfacesHiddenForCustomer = hasSurfaces && !showSurfaces;
  const pricingHiddenForCustomer = hasPricingDetails && !anyPricingVisible;

  const hasCustomerExpandable = !!(item.scopeNoteHtml || item.description || (mode === "customer" && showSurfaces) || (mode === "customer" && hasPricingDetails && anyPricingVisible));
  const hasInternalExpandable = !!(item.scopeNoteHtml || item.description || hasSurfaces || hasPricingDetails || item.debug);
  const hasExpandableContent = mode === "customer" ? hasCustomerExpandable : hasInternalExpandable;

  const useHeaderStyle = mode === "customer" && brandColor !== undefined;
  const headerTextClass = useHeaderStyle ? (brandColor ? 'text-white' : 'text-background') : '';
  const headerDimClass = useHeaderStyle ? (brandColor ? 'text-white/70' : 'text-background/70') : 'text-muted-foreground';

  return (
    <div className={`space-y-0 ${item.isOptional ? 'border-2 border-emerald-300 dark:border-emerald-500 rounded-md p-2' : ''}`} data-testid={`line-item-${index}`}>
      {!hideNameAndTotal && (
        <div
          className={`w-full flex items-center justify-between gap-2 mb-2 text-left ${hasExpandableContent ? 'cursor-pointer' : ''} ${useHeaderStyle ? `px-3 py-2 rounded-md ${!brandColor ? 'bg-foreground/90' : ''}` : ''}`}
          style={useHeaderStyle && brandColor ? { backgroundColor: brandColor } : undefined}
          onClick={() => hasExpandableContent && setExpanded(!expanded)}
          data-testid={`button-toggle-item-${index}`}
        >
          <div
            className="flex items-center gap-2 min-w-0"
          >
            {hasExpandableContent && (
              <ChevronRight className={`w-4 h-4 shrink-0 transition-transform ${expanded ? 'rotate-90' : ''} ${headerDimClass}`} />
            )}
            <span className={`font-medium text-base ${headerTextClass}`} data-testid={`line-item-name-${index}`}>
              {item.name || `Item ${index + 1}`}
            </span>
            {item.isOptional && (
              <span className="text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-100/60 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded font-medium shrink-0" data-testid={`badge-optional-renderer-${index}`}>OPTIONAL</span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {item.isOptional && (
              <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400" data-testid={`label-optional-item-${index}`}>Optional Item</span>
            )}
            {!item.descriptionOnly && !item.hidePrice && (
              <span className={`text-sm font-semibold tabular-nums shrink-0 ${useHeaderStyle ? (brandColor ? 'text-white/90' : 'text-background/90') : ''}`} data-testid={`line-item-total-${index}`}>
                {formatDollars(displayTotal)}
              </span>
            )}
            {onEdit && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onEdit(); }}
                className={`shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md transition-colors ${useHeaderStyle ? (brandColor ? 'hover:bg-white/20 text-white' : 'hover:bg-background/20 text-background') : 'hover:bg-muted text-muted-foreground hover:text-foreground'}`}
                title="Edit this item"
                aria-label="Edit this item"
                data-testid={`button-edit-item-${index}`}
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {hideNameAndTotal && !item.descriptionOnly && (
        <div className="font-medium text-base mb-2" data-testid={`line-item-name-${index}`}>
          {item.name || `Item ${index + 1}`}
        </div>
      )}

      {(expanded || hideNameAndTotal) && (
        <div className={`space-y-2 ${onBodyClick ? 'cursor-pointer' : ''}`} onClick={onBodyClick}>
          {(item.scopeNoteHtml || item.description) && (
            <div data-testid={`line-item-scope-${index}`}>
              <RichTextDisplay content={item.scopeNoteHtml || item.description} />
            </div>
          )}

          {mode === "customer" && showSurfaces && item.surfaces && (
            <div className="space-y-1" data-testid={`line-item-surfaces-${index}`}>
              <p className="text-sm font-medium text-muted-foreground">Surfaces</p>
              <ul className="text-sm space-y-0.5 pl-4 list-disc">
                {item.surfaces.map((surface: ItemSurface, si: number) => (
                  <li key={surface.key || si} data-testid={`surface-${index}-${si}`}>
                    <span>{surface.label}</span>
                    {toggles.showSurfaceDetails && surface.qty != null && surface.unit && (
                      <span className="text-muted-foreground ml-1">
                        ({surface.qty} {surface.unit})
                      </span>
                    )}
                    {toggles.showCoats && surface.coats > 0 && (() => {
                      const cl = (surface as any).coatsLabel || "coat";
                      return (
                      <span className="text-muted-foreground ml-1">
                        - {surface.coats} {pluralizeLabel(cl, surface.coats)} of paint
                        {(surface.primerCoats && surface.primerCoats > 0) || surface.primerMaterialName
                          ? ` · ${(surface.primerCoats || 1)} ${pluralizeLabel(cl, (surface.primerCoats || 1))} of primer`
                          : ''}
                      </span>
                      );
                    })()}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {mode === "internal" && hasSurfaces && item.surfaces && (
            <>
              {surfacesHiddenForCustomer && <InternalOnlySeparator />}
              <div className="space-y-1" data-testid={`line-item-surfaces-${index}`}>
                <p className="text-sm font-medium text-muted-foreground">Surfaces</p>
                <ul className="text-sm space-y-0.5 pl-4 list-disc">
                  {item.surfaces.map((surface: ItemSurface, si: number) => (
                    <li key={surface.key || si} data-testid={`surface-${index}-${si}`}>
                      <span>{surface.label}</span>
                      {surface.qty != null && surface.unit && (
                        <span className="text-muted-foreground ml-1">
                          ({surface.qty} {surface.unit})
                        </span>
                      )}
                      {surface.coats > 0 && (() => {
                        const cl = (surface as any).coatsLabel || "coat";
                        return (
                        <span className="text-muted-foreground ml-1">
                          - {surface.coats} {pluralizeLabel(cl, surface.coats)} of paint
                          {(surface.primerCoats && surface.primerCoats > 0) || surface.primerMaterialName
                            ? ` · ${(surface.primerCoats || 1)} ${pluralizeLabel(cl, (surface.primerCoats || 1))} of primer`
                            : ''}
                        </span>
                        );
                      })()}
                    </li>
                  ))}
                </ul>
              </div>
              {surfacesHiddenForCustomer && <InternalOnlySeparator />}
            </>
          )}

          {mode === "customer" && hasPricingDetails && anyPricingVisible && (
            <div className="text-sm space-y-1 border-l-2 border-muted pl-3" data-testid={`line-item-pricing-${index}`}>
              {toggles.showLaborHrs && item.pricingDetails?.totalLaborHours != null && (
                <div className="flex items-center justify-between gap-2 flex-wrap" data-testid={`pricing-labor-hrs-${index}`}>
                  <span className="text-muted-foreground">Labor Hours</span>
                  <span>{item.pricingDetails.totalLaborHours.toFixed(2)} hrs</span>
                </div>
              )}
              {toggles.showLaborRate && item.pricingDetails?.sellRateUsed != null && (
                <div className="flex items-center justify-between gap-2 flex-wrap" data-testid={`pricing-labor-rate-${index}`}>
                  <span className="text-muted-foreground">Labor Rate</span>
                  <span>{formatDollars(item.pricingDetails.sellRateUsed)}/hr</span>
                </div>
              )}
              {toggles.showLaborPrice && item.pricingDetails?.totalLaborHours != null && item.pricingDetails?.sellRateUsed != null && (
                <div className="flex items-center justify-between gap-2 flex-wrap" data-testid={`pricing-labor-price-${index}`}>
                  <span className="text-muted-foreground">Labor Price</span>
                  <span>{formatDollars(item.pricingDetails.totalLaborHours * item.pricingDetails.sellRateUsed)}</span>
                </div>
              )}
              {toggles.showMaterialQty && item.debug?.materialsBreakdown?.totals?.gallonsToBuy != null && (
                <div className="flex items-center justify-between gap-2 flex-wrap" data-testid={`pricing-material-qty-${index}`}>
                  <span className="text-muted-foreground">Material Qty</span>
                  <span>{item.debug.materialsBreakdown.totals.gallonsToBuy} gal</span>
                </div>
              )}
              {toggles.showMaterialPrice && item.debug?.materialsBreakdown?.totals?.estimatedMaterialCostCents != null && (
                <div className="flex items-center justify-between gap-2 flex-wrap" data-testid={`pricing-material-price-${index}`}>
                  <span className="text-muted-foreground">Material Price</span>
                  <span>{formatCents(item.debug.materialsBreakdown.totals.estimatedMaterialCostCents)}</span>
                </div>
              )}
            </div>
          )}

          {mode === "internal" && hasPricingDetails && (
            <>
              {pricingHiddenForCustomer && <InternalOnlySeparator />}
              <div className="text-sm space-y-1 border-l-2 border-muted pl-3" data-testid={`line-item-pricing-${index}`}>
                {item.pricingDetails?.totalLaborHours != null && (
                  <div className="flex items-center justify-between gap-2 flex-wrap" data-testid={`pricing-labor-hrs-${index}`}>
                    <span className="text-muted-foreground">Labor Hours</span>
                    <span>{item.pricingDetails.totalLaborHours.toFixed(2)} hrs</span>
                  </div>
                )}
                {item.pricingDetails?.sellRateUsed != null && (
                  <div className="flex items-center justify-between gap-2 flex-wrap" data-testid={`pricing-labor-rate-${index}`}>
                    <span className="text-muted-foreground">Labor Rate</span>
                    <span>{formatDollars(item.pricingDetails.sellRateUsed)}/hr</span>
                  </div>
                )}
                {item.pricingDetails?.totalLaborHours != null && item.pricingDetails?.sellRateUsed != null && (
                  <div className="flex items-center justify-between gap-2 flex-wrap" data-testid={`pricing-labor-price-${index}`}>
                    <span className="text-muted-foreground">Labor Price</span>
                    <span>{formatDollars(item.pricingDetails.totalLaborHours * item.pricingDetails.sellRateUsed)}</span>
                  </div>
                )}
                {item.debug?.materialsBreakdown?.totals?.gallonsToBuy != null && (
                  <div className="flex items-center justify-between gap-2 flex-wrap" data-testid={`pricing-material-qty-${index}`}>
                    <span className="text-muted-foreground">Material Qty</span>
                    <span>{item.debug.materialsBreakdown.totals.gallonsToBuy} gal</span>
                  </div>
                )}
                {item.debug?.materialsBreakdown?.totals?.estimatedMaterialCostCents != null && (
                  <div className="flex items-center justify-between gap-2 flex-wrap" data-testid={`pricing-material-price-${index}`}>
                    <span className="text-muted-foreground">Material Price</span>
                    <span>{formatCents(item.debug.materialsBreakdown.totals.estimatedMaterialCostCents)}</span>
                  </div>
                )}
              </div>
              {pricingHiddenForCustomer && <InternalOnlySeparator />}
            </>
          )}

          {!hideNameAndTotal && mode === "customer" && toggles.pricingDetails && (
            <div className="text-sm flex items-center gap-1 flex-wrap" data-testid={`line-item-qty-breakdown-${index}`}>
              <span>{item.quantity}</span>
              <span>x</span>
              <span>{formatDollars(displayUnitPrice)}</span>
              <span>=</span>
              <span className="font-medium">{formatDollars(displayTotal)}</span>
            </div>
          )}

          {!hideNameAndTotal && mode === "internal" && (
            <>
              {!toggles.pricingDetails && !hasPricingDetails && <InternalOnlySeparator />}
              <div className="text-sm flex items-center gap-1 flex-wrap" data-testid={`line-item-qty-breakdown-${index}`}>
                <span>{item.quantity}</span>
                <span>x</span>
                <span>{formatDollars(displayUnitPrice)}</span>
                <span>=</span>
                <span className="font-medium">{formatDollars(displayTotal)}</span>
              </div>
              {!toggles.pricingDetails && !hasPricingDetails && <InternalOnlySeparator />}
            </>
          )}

          {mode === "internal" && item.debug && (
            <>
              <div className="flex items-center gap-2 my-2" data-testid={`contractor-separator-${index}`}>
                <div className="flex-1 border-t border-dashed border-muted-foreground/40" />
                <span className="text-xs text-muted-foreground whitespace-nowrap">Contractor Only</span>
                <div className="flex-1 border-t border-dashed border-muted-foreground/40" />
              </div>

              <div className="text-xs space-y-1 text-muted-foreground" data-testid={`line-item-debug-${index}`}>
                {item.debug.mode && (
                  <p>Mode: {item.debug.mode}</p>
                )}
                {item.debug.dimensions && (
                  <p>
                    Dimensions: {item.debug.dimensions.L}L x {item.debug.dimensions.W}W x {item.debug.dimensions.H}H
                  </p>
                )}
                {item.debug.surfacesUsed && item.debug.surfacesUsed.length > 0 && (
                  <p>Surfaces: {item.debug.surfacesUsed.join(", ")}</p>
                )}
                {item.debug.laborHours && Object.keys(item.debug.laborHours).length > 0 && (
                  <div>
                    <p>Labor Hours Breakdown:</p>
                    <ul className="pl-4 list-disc">
                      {Object.entries(item.debug.laborHours).map(([key, val]) => (
                        <li key={key}>
                          {key}: {(val as number).toFixed(2)} hrs
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {item.debug.materialsBreakdown && (
                  <div>
                    <p>Materials: {item.debug.materialsBreakdown.materialsConfigured ? "Configured" : "Not Configured"}</p>
                    {item.debug.materialsBreakdown.selectedPaintLine && (
                      <p>Paint Line: {item.debug.materialsBreakdown.selectedPaintLine}</p>
                    )}
                    {item.debug.materialsBreakdown.totals && (
                      <ul className="pl-4 list-disc">
                        <li>Paintable sqft: {item.debug.materialsBreakdown.totals.paintableSqft}</li>
                        <li>Gallons (exact): {item.debug.materialsBreakdown.totals.gallonsExact.toFixed(2)}</li>
                        <li>Gallons (buy): {item.debug.materialsBreakdown.totals.gallonsToBuy}</li>
                        {item.debug.materialsBreakdown.totals.estimatedMaterialCostCents != null && (
                          <li>Est. Material Cost: {formatCents(item.debug.materialsBreakdown.totals.estimatedMaterialCostCents)}</li>
                        )}
                      </ul>
                    )}
                  </div>
                )}
                {item.debug.warnings && item.debug.warnings.length > 0 && (
                  <div className="text-yellow-600 dark:text-yellow-400" data-testid={`line-item-warnings-${index}`}>
                    <p>Warnings:</p>
                    <ul className="pl-4 list-disc">
                      {item.debug.warnings.map((w, wi) => (
                        <li key={wi}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
