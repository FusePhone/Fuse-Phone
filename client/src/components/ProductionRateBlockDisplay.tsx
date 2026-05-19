import type { ProductionRateBlock, AreaCalcResult, DisplayToggles, MaterialCostEntry, MaterialGroupCalcResult, SurfaceCalcResult, SectionType } from "@shared/schema";
import { ChevronDown, ChevronUp, ChevronRight, ChevronLeft, Clock, Package, X, Pencil } from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { getMaterialIcon } from "@/lib/materialIcons";
import { renderAnnotation, type Annotation } from "./PhotoEditor";
import { useToast } from "@/hooks/use-toast";

function pluralizeLabel(label: string, count: number): string {
  if (count === 1) return label;
  if (label === "pass") return "passes";
  return label + "s";
}

interface ProductionRateBlockDisplayProps {
  block: ProductionRateBlock;
  compact?: boolean;
  brandColor?: string | null;
  excludedSurfaces?: string[];
  onToggleSurface?: (surfaceId: string) => void;
  noCard?: boolean;
  acceptedOptionalAreas?: string[];
  onToggleOptionalArea?: (areaId: string) => void;
  contractorHiddenAreas?: string[];
  onToggleContractorArea?: (areaId: string) => void;
  isCustomerView?: boolean;
  onEditBlock?: (blockId: string) => void;
  onEditArea?: (blockId: string, roomId: string) => void;
}

function formatDollars(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export function makeSurfaceId(blockId: string, roomId: string, surfaceKey: string): string {
  return `${blockId}:${roomId}:${surfaceKey}`;
}

/**
 * Compute the raw square footage for an area row, used by the opt-in
 * "Show Total Square Footage" display. Falls back to the room footprint
 * (length × width) for most section types; exterior rows use length ×
 * ceilingHeight (wall area). Cabinet sections (incl. refacing) use
 * length × width — refacing is sqft-priced even though some line-item
 * cabinet rates are linear-foot, so we surface the room footprint here.
 * The result is intentionally NOT multiplied by paint coats — this is the
 * customer-facing area in square feet (e.g. flooring, ceiling, decking,
 * cabinet refacing).
 */
export function getAreaSqft(area: AreaCalcResult, sectionType?: SectionType): number {
  if (sectionType === 'exterior') {
    const sqft = (area.length || 0) * (area.ceilingHeight || 0);
    return sqft > 0 ? sqft : 0;
  }
  const sqft = (area.length || 0) * (area.width || 0);
  return sqft > 0 ? sqft : 0;
}

export function formatSqft(sqft: number): string {
  return `${Math.round(sqft).toLocaleString()} sq ft`;
}

export interface BlockSqftSummary {
  includedSqft: number;
  optionalSqft: number;
  rooms: Array<{ name: string; sqft: number; isOptional: boolean; isAccepted: boolean }>;
}

/**
 * Roll up area square footage for a single rate block, applying the same
 * visibility rules the customer view uses:
 *   - Contractor-hidden rooms are skipped when isCustomerView is true.
 *   - Rooms whose every surface is excluded are skipped (treated as removed).
 *   - Optional rooms that haven't been accepted are split into the
 *     `optionalSqft` bucket so the display can show "+X sq ft if added".
 * Internal views see everything.
 */
export function calcBlockSqftSummary(
  block: ProductionRateBlock,
  opts: {
    isCustomerView?: boolean;
    excludedSurfaces?: string[];
    contractorHiddenAreas?: string[];
    acceptedOptionalAreas?: string[];
  } = {}
): BlockSqftSummary {
  const data = block.roomBuilderData;
  const areas = data.areaResults || [];
  const rooms = data.rooms || [];
  const excluded = opts.excludedSurfaces || [];
  const hidden = opts.contractorHiddenAreas || [];
  const accepted = opts.acceptedOptionalAreas || [];

  let includedSqft = 0;
  let optionalSqft = 0;
  const out: BlockSqftSummary['rooms'] = [];

  for (const area of areas) {
    const room = rooms.find((r: any) => r.id === area.roomId);
    const sectionType = (room as any)?.sectionType as SectionType | undefined;
    const sqft = getAreaSqft(area, sectionType);
    if (sqft <= 0) continue;

    const areaId = `${block.id}:area:${area.roomId}`;
    if (opts.isCustomerView && hidden.includes(areaId)) continue;

    // Customer-only: drop rooms whose surfaces are all excluded. Internal
    // view keeps them so the contractor sees the full project footprint.
    if (opts.isCustomerView && area.surfaces.length > 0) {
      const allExcluded = area.surfaces.every(s =>
        excluded.includes(makeSurfaceId(block.id, area.roomId, s.surfaceKey))
      );
      if (allExcluded) continue;
    }

    const isOptional = !!(area.isOptional || (room as any)?.isOptional);
    const isAccepted = isOptional ? accepted.includes(areaId) : true;

    if (isOptional && !isAccepted) {
      optionalSqft += sqft;
    } else {
      includedSqft += sqft;
    }
    out.push({ name: area.roomName || 'Area', sqft, isOptional, isAccepted });
  }

  return { includedSqft, optionalSqft, rooms: out };
}

/**
 * Document-header roll-up shown above the proposal body. Aggregates square
 * footage across every block whose `showProjectTotalSqft` toggle is on.
 * Single block: one-line summary. Multiple blocks: per-block breakdown
 * grouped by block name (so flooring + ceilings stay readable).
 * Renders nothing when no blocks opt in or all totals are zero.
 */
export function DocumentSqftSummary({
  blocks,
  isCustomerView,
  excludedSurfaces,
  contractorHiddenAreas,
  acceptedOptionalAreas,
  className,
  testId,
}: {
  blocks: ProductionRateBlock[] | undefined;
  isCustomerView?: boolean;
  excludedSurfaces?: string[];
  contractorHiddenAreas?: string[];
  acceptedOptionalAreas?: string[];
  className?: string;
  testId?: string;
}) {
  if (!blocks || blocks.length === 0) return null;
  const enabled = blocks.filter(b => b.roomBuilderData?.displayToggles?.showProjectTotalSqft);
  if (enabled.length === 0) return null;

  const summaries = enabled.map(b => ({
    name: b.name,
    summary: calcBlockSqftSummary(b, { isCustomerView, excludedSurfaces, contractorHiddenAreas, acceptedOptionalAreas }),
  })).filter(s => s.summary.includedSqft > 0 || s.summary.optionalSqft > 0);

  if (summaries.length === 0) return null;

  const totalIncluded = summaries.reduce((s, x) => s + x.summary.includedSqft, 0);
  const totalOptional = summaries.reduce((s, x) => s + x.summary.optionalSqft, 0);

  if (summaries.length === 1) {
    return (
      <div className={className} data-testid={testId || 'doc-sqft-summary'}>
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Area Square Footage:</span>{' '}
        <span className="text-sm font-semibold tabular-nums">{formatSqft(totalIncluded)}</span>
        {totalOptional > 0 && (
          <span className="text-xs text-muted-foreground ml-2">+{formatSqft(totalOptional)} if add-ons accepted</span>
        )}
      </div>
    );
  }

  return (
    <div className={className} data-testid={testId || 'doc-sqft-summary'}>
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Area Square Footage</div>
      <div className="space-y-0.5">
        {summaries.map((s, i) => (
          <div key={i} className="text-sm tabular-nums" data-testid={`doc-sqft-row-${i}`}>
            <span className="font-medium">{s.name}:</span>{' '}
            <span className="font-semibold">{formatSqft(s.summary.includedSqft)}</span>
            {s.summary.optionalSqft > 0 && (
              <span className="text-xs text-muted-foreground ml-1">+{formatSqft(s.summary.optionalSqft)} if add-ons accepted</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function calcExcludedTotals(block: ProductionRateBlock, excludedSurfaces: string[]): { laborHours: number; laborCost: number; materialCost: number; grandTotal: number } {
  const data = block.roomBuilderData;
  const areas = data.areaResults || [];
  const rooms = data.rooms || [];
  const isCustomerProvidingMaterials = !!data.customerProvidingMaterials;
  let excludedLaborHours = 0;
  let excludedLaborCost = 0;
  let excludedMaterialCost = 0;
  let excludedGrandTotal = 0;

  for (const area of areas) {
    const room = rooms.find((r: any) => r.id === area.roomId);
    const override = (room as any)?.priceOverride;
    const hasOverride = override != null && override > 0;

    // When a section has a fixed-price override, individual surface exclusions
    // are ignored. The override IS the total, and customers can't deduct from it
    // by toggling surfaces (the UI also disables those checkboxes).
    if (hasOverride) {
      continue;
    }

    let areaExclLaborHours = 0;
    let areaExclLaborCost = 0;
    let areaExclMaterialCost = 0;

    for (const surf of area.surfaces) {
      const id = makeSurfaceId(block.id, area.roomId, surf.surfaceKey);
      if (excludedSurfaces.includes(id)) {
        areaExclLaborHours += surf.laborHours;
        areaExclLaborCost += surf.price;
        if (!isCustomerProvidingMaterials) {
          if (!surf.inMaterialGroup && surf.materialTotalCost) areaExclMaterialCost += surf.materialTotalCost;
          if (surf.primerMaterialTotalCost) areaExclMaterialCost += surf.primerMaterialTotalCost;
        }
        if (surf.repairPrice) areaExclLaborCost += surf.repairPrice;
      }
    }

    excludedLaborHours += areaExclLaborHours;
    excludedLaborCost += areaExclLaborCost;
    excludedMaterialCost += areaExclMaterialCost;
    excludedGrandTotal += areaExclLaborCost + areaExclMaterialCost;
  }

  return {
    laborHours: excludedLaborHours,
    laborCost: excludedLaborCost,
    materialCost: excludedMaterialCost,
    grandTotal: excludedGrandTotal,
  };
}

function getSurfaceTotal(surface: SurfaceCalcResult, customerProvidingMaterials?: boolean): number {
  let total = surface.price;
  if (!customerProvidingMaterials) {
    if (!surface.inMaterialGroup && surface.materialTotalCost) total += surface.materialTotalCost;
    if (surface.primerMaterialTotalCost) total += surface.primerMaterialTotalCost;
  }
  if (surface.repairPrice) total += surface.repairPrice;
  return total;
}

function CollapsibleSurfaceRow({ surface, toggles, isLast, isExcluded, onToggle, customerProvidingMaterials, sectionHasOverride, sectionName }: {
  surface: SurfaceCalcResult;
  toggles: DisplayToggles;
  isLast?: boolean;
  isExcluded?: boolean;
  onToggle?: () => void;
  customerProvidingMaterials?: boolean;
  sectionHasOverride?: boolean;
  sectionName?: string;
}) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(true);
  const showLabor = toggles.showLaborHrs || toggles.showLaborPrice;
  const showMat = !customerProvidingMaterials && (toggles.showMaterials ?? true) && (toggles.showMaterialQty || toggles.showMaterialPrice);
  const usePaint = (surface as any).usePaint !== false;
  const hasMaterial = usePaint && !!surface.materialName;
  const hasPrimer = !!(surface.primerCoats && surface.primerCoats > 0) || !!surface.primerMaterialName || !!(surface.primerLaborHours && surface.primerLaborHours > 0);
  const hasRepair = !!(surface.repairHours && surface.repairHours > 0);
  const hasExpandableContent = true;
  const surfaceTotal = getSurfaceTotal(surface, customerProvidingMaterials);

  return (
    <div data-testid={`surface-row-${surface.surfaceKey}`} className={isExcluded ? 'opacity-50' : ''}>
      <div className="py-1.5 pl-4">
        <div className="w-full flex items-start justify-between gap-2">
          {onToggle && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (sectionHasOverride) {
                  toast({
                    title: "Section total is set to a fixed price",
                    description: `${sectionName || 'This section'} has a custom total, so individual surfaces can't be removed here. Edit or remove the surface from the section instead.`,
                  });
                  return;
                }
                onToggle();
              }}
              className={`mt-0.5 shrink-0 pointer-events-auto ${sectionHasOverride ? 'cursor-not-allowed' : ''}`}
              data-testid={`toggle-surface-${surface.surfaceKey}`}
              title={sectionHasOverride ? "Section total is set to a fixed price — surfaces can't be toggled here" : undefined}
            >
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                sectionHasOverride
                  ? 'border-muted-foreground/30 bg-muted/40'
                  : isExcluded
                    ? 'border-muted-foreground/40 bg-transparent'
                    : 'border-primary bg-primary'
              }`}>
                {!isExcluded && !sectionHasOverride && (
                  <svg className="w-3 h-3 text-primary-foreground" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M2 6l3 3 5-5" />
                  </svg>
                )}
              </div>
            </button>
          )}
          <button
            type="button"
            className="flex-1 flex items-start justify-between gap-2 pr-3 text-left min-w-0"
            onClick={(e) => { e.stopPropagation(); hasExpandableContent && setExpanded(!expanded); }}
            data-testid={`button-toggle-surface-${surface.surfaceKey}`}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <ChevronRight className={`w-3 h-3 shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-90' : ''}`} />
                <span className={`text-sm font-medium text-foreground ${isExcluded ? 'line-through' : ''}`}>
                  {surface.surfaceName}
                  {surface.unit === 'each' && surface.quantity > 1 ? ` ×${surface.quantity}` : ''}
                </span>
                {toggles.showSurfaceDetails && surface.unit !== 'each' && (
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {surface.unit === 'lf'
                      ? `${surface.quantity.toLocaleString()} lf`
                      : surface.paintableSqft > 0
                        ? `${surface.paintableSqft.toFixed(0)} sqft`
                        : `${surface.quantity.toLocaleString()} ${surface.unit}`
                    }
                  </span>
                )}
              </div>
            </div>

            {(toggles.showLaborHrs || toggles.showSurfaceTotal) && (
            <div className="flex items-center shrink-0 text-xs tabular-nums text-muted-foreground pt-0.5">
              {toggles.showLaborHrs && (
                <span className="flex items-center gap-0.5 mr-3">
                  <Clock className="w-3 h-3" />
                  {surface.laborHours.toFixed(1)}h
                </span>
              )}
              <span className={`font-medium text-right ${isExcluded ? 'line-through' : ''}`} style={{ width: '75px' }}>
                {toggles.showSurfaceTotal ? formatDollars(surfaceTotal) : ''}
              </span>
            </div>
            )}
          </button>
        </div>

        {expanded && !isExcluded && (
          <div className="pl-5 pr-3 mt-0.5 space-y-0.5 ml-1.5">
            {surface.description && (
              <p className="text-[11px] text-muted-foreground italic leading-snug line-clamp-3">
                {surface.description}
              </p>
            )}
            {usePaint && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-1 h-1 rounded-full bg-muted-foreground/50 shrink-0" />
              {surface.coats} {pluralizeLabel((surface as any).coatsLabel || 'coat', surface.coats)} of paint
            </div>
            )}
            {hasMaterial && (() => {
              const MatIcon = getMaterialIcon(surface.materialType);
              return (
              <div className="text-[11px] text-muted-foreground flex items-center gap-1 flex-wrap ml-3.5">
                <span><MatIcon className="w-2.5 h-2.5 inline mr-1" />{surface.materialName}</span>
              </div>
              );
            })()}
            {hasPrimer && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="w-1 h-1 rounded-full bg-muted-foreground/50 shrink-0" />
                {(surface.primerCoats || 1)} {pluralizeLabel((surface as any).coatsLabel || 'coat', (surface.primerCoats || 1))} of primer
              </div>
            )}
            {surface.primerMaterialName && (() => {
              const PrimerIcon = getMaterialIcon(surface.primerMaterialType);
              return (
              <div className="text-[11px] text-muted-foreground flex items-center gap-1 flex-wrap ml-3.5">
                <span><PrimerIcon className="w-2.5 h-2.5 inline mr-1" />{surface.primerMaterialName}</span>
              </div>
              );
            })()}
            {hasRepair && (
              <div className="flex items-center justify-between gap-1.5 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-muted-foreground/50 shrink-0" />
                  <span>Repair</span>
                </div>
                <div className="flex items-center tabular-nums">
                  {toggles.showLaborHrs && surface.repairHours && surface.repairHours > 0 && (
                    <span className="flex items-center gap-0.5 mr-3">
                      <Clock className="w-3 h-3" />
                      {surface.repairHours.toFixed(1)}h
                    </span>
                  )}
                  <span className="text-right" style={{ width: '75px' }}>
                    {toggles.showRepairPrice && surface.repairPrice && surface.repairPrice > 0
                      ? formatDollars(surface.repairPrice)
                      : ''
                    }
                  </span>
                </div>
              </div>
            )}
            {hasRepair && surface.repairDescription && (
              <p className="text-[11px] text-muted-foreground italic leading-snug line-clamp-3 ml-3.5">
                {surface.repairDescription}
              </p>
            )}

            <div className="mt-1 space-y-1 text-xs text-muted-foreground">
              {hasMaterial && surface.inMaterialGroup && surface.materialGroupName && (
                <div className="flex items-center justify-between gap-2 pl-2">
                  <span>Shared Paint</span>
                  <span className="text-primary/80">{surface.materialGroupName}</span>
                </div>
              )}
              {hasMaterial && !surface.inMaterialGroup && showMat && (
                <>
                  {toggles.showMaterialPrice && surface.materialTotalCost != null && (
                    <div className="flex items-center justify-between gap-2 pl-2">
                      <span>Paint{toggles.showMaterialQty && surface.materialQtyExact != null ? ` ${surface.materialQtyExact.toFixed(2)} ${surface.materialUnit || 'gal'}` : ''}{toggles.showMaterialQty && surface.materialQtyBuy != null ? ` (Buy ${surface.materialQtyBuy})` : ''}</span>
                      <span className="tabular-nums text-right" style={{ width: '75px', flexShrink: 0 }}>{formatDollars(surface.materialTotalCost)}</span>
                    </div>
                  )}
                  {toggles.showMaterialQty && !toggles.showMaterialPrice && surface.materialQtyExact != null && (
                    <div className="pl-2">
                      <span>Paint {surface.materialQtyExact.toFixed(2)} {surface.materialUnit || 'gal'}{surface.materialQtyBuy != null ? ` (Buy ${surface.materialQtyBuy})` : ''}</span>
                    </div>
                  )}
                </>
              )}
              {surface.primerMaterialName && showMat && (
                <>
                  {toggles.showMaterialPrice && surface.primerMaterialTotalCost != null && (
                    <div className="flex items-center justify-between gap-2 pl-2">
                      <span>Primer{toggles.showMaterialQty && surface.primerMaterialQtyExact != null ? ` ${surface.primerMaterialQtyExact.toFixed(2)} ${surface.primerMaterialUnit || 'gal'}` : ''}{toggles.showMaterialQty && surface.primerMaterialQtyBuy != null ? ` (Buy ${surface.primerMaterialQtyBuy})` : ''}</span>
                      <span className="tabular-nums text-right" style={{ width: '75px', flexShrink: 0 }}>{formatDollars(surface.primerMaterialTotalCost)}</span>
                    </div>
                  )}
                  {toggles.showMaterialQty && !toggles.showMaterialPrice && surface.primerMaterialQtyExact != null && (
                    <div className="pl-2">
                      <span>Primer {surface.primerMaterialQtyExact.toFixed(2)} {surface.primerMaterialUnit || 'gal'}{surface.primerMaterialQtyBuy != null ? ` (Buy ${surface.primerMaterialQtyBuy})` : ''}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
      {!isLast && (
        <hr className="border-foreground mx-4" />
      )}
    </div>
  );
}

function MaterialsSummarySection({ groups, totalCost, toggles, brandColor }: {
  groups: MaterialGroupCalcResult[];
  totalCost: number;
  toggles: DisplayToggles;
  brandColor?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const borderStyle = brandColor ? { borderColor: brandColor } : {};

  if ((toggles.showMaterials ?? true) === false) return null;

  return (
    <div className="mt-3" data-testid="materials-summary-section">
      <hr className="border-foreground" style={{ borderTopWidth: '3px', ...(brandColor ? { borderColor: brandColor } : {}) }} />
      <div className="mt-2">
        <button
          type="button"
          className="w-full flex items-center justify-between gap-2 text-left px-3 py-2 rounded-md border-[2px] border-foreground"
          style={borderStyle}
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          data-testid="button-toggle-materials-summary"
        >
          <div className="flex items-center gap-1.5">
            {expanded
              ? <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
              : <ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
            }
            <span className="text-sm font-semibold">Materials</span>
          </div>
          {toggles.showMaterialPrice && (
            <span className="text-sm font-semibold tabular-nums">{formatDollars(totalCost)}</span>
          )}
        </button>

        {expanded && (
          <div className="px-3 pb-2 space-y-2 mt-1">
            {groups.map((group, gi) => {
              // Show net cost so the sum of per-group rows reconciles with the
              // Materials section header total (which is also net of overrides).
              const grpExcl = group.excludedCost ?? 0;
              const grpNet = group.totalCost - grpExcl;
              const grpFullyExcluded = grpExcl >= group.totalCost - 0.005;
              return (
              <div key={group.groupId} data-testid={`material-group-${group.groupId}`}>
                {gi > 0 && <hr className="border-foreground/20 my-1" />}
                <div className="py-1 pl-4 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate">{group.groupName}</span>
                    {toggles.showMaterialPrice && (
                      <span className="text-xs tabular-nums text-muted-foreground shrink-0">
                        {grpFullyExcluded ? '(in room price)' : formatDollars(grpNet)}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 space-y-0.5">
                    <div>{group.materialName} ({group.materialUnit})</div>
                    <div>Surfaces: {group.surfaces.map(s => s.surfaceName).join(', ')}</div>
                    {toggles.showMaterialQty && (
                      <div>
                        {group.totalSqft.toFixed(0)} sqft — Buy {group.qtyToBuy} {group.materialUnit}
                        {group.exactQtyNeeded != null && ` (need ${group.exactQtyNeeded.toFixed(2)})`}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>
      <hr className="border-foreground mt-2" style={{ borderTopWidth: '3px', ...(brandColor ? { borderColor: brandColor } : {}) }} />
    </div>
  );
}

interface AreaPhoto {
  url: string;
  timestamp?: string;
  showOnProposal?: boolean;
  annotations?: any[] | null;
}

function AnnotatedAreaImg({ src, annotations, alt, className, style, imgStyle }: { src: string; annotations?: any[] | null; alt: string; className?: string; style?: React.CSSProperties; imgStyle?: React.CSSProperties }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const annots = (annotations as Annotation[] | null) || [];
  const hasAnnotations = annots.length > 0;

  useEffect(() => { setImgLoaded(false); }, [src]);

  useEffect(() => {
    if (!imgLoaded || !hasAnnotations) return;
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const displayW = img.clientWidth;
    const displayH = img.clientHeight;
    if (displayW === 0 || displayH === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = displayW * dpr;
    canvas.height = displayH * dpr;
    canvas.style.width = displayW + "px";
    canvas.style.height = displayH + "px";
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const sx = displayW / img.naturalWidth;
    const sy = displayH / img.naturalHeight;
    const scale = Math.min(sx, sy);
    const drawW = img.naturalWidth * scale;
    const drawH = img.naturalHeight * scale;
    const offsetX = (displayW - drawW) / 2;
    const offsetY = (displayH - drawH) / 2;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offsetX, dpr * offsetY);
    for (const ann of annots) {
      try { renderAnnotation(ctx, ann); } catch (_e) {}
    }
  }, [imgLoaded, annotations]);

  return (
    <div className={className} style={style}>
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        className="max-w-full max-h-full object-contain select-none"
        draggable={false}
        onLoad={() => setImgLoaded(true)}
        style={imgStyle}
      />
      {hasAnnotations && imgLoaded && (
        <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />
      )}
    </div>
  );
}

function AreaPhotoThumb({ photos, areaName, brandColor }: { photos: AreaPhoto[]; areaName: string; brandColor?: string | null }) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIdx, setViewerIdx] = useState(0);
  const [dragY, setDragY] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [slideDir, setSlideDir] = useState<'left' | 'right' | null>(null);
  const touchRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const prevent = (e: TouchEvent) => e.preventDefault();
    node.addEventListener('touchmove', prevent, { passive: false });
    return () => node.removeEventListener('touchmove', prevent);
  }, []);
  const startRef = { x: 0, y: 0, time: 0 };
  const startRefObj = useCallback(() => startRef, []);

  const openViewer = useCallback(() => {
    setViewerIdx(0);
    setViewerOpen(true);
    document.body.style.overflow = 'hidden';
  }, []);

  const closeViewer = useCallback(() => {
    setViewerOpen(false);
    setDragY(0);
    setDragX(0);
    document.body.style.overflow = '';
  }, []);

  const goNext = useCallback(() => {
    if (viewerIdx >= photos.length - 1) return;
    setSlideDir('left');
    setTimeout(() => {
      setViewerIdx(i => Math.min(i + 1, photos.length - 1));
      setSlideDir(null);
    }, 150);
  }, [photos.length, viewerIdx]);

  const goPrev = useCallback(() => {
    if (viewerIdx <= 0) return;
    setSlideDir('right');
    setTimeout(() => {
      setViewerIdx(i => Math.max(i - 1, 0));
      setSlideDir(null);
    }, 150);
  }, [viewerIdx]);

  useEffect(() => {
    if (!viewerOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeViewer();
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
    };
    window.addEventListener('keydown', handler);
    return () => { window.removeEventListener('keydown', handler); };
  }, [viewerOpen, closeViewer, goNext, goPrev]);

  useEffect(() => {
    return () => { document.body.style.overflow = ''; };
  }, []);

  if (photos.length === 0) return null;

  const dismissProgress = Math.min(Math.abs(dragY) / 200, 1);
  const bgOpacity = 0.75 * (1 - dismissProgress * 0.6);
  const imgScale = 1 - dismissProgress * 0.15;

  return (
    <>
      <button
        type="button"
        className="relative shrink-0 rounded-[3px] overflow-visible active:scale-95 transition-transform"
        onClick={(e) => { e.stopPropagation(); openViewer(); }}
        data-testid={`area-photo-thumb-${areaName}`}
        style={{ width: '30px', height: '100%', margin: '-4px 0' }}
      >
        <AnnotatedAreaImg
          src={photos[0].url}
          annotations={photos[0].annotations}
          alt={`${areaName} photos`}
          className="relative w-full rounded-[3px] overflow-hidden"
          style={{ height: '30px' }}
          imgStyle={{ width: '100%', height: '30px', objectFit: 'cover' }}
        />
        {photos.length > 1 && (
          <span
            className="absolute -top-1.5 -right-2 min-w-[16px] h-[16px] flex items-center justify-center rounded-full text-[9px] font-bold leading-none px-1 shadow-sm bg-black text-white"
          >
            {photos.length}
          </span>
        )}
      </button>

      {viewerOpen && createPortal(
        <div
          ref={touchRef}
          className="fixed inset-0 z-[10001] flex flex-col touch-none"
          style={{
            backgroundColor: `rgba(0,0,0,${bgOpacity})`,
            backdropFilter: 'blur(2px)',
            transition: isDragging ? 'none' : 'background-color 0.25s ease',
          }}
          onClick={closeViewer}
          data-testid="area-photo-viewer"
        >
          <div
            className="flex items-center justify-between px-4 py-3 shrink-0"
            style={{
              opacity: 1 - dismissProgress,
              transition: isDragging ? 'none' : 'opacity 0.25s ease',
            }}
            onClick={e => e.stopPropagation()}
          >
            <span className="text-sm font-semibold text-white drop-shadow">
              {areaName} · {viewerIdx + 1}/{photos.length}
            </span>
            <button
              onClick={closeViewer}
              className="p-2 rounded-full bg-black/40 active:bg-black/60 text-white backdrop-blur-sm"
              data-testid="button-close-area-viewer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div
            className="flex-1 relative flex items-center justify-center overflow-hidden min-h-0 px-4"
            onClick={e => e.stopPropagation()}
            onTouchStart={e => {
              const ref = startRefObj();
              ref.x = e.touches[0].clientX;
              ref.y = e.touches[0].clientY;
              ref.time = Date.now();
              setIsDragging(true);
            }}
            onTouchMove={e => {
              const ref = startRefObj();
              const dx = e.touches[0].clientX - ref.x;
              const dy = e.touches[0].clientY - ref.y;
              if (Math.abs(dy) > Math.abs(dx)) {
                setDragY(dy);
                setDragX(0);
              } else {
                setDragX(dx);
                setDragY(0);
              }
            }}
            onTouchEnd={() => {
              setIsDragging(false);
              if (Math.abs(dragY) > 120) {
                closeViewer();
                return;
              }
              if (Math.abs(dragX) > 50) {
                if (dragX < 0) goNext();
                else goPrev();
              }
              setDragY(0);
              setDragX(0);
            }}
          >
            <AnnotatedAreaImg
              src={photos[viewerIdx]?.url}
              annotations={photos[viewerIdx]?.annotations}
              alt={`${areaName} photo ${viewerIdx + 1}`}
              className="relative max-w-full max-h-full flex items-center justify-center rounded-lg shadow-2xl overflow-hidden"
              style={{
                transform: `translateY(${dragY}px) translateX(${dragX}px) scale(${imgScale})${slideDir === 'left' ? ' translateX(-100%)' : slideDir === 'right' ? ' translateX(100%)' : ''}`,
                opacity: slideDir ? 0 : 1,
                transition: isDragging ? 'none' : 'transform 0.25s ease, opacity 0.15s ease',
              }}
            />

            {photos.length > 1 && viewerIdx > 0 && (
              <button
                onClick={goPrev}
                className="absolute left-3 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center rounded-full bg-white hover:bg-white active:bg-gray-100 text-gray-900 shadow-[0_4px_16px_rgba(0,0,0,0.35)] ring-1 ring-black/10 transition-transform active:scale-95"
                style={{ opacity: 1 - dismissProgress, transition: isDragging ? 'none' : 'opacity 0.25s ease, transform 0.15s ease' }}
                data-testid="button-area-viewer-prev"
                aria-label="Previous photo"
              >
                <ChevronLeft className="w-7 h-7" strokeWidth={2.5} />
              </button>
            )}
            {photos.length > 1 && viewerIdx < photos.length - 1 && (
              <button
                onClick={goNext}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center rounded-full bg-white hover:bg-white active:bg-gray-100 text-gray-900 shadow-[0_4px_16px_rgba(0,0,0,0.35)] ring-1 ring-black/10 transition-transform active:scale-95"
                style={{ opacity: 1 - dismissProgress, transition: isDragging ? 'none' : 'opacity 0.25s ease, transform 0.15s ease' }}
                data-testid="button-area-viewer-next"
                aria-label="Next photo"
              >
                <ChevronRight className="w-7 h-7" strokeWidth={2.5} />
              </button>
            )}
          </div>

          <div
            className="flex justify-center gap-1.5 py-3 shrink-0"
            style={{
              opacity: 1 - dismissProgress,
              transition: isDragging ? 'none' : 'opacity 0.25s ease',
            }}
            onClick={e => e.stopPropagation()}
          >
            {photos.length <= 12 && photos.map((_, i) => (
              <button
                key={i}
                onClick={() => setViewerIdx(i)}
                className={`rounded-full transition-all ${i === viewerIdx ? 'w-5 h-2 bg-white' : 'w-2 h-2 bg-white/40'}`}
                data-testid={`area-viewer-dot-${i}`}
              />
            ))}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

function AreaSection({ area, toggles, brandColor, blockId, excludedSurfaces, onToggleSurface, customerProvidingMaterials, isOptionalArea, isOptionalAccepted, onToggleOptionalArea, isContractorHidden, onToggleContractorArea, priceOverride, isCustomerView, photos, onEdit, sectionType }: {
  area: AreaCalcResult;
  toggles: DisplayToggles;
  brandColor?: string | null;
  blockId?: string;
  excludedSurfaces?: string[];
  onToggleSurface?: (surfaceId: string) => void;
  customerProvidingMaterials?: boolean;
  isOptionalArea?: boolean;
  isOptionalAccepted?: boolean;
  onToggleOptionalArea?: () => void;
  isContractorHidden?: boolean;
  onToggleContractorArea?: () => void;
  priceOverride?: number | null;
  isCustomerView?: boolean;
  photos?: AreaPhoto[];
  onEdit?: () => void;
  sectionType?: SectionType;
}) {
  const [areaExpanded, setAreaExpanded] = useState(true);

  useEffect(() => {
    if (isContractorHidden) setAreaExpanded(false);
  }, [isContractorHidden]);

  const showLaborInfo = toggles.showLaborHrs || toggles.showLaborPrice;
  const textClass = brandColor ? 'text-white' : 'text-background';
  const textDimClass = brandColor ? 'text-white/70' : 'text-background/70';
  const textMedClass = brandColor ? 'text-white/80' : 'text-background/80';

  // Override price ALWAYS applies to the area total when set — the toggle below
  // (showOverrideTotal) only controls whether the bottom subtotal/cost-breakdown row is shown.
  // This prevents the discrepancy where hiding the toggle would leave the area showing
  // the un-overridden calculated price (e.g. $5000 instead of the $4500 override).
  const hasOverride = priceOverride != null && priceOverride > 0;

  let effectiveLaborHours = area.totalLaborHours;
  let effectivePrice = area.totalPrice;
  let effectiveAreaTotal = 0;
  for (const surf of area.surfaces) {
    const id = blockId ? makeSurfaceId(blockId, area.roomId, surf.surfaceKey) : undefined;
    const isExcl = id && excludedSurfaces && excludedSurfaces.includes(id);
    if (isExcl) {
      effectiveLaborHours -= surf.laborHours;
      effectivePrice -= surf.price;
    } else {
      effectiveAreaTotal += getSurfaceTotal(surf, customerProvidingMaterials);
    }
  }

  if (hasOverride) {
    effectiveAreaTotal = priceOverride!;
  }

  const showInfo = showLaborInfo || hasOverride;

  return (
    <div className={`py-2 space-y-0 ${isOptionalArea && isOptionalAccepted ? 'bg-emerald-50 dark:bg-emerald-950/40 rounded-lg' : ''} ${isContractorHidden ? 'opacity-60' : ''}`} data-testid={`area-section-${area.roomId}`}>
      {isOptionalArea && onToggleOptionalArea && (
        <div
          className={`flex items-center justify-between px-3 py-1.5 cursor-pointer select-none ${isOptionalAccepted ? 'bg-emerald-100 dark:bg-emerald-900/50' : 'bg-emerald-50 dark:bg-emerald-950/40'} rounded-t-md mb-1`}
          onClick={(e) => { e.stopPropagation(); onToggleOptionalArea(); }}
          data-testid={`button-toggle-optional-area-${area.roomId}`}
        >
          <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Optional</span>
          <span className={`text-[10px] font-semibold ${isOptionalAccepted ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}`}>
            {isOptionalAccepted ? 'Tap to remove' : 'Select to include'}
          </span>
        </div>
      )}
      <div style={isOptionalArea && !isOptionalAccepted ? { opacity: 0.55 } : undefined} className="transition-opacity duration-300">
        <div className="flex items-center gap-1.5">
          {onToggleContractorArea && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleContractorArea(); }}
              className={`shrink-0 w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${
                isContractorHidden
                  ? 'border-muted-foreground/40 bg-transparent'
                  : 'border-primary bg-primary'
              }`}
              data-testid={`toggle-contractor-area-${area.roomId}`}
              title={isContractorHidden ? 'Hidden from customer — tap to show' : 'Visible to customer — tap to hide'}
            >
              {!isContractorHidden && (
                <svg className="w-3.5 h-3.5 text-primary-foreground" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 6l3 3 5-5" /></svg>
              )}
            </button>
          )}
        <button
          type="button"
          className={`flex-1 flex items-center justify-between gap-2 px-3 py-2 rounded-md text-left ${!brandColor ? 'bg-foreground/90 dark:bg-foreground/85' : ''}`}
          style={brandColor ? { backgroundColor: brandColor } : undefined}
          onClick={(e) => { e.stopPropagation(); setAreaExpanded(!areaExpanded); }}
          data-testid={`button-toggle-area-${area.roomId}`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {areaExpanded
              ? <ChevronDown className={`w-3.5 h-3.5 shrink-0 ${textDimClass}`} />
              : <ChevronRight className={`w-3.5 h-3.5 shrink-0 ${textDimClass}`} />
            }
            {photos && photos.length > 0 && (
              <AreaPhotoThumb photos={photos} areaName={area.roomName} brandColor={brandColor} />
            )}
            <span className={`text-sm font-semibold ${textClass}`}>{area.roomName}</span>
            {toggles.showSurfaceDetails && (
              <span className={`text-xs ${textDimClass} hidden sm:inline`}>
                {area.length}&#8242; &times; {area.width}&#8242; &times; {area.ceilingHeight}&#8242;
              </span>
            )}
          </div>
          {(toggles.showLaborHrs || toggles.showLaborPrice || hasOverride || toggles.showProjectTotalSqft) && (
            <div className={`flex items-center text-xs tabular-nums ${textMedClass} shrink-0`}>
              {toggles.showLaborHrs && !hasOverride && (
                <span className="mr-3">{isContractorHidden ? '0.0' : effectiveLaborHours.toFixed(1)} hrs</span>
              )}
              {toggles.showProjectTotalSqft && (() => {
                const areaSqft = getAreaSqft(area, sectionType);
                if (areaSqft <= 0) return null;
                return (
                  <span className={`mr-3 font-medium ${textDimClass}`} data-testid={`area-sqft-${area.roomId}`}>
                    {formatSqft(areaSqft)}
                  </span>
                );
              })()}
              <span className={`font-semibold text-right ${textClass}`} style={{ width: '75px' }}>
                {(toggles.showLaborPrice || hasOverride)
                  ? (isContractorHidden ? '$0.00' : formatDollars(hasOverride ? priceOverride! : effectiveAreaTotal))
                  : ''
                }
              </span>
            </div>
          )}
        </button>
        {onEdit && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className={`shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-md transition-colors ${brandColor ? 'hover:bg-white/20 text-white' : 'hover:bg-foreground/10 text-background'}`}
            style={brandColor ? { backgroundColor: brandColor } : undefined}
            title="Edit this room"
            aria-label="Edit this room"
            data-testid={`button-edit-area-${area.roomId}`}
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
        </div>

        {isContractorHidden && (
          <div className="px-3 py-1.5 text-xs text-muted-foreground italic">
            <span className="text-red-500 font-semibold text-[9px] bg-red-50 px-1.5 py-0.5 rounded-full mr-1.5">Hidden</span>
            This area is hidden from the customer view
          </div>
        )}

        {areaExpanded && !isContractorHidden && (
          <>
            {area.scopeNotes && (
              <p className="text-xs text-muted-foreground italic px-3 pt-1.5 pb-0.5" data-testid={`scope-notes-${area.roomId}`}>
                {area.scopeNotes}
              </p>
            )}

            <div className="mt-1">
              {area.surfaces.map((surface, si) => {
                const surfId = blockId ? makeSurfaceId(blockId, area.roomId, surface.surfaceKey) : undefined;
                // When the section has a fixed-price override, treat all surfaces
                // as included visually — exclusions are ignored in the totals too.
                const isExcluded = !hasOverride && surfId && excludedSurfaces ? excludedSurfaces.includes(surfId) : false;
                return (
                  <CollapsibleSurfaceRow
                    key={si}
                    surface={surface}
                    toggles={toggles}
                    isLast={si === area.surfaces.length - 1}
                    isExcluded={isExcluded}
                    onToggle={onToggleSurface && surfId ? () => onToggleSurface(surfId) : undefined}
                    customerProvidingMaterials={customerProvidingMaterials}
                    sectionHasOverride={hasOverride}
                    sectionName={area.roomName}
                  />
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function calcOptionalAreaTotals(block: ProductionRateBlock, excludedAreas: string[]): { laborHours: number; laborCost: number; materialCost: number; grandTotal: number } {
  const data = block.roomBuilderData;
  const areas = data.areaResults || [];
  const rooms = data.rooms || [];
  const isCustomerProvidingMaterials = !!data.customerProvidingMaterials;
  let exclLaborHours = 0;
  let exclLaborCost = 0;
  let exclMaterialCost = 0;
  let exclGrandTotal = 0;

  for (const area of areas) {
    const areaId = `${block.id}:area:${area.roomId}`;
    if (!excludedAreas.includes(areaId)) continue;
    const room = rooms.find((r: any) => r.id === area.roomId);
    const override = (room as any)?.priceOverride;
    let areaLaborHours = 0;
    let areaLaborCost = 0;
    let areaMaterialCost = 0;
    for (const surf of area.surfaces) {
      areaLaborHours += surf.laborHours;
      areaLaborCost += surf.price;
      if (!isCustomerProvidingMaterials) {
        if (!surf.inMaterialGroup && surf.materialTotalCost) areaMaterialCost += surf.materialTotalCost;
        if (surf.primerMaterialTotalCost) areaMaterialCost += surf.primerMaterialTotalCost;
      }
      if (surf.repairPrice) areaLaborCost += surf.repairPrice;
    }
    exclLaborHours += areaLaborHours;
    exclLaborCost += areaLaborCost;
    exclMaterialCost += areaMaterialCost;
    if (override != null && override > 0) {
      exclGrandTotal += override;
    } else {
      exclGrandTotal += areaLaborCost + areaMaterialCost;
    }
  }

  return { laborHours: exclLaborHours, laborCost: exclLaborCost, materialCost: exclMaterialCost, grandTotal: exclGrandTotal };
}

export function calcContractorHiddenTotals(block: ProductionRateBlock, hiddenAreas: string[]): { laborHours: number; laborCost: number; materialCost: number; grandTotal: number; allAreasHidden: boolean } {
  const data = block.roomBuilderData;
  const areas = data.areaResults || [];
  if (areas.length === 0) return { laborHours: 0, laborCost: 0, materialCost: 0, grandTotal: 0, allAreasHidden: false };
  const rooms = data.rooms || [];
  const isCustomerProvidingMaterials = !!data.customerProvidingMaterials;
  let hiddenLaborHours = 0;
  let hiddenLaborCost = 0;
  let hiddenMaterialCost = 0;
  let hiddenGrandTotal = 0;
  let hiddenCount = 0;

  for (const area of areas) {
    const areaId = `${block.id}:area:${area.roomId}`;
    if (!hiddenAreas.includes(areaId)) continue;
    hiddenCount++;
    const room = rooms.find((r: any) => r.id === area.roomId);
    const override = (room as any)?.priceOverride;
    let areaLaborHours = 0;
    let areaLaborCost = 0;
    let areaMaterialCost = 0;
    for (const surf of area.surfaces) {
      areaLaborHours += surf.laborHours;
      areaLaborCost += surf.price;
      if (!isCustomerProvidingMaterials) {
        if (!surf.inMaterialGroup && surf.materialTotalCost) areaMaterialCost += surf.materialTotalCost;
        if (surf.primerMaterialTotalCost) areaMaterialCost += surf.primerMaterialTotalCost;
      }
      if (surf.repairPrice) areaLaborCost += surf.repairPrice;
    }
    hiddenLaborHours += areaLaborHours;
    hiddenLaborCost += areaLaborCost;
    hiddenMaterialCost += areaMaterialCost;
    if (override != null && override > 0) {
      hiddenGrandTotal += override;
    } else {
      hiddenGrandTotal += areaLaborCost + areaMaterialCost;
    }
  }

  const allAreasHidden = hiddenCount === areas.length;
  if (allAreasHidden) {
    return {
      laborHours: data.totalLaborHours || hiddenLaborHours,
      laborCost: data.totalLaborCost || hiddenLaborCost,
      materialCost: hiddenMaterialCost,
      grandTotal: data.grandTotal || hiddenGrandTotal,
      allAreasHidden: true
    };
  }

  return { laborHours: hiddenLaborHours, laborCost: hiddenLaborCost, materialCost: hiddenMaterialCost, grandTotal: hiddenGrandTotal, allAreasHidden: false };
}

export function filterExcludedForHiddenAreas(excludedSurfaces: string[], hiddenAreas: string[]): string[] {
  if (hiddenAreas.length === 0) return excludedSurfaces;
  return excludedSurfaces.filter(surfId => {
    const parts = surfId.split(':');
    if (parts.length >= 3) {
      const areaKey = `${parts[0]}:area:${parts[1]}`;
      if (hiddenAreas.includes(areaKey)) return false;
    }
    return true;
  });
}

function getAreaIsOptional(block: ProductionRateBlock, roomId: string): boolean {
  const area = block.roomBuilderData.areaResults?.find(a => a.roomId === roomId);
  if (area?.isOptional) return true;
  const room = block.roomBuilderData.rooms?.find((r: any) => r.id === roomId);
  return !!(room as any)?.isOptional;
}

export function ProductionRateBlockDisplay({ block, compact, brandColor, excludedSurfaces, onToggleSurface, noCard, acceptedOptionalAreas, onToggleOptionalArea, contractorHiddenAreas, onToggleContractorArea, isCustomerView, onEditBlock, onEditArea }: ProductionRateBlockDisplayProps) {
  const data = block.roomBuilderData;
  const toggles = data.displayToggles || {
    showLaborHrs: true,
    showLaborPrice: true,
    showMaterialQty: true,
    showMaterialPrice: true,
    showSurfaceDetails: true,
    showSurfaceTotal: false,
  };
  if (toggles.showSurfaceDetails === undefined) toggles.showSurfaceDetails = true;
  if (toggles.showSurfaceTotal === undefined) toggles.showSurfaceTotal = false;
  const areaResults = data.areaResults || [];
  const rooms = data.rooms || [];
  const hasAreaData = areaResults.length > 0;
  const showMaterialInfo = toggles.showMaterialQty || toggles.showMaterialPrice;

  const chAreas = contractorHiddenAreas || [];

  const excluded = excludedSurfaces || [];
  const filteredExcluded = filterExcludedForHiddenAreas(excluded, chAreas);
  const excl = filteredExcluded.length > 0 ? calcExcludedTotals(block, filteredExcluded) : { laborHours: 0, laborCost: 0, materialCost: 0, grandTotal: 0 };

  const unacceptedOptionalAreas = acceptedOptionalAreas ? areaResults
    .filter(a => getAreaIsOptional(block, a.roomId))
    .filter(a => {
      const areaId = `${block.id}:area:${a.roomId}`;
      return !acceptedOptionalAreas.includes(areaId);
    })
    .map(a => `${block.id}:area:${a.roomId}`) : [];
  const optAreaExcl = unacceptedOptionalAreas.length > 0 ? calcOptionalAreaTotals(block, unacceptedOptionalAreas) : { laborHours: 0, laborCost: 0, materialCost: 0, grandTotal: 0 };

  const contractorHiddenExcl = chAreas.length > 0 ? calcContractorHiddenTotals(block, chAreas) : { laborHours: 0, laborCost: 0, materialCost: 0, grandTotal: 0, allAreasHidden: false };

  const effectiveGrandTotal = contractorHiddenExcl.allAreasHidden ? 0 : data.grandTotal - excl.grandTotal - optAreaExcl.grandTotal - contractorHiddenExcl.grandTotal;
  const effectiveLaborHours = contractorHiddenExcl.allAreasHidden ? 0 : data.totalLaborHours - excl.laborHours - optAreaExcl.laborHours - contractorHiddenExcl.laborHours;
  const effectiveLaborCost = contractorHiddenExcl.allAreasHidden ? 0 : data.totalLaborCost - excl.laborCost - optAreaExcl.laborCost - contractorHiddenExcl.laborCost;

  const cardClass = noCard ? "pb-4" : "rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden p-4";

  if (!hasAreaData) {
    return (
      <div className={cardClass}>
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <p className="font-medium">{block.name}</p>
        </div>
        <div className="flex text-sm font-semibold text-muted-foreground bg-muted/50 rounded-t px-3 pt-2.5 pb-1.5">
          <span className="flex-1 text-center">Qty</span>
          <span className="flex-1 text-center">Price</span>
          <span className="flex-1 text-center">Total</span>
        </div>
        <div className="flex text-sm bg-muted/30 rounded-b px-3 pt-3 pb-2">
          <span className="flex-1 text-center">1</span>
          <span className="flex-1 text-center">{formatDollars(effectiveGrandTotal)}</span>
          <span className="flex-1 text-center font-medium">{formatDollars(effectiveGrandTotal)}</span>
        </div>
      </div>
    );
  }

  const materialGroupResults = data.materialGroupResults || [];
  const ungroupedMaterialCosts = data.materialCosts || [];
  // Use the saved totalMaterialCost as the source of truth — RoomBuilder already
  // computes it as ungrouped + paint groups + primer groups, all netted of any
  // contributions from overridden rooms. Recomputing here would (a) miss primer
  // groups and (b) drift from the editor / saved Materials line item / PDF.
  const totalMaterialCost = data.totalMaterialCost ?? 0;
  const effectiveMaterialCost = contractorHiddenExcl.allAreasHidden ? 0 : totalMaterialCost - excl.materialCost - contractorHiddenExcl.materialCost;
  const isCustomerProvidingMaterials = !!data.customerProvidingMaterials;

  const blockSqftSummary = toggles.showProjectTotalSqft
    ? calcBlockSqftSummary(block, {
        isCustomerView,
        excludedSurfaces: filteredExcluded,
        contractorHiddenAreas: chAreas,
        acceptedOptionalAreas,
      })
    : null;

  return (
    <div className={cardClass} data-testid={`production-block-${block.id}`}>
      <div className="flex items-center gap-1.5 mb-2">
        <div className="flex-1 flex items-center gap-2 min-w-0" data-testid={`block-header-${block.id}`}>
          <p className="font-medium text-left truncate">{block.name}</p>
          {isCustomerProvidingMaterials && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 shrink-0" data-testid="badge-customer-materials">
              <Package className="w-2.5 h-2.5" />
              Customer Materials
            </span>
          )}
        </div>
      </div>

      {blockSqftSummary && (blockSqftSummary.includedSqft > 0 || blockSqftSummary.optionalSqft > 0) && (
        <div className="mb-2 text-xs text-muted-foreground" data-testid={`block-sqft-${block.id}`}>
          <span className="font-semibold uppercase tracking-wider">Area Square Footage:</span>{' '}
          <span className="text-sm font-semibold tabular-nums text-foreground">{formatSqft(blockSqftSummary.includedSqft)}</span>
          {blockSqftSummary.optionalSqft > 0 && (
            <span className="ml-2">+{formatSqft(blockSqftSummary.optionalSqft)} if add-ons accepted</span>
          )}
        </div>
      )}

      <div>
        {areaResults.map((area, i) => {
            const areaOptional = getAreaIsOptional(block, area.roomId);
            const areaId = `${block.id}:area:${area.roomId}`;
            const areaAccepted = areaOptional ? (!acceptedOptionalAreas || acceptedOptionalAreas.includes(areaId)) : true;
            const isAreaHidden = chAreas.includes(areaId);
            if (isCustomerView && isAreaHidden) return null;
            const room = rooms.find((r: any) => r.id === area.roomId);
            const roomOverride = room?.priceOverride;
            const roomPhotos = ((room?.photos as AreaPhoto[]) || []).filter(
              (p: AreaPhoto) => p.url && (isCustomerView ? p.showOnProposal === true : true)
            );
            return (
              <div key={area.roomId || i}>
                {i > 0 && <hr className="border-border my-3" style={{ borderTopWidth: '3px' }} />}
                <AreaSection
                  area={area}
                  toggles={toggles}
                  brandColor={brandColor}
                  blockId={block.id}
                  excludedSurfaces={excluded}
                  onToggleSurface={onToggleSurface}
                  customerProvidingMaterials={isCustomerProvidingMaterials}
                  isOptionalArea={areaOptional}
                  isOptionalAccepted={areaAccepted}
                  onToggleOptionalArea={onToggleOptionalArea ? () => onToggleOptionalArea(areaId) : undefined}
                  isContractorHidden={isAreaHidden}
                  onToggleContractorArea={onToggleContractorArea ? () => onToggleContractorArea(areaId) : undefined}
                  priceOverride={roomOverride}
                  isCustomerView={isCustomerView}
                  photos={roomPhotos}
                  onEdit={onEditArea ? () => onEditArea(block.id, area.roomId) : undefined}
                  sectionType={(room as any)?.sectionType}
                />
              </div>
            );
          })}

          {materialGroupResults.length > 0 && showMaterialInfo && !isCustomerProvidingMaterials && (
            <MaterialsSummarySection groups={materialGroupResults} totalCost={effectiveMaterialCost} toggles={toggles} brandColor={brandColor} />
          )}

          {(toggles.showOverrideTotal !== false) && (
          <div className="border-t pt-2 mt-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              {(toggles.showCostBreakdown ?? true) && totalMaterialCost > 0 && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  Labor: {formatDollars(effectiveLaborCost)}{isCustomerProvidingMaterials ? '' : ` | Materials: ${formatDollars(effectiveMaterialCost)}`}
                </span>
              )}
              <span className="text-sm font-semibold tabular-nums ml-auto">
                Subtotal: {formatDollars(effectiveGrandTotal)}
              </span>
            </div>
          </div>
          )}
        </div>
    </div>
  );
}

export function ProductionRateBlocksSection({ blocks, brandColor, excludedSurfaces, onToggleSurface, noCard, acceptedOptionalAreas, onToggleOptionalArea, contractorHiddenAreas, onToggleContractorArea, isCustomerView, onEditBlock, onEditArea }: {
  blocks: ProductionRateBlock[];
  brandColor?: string | null;
  excludedSurfaces?: string[];
  onToggleSurface?: (surfaceId: string) => void;
  noCard?: boolean;
  acceptedOptionalAreas?: string[];
  onToggleOptionalArea?: (areaId: string) => void;
  contractorHiddenAreas?: string[];
  onToggleContractorArea?: (areaId: string) => void;
  isCustomerView?: boolean;
  onEditBlock?: (blockId: string) => void;
  onEditArea?: (blockId: string, roomId: string) => void;
}) {
  if (!blocks || blocks.length === 0) return null;

  return (
    <div className="space-y-4" data-testid="production-rate-blocks-section">
      {blocks.map((block) => (
        <ProductionRateBlockDisplay
          key={block.id}
          block={block}
          brandColor={brandColor}
          excludedSurfaces={excludedSurfaces}
          onToggleSurface={onToggleSurface}
          noCard={noCard}
          acceptedOptionalAreas={acceptedOptionalAreas}
          onToggleOptionalArea={onToggleOptionalArea}
          contractorHiddenAreas={contractorHiddenAreas}
          onToggleContractorArea={onToggleContractorArea}
          isCustomerView={isCustomerView}
          onEditBlock={onEditBlock}
          onEditArea={onEditArea}
        />
      ))}
    </div>
  );
}
