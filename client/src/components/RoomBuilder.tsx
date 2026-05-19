import { useState, useMemo, useRef, useCallback, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { useKeyboardOffset } from "@/hooks/use-keyboard-offset";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger, PopoverClose } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Minus, Calculator, Loader2, ChevronDown, ChevronUp, X, Save, GripVertical, Paintbrush, HelpCircle, Clock, DollarSign, Droplets, Tag, Ruler, Timer, Cpu, Zap, Layers, Wrench, Copy, Camera, ImageIcon, Trash2, Check, ChevronLeft, ChevronRight, Eye, EyeOff, FolderOpen, Pencil, BarChart3, AlertTriangle, Home, Fence, SquareDashed, Grid2x2, Settings } from "lucide-react";
import { compressImage as compressImageFile, compressBlob } from "@/lib/compress-image";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { CameraCapture } from "./CameraCapture";
import { ProjectPhotoPicker } from "./ProjectPhotoPicker";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { renderAnnotation, type Annotation } from "./PhotoEditor";
import { useSubscription } from "@/hooks/use-subscription";
import { cn } from "@/lib/utils";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { LineItem } from "./LineItemEditorModal";
import type { Surface, Material, RoomBuilderData, RoomBuilderRoom, DisplayToggles, MaterialCostEntry, AreaCalcResult, SurfaceCalcResult, MaterialGroup, MaterialGroupCalcResult } from "@shared/schema";
import { type EstimatorRoom, type EstimatorMaterialGroup, type EstimatorTimingReport } from "./FuseAIChat";

type SurfaceKey = "walls" | "ceiling" | "baseboard" | "crownMolding" | "shoeMolding" | "chairRail" | "doorCasing" | "windowCasing" | "doors" | "cabinets" | "staircaseRailing" | "accentWall" | "closetInterior";

type SectionType = 'room' | 'exterior' | 'area' | 'cabinets';

interface RoomConfig {
  id: string;
  name: string;
  sectionType: SectionType;
  length: number;
  width: number;
  ceilingHeight: number;
  walls: boolean;
  ceiling: boolean;
  baseboard: boolean;
  crownMolding: boolean;
  shoeMolding: boolean;
  chairRail: boolean;
  doorCount: number;
  windowCount: number;
  doorCasing: boolean;
  windowCasing: boolean;
  doors: boolean;
  cabinets: boolean;
  cabinetsLf: number;
  staircaseRailing: boolean;
  staircaseRailingLf: number;
  accentWall: boolean;
  accentWallSqft: number;
  closetInterior: boolean;
  closetInteriorSqft: number;
  isOptional?: boolean;
  doorHeightFt: number;
  doorWidthFt: number;
  expanded: boolean;
  scopeNotes: string;
  coatsOverride: Partial<Record<SurfaceKey, number>>;
  materialOverride: Partial<Record<SurfaceKey, number | null>>;
  primerOverride?: Record<string, { enabled: boolean; coats?: number; materialId?: number | null }>;
  paintOverride?: Record<string, { enabled: boolean }>;
  substrateOverride?: Record<string, { enabled: boolean; value?: string | null }>;
  surfaceDescriptionOverride?: Record<string, string>;
  complexityOverride?: Record<string, number>;
  repairOverride?: Record<string, { hours: number; description?: string }>;
  priceOverride?: number | null;
  photos?: Array<{ url: string; timestamp: string; uploading?: boolean; annotations?: any[] | null }>;
  showPhotosOnProposal?: boolean;
  wallSelections: Array<{ enabled: boolean; sqftOverride?: number | null }>;
  dynamicSurfaces: Record<string, { enabled: boolean; qty: number; manual?: boolean }>;
}

function autoCalcDynamicQty(room: { sectionType?: SectionType; length?: number; width?: number; ceilingHeight?: number }, dynUnit: string): number {
  const st = room.sectionType || 'room';
  const L = Number(room.length) || 0;
  const W = Number(room.width) || 0;
  const H = Number(room.ceilingHeight) || 0;
  if (dynUnit === 'sqft') {
    if (st === 'exterior') return Math.round(L * H);
    if (st === 'area') return Math.round(L * W);
    if (st === 'room') return Math.round(2 * (L + W) * H);
    return 0;
  }
  if (dynUnit === 'lf') {
    if (st === 'exterior') return Math.round(L);
    if (st === 'area' || st === 'room') return Math.round(2 * (L + W));
    return 0;
  }
  return 0;
}

interface FinancialSettingsData {
  settings: {
    sellRatePerHour: number;
    defaultSetupHoursPerRoom: number;
    defaultDoorWidthFt: number;
    defaultDoorHeightFt: number;
    defaultWindowWidthFt: number;
    defaultWindowHeightFt: number;
    useProductionTeamForLaborCost: boolean;
    manualLaborCostPerHour: number;
    targetGrossMarginPercentage: number;
    payrollBurdenPercentage: number;
    workersCompPercentage: number;
    benefitsPerHour: number;
    defaultShowLaborHrs?: boolean;
    defaultShowLaborPrice?: boolean;
    defaultShowMaterialQty?: boolean;
    defaultShowMaterialPrice?: boolean;
    defaultSameColorAllAreas?: boolean;
  };
}

interface TeamMember {
  id: number;
  hourlyRate: number;
  employeeType: string;
  isActive: boolean;
  activeForPricing: boolean;
  payrollBurdenPercentage: number;
  workersCompPercentage: number;
  benefitsPerHour: number;
}

interface SurfaceCalc {
  surfaceName: string;
  surfaceKey: string;
  quantity: number;
  unit: string;
  coats: number;
  laborHours: number;
  price: number;
  paintableSqft: number;
  primerCoats?: number;
  primerLaborHours?: number;
  primerPaintableSqft?: number;
  primerMaterialId?: number | null;
  repairHours?: number;
  repairPrice?: number;
}

interface RoomCalcResult {
  roomName: string;
  surfaces: SurfaceCalc[];
  setupHours: number;
  totalLaborHours: number;
  totalPrice: number;
}

const DEFAULT_LENGTH = 10;
const DEFAULT_WIDTH = 12;
const DEFAULT_HEIGHT = 8;

const SECTION_TYPE_LABELS: Record<SectionType, string> = {
  room: 'Room',
  exterior: 'Exterior',
  area: 'Area',
  cabinets: 'Cabinets',
};

const SERVICE_TO_SECTION_TYPE: Record<string, SectionType> = {
  "Residential Interior": "room",
  "Commercial Interior": "room",
  "Residential Exterior": "exterior",
  "Commercial Exterior": "exterior",
  "Kitchen Cabinets": "cabinets",
  "Flooring Installation": "area",
};

function getSectionTypeForService(service: string): SectionType {
  return SERVICE_TO_SECTION_TYPE[service] || "area";
}

const SECTION_TYPE_DEFAULTS: Record<SectionType, { defaultName: (i: number) => string; dims: 'lwh' | 'lh' | 'lw' | 'none' }> = {
  room:     { defaultName: (i) => `Section ${i + 1}`, dims: 'lwh' },
  exterior: { defaultName: (i) => `Exterior ${i + 1}`, dims: 'lh' },
  area:     { defaultName: (i) => `Area ${i + 1}`, dims: 'lw' },
  cabinets: { defaultName: (i) => `Cabinets ${i + 1}`, dims: 'none' },
};

const SECTION_ALLOWED_SURFACES: Record<SectionType, Set<SurfaceKey> | null> = {
  room: null,
  exterior: new Set<SurfaceKey>(["walls", "doors", "doorCasing", "windowCasing"]),
  area: new Set<SurfaceKey>(["walls", "ceiling", "doors", "doorCasing", "windowCasing", "accentWall"]),
  cabinets: new Set<SurfaceKey>(["cabinets"]),
};

function isSurfaceAllowedForType(key: SurfaceKey | string, sectionType: SectionType): boolean {
  const allowed = SECTION_ALLOWED_SURFACES[sectionType];
  if (!allowed) return true;
  const allBuiltIn = new Set<string>([...AREA_SURFACES_KEYS, "doors", "doorCasing", "windowCasing", "cabinets", "staircaseRailing", "accentWall", "closetInterior"]);
  if (!allBuiltIn.has(key)) return true;
  return allowed.has(key as SurfaceKey);
}

const AREA_SURFACES_KEYS = ["walls", "ceiling", "baseboard", "crownMolding", "shoeMolding", "chairRail"] as const;

function uniqueSectionName(base: string, existingNames: string[]): string {
  const trimmed = (base || "").trim() || "Section";
  const taken = new Set(existingNames.map(n => (n || "").trim().toLowerCase()));
  if (!taken.has(trimmed.toLowerCase())) return trimmed;
  // Strip trailing " 2", " 3", " (Copy)" if present so we don't pile up
  const m = trimmed.match(/^(.*?)(?:\s+(\d+))?$/);
  const stem = (m && m[1]) ? m[1].trim() : trimmed;
  let n = 2;
  while (taken.has(`${stem} ${n}`.toLowerCase())) n++;
  return `${stem} ${n}`;
}

function createDefaultArea(index: number, defaultDoorH: number, defaultDoorW: number, empty?: boolean, estimateType?: string, sectionType?: SectionType): RoomConfig {
  const st = sectionType || 'room';
  const defaultName = estimateType === "Kitchen Cabinets" ? "Kitchen Cabinets" : SECTION_TYPE_DEFAULTS[st].defaultName(index);
  const isRoom = st === 'room';
  const isExterior = st === 'exterior';
  const isCabinets = st === 'cabinets';
  return {
    id: `area-${Date.now()}-${index}`,
    name: defaultName,
    sectionType: st,
    length: DEFAULT_LENGTH,
    width: isCabinets ? 0 : DEFAULT_WIDTH,
    ceilingHeight: (isRoom || isExterior) ? DEFAULT_HEIGHT : 0,
    walls: !empty && (isRoom || isExterior),
    ceiling: false,
    baseboard: !empty && isRoom,
    crownMolding: false,
    shoeMolding: false,
    chairRail: false,
    doorCount: (!empty && (isRoom || isExterior)) ? 1 : 0,
    windowCount: (!empty && (isRoom || isExterior)) ? 1 : 0,
    doorCasing: false,
    windowCasing: false,
    doors: false,
    cabinets: isCabinets,
    cabinetsLf: isCabinets ? 20 : 0,
    staircaseRailing: false,
    staircaseRailingLf: 0,
    accentWall: false,
    accentWallSqft: 0,
    closetInterior: false,
    closetInteriorSqft: 0,
    doorHeightFt: defaultDoorH,
    doorWidthFt: defaultDoorW,
    expanded: true,
    scopeNotes: "",
    coatsOverride: {},
    materialOverride: {},
    primerOverride: {},
    paintOverride: {},
    wallSelections: [
      { enabled: true },
      { enabled: true },
      { enabled: true },
      { enabled: true },
    ],
    dynamicSurfaces: {},
  };
}

function findSurface(surfaces: Surface[], name: string): Surface | undefined {
  return surfaces.find(s => s.surfaceName.toLowerCase() === name.toLowerCase());
}

const SURFACE_SQFT_FACTOR: Record<SurfaceKey, number> = {
  walls: 1,
  ceiling: 1,
  baseboard: 0.5,
  crownMolding: 0.33,
  shoeMolding: 0.25,
  chairRail: 0.33,
  doorCasing: 0.33,
  windowCasing: 0.33,
  doors: 1,
  cabinets: 0.5,
  staircaseRailing: 0.33,
  accentWall: 1,
  closetInterior: 1,
};

const SURFACE_DEFAULTS: Record<SurfaceKey, { dbName: string; altName?: string; fallbackRate: number; fallbackCoats: number }> = {
  walls: { dbName: "Walls", fallbackRate: 200, fallbackCoats: 2 },
  ceiling: { dbName: "Ceiling", fallbackRate: 250, fallbackCoats: 2 },
  baseboard: { dbName: "Baseboard", fallbackRate: 35, fallbackCoats: 2 },
  crownMolding: { dbName: "Crown Molding", altName: "Crown", fallbackRate: 30, fallbackCoats: 2 },
  shoeMolding: { dbName: "Shoe Molding", altName: "Shoe", fallbackRate: 35, fallbackCoats: 2 },
  chairRail: { dbName: "Chair Rail", fallbackRate: 30, fallbackCoats: 2 },
  doorCasing: { dbName: "Door Casing", fallbackRate: 25, fallbackCoats: 2 },
  windowCasing: { dbName: "Window Casing", fallbackRate: 25, fallbackCoats: 2 },
  doors: { dbName: "Doors", fallbackRate: 1.5, fallbackCoats: 2 },
  cabinets: { dbName: "Cabinets", fallbackRate: 8, fallbackCoats: 2 },
  staircaseRailing: { dbName: "Staircase / Railing", altName: "Staircase", fallbackRate: 12, fallbackCoats: 2 },
  accentWall: { dbName: "Accent Wall", fallbackRate: 150, fallbackCoats: 2 },
  closetInterior: { dbName: "Closet Interior", altName: "Closet", fallbackRate: 180, fallbackCoats: 2 },
};

const DB_NAME_TO_INTERIOR_KEY: Record<string, SurfaceKey> = {
  "walls": "walls",
  "ceiling": "ceiling",
  "baseboard": "baseboard",
  "crown molding": "crownMolding",
  "crown": "crownMolding",
  "shoe molding": "shoeMolding",
  "shoe": "shoeMolding",
  "chair rail": "chairRail",
  "door casing": "doorCasing",
  "window casing": "windowCasing",
  "doors": "doors",
  "cabinets": "cabinets",
  "staircase / railing": "staircaseRailing",
  "staircase": "staircaseRailing",
  "accent wall": "accentWall",
  "closet interior": "closetInterior",
  "closet": "closetInterior",
};

function findSurfaceByKey(surfaces: Surface[], surfaceKey: string): Surface | undefined {
  return surfaces.find(s => s.surfaceKey === surfaceKey);
}

function getDefaultCoats(key: SurfaceKey, surfaces: Surface[]): number {
  const def = SURFACE_DEFAULTS[key];
  const s = findSurface(surfaces, def.dbName) || (def.altName ? findSurface(surfaces, def.altName) : undefined);
  return s?.defaultCoats || def.fallbackCoats;
}

function getCoatsLabel(key: SurfaceKey, surfaces: Surface[]): string {
  const def = SURFACE_DEFAULTS[key];
  const s = findSurface(surfaces, def.dbName) || (def.altName ? findSurface(surfaces, def.altName) : undefined);
  return (s as any)?.coatsLabel || "coat";
}

function getCoatsLabelForDynamic(dynSurf: Surface): string {
  return (dynSurf as any)?.coatsLabel || "coat";
}

function pluralizeLabel(label: string, count: number): string {
  if (count === 1) return label;
  if (label === "pass") return "passes";
  return label + "s";
}

function normalizeWallSelections(ws: any): Array<{ enabled: boolean; sqftOverride?: number | null }> {
  const defaults = [{ enabled: true }, { enabled: true }, { enabled: true }, { enabled: true }];
  if (!Array.isArray(ws)) return defaults;
  return defaults.map((d, i) => {
    const w = ws[i];
    if (!w || typeof w !== 'object') return d;
    return {
      enabled: w.enabled !== false,
      sqftOverride: typeof w.sqftOverride === 'number' && Number.isFinite(w.sqftOverride) && w.sqftOverride >= 0 ? w.sqftOverride : null,
    };
  });
}

function getIndividualWallSqfts(room: RoomConfig): [number, number, number, number] {
  const ws = normalizeWallSelections(room.wallSelections);
  const h = room.ceilingHeight || 0;
  const defaultSqfts: [number, number, number, number] = [
    room.length * h,
    room.width * h,
    room.length * h,
    room.width * h,
  ];
  return defaultSqfts.map((def, i) => {
    const ovr = ws[i]?.sqftOverride;
    return ovr != null && Number.isFinite(ovr) && ovr >= 0 ? ovr : def;
  }) as [number, number, number, number];
}

function calculateRoom(
  room: RoomConfig,
  surfaces: Surface[],
  sellRate: number,
  _setupHours: number,
  windowW: number,
  windowH: number,
  subtractOpenings: boolean = false,
  activeKeys?: Set<SurfaceKey>,
): RoomCalcResult {
  const st = room.sectionType || 'room';
  const perimeter = st === 'exterior' ? room.length : 2 * (room.length + room.width);
  const doorW = room.doorWidthFt || 3;
  const doorH = room.doorHeightFt || 7;
  const doorArea = subtractOpenings ? room.doorCount * doorW * doorH : 0;
  const windowArea = subtractOpenings ? room.windowCount * windowW * windowH : 0;
  const doorOpeningLF = room.doorCount * doorW;

  let totalWallSqft: number;
  if (st === 'exterior') {
    totalWallSqft = room.length * (room.ceilingHeight || 0);
  } else if (st === 'area') {
    totalWallSqft = room.length * room.width;
  } else {
    const wallSqfts = getIndividualWallSqfts(room);
    const ws = normalizeWallSelections(room.wallSelections);
    totalWallSqft = ws.reduce((sum, w, i) => sum + (w.enabled ? wallSqfts[i] : 0), 0);
  }

  const calcs: SurfaceCalc[] = [];

  function computePerCoatLabor(qty: number, coats: number, coatRatesArr: { rate: number; materialId: number | null }[] | null | undefined, fallbackRate: number): number {
    if (coats <= 0 || qty <= 0) return 0;
    const rates = coatRatesArr && coatRatesArr.length > 0 ? coatRatesArr : null;
    if (!rates) {
      const r = fallbackRate || 1;
      return (qty * coats) / r;
    }
    let total = 0;
    for (let c = 0; c < coats; c++) {
      const r = (c < rates.length ? rates[c].rate : rates[0].rate) || fallbackRate || 1;
      total += qty / r;
    }
    return total;
  }

  function addSurface(key: SurfaceKey, qty: number, unit: string, extraCond: boolean = true) {
    if (!room[key] || !extraCond) return;
    if (activeKeys && !activeKeys.has(key)) return;
    if (!isSurfaceAllowedForType(key, st)) return;
    const def = SURFACE_DEFAULTS[key];
    const s = findSurface(surfaces, def.dbName) || (def.altName ? findSurface(surfaces, def.altName) : undefined);
    const baseRate = s?.productionRateUnitsPerLaborHour || def.fallbackRate;
    const paintOvr = room.paintOverride?.[key];
    const surfaceUsePaint = paintOvr ? paintOvr.enabled : ((s as any)?.usePaint ?? true);
    const rawCoats = room.coatsOverride[key] ?? s?.defaultCoats ?? def.fallbackCoats;
    const coats = surfaceUsePaint ? rawCoats : 0;
    const finalQty = unit === "each" ? qty : Math.round(qty);
    const complexityHrs = room.complexityOverride?.[key] || 0;
    const repairHrs = room.repairOverride?.[key]?.hours || 0;
    const rawHrs = surfaceUsePaint ? computePerCoatLabor(qty, coats, s?.coatRates as any, baseRate) : 0;
    const hrs = Math.max(0, rawHrs + complexityHrs) + repairHrs;

    const factor = (s as any)?.sqftPerUnit || SURFACE_SQFT_FACTOR[key] || 1;
    let paintableSqft: number;
    if (key === "doors" && !(s as any)?.sqftPerUnit) {
      paintableSqft = room.doorCount * doorH * doorW * coats;
    } else if (unit === "sqft") {
      paintableSqft = qty * coats;
    } else {
      paintableSqft = qty * factor * coats;
    }

    const surfaceUsePrimer = (s as any)?.usePrimer ?? true;
    const primer = room.primerOverride?.[key];
    const defaultPrimerCoats = s?.defaultPrimerCoats || 0;
    const defaultPrimerMatId = s?.defaultPrimerMaterialId || null;
    const primerEnabled = surfaceUsePrimer && (primer?.enabled ?? (defaultPrimerCoats > 0));
    let primerCoats: number | undefined;
    let primerLaborHours: number | undefined;
    let primerPaintableSqft: number | undefined;
    let primerMaterialId: number | null | undefined;

    if (primerEnabled) {
      primerCoats = primer?.coats ?? (defaultPrimerCoats > 0 ? defaultPrimerCoats : 1);
      if (primerCoats > 0) {
        const primerRatesArr = s?.primerRates as { rate: number; materialId: number | null }[] | null | undefined;
        const primerFallback = (primerRatesArr && primerRatesArr.length > 0 ? primerRatesArr[0].rate : null) || baseRate;
        primerLaborHours = computePerCoatLabor(qty, primerCoats, primerRatesArr, primerFallback);
        if (key === "doors" && !(s as any)?.sqftPerUnit) {
          primerPaintableSqft = room.doorCount * doorH * doorW * primerCoats;
        } else if (unit === "sqft") {
          primerPaintableSqft = qty * primerCoats;
        } else {
          primerPaintableSqft = qty * factor * primerCoats;
        }
        primerMaterialId = primer?.materialId !== undefined
          ? primer.materialId
          : (defaultPrimerMatId || (primerRatesArr && primerRatesArr.length > 0 ? primerRatesArr[0].materialId : null));
      }
    }

    const stdSurfOverride = room.surfacePriceOverride?.[key];
    const stdPricingMode = (s as any)?.pricingMode || 'production_rate';
    const stdPricePerUnit = (s as any)?.pricePerUnit;
    const stdCalcPrice = stdPricingMode === 'per_unit' && stdPricePerUnit != null
      ? stdPricePerUnit * finalQty
      : (hrs + (primerLaborHours || 0)) * sellRate;
    const stdFinalPrice = stdSurfOverride != null ? stdSurfOverride * finalQty : stdCalcPrice;

    calcs.push({
      surfaceName: def.dbName, surfaceKey: key, quantity: finalQty, unit, coats,
      coatsLabel: (s as any)?.coatsLabel || "coat",
      usePrimer: surfaceUsePrimer,
      usePaint: surfaceUsePaint,
      laborHours: hrs + (primerLaborHours || 0),
      price: stdFinalPrice,
      paintableSqft,
      primerCoats: primerCoats && primerCoats > 0 ? primerCoats : undefined,
      primerLaborHours,
      primerPaintableSqft,
      primerMaterialId,
      repairHours: repairHrs > 0 ? repairHrs : undefined,
      repairPrice: repairHrs > 0 ? repairHrs * sellRate : undefined,
    });
  }

  addSurface("walls", Math.max(0, totalWallSqft - doorArea - windowArea), "sqft");
  addSurface("ceiling", st === 'area' ? room.length * room.width : room.length * room.width, "sqft");
  addSurface("baseboard", Math.max(0, perimeter - doorOpeningLF), "lf");
  addSurface("crownMolding", perimeter, "lf");
  addSurface("shoeMolding", Math.max(0, perimeter - doorOpeningLF), "lf");
  addSurface("chairRail", perimeter, "lf");
  addSurface("doorCasing", room.doorCount * (2 * doorH + doorW), "lf", room.doorCount > 0);
  addSurface("windowCasing", room.windowCount * (2 * windowH + windowW), "lf", room.windowCount > 0);
  addSurface("doors", room.doorCount, "each", room.doorCount > 0);
  addSurface("cabinets", room.cabinetsLf || 0, "lf", room.cabinetsLf > 0);
  addSurface("staircaseRailing", room.staircaseRailingLf || 0, "lf", room.staircaseRailingLf > 0);
  addSurface("accentWall", room.accentWallSqft || 0, "sqft", room.accentWallSqft > 0);
  addSurface("closetInterior", room.closetInteriorSqft || 0, "sqft", room.closetInteriorSqft > 0);

  if (room.dynamicSurfaces) {
    for (const [dynKey, dynState] of Object.entries(room.dynamicSurfaces)) {
      if (!dynState.enabled || dynState.qty <= 0) continue;
      const dynSurf = findSurfaceByKey(surfaces, dynKey);
      if (!dynSurf) continue;
      const baseRate = dynSurf.productionRateUnitsPerLaborHour || 100;
      const dynPaintOvr = room.paintOverride?.[dynKey];
      const dynUsePaint = dynPaintOvr ? dynPaintOvr.enabled : ((dynSurf as any)?.usePaint ?? true);
      const rawCoats = (room.coatsOverride as Record<string, number>)[dynKey] ?? dynSurf.defaultCoats ?? 2;
      const coats = dynUsePaint ? rawCoats : 0;
      const unit = dynSurf.unit || "sqft";
      const qty = dynState.qty;
      const complexityHrs = room.complexityOverride?.[dynKey] || 0;
      const repairHrs = room.repairOverride?.[dynKey]?.hours || 0;
      const rawHrs = dynUsePaint ? computePerCoatLabor(qty, coats, dynSurf.coatRates as any, baseRate) : 0;
      const hrs = Math.max(0, rawHrs + complexityHrs) + repairHrs;
      const sqftFactor = (dynSurf as any).sqftPerUnit || 1;
      const paintableSqft = qty * sqftFactor * coats;

      const dynUsePrimer = (dynSurf as any)?.usePrimer ?? true;
      const primer = room.primerOverride?.[dynKey];
      const defaultPrimerCoats = dynSurf.defaultPrimerCoats || 0;
      const defaultPrimerMatId = dynSurf.defaultPrimerMaterialId || null;
      const primerEnabled = dynUsePrimer && (primer?.enabled ?? (defaultPrimerCoats > 0));
      let dPrimerCoats: number | undefined;
      let dPrimerLaborHours: number | undefined;
      let dPrimerPaintableSqft: number | undefined;
      let dPrimerMaterialId: number | null | undefined;

      if (primerEnabled) {
        dPrimerCoats = primer?.coats ?? (defaultPrimerCoats > 0 ? defaultPrimerCoats : 1);
        if (dPrimerCoats > 0) {
          const primerRatesArr = dynSurf.primerRates as { rate: number; materialId: number | null }[] | null | undefined;
          const primerFallback = (primerRatesArr && primerRatesArr.length > 0 ? primerRatesArr[0].rate : null) || baseRate;
          dPrimerLaborHours = computePerCoatLabor(qty, dPrimerCoats, primerRatesArr, primerFallback);
          dPrimerPaintableSqft = qty * sqftFactor * dPrimerCoats;
          dPrimerMaterialId = primer?.materialId !== undefined
            ? primer.materialId
            : (defaultPrimerMatId || (primerRatesArr && primerRatesArr.length > 0 ? primerRatesArr[0].materialId : null));
        }
      }

      const surfOverridePerUnit = room.surfacePriceOverride?.[dynKey];
      const dynPricingMode = (dynSurf as any)?.pricingMode || 'production_rate';
      const dynPricePerUnit = (dynSurf as any)?.pricePerUnit;
      const calculatedPrice = dynPricingMode === 'per_unit' && dynPricePerUnit != null
        ? dynPricePerUnit * qty
        : (hrs + (dPrimerLaborHours || 0)) * sellRate;
      const finalPrice = surfOverridePerUnit != null ? surfOverridePerUnit * qty : calculatedPrice;

      calcs.push({
        surfaceName: dynSurf.surfaceName, surfaceKey: dynKey, quantity: qty, unit, coats,
        coatsLabel: getCoatsLabelForDynamic(dynSurf),
        usePrimer: dynUsePrimer,
        usePaint: dynUsePaint,
        laborHours: hrs + (dPrimerLaborHours || 0),
        price: finalPrice,
        paintableSqft,
        primerCoats: dPrimerCoats && dPrimerCoats > 0 ? dPrimerCoats : undefined,
        primerLaborHours: dPrimerLaborHours,
        primerPaintableSqft: dPrimerPaintableSqft,
        primerMaterialId: dPrimerMaterialId,
        repairHours: repairHrs > 0 ? repairHrs : undefined,
        repairPrice: repairHrs > 0 ? repairHrs * sellRate : undefined,
      });
    }
  }

  const surfaceLaborHours = calcs.reduce((sum, c) => sum + c.laborHours, 0);
  const totalLaborHours = surfaceLaborHours;
  // Sum the per-surface prices instead of recomputing from labor hours.
  // Each `c.price` already reflects per-surface overrides (`surfacePriceOverride`)
  // and per-unit pricing mode. Recomputing as `totalLaborHours * sellRate` would
  // throw those away, causing the area total, block subtotal, document total,
  // and saved `roomBuilderData.grandTotal` to ignore overrides — even though the
  // individual surface row still showed the overridden number. For surfaces with
  // no override and no per-unit pricing, `c.price = (hrs + primerHrs) * sellRate`,
  // so the sum equals the previous formula and behavior is unchanged.
  const totalPrice = calcs.reduce((sum, c) => sum + c.price, 0);

  return {
    roomName: room.name,
    surfaces: calcs,
    setupHours: 0,
    totalLaborHours,
    totalPrice,
  };
}

export interface RoomBuilderHandle {
  requestClose: () => void;
  requestSave: () => void;
  requestAutoSave: () => void;
}

interface TaxProfileInfo {
  taxProfileId?: number;
  taxProfileName?: string;
  taxProfileRate?: number;
}

interface RoomBuilderProps {
  onGenerateLineItems: (items: LineItem[]) => void;
  onCancel: () => void;
  onSaveRoomData?: (data: RoomBuilderData, items: LineItem[], blockName: string, taxable: boolean, taxProfileInfo?: TaxProfileInfo) => void;
  onDirty?: () => void;
  initialRoomData?: RoomBuilderData;
  initialBlockName?: string;
  initialTaxable?: boolean;
  initialTaxProfileId?: number;
  initialService?: string;
  initialEditingRoomId?: string;
  onInitialRoomConsumed?: () => void;
  onSectionEditorClose?: (saved: boolean) => void;
  taxRate?: number;
  taxProfiles?: Array<{ id: number; name: string; rate: string; isDefault: boolean }>;
  builderRef?: React.MutableRefObject<RoomBuilderHandle | null>;
  projectId?: number;
  sellRateSnapshot?: number | null;
}

const AREA_SURFACES: { key: SurfaceKey; label: string }[] = [
  { key: "walls", label: "Walls" },
  { key: "ceiling", label: "Ceiling" },
  { key: "baseboard", label: "Baseboard" },
  { key: "crownMolding", label: "Crown Molding" },
  { key: "shoeMolding", label: "Shoe Molding" },
  { key: "chairRail", label: "Chair Rail" },
];

const ITEM_SURFACES: { key: SurfaceKey; label: string; countKey: "doorCount" | "windowCount" }[] = [
  { key: "doors", label: "Doors", countKey: "doorCount" },
  { key: "doorCasing", label: "Door Casing", countKey: "doorCount" },
  { key: "windowCasing", label: "Window Casing", countKey: "windowCount" },
];

const EXTRA_SURFACES: { key: SurfaceKey; label: string; qtyKey: string; unit: string; placeholder: string }[] = [
  { key: "cabinets", label: "Cabinets", qtyKey: "cabinetsLf", unit: "lf", placeholder: "Linear ft" },
  { key: "staircaseRailing", label: "Staircase / Railing", qtyKey: "staircaseRailingLf", unit: "lf", placeholder: "Linear ft" },
  { key: "accentWall", label: "Accent Wall", qtyKey: "accentWallSqft", unit: "sqft", placeholder: "Sq ft" },
  { key: "closetInterior", label: "Closet Interior", qtyKey: "closetInteriorSqft", unit: "sqft", placeholder: "Sq ft" },
];

function MiniStepper({ value, onChange, min = 0, max = 20, testId, disabled = false }: { value: number; onChange: (v: number) => void; min?: number; max?: number; testId?: string; disabled?: boolean }) {
  return (
    <div className={cn("flex items-center", disabled && "opacity-50 pointer-events-none")}>
      <button
        type="button"
        className="flex items-center justify-center w-7 h-7 rounded-l border border-r-0 border-border text-muted-foreground hover-elevate active-elevate-2 disabled:opacity-30"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={disabled || value <= min}
        data-testid={testId ? `${testId}-minus` : undefined}
        data-mutating="true"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>
      <span
        className="flex items-center justify-center w-8 h-7 border-y border-border text-sm tabular-nums font-medium bg-background"
        data-testid={testId ? `${testId}-value` : undefined}
      >
        {value}
      </span>
      <button
        type="button"
        className="flex items-center justify-center w-7 h-7 rounded-r border border-l-0 border-border text-muted-foreground hover-elevate active-elevate-2 disabled:opacity-30"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={disabled || value >= max}
        data-testid={testId ? `${testId}-plus` : undefined}
        data-mutating="true"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function EditableStepper({ value, onChange, min = 0, max = 999, testId }: { value: number; onChange: (v: number) => void; min?: number; max?: number; testId?: string }) {
  const [editing, setEditing] = useState(false);
  const [localText, setLocalText] = useState("");
  return (
    <div className="flex items-center">
      <button
        type="button"
        className="flex items-center justify-center w-8 h-8 rounded-l border border-r-0 border-border text-muted-foreground hover-elevate active-elevate-2 disabled:opacity-30"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        data-testid={testId ? `${testId}-minus` : undefined}
        data-mutating="true"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>
      {editing ? (
        <input
          type="text"
          inputMode="numeric"
          autoFocus
          className="w-12 h-8 border-y border-border text-sm tabular-nums font-medium bg-background text-center outline-none"
          value={localText}
          onChange={(e) => setLocalText(e.target.value.replace(/[^0-9]/g, ''))}
          onBlur={() => {
            const n = parseInt(localText) || 0;
            onChange(Math.max(min, Math.min(max, n)));
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const n = parseInt(localText) || 0;
              onChange(Math.max(min, Math.min(max, n)));
              setEditing(false);
            }
          }}
          data-testid={testId ? `${testId}-input` : undefined}
        />
      ) : (
        <button
          type="button"
          className="flex items-center justify-center w-12 h-8 border-y border-border text-sm tabular-nums font-medium bg-background"
          onClick={() => { setLocalText(String(value)); setEditing(true); }}
          data-testid={testId ? `${testId}-value` : undefined}
        >
          {value}
        </button>
      )}
      <button
        type="button"
        className="flex items-center justify-center w-8 h-8 rounded-r border border-l-0 border-border text-muted-foreground hover-elevate active-elevate-2 disabled:opacity-30"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        data-testid={testId ? `${testId}-plus` : undefined}
        data-mutating="true"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function NumericInput({ value, onChange, placeholder, className, testId, allowNegative }: {
  value: number | "";
  onChange: (v: number) => void;
  placeholder?: string;
  className?: string;
  testId?: string;
  allowNegative?: boolean;
}) {
  const [localText, setLocalText] = useState<string | null>(null);

  const handleChange = (e: { target: { value: string } }) => {
    const allowed = allowNegative ? /[^0-9.\-]/g : /[^0-9.]/g;
    let raw = e.target.value.replace(allowed, '');
    if (allowNegative) {
      const hasLeadingMinus = raw.startsWith('-');
      raw = (hasLeadingMinus ? '-' : '') + raw.replace(/-/g, '');
    }
    const parts = raw.split('.');
    const cleaned = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : raw;
    setLocalText(cleaned);
    const num = parseFloat(cleaned);
    if (!isNaN(num)) onChange(num);
  };

  const handleBlur = (e: { target: { value: string } }) => {
    const num = parseFloat(e.target.value || '');
    onChange(!isNaN(num) ? num : 0);
    setLocalText(null);
  };

  const displayValue = localText !== null ? localText : (value === 0 ? "" : value);

  return (
    <Input
      type="text"
      inputMode={allowNegative ? "text" : "decimal"}
      pattern={allowNegative ? "-?[0-9]*\\.?[0-9]*" : "[0-9]*\\.?[0-9]*"}
      value={displayValue}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder={placeholder}
      className={className}
      data-testid={testId}
    />
  );
}

function ComplexityPicker({ value, onChange, surfaceKey, roomIndex }: {
  value: number;
  onChange: (v: number) => void;
  surfaceKey: string;
  roomIndex: number;
}) {
  const step = 0.5;
  const display = value === 0 ? "0" : (value > 0 ? `+${value}` : `${value}`);
  return (
    <div className="mt-2 pt-2 border-t border-border/30" data-testid={`complexity-section-${surfaceKey}-${roomIndex}`}>
      <div className="flex items-center gap-2">
        <Timer className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
        <span className="text-[10px] text-muted-foreground whitespace-nowrap">Complexity Hrs</span>
        <div className="flex items-center">
          <button
            type="button"
            className="flex items-center justify-center w-7 h-7 rounded-l border border-r-0 border-border text-muted-foreground hover-elevate active-elevate-2"
            onClick={() => onChange(Math.round((value - step) * 10) / 10)}
            data-testid={`complexity-hours-${surfaceKey}-${roomIndex}-minus`}
            data-mutating="true"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <span
            className={`flex items-center justify-center min-w-[2.5rem] h-7 px-1 border-y border-border text-xs tabular-nums font-medium bg-background ${value > 0 ? 'text-emerald-600 dark:text-emerald-400' : value < 0 ? 'text-red-600 dark:text-red-400' : ''}`}
            data-testid={`complexity-hours-${surfaceKey}-${roomIndex}-value`}
          >
            {display}
          </span>
          <button
            type="button"
            className="flex items-center justify-center w-7 h-7 rounded-r border border-l-0 border-border text-muted-foreground hover-elevate active-elevate-2"
            onClick={() => onChange(Math.round((value + step) * 10) / 10)}
            data-testid={`complexity-hours-${surfaceKey}-${roomIndex}-plus`}
            data-mutating="true"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        {value !== 0 && (
          <span className={`text-[10px] whitespace-nowrap ${value > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
            {value > 0 ? `${value}h added` : `${value}h reduced`}
          </span>
        )}
      </div>
    </div>
  );
}

function RepairPicker({ hours, description, onHoursChange, onDescriptionChange, surfaceKey, roomIndex }: {
  hours: number;
  description?: string;
  onHoursChange: (h: number) => void;
  onDescriptionChange: (desc: string) => void;
  surfaceKey: string;
  roomIndex: number;
}) {
  const hasRepair = hours > 0 || (description && description.trim().length > 0);
  const [descExpanded, setDescExpanded] = useState(false);
  return (
    <div
      className={`mt-2 rounded-lg border ${hasRepair ? 'border-orange-300 dark:border-orange-700 bg-orange-50/50 dark:bg-orange-950/20' : 'border-border/40 bg-muted/30'} p-2.5`}
      data-testid={`repair-section-${surfaceKey}-${roomIndex}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Wrench className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400 shrink-0" />
          <span className="text-[11px] font-medium text-orange-700 dark:text-orange-300">Repair</span>
        </div>
        <div className="flex items-center gap-1.5">
          <NumericInput
            value={hours || ""}
            onChange={onHoursChange}
            placeholder="0"
            className="text-xs text-center w-16 h-7"
            testId={`repair-hours-${surfaceKey}-${roomIndex}`}
          />
          <span className="text-[10px] text-muted-foreground">hrs</span>
        </div>
      </div>
      {hasRepair && (
        <div className="mt-2">
          <div className="relative">
            <Textarea
              value={description || ""}
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder="Describe the repair work..."
              className={`text-xs resize-none overflow-y-auto ${descExpanded ? 'max-h-[160px]' : 'max-h-[54px]'}`}
              rows={2}
              data-testid={`repair-description-${surfaceKey}-${roomIndex}`}
            />
            {description && description.split('\n').length > 2 && (
              <button
                type="button"
                onClick={() => setDescExpanded(!descExpanded)}
                className="text-[10px] text-orange-600 dark:text-orange-400 hover:underline mt-0.5"
                data-testid={`repair-expand-${surfaceKey}-${roomIndex}`}
              >
                {descExpanded ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoBubble({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-full text-muted-foreground hover-elevate focus:outline-none"
          aria-label="More info"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
          data-testid="button-info-bubble"
        >
          <HelpCircle className="w-3.5 h-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3 text-xs text-muted-foreground leading-relaxed z-[10002]" side="top" align="center" sideOffset={6}>
        {text}
      </PopoverContent>
    </Popover>
  );
}

function MaterialPickerRow({ effectiveMatId, effectiveMat, isOverridden, surfaceKey, roomIndex, paintPrimerMaterials, allMaterials, onSelect, icon: IconComp, emptyLabel }: {
  effectiveMatId: number | null;
  effectiveMat: any;
  isOverridden: boolean;
  surfaceKey: string;
  roomIndex: number;
  paintPrimerMaterials: any[];
  allMaterials: any[];
  onSelect: (matId: number | null) => void;
  icon?: any;
  emptyLabel?: string;
}) {
  const PickerIcon = IconComp || Paintbrush;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { keyboardOffset } = useKeyboardOffset(open);
  const filtered = search.trim()
    ? paintPrimerMaterials.filter((m: any) =>
        `${m.materialName} ${m.brand}`.toLowerCase().includes(search.toLowerCase())
      )
    : paintPrimerMaterials;

  const kbStyle: React.CSSProperties = keyboardOffset > 0
    ? {
        position: 'fixed',
        left: 8,
        right: 8,
        bottom: keyboardOffset + 12,
        top: 'auto',
        transform: 'none',
        width: 'auto',
        maxWidth: 'none',
        maxHeight: `calc(100dvh - ${keyboardOffset + 24}px)`,
        zIndex: 10002,
      }
    : {};
  // When the keyboard is open, give the inner option list as much room as
  // we have above the keyboard (minus the search input + padding) so users
  // can see ~6+ rows while typing instead of being stuck with a tiny list.
  const listMaxHeight = keyboardOffset > 0
    ? `calc(100dvh - ${keyboardOffset + 90}px)`
    : '260px';

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch(""); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "mt-1.5 w-full flex items-center gap-1.5 rounded px-2 py-1 text-[11px] transition-colors",
            effectiveMat
              ? isOverridden
                ? "bg-primary/10 text-primary border border-primary/20"
                : "bg-muted/60 text-muted-foreground"
              : "bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border border-red-300 dark:border-red-700"
          )}
          data-testid={`material-picker-${surfaceKey}-${roomIndex}`}
        >
          <PickerIcon className={cn("w-3 h-3 shrink-0", !effectiveMat && "text-red-500")} />
          <span className="truncate flex-1 text-center">
            {effectiveMat ? effectiveMat.materialName : (emptyLabel || "Select material")}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-1.5 z-[10002]" align="center" side="bottom" avoidCollisions style={kbStyle}>
        {paintPrimerMaterials.length > 5 && (
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            // The popover itself re-anchors above the keyboard via `kbStyle`
            // (debounced single state update), so we deliberately do NOT
            // also scroll the focused field — that's what produced the
            // "phased" jumping the user reported. One movement, one pass.
            data-no-autoscroll="true"
            placeholder="Search materials..."
            className="mb-1.5 h-8 text-sm"
            data-testid={`material-search-${surfaceKey}-${roomIndex}`}
          />
        )}
        <div className="overflow-y-auto space-y-0.5" style={{ maxHeight: listMaxHeight }}>
          <button
            type="button"
            className={cn(
              "w-full text-left rounded px-2 py-1.5 text-xs hover:bg-muted/80 transition-colors",
              !effectiveMatId ? "bg-primary/10 font-medium" : ""
            )}
            onClick={() => { onSelect(null); setOpen(false); }}
            data-testid={`material-option-none-${surfaceKey}-${roomIndex}`}
          >
            {emptyLabel || "No material"}
          </button>
          {filtered.map((mat: any) => (
            <button
              key={mat.id}
              type="button"
              className={cn(
                "w-full text-left rounded px-2 py-1.5 text-xs hover:bg-muted/80 transition-colors",
                effectiveMatId === mat.id ? "bg-primary/10 font-medium" : ""
              )}
              onClick={() => { onSelect(mat.id); setOpen(false); }}
              data-testid={`material-option-${mat.id}-${surfaceKey}-${roomIndex}`}
            >
              <div className="font-medium">{mat.materialName}</div>
              <div className="text-muted-foreground text-[10px]">
                {mat.brand} — ${mat.costPerUnit.toFixed(2)}/gal — {mat.coverageSqftPerGallon} sqft/gal
              </div>
            </button>
          ))}
          {filtered.length === 0 && paintPrimerMaterials.length > 0 && (
            <p className="text-xs text-muted-foreground px-2 py-1.5">No matches</p>
          )}
          {paintPrimerMaterials.length === 0 && (
            <p className="text-xs text-muted-foreground px-2 py-1.5">No paint/primer materials set up yet</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

const SUBSTRATE_PICKER_OPTIONS = ["Drywall", "Wood", "Brick", "Stucco", "Concrete", "Metal", "Plaster", "MDF", "PVC/Vinyl", "Hardie Board", "Fiber Cement", "T1-11", "Cedar", "Composite"];

function SubstratePickerRow({ value, surfaceKey, roomIndex, onSelect }: {
  value: string | null;
  surfaceKey: string;
  roomIndex: number;
  onSelect: (value: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [addingNew, setAddingNew] = useState(false);
  const [customValue, setCustomValue] = useState("");
  const isCustomValue = !!value && !SUBSTRATE_PICKER_OPTIONS.includes(value);

  const commitCustom = () => {
    const trimmed = customValue.trim();
    if (trimmed) {
      onSelect(trimmed);
      setOpen(false);
      setAddingNew(false);
      setCustomValue("");
    }
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setAddingNew(false); setCustomValue(""); } }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "mt-1.5 w-full flex items-center gap-1.5 rounded px-2 py-1 text-[11px] transition-colors",
            value
              ? "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800"
              : "bg-muted/40 text-muted-foreground/60"
          )}
          data-testid={`substrate-picker-${surfaceKey}-${roomIndex}`}
        >
          <Layers className="w-3 h-3 shrink-0" />
          <span className="truncate flex-1 text-center">
            {value || "Select substrate"}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-1.5 z-[10002]" align="center" side="bottom" avoidCollisions>
        {addingNew ? (
          <div className="space-y-1.5">
            <Input
              autoFocus
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitCustom(); } if (e.key === "Escape") { setAddingNew(false); setCustomValue(""); } }}
              placeholder="Enter substrate..."
              className="h-7 text-xs"
              data-testid={`substrate-custom-input-${surfaceKey}-${roomIndex}`}
            />
            <div className="flex gap-1">
              <Button type="button" size="sm" className="flex-1 h-6 text-[11px]" onClick={commitCustom} data-testid={`substrate-custom-save-${surfaceKey}-${roomIndex}`}>Save</Button>
              <Button type="button" size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => { setAddingNew(false); setCustomValue(""); }}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div className="max-h-[260px] overflow-y-auto space-y-0.5">
            <button
              type="button"
              className="w-full text-left rounded px-2 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors border border-dashed border-primary/40"
              onClick={() => { setAddingNew(true); setCustomValue(isCustomValue && value ? value : ""); }}
              data-testid={`substrate-option-add-new-${surfaceKey}-${roomIndex}`}
            >
              + Add New Substrate...
            </button>
            <button
              type="button"
              className={cn(
                "w-full text-left rounded px-2 py-1.5 text-xs hover:bg-muted/80 transition-colors mt-1",
                !value ? "bg-primary/10 font-medium" : ""
              )}
              onClick={() => { onSelect(null); setOpen(false); }}
              data-testid={`substrate-option-none-${surfaceKey}-${roomIndex}`}
            >
              None
            </button>
            {isCustomValue && (
              <button
                type="button"
                className="w-full text-left rounded px-2 py-1.5 text-xs hover:bg-muted/80 transition-colors bg-primary/10 font-medium"
                onClick={() => setOpen(false)}
                data-testid={`substrate-option-custom-${surfaceKey}-${roomIndex}`}
              >
                {value} <span className="text-muted-foreground">(custom)</span>
              </button>
            )}
            {SUBSTRATE_PICKER_OPTIONS.map(s => (
              <button
                key={s}
                type="button"
                className={cn(
                  "w-full text-left rounded px-2 py-1.5 text-xs hover:bg-muted/80 transition-colors",
                  value === s ? "bg-primary/10 font-medium" : ""
                )}
                onClick={() => { onSelect(s); setOpen(false); }}
                data-testid={`substrate-option-${s}-${surfaceKey}-${roomIndex}`}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function DisplayToggleButton({ active, icon: Icon, label, onClick, testId }: {
  active: boolean;
  icon: any;
  label: string;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors border",
        active
          ? "bg-primary/10 text-primary border-primary/30"
          : "bg-muted/40 text-muted-foreground/50 border-transparent line-through"
      )}
      data-testid={testId}
    >
      <Icon className="w-3 h-3" />
      <span>{label}</span>
    </button>
  );
}

const PAINT_GROUP_COLORS = {
  border: "border-emerald-400/40 dark:border-emerald-500/30",
  bg: "bg-emerald-50/60 dark:bg-emerald-950/20",
  accent: "bg-emerald-500",
  chipActive: "bg-emerald-100 dark:bg-emerald-900/40 border-emerald-400/50 text-emerald-700 dark:text-emerald-300",
  header: "bg-emerald-100/50 dark:bg-emerald-900/20",
  badge: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300",
};

const PRIMER_GROUP_COLORS = {
  border: "border-gray-300/60 dark:border-gray-600/40",
  bg: "bg-gray-50/60 dark:bg-gray-900/20",
  accent: "bg-gray-400 dark:bg-gray-500",
  chipActive: "bg-gray-200 dark:bg-gray-800/60 border-gray-400/50 text-gray-700 dark:text-gray-300",
  header: "bg-gray-100/60 dark:bg-gray-800/20",
  badge: "bg-gray-200 dark:bg-gray-800/60 text-gray-600 dark:text-gray-400",
};

function MaterialGroupSummaryCard({ group, groupResult, matLabel, onEdit, onRemove, allMaterials, rooms, dimmed }: {
  group: MaterialGroup;
  groupResult: MaterialGroupCalcResult | undefined;
  matLabel: string | null;
  onEdit: () => void;
  onRemove: () => void;
  allMaterials: Material[];
  rooms: RoomConfig[];
  dimmed?: boolean;
}) {
  const isPrimer = group.type === 'primer';
  const colors = isPrimer ? PRIMER_GROUP_COLORS : PAINT_GROUP_COLORS;
  const IconComp = isPrimer ? Droplets : Paintbrush;

  const surfaceLabels = group.surfaceKeys.length > 0
    ? group.surfaceKeys.map(k => {
        const found = [...AREA_SURFACES, ...ITEM_SURFACES, ...EXTRA_SURFACES].find(s => s.key === k);
        return found ? found.label : k;
      }).join(', ')
    : 'No surfaces';

  const areaLabel = (() => {
    if (!group.areaIds || group.areaIds.length === 0 || group.areaIds.length >= rooms.length) {
      return rooms.length > 1 ? 'All areas' : '';
    }
    return group.areaIds.map(id => {
      const r = rooms.find(rm => rm.id === id);
      return r ? (r.name || 'Area') : '';
    }).filter(Boolean).join(', ');
  })();

  return (
    <div
      className={cn(
        "rounded-lg border-2 overflow-hidden cursor-pointer transition-all hover:shadow-md",
        colors.border, colors.bg,
        dimmed && "opacity-40 pointer-events-none select-none"
      )}
      onClick={onEdit}
      data-testid={`material-group-card-${group.id}`}
    >
      <div className={cn("px-3 py-2.5", colors.header)}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className={cn("w-2.5 h-2.5 rounded-full shrink-0", colors.accent)} />
            <span className="text-sm font-semibold truncate">{group.name || 'Untitled Group'}</span>
            <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider shrink-0", colors.badge)}>
              {isPrimer ? 'Primer' : 'Paint'}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {groupResult ? (
              <span className="text-xs tabular-nums text-muted-foreground font-semibold flex items-center gap-1.5">
                {group.qtyToBuyOverride != null ? (
                  <span
                    className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700"
                    title={`Auto would buy ${Math.ceil(groupResult.exactQtyNeeded)} gal`}
                    data-testid={`badge-override-${group.id}`}
                  >
                    Overridden {groupResult.qtyToBuy} gal
                  </span>
                ) : (
                  <span>{groupResult.qtyToBuy} gal</span>
                )}
                <span>— ${groupResult.totalCost.toFixed(2)}</span>
              </span>
            ) : group.materialId && group.surfaceKeys.length > 0 ? (
              <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                0 sqft
              </span>
            ) : null}
            {!dimmed && (
              <span
                role="button"
                onClick={(e) => { e.stopPropagation(); onRemove(); }}
                className="text-muted-foreground/60 hover:text-destructive"
                data-testid={`button-remove-group-${group.id}`}
              >
                <X className="w-4 h-4" />
              </span>
            )}
          </div>
        </div>
        <div className="mt-1.5 ml-5 space-y-0.5">
          <div className={cn(
            "text-xs truncate",
            group.surfaceKeys.length === 0
              ? "text-red-500 dark:text-red-400 italic font-medium"
              : "text-muted-foreground"
          )}>
            {group.surfaceKeys.length === 0 ? '⚠ No surfaces selected' : surfaceLabels}
            {groupResult ? ` · ${groupResult.totalSqft.toLocaleString()} sqft` : ''}
          </div>
          {groupResult && (
            <div className="text-xs tabular-nums text-muted-foreground font-semibold">
              {groupResult.qtyToBuy} gal — ${groupResult.totalCost.toFixed(2)}
            </div>
          )}
          {!groupResult && group.materialId && group.surfaceKeys.length > 0 && (
            <div className="text-[11px] text-amber-600 dark:text-amber-400 italic">
              No {isPrimer ? 'primer' : 'paint'} added for selected surfaces
            </div>
          )}
          {areaLabel && (
            <div className="text-xs text-muted-foreground/70 truncate flex items-center gap-1">
              <Layers className="w-3 h-3 shrink-0" />
              {areaLabel}
            </div>
          )}
          <div className="text-xs text-muted-foreground truncate flex items-center gap-1.5">
            <IconComp className="w-3.5 h-3.5 shrink-0 text-primary/60" />
            {matLabel || (isPrimer ? 'No primer selected' : 'No paint selected')}
          </div>
        </div>
      </div>
    </div>
  );
}

function MaterialGroupEditorModal({ open, onClose, group, allGroups, onSave, availableMaterials, primerMaterials, rooms, getEffectiveMaterialId, groupResult, allSurfacesData, jobType }: {
  open: boolean;
  onClose: () => void;
  group: MaterialGroup | null;
  allGroups: MaterialGroup[];
  onSave: (group: MaterialGroup) => void;
  availableMaterials: Material[];
  primerMaterials: Material[];
  rooms: RoomConfig[];
  getEffectiveMaterialId: (room: RoomConfig, key: string) => number | null;
  groupResult?: MaterialGroupCalcResult;
  allSurfacesData: Surface[];
  jobType: string;
}) {
  const [draft, setDraft] = useState<MaterialGroup | null>(null);
  const [initialJson, setInitialJson] = useState("");
  const [showDiscardWarning, setShowDiscardWarning] = useState(false);
  const [pendingTypeSwitch, setPendingTypeSwitch] = useState<'paint' | 'primer' | null>(null);
  const [matSearch, setMatSearch] = useState<string | null>(null);
  const [kbHeight, setKbHeight] = useState(0);

  useEffect(() => {
    if (!open) { setKbHeight(0); return; }
    const vv = window.visualViewport;
    const initialH = window.innerHeight;
    const update = () => {
      const winH = window.innerHeight;
      const vvH = vv ? vv.height : winH;
      const offsetTop = vv ? vv.offsetTop : 0;
      // Account for both web (vv shrinks) and iOS native (winH shrinks).
      const kb = Math.max(0, initialH - Math.min(winH, vvH) - offsetTop);
      setKbHeight(kb > 50 ? kb : 0);
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

  useEffect(() => {
    if (open && group) {
      setDraft({ ...group });
      setInitialJson(JSON.stringify(group));
      setMatSearch(null);
    }
  }, [open, group]);

  if (!open || !draft) return null;

  const isPrimer = draft.type === 'primer';
  const colors = isPrimer ? PRIMER_GROUP_COLORS : PAINT_GROUP_COLORS;
  const IconComp = isPrimer ? Droplets : Paintbrush;
  const materials = isPrimer ? primerMaterials : availableMaterials;
  const filtered = matSearch?.trim()
    ? materials.filter(m => `${m.materialName} ${m.brand}`.toLowerCase().includes(matSearch.toLowerCase()))
    : materials;
  const selectedMat = draft.materialId ? [...availableMaterials, ...primerMaterials].find(m => m.id === draft.materialId) : null;
  const matLabel = selectedMat ? `${selectedMat.materialName} (${selectedMat.brand})` : null;

  const hasChanges = JSON.stringify(draft) !== initialJson;

  const sameTypeGroups = allGroups.filter(g => (g.type || 'paint') === (draft.type || 'paint') && g.id !== draft.id);

  const handleClose = () => {
    if (hasChanges) {
      setShowDiscardWarning(true);
    } else {
      onClose();
    }
  };

  const handleSave = () => {
    onSave(draft);
    // Note: we do NOT call onClose() here because parent's onClose has an
    // auto-disable-toggle effect when groups are empty, and the just-added
    // group hasn't flushed to state yet (closure is stale). Parent's onSave
    // handler is responsible for closing the editor after save.
  };

  return (
    <>
      <Dialog open={open && !showDiscardWarning} onOpenChange={(o) => { if (!o) handleClose(); }}>
        <DialogContent
          className="max-w-md max-h-[85dvh] overflow-y-auto z-[10001] top-[50%] translate-y-[-50%]"
          overlayClassName="z-[10001]"
          data-testid="material-group-editor-modal"
          style={kbHeight > 0 ? { paddingBottom: `${kbHeight + 40}px`, maxHeight: '100dvh', bottom: '0', top: 'auto', transform: 'translateX(-50%)' } : undefined}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IconComp className="w-5 h-5" />
              {group?.id?.startsWith('new-') ? 'New Material Group' : 'Edit Material Group'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Group Name</label>
              <Input
                value={draft.name}
                onChange={(e) => setDraft(d => d ? { ...d, name: e.target.value } : d)}
                placeholder="e.g. Walls & Ceilings"
                className="mt-1 text-sm font-medium"
                data-testid="input-group-name"
              />
            </div>

            {rooms.length > 1 && (
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Areas Included</label>
                  {draft.areaIds && draft.areaIds.length > 0 && draft.areaIds.length < rooms.length && (
                    <button
                      type="button"
                      onClick={() => setDraft(d => d ? { ...d, areaIds: undefined } : d)}
                      className="text-[11px] text-primary/70 hover:text-primary"
                      data-testid="button-select-all-areas"
                    >
                      Select all
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {rooms.map((room, ri) => {
                    const allSelected = !draft.areaIds || draft.areaIds.length === 0;
                    const isIncluded = allSelected || draft.areaIds!.includes(room.id);
                    // Build a small surface summary so the user can see what each area has
                    const roomSurfaceLabels: string[] = [];
                    const serviceForType = (allSurfacesData || []).filter(s => s.estimateType === jobType);
                    serviceForType.forEach(s => {
                      const builtIn = (room as any)[s.surfaceKey];
                      const dyn = room.dynamicSurfaces?.[s.surfaceKey]?.enabled;
                      if (builtIn || dyn) roomSurfaceLabels.push(s.surfaceName);
                    });
                    const summary = roomSurfaceLabels.length === 0
                      ? "no surfaces"
                      : roomSurfaceLabels.length <= 3
                        ? roomSurfaceLabels.join(", ")
                        : `${roomSurfaceLabels.slice(0, 2).join(", ")} +${roomSurfaceLabels.length - 2}`;
                    // Symmetric cross-disable: if any currently-selected surface is already
                    // claimed in this room by another same-type group, this room conflicts.
                    const conflictingForArea = draft.surfaceKeys.length > 0 && sameTypeGroups.some(og => {
                      const ogRoomIds = (!og.areaIds || og.areaIds.length === 0) ? rooms.map(r => r.id) : og.areaIds;
                      if (!ogRoomIds.includes(room.id)) return false;
                      return draft.surfaceKeys.some(sk => og.surfaceKeys.includes(sk));
                    });
                    const isAreaDisabled = !isIncluded && conflictingForArea;
                    return (
                      <button
                        key={room.id}
                        type="button"
                        disabled={isAreaDisabled}
                        onClick={() => {
                          const currentIds = draft.areaIds && draft.areaIds.length > 0
                            ? [...draft.areaIds]
                            : rooms.map(r => r.id);
                          const currentlyIncluded = !draft.areaIds || draft.areaIds.length === 0 || draft.areaIds.includes(room.id);
                          let newIds: string[];
                          if (currentlyIncluded) {
                            newIds = currentIds.filter(id => id !== room.id);
                            if (newIds.length === 0) return;
                          } else {
                            newIds = [...currentIds, room.id];
                          }
                          if (newIds.length >= rooms.length) {
                            setDraft(d => d ? { ...d, areaIds: undefined } : d);
                          } else {
                            setDraft(d => d ? { ...d, areaIds: newIds } : d);
                          }
                        }}
                        className={cn(
                          "px-2.5 py-1 rounded-md text-xs border font-medium transition-colors text-left",
                          isIncluded
                            ? colors.chipActive
                            : isAreaDisabled
                              ? "bg-muted/50 border-transparent text-muted-foreground/40 cursor-not-allowed line-through"
                              : "bg-background border-border text-muted-foreground/50 line-through"
                        )}
                        data-testid={`area-chip-${ri}`}
                        title={isAreaDisabled
                          ? `Already used by another group for: ${draft.surfaceKeys.join(", ")}`
                          : roomSurfaceLabels.join(", ")}
                      >
                        <div>{room.name || `Section ${ri + 1}`}</div>
                        <div className="text-[10px] font-normal opacity-70 mt-0.5">{summary}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Surfaces</label>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {(() => {
                  const staticChips: { key: string; label: string }[] = [
                    ...AREA_SURFACES,
                    ...ITEM_SURFACES.map(s => ({ key: s.key, label: s.label })),
                    ...EXTRA_SURFACES.map(s => ({ key: s.key, label: s.label })),
                  ];
                  const staticKeys = new Set(staticChips.map(c => c.key));
                  const serviceSurfaces = (allSurfacesData || []).filter(s => s.estimateType === jobType);
                  const dynamicChips = serviceSurfaces
                    .filter(s => !staticKeys.has(s.surfaceKey))
                    .map(s => ({ key: s.surfaceKey, label: s.surfaceName }));
                  const allSurfaceChips = [...staticChips, ...dynamicChips];
                  // Restrict to surfaces actually enabled on the rooms included in this group.
                  // Check both built-in room flags AND service-defined surfaces.
                  const includedRooms = (!draft.areaIds || draft.areaIds.length === 0)
                    ? rooms
                    : rooms.filter(r => draft.areaIds!.includes(r.id));
                  const isSurfaceEnabledInIncluded = (k: string) =>
                    includedRooms.some(room =>
                      Boolean((room as any)[k]) || Boolean(room.dynamicSurfaces?.[k]?.enabled)
                    );
                  return allSurfaceChips.filter(({ key }) => {
                    if (draft.surfaceKeys.includes(key)) return true;
                    return isSurfaceEnabledInIncluded(key);
                  });
                })().map(({ key, label }) => {
                  const isInThisGroup = draft.surfaceKeys.includes(key);
                  const otherGroupsWithKey = sameTypeGroups.filter(g => g.surfaceKeys.includes(key));
                  const thisGroupAreaIds = draft.areaIds;
                  // Block if ANY other same-type group already claims this surface in any area that overlaps with this group's areas
                  const conflictingGroup = otherGroupsWithKey.find(og => {
                    const thisRoomIds = (thisGroupAreaIds && thisGroupAreaIds.length > 0)
                      ? thisGroupAreaIds
                      : rooms.map(r => r.id);
                    const ogRoomIds = (!og.areaIds || og.areaIds.length === 0)
                      ? rooms.map(r => r.id)
                      : og.areaIds;
                    const ogSet = new Set(ogRoomIds);
                    return thisRoomIds.some(id => ogSet.has(id));
                  });
                  const isFullyDisabled = !isInThisGroup && !!conflictingGroup;
                  const isPartial = false;
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={isFullyDisabled}
                      onClick={() => {
                        const keys = isInThisGroup
                          ? draft.surfaceKeys.filter(k => k !== key)
                          : [...draft.surfaceKeys, key];
                        const matCounts: Record<number, number> = {};
                        if (!isPrimer) {
                          rooms.forEach(room => {
                            keys.forEach(sk => {
                              const sKey = sk as SurfaceKey;
                              if (!room[sKey]) return;
                              const matId = getEffectiveMaterialId(room, sKey);
                              if (matId != null) matCounts[matId] = (matCounts[matId] || 0) + 1;
                            });
                          });
                        }
                        let bestMat: number | null = draft.materialId || null;
                        if (!isPrimer && Object.keys(matCounts).length > 0) {
                          let bestCount = 0;
                          Object.entries(matCounts).forEach(([id, count]) => {
                            if (count > bestCount) { bestCount = count; bestMat = Number(id); }
                          });
                        }
                        setDraft(d => d ? { ...d, surfaceKeys: keys, materialId: keys.length > 0 ? bestMat : d.materialId } : d);
                      }}
                      className={cn(
                        "px-3 py-1.5 rounded-md text-xs border font-medium transition-colors",
                        isInThisGroup
                          ? colors.chipActive
                          : isFullyDisabled
                            ? "bg-muted/50 border-transparent text-muted-foreground/40 cursor-not-allowed"
                            : isPartial
                              ? "bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover-elevate"
                              : "bg-background border-border text-muted-foreground hover-elevate"
                      )}
                      data-testid={`surface-chip-${key}`}
                    >
                      {label}{isPartial && ' •'}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-foreground uppercase tracking-wide block mb-2">Group Type</label>
              <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-muted/40 border border-border">
                <button
                  type="button"
                  onClick={() => {
                    if (isPrimer) {
                      if (draft.materialId) { setPendingTypeSwitch('paint'); } else { setDraft(d => d ? { ...d, type: 'paint', materialId: null } : d); }
                    }
                  }}
                  className={cn(
                    "flex items-center justify-center gap-2 py-3 px-3 rounded-lg text-sm font-bold transition-all",
                    !isPrimer
                      ? "bg-emerald-500 text-white shadow-md ring-2 ring-emerald-500/30"
                      : "text-muted-foreground hover:text-foreground hover:bg-background/60"
                  )}
                  data-testid="toggle-type-paint"
                >
                  <Paintbrush className="w-5 h-5" />
                  Paint Group
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!isPrimer) {
                      if (draft.materialId) { setPendingTypeSwitch('primer'); } else { setDraft(d => d ? { ...d, type: 'primer', materialId: null } : d); }
                    }
                  }}
                  className={cn(
                    "flex items-center justify-center gap-2 py-3 px-3 rounded-lg text-sm font-bold transition-all",
                    isPrimer
                      ? "bg-amber-500 text-white shadow-md ring-2 ring-amber-500/30"
                      : "text-muted-foreground hover:text-foreground hover:bg-background/60"
                  )}
                  data-testid="toggle-type-primer"
                >
                  <Droplets className="w-5 h-5" />
                  Primer Group
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug">
                {isPrimer
                  ? "Groups primer across surfaces. Only applies where Primer is enabled — surfaces without primer are skipped, but the group stays ready if you turn primer on later."
                  : "Groups paint across surfaces so a single bucket covers them all."}
              </p>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {isPrimer ? 'Primer Material' : 'Paint Material'}
              </label>
              <div className="mt-1.5 relative" data-testid="material-dropdown-group">
                <button
                  type="button"
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md border text-sm transition-colors",
                    draft.materialId
                      ? "border-primary/30 bg-primary/5 text-foreground font-medium"
                      : draft.surfaceKeys.length > 0
                        ? "border-red-400 dark:border-red-600 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400"
                        : "border-dashed border-border text-muted-foreground"
                  )}
                  onClick={() => setMatSearch(prev => prev === null ? "" : null)}
                  data-testid="button-group-material"
                >
                  <IconComp className={cn("w-4 h-4 shrink-0", !draft.materialId && draft.surfaceKeys.length > 0 && "text-red-500")} />
                  <span className="truncate flex-1 text-left">
                    {matLabel || (isPrimer ? 'Select primer...' : 'Select paint...')}
                  </span>
                  <ChevronDown className={cn("w-4 h-4 shrink-0 text-muted-foreground transition-transform", matSearch !== null && "rotate-180")} />
                </button>
                {matSearch !== null && (
                  <>
                    <div
                      className="fixed inset-0 z-[10001]"
                      onClick={() => setMatSearch(null)}
                    />
                    <div
                      className="absolute left-0 right-0 top-full mt-1 z-[10002] rounded-md border border-border bg-background shadow-lg"
                      style={kbHeight > 0 ? { paddingBottom: `${kbHeight}px` } : undefined}
                    >
                      {materials.length > 4 && (
                        <div className="p-1.5 border-b border-border/50">
                          <Input
                            value={matSearch}
                            onChange={(e) => setMatSearch(e.target.value)}
                            placeholder="Search materials..."
                            className="h-8 text-xs"
                            autoFocus
                            data-no-autoscroll
                            data-testid="material-search-group"
                          />
                        </div>
                      )}
                      <div className="overflow-y-auto" style={{ maxHeight: kbHeight > 0 ? `calc(50vh - ${kbHeight}px)` : '200px' }}>
                        {materials.length === 0 && (
                          <div className="px-3 py-2 text-sm text-muted-foreground">{isPrimer ? 'No primers configured' : 'No paints configured'}</div>
                        )}
                        {filtered.map(m => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              setDraft(d => d ? { ...d, materialId: m.id } : d);
                              setMatSearch(null);
                            }}
                            className={cn(
                              "w-full text-left px-3 py-2 text-sm hover:bg-accent border-b border-border/20 last:border-b-0 transition-colors",
                              m.id === draft.materialId && "bg-primary/10 font-medium"
                            )}
                            data-testid={`material-option-${m.id}`}
                          >
                            <div className="font-medium">{m.materialName} ({m.brand})</div>
                            <div className="text-xs text-muted-foreground">
                              ${m.costPerUnit.toFixed(2)}/gal · {m.coverageSqftPerGallon} sqft/gal
                            </div>
                          </button>
                        ))}
                        {filtered.length === 0 && materials.length > 0 && (
                          <div className="px-3 py-2 text-sm text-muted-foreground">No matches</div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {draft.materialId && groupResult && (
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Gallons Override <span className="opacity-60 normal-case">(optional)</span>
                </label>
                <div className="mt-1.5 flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    value={draft.qtyToBuyOverride ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setDraft(d => d ? { ...d, qtyToBuyOverride: v === "" ? null : Math.max(0, Math.floor(Number(v))) } : d);
                    }}
                    placeholder={`Auto: ${Math.ceil(groupResult.exactQtyNeeded)} gal`}
                    className="text-sm"
                    data-testid="input-group-qty-override"
                  />
                  {draft.qtyToBuyOverride != null && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setDraft(d => d ? { ...d, qtyToBuyOverride: null } : d)}
                      data-testid="button-clear-qty-override"
                    >
                      Reset
                    </Button>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Needs {groupResult.exactQtyNeeded.toFixed(2)} gal · auto rounds to {Math.ceil(groupResult.exactQtyNeeded)}. Override to buy fewer or more.
                </p>
              </div>
            )}

          </div>

          {!groupResult && draft.materialId && draft.surfaceKeys.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>No {isPrimer ? 'primer' : 'paint'} sqft found for selected surfaces — this group won't affect calculations until {isPrimer ? 'primer' : 'paint'} is enabled on those surfaces.</span>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={handleClose} data-testid="button-cancel-group">
              Cancel
            </Button>
            <Button onClick={handleSave} data-testid="button-save-group" data-mutating="true">
              <Save className="w-4 h-4 mr-1.5" />
              Save Group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDiscardWarning} onOpenChange={setShowDiscardWarning}>
        <AlertDialogContent className="z-[10002]" overlayClassName="z-[10002]">
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your changes to this material group will not be saved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Editing</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setShowDiscardWarning(false); onClose(); }}>
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!pendingTypeSwitch} onOpenChange={(o) => { if (!o) setPendingTypeSwitch(null); }}>
        <AlertDialogContent className="z-[10002]" overlayClassName="z-[10002]">
          <AlertDialogHeader>
            <AlertDialogTitle>Switch to {pendingTypeSwitch === 'primer' ? 'Primer' : 'Paint'}?</AlertDialogTitle>
            <AlertDialogDescription>
              Switching type will clear the currently selected {isPrimer ? 'primer' : 'paint'}{matLabel ? ` (${matLabel})` : ''}. You'll need to pick a new {pendingTypeSwitch === 'primer' ? 'primer' : 'paint'} material.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              const newType = pendingTypeSwitch!;
              setDraft(d => d ? { ...d, type: newType, materialId: null } : d);
              setPendingTypeSwitch(null);
            }}>
              Switch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function MaterialSummaryCard({ costs, label, groupedNotes }: { costs: MaterialCostEntry[]; label?: string; groupedNotes?: { surfaces: string[]; materialName: string }[] }) {
  const hasNotes = (groupedNotes?.length || 0) > 0;
  if (costs.length === 0 && !hasNotes) return null;
  const total = costs.reduce((s, c) => s + c.totalCost - (c.excludedCost || 0), 0);
  return (
    <div className="rounded-lg border-2 border-border/60 bg-card dark:bg-card px-2.5 py-2 space-y-2" data-testid="material-summary">
      {label && <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">{label}</span>}
      {costs.map((c, i) => {
        const fullyExcluded = c.excludedSqft != null && c.totalSqft > 0 && c.excludedSqft >= c.totalSqft - 0.01;
        const partiallyExcluded = !fullyExcluded && (c.excludedCost || 0) > 0;
        const billedCost = c.totalCost - (c.excludedCost || 0);
        return (
          <div key={i} className="text-sm space-y-0.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-foreground truncate">{c.surfaceName}</span>
              {fullyExcluded ? (
                <span className="tabular-nums text-amber-700 dark:text-amber-400 shrink-0 text-xs italic">Not billed</span>
              ) : (
                <span className="tabular-nums text-muted-foreground shrink-0">${billedCost.toFixed(2)}</span>
              )}
            </div>
            <div className="text-xs text-muted-foreground pl-2 space-y-0">
              <div>{c.materialName}</div>
              <div>{c.totalSqft.toFixed(0)} sqft to cover — {c.coveragePerUnit} sqft/{c.materialUnit}</div>
              <div>{c.exactQtyNeeded.toFixed(2)} {c.materialUnit} needed — Buy {c.qtyToBuy} {c.materialUnit} @ ${c.costPerUnit.toFixed(2)}/{c.materialUnit}</div>
              {partiallyExcluded && (
                <div className="text-amber-700 dark:text-amber-400 italic">Excludes ${(c.excludedCost || 0).toFixed(2)} not billed to customer</div>
              )}
            </div>
          </div>
        );
      })}
      {hasNotes && (
        <div className="border-t border-border/60 pt-1.5 space-y-0.5" data-testid="material-grouped-note">
          {groupedNotes!.map((n, i) => (
            <div key={i} className="text-[11px] text-muted-foreground italic leading-snug">
              {n.surfaces.join(", ")} tracked in shared material group ({n.materialName})
            </div>
          ))}
        </div>
      )}
      {costs.length > 0 && (
        <div className="flex items-center justify-between text-[12px] font-semibold border-t border-border pt-1">
          <span>Materials Total</span>
          <span className="tabular-nums">${total.toFixed(2)}</span>
        </div>
      )}
    </div>
  );
}

function roomBuilderRoomToConfig(r: RoomBuilderRoom, index: number, defaultDoorH: number, defaultDoorW: number): RoomConfig {
  return {
    id: r.id,
    name: r.name,
    sectionType: (r as any).sectionType || 'room',
    length: r.length,
    width: r.width,
    ceilingHeight: r.ceilingHeight,
    walls: r.walls,
    ceiling: r.ceiling,
    baseboard: r.baseboard,
    crownMolding: r.crownMolding,
    shoeMolding: r.shoeMolding,
    chairRail: r.chairRail,
    doorCount: r.doorCount,
    windowCount: r.windowCount,
    doorCasing: r.doorCasing,
    windowCasing: r.windowCasing,
    doors: r.doors,
    cabinets: !!(r as any).cabinets,
    cabinetsLf: (r as any).cabinetsLf || 0,
    staircaseRailing: !!(r as any).staircaseRailing,
    staircaseRailingLf: (r as any).staircaseRailingLf || 0,
    accentWall: !!(r as any).accentWall,
    accentWallSqft: (r as any).accentWallSqft || 0,
    closetInterior: !!(r as any).closetInterior,
    closetInteriorSqft: (r as any).closetInteriorSqft || 0,
    doorHeightFt: r.doorHeightFt ?? defaultDoorH,
    doorWidthFt: r.doorWidthFt ?? defaultDoorW,
    expanded: index === 0,
    scopeNotes: r.scopeNotes || "",
    isOptional: !!(r as any).isOptional,
    coatsOverride: (r.coatsOverride || {}) as Partial<Record<SurfaceKey, number>>,
    materialOverride: (r.materialOverride || {}) as Partial<Record<SurfaceKey, number | null>>,
    primerOverride: (r.primerOverride || {}) as Record<string, { enabled: boolean; coats?: number; materialId?: number | null }>,
    paintOverride: ((r as any).paintOverride || {}) as Record<string, { enabled: boolean }>,
    surfaceDescriptionOverride: r.surfaceDescriptionOverride || undefined,
    complexityOverride: r.complexityOverride
      ? Object.fromEntries(Object.entries(r.complexityOverride).map(([k, v]) => {
          return [k, v || 0];
        }))
      : undefined,
    repairOverride: r.repairOverride
      ? Object.fromEntries(Object.entries(r.repairOverride).map(([k, v]: [string, any]) => {
          if (v && typeof v === 'object' && 'enabled' in v && !('hours' in v)) {
            return [k, { hours: 0, description: v.description }];
          }
          return [k, v];
        }))
      : undefined,
    priceOverride: (r as any).priceOverride ?? undefined,
    photos: (r as any).photos || undefined,
    wallSelections: normalizeWallSelections((r as any).wallSelections),
    dynamicSurfaces: (r as any).dynamicSurfaces || {},
    surfacePriceOverride: (r as any).surfacePriceOverride || undefined,
    excludeMaterialCost: (r as any).excludeMaterialCost || undefined,
    excludePrimerCost: (r as any).excludePrimerCost || undefined,
  } as any;
}

function computeMaterialCosts(
  roomResults: RoomCalcResult[],
  rooms: RoomConfig[],
  surfaces: Surface[],
  allMaterials: Material[],
  sameColor: boolean,
  getEffectiveMaterialId: (room: RoomConfig, key: string) => number | null,
  areaIndex?: number,
  getExcludeMaterial?: (room: RoomConfig, key: string) => boolean,
  getExcludePrimer?: (room: RoomConfig, key: string) => boolean,
): MaterialCostEntry[] {
  const materialAggregates: Record<string, { totalSqft: number; excludedSqft: number; materialId: number }> = {};

  const startIdx = areaIndex !== undefined ? areaIndex : 0;
  const endIdx = areaIndex !== undefined ? areaIndex + 1 : roomResults.length;

  for (let roomIdx = startIdx; roomIdx < endIdx; roomIdx++) {
    const result = roomResults[roomIdx];
    const room = rooms[roomIdx];
    if (!result) continue;
    result.surfaces.forEach(calc => {
      const paintExcluded = getExcludeMaterial ? getExcludeMaterial(room, calc.surfaceKey) : false;
      const primerExcluded = getExcludePrimer ? getExcludePrimer(room, calc.surfaceKey) : false;
      const matId = getEffectiveMaterialId(room, calc.surfaceKey);
      if (matId) {
        const aggKey = `${calc.surfaceName}::${matId}`;
        if (!materialAggregates[aggKey]) {
          materialAggregates[aggKey] = { totalSqft: 0, excludedSqft: 0, materialId: matId };
        }
        materialAggregates[aggKey].totalSqft += calc.paintableSqft;
        if (paintExcluded) materialAggregates[aggKey].excludedSqft += calc.paintableSqft;
      }

      if (calc.primerPaintableSqft && calc.primerPaintableSqft > 0 && calc.primerMaterialId) {
        const primerKey = `${calc.surfaceName} (Primer)::${calc.primerMaterialId}`;
        if (!materialAggregates[primerKey]) {
          materialAggregates[primerKey] = { totalSqft: 0, excludedSqft: 0, materialId: calc.primerMaterialId };
        }
        materialAggregates[primerKey].totalSqft += calc.primerPaintableSqft;
        if (primerExcluded) materialAggregates[primerKey].excludedSqft += calc.primerPaintableSqft;
      }
    });
  }

  const costs: MaterialCostEntry[] = [];
  Object.entries(materialAggregates).forEach(([aggKey, { totalSqft, excludedSqft, materialId }]) => {
    const material = allMaterials.find(m => m.id === materialId);
    if (!material || !material.coverageSqftPerGallon || material.coverageSqftPerGallon <= 0) return;

    const baseQty = totalSqft / material.coverageSqftPerGallon;
    const wasteMultiplier = 1 + (material.wastePercentage || 0);
    const exactQtyNeeded = baseQty * wasteMultiplier;
    const qtyToBuy = Math.ceil(exactQtyNeeded);
    const markupMultiplier = 1 + ((material.markupPercentage || 0) / 100);
    const customerPrice = material.costPerUnit * markupMultiplier;
    const totalCost = qtyToBuy * customerPrice;
    const excludedRatio = totalSqft > 0 ? excludedSqft / totalSqft : 0;
    const excludedCost = totalCost * excludedRatio;
    const surfaceName = aggKey.split("::")[0];

    costs.push({
      surfaceName,
      materialName: `${material.materialName} (${material.brand})`,
      materialUnit: "gal",
      totalSqft,
      coveragePerUnit: material.coverageSqftPerGallon,
      exactQtyNeeded,
      qtyToBuy,
      costPerUnit: customerPrice,
      totalCost,
      excludedSqft: excludedSqft > 0 ? excludedSqft : undefined,
      excludedCost: excludedCost > 0 ? excludedCost : undefined,
    });
  });

  return costs;
}

function RoomPhotoAnnotated({ photo, areaName }: { photo: { url: string; annotations?: any[] | null }; areaName: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const annots = (photo.annotations as Annotation[] | null) || [];
  const hasAnnotations = annots.length > 0;

  useEffect(() => { setImgLoaded(false); }, [photo.url]);

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
  }, [imgLoaded, photo.annotations]);

  return (
    <div className="relative max-w-full max-h-full flex items-center justify-center">
      <img
        ref={imgRef}
        src={photo.url}
        alt={`${areaName} photo`}
        className="max-w-full max-h-full object-contain"
        onLoad={() => setImgLoaded(true)}
      />
      {hasAnnotations && imgLoaded && (
        <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />
      )}
    </div>
  );
}

export function RoomBuilder({ onGenerateLineItems, onCancel, onSaveRoomData, onDirty, initialRoomData, initialBlockName, initialTaxable, initialTaxProfileId, initialService, initialEditingRoomId, onInitialRoomConsumed, onSectionEditorClose, taxRate, taxProfiles, builderRef, projectId, sellRateSnapshot }: RoomBuilderProps) {
  const { toast } = useToast();
  const { isAdmin } = useSubscription();
  const [blockName, setBlockName] = useState(initialBlockName || initialService || "Interior Painting");
  const [blockTaxable, setBlockTaxable] = useState(initialTaxable ?? false);
  const [selectedTaxProfileId, setSelectedTaxProfileId] = useState<number | undefined>(initialTaxProfileId);
  
  const [estimatorTiming, setEstimatorTiming] = useState<EstimatorTimingReport | null>(null);
  const [showMaterialWarning, setShowMaterialWarning] = useState(false);
  const [jobType, setJobType] = useState(() => {
    return initialRoomData?.estimateType || initialService || "Residential Interior";
  });
  const isDev = typeof window !== 'undefined' && (window.location.hostname.includes('replit') || window.location.hostname === 'localhost');
  const showTiming = isDev || isAdmin;

  const { data: financialData, isLoading: finLoading } = useQuery<FinancialSettingsData>({
    queryKey: ["/api/financial-settings"],
  });

  const { data: allSurfacesData, isLoading: surfLoading } = useQuery<Surface[]>({
    queryKey: ["/api/surfaces"],
  });

  const { data: estimateTypes } = useQuery<string[]>({
    queryKey: ["/api/surfaces/estimate-types"],
  });

  const { data: finSettingsData } = useQuery<any>({
    queryKey: ["/api/financial-settings"],
  });

  const customServiceSectionTypes: Record<string, SectionType> = useMemo(() => {
    const raw = finSettingsData?.settings?.serviceSectionTypes;
    if (!raw || typeof raw !== 'object') return {};
    return raw as Record<string, SectionType>;
  }, [finSettingsData]);

  const resolveSectionType = useCallback((service: string): SectionType => {
    return customServiceSectionTypes[service] || getSectionTypeForService(service);
  }, [customServiceSectionTypes]);

  const surfacesData = useMemo(() => {
    if (!allSurfacesData) return undefined;
    const filtered = allSurfacesData.filter(s => s.estimateType === jobType);
    return filtered.length > 0 ? filtered : allSurfacesData;
  }, [allSurfacesData, jobType]);

  const hasNoSurfacesForJobType = useMemo(() => {
    if (!allSurfacesData) return false;
    return allSurfacesData.filter(s => s.estimateType === jobType).length === 0;
  }, [allSurfacesData, jobType]);

  const { activeInteriorKeys, dynamicSurfaceDefs } = useMemo(() => {
    const active = new Set<SurfaceKey>();
    const dynamic: Array<{ surfaceKey: string; surfaceName: string; unit: string; rate: number; coats: number; surface: Surface }> = [];
    if (!surfacesData) return { activeInteriorKeys: active, dynamicSurfaceDefs: dynamic };
    for (const s of surfacesData) {
      const interiorKey = DB_NAME_TO_INTERIOR_KEY[s.surfaceName.toLowerCase()];
      if (interiorKey) {
        active.add(interiorKey);
      } else {
        dynamic.push({
          surfaceKey: s.surfaceKey,
          surfaceName: s.surfaceName,
          unit: s.unit || "sqft",
          rate: s.productionRateUnitsPerLaborHour || 100,
          coats: s.defaultCoats || 2,
          surface: s,
        });
      }
    }
    return { activeInteriorKeys: active, dynamicSurfaceDefs: dynamic };
  }, [surfacesData]);

  const hasInteriorSurfaces = activeInteriorKeys.size > 0;

  const { data: teamMembers } = useQuery<TeamMember[]>({
    queryKey: ["/api/team-members"],
  });

  const { data: materialsData } = useQuery<Material[]>({
    queryKey: ["/api/materials"],
  });

  const settings = financialData?.settings;
  const surfaces = surfacesData || [];
  const doorWDefault = settings?.defaultDoorWidthFt || 3;
  const doorHDefault = settings?.defaultDoorHeightFt || 7;
  const windowW = settings?.defaultWindowWidthFt || 3;
  const windowH = settings?.defaultWindowHeightFt || 4;
  const [displayToggles, setDisplayToggles] = useState<DisplayToggles>(() => {
    if (initialRoomData?.displayToggles) return initialRoomData.displayToggles;
    return {
      showLaborHrs: settings?.defaultShowLaborHrs ?? true,
      showLaborPrice: settings?.defaultShowLaborPrice ?? true,
      showMaterialQty: settings?.defaultShowMaterialQty ?? true,
      showMaterialPrice: settings?.defaultShowMaterialPrice ?? true,
      showSurfaceDetails: settings?.defaultShowSurfaceDetails ?? true,
      showSurfaceTotal: false,
      showRepairPrice: false,
      showCostBreakdown: true,
    };
  });

  const [materialGroups, setMaterialGroups] = useState<MaterialGroup[]>(() => {
    return initialRoomData?.materialGroups || [];
  });

  const [showMaterialGroups, setShowMaterialGroups] = useState(() => {
    return (initialRoomData?.materialGroups?.length || 0) > 0;
  });

  const [primerGroups, setPrimerGroups] = useState<MaterialGroup[]>(() => {
    return initialRoomData?.primerGroups || [];
  });

  const [showPrimerGroups, setShowPrimerGroups] = useState(() => {
    return (initialRoomData?.primerGroups?.length || 0) > 0;
  });

  const [editingGroup, setEditingGroup] = useState<MaterialGroup | null>(null);
  const [showGroupEditor, setShowGroupEditor] = useState(false);
  const [groupToRemove, setGroupToRemove] = useState<MaterialGroup | null>(null);
  const [sectionToRemove, setSectionToRemove] = useState<number | null>(null);
  const [surfaceToRemove, setSurfaceToRemove] = useState<{ roomIndex: number; key: string; isDynamic: boolean; surfaceName: string } | null>(null);
  const [editingRoomIndex, setEditingRoomIndex] = useState<number | null>(null);
  const [editingSnapshot, setEditingSnapshot] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [sectionKbHeight, setSectionKbHeight] = useState(0);

  useEffect(() => {
    if (editingRoomIndex === null) { setSectionKbHeight(0); return; }
    document.body.style.overflow = 'hidden';
    const vv = window.visualViewport;
    const initialH = window.innerHeight;
    const update = () => {
      const winH = window.innerHeight;
      const vvH = vv ? vv.height : winH;
      const offsetTop = vv ? vv.offsetTop : 0;
      const kb = Math.max(0, initialH - Math.min(winH, vvH) - offsetTop);
      setSectionKbHeight(kb > 50 ? kb : 0);
    };
    update();
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      document.body.style.overflow = '';
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [editingRoomIndex]);

  const [sameColorAllAreas, setSameColorAllAreas] = useState(() => {
    return initialRoomData?.sameColorAllAreas ?? settings?.defaultSameColorAllAreas ?? true;
  });

  const [subtractOpenings, setSubtractOpenings] = useState(() => {
    return initialRoomData?.subtractOpenings ?? false;
  });

  const [customerProvidingMaterials, setCustomerProvidingMaterials] = useState(() => {
    return initialRoomData?.customerProvidingMaterials ?? false;
  });

  const defaultsAppliedRef = useRef(false);
  useEffect(() => {
    if (!initialRoomData && settings && !defaultsAppliedRef.current) {
      defaultsAppliedRef.current = true;
      setSameColorAllAreas(settings.defaultSameColorAllAreas ?? true);
      setDisplayToggles({
        showLaborHrs: settings.defaultShowLaborHrs ?? true,
        showLaborPrice: settings.defaultShowLaborPrice ?? true,
        showMaterialQty: settings.defaultShowMaterialQty ?? true,
        showMaterialPrice: settings.defaultShowMaterialPrice ?? true,
        showSurfaceDetails: settings.defaultShowSurfaceDetails ?? true,
        showSurfaceTotal: displayToggles.showSurfaceTotal ?? false,
        showRepairPrice: displayToggles.showRepairPrice ?? false,
        showCostBreakdown: displayToggles.showCostBreakdown ?? true,
      });
    }
  }, [settings, initialRoomData]);

  const [rooms, setRooms] = useState<RoomConfig[]>(() => {
    if (initialRoomData?.rooms?.length) {
      return initialRoomData.rooms.map((r, i) => roomBuilderRoomToConfig(r, i, doorHDefault, doorWDefault));
    }
    return [];
  });

  const pendingOpenIndexRef = useRef<number | null>(null);
  const newSectionIndexRef = useRef<number | null>(null);
  const initialRoomConsumedRef = useRef(false);

  useEffect(() => {
    const idx = pendingOpenIndexRef.current;
    if (idx !== null && rooms[idx]) {
      pendingOpenIndexRef.current = null;
      setEditingSnapshot(JSON.stringify(rooms[idx]));
      setEditingRoomIndex(idx);
    }
  }, [rooms]);

  useLayoutEffect(() => {
    if (initialRoomConsumedRef.current) return;
    if (!initialEditingRoomId) return;
    const idx = rooms.findIndex(r => r.id === initialEditingRoomId);
    if (idx < 0) return;
    initialRoomConsumedRef.current = true;
    setEditingSnapshot(JSON.stringify(rooms[idx]));
    setEditingRoomIndex(idx);
    onInitialRoomConsumed?.();
  }, [initialEditingRoomId, rooms, onInitialRoomConsumed]);

  const openSectionEditor = useCallback((index: number) => {
    const room = rooms[index];
    if (!room) {
      pendingOpenIndexRef.current = index;
      return;
    }
    setEditingSnapshot(JSON.stringify(room));
    setEditingRoomIndex(index);
  }, [rooms]);

  const closeSectionEditor = useCallback(() => {
    setEditingRoomIndex(null);
    setEditingSnapshot(null);
    setShowCancelConfirm(false);
  }, []);

  const handleSectionSave = useCallback(() => {
    newSectionIndexRef.current = null;
    closeSectionEditor();
    onSectionEditorClose?.(true);
  }, [closeSectionEditor, onSectionEditorClose]);

  const handleSectionCancel = useCallback(() => {
    if (editingRoomIndex === null || editingSnapshot === null) {
      closeSectionEditor();
      onSectionEditorClose?.(false);
      return;
    }
    if (newSectionIndexRef.current === editingRoomIndex) {
      const removeIdx = editingRoomIndex;
      newSectionIndexRef.current = null;
      setRooms(prev => prev.filter((_, i) => i !== removeIdx));
      closeSectionEditor();
      onSectionEditorClose?.(false);
      return;
    }
    const currentRoom = rooms[editingRoomIndex];
    const current = currentRoom ? JSON.stringify(currentRoom) : null;
    if (current !== editingSnapshot) {
      setShowCancelConfirm(true);
    } else {
      closeSectionEditor();
      onSectionEditorClose?.(false);
    }
  }, [editingRoomIndex, editingSnapshot, rooms, closeSectionEditor, onSectionEditorClose]);

  const handleConfirmCancel = useCallback(() => {
    if (editingRoomIndex !== null && editingSnapshot != null) {
      try {
        const restored = JSON.parse(editingSnapshot) as RoomConfig;
        setRooms(prev => prev.map((r, i) => i === editingRoomIndex ? restored : r));
      } catch {}
    }
    closeSectionEditor();
    onSectionEditorClose?.(false);
  }, [editingRoomIndex, editingSnapshot, closeSectionEditor, onSectionEditorClose]);

  const [expandedSurfaces, setExpandedSurfaces] = useState<Record<string, boolean>>({});
  const toggleSurfaceExpand = (roomIndex: number, key: string) => {
    const id = `${roomIndex}-${key}`;
    setExpandedSurfaces(prev => ({ ...prev, [id]: !prev[id] }));
  };
  const isSurfaceExpanded = (roomIndex: number, key: string) => !!expandedSurfaces[`${roomIndex}-${key}`];

  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [wallEditModal, setWallEditModal] = useState<{ roomIndex: number; wallSelections: Array<{ enabled: boolean; sqftOverride: number | null; _defaultSqft: number }> } | null>(null);

  const normalizeRoomForSnapshot = (r: RoomConfig) => ({
    name: r.name, sectionType: r.sectionType || 'room', length: r.length, width: r.width, ceilingHeight: r.ceilingHeight,
    walls: r.walls, ceiling: r.ceiling, baseboard: r.baseboard, crownMolding: r.crownMolding,
    shoeMolding: r.shoeMolding, chairRail: r.chairRail, doorCount: r.doorCount, windowCount: r.windowCount,
    doorCasing: r.doorCasing, windowCasing: r.windowCasing, doors: r.doors,
    doorHeightFt: r.doorHeightFt, doorWidthFt: r.doorWidthFt,
    cabinets: r.cabinets, cabinetsLf: r.cabinetsLf,
    staircaseRailing: r.staircaseRailing, staircaseRailingLf: r.staircaseRailingLf,
    accentWall: r.accentWall, accentWallSqft: r.accentWallSqft,
    closetInterior: r.closetInterior, closetInteriorSqft: r.closetInteriorSqft,
    scopeNotes: r.scopeNotes,
    coatsOverride: r.coatsOverride, materialOverride: r.materialOverride,
    wallSelections: r.wallSelections,
    dynamicSurfaces: r.dynamicSurfaces,
  });

  const initialSnapshot = useRef({
    blockName: initialBlockName || initialService || "Interior Painting",
    roomsJson: JSON.stringify(rooms.map(normalizeRoomForSnapshot)),
    materialGroupsJson: JSON.stringify(initialRoomData?.materialGroups || []),
    primerGroupsJson: JSON.stringify(initialRoomData?.primerGroups || []),
  });

  const hasUnsavedChanges = useCallback(() => {
    const snap = initialSnapshot.current;
    if (blockName !== snap.blockName) return true;
    const currentJson = JSON.stringify(rooms.map(normalizeRoomForSnapshot));
    if (currentJson !== snap.roomsJson) return true;
    if (JSON.stringify(materialGroups) !== snap.materialGroupsJson) return true;
    if (JSON.stringify(primerGroups) !== snap.primerGroupsJson) return true;
    return false;
  }, [blockName, rooms, materialGroups, primerGroups]);

  const handleCancelClick = useCallback(() => {
    if (hasUnsavedChanges()) {
      setShowDiscardDialog(true);
    } else {
      onCancel();
    }
  }, [hasUnsavedChanges, onCancel]);

  const handleGenerateRef = useRef<() => void>(() => {});
  const doGenerateRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (builderRef) {
      builderRef.current = {
        requestClose: handleCancelClick,
        requestSave: () => handleGenerateRef.current(),
        requestAutoSave: () => doGenerateRef.current(),
      };
    }
    return () => {
      if (builderRef) builderRef.current = null;
    };
  }, [builderRef, handleCancelClick]);

  const onDirtyRef = useRef(onDirty);
  onDirtyRef.current = onDirty;
  const hasInitializedRef = useRef(false);
  useEffect(() => {
    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      return;
    }
    onDirtyRef.current?.();
  }, [rooms, blockName, blockTaxable, materialGroups, primerGroups, customerProvidingMaterials, subtractOpenings]);

  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragHandleActiveRef = useRef(false);

  const handleGripMouseDown = useCallback(() => {
    dragHandleActiveRef.current = true;
  }, []);

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    if (!dragHandleActiveRef.current) { e.preventDefault(); return; }
    dragIndexRef.current = index;
    setIsDragging(true);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
    const target = e.currentTarget as HTMLElement;
    requestAnimationFrame(() => { target.style.opacity = "0.4"; });
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    (e.currentTarget as HTMLElement).style.opacity = "1";
    dragIndexRef.current = null;
    dragHandleActiveRef.current = false;
    setDragOverIndex(null);
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIndex(index);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    const fromIndex = dragIndexRef.current;
    if (fromIndex === null || fromIndex === dropIndex) {
      setDragOverIndex(null);
      setIsDragging(false);
      return;
    }
    setRooms(prev => {
      const updated = [...prev];
      const item = updated[fromIndex];
      updated.splice(fromIndex, 1);
      const adjustedIndex = fromIndex < dropIndex ? dropIndex - 1 : dropIndex;
      updated.splice(adjustedIndex, 0, item);
      return updated;
    });
    dragIndexRef.current = null;
    dragHandleActiveRef.current = false;
    setDragOverIndex(null);
    setIsDragging(false);
  }, []);

  const [rateOverride, setRateOverride] = useState<number | null>(
    initialRoomData?.sellRate && sellRateSnapshot != null && initialRoomData.sellRate !== sellRateSnapshot
      ? initialRoomData.sellRate
      : null
  );
  const [showRateModal, setShowRateModal] = useState(false);
  const [rateModalInput, setRateModalInput] = useState<string>('');
  const [showResetRateConfirm, setShowResetRateConfirm] = useState(false);
  const effectiveSellRate = useMemo(() => {
    if (rateOverride != null && rateOverride > 0) return rateOverride;
    if (sellRateSnapshot != null && sellRateSnapshot > 0) return sellRateSnapshot;
    if (!financialData?.settings) return 0;
    const s = financialData.settings;
    let laborCost = 0;
    if (s.useProductionTeamForLaborCost && teamMembers) {
      const eligible = teamMembers.filter(m => m.isActive && m.activeForPricing && m.employeeType === "production");
      if (eligible.length > 0) {
        const totalCost = eligible.reduce((sum, m) => {
          const base = (m.hourlyRate || 0) / 100;
          const burden = base * (m.payrollBurdenPercentage || 0);
          const wc = base * (m.workersCompPercentage || 0);
          const benefits = (m.benefitsPerHour || 0) / 100;
          return sum + base + burden + wc + benefits;
        }, 0);
        laborCost = totalCost / eligible.length;
      }
    } else {
      laborCost = (s.manualLaborCostPerHour || 0);
    }
    if (s.sellRatePerHour && s.sellRatePerHour > 0) return s.sellRatePerHour;
    const margin = s.targetGrossMarginPercentage || 0.5;
    if (margin >= 1) return 0;
    return laborCost / (1 - margin);
  }, [financialData, teamMembers, rateOverride, sellRateSnapshot]);

  const roomResults = useMemo(() => {
    return rooms.map(room => calculateRoom(room, surfaces, effectiveSellRate, 0, windowW, windowH, subtractOpenings, activeInteriorKeys));
  }, [rooms, surfaces, effectiveSellRate, windowW, windowH, subtractOpenings, activeInteriorKeys]);

  const grandRepairCost = useMemo(() => {
    return roomResults.reduce((sum, r) => sum + r.surfaces.reduce((s2, surf) => s2 + (surf.repairPrice || 0), 0), 0);
  }, [roomResults]);
  const grandTotal = roomResults.reduce((sum, r, idx) => {
    if (rooms[idx]?.priceOverride != null) return sum + rooms[idx].priceOverride!;
    const repairCost = r.surfaces.reduce((s, surf) => s + ((surf as any).repairPrice || 0), 0);
    return sum + r.totalPrice + repairCost;
  }, 0);
  const grandLaborHours = roomResults.reduce((sum, r) => sum + r.totalLaborHours, 0);

  const updateRoom = (index: number, updates: Partial<RoomConfig>) => {
    setRooms(prev => prev.map((r, i) => i === index ? { ...r, ...updates } : r));
  };

  const updateRoomDimAndRecalc = (index: number, dimKey: 'length' | 'width' | 'ceilingHeight', value: number) => {
    setRooms(prev => prev.map((r, i) => {
      if (i !== index) return r;
      const updated: RoomConfig = { ...r, [dimKey]: value };
      const newDyn: typeof r.dynamicSurfaces = { ...r.dynamicSurfaces };
      let changed = false;
      for (const [key, state] of Object.entries(r.dynamicSurfaces || {})) {
        if (!state.enabled || state.manual) continue;
        const def = (allSurfacesData || []).find(s => s.surfaceKey === key && s.estimateType === jobType);
        const dynUnit = def?.unit || 'sqft';
        const newQty = autoCalcDynamicQty(updated, dynUnit);
        if (newQty > 0 && newQty !== state.qty) {
          newDyn[key] = { ...state, qty: newQty };
          changed = true;
        }
      }
      return changed ? { ...updated, dynamicSurfaces: newDyn } : updated;
    }));
  };

  const [overrideEditor, setOverrideEditor] = useState<{ roomIndex: number; dynKey: string; surfaceName: string; unit: string; autoQty: number; tempValue: string } | null>(null);
  const [uploadingPhotoRoom, setUploadingPhotoRoom] = useState<number | null>(null);
  const [expandedPhotoRoom, setExpandedPhotoRoom] = useState<number | null>(null);
  const [cameraRoomIndex, setCameraRoomIndex] = useState<number | null>(null);
  const [photoMenuRoom, setPhotoMenuRoom] = useState<number | null>(null);
  const [overrideDialogRoom, setOverrideDialogRoom] = useState<number | null>(null);
  const [overrideDialogValue, setOverrideDialogValue] = useState<string>('');
  const [surfacePriceOverrideDialog, setSurfacePriceOverrideDialog] = useState<{
    roomIndex: number;
    surfaceKey: string;
    surfaceName: string;
    calcPerUnit: number;
    currentOverride: number | null;
  } | null>(null);
  const [surfacePriceOverrideValue, setSurfacePriceOverrideValue] = useState<string>('');
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);
  const [photoViewerIndex, setPhotoViewerIndex] = useState(0);
  const [photoViewerRoom, setPhotoViewerRoom] = useState<number>(0);
  const [photoSelectMode, setPhotoSelectMode] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState<Set<number>>(new Set());
  const [photoDeleteConfirm, setPhotoDeleteConfirm] = useState<{ type: 'bulk'; roomIndex: number } | { type: 'single'; roomIndex: number; photoIndex: number } | null>(null);
  const [projectPhotoPickerRoom, setProjectPhotoPickerRoom] = useState<number | null>(null);
  const photoInputRefs = useRef<Record<number, HTMLInputElement | null>>({});


  const linkAreaPhotoToPool = async (storageKey: string, fileName: string) => {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/photos/link-area`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storageKey, fileName }),
      });
      if (!res.ok) {
        console.warn('[RoomBuilder] link-area pool registration failed:', res.status, storageKey);
      }
    } catch (e) {
      // Non-fatal: photo still works inline; just won't surface for other blocks.
      console.warn('[RoomBuilder] link-area network error:', e);
    }
  };

  const handleRoomPhotoUpload = async (roomIndex: number, files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingPhotoRoom(roomIndex);
    const fileArr = Array.from(files);
    const localPreviews: Array<{ url: string; timestamp: string; uploading?: boolean }> = fileArr.map(f => ({
      url: URL.createObjectURL(f),
      timestamp: new Date().toISOString(),
      uploading: true,
    }));
    setRooms(prev => prev.map((r, i) =>
      i === roomIndex ? { ...r, photos: [...(r.photos || []), ...localPreviews] } : r
    ));
    setExpandedPhotoRoom(roomIndex);

    for (let idx = 0; idx < fileArr.length; idx++) {
      const file = fileArr[idx];
      const localUrl = localPreviews[idx].url;
      const compressed = await compressImageFile(file);
      const formData = new FormData();
      formData.append('file', compressed);
      try {
        const res = await fetch('/api/mms-upload', { method: 'POST', body: formData, credentials: 'include' });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || 'Upload failed');
        }
        const data = await res.json();
        if (data.objectPath) {
          setRooms(prev => prev.map((r, i) =>
            i === roomIndex
              ? { ...r, photos: (r.photos || []).map(p => p.url === localUrl ? { url: data.objectPath, timestamp: p.timestamp } : p) }
              : r
          ));
          URL.revokeObjectURL(localUrl);
          await linkAreaPhotoToPool(data.objectPath, file.name);
        }
      } catch (err: any) {
        setRooms(prev => prev.map((r, i) =>
          i === roomIndex ? { ...r, photos: (r.photos || []).filter(p => p.url !== localUrl) } : r
        ));
        URL.revokeObjectURL(localUrl);
        toast({ title: `Failed to upload ${file.name}`, description: err.message, variant: "destructive" });
      }
    }
    setUploadingPhotoRoom(null);
    if (photoInputRefs.current[roomIndex]) photoInputRefs.current[roomIndex]!.value = '';
  };

  const handleCameraCapture = useCallback(async (blob: Blob, roomIndex: number) => {
    const localUrl = URL.createObjectURL(blob);
    const ts = new Date().toISOString();
    setRooms(prev => prev.map((r, i) =>
      i === roomIndex
        ? { ...r, photos: [...(r.photos || []), { url: localUrl, timestamp: ts, uploading: true }] }
        : r
    ));

    const fname = `Photo_${Date.now()}.jpg`;
    const compressed = await compressBlob(blob, fname);
    const file = compressed;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/mms-upload', { method: 'POST', body: formData, credentials: 'include' });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      if (data.objectPath) {
        setRooms(prev => prev.map((r, i) =>
          i === roomIndex
            ? { ...r, photos: (r.photos || []).map(p => p.url === localUrl ? { url: data.objectPath, timestamp: p.timestamp } : p) }
            : r
        ));
        URL.revokeObjectURL(localUrl);
        await linkAreaPhotoToPool(data.objectPath, fname);
      }
    } catch {
      setRooms(prev => prev.map((r, i) =>
        i === roomIndex ? { ...r, photos: (r.photos || []).filter(p => p.url !== localUrl) } : r
      ));
      URL.revokeObjectURL(localUrl);
      toast({ title: "Failed to upload photo", variant: "destructive" });
    }
  }, [toast]);

  const removeRoomPhoto = (roomIndex: number, photoIndex: number) => {
    const existing = rooms[roomIndex]?.photos || [];
    updateRoom(roomIndex, { photos: existing.filter((_, i) => i !== photoIndex) });
  };

  const surfaceHasData = (room: RoomConfig, key: SurfaceKey): boolean => {
    const k = key as string;
    if (room.coatsOverride && (room.coatsOverride as any)[k] !== undefined) return true;
    if (room.materialOverride && (room.materialOverride as any)[k] !== undefined && (room.materialOverride as any)[k] !== null) return true;
    if (room.primerOverride && (room.primerOverride as any)[k] !== undefined) return true;
    if ((room as any).substrateOverride && (room as any).substrateOverride[k] !== undefined) return true;
    if ((room as any).surfaceDescriptionOverride && (room as any).surfaceDescriptionOverride[k]) return true;
    if ((room as any).complexityOverride && (room as any).complexityOverride[k] !== undefined) return true;
    if ((room as any).repairOverride && (room as any).repairOverride[k] !== undefined) return true;
    if (key === 'walls' && Array.isArray(room.wallSelections) && room.wallSelections.length > 0) return true;
    return false;
  };

  const toggleSurface = (roomIndex: number, key: SurfaceKey, checked: boolean, force = false) => {
    if (!checked && !force) {
      const room = rooms[roomIndex];
      if (room && (room[key] as boolean) && surfaceHasData(room, key)) {
        const def = SURFACE_DEFAULTS[key];
        const surf = surfacesData ? (findSurface(surfacesData, def.dbName) || (def.altName ? findSurface(surfacesData, def.altName) : undefined)) : undefined;
        const surfaceName = surf?.surfaceName || def.dbName || String(key);
        setSurfaceToRemove({ roomIndex, key: String(key), isDynamic: false, surfaceName });
        return;
      }
    }
    if (checked && surfacesData) {
      const def = SURFACE_DEFAULTS[key];
      const surf = findSurface(surfacesData, def.dbName) || (def.altName ? findSurface(surfacesData, def.altName) : undefined);
      if (surf?.areaDescription) {
        setRooms(prev => prev.map((r, i) => {
          if (i !== roomIndex) return r;
          const existing = r.scopeNotes?.trim() || "";
          const desc = surf.areaDescription!.trim();
          if (existing.includes(desc)) return { ...r, [key]: true };
          const newNotes = existing ? `${existing}\n${desc}` : desc;
          return { ...r, [key]: true, scopeNotes: newNotes };
        }));
        return;
      }
    }
    updateRoom(roomIndex, { [key]: checked });
  };

  const updateCoats = (roomIndex: number, key: SurfaceKey, coats: number) => {
    setRooms(prev => prev.map((r, i) => {
      if (i !== roomIndex) return r;
      return { ...r, coatsOverride: { ...r.coatsOverride, [key]: Math.max(1, coats) } };
    }));
  };

  const getCoats = (room: RoomConfig, key: SurfaceKey): number => {
    return room.coatsOverride[key] ?? getDefaultCoats(key, surfaces);
  };

  const updateMaterialOverride = (roomIndex: number, key: string, materialId: number | null) => {
    setRooms(prev => prev.map((r, i) => {
      if (i !== roomIndex) return r;
      return { ...r, materialOverride: { ...r.materialOverride, [key]: materialId } as any };
    }));
  };

  const allMaterials = materialsData || [];
  const primerMaterials = allMaterials.filter(m => (m.type || '').toLowerCase() === 'primer');

  const getPrimerState = (room: RoomConfig, key: string) => {
    const override = room.primerOverride?.[key];
    const def = SURFACE_DEFAULTS[key as SurfaceKey];
    let s: Surface | undefined;
    if (def) {
      s = findSurface(surfaces, def.dbName) || (def.altName ? findSurface(surfaces, def.altName) : undefined);
    } else {
      s = findSurfaceByKey(surfaces, key);
    }
    const defaultCoats = s?.defaultPrimerCoats || 0;
    const defaultMatId = s?.defaultPrimerMaterialId || null;
    return {
      enabled: override?.enabled ?? (defaultCoats > 0),
      coats: override?.coats ?? (defaultCoats || 1),
      materialId: override?.materialId !== undefined ? override.materialId : defaultMatId,
    };
  };

  const getPaintEnabled = (room: RoomConfig, key: string) => {
    const override = room.paintOverride?.[key];
    if (override !== undefined) return override.enabled;
    const def = SURFACE_DEFAULTS[key as SurfaceKey];
    let s: Surface | undefined;
    if (def) {
      s = findSurface(surfaces, def.dbName) || (def.altName ? findSurface(surfaces, def.altName) : undefined);
    } else {
      s = findSurfaceByKey(surfaces, key);
    }
    return (s as any)?.usePaint ?? true;
  };

  const updatePaintOverride = (roomIndex: number, key: string, enabled: boolean) => {
    setRooms(prev => prev.map((r, i) => {
      if (i !== roomIndex) return r;
      return { ...r, paintOverride: { ...(r.paintOverride || {}), [key]: { enabled } } };
    }));
  };

  const getExcludeMaterial = useCallback((room: RoomConfig, key: string): boolean => {
    if (customerProvidingMaterials) return true;
    return !!(room as any).excludeMaterialCost?.[key];
  }, [customerProvidingMaterials]);

  const updateExcludeMaterial = (roomIndex: number, key: string, exclude: boolean) => {
    setRooms(prev => prev.map((r, i) => {
      if (i !== roomIndex) return r;
      const next = { ...((r as any).excludeMaterialCost || {}) } as Record<string, boolean>;
      if (exclude) next[key] = true;
      else delete next[key];
      return { ...r, excludeMaterialCost: next } as any;
    }));
  };

  const getExcludePrimer = useCallback((room: RoomConfig, key: string): boolean => {
    if (customerProvidingMaterials) return true;
    return !!(room as any).excludePrimerCost?.[key];
  }, [customerProvidingMaterials]);

  const updateExcludePrimer = (roomIndex: number, key: string, exclude: boolean) => {
    setRooms(prev => prev.map((r, i) => {
      if (i !== roomIndex) return r;
      const next = { ...((r as any).excludePrimerCost || {}) } as Record<string, boolean>;
      if (exclude) next[key] = true;
      else delete next[key];
      return { ...r, excludePrimerCost: next } as any;
    }));
  };

  const handleMasterExcludeToggle = (checked: boolean) => {
    setCustomerProvidingMaterials(checked);
    if (!checked) {
      setRooms(prev => prev.map(r => ({ ...r, excludeMaterialCost: {}, excludePrimerCost: {} } as any)));
    }
  };

  const canUsePrimer = (key: string) => {
    const def = SURFACE_DEFAULTS[key as SurfaceKey];
    let s: Surface | undefined;
    if (def) {
      s = findSurface(surfaces, def.dbName) || (def.altName ? findSurface(surfaces, def.altName) : undefined);
    } else {
      s = findSurfaceByKey(surfaces, key);
    }
    return (s as any)?.usePrimer ?? true;
  };

  const updatePrimerOverride = (roomIndex: number, key: string, update: Partial<{ enabled: boolean; coats: number; materialId: number | null }>) => {
    setRooms(prev => prev.map((r, i) => {
      if (i !== roomIndex) return r;
      const current = r.primerOverride?.[key] || { enabled: false };
      const merged: { enabled: boolean; coats?: number; materialId?: number | null } = { ...current, ...update };
      if (merged.enabled && (merged.coats == null || merged.coats <= 0)) {
        const def = SURFACE_DEFAULTS[key as SurfaceKey];
        let s: Surface | undefined;
        if (def) {
          s = findSurface(surfaces, def.dbName) || (def.altName ? findSurface(surfaces, def.altName) : undefined);
        } else {
          s = findSurfaceByKey(surfaces, key);
        }
        merged.coats = (s?.defaultPrimerCoats && s.defaultPrimerCoats > 0) ? s.defaultPrimerCoats : 1;
      }
      return { ...r, primerOverride: { ...(r.primerOverride || {}), [key]: merged } };
    }));
  };

  const SUBSTRATE_PRESETS = ["Drywall", "Wood", "Brick", "Stucco", "Concrete", "Metal", "Plaster", "MDF", "PVC/Vinyl", "Hardie Board", "Fiber Cement", "T1-11", "Cedar", "Composite"];

  const getSubstrateState = (room: RoomConfig, key: string) => {
    const override = room.substrateOverride?.[key];
    const def = SURFACE_DEFAULTS[key as SurfaceKey];
    let s: Surface | undefined;
    if (def) {
      s = findSurface(surfaces, def.dbName) || (def.altName ? findSurface(surfaces, def.altName) : undefined);
    } else {
      s = findSurfaceByKey(surfaces, key);
    }
    const defaultValue = s?.surfaceDescription || null;
    return {
      enabled: override?.enabled ?? (!!defaultValue),
      value: override?.value !== undefined ? override.value : defaultValue,
    };
  };

  const updateSubstrateOverride = (roomIndex: number, key: string, update: Partial<{ enabled: boolean; value: string | null }>) => {
    setRooms(prev => prev.map((r, i) => {
      if (i !== roomIndex) return r;
      const current = r.substrateOverride?.[key] || { enabled: false };
      return { ...r, substrateOverride: { ...(r.substrateOverride || {}), [key]: { ...current, ...update } } };
    }));
  };

  const getEffectiveMaterialId = useCallback((room: RoomConfig, key: string): number | null => {
    if (room.materialOverride[key] !== undefined) {
      return room.materialOverride[key];
    }
    const def = SURFACE_DEFAULTS[key as SurfaceKey];
    if (def) {
      const s = findSurface(surfaces, def.dbName) || (def.altName ? findSurface(surfaces, def.altName) : undefined);
      return s?.defaultMaterialId ?? null;
    }
    const s = findSurfaceByKey(surfaces, key);
    return s?.defaultMaterialId ?? null;
  }, [surfaces]);

  const paintPrimerMaterials = allMaterials.filter(m => {
    const t = (m.type || '').toLowerCase();
    return t === 'paint' || t === 'primer';
  });

  const addRoom = () => {
    setRooms(prev => {
      const newRooms = prev.map(r => ({ ...r, expanded: false }));
      const fresh = createDefaultArea(newRooms.length, doorHDefault, doorWDefault, true, jobType, resolveSectionType(jobType));
      fresh.name = uniqueSectionName(fresh.name, newRooms.map(r => r.name));
      return [...newRooms, fresh];
    });
  };

  const handleEstimatorRooms = useCallback((estimatorRooms: EstimatorRoom[], aiBlockName?: string, aiMaterialGroups?: EstimatorMaterialGroup[]) => {
    if (aiBlockName) setBlockName(aiBlockName);

    const allSurfaceKeys: SurfaceKey[] = ["walls", "ceiling", "baseboard", "crownMolding", "shoeMolding", "chairRail", "doorCasing", "windowCasing", "doors", "cabinets", "staircaseRailing", "accentWall", "closetInterior"];

    const newRooms: RoomConfig[] = estimatorRooms.map((er, i) => {
      const primerOvr: Record<string, { enabled: boolean; coats?: number; materialId?: number | null }> = {};
      if (er.primerOverride) {
        for (const [k, v] of Object.entries(er.primerOverride)) {
          primerOvr[k] = { enabled: v.enabled, coats: v.coats };
        }
      }

      const enabledKeys = allSurfaceKeys.filter(k => (er as any)[k]);

      const substrateOvr: Record<string, { enabled: boolean; value?: string | null }> = {};
      if (er.substrate) {
        for (const k of enabledKeys) {
          substrateOvr[k] = { enabled: true, value: er.substrate };
        }
      }

      const surfDescOvr: Record<string, string> = {};
      if (er.surfaceDescription) {
        for (const k of enabledKeys) {
          surfDescOvr[k] = er.surfaceDescription!;
        }
      }

      return {
        id: `ai-${Date.now()}-${i}`,
        name: er.name || `Section ${i + 1}`,
        sectionType: 'room' as SectionType,
        length: er.length || DEFAULT_LENGTH,
        width: er.width || DEFAULT_WIDTH,
        ceilingHeight: er.height || DEFAULT_HEIGHT,
        walls: er.walls,
        ceiling: er.ceiling,
        baseboard: er.baseboard,
        crownMolding: er.crownMolding,
        shoeMolding: er.shoeMolding,
        chairRail: er.chairRail,
        doorCount: er.doorCount || 0,
        windowCount: er.windowCount || 0,
        doorCasing: er.doorCasing,
        windowCasing: er.windowCasing,
        doors: er.doors,
        cabinets: !!(er as any).cabinets,
        cabinetsLf: (er as any).cabinetsLf || 0,
        staircaseRailing: !!(er as any).staircaseRailing,
        staircaseRailingLf: (er as any).staircaseRailingLf || 0,
        accentWall: !!(er as any).accentWall,
        accentWallSqft: (er as any).accentWallSqft || 0,
        closetInterior: !!(er as any).closetInterior,
        closetInteriorSqft: (er as any).closetInteriorSqft || 0,
        doorHeightFt: doorHDefault,
        doorWidthFt: doorWDefault,
        expanded: i === 0,
        scopeNotes: er.scopeNotes || '',
        coatsOverride: er.coats || {},
        materialOverride: {},
        primerOverride: Object.keys(primerOvr).length > 0 ? primerOvr : {},
        substrateOverride: Object.keys(substrateOvr).length > 0 ? substrateOvr : undefined,
        surfaceDescriptionOverride: Object.keys(surfDescOvr).length > 0 ? surfDescOvr : undefined,
        wallSelections: [
          { enabled: true },
          { enabled: true },
          { enabled: true },
          { enabled: true },
        ],
      };
    });

    setRooms(prev => {
      const hasContent = prev.some(r => r.length > 0 || r.width > 0 || r.name !== `Area ${prev.indexOf(r) + 1}`);
      if (hasContent) {
        const collapsed = prev.map(r => ({ ...r, expanded: false }));
        return [...collapsed, ...newRooms];
      }
      return newRooms;
    });

    if (aiMaterialGroups && aiMaterialGroups.length > 0) {
      const getDefaultMaterialForSurfaceKey = (surfKey: string): { id: number; name: string } | null => {
        const def = SURFACE_DEFAULTS[surfKey as SurfaceKey];
        if (!def) return null;
        const s = findSurface(surfaces, def.dbName) || (def.altName ? findSurface(surfaces, def.altName) : undefined);
        if (s?.defaultMaterialId) {
          const mat = allMaterials.find(m => m.id === s.defaultMaterialId);
          if (mat) return { id: mat.id, name: mat.materialName };
        }
        if (paintPrimerMaterials.length > 0) {
          const regal = paintPrimerMaterials.find(m =>
            m.materialName.toLowerCase().includes('regal select') ||
            m.materialName.toLowerCase().includes('regal')
          );
          if (regal) return { id: regal.id, name: regal.materialName };
          return { id: paintPrimerMaterials[0].id, name: paintPrimerMaterials[0].materialName };
        }
        return null;
      };

      const resolvedGroups: MaterialGroup[] = aiMaterialGroups.map((mg) => {
        let areaIds: string[] | undefined;
        if (mg.areaNames && mg.areaNames.length > 0 && mg.areaNames.length < newRooms.length) {
          const matched = newRooms
            .filter(r => mg.areaNames!.some(an => r.name.toLowerCase() === an.toLowerCase()))
            .map(r => r.id);
          if (matched.length > 0 && matched.length < newRooms.length) {
            areaIds = matched;
          }
        }

        let resolvedMaterialId: number | null = null;
        let resolvedMaterialName: string | undefined;
        if (mg.paintRef && paintPrimerMaterials.length > 0) {
          const pb = (mg.paintRef.brand || '').toLowerCase().trim();
          const pp = (mg.paintRef.product || '').toLowerCase().trim();
          const ps = (mg.paintRef.sheen || '').toLowerCase().trim();
          const match = paintPrimerMaterials.find(m => {
            const mb = (m.brand || '').toLowerCase().trim();
            const mn = (m.materialName || '').toLowerCase().trim();
            const mf = (m.finish || '').toLowerCase().trim();
            if (pb && mb.includes(pb) && pp && mn.includes(pp)) return true;
            if (pb && mb.includes(pb) && ps && mf.includes(ps)) return true;
            if (pp && mn.includes(pp)) return true;
            return false;
          });
          if (match) {
            resolvedMaterialId = match.id;
            resolvedMaterialName = match.materialName;
          }
        }

        if (!resolvedMaterialId && (mg.surfaceKeys || []).length > 0) {
          const primaryKey = mg.surfaceKeys[0];
          const fallback = getDefaultMaterialForSurfaceKey(primaryKey);
          if (fallback) {
            resolvedMaterialId = fallback.id;
            resolvedMaterialName = fallback.name;
          }
        }

        return {
          id: mg.id || `ai-mg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: mg.name,
          surfaceKeys: mg.surfaceKeys || [],
          materialId: resolvedMaterialId,
          materialName: resolvedMaterialName,
          areaIds,
        };
      });

      const allGroupedCombos = new Set<string>();
      for (const g of resolvedGroups) {
        for (const sk of g.surfaceKeys) {
          if (!g.areaIds || g.areaIds.length === 0) {
            newRooms.forEach(r => allGroupedCombos.add(`${r.id}:${sk}`));
          } else {
            g.areaIds.forEach(aid => allGroupedCombos.add(`${aid}:${sk}`));
          }
        }
      }

      const ungroupedByKey: Record<string, string[]> = {};
      for (const room of newRooms) {
        const enabledKeys: SurfaceKey[] = [];
        if (room.walls) enabledKeys.push('walls');
        if (room.ceiling) enabledKeys.push('ceiling');
        if (room.baseboard) enabledKeys.push('baseboard');
        if (room.crownMolding) enabledKeys.push('crownMolding');
        if (room.shoeMolding) enabledKeys.push('shoeMolding');
        if (room.chairRail) enabledKeys.push('chairRail');
        if (room.doors) enabledKeys.push('doors');
        if (room.doorCasing) enabledKeys.push('doorCasing');
        if (room.windowCasing) enabledKeys.push('windowCasing');

        for (const sk of enabledKeys) {
          if (!allGroupedCombos.has(`${room.id}:${sk}`)) {
            if (!ungroupedByKey[sk]) ungroupedByKey[sk] = [];
            ungroupedByKey[sk].push(room.id);
          }
        }
      }

      const roomSetGroups: Record<string, string[]> = {};
      for (const [surfKey, roomIds] of Object.entries(ungroupedByKey)) {
        const signature = [...roomIds].sort().join(',');
        if (!roomSetGroups[signature]) roomSetGroups[signature] = [];
        roomSetGroups[signature].push(surfKey);
      }

      const complementGroups: MaterialGroup[] = [];
      for (const [signature, surfKeys] of Object.entries(roomSetGroups)) {
        const roomIds = signature.split(',');
        const primaryKey = surfKeys[0];
        const fallback = getDefaultMaterialForSurfaceKey(primaryKey);
        const roomNameList = newRooms.filter(r => roomIds.includes(r.id)).map(r => r.name);
        const isAllRooms = roomIds.length === newRooms.length;
        const surfLabels = surfKeys.map(k => SURFACE_DEFAULTS[k as SurfaceKey]?.dbName || k).join(' + ');
        const groupLabel = isAllRooms
          ? `${surfLabels} (remaining)`
          : `${roomNameList.join(', ')} — ${surfLabels}`;

        complementGroups.push({
          id: `ai-cmg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: groupLabel,
          surfaceKeys: surfKeys,
          materialId: fallback?.id ?? null,
          materialName: fallback?.name,
          areaIds: isAllRooms ? undefined : roomIds,
        });
      }

      setMaterialGroups([...resolvedGroups, ...complementGroups]);
      setShowMaterialGroups(true);
    }

  }, [doorHDefault, doorWDefault, paintPrimerMaterials, surfaces, allMaterials]);

  const removeRoom = (index: number) => {
    const removedRoom = rooms[index];
    const remainingCount = rooms.length - 1;
    setRooms(prev => prev.filter((_, i) => i !== index));
    if (removedRoom) {
      setMaterialGroups(prev => prev.map(g => {
        if (!g.areaIds || g.areaIds.length === 0) return g;
        const filtered = g.areaIds.filter(id => id !== removedRoom.id);
        if (filtered.length === 0) return { ...g, areaIds: undefined };
        if (filtered.length >= remainingCount) return { ...g, areaIds: undefined };
        return { ...g, areaIds: filtered };
      }));
    }
  };

  const duplicateRoom = (index: number) => {
    const source = rooms[index];
    const clone: RoomConfig = {
      ...JSON.parse(JSON.stringify(source)),
      id: `room-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: `${source.name || `Section ${index + 1}`} (Copy)`,
      expanded: true,
    };
    setRooms(prev => {
      clone.name = uniqueSectionName(clone.name, prev.map(r => r.name));
      const next = [...prev];
      next.splice(index + 1, 0, clone);
      return next;
    });
  };

  const perAreaMaterialCosts = useMemo(() => {
    // Rooms with priceOverride still need their gallons CALCULATED (so we know how
    // much paint to buy), but their proportional material cost must be excluded so
    // we don't charge the customer twice (once via the override, once via Materials).
    // We accomplish this by treating every surface in an overridden room as
    // "exclude material cost" — the existing excludedSqft/excludedCost mechanism
    // then nets the cost to zero while leaving the gallon count intact.
    const wrappedExcludeMaterial = (room: RoomConfig, key: string) => {
      if (room?.priceOverride != null) return true;
      return getExcludeMaterial(room, key);
    };
    const wrappedExcludePrimer = (room: RoomConfig, key: string) => {
      if (room?.priceOverride != null) return true;
      return getExcludePrimer(room, key);
    };
    return rooms.map((_, i) =>
      computeMaterialCosts(roomResults, rooms, surfaces, allMaterials, false, getEffectiveMaterialId, i, wrappedExcludeMaterial, wrappedExcludePrimer)
    );
  }, [roomResults, rooms, surfaces, allMaterials, getEffectiveMaterialId, getExcludeMaterial, getExcludePrimer]);

  const materialGroupResults = useMemo<MaterialGroupCalcResult[]>(() => {
    if (!showMaterialGroups || materialGroups.length === 0) return [];
    return materialGroups.map(group => {
      if (!group.materialId) return null;
      const mat = allMaterials.find(m => m.id === group.materialId);
      if (!mat || !mat.coverageSqftPerGallon || mat.coverageSqftPerGallon <= 0) return null;

      const groupAreaIds = group.areaIds;
      const surfaceBreakdown: { surfaceName: string; sqft: number }[] = [];
      let totalSqft = 0;
      let excludedSqft = 0;

      for (let ri = 0; ri < roomResults.length; ri++) {
        const result = roomResults[ri];
        const room = rooms[ri];
        if (groupAreaIds && groupAreaIds.length > 0 && !groupAreaIds.includes(room?.id)) continue;
        // Overridden rooms still contribute sqft to the group so gallon math is
        // accurate; their proportional cost is removed via excludedSqft below.
        const roomOverridden = room?.priceOverride != null;
        for (const surf of result.surfaces) {
          if (group.surfaceKeys.includes(surf.surfaceKey)) {
            const isExcl = roomOverridden || getExcludeMaterial(room, surf.surfaceKey);
            totalSqft += surf.paintableSqft;
            if (isExcl) excludedSqft += surf.paintableSqft;
            const existing = surfaceBreakdown.find(s => s.surfaceName === surf.surfaceName);
            if (existing) {
              existing.sqft += surf.paintableSqft;
            } else {
              surfaceBreakdown.push({ surfaceName: surf.surfaceName, sqft: surf.paintableSqft });
            }
          }
        }
      }

      if (totalSqft <= 0) return null;

      const baseQty = totalSqft / mat.coverageSqftPerGallon;
      const wasteMultiplier = 1 + (mat.wastePercentage || 0);
      const exactQtyNeeded = baseQty * wasteMultiplier;
      const autoQty = Math.ceil(exactQtyNeeded);
      const qtyToBuy = (group.qtyToBuyOverride != null && group.qtyToBuyOverride >= 0)
        ? group.qtyToBuyOverride
        : autoQty;
      const grpMarkup = 1 + ((mat.markupPercentage || 0) / 100);
      const grpCustomerPrice = mat.costPerUnit * grpMarkup;
      const totalCost = qtyToBuy * grpCustomerPrice;
      const excludedRatio = totalSqft > 0 ? excludedSqft / totalSqft : 0;
      const excludedCost = totalCost * excludedRatio;

      return {
        groupId: group.id,
        groupName: group.name,
        materialName: `${mat.materialName} (${mat.brand})`,
        materialUnit: "gal",
        totalSqft,
        coveragePerUnit: mat.coverageSqftPerGallon,
        exactQtyNeeded,
        qtyToBuy,
        costPerUnit: grpCustomerPrice,
        totalCost,
        surfaces: surfaceBreakdown,
        excludedSqft: excludedSqft > 0 ? excludedSqft : undefined,
        excludedCost: excludedCost > 0 ? excludedCost : undefined,
      } as MaterialGroupCalcResult;
    }).filter(Boolean) as MaterialGroupCalcResult[];
  }, [showMaterialGroups, materialGroups, roomResults, rooms, allMaterials, getExcludeMaterial]);

  const primerGroupResults = useMemo<MaterialGroupCalcResult[]>(() => {
    if (!showPrimerGroups || primerGroups.length === 0) return [];
    return primerGroups.map(group => {
      if (!group.materialId) return null;
      const mat = allMaterials.find(m => m.id === group.materialId);
      if (!mat || !mat.coverageSqftPerGallon || mat.coverageSqftPerGallon <= 0) return null;

      const groupAreaIds = group.areaIds;
      const surfaceBreakdown: { surfaceName: string; sqft: number }[] = [];
      let totalSqft = 0;
      let excludedSqft = 0;

      for (let ri = 0; ri < roomResults.length; ri++) {
        const result = roomResults[ri];
        const room = rooms[ri];
        if (groupAreaIds && groupAreaIds.length > 0 && !groupAreaIds.includes(room?.id)) continue;
        // Same pattern as paint groups: keep overridden room sqft in the gallon
        // total, but exclude its proportional cost so we don't double-charge.
        const roomOverridden = room?.priceOverride != null;
        for (const surf of result.surfaces) {
          if (group.surfaceKeys.includes(surf.surfaceKey) && surf.primerPaintableSqft && surf.primerPaintableSqft > 0) {
            const isExcl = roomOverridden || getExcludePrimer(room, surf.surfaceKey);
            totalSqft += surf.primerPaintableSqft;
            if (isExcl) excludedSqft += surf.primerPaintableSqft;
            const existing = surfaceBreakdown.find(s => s.surfaceName === surf.surfaceName);
            if (existing) {
              existing.sqft += surf.primerPaintableSqft;
            } else {
              surfaceBreakdown.push({ surfaceName: surf.surfaceName, sqft: surf.primerPaintableSqft });
            }
          }
        }
      }

      if (totalSqft <= 0) return null;

      const baseQty = totalSqft / mat.coverageSqftPerGallon;
      const wasteMultiplier = 1 + (mat.wastePercentage || 0);
      const exactQtyNeeded = baseQty * wasteMultiplier;
      const autoQty = Math.ceil(exactQtyNeeded);
      const qtyToBuy = (group.qtyToBuyOverride != null && group.qtyToBuyOverride >= 0)
        ? group.qtyToBuyOverride
        : autoQty;
      const grpMarkup = 1 + ((mat.markupPercentage || 0) / 100);
      const grpCustomerPrice = mat.costPerUnit * grpMarkup;
      const totalCost = qtyToBuy * grpCustomerPrice;
      const excludedRatio = totalSqft > 0 ? excludedSqft / totalSqft : 0;
      const excludedCost = totalCost * excludedRatio;

      return {
        groupId: group.id,
        groupName: group.name,
        materialName: `${mat.materialName} (${mat.brand})`,
        materialUnit: "gal",
        totalSqft,
        coveragePerUnit: mat.coverageSqftPerGallon,
        exactQtyNeeded,
        qtyToBuy,
        costPerUnit: grpCustomerPrice,
        totalCost,
        surfaces: surfaceBreakdown,
        excludedSqft: excludedSqft > 0 ? excludedSqft : undefined,
        excludedCost: excludedCost > 0 ? excludedCost : undefined,
      } as MaterialGroupCalcResult;
    }).filter(Boolean) as MaterialGroupCalcResult[];
  }, [showPrimerGroups, primerGroups, roomResults, rooms, allMaterials, getExcludeMaterial]);

  const groupedSurfaceKeys = useMemo(() => {
    if (!showMaterialGroups) return new Set<string>();
    return new Set(materialGroups.flatMap(g => g.surfaceKeys));
  }, [showMaterialGroups, materialGroups]);

  const dbNameToSurfaceKey = useMemo(() => {
    const map: Record<string, string> = {};
    Object.entries(SURFACE_DEFAULTS).forEach(([key, val]) => {
      map[val.dbName] = key;
      if (val.altName) map[val.altName] = key;
    });
    return map;
  }, []);

  const isGroupedSurface = useCallback((surfaceName: string, areaId?: string) => {
    if (!showMaterialGroups || groupedSurfaceKeys.size === 0) return false;
    const surfKey = dbNameToSurfaceKey[surfaceName];
    if (!surfKey || !groupedSurfaceKeys.has(surfKey)) return false;
    if (!areaId) {
      return materialGroups.some(g => g.surfaceKeys.includes(surfKey) && (!g.areaIds || g.areaIds.length === 0));
    }
    return materialGroups.some(g => {
      if (!g.surfaceKeys.includes(surfKey)) return false;
      if (!g.areaIds || g.areaIds.length === 0) return true;
      return g.areaIds.includes(areaId);
    });
  }, [showMaterialGroups, groupedSurfaceKeys, dbNameToSurfaceKey, materialGroups]);

  const primerGroupedSurfaceKeys = useMemo(() => {
    if (!showPrimerGroups) return new Set<string>();
    return new Set(primerGroups.flatMap(g => g.surfaceKeys));
  }, [showPrimerGroups, primerGroups]);

  const isPrimerGroupedSurface = useCallback((surfaceName: string, areaId?: string) => {
    if (!showPrimerGroups || primerGroupedSurfaceKeys.size === 0) return false;
    const baseName = surfaceName.replace(/ \(Primer\)$/, '');
    const surfKey = dbNameToSurfaceKey[baseName];
    if (!surfKey || !primerGroupedSurfaceKeys.has(surfKey)) return false;
    if (!areaId) {
      return primerGroups.some(g => g.surfaceKeys.includes(surfKey) && (!g.areaIds || g.areaIds.length === 0));
    }
    return primerGroups.some(g => {
      if (!g.surfaceKeys.includes(surfKey)) return false;
      if (!g.areaIds || g.areaIds.length === 0) return true;
      return g.areaIds.includes(areaId);
    });
  }, [showPrimerGroups, primerGroupedSurfaceKeys, dbNameToSurfaceKey, primerGroups]);

  const ungroupedMaterialCosts = useMemo(() => {
    const hasAnyGroups = (showMaterialGroups && groupedSurfaceKeys.size > 0) || (showPrimerGroups && primerGroupedSurfaceKeys.size > 0);
    // Overridden rooms ARE included so their gallons are surfaced. The cost
    // contribution is already netted to zero by perAreaMaterialCosts (which
    // marks every surface in an overridden room as excluded), so totalCost
    // and excludedCost are equal for those entries — net cost = 0.
    if (!hasAnyGroups) {
      const flat: MaterialCostEntry[] = [];
      for (let ri = 0; ri < perAreaMaterialCosts.length; ri++) {
        flat.push(...perAreaMaterialCosts[ri]);
      }
      return flat;
    }
    const result: MaterialCostEntry[] = [];
    for (let ri = 0; ri < perAreaMaterialCosts.length; ri++) {
      const room = rooms[ri];
      if (!room) continue;
      for (const c of perAreaMaterialCosts[ri]) {
        const isPrimerCost = c.surfaceName.endsWith(' (Primer)');
        if (isPrimerCost) {
          if (!isPrimerGroupedSurface(c.surfaceName, room.id)) {
            result.push(c);
          }
        } else {
          if (!isGroupedSurface(c.surfaceName, room.id)) {
            result.push(c);
          }
        }
      }
    }
    return result;
  }, [perAreaMaterialCosts, rooms, showMaterialGroups, groupedSurfaceKeys, isGroupedSurface, showPrimerGroups, primerGroupedSurfaceKeys, isPrimerGroupedSurface]);

  const totalMaterialCost = useMemo(() => {
    const ungroupedTotal = ungroupedMaterialCosts.reduce((s, c) => s + c.totalCost - (c.excludedCost || 0), 0);
    const groupTotal = materialGroupResults.reduce((s, c) => s + c.totalCost - (c.excludedCost ?? 0), 0);
    const primerGroupTotal = primerGroupResults.reduce((s, c) => s + c.totalCost - (c.excludedCost ?? 0), 0);
    return ungroupedTotal + groupTotal + primerGroupTotal;
  }, [ungroupedMaterialCosts, materialGroupResults, primerGroupResults]);

  const allMaterialCosts = perAreaMaterialCosts.flat();

  const hasMissingMaterials = useMemo(() => {
    const hasSurfacesWithoutMaterial = rooms.some((room, i) => {
      const result = roomResults[i];
      if (!result) return false;
      return result.surfaces.some(s => {
        const isInGroup = showMaterialGroups && groupedSurfaceKeys.has(s.surfaceKey) && materialGroups.some(g => {
          if (!g.surfaceKeys.includes(s.surfaceKey)) return false;
          if (!g.areaIds || g.areaIds.length === 0) return true;
          return g.areaIds.includes(room.id);
        });
        if (isInGroup) return false;
        const matId = getEffectiveMaterialId(room, s.surfaceKey as SurfaceKey);
        return !matId;
      });
    });
    const hasGroupsWithoutMaterial = showMaterialGroups && materialGroups.some(g =>
      g.surfaceKeys.length > 0 && !g.materialId
    );
    return hasSurfacesWithoutMaterial || hasGroupsWithoutMaterial;
  }, [rooms, roomResults, showMaterialGroups, materialGroups, groupedSurfaceKeys, getEffectiveMaterialId]);

  const doGenerate = () => {
    const lineItems: LineItem[] = roomResults.map((result, i) => {
      const room = rooms[i];
      let description = room.scopeNotes || "";
      if (surfacesData) {
        const surfDescs: string[] = [];
        const surfDescNotes: string[] = [];
        for (const key of Object.keys(SURFACE_DEFAULTS) as SurfaceKey[]) {
          if (!room[key]) continue;
          const ss = getSubstrateState(room, key);
          if (ss.enabled && ss.value) {
            const def = SURFACE_DEFAULTS[key];
            surfDescs.push(`${def.dbName}: ${ss.value}`);
          }
          const surfDescOverride = room.surfaceDescriptionOverride?.[key];
          const def = SURFACE_DEFAULTS[key];
          const surf = findSurface(surfacesData, def.dbName) || (def.altName ? findSurface(surfacesData, def.altName) : undefined);
          const surfDescText = surfDescOverride !== undefined ? surfDescOverride : (surf?.areaDescription || '');
          if (surfDescText.trim()) {
            surfDescNotes.push(`${def.dbName}: ${surfDescText.trim()}`);
          }
        }
        if (room.dynamicSurfaces) {
          for (const [dynKey, dynState] of Object.entries(room.dynamicSurfaces)) {
            if (!dynState.enabled || dynState.qty <= 0) continue;
            const dynSurf = findSurfaceByKey(surfacesData, dynKey);
            if (!dynSurf) continue;
            const ss = getSubstrateState(room, dynKey);
            if (ss.enabled && ss.value) {
              surfDescs.push(`${dynSurf.surfaceName}: ${ss.value}`);
            }
            const surfDescOverride = room.surfaceDescriptionOverride?.[dynKey];
            const surfDescText = surfDescOverride !== undefined ? surfDescOverride : (dynSurf.areaDescription || '');
            if (surfDescText.trim()) {
              surfDescNotes.push(`${dynSurf.surfaceName}: ${surfDescText.trim()}`);
            }
          }
        }
        if (surfDescs.length > 0) {
          const surfText = surfDescs.join("; ");
          if (description && !description.includes(surfText)) {
            description = `${description}\n${surfText}`;
          } else if (!description) {
            description = surfText;
          }
        }
        if (surfDescNotes.length > 0) {
          const notesText = surfDescNotes.join("\n");
          if (description && !description.includes(notesText)) {
            description = `${description}\n${notesText}`;
          } else if (!description) {
            description = notesText;
          }
        }
        const repairNotes: string[] = [];
        for (const key of Object.keys(SURFACE_DEFAULTS) as SurfaceKey[]) {
          if (!room[key]) continue;
          const repair = room.repairOverride?.[key];
          if (repair && (repair.hours > 0 || repair.description)) {
            const def = SURFACE_DEFAULTS[key];
            const parts = [`Repair - ${def.dbName}`];
            if (repair.hours > 0) parts.push(`(${repair.hours}h)`);
            if (repair.description) parts.push(`: ${repair.description}`);
            repairNotes.push(parts.join(''));
          }
        }
        if (room.dynamicSurfaces) {
          for (const [dynKey, dynState] of Object.entries(room.dynamicSurfaces)) {
            if (!dynState.enabled || dynState.qty <= 0) continue;
            const repair = room.repairOverride?.[dynKey];
            if (repair && (repair.hours > 0 || repair.description)) {
              const dynSurf = findSurfaceByKey(surfacesData, dynKey);
              const parts = [`Repair - ${dynSurf?.surfaceName || dynKey}`];
              if (repair.hours > 0) parts.push(`(${repair.hours}h)`);
              if (repair.description) parts.push(`: ${repair.description}`);
              repairNotes.push(parts.join(''));
            }
          }
        }
        if (repairNotes.length > 0) {
          const repairText = repairNotes.join("\n");
          if (description) {
            description = `${description}\n${repairText}`;
          } else {
            description = repairText;
          }
        }
      }
      const repairTotal = result.surfaces.reduce((sum, s) => sum + (s.repairPrice || 0), 0);
      const roomLineTotal = room?.priceOverride != null
        ? room.priceOverride!
        : result.totalPrice + repairTotal;
      return {
        name: result.roomName,
        description,
        quantity: 1,
        unitPrice: Math.round(roomLineTotal * 100) / 100,
        total: Math.round(roomLineTotal * 100) / 100,
      };
    });

    if (totalMaterialCost > 0 && !customerProvidingMaterials) {
      // Per-line cost rendering: show NET cost (totalCost - excludedCost) so the
      // sum of the description matches the Materials line total. When an entry
      // is fully excluded (e.g. all sqft came from rooms with priceOverride),
      // we still list the gallons so the contractor knows what to buy, but we
      // mark it as already covered by the room price instead of showing $0.
      const renderMatLine = (label: string, qtyToBuy: number, unit: string, costPerUnit: number, totalCost: number, excludedCost: number, suffix?: string) => {
        const net = totalCost - excludedCost;
        const fullyExcluded = excludedCost >= totalCost - 0.005;
        const suffixStr = suffix ? ` ${suffix}` : '';
        if (fullyExcluded) {
          return `<li>${label} — ${qtyToBuy} ${unit} <em>(included in room price)</em>${suffixStr}</li>`;
        }
        if (excludedCost > 0.005) {
          return `<li>${label} — ${qtyToBuy} ${unit} @ $${costPerUnit.toFixed(2)}/${unit} = $${net.toFixed(2)} <em>(net of room overrides)</em>${suffixStr}</li>`;
        }
        return `<li>${label} — ${qtyToBuy} ${unit} @ $${costPerUnit.toFixed(2)}/${unit} = $${totalCost.toFixed(2)}${suffixStr}</li>`;
      };

      const matLines: string[] = [];
      if (ungroupedMaterialCosts.length > 0) {
        ungroupedMaterialCosts.forEach(c => {
          matLines.push(renderMatLine(`${c.surfaceName}: ${c.materialName}`, c.qtyToBuy, c.materialUnit, c.costPerUnit, c.totalCost, c.excludedCost || 0));
        });
      }
      if (materialGroupResults.length > 0) {
        materialGroupResults.forEach(gr => {
          const surfList = gr.surfaces.map(s => `${s.surfaceName} (${s.sqft.toLocaleString()} sqft)`).join(", ");
          matLines.push(renderMatLine(`${gr.groupName}: ${gr.materialName}`, gr.qtyToBuy, 'gal', gr.costPerUnit, gr.totalCost, gr.excludedCost || 0, `[${surfList}]`));
        });
      }
      if (primerGroupResults.length > 0) {
        primerGroupResults.forEach(gr => {
          const surfList = gr.surfaces.map(s => `${s.surfaceName} (${s.sqft.toLocaleString()} sqft)`).join(", ");
          matLines.push(renderMatLine(`Primer — ${gr.groupName}: ${gr.materialName}`, gr.qtyToBuy, 'gal', gr.costPerUnit, gr.totalCost, gr.excludedCost || 0, `[${surfList}]`));
        });
      }
      lineItems.push({
        name: "Materials",
        description: `<ul>${matLines.join("")}</ul>`,
        quantity: 1,
        unitPrice: Math.round(totalMaterialCost * 100) / 100,
        total: Math.round(totalMaterialCost * 100) / 100,
      });
    }

    const areaResults: AreaCalcResult[] = roomResults.map((result, i) => {
      const room = rooms[i];
      const rawAreaMaterialCosts = perAreaMaterialCosts[i] || [];
      const areaMaterialCosts = rawAreaMaterialCosts.filter(c => !isGroupedSurface(c.surfaceName, room.id));
      const crewNotes: string[] = [];
      if (surfacesData) {
        for (const key of Object.keys(SURFACE_DEFAULTS) as SurfaceKey[]) {
          if (!room[key]) continue;
          const def = SURFACE_DEFAULTS[key];
          const surf = findSurface(surfacesData, def.dbName) || (def.altName ? findSurface(surfacesData, def.altName) : undefined);
          if (surf?.crewNote) crewNotes.push(`${def.dbName}: ${surf.crewNote}`);
        }
        if (room.dynamicSurfaces) {
          for (const [dynKey, dynState] of Object.entries(room.dynamicSurfaces)) {
            if (!dynState.enabled || dynState.qty <= 0) continue;
            const dynSurf = findSurfaceByKey(surfacesData, dynKey);
            if (dynSurf?.crewNote) crewNotes.push(`${dynSurf.surfaceName}: ${dynSurf.crewNote}`);
          }
        }
      }
      return {
        roomId: room.id,
        roomName: result.roomName,
        scopeNotes: room.scopeNotes || undefined,
        crewNotes: crewNotes.length > 0 ? crewNotes : undefined,
        isOptional: room.isOptional || undefined,
        length: room.length,
        width: room.width,
        ceilingHeight: room.ceilingHeight,
        surfaces: result.surfaces.map(s => {
          const isExcluded = getExcludeMaterial(room, s.surfaceKey);
          const isInGroup = !isExcluded && showMaterialGroups && groupedSurfaceKeys.has(s.surfaceKey) && (() => {
            const grp = materialGroups.find(g => g.surfaceKeys.includes(s.surfaceKey));
            if (!grp) return false;
            if (!grp.areaIds || grp.areaIds.length === 0) return true;
            return grp.areaIds.includes(room.id);
          })();
          const groupForSurface = isInGroup ? materialGroups.find(g => g.surfaceKeys.includes(s.surfaceKey)) : null;
          const groupMat = groupForSurface?.materialId ? allMaterials.find(m => m.id === groupForSurface.materialId) : null;
          const matId = isExcluded ? null : (isInGroup ? groupForSurface?.materialId || null : getEffectiveMaterialId(room, s.surfaceKey as SurfaceKey));
          const mat = isExcluded ? null : (isInGroup ? groupMat : (matId ? allMaterials.find(m => m.id === matId) : null));

          let materialCoverageRate: number | undefined;
          let materialQtyExact: number | undefined;
          let materialQtyBuy: number | undefined;
          let materialCostPerUnit: number | undefined;
          let materialTotalCost: number | undefined;
          let materialUnit: string | undefined;

          if (mat && mat.coverageSqftPerGallon && mat.coverageSqftPerGallon > 0 && s.paintableSqft > 0) {
            materialCoverageRate = mat.coverageSqftPerGallon;
            const baseQty = s.paintableSqft / mat.coverageSqftPerGallon;
            const wasteMultiplier = 1 + (mat.wastePercentage || 0);
            materialQtyExact = baseQty * wasteMultiplier;
            materialQtyBuy = isInGroup ? undefined : Math.ceil(materialQtyExact);
            const surfMarkup = 1 + ((mat.markupPercentage || 0) / 100);
            materialCostPerUnit = mat.costPerUnit * surfMarkup;
            materialTotalCost = isInGroup ? undefined : (materialQtyBuy! * materialCostPerUnit);
            materialUnit = "gal";
          }

          const isInPrimerGroup = showPrimerGroups && primerGroups.some(g => {
            if (!g.surfaceKeys.includes(s.surfaceKey)) return false;
            if (!g.areaIds || g.areaIds.length === 0) return true;
            return g.areaIds.includes(room.id);
          });
          const primerGroupForSurface = isInPrimerGroup ? primerGroups.find(g => g.surfaceKeys.includes(s.surfaceKey)) : null;
          const primerGroupMat = primerGroupForSurface?.materialId ? allMaterials.find(m => m.id === primerGroupForSurface.materialId) : null;
          const effectivePrimerMat = isInPrimerGroup ? primerGroupMat : (s.primerMaterialId ? allMaterials.find(m => m.id === s.primerMaterialId) : null);

          let primerMaterialCoverageRate: number | undefined;
          let primerMaterialQtyExact: number | undefined;
          let primerMaterialQtyBuy: number | undefined;
          let primerMaterialCostPerUnit: number | undefined;
          let primerMaterialTotalCost: number | undefined;
          let primerMaterialUnit: string | undefined;

          if (effectivePrimerMat && effectivePrimerMat.coverageSqftPerGallon && effectivePrimerMat.coverageSqftPerGallon > 0 && s.primerPaintableSqft && s.primerPaintableSqft > 0) {
            primerMaterialCoverageRate = effectivePrimerMat.coverageSqftPerGallon;
            const primerBaseQty = s.primerPaintableSqft / effectivePrimerMat.coverageSqftPerGallon;
            const primerWasteMultiplier = 1 + (effectivePrimerMat.wastePercentage || 0);
            primerMaterialQtyExact = primerBaseQty * primerWasteMultiplier;
            primerMaterialQtyBuy = isInPrimerGroup ? undefined : Math.ceil(primerMaterialQtyExact);
            const primerMarkup = 1 + ((effectivePrimerMat.markupPercentage || 0) / 100);
            primerMaterialCostPerUnit = effectivePrimerMat.costPerUnit * primerMarkup;
            primerMaterialTotalCost = isInPrimerGroup ? undefined : (primerMaterialQtyBuy! * primerMaterialCostPerUnit);
            primerMaterialUnit = "gal";
          }

          const repairState = room.repairOverride?.[s.surfaceKey];
          const surfDescOverride = room.surfaceDescriptionOverride?.[s.surfaceKey];

          return {
            surfaceName: s.surfaceName,
            surfaceKey: s.surfaceKey,
            quantity: s.quantity,
            unit: s.unit,
            coats: s.coats,
            usePaint: (s as any).usePaint,
            usePrimer: (s as any).usePrimer,
            laborHours: s.laborHours,
            price: s.price,
            paintableSqft: s.paintableSqft,
            materialName: ((s as any).usePaint === false) ? undefined : (mat ? `${mat.materialName} (${mat.brand})` : undefined),
            materialType: mat?.type || undefined,
            materialId: matId,
            materialCoverageRate,
            materialQtyExact,
            materialQtyBuy,
            materialCostPerUnit,
            materialTotalCost,
            materialUnit,
            inMaterialGroup: isInGroup,
            materialGroupName: isInGroup ? groupForSurface?.name : undefined,
            primerCoats: s.primerCoats,
            primerLaborHours: s.primerLaborHours,
            primerPaintableSqft: s.primerPaintableSqft,
            primerMaterialId: isInPrimerGroup ? (primerGroupForSurface?.materialId || null) : s.primerMaterialId,
            primerMaterialName: effectivePrimerMat ? `${effectivePrimerMat.materialName} (${effectivePrimerMat.brand})` : undefined,
            primerMaterialType: effectivePrimerMat?.type || undefined,
            inPrimerGroup: isInPrimerGroup || undefined,
            primerGroupName: isInPrimerGroup ? primerGroupForSurface?.name : undefined,
            primerMaterialCoverageRate,
            primerMaterialQtyExact,
            primerMaterialQtyBuy,
            primerMaterialCostPerUnit,
            primerMaterialTotalCost,
            primerMaterialUnit,
            complexityHours: room.complexityOverride?.[s.surfaceKey] || undefined,
            repairHours: s.repairHours || undefined,
            repairPrice: s.repairPrice || undefined,
            repairDescription: repairState?.description || undefined,
            description: surfDescOverride || undefined,
          } as SurfaceCalcResult;
        }),
        setupHours: result.setupHours,
        totalLaborHours: result.totalLaborHours,
        totalPrice: result.totalPrice,
        materialCosts: areaMaterialCosts,
      };
    });

    const roomBuilderData: RoomBuilderData = {
      rooms: rooms.map(r => ({
        id: r.id,
        name: r.name,
        sectionType: r.sectionType || 'room',
        length: r.length,
        width: r.width,
        ceilingHeight: r.ceilingHeight,
        walls: r.walls,
        ceiling: r.ceiling,
        baseboard: r.baseboard,
        crownMolding: r.crownMolding,
        shoeMolding: r.shoeMolding,
        chairRail: r.chairRail,
        doorCount: r.doorCount,
        windowCount: r.windowCount,
        doorCasing: r.doorCasing,
        windowCasing: r.windowCasing,
        doors: r.doors,
        cabinets: r.cabinets || undefined,
        cabinetsLf: r.cabinetsLf || undefined,
        staircaseRailing: r.staircaseRailing || undefined,
        staircaseRailingLf: r.staircaseRailingLf || undefined,
        accentWall: r.accentWall || undefined,
        accentWallSqft: r.accentWallSqft || undefined,
        closetInterior: r.closetInterior || undefined,
        closetInteriorSqft: r.closetInteriorSqft || undefined,
        doorHeightFt: r.doorHeightFt,
        doorWidthFt: r.doorWidthFt,
        scopeNotes: r.scopeNotes || undefined,
        isOptional: r.isOptional || undefined,
        coatsOverride: r.coatsOverride as Record<string, number>,
        materialOverride: r.materialOverride as Record<string, number | null>,
        primerOverride: r.primerOverride || {},
        paintOverride: r.paintOverride && Object.keys(r.paintOverride).length > 0 ? r.paintOverride : undefined,
        surfaceDescriptionOverride: r.surfaceDescriptionOverride && Object.keys(r.surfaceDescriptionOverride).length > 0 ? r.surfaceDescriptionOverride : undefined,
        complexityOverride: r.complexityOverride && Object.keys(r.complexityOverride).length > 0 ? r.complexityOverride : undefined,
        repairOverride: r.repairOverride && Object.keys(r.repairOverride).length > 0 ? r.repairOverride : undefined,
        priceOverride: r.priceOverride ?? undefined,
        photos: r.photos && r.photos.length > 0 ? r.photos : undefined,
        wallSelections: r.wallSelections.some(w => !w.enabled || w.sqftOverride != null) ? r.wallSelections : undefined,
        dynamicSurfaces: r.dynamicSurfaces && Object.keys(r.dynamicSurfaces).length > 0 ? r.dynamicSurfaces : undefined,
        surfacePriceOverride: r.surfacePriceOverride && Object.keys(r.surfacePriceOverride).length > 0 ? r.surfacePriceOverride : undefined,
        excludeMaterialCost: (r as any).excludeMaterialCost && Object.keys((r as any).excludeMaterialCost).length > 0 ? (r as any).excludeMaterialCost : undefined,
        excludePrimerCost: (r as any).excludePrimerCost && Object.keys((r as any).excludePrimerCost).length > 0 ? (r as any).excludePrimerCost : undefined,
      })),
      areaResults,
      sellRate: effectiveSellRate,
      setupHoursPerRoom: 0,
      sameColorAllAreas,
      subtractOpenings,
      estimateType: jobType,
      displayToggles,
      materialCosts: ungroupedMaterialCosts,
      materialGroups: showMaterialGroups ? materialGroups : [],
      materialGroupResults: showMaterialGroups ? materialGroupResults : [],
      primerGroups: showPrimerGroups ? primerGroups : [],
      primerGroupResults: showPrimerGroups ? primerGroupResults : [],
      totalLaborHours: grandLaborHours,
      totalLaborCost: grandTotal,
      totalMaterialCost,
      grandTotal: customerProvidingMaterials ? grandTotal : grandTotal + totalMaterialCost,
      customerProvidingMaterials: customerProvidingMaterials || undefined,
    };

    if (onSaveRoomData) {
      const selectedProfile = taxProfiles?.find(p => p.id === selectedTaxProfileId);
      const taxProfileInfo: TaxProfileInfo | undefined = blockTaxable && selectedProfile
        ? { taxProfileId: selectedProfile.id, taxProfileName: selectedProfile.name, taxProfileRate: parseFloat(selectedProfile.rate) }
        : undefined;
      onSaveRoomData(roomBuilderData, lineItems, blockName, blockTaxable, taxProfileInfo);
    } else {
      onGenerateLineItems(lineItems);
    }
  };

  const handleGenerate = () => {
    if (hasMissingMaterials && !customerProvidingMaterials) {
      setShowMaterialWarning(true);
      return;
    }
    doGenerate();
  };

  handleGenerateRef.current = handleGenerate;
  doGenerateRef.current = doGenerate;

  if (finLoading || surfLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading production rates...</span>
      </div>
    );
  }

  if (surfaces.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground">
        <p className="text-sm">No production rates configured yet.</p>
        <p className="text-xs mt-1">Set up your surfaces in Services first.</p>
      </div>
    );
  }

  if (effectiveSellRate <= 0) {
    return (
      <div className="text-center py-6 text-muted-foreground">
        <p className="text-sm">Sell rate not configured.</p>
        <p className="text-xs mt-1">Set your sell rate or margin in Financial Settings first.</p>
      </div>
    );
  }

  return (
    <>
    <AlertDialog open={showMaterialWarning} onOpenChange={setShowMaterialWarning}>
      <AlertDialogContent className="z-[10001]" overlayClassName="z-[10001]">
        <AlertDialogHeader>
          <AlertDialogTitle>Missing Material Selection</AlertDialogTitle>
          <AlertDialogDescription>
            Some surfaces or material groups don't have a paint material selected. Without materials, the total price won't include material costs and may not be accurate.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Go Back & Select</AlertDialogCancel>
          <AlertDialogAction onClick={() => { setShowMaterialWarning(false); doGenerate(); }}>
            Continue Without
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <div className="rounded-lg px-1 py-2 space-y-2" data-testid="room-builder">
      <div className="rounded-xl border-2 border-card-border bg-card px-2.5 py-2.5 space-y-2.5 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Calculator className="w-4 h-4 text-primary" />
            <div>
              <h3 className="text-sm font-semibold">Production Rate Estimator</h3>
              <button
                type="button"
                onClick={() => { setRateModalInput(effectiveSellRate.toFixed(2)); setShowRateModal(true); }}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                data-testid="button-edit-sell-rate"
              >
                <span>${effectiveSellRate.toFixed(2)}/hr sell rate</span>
                <Settings className="w-3 h-3" />
              </button>
            </div>
          </div>
          <span className="text-xs text-muted-foreground tabular-nums" data-testid="text-grand-total">
            {grandLaborHours.toFixed(1)} hrs — ${(customerProvidingMaterials ? grandTotal : grandTotal + totalMaterialCost).toFixed(0)}
          </span>
        </div>
        <Input
          value={blockName}
          onChange={(e) => setBlockName(e.target.value)}
          placeholder="Item name (e.g. Interior Painting)"
          className="text-sm"
          data-testid="input-block-name"
        />
        <div className="flex items-center gap-2">
          <div
            className="flex items-center gap-2 text-xs h-9 px-3 flex-1 rounded-md border border-primary/30 bg-primary/5 text-foreground"
            data-testid="text-active-service"
          >
            <span className="truncate font-medium">{jobType}</span>
            {allSurfacesData && (
              <span className="text-[10px] text-muted-foreground shrink-0">
                ({allSurfacesData.filter(s => s.estimateType === jobType).length} surfaces)
              </span>
            )}
          </div>
        </div>
        {allSurfacesData && (() => {
          const typeSurfaces = allSurfacesData.filter(s => s.estimateType === jobType);
          if (typeSurfaces.length === 0) return (
            <div className="px-1 -mt-1" data-testid="text-job-type-surfaces">
              <p className="text-xs text-amber-600 dark:text-amber-400 leading-snug">
                No surfaces set up for this service. Add rates in Services settings.
              </p>
            </div>
          );
          const names = typeSurfaces.map(s => s.surfaceName).join(", ");
          return (
            <div className="px-1 -mt-1" data-testid="text-job-type-surfaces">
              <p className="text-[13px] text-primary/70 leading-snug">
                <span className="font-semibold text-primary/90">Surfaces:</span> {names}
              </p>
            </div>
          );
        })()}

        {estimatorTiming && showTiming && (
          <div className="flex items-center gap-3 flex-wrap text-[10px] font-mono text-muted-foreground" data-testid="text-estimator-timing">
            <span className="flex items-center gap-1" data-testid="text-timing-ai">
              <Zap className="w-3 h-3" />
              AI {(estimatorTiming.openAiMs / 1000).toFixed(1)}s
            </span>
            {estimatorTiming.serverTotalMs - estimatorTiming.openAiMs > 500 && (
              <span className="flex items-center gap-1" data-testid="text-timing-server">
                <Cpu className="w-3 h-3" />
                Server {((estimatorTiming.serverTotalMs - estimatorTiming.openAiMs) / 1000).toFixed(1)}s
              </span>
            )}
            {estimatorTiming.networkMs > 500 && (
              <span className="flex items-center gap-1" data-testid="text-timing-network">
                <Timer className="w-3 h-3" />
                Network {(estimatorTiming.networkMs / 1000).toFixed(1)}s
              </span>
            )}
            <span className="flex items-center gap-1" data-testid="text-timing-build">
              <Cpu className="w-3 h-3" />
              Build {(estimatorTiming.buildMs / 1000).toFixed(2)}s
            </span>
            <span className="flex items-center gap-1 font-semibold" data-testid="text-timing-total">
              Total {(estimatorTiming.totalMs / 1000).toFixed(1)}s
            </span>
          </div>
        )}

        <div className="flex items-center gap-4 flex-wrap">
          {((taxRate ?? 0) > 0 || (taxProfiles && taxProfiles.length > 0)) && (
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2.5 cursor-pointer" data-testid="checkbox-block-taxable">
                <input
                  type="checkbox"
                  checked={blockTaxable}
                  onChange={(e) => {
                    setBlockTaxable(e.target.checked);
                    if (e.target.checked && taxProfiles && taxProfiles.length > 0 && !selectedTaxProfileId) {
                      const def = taxProfiles.find(p => p.isDefault);
                      if (def) setSelectedTaxProfileId(def.id);
                    }
                  }}
                  className="h-4 w-4 rounded border-input"
                />
                <span className="text-sm">Taxable</span>
              </label>
              {blockTaxable && taxProfiles && taxProfiles.length > 0 && (
                <select
                  value={selectedTaxProfileId || ''}
                  onChange={(e) => {
                    const newId = e.target.value ? parseInt(e.target.value) : undefined;
                    setSelectedTaxProfileId(newId);
                    if (newId) {
                      const profile = taxProfiles.find(p => p.id === newId);
                      if (profile) {
                        toast({ title: "Tax updated", description: `${profile.name} (${profile.rate}%) will apply to all taxable sections in this proposal.` });
                      }
                    }
                  }}
                  className="h-7 text-xs rounded border border-input bg-background px-2"
                  data-testid="select-tax-profile"
                >
                  <option value="">Select tax rate...</option>
                  {taxProfiles.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.rate}%)</option>
                  ))}
                </select>
              )}
              {blockTaxable && (!taxProfiles || taxProfiles.length === 0) && taxRate && (
                <span className="text-xs text-muted-foreground">({taxRate}%)</span>
              )}
            </div>
          )}
          <label className="flex items-center gap-1.5 cursor-pointer" data-testid="checkbox-subtract-openings">
            <input
              type="checkbox"
              checked={subtractOpenings}
              onChange={(e) => setSubtractOpenings(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            <span className="text-sm">Subtract Openings</span>
            <InfoBubble text="When enabled, door and window areas are subtracted from the total wall square footage. This gives a more precise estimate but most painters leave this off since the extra coverage accounts for prep, cutting in, and touch-ups around openings." />
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer" data-testid="checkbox-exclude-material-cost">
            <input
              type="checkbox"
              checked={customerProvidingMaterials}
              onChange={(e) => handleMasterExcludeToggle(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            <span className="text-sm">Don't include material cost</span>
            <InfoBubble text="When enabled, material costs are excluded from the proposal total for every surface in this section. Materials are still calculated for coverage and spray rate accuracy, but won't be billed. Each surface also has its own toggle to exclude only specific surfaces. Turning this master toggle off resets all per-surface overrides." />
          </label>
        </div>

        <div className="border-t border-border/30 mt-2 pt-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] text-muted-foreground mr-1">Show on document:</span>
            <DisplayToggleButton
              active={displayToggles.showLaborPrice}
              icon={DollarSign}
              label="Area Price"
              onClick={() => setDisplayToggles(prev => ({ ...prev, showLaborPrice: !prev.showLaborPrice }))}
              testId="toggle-labor-price"
            />
            <DisplayToggleButton
              active={displayToggles.showSurfaceTotal ?? false}
              icon={Layers}
              label="Surface Price"
              onClick={() => setDisplayToggles(prev => ({ ...prev, showSurfaceTotal: !(prev.showSurfaceTotal ?? false) }))}
              testId="toggle-surface-total"
            />
            <DisplayToggleButton
              active={displayToggles.showRepairPrice ?? false}
              icon={Wrench}
              label="Repair Price"
              onClick={() => setDisplayToggles(prev => ({ ...prev, showRepairPrice: !(prev.showRepairPrice ?? false) }))}
              testId="toggle-repair-price"
            />
            <DisplayToggleButton
              active={displayToggles.showMaterials ?? true}
              icon={Tag}
              label="Materials"
              onClick={() => setDisplayToggles(prev => ({ ...prev, showMaterials: !(prev.showMaterials ?? true) }))}
              testId="toggle-materials"
            />
            <DisplayToggleButton
              active={displayToggles.showMaterialPrice}
              icon={Tag}
              label="Material Price"
              onClick={() => setDisplayToggles(prev => ({ ...prev, showMaterialPrice: !prev.showMaterialPrice }))}
              testId="toggle-material-price"
            />
            <DisplayToggleButton
              active={displayToggles.showCostBreakdown ?? true}
              icon={BarChart3}
              label="Cost Breakdown"
              onClick={() => setDisplayToggles(prev => ({ ...prev, showCostBreakdown: !(prev.showCostBreakdown ?? true) }))}
              testId="toggle-cost-breakdown"
            />
            <DisplayToggleButton
              active={displayToggles.showSurfaceDetails}
              icon={Ruler}
              label="Surface Details"
              onClick={() => setDisplayToggles(prev => ({ ...prev, showSurfaceDetails: !prev.showSurfaceDetails }))}
              testId="toggle-surface-details"
            />
            <DisplayToggleButton
              active={displayToggles.showLaborHrs}
              icon={Clock}
              label="Labor Hrs"
              onClick={() => setDisplayToggles(prev => ({ ...prev, showLaborHrs: !prev.showLaborHrs }))}
              testId="toggle-labor-hrs"
            />
            <DisplayToggleButton
              active={displayToggles.showMaterialQty}
              icon={Droplets}
              label="Material Qty"
              onClick={() => setDisplayToggles(prev => ({ ...prev, showMaterialQty: !prev.showMaterialQty }))}
              testId="toggle-material-qty"
            />
            <DisplayToggleButton
              active={displayToggles.showOverrideTotal ?? true}
              icon={Zap}
              label="Override Total"
              onClick={() => setDisplayToggles(prev => ({ ...prev, showOverrideTotal: !(prev.showOverrideTotal ?? true) }))}
              testId="toggle-override-total"
            />
            <DisplayToggleButton
              active={displayToggles.showProjectTotalSqft ?? false}
              icon={SquareDashed}
              label="Area Sq Ft"
              onClick={() => setDisplayToggles(prev => ({ ...prev, showProjectTotalSqft: !(prev.showProjectTotalSqft ?? false) }))}
              testId="toggle-project-total-sqft"
            />
            <InfoBubble text="Show the total square footage for this section. Useful for services priced by area like flooring, ceilings, decks, or roofing. Each room shows its own square footage and the section header rolls them up. Excluded surfaces and contractor-hidden rooms are not counted in the customer-facing total. Optional rooms are listed separately as add-ons." />
            <InfoBubble text="Choose what detail your customer sees on the proposal. The grand total always shows regardless of these settings. This lets you keep pricing transparent or simple depending on the customer." />
          </div>
        </div>

      </div>

      <AlertDialog open={sectionToRemove !== null} onOpenChange={(o) => { if (!o) setSectionToRemove(null); }}>
        <AlertDialogContent className="z-[10002]" overlayClassName="z-[10002]">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove "{sectionToRemove !== null ? (rooms[sectionToRemove]?.name || `Section ${sectionToRemove + 1}`) : ''}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {sectionToRemove !== null && rooms[sectionToRemove] ? (() => {
                const r = rooms[sectionToRemove];
                const res = roomResults[sectionToRemove];
                const surfaceCount = res?.surfaces.length || 0;
                const hasPhotos = r.photos && r.photos.length > 0;
                const parts: string[] = [];
                if (surfaceCount > 0) parts.push(`${surfaceCount} surface${surfaceCount !== 1 ? 's' : ''} with pricing`);
                if (hasPhotos) parts.push(`${r.photos!.length} photo${r.photos!.length !== 1 ? 's' : ''}`);
                return parts.length > 0
                  ? `This section has ${parts.join(' and ')}. Removing it cannot be undone.`
                  : 'This will permanently remove this section.';
              })() : 'This will permanently remove this section.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (sectionToRemove !== null) {
                  removeRoom(sectionToRemove);
                }
                setSectionToRemove(null);
              }}
              data-testid="button-confirm-remove-section"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!surfaceToRemove} onOpenChange={(open) => !open && setSurfaceToRemove(null)}>
        <AlertDialogContent className="z-[10003]">
          <AlertDialogHeader>
            <AlertDialogTitle>Turn off this surface?</AlertDialogTitle>
            <AlertDialogDescription>
              {surfaceToRemove ? (
                <>You'll lose any custom settings for <strong>{surfaceToRemove.surfaceName}</strong> in this section (coats, material, primer, or wall selections). This can't be undone.</>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-remove-surface">Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!surfaceToRemove) return;
                const { roomIndex, key, isDynamic } = surfaceToRemove;
                if (isDynamic) {
                  setRooms(prev => prev.map((r, i) => {
                    if (i !== roomIndex) return r;
                    const existing = r.dynamicSurfaces[key] || { enabled: false, qty: 0 };
                    return { ...r, dynamicSurfaces: { ...r.dynamicSurfaces, [key]: { ...existing, enabled: false } } };
                  }));
                } else {
                  toggleSurface(roomIndex, key as SurfaceKey, false, true);
                }
                setSurfaceToRemove(null);
              }}
              data-testid="button-confirm-remove-surface"
            >
              Turn off
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="rounded-xl border-2 border-amber-300/50 dark:border-amber-600/30 bg-card overflow-hidden shadow-md shadow-amber-400/15 dark:shadow-amber-500/10" data-testid="sections-container">
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/40 bg-muted/30">
          <span className="text-[13px] font-semibold">Sections</span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {rooms.length} section{rooms.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="p-2 space-y-2">
      {rooms.map((room, roomIndex) => {
        const result = roomResults[roomIndex];
        const rawAreaMatCosts = perAreaMaterialCosts[roomIndex] || [];
        const areaMaterialCosts = rawAreaMatCosts.filter(c => !isGroupedSurface(c.surfaceName, room.id));
        const areaMaterialTotal = areaMaterialCosts.reduce((s, c) => s + c.totalCost, 0);
        const isDragOver = dragOverIndex === roomIndex && dragIndexRef.current !== roomIndex;
        return (
          <div
            key={room.id}
            draggable
            onDragStart={(e) => handleDragStart(e, roomIndex)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => handleDragOver(e, roomIndex)}
            onDrop={(e) => handleDrop(e, roomIndex)}
            className={cn(
              "rounded-xl border bg-card transition-shadow",
              isDragOver ? "ring-2 ring-primary shadow-lg shadow-primary/20 border-primary/30" : "shadow-md shadow-red-400/20 dark:shadow-red-500/15 border-black/20 dark:border-white/20"
            )}
            data-testid={`card-area-${roomIndex}`}
          >
            <div
              className="cursor-pointer active:bg-muted/40 transition-colors rounded-xl"
              style={{ touchAction: 'manipulation' }}
              onClick={() => openSectionEditor(roomIndex)}
              data-testid={`button-toggle-area-${roomIndex}`}
            >
              <div className="flex items-center w-full">
                <div
                  className="flex items-center justify-center px-2 py-3 cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground bg-muted/20 rounded-l-xl shrink-0 border-r border-border/40"
                  onMouseDown={handleGripMouseDown}
                  onClick={(e) => e.stopPropagation()}
                  data-testid={`drag-handle-area-${roomIndex}`}
                  data-mutating="true"
                >
                  <GripVertical className="w-4 h-4" />
                </div>
                <div className="flex items-center justify-between flex-1 pr-3 py-3 text-left min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <Pencil className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
                    <span className="text-sm font-medium truncate">{room.name || `Section ${roomIndex + 1}`}</span>
                    <span className={cn(
                      "text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0",
                      (room.sectionType || 'room') === 'room' && "text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30",
                      (room.sectionType || 'room') === 'exterior' && "text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30",
                      (room.sectionType || 'room') === 'area' && "text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/30",
                      (room.sectionType || 'room') === 'cabinets' && "text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30",
                    )}>
                      {SECTION_TYPE_LABELS[room.sectionType || 'room']}
                    </span>
                    {room.isOptional && <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded shrink-0">Optional</span>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => updateRoom(roomIndex, { isOptional: !room.isOptional })}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${room.isOptional ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                      data-testid={`button-toggle-optional-area-${roomIndex}`}
                      title={room.isOptional ? 'Mark as required' : 'Mark as optional'}
                      data-mutating="true"
                    >
                      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${room.isOptional ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
                    </button>
                    <button
                      type="button"
                      onClick={() => duplicateRoom(roomIndex)}
                      className="p-1 text-muted-foreground/60 hover:text-primary"
                      data-testid={`button-copy-area-${roomIndex}`}
                      title="Duplicate area"
                      data-mutating="true"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setSectionToRemove(roomIndex)}
                      className="p-1 text-destructive/60 hover:text-destructive"
                      data-testid={`button-remove-area-${roomIndex}`}
                      data-mutating="true"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
              {result && (
                <div className="px-3 pb-2.5 pt-0.5">
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="font-semibold text-sm text-foreground tabular-nums" data-testid={`text-area-price-${roomIndex}`}>
                      {room.priceOverride != null ? (
                        <span className="text-primary">${room.priceOverride.toLocaleString()}</span>
                      ) : (
                        <span>${result.totalPrice.toFixed(0)}</span>
                      )}
                    </span>
                    <span className="tabular-nums">{result.totalLaborHours.toFixed(1)} hrs</span>
                    {(() => {
                      const enabledSurfaces = result.surfaces.map(s => s.surfaceName);
                      return enabledSurfaces.length > 0 ? (
                        <span className="truncate">{enabledSurfaces.length} surface{enabledSurfaces.length !== 1 ? 's' : ''}</span>
                      ) : null;
                    })()}
                    {room.photos && room.photos.length > 0 && (
                      <span className="flex items-center gap-0.5">
                        <Camera className="w-3 h-3" />
                        {room.photos.length}
                      </span>
                    )}
                  </div>
                  {result.surfaces.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {result.surfaces.slice(0, 6).map(s => (
                        <span key={s.surfaceKey} className="text-[10px] bg-muted/60 text-muted-foreground px-1.5 py-0.5 rounded">{s.surfaceName}</span>
                      ))}
                      {result.surfaces.length > 6 && (
                        <span className="text-[10px] text-muted-foreground">+{result.surfaces.length - 6} more</span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {editingRoomIndex === roomIndex && createPortal(
              <div className="fixed inset-0 z-[10001] bg-background flex flex-col" data-testid={`section-editor-modal-${roomIndex}`}>
                <div className="shrink-0 bg-slate-800 dark:bg-slate-900 text-white shadow-md pt-[env(safe-area-inset-top,0px)]">
                  <div className="flex items-center justify-between px-3 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={cn(
                        "text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0",
                        (room.sectionType || 'room') === 'room' && "text-blue-300 bg-blue-500/20",
                        (room.sectionType || 'room') === 'exterior' && "text-orange-300 bg-orange-500/20",
                        (room.sectionType || 'room') === 'area' && "text-purple-300 bg-purple-500/20",
                        (room.sectionType || 'room') === 'cabinets' && "text-amber-300 bg-amber-500/20",
                      )}>
                        {SECTION_TYPE_LABELS[room.sectionType || 'room']}
                      </span>
                      <span className="text-sm font-semibold truncate text-white">{room.name || `Section ${roomIndex + 1}`}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleSectionCancel}
                        className="text-xs px-3 py-1.5 rounded-lg border border-white/20 text-white/70 hover:text-white hover:bg-white/10 font-medium"
                        data-testid="button-section-cancel"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleSectionSave}
                        className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90"
                        data-testid="button-section-save"
                      >
                        <Check className="w-3.5 h-3.5 inline mr-1" />
                        Done
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between px-3 py-1.5 bg-white/5 border-t border-white/10">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {room.priceOverride != null ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold text-emerald-400 tabular-nums" data-testid={`text-override-price-modal-${roomIndex}`}>
                            ${room.priceOverride.toLocaleString()}
                          </span>
                          <span className="text-[11px] line-through text-white/30 tabular-nums">
                            ${result?.totalPrice.toFixed(0)}
                          </span>
                          <button type="button" onClick={() => updateRoom(roomIndex, { priceOverride: undefined })} className="p-0.5 text-white/40 hover:text-red-400" data-testid={`button-clear-override-modal-${roomIndex}`}>
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-sm font-semibold tabular-nums text-white">${result?.totalPrice.toFixed(0)}</span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOverrideDialogRoom(roomIndex);
                          setOverrideDialogValue(room.priceOverride != null ? String(room.priceOverride) : '');
                        }}
                        className={cn(
                          "text-[10px] px-2 py-0.5 rounded-full border transition-colors font-medium",
                          room.priceOverride != null
                            ? "text-emerald-400 border-emerald-400/30 bg-emerald-400/10"
                            : "text-white/60 border-white/20 hover:border-white/40 hover:text-white"
                        )}
                        data-testid={`button-price-override-modal-${roomIndex}`}
                      >
                        Override
                      </button>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-white/50 tabular-nums mr-1">
                        {result ? `${result.totalLaborHours.toFixed(1)} hrs` : ''}
                      </span>
                      <input
                        ref={(el) => { photoInputRefs.current[roomIndex] = el; }}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => handleRoomPhotoUpload(roomIndex, e.target.files)}
                        data-testid={`input-room-photo-${roomIndex}`}
                      />
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setPhotoMenuRoom(photoMenuRoom === roomIndex ? null : roomIndex)}
                          disabled={uploadingPhotoRoom === roomIndex}
                          className="p-2 rounded-lg bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 hover:text-blue-200 transition-colors"
                          data-testid={`button-gallery-photo-${roomIndex}`}
                          title="Add photos"
                        >
                          {uploadingPhotoRoom === roomIndex ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImageIcon className="w-5 h-5" />}
                        </button>
                        {photoMenuRoom === roomIndex && (
                          <>
                            <div className="fixed inset-0 z-[10001]" onClick={() => setPhotoMenuRoom(null)} />
                            <div className="absolute right-0 top-full mt-1 z-[10002] bg-slate-700 rounded-lg shadow-xl border border-white/10 overflow-hidden min-w-[160px]">
                              {projectId && (
                                <button
                                  type="button"
                                  onClick={() => { setPhotoMenuRoom(null); setProjectPhotoPickerRoom(roomIndex); }}
                                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-white hover:bg-white/10 transition-colors"
                                  data-testid={`button-project-photos-${roomIndex}`}
                                >
                                  <FolderOpen className="w-4 h-4 text-amber-400" />
                                  Project Photos
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => { setPhotoMenuRoom(null); photoInputRefs.current[roomIndex]?.click(); }}
                                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-white hover:bg-white/10 transition-colors"
                                data-testid={`button-device-gallery-${roomIndex}`}
                              >
                                <ImageIcon className="w-4 h-4 text-blue-400" />
                                From Device
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setCameraRoomIndex(roomIndex)}
                        className="p-2 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 hover:text-emerald-200 transition-colors"
                        data-testid={`button-camera-photo-${roomIndex}`}
                        title="Take photo"
                      >
                        <Camera className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto px-2 pb-6 space-y-4" style={{ paddingBottom: sectionKbHeight > 0 ? sectionKbHeight + 40 : undefined, WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain', touchAction: 'pan-y' }}>
                <div className="pt-3 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Input
                      value={room.name}
                      onChange={(e) => updateRoom(roomIndex, { name: e.target.value })}
                      onBlur={(e) => {
                        const others = rooms.filter((_, i) => i !== roomIndex).map(r => r.name);
                        const unique = uniqueSectionName(e.target.value, others);
                        if (unique !== e.target.value) {
                          updateRoom(roomIndex, { name: unique });
                          toast({ title: "Renamed to keep section names unique", description: `Saved as "${unique}"` });
                        }
                      }}
                      placeholder="Section name"
                      className="text-sm"
                      data-testid={`input-area-name-${roomIndex}`}
                    />
                    <InfoBubble text="A section is any space you're working on — a room, hallway, stairwell, closet, or exterior section. It helps organize the estimate." />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground">Area Description / Scope</label>
                    <Textarea
                      value={room.scopeNotes || ''}
                      onChange={(e) => {
                        updateRoom(roomIndex, { scopeNotes: e.target.value });
                        const el = e.target;
                        el.style.height = 'auto';
                        el.style.height = Math.min(el.scrollHeight, 200) + 'px';
                      }}
                      onFocus={(e) => {
                        const el = e.target;
                        el.style.height = 'auto';
                        el.style.height = Math.min(el.scrollHeight, 200) + 'px';
                      }}
                      placeholder="Describe the work scope for this area (e.g., Patch and prime water damage, repaint entire room)"
                      className="text-sm resize-y min-h-[52px] max-h-[200px] overflow-y-auto"
                      rows={2}
                      data-testid={`input-scope-notes-${roomIndex}`}
                    />
                  </div>
                  {(() => {
                    const st = room.sectionType || 'room';
                    const dims = SECTION_TYPE_DEFAULTS[st].dims;
                    if (dims === 'none') return null;
                    const needsLength = dims === 'lwh' || dims === 'lh' || dims === 'lw';
                    const needsWidth = dims === 'lwh' || dims === 'lw';
                    const needsHeight = dims === 'lwh' || dims === 'lh';
                    const hasAnySurfaces = hasInteriorSurfaces || dynamicSurfaceDefs.length > 0;
                    const showDims = hasAnySurfaces;
                    const missingDim = (needsLength && !room.length) || (needsWidth && !room.width) || (needsHeight && !room.ceilingHeight);
                    const dimLabel = dims === 'lh' ? 'length and height' : dims === 'lw' ? 'length and width' : 'length, width, and height';
                    const lengthLabel = st === 'exterior' ? 'Perimeter' : 'Length';
                    return (
                      <>
                        {showDims && missingDim && (
                          <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-300 dark:border-red-800 px-3 py-1.5 text-xs text-red-700 dark:text-red-400 font-medium" data-testid={`warning-dimensions-${roomIndex}`}>
                            Missing dimensions — enter {dimLabel}
                          </div>
                        )}
                        {showDims && (
                        <div className="flex items-center gap-2">
                          {needsLength && (
                            <>
                              <div className="flex-1">
                                <label className={cn("text-[11px]", !room.length ? "text-red-500 font-semibold" : "text-muted-foreground")}>{lengthLabel}</label>
                                <NumericInput
                                  value={room.length || ""}
                                  onChange={(v) => updateRoomDimAndRecalc(roomIndex, 'length', v)}
                                  placeholder={String(DEFAULT_LENGTH)}
                                  className={cn("text-sm text-center", !room.length && "border-red-400 dark:border-red-600")}
                                  testId={`input-area-length-${roomIndex}`}
                                />
                              </div>
                              <span className="text-xs text-muted-foreground mt-4">x</span>
                            </>
                          )}
                          {needsWidth && (
                            <>
                              <div className="flex-1">
                                <label className={cn("text-[11px]", !room.width ? "text-red-500 font-semibold" : "text-muted-foreground")}>Width</label>
                                <NumericInput
                                  value={room.width || ""}
                                  onChange={(v) => updateRoomDimAndRecalc(roomIndex, 'width', v)}
                                  placeholder={String(DEFAULT_WIDTH)}
                                  className={cn("text-sm text-center", !room.width && "border-red-400 dark:border-red-600")}
                                  testId={`input-area-width-${roomIndex}`}
                                />
                              </div>
                              {needsHeight && <span className="text-xs text-muted-foreground mt-4">x</span>}
                            </>
                          )}
                          {needsHeight && (
                            <div className="flex-1">
                              <label className={cn("text-[11px]", !room.ceilingHeight ? "text-red-500 font-semibold" : "text-muted-foreground")}>Height</label>
                              <NumericInput
                                value={room.ceilingHeight || ""}
                                onChange={(v) => updateRoomDimAndRecalc(roomIndex, 'ceilingHeight', v)}
                                placeholder={String(DEFAULT_HEIGHT)}
                                className={cn("text-sm text-center", !room.ceilingHeight && "border-red-400 dark:border-red-600")}
                                testId={`input-area-ceiling-${roomIndex}`}
                              />
                            </div>
                          )}
                          <span className="text-[11px] text-muted-foreground mt-4">ft</span>
                        </div>
                        )}
                      </>
                    );
                  })()}
                </div>

                {AREA_SURFACES.some(({ key }) => activeInteriorKeys.has(key) && isSurfaceAllowedForType(key, room.sectionType || 'room')) && (
                <div className="space-y-1.5 rounded-lg border-2 border-border/60 bg-card dark:bg-card px-2.5 py-2">
                  <span className="text-sm font-bold text-foreground uppercase tracking-wide">Surfaces</span>
                  <div className="space-y-1.5">
                    {AREA_SURFACES.filter(({ key }) => activeInteriorKeys.has(key) && isSurfaceAllowedForType(key, room.sectionType || 'room')).map(({ key, label }) => {
                      const enabled = room[key] as boolean;
                      const effectiveMatId = enabled ? getEffectiveMaterialId(room, key) : null;
                      const effectiveMat = effectiveMatId ? allMaterials.find(m => m.id === effectiveMatId) : null;
                      const isOverridden = room.materialOverride[key] !== undefined;
                      return (
                        <div
                          key={key}
                          className={cn(
                            "rounded-lg border-2 px-3 py-2 transition-colors",
                            enabled ? "border-primary/25 bg-primary/[0.03] dark:bg-primary/[0.06] shadow-sm" : "border-border/40 bg-muted/30"
                          )}
                          data-testid={`surface-card-${key}-${roomIndex}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <label className="flex items-center gap-2.5 cursor-pointer">
                              <Switch
                                checked={enabled}
                                onCheckedChange={(checked) => toggleSurface(roomIndex, key, checked)}
                                className="scale-75 origin-left shrink-0"
                              />
                              <span className={cn("text-sm", enabled ? "font-semibold" : "text-muted-foreground")}>{label}</span>
                            </label>
                            <div className="flex items-center gap-2">
                              {enabled && (
                                <>
                                  <MiniStepper
                                    value={getCoats(room, key)}
                                    onChange={(v) => updateCoats(roomIndex, key, v)}
                                    min={1}
                                    max={5}
                                    testId={`coats-${key}-${roomIndex}`}
                                    disabled={!getPaintEnabled(room, key)}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => toggleSurfaceExpand(roomIndex, key)}
                                    className="p-1 rounded hover:bg-muted/60 text-muted-foreground"
                                    data-testid={`btn-expand-${key}-${roomIndex}`}
                                  >
                                    {isSurfaceExpanded(roomIndex, key) ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                          {enabled && key === "walls" && (room.sectionType || 'room') === 'room' && (() => {
                            const sqfts = getIndividualWallSqfts(room);
                            const ws = room.wallSelections;
                            const total = ws.reduce((s, w, i) => s + (w.enabled ? sqfts[i] : 0), 0);
                            const groups = [
                              { title: `Length ${room.length}'`, indices: [0, 2], labels: ["L", "R"] },
                              { title: `Width ${room.width}'`, indices: [1, 3], labels: ["F", "B"] },
                            ];
                            return (
                              <div className="mt-1.5" data-testid={`wall-selections-${roomIndex}`}>
                                <div className="flex gap-1.5">
                                  {groups.map((g) => (
                                    <div key={g.title} className="flex-1 rounded-md border border-border/50 bg-muted/20 px-2 py-1.5">
                                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">{g.title}</span>
                                      <div className="flex gap-1">
                                        {g.indices.map((wi, li) => {
                                          const w = ws[wi];
                                          return (
                                            <button
                                              key={wi}
                                              type="button"
                                              onClick={() => {
                                                setRooms(prev => prev.map((r, ri) => {
                                                  if (ri !== roomIndex) return r;
                                                  const newWs = [...r.wallSelections];
                                                  newWs[wi] = { ...newWs[wi], enabled: !newWs[wi].enabled };
                                                  return { ...r, wallSelections: newWs };
                                                }));
                                              }}
                                              className={cn(
                                                "flex-1 flex flex-col items-center px-1.5 py-1 rounded border text-[10px] transition-colors",
                                                w.enabled
                                                  ? "border-primary/40 bg-primary/10 text-foreground"
                                                  : "border-border/40 bg-muted/30 text-muted-foreground line-through opacity-50"
                                              )}
                                              data-testid={`wall-toggle-${roomIndex}-${wi}`}
                                            >
                                              <span className="font-medium leading-tight">{g.labels[li]}</span>
                                              <span className="tabular-nums leading-tight">
                                                {w.sqftOverride != null ? (
                                                  <span className="text-amber-600 dark:text-amber-400">{Math.round(w.sqftOverride)} sf</span>
                                                ) : (
                                                  <span>{Math.round(sqfts[wi])} sf</span>
                                                )}
                                              </span>
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  ))}
                                  <button
                                    type="button"
                                    onClick={() => setWallEditModal({ roomIndex, wallSelections: ws.map((w, i) => ({ ...w, sqftOverride: w.sqftOverride ?? null, _defaultSqft: sqfts[i] })) })}
                                    className="self-center p-1 rounded hover:bg-muted/60 text-muted-foreground"
                                    data-testid={`wall-edit-btn-${roomIndex}`}
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                </div>
                                <div className="flex items-center justify-end mt-1">
                                  <span className="text-[10px] text-muted-foreground tabular-nums">{Math.round(total)} sf total</span>
                                </div>
                              </div>
                            );
                          })()}
                          {enabled && isSurfaceExpanded(roomIndex, key) && (() => {
                            const paintOn = getPaintEnabled(room, key);
                            const isMasterExcl = customerProvidingMaterials;
                            const surfaceExcluded = isMasterExcl || !!(room as any).excludeMaterialCost?.[key];
                            return (
                              <div data-testid={`paint-section-${key}-${roomIndex}`}>
                                <div className="flex items-center justify-between gap-2 mt-2 pb-2 border-b border-border/30">
                                  <label className="flex items-center gap-2 cursor-pointer">
                                    <Switch
                                      checked={surfaceExcluded}
                                      disabled={isMasterExcl}
                                      onCheckedChange={(checked) => updateExcludeMaterial(roomIndex, key, checked)}
                                      className="scale-[0.6] origin-left shrink-0"
                                      data-testid={`switch-exclude-material-${key}-${roomIndex}`}
                                    />
                                    <span className={cn("text-xs", surfaceExcluded ? "font-semibold text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>Don't include material cost</span>
                                  </label>
                                  {isMasterExcl && <span className="text-[10px] text-muted-foreground italic">Set on section</span>}
                                </div>
                                <div className="flex items-center justify-between gap-2 mt-2">
                                  <label className="flex items-center gap-2 cursor-pointer">
                                    <Switch
                                      checked={paintOn}
                                      onCheckedChange={(checked) => updatePaintOverride(roomIndex, key, checked)}
                                      className="scale-[0.6] origin-left shrink-0"
                                      data-testid={`switch-paint-${key}-${roomIndex}`}
                                    />
                                    <span className={cn("text-xs", paintOn ? "font-semibold text-foreground" : "text-muted-foreground")}>Default Material</span>
                                  </label>
                                </div>
                                {paintOn && (
                                  <MaterialPickerRow
                                    effectiveMatId={effectiveMatId}
                                    effectiveMat={effectiveMat}
                                    isOverridden={isOverridden}
                                    surfaceKey={key}
                                    roomIndex={roomIndex}
                                    paintPrimerMaterials={paintPrimerMaterials}
                                    allMaterials={allMaterials}
                                    onSelect={(matId) => updateMaterialOverride(roomIndex, key, matId)}
                                  />
                                )}
                              </div>
                            );
                          })()}
                          {enabled && isSurfaceExpanded(roomIndex, key) && canUsePrimer(key) && (() => {
                            const ps = getPrimerState(room, key);
                            return (
                              <div className="mt-2 pt-2 border-t border-border/30" data-testid={`primer-section-${key}-${roomIndex}`}>
                                {(() => {
                                  const isMasterExclP = customerProvidingMaterials;
                                  const primerExcluded = isMasterExclP || !!(room as any).excludePrimerCost?.[key];
                                  return (
                                    <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-border/30">
                                      <label className="flex items-center gap-2 cursor-pointer">
                                        <Switch
                                          checked={primerExcluded}
                                          disabled={isMasterExclP}
                                          onCheckedChange={(checked) => updateExcludePrimer(roomIndex, key, checked)}
                                          className="scale-[0.6] origin-left shrink-0"
                                          data-testid={`switch-exclude-primer-${key}-${roomIndex}`}
                                        />
                                        <span className={cn("text-xs", primerExcluded ? "font-semibold text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>Don't include primer cost</span>
                                      </label>
                                      {isMasterExclP && <span className="text-[10px] text-muted-foreground italic">Set on section</span>}
                                    </div>
                                  );
                                })()}
                                <div className="flex items-center justify-between gap-2">
                                  <label className="flex items-center gap-2 cursor-pointer">
                                    <Switch
                                      checked={ps.enabled}
                                      onCheckedChange={(checked) => updatePrimerOverride(roomIndex, key, { enabled: checked })}
                                      className="scale-[0.6] origin-left shrink-0"
                                    />
                                    <span className={cn("text-xs", ps.enabled ? "font-semibold text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>Primer</span>
                                  </label>
                                  {ps.enabled && (
                                    <MiniStepper
                                      value={ps.coats}
                                      onChange={(v) => updatePrimerOverride(roomIndex, key, { coats: Math.max(1, v) })}
                                      min={1}
                                      max={3}
                                      testId={`primer-coats-${key}-${roomIndex}`}
                                    />
                                  )}
                                </div>
                                {ps.enabled && (
                                  <MaterialPickerRow
                                    effectiveMatId={ps.materialId || null}
                                    effectiveMat={ps.materialId ? allMaterials.find(m => m.id === ps.materialId) : null}
                                    isOverridden={!!ps.materialId}
                                    surfaceKey={`primer-${key}`}
                                    roomIndex={roomIndex}
                                    paintPrimerMaterials={primerMaterials}
                                    allMaterials={allMaterials}
                                    onSelect={(matId) => updatePrimerOverride(roomIndex, key, { materialId: matId })}
                                    icon={Droplets}
                                    emptyLabel="Select primer"
                                  />
                                )}
                              </div>
                            );
                          })()}
                          {enabled && isSurfaceExpanded(roomIndex, key) && (() => {
                            const ss = getSubstrateState(room, key);
                            return (
                              <div className="mt-2 pt-2 border-t border-border/30" data-testid={`substrate-section-${key}-${roomIndex}`}>
                                <div className="flex items-center justify-between gap-2">
                                  <label className="flex items-center gap-2 cursor-pointer">
                                    <Switch
                                      checked={ss.enabled}
                                      onCheckedChange={(checked) => updateSubstrateOverride(roomIndex, key, { enabled: checked })}
                                      className="scale-[0.6] origin-left shrink-0"
                                    />
                                    <span className={cn("text-xs", ss.enabled ? "font-semibold text-blue-700 dark:text-blue-400" : "text-muted-foreground")}>Substrate</span>
                                  </label>
                                </div>
                                {ss.enabled && (
                                  <SubstratePickerRow
                                    value={ss.value}
                                    surfaceKey={key}
                                    roomIndex={roomIndex}
                                    onSelect={(v) => updateSubstrateOverride(roomIndex, key, { value: v })}
                                  />
                                )}
                              </div>
                            );
                          })()}
                          {enabled && isSurfaceExpanded(roomIndex, key) && (() => {
                            const def = SURFACE_DEFAULTS[key];
                            const surf = surfacesData ? (findSurface(surfacesData, def.dbName) || (def.altName ? findSurface(surfacesData, def.altName) : undefined)) : undefined;
                            const defaultDesc = surf?.areaDescription || '';
                            const overrideDesc = room.surfaceDescriptionOverride?.[key];
                            const currentDesc = overrideDesc !== undefined ? overrideDesc : defaultDesc;
                            return (
                              <div className="mt-2 pt-2 border-t border-border/30">
                                <label className="text-[10px] text-muted-foreground">Surface Description</label>
                                <Textarea
                                  value={currentDesc}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setRooms(prev => prev.map((r, i) => {
                                      if (i !== roomIndex) return r;
                                      return { ...r, surfaceDescriptionOverride: { ...r.surfaceDescriptionOverride, [key]: val } };
                                    }));
                                    const el = e.target;
                                    el.style.height = 'auto';
                                    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
                                  }}
                                  onFocus={(e) => {
                                    const el = e.target;
                                    el.style.height = 'auto';
                                    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
                                  }}
                                  placeholder="Describe the work for this surface..."
                                  className="text-xs resize-y min-h-[36px] max-h-[200px] overflow-y-auto mt-0.5"
                                  rows={1}
                                  data-testid={`surface-description-${key}-${roomIndex}`}
                                />
                              </div>
                            );
                          })()}
                          {enabled && isSurfaceExpanded(roomIndex, key) && (
                            <ComplexityPicker
                              value={room.complexityOverride?.[key] || 0}
                              onChange={(v) => {
                                setRooms(prev => prev.map((r, i) => {
                                  if (i !== roomIndex) return r;
                                  return { ...r, complexityOverride: { ...(r.complexityOverride || {}), [key]: v } };
                                }));
                              }}
                              surfaceKey={key}
                              roomIndex={roomIndex}
                            />
                          )}
                          {enabled && isSurfaceExpanded(roomIndex, key) && (
                            <RepairPicker
                              hours={room.repairOverride?.[key]?.hours || 0}
                              description={room.repairOverride?.[key]?.description}
                              onHoursChange={(h) => {
                                setRooms(prev => prev.map((r, i) => {
                                  if (i !== roomIndex) return r;
                                  const prev_repair = r.repairOverride?.[key];
                                  return { ...r, repairOverride: { ...(r.repairOverride || {}), [key]: { hours: h, description: prev_repair?.description } } };
                                }));
                              }}
                              onDescriptionChange={(desc) => {
                                setRooms(prev => prev.map((r, i) => {
                                  if (i !== roomIndex) return r;
                                  const prev_repair = r.repairOverride?.[key];
                                  return { ...r, repairOverride: { ...(r.repairOverride || {}), [key]: { hours: prev_repair?.hours || 0, description: desc } } };
                                }));
                              }}
                              surfaceKey={key}
                              roomIndex={roomIndex}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                )}

                {ITEM_SURFACES.some(({ key }) => activeInteriorKeys.has(key) && isSurfaceAllowedForType(key, room.sectionType || 'room')) && (
                <div className="space-y-1.5 rounded-lg border-2 border-border/60 bg-card dark:bg-card px-2.5 py-2">
                  <span className="text-sm font-bold text-foreground uppercase tracking-wide">Quantity Items</span>
                  <div className="space-y-2">
                    {ITEM_SURFACES.filter(({ key }) => activeInteriorKeys.has(key) && isSurfaceAllowedForType(key, room.sectionType || 'room')).map(({ key, label, countKey }) => {
                      const enabled = room[key] as boolean;
                      const count = room[countKey];
                      const effectiveMatId = enabled ? getEffectiveMaterialId(room, key) : null;
                      const effectiveMat = effectiveMatId ? allMaterials.find(m => m.id === effectiveMatId) : null;
                      const isOverridden = room.materialOverride[key] !== undefined;
                      return (
                        <div
                          key={key}
                          className={cn(
                            "rounded-lg border-2 px-3 py-2 transition-colors",
                            enabled ? "border-primary/25 bg-primary/[0.03] dark:bg-primary/[0.06] shadow-sm" : "border-border/40 bg-muted/30"
                          )}
                          data-testid={`surface-card-${key}-${roomIndex}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <label className="flex items-center gap-2.5 cursor-pointer">
                              <Switch
                                checked={enabled}
                                onCheckedChange={(checked) => updateRoom(roomIndex, { [key]: checked })}
                                className="scale-75 origin-left shrink-0"
                              />
                              <span className={cn("text-sm", enabled ? "font-semibold" : "text-muted-foreground")}>{label}</span>
                            </label>
                            {enabled && (
                              <button
                                type="button"
                                onClick={() => toggleSurfaceExpand(roomIndex, key)}
                                className="p-1 rounded hover:bg-muted/60 text-muted-foreground"
                                data-testid={`btn-expand-${key}-${roomIndex}`}
                              >
                                {isSurfaceExpanded(roomIndex, key) ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </button>
                            )}
                          </div>
                          {enabled && (
                            <>
                              <div className="flex items-center gap-2.5 mt-2.5">
                                <div className="flex-1 rounded-lg border-2 border-border/50 bg-background p-2">
                                  <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Quantity</span>
                                  <div className="flex items-center justify-center mt-1">
                                    <EditableStepper
                                      value={count}
                                      onChange={(v) => updateRoom(roomIndex, { [countKey]: v })}
                                      testId={`qty-${key}-${roomIndex}`}
                                    />
                                  </div>
                                </div>
                                <div className="flex-1 rounded-lg border-2 border-border/50 bg-background p-2">
                                  <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">{pluralizeLabel(getCoatsLabel(key, surfaces), 2)}</span>
                                  <div className="flex items-center justify-center mt-1">
                                    <MiniStepper
                                      value={getCoats(room, key)}
                                      onChange={(v) => updateCoats(roomIndex, key, v)}
                                      min={1}
                                      max={5}
                                      testId={`coats-${key}-${roomIndex}`}
                                      disabled={!getPaintEnabled(room, key)}
                                    />
                                  </div>
                                </div>
                              </div>
                              {count > 0 && (() => {
                                const def = SURFACE_DEFAULTS[key];
                                const s = surfaces.find(sf => sf.surfaceName === def.dbName || (def.altName && sf.surfaceName === def.altName));
                                const baseRate = s?.productionRateUnitsPerLaborHour || def.fallbackRate;
                                const coats = getCoats(room, key);
                                const doorW = room.doorWidthFt || 3;
                                const doorH = room.doorHeightFt || 7;
                                const wW = settings?.defaultWindowWidthFt || 3;
                                const wH = settings?.defaultWindowHeightFt || 4;
                                let laborQty = count;
                                if (key === "doorCasing") laborQty = count * (2 * doorH + doorW);
                                else if (key === "windowCasing") laborQty = count * (2 * wH + wW);
                                const coatRatesArr = s?.coatRates as { rate: number }[] | null;
                                let topCoatHrs = 0;
                                for (let c = 0; c < coats; c++) {
                                  const r = coatRatesArr && c < coatRatesArr.length ? coatRatesArr[c].rate : (coatRatesArr?.[0]?.rate || baseRate);
                                  topCoatHrs += laborQty / (r || 1);
                                }
                                const ps = getPrimerState(room, key);
                                let primerHrs = 0;
                                if (ps.enabled && ps.coats > 0) {
                                  const primerRatesArr = s?.primerRates as { rate: number }[] | null;
                                  const pFallback = primerRatesArr?.[0]?.rate || baseRate;
                                  for (let c = 0; c < ps.coats; c++) {
                                    const r = primerRatesArr && c < primerRatesArr.length ? primerRatesArr[c].rate : pFallback;
                                    primerHrs += laborQty / (r || 1);
                                  }
                                }
                                const complexityHrs = room.complexityOverride?.[key] || 0;
                                const repairHrs = room.repairOverride?.[key]?.hours || 0;
                                const totalHrs = Math.max(0, topCoatHrs + complexityHrs) + primerHrs + repairHrs;
                                const totalCost = totalHrs * effectiveSellRate;
                                const perUnit = count > 0 ? totalCost / count : 0;
                                return (
                                  <div className="mt-1.5 px-1 flex items-center justify-between text-[12px] text-muted-foreground" data-testid={`surface-inline-cost-${key}-${roomIndex}`}>
                                    <span>{count} × ${perUnit.toFixed(2)}/ea</span>
                                    <span className="font-semibold text-foreground tabular-nums">${totalCost.toFixed(2)}</span>
                                  </div>
                                );
                              })()}
                              {key === "doors" && isSurfaceExpanded(roomIndex, key) && (
                                <div className="flex items-center gap-2 mt-2.5">
                                  <div className="flex-1">
                                    <label className="text-xs text-muted-foreground">Door Height (ft)</label>
                                    <NumericInput
                                      value={room.doorHeightFt || ""}
                                      onChange={(v) => updateRoom(roomIndex, { doorHeightFt: v })}
                                      placeholder="7"
                                      className="text-sm text-center"
                                      testId={`input-door-height-${roomIndex}`}
                                    />
                                  </div>
                                  <span className="text-xs text-muted-foreground mt-4">x</span>
                                  <div className="flex-1">
                                    <label className="text-xs text-muted-foreground">Door Width (ft)</label>
                                    <NumericInput
                                      value={room.doorWidthFt || ""}
                                      onChange={(v) => updateRoom(roomIndex, { doorWidthFt: v })}
                                      placeholder="3"
                                      className="text-sm text-center"
                                      testId={`input-door-width-${roomIndex}`}
                                    />
                                  </div>
                                  <div className="flex-1 text-center mt-4">
                                    <span className="text-[11px] text-muted-foreground">
                                      = {((room.doorHeightFt || 7) * (room.doorWidthFt || 3)).toFixed(0)} sqft/door
                                    </span>
                                  </div>
                                </div>
                              )}
                              {isSurfaceExpanded(roomIndex, key) && (() => {
                                const paintOn = getPaintEnabled(room, key);
                                const isMasterExcl = customerProvidingMaterials;
                                const surfaceExcluded = isMasterExcl || !!(room as any).excludeMaterialCost?.[key];
                                return (
                                  <div data-testid={`paint-section-${key}-${roomIndex}`}>
                                    <div className="flex items-center justify-between gap-2 mt-2 pb-2 border-b border-border/30">
                                      <label className="flex items-center gap-2 cursor-pointer">
                                        <Switch
                                          checked={surfaceExcluded}
                                          disabled={isMasterExcl}
                                          onCheckedChange={(checked) => updateExcludeMaterial(roomIndex, key, checked)}
                                          className="scale-[0.6] origin-left shrink-0"
                                          data-testid={`switch-exclude-material-${key}-${roomIndex}`}
                                        />
                                        <span className={cn("text-xs", surfaceExcluded ? "font-semibold text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>Don't include material cost</span>
                                      </label>
                                      {isMasterExcl && <span className="text-[10px] text-muted-foreground italic">Set on section</span>}
                                    </div>
                                    <div className="flex items-center justify-between gap-2 mt-2">
                                      <label className="flex items-center gap-2 cursor-pointer">
                                        <Switch
                                          checked={paintOn}
                                          onCheckedChange={(checked) => updatePaintOverride(roomIndex, key, checked)}
                                          className="scale-[0.6] origin-left shrink-0"
                                          data-testid={`switch-paint-${key}-${roomIndex}`}
                                        />
                                        <span className={cn("text-xs", paintOn ? "font-semibold text-foreground" : "text-muted-foreground")}>Default Material</span>
                                      </label>
                                    </div>
                                    {paintOn && (
                                      <MaterialPickerRow
                                        effectiveMatId={effectiveMatId}
                                        effectiveMat={effectiveMat}
                                        isOverridden={isOverridden}
                                        surfaceKey={key}
                                        roomIndex={roomIndex}
                                        paintPrimerMaterials={paintPrimerMaterials}
                                        allMaterials={allMaterials}
                                        onSelect={(matId) => updateMaterialOverride(roomIndex, key, matId)}
                                      />
                                    )}
                                  </div>
                                );
                              })()}
                              {isSurfaceExpanded(roomIndex, key) && canUsePrimer(key) && (() => {
                                const ps = getPrimerState(room, key);
                                return (
                                  <div className="mt-2 pt-2 border-t border-border/30" data-testid={`primer-section-${key}-${roomIndex}`}>
                                    <div className="flex items-center justify-between gap-2">
                                      <label className="flex items-center gap-2 cursor-pointer">
                                        <Switch
                                          checked={ps.enabled}
                                          onCheckedChange={(checked) => updatePrimerOverride(roomIndex, key, { enabled: checked })}
                                          className="scale-[0.6] origin-left shrink-0"
                                        />
                                        <span className={cn("text-xs", ps.enabled ? "font-semibold text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>Primer</span>
                                      </label>
                                      {ps.enabled && (
                                        <MiniStepper
                                          value={ps.coats}
                                          onChange={(v) => updatePrimerOverride(roomIndex, key, { coats: Math.max(1, v) })}
                                          min={1}
                                          max={3}
                                          testId={`primer-coats-${key}-${roomIndex}`}
                                        />
                                      )}
                                    </div>
                                    {ps.enabled && (
                                      <MaterialPickerRow
                                        effectiveMatId={ps.materialId || null}
                                        effectiveMat={ps.materialId ? allMaterials.find(m => m.id === ps.materialId) : null}
                                        isOverridden={!!ps.materialId}
                                        surfaceKey={`primer-${key}`}
                                        roomIndex={roomIndex}
                                        paintPrimerMaterials={primerMaterials}
                                        allMaterials={allMaterials}
                                        onSelect={(matId) => updatePrimerOverride(roomIndex, key, { materialId: matId })}
                                        icon={Droplets}
                                        emptyLabel="Select primer"
                                      />
                                    )}
                                  </div>
                                );
                              })()}
                              {isSurfaceExpanded(roomIndex, key) && (() => {
                                const def = SURFACE_DEFAULTS[key];
                                const surf = surfacesData ? (findSurface(surfacesData, def.dbName) || (def.altName ? findSurface(surfacesData, def.altName) : undefined)) : undefined;
                                const defaultDesc = surf?.areaDescription || '';
                                const overrideDesc = room.surfaceDescriptionOverride?.[key];
                                const currentDesc = overrideDesc !== undefined ? overrideDesc : defaultDesc;
                                return (
                                  <div className="mt-2 pt-2 border-t border-border/30">
                                    <label className="text-[10px] text-muted-foreground">Item Description</label>
                                    <Textarea
                                      value={currentDesc}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setRooms(prev => prev.map((r, i) => {
                                          if (i !== roomIndex) return r;
                                          return { ...r, surfaceDescriptionOverride: { ...r.surfaceDescriptionOverride, [key]: val } };
                                        }));
                                        const el = e.target;
                                        el.style.height = 'auto';
                                        el.style.height = Math.min(el.scrollHeight, 200) + 'px';
                                      }}
                                      onFocus={(e) => {
                                        const el = e.target;
                                        el.style.height = 'auto';
                                        el.style.height = Math.min(el.scrollHeight, 200) + 'px';
                                      }}
                                      placeholder="Describe the work for this item..."
                                      className="text-xs resize-y min-h-[36px] max-h-[200px] overflow-y-auto mt-0.5"
                                      rows={1}
                                      data-testid={`item-description-${key}-${roomIndex}`}
                                    />
                                  </div>
                                );
                              })()}
                              {isSurfaceExpanded(roomIndex, key) && <ComplexityPicker
                                value={room.complexityOverride?.[key] || 0}
                                onChange={(v) => {
                                  setRooms(prev => prev.map((r, i) => {
                                    if (i !== roomIndex) return r;
                                    return { ...r, complexityOverride: { ...(r.complexityOverride || {}), [key]: v } };
                                  }));
                                }}
                                surfaceKey={key}
                                roomIndex={roomIndex}
                              />}
                              {isSurfaceExpanded(roomIndex, key) && <RepairPicker
                                hours={room.repairOverride?.[key]?.hours || 0}
                                description={room.repairOverride?.[key]?.description}
                                onHoursChange={(h) => {
                                  setRooms(prev => prev.map((r, i) => {
                                    if (i !== roomIndex) return r;
                                    const prev_repair = r.repairOverride?.[key];
                                    return { ...r, repairOverride: { ...(r.repairOverride || {}), [key]: { hours: h, description: prev_repair?.description } } };
                                  }));
                                }}
                                onDescriptionChange={(desc) => {
                                  setRooms(prev => prev.map((r, i) => {
                                    if (i !== roomIndex) return r;
                                    const prev_repair = r.repairOverride?.[key];
                                    return { ...r, repairOverride: { ...(r.repairOverride || {}), [key]: { hours: prev_repair?.hours || 0, description: desc } } };
                                  }));
                                }}
                                surfaceKey={key}
                                roomIndex={roomIndex}
                              />}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                )}

                {EXTRA_SURFACES.some(({ key }) => activeInteriorKeys.has(key) && isSurfaceAllowedForType(key, room.sectionType || 'room')) && (
                <div className="space-y-1.5 rounded-lg border-2 border-border/60 bg-card dark:bg-card px-2.5 py-2">
                  <span className="text-sm font-bold text-foreground uppercase tracking-wide">Specialty</span>
                  <div className="space-y-2">
                    {EXTRA_SURFACES.filter(({ key }) => activeInteriorKeys.has(key) && isSurfaceAllowedForType(key, room.sectionType || 'room')).map(({ key, label, qtyKey, unit, placeholder }) => {
                      const enabled = room[key] as boolean;
                      const qty = (room as any)[qtyKey] as number || 0;
                      const effectiveMatId = enabled ? getEffectiveMaterialId(room, key) : null;
                      const effectiveMat = effectiveMatId ? allMaterials.find(m => m.id === effectiveMatId) : null;
                      const isOverridden = room.materialOverride[key] !== undefined;
                      return (
                        <div
                          key={key}
                          className={cn(
                            "rounded-lg border-2 px-3 py-2 transition-colors",
                            enabled ? "border-primary/25 bg-primary/[0.03] dark:bg-primary/[0.06] shadow-sm" : "border-border/40 bg-muted/30"
                          )}
                          data-testid={`surface-card-${key}-${roomIndex}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <label className="flex items-center gap-2.5 cursor-pointer">
                              <Switch
                                checked={enabled}
                                onCheckedChange={(checked) => updateRoom(roomIndex, { [key]: checked })}
                                className="scale-75 origin-left shrink-0"
                              />
                              <span className={cn("text-sm", enabled ? "font-semibold" : "text-muted-foreground")}>{label}</span>
                            </label>
                            {enabled && (
                              <button
                                type="button"
                                onClick={() => toggleSurfaceExpand(roomIndex, key)}
                                className="p-1 rounded hover:bg-muted/60 text-muted-foreground"
                                data-testid={`btn-expand-${key}-${roomIndex}`}
                              >
                                {isSurfaceExpanded(roomIndex, key) ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </button>
                            )}
                          </div>
                          {enabled && (
                            <>
                              <div className="flex items-center gap-2.5 mt-2.5">
                                <div className="flex-1 rounded-lg border-2 border-border/50 bg-background p-2">
                                  <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">{unit === 'lf' ? 'Linear Feet' : 'Sq Ft'}</span>
                                  <NumericInput
                                    value={qty || ""}
                                    onChange={(v) => updateRoom(roomIndex, { [qtyKey]: v })}
                                    placeholder={placeholder}
                                    className="text-sm text-center mt-1"
                                    testId={`input-${key}-qty-${roomIndex}`}
                                  />
                                </div>
                                <div className="flex-1 rounded-lg border-2 border-border/50 bg-background p-2">
                                  <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">{pluralizeLabel(getCoatsLabel(key, surfaces), 2)}</span>
                                  <div className="flex items-center justify-center mt-1">
                                    <MiniStepper
                                      value={getCoats(room, key)}
                                      onChange={(v) => updateCoats(roomIndex, key, v)}
                                      min={1}
                                      max={5}
                                      testId={`coats-${key}-${roomIndex}`}
                                      disabled={!getPaintEnabled(room, key)}
                                    />
                                  </div>
                                </div>
                              </div>
                              {isSurfaceExpanded(roomIndex, key) && (() => {
                                const paintOn = getPaintEnabled(room, key);
                                const isMasterExcl = customerProvidingMaterials;
                                const surfaceExcluded = isMasterExcl || !!(room as any).excludeMaterialCost?.[key];
                                return (
                                  <div data-testid={`paint-section-${key}-${roomIndex}`}>
                                    <div className="flex items-center justify-between gap-2 mt-2 pb-2 border-b border-border/30">
                                      <label className="flex items-center gap-2 cursor-pointer">
                                        <Switch
                                          checked={surfaceExcluded}
                                          disabled={isMasterExcl}
                                          onCheckedChange={(checked) => updateExcludeMaterial(roomIndex, key, checked)}
                                          className="scale-[0.6] origin-left shrink-0"
                                          data-testid={`switch-exclude-material-${key}-${roomIndex}`}
                                        />
                                        <span className={cn("text-xs", surfaceExcluded ? "font-semibold text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>Don't include material cost</span>
                                      </label>
                                      {isMasterExcl && <span className="text-[10px] text-muted-foreground italic">Set on section</span>}
                                    </div>
                                    <div className="flex items-center justify-between gap-2 mt-2">
                                      <label className="flex items-center gap-2 cursor-pointer">
                                        <Switch
                                          checked={paintOn}
                                          onCheckedChange={(checked) => updatePaintOverride(roomIndex, key, checked)}
                                          className="scale-[0.6] origin-left shrink-0"
                                          data-testid={`switch-paint-${key}-${roomIndex}`}
                                        />
                                        <span className={cn("text-xs", paintOn ? "font-semibold text-foreground" : "text-muted-foreground")}>Default Material</span>
                                      </label>
                                    </div>
                                    {paintOn && (
                                      <MaterialPickerRow
                                        effectiveMatId={effectiveMatId}
                                        effectiveMat={effectiveMat}
                                        isOverridden={isOverridden}
                                        surfaceKey={key}
                                        roomIndex={roomIndex}
                                        paintPrimerMaterials={paintPrimerMaterials}
                                        allMaterials={allMaterials}
                                        onSelect={(matId) => updateMaterialOverride(roomIndex, key, matId)}
                                      />
                                    )}
                                  </div>
                                );
                              })()}
                              {isSurfaceExpanded(roomIndex, key) && canUsePrimer(key) && (() => {
                                const ps = getPrimerState(room, key);
                                return (
                                  <div className="mt-2 pt-2 border-t border-border/30" data-testid={`primer-section-${key}-${roomIndex}`}>
                                    <div className="flex items-center justify-between gap-2">
                                      <label className="flex items-center gap-2 cursor-pointer">
                                        <Switch
                                          checked={ps.enabled}
                                          onCheckedChange={(checked) => updatePrimerOverride(roomIndex, key, { enabled: checked })}
                                          className="scale-[0.6] origin-left shrink-0"
                                        />
                                        <span className={cn("text-xs", ps.enabled ? "font-semibold text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>Primer</span>
                                      </label>
                                      {ps.enabled && (
                                        <MiniStepper
                                          value={ps.coats}
                                          onChange={(v) => updatePrimerOverride(roomIndex, key, { coats: Math.max(1, v) })}
                                          min={1}
                                          max={3}
                                          testId={`primer-coats-${key}-${roomIndex}`}
                                        />
                                      )}
                                    </div>
                                    {ps.enabled && (
                                      <MaterialPickerRow
                                        effectiveMatId={ps.materialId || null}
                                        effectiveMat={ps.materialId ? allMaterials.find(m => m.id === ps.materialId) : null}
                                        isOverridden={!!ps.materialId}
                                        surfaceKey={`primer-${key}`}
                                        roomIndex={roomIndex}
                                        paintPrimerMaterials={primerMaterials}
                                        allMaterials={allMaterials}
                                        onSelect={(matId) => updatePrimerOverride(roomIndex, key, { materialId: matId })}
                                        icon={Droplets}
                                        emptyLabel="Select primer"
                                      />
                                    )}
                                  </div>
                                );
                              })()}
                              {isSurfaceExpanded(roomIndex, key) && <ComplexityPicker
                                value={room.complexityOverride?.[key] || 0}
                                onChange={(v) => {
                                  setRooms(prev => prev.map((r, i) => {
                                    if (i !== roomIndex) return r;
                                    return { ...r, complexityOverride: { ...(r.complexityOverride || {}), [key]: v } };
                                  }));
                                }}
                                surfaceKey={key}
                                roomIndex={roomIndex}
                              />}
                              {isSurfaceExpanded(roomIndex, key) && <RepairPicker
                                hours={room.repairOverride?.[key]?.hours || 0}
                                description={room.repairOverride?.[key]?.description}
                                onHoursChange={(h) => {
                                  setRooms(prev => prev.map((r, i) => {
                                    if (i !== roomIndex) return r;
                                    const prev_repair = r.repairOverride?.[key];
                                    return { ...r, repairOverride: { ...(r.repairOverride || {}), [key]: { hours: h, description: prev_repair?.description } } };
                                  }));
                                }}
                                onDescriptionChange={(desc) => {
                                  setRooms(prev => prev.map((r, i) => {
                                    if (i !== roomIndex) return r;
                                    const prev_repair = r.repairOverride?.[key];
                                    return { ...r, repairOverride: { ...(r.repairOverride || {}), [key]: { hours: prev_repair?.hours || 0, description: desc } } };
                                  }));
                                }}
                                surfaceKey={key}
                                roomIndex={roomIndex}
                              />}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                )}

                {dynamicSurfaceDefs.length > 0 && (
                <div className="space-y-1.5 rounded-lg border-2 border-border/60 bg-card dark:bg-card px-2.5 py-2">
                  <span className="text-sm font-bold text-foreground uppercase tracking-wide">Additional Surfaces</span>
                  <div className="space-y-2">
                    {dynamicSurfaceDefs.map(({ surfaceKey: dynKey, surfaceName, unit: dynUnit, coats: defaultCoats, surface: dynSurf }) => {
                      const dynState = room.dynamicSurfaces[dynKey] || { enabled: false, qty: 0 };
                      const enabled = dynState.enabled;
                      const effectiveMatId = enabled ? getEffectiveMaterialId(room, dynKey) : null;
                      const effectiveMat = effectiveMatId ? allMaterials.find(m => m.id === effectiveMatId) : null;
                      const isOverridden = room.materialOverride[dynKey] !== undefined;
                      return (
                        <div
                          key={dynKey}
                          className={cn(
                            "rounded-lg border-2 px-3 py-2 transition-colors",
                            enabled ? "border-primary/25 bg-primary/[0.03] dark:bg-primary/[0.06] shadow-sm" : "border-border/40 bg-muted/30"
                          )}
                          data-testid={`surface-card-${dynKey}-${roomIndex}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <label className="flex items-center gap-2.5 cursor-pointer">
                              <Switch
                                checked={enabled}
                                onCheckedChange={(checked) => {
                                  if (!checked) {
                                    const existing = room.dynamicSurfaces[dynKey];
                                    if (existing && existing.enabled && (existing.qty > 0 || existing.manual)) {
                                      setSurfaceToRemove({ roomIndex, key: dynKey, isDynamic: true, surfaceName });
                                      return;
                                    }
                                  }
                                  setRooms(prev => prev.map((r, i) => {
                                    if (i !== roomIndex) return r;
                                    const existing = r.dynamicSurfaces[dynKey] || { enabled: false, qty: 0 };
                                    let newQty = existing.qty;
                                    if (checked && !existing.manual) {
                                      const auto = autoCalcDynamicQty(r, dynUnit);
                                      newQty = auto > 0 ? auto : (existing.qty || 1);
                                    } else if (checked && !existing.qty) {
                                      newQty = 1;
                                    }
                                    return { ...r, dynamicSurfaces: { ...r.dynamicSurfaces, [dynKey]: { ...existing, enabled: checked, qty: newQty } } };
                                  }));
                                }}
                                className="scale-75 origin-left shrink-0"
                              />
                              <span className={cn("text-sm", enabled ? "font-semibold" : "text-muted-foreground")}>{surfaceName}</span>
                            </label>
                            {enabled && (
                              <button
                                type="button"
                                onClick={() => toggleSurfaceExpand(roomIndex, dynKey)}
                                className="p-1 rounded hover:bg-muted/60 text-muted-foreground"
                                data-testid={`btn-expand-${dynKey}-${roomIndex}`}
                              >
                                {isSurfaceExpanded(roomIndex, dynKey) ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </button>
                            )}
                          </div>
                          {enabled && (() => {
                            const autoQty = dynUnit === 'each' ? 0 : autoCalcDynamicQty(room, dynUnit);
                            const isOverride = !!dynState.manual && autoQty > 0 && dynState.qty !== autoQty;
                            const revertToAuto = () => {
                              setRooms(prev => prev.map((r, i) => {
                                if (i !== roomIndex) return r;
                                const auto = autoCalcDynamicQty(r, dynUnit);
                                return { ...r, dynamicSurfaces: { ...r.dynamicSurfaces, [dynKey]: { ...dynState, qty: auto, manual: false } } };
                              }));
                            };
                            return (
                            <>
                              <div className="flex items-center gap-2.5 mt-2.5">
                                <div className="flex-1 rounded-lg border-2 border-border/50 bg-background p-2">
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
                                      {dynUnit === 'lf' ? 'Linear Feet' : dynUnit === 'each' ? 'Count' : 'Sq Ft'}
                                    </span>
                                    {dynUnit !== 'each' && autoQty > 0 && (
                                      <button
                                        type="button"
                                        onClick={() => setOverrideEditor({
                                          roomIndex,
                                          dynKey,
                                          surfaceName,
                                          unit: dynUnit,
                                          autoQty,
                                          tempValue: String(dynState.qty || autoQty),
                                        })}
                                        className={cn(
                                          "flex items-center gap-1 text-[10px] font-medium rounded-full border px-2 py-0.5 transition-colors",
                                          isOverride
                                            ? "border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-950/50"
                                            : "border-border text-muted-foreground hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400"
                                        )}
                                        data-testid={`btn-override-${dynKey}-${roomIndex}`}
                                      >
                                        <span>{isOverride ? 'Overrided' : 'Override'}</span>
                                      </button>
                                    )}
                                  </div>
                                  {dynUnit === 'each' ? (
                                    <div className="flex items-center justify-center mt-1">
                                      <EditableStepper
                                        value={dynState.qty || 0}
                                        onChange={(v) => {
                                          setRooms(prev => prev.map((r, i) => {
                                            if (i !== roomIndex) return r;
                                            return { ...r, dynamicSurfaces: { ...r.dynamicSurfaces, [dynKey]: { ...dynState, qty: v || 0, manual: true } } };
                                          }));
                                        }}
                                        testId={`input-${dynKey}-qty-${roomIndex}`}
                                      />
                                    </div>
                                  ) : (
                                    <div
                                      className={cn(
                                        "text-sm text-center mt-1 py-1.5 rounded border-2 select-none",
                                        isOverride
                                          ? "border-amber-400 dark:border-amber-600 bg-amber-50/40 dark:bg-amber-900/10 font-semibold"
                                          : "border-border/50 bg-muted/30 text-muted-foreground"
                                      )}
                                      data-testid={`display-${dynKey}-qty-${roomIndex}`}
                                    >
                                      {dynState.qty || autoQty || 0}
                                    </div>
                                  )}
                                </div>
                                <div className="flex-1 rounded-lg border-2 border-border/50 bg-background p-2">
                                  <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">{pluralizeLabel(dynSurf ? getCoatsLabelForDynamic(dynSurf) : "coat", 2)}</span>
                                  <div className="flex items-center justify-center mt-1">
                                    <MiniStepper
                                      value={(room.coatsOverride as Record<string, number>)?.[dynKey] ?? defaultCoats}
                                      onChange={(v) => {
                                        setRooms(prev => prev.map((r, i) => {
                                          if (i !== roomIndex) return r;
                                          return { ...r, coatsOverride: { ...(r.coatsOverride || {}), [dynKey]: v } as any };
                                        }));
                                      }}
                                      min={1}
                                      max={5}
                                      testId={`coats-${dynKey}-${roomIndex}`}
                                      disabled={!getPaintEnabled(room, dynKey)}
                                    />
                                  </div>
                                </div>
                              </div>
                              {dynState.qty > 0 && (() => {
                                const dynSurf = findSurfaceByKey(surfaces, dynKey);
                                const surfPricingMode = (dynSurf as any)?.pricingMode || 'production_rate';
                                const surfPricePerUnit = (dynSurf as any)?.pricePerUnit;
                                const isPerUnit = surfPricingMode === 'per_unit' && surfPricePerUnit != null;
                                if (!isPerUnit && dynUnit !== 'each') return null;
                                const coats = (room.coatsOverride as Record<string, number>)?.[dynKey] ?? defaultCoats;
                                const baseRate = dynSurf?.productionRateUnitsPerLaborHour || 100;
                                const coatRatesArr = dynSurf?.coatRates as { rate: number }[] | null;
                                let topCoatHrs = 0;
                                for (let c = 0; c < coats; c++) {
                                  const r = coatRatesArr && c < coatRatesArr.length ? coatRatesArr[c].rate : (coatRatesArr?.[0]?.rate || baseRate);
                                  topCoatHrs += dynState.qty / (r || 1);
                                }
                                const ps = getPrimerState(room, dynKey);
                                let primerHrs = 0;
                                if (ps.enabled && ps.coats > 0) {
                                  const primerRatesArr = dynSurf?.primerRates as { rate: number }[] | null;
                                  const pFallback = primerRatesArr?.[0]?.rate || baseRate;
                                  for (let c = 0; c < ps.coats; c++) {
                                    const r = primerRatesArr && c < primerRatesArr.length ? primerRatesArr[c].rate : pFallback;
                                    primerHrs += dynState.qty / (r || 1);
                                  }
                                }
                                const complexityHrs = room.complexityOverride?.[dynKey] || 0;
                                const repairHrs = room.repairOverride?.[dynKey]?.hours || 0;
                                const totalHrs = Math.max(0, topCoatHrs + complexityHrs) + primerHrs + repairHrs;
                                const rateBasedCost = totalHrs * effectiveSellRate;
                                const calcCost = isPerUnit ? surfPricePerUnit * dynState.qty : rateBasedCost;
                                const calcPerUnit = dynState.qty > 0 ? calcCost / dynState.qty : 0;
                                const overridePerUnit = room.surfacePriceOverride?.[dynKey];
                                const hasOverride = overridePerUnit != null;
                                const displayPerUnit = hasOverride ? overridePerUnit : calcPerUnit;
                                const displayTotal = hasOverride ? overridePerUnit * dynState.qty : calcCost;
                                const unitLabel = dynUnit === 'each' ? 'ea' : dynUnit === 'lf' ? 'lf' : 'sqft';
                                return (
                                  <button
                                    type="button"
                                    className="mt-1.5 px-1 w-full flex items-center justify-between text-[12px] text-muted-foreground hover:bg-muted/50 rounded transition-colors -mx-0.5 py-0.5"
                                    onClick={() => {
                                      setSurfacePriceOverrideDialog({
                                        roomIndex,
                                        surfaceKey: dynKey,
                                        surfaceName: dynSurf?.surfaceName || dynKey,
                                        calcPerUnit,
                                        currentOverride: overridePerUnit ?? null,
                                      });
                                      setSurfacePriceOverrideValue(hasOverride ? String(overridePerUnit) : '');
                                    }}
                                    data-testid={`surface-inline-cost-${dynKey}-${roomIndex}`}
                                  >
                                    <span className="flex items-center gap-1">
                                      {dynState.qty} ×{' '}
                                      {hasOverride ? (
                                        <>
                                          <span className="line-through opacity-50">${calcPerUnit.toFixed(2)}</span>
                                          <span className="text-blue-600 dark:text-blue-400 font-semibold">${displayPerUnit.toFixed(2)}/{unitLabel}</span>
                                        </>
                                      ) : (
                                        <span>${displayPerUnit.toFixed(2)}/{unitLabel}</span>
                                      )}
                                    </span>
                                    <span className={cn("font-semibold tabular-nums", hasOverride ? "text-blue-600 dark:text-blue-400" : "text-foreground")}>
                                      ${displayTotal.toFixed(2)}
                                      {hasOverride && <span className="ml-1 text-[10px] font-normal opacity-70">Override</span>}
                                    </span>
                                  </button>
                                );
                              })()}
                              {isSurfaceExpanded(roomIndex, dynKey) && (() => {
                                const paintOn = getPaintEnabled(room, dynKey);
                                const isMasterExcl = customerProvidingMaterials;
                                const surfaceExcluded = isMasterExcl || !!(room as any).excludeMaterialCost?.[dynKey];
                                return (
                                  <div data-testid={`paint-section-${dynKey}-${roomIndex}`}>
                                    <div className="flex items-center justify-between gap-2 mt-2 pb-2 border-b border-border/30">
                                      <label className="flex items-center gap-2 cursor-pointer">
                                        <Switch
                                          checked={surfaceExcluded}
                                          disabled={isMasterExcl}
                                          onCheckedChange={(checked) => updateExcludeMaterial(roomIndex, dynKey, checked)}
                                          className="scale-[0.6] origin-left shrink-0"
                                          data-testid={`switch-exclude-material-${dynKey}-${roomIndex}`}
                                        />
                                        <span className={cn("text-xs", surfaceExcluded ? "font-semibold text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>Don't include material cost</span>
                                      </label>
                                      {isMasterExcl && <span className="text-[10px] text-muted-foreground italic">Set on section</span>}
                                    </div>
                                    <div className="flex items-center justify-between gap-2 mt-2">
                                      <label className="flex items-center gap-2 cursor-pointer">
                                        <Switch
                                          checked={paintOn}
                                          onCheckedChange={(checked) => updatePaintOverride(roomIndex, dynKey, checked)}
                                          className="scale-[0.6] origin-left shrink-0"
                                          data-testid={`switch-paint-${dynKey}-${roomIndex}`}
                                        />
                                        <span className={cn("text-xs", paintOn ? "font-semibold text-foreground" : "text-muted-foreground")}>Default Material</span>
                                      </label>
                                    </div>
                                    {paintOn && (
                                      <MaterialPickerRow
                                        effectiveMatId={effectiveMatId}
                                        effectiveMat={effectiveMat}
                                        isOverridden={isOverridden}
                                        surfaceKey={dynKey}
                                        roomIndex={roomIndex}
                                        paintPrimerMaterials={paintPrimerMaterials}
                                        allMaterials={allMaterials}
                                        onSelect={(matId) => updateMaterialOverride(roomIndex, dynKey, matId)}
                                      />
                                    )}
                                  </div>
                                );
                              })()}
                              {isSurfaceExpanded(roomIndex, dynKey) && (() => {
                                const ss = getSubstrateState(room, dynKey);
                                return (
                                  <div className="mt-2 pt-2 border-t border-border/30" data-testid={`substrate-section-${dynKey}-${roomIndex}`}>
                                    <div className="flex items-center justify-between gap-2">
                                      <label className="flex items-center gap-2 cursor-pointer">
                                        <Switch
                                          checked={ss.enabled}
                                          onCheckedChange={(checked) => updateSubstrateOverride(roomIndex, dynKey, { enabled: checked })}
                                          className="scale-[0.6] origin-left shrink-0"
                                        />
                                        <span className={cn("text-xs", ss.enabled ? "font-semibold text-blue-700 dark:text-blue-400" : "text-muted-foreground")}>Substrate</span>
                                      </label>
                                    </div>
                                    {ss.enabled && (
                                      <SubstratePickerRow
                                        value={ss.value}
                                        surfaceKey={dynKey}
                                        roomIndex={roomIndex}
                                        onSelect={(v) => updateSubstrateOverride(roomIndex, dynKey, { value: v })}
                                      />
                                    )}
                                  </div>
                                );
                              })()}
                              {isSurfaceExpanded(roomIndex, dynKey) && canUsePrimer(dynKey) && (() => {
                                const ps = getPrimerState(room, dynKey);
                                return (
                                  <div className="mt-2 pt-2 border-t border-border/30" data-testid={`primer-section-${dynKey}-${roomIndex}`}>
                                    {(() => {
                                      const isMasterExclP = customerProvidingMaterials;
                                      const primerExcluded = isMasterExclP || !!(room as any).excludePrimerCost?.[dynKey];
                                      return (
                                        <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-border/30">
                                          <label className="flex items-center gap-2 cursor-pointer">
                                            <Switch
                                              checked={primerExcluded}
                                              disabled={isMasterExclP}
                                              onCheckedChange={(checked) => updateExcludePrimer(roomIndex, dynKey, checked)}
                                              className="scale-[0.6] origin-left shrink-0"
                                              data-testid={`switch-exclude-primer-${dynKey}-${roomIndex}`}
                                            />
                                            <span className={cn("text-xs", primerExcluded ? "font-semibold text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>Don't include primer cost</span>
                                          </label>
                                          {isMasterExclP && <span className="text-[10px] text-muted-foreground italic">Set on section</span>}
                                        </div>
                                      );
                                    })()}
                                    <div className="flex items-center justify-between gap-2">
                                      <label className="flex items-center gap-2 cursor-pointer">
                                        <Switch
                                          checked={ps.enabled}
                                          onCheckedChange={(checked) => updatePrimerOverride(roomIndex, dynKey, { enabled: checked })}
                                          className="scale-[0.6] origin-left shrink-0"
                                        />
                                        <span className={cn("text-xs", ps.enabled ? "font-semibold text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>Primer</span>
                                      </label>
                                      {ps.enabled && (
                                        <MiniStepper
                                          value={ps.coats}
                                          onChange={(v) => updatePrimerOverride(roomIndex, dynKey, { coats: Math.max(1, v) })}
                                          min={1}
                                          max={3}
                                          testId={`primer-coats-${dynKey}-${roomIndex}`}
                                        />
                                      )}
                                    </div>
                                    {ps.enabled && (
                                      <MaterialPickerRow
                                        effectiveMatId={ps.materialId || null}
                                        effectiveMat={ps.materialId ? allMaterials.find(m => m.id === ps.materialId) : null}
                                        isOverridden={!!ps.materialId}
                                        surfaceKey={`primer-${dynKey}`}
                                        roomIndex={roomIndex}
                                        paintPrimerMaterials={primerMaterials}
                                        allMaterials={allMaterials}
                                        onSelect={(matId) => updatePrimerOverride(roomIndex, dynKey, { materialId: matId })}
                                        icon={Droplets}
                                        emptyLabel="Select primer"
                                      />
                                    )}
                                  </div>
                                );
                              })()}
                              {isSurfaceExpanded(roomIndex, dynKey) && <ComplexityPicker
                                value={room.complexityOverride?.[dynKey] || 0}
                                onChange={(v) => {
                                  setRooms(prev => prev.map((r, i) => {
                                    if (i !== roomIndex) return r;
                                    return { ...r, complexityOverride: { ...(r.complexityOverride || {}), [dynKey]: v } };
                                  }));
                                }}
                                surfaceKey={dynKey}
                                roomIndex={roomIndex}
                              />}
                              {isSurfaceExpanded(roomIndex, dynKey) && <RepairPicker
                                hours={room.repairOverride?.[dynKey]?.hours || 0}
                                description={room.repairOverride?.[dynKey]?.description}
                                onHoursChange={(h) => {
                                  setRooms(prev => prev.map((r, i) => {
                                    if (i !== roomIndex) return r;
                                    const prev_repair = r.repairOverride?.[dynKey];
                                    return { ...r, repairOverride: { ...(r.repairOverride || {}), [dynKey]: { hours: h, description: prev_repair?.description } } };
                                  }));
                                }}
                                onDescriptionChange={(desc) => {
                                  setRooms(prev => prev.map((r, i) => {
                                    if (i !== roomIndex) return r;
                                    const prev_repair = r.repairOverride?.[dynKey];
                                    return { ...r, repairOverride: { ...(r.repairOverride || {}), [dynKey]: { hours: prev_repair?.hours || 0, description: desc } } };
                                  }));
                                }}
                                surfaceKey={dynKey}
                                roomIndex={roomIndex}
                              />}
                            </>
                            );
                          })()}
                        </div>
                      );
                    })}
                  </div>
                </div>
                )}

                {result && result.surfaces.length > 0 && (
                  <div className="border-t pt-2 space-y-0.5">
                    {result.surfaces.map((s, si) => {
                      const cHrs = room.complexityOverride?.[s.surfaceKey] || 0;
                      const rHrs = s.repairHours || 0;
                      const rPrice = s.repairPrice || 0;
                      return (
                        <div key={si} className="flex items-center justify-between text-[13px] py-0.5" data-testid={`surface-calc-${roomIndex}-${si}`}>
                          <span className="text-muted-foreground mr-2">
                            {s.surfaceName} ({s.quantity} {s.unit} x {s.coats} {pluralizeLabel((s as any).coatsLabel || "coat", s.coats)})
                            {cHrs !== 0 && <span className={`ml-1 text-[11px] ${cHrs > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{cHrs > 0 ? `+${cHrs}` : cHrs}h complexity</span>}
                            {rHrs > 0 && <span className="text-orange-600 dark:text-orange-400 ml-1 text-[11px]">🔧 Repair ${rPrice.toFixed(0)}</span>}
                          </span>
                          <span className="tabular-nums shrink-0">{s.laborHours.toFixed(1)} hrs — ${s.price.toFixed(0)}</span>
                        </div>
                      );
                    })}
                    <div className="flex items-center justify-between text-sm font-semibold border-t pt-1.5 mt-1">
                      <span>Area Total</span>
                      <span className="tabular-nums">{result.totalLaborHours.toFixed(1)} hrs — ${result.totalPrice.toFixed(0)}</span>
                    </div>
                  </div>
                )}

                {(() => {
                  const groupedNotesMap = new Map<number, { surfaces: string[]; materialName: string }>();
                  if (showMaterialGroups && result) {
                    for (const s of result.surfaces) {
                      if (!groupedSurfaceKeys.has(s.surfaceKey)) continue;
                      const grp = materialGroups.find(g => {
                        if (!g.surfaceKeys.includes(s.surfaceKey)) return false;
                        if (!g.areaIds || g.areaIds.length === 0) return true;
                        return g.areaIds.includes(room.id);
                      });
                      if (!grp || !grp.materialId) continue;
                      const mat = allMaterials.find(m => m.id === grp.materialId);
                      if (!mat) continue;
                      const existing = groupedNotesMap.get(grp.materialId);
                      const matLabel = `${mat.materialName} (${mat.brand})`;
                      if (existing) {
                        if (!existing.surfaces.includes(s.surfaceName)) existing.surfaces.push(s.surfaceName);
                      } else {
                        groupedNotesMap.set(grp.materialId, { surfaces: [s.surfaceName], materialName: matLabel });
                      }
                    }
                  }
                  const groupedNotes = Array.from(groupedNotesMap.values());
                  if (areaMaterialCosts.length === 0 && groupedNotes.length === 0) return null;
                  return (
                    <MaterialSummaryCard
                      costs={areaMaterialCosts}
                      label={`Materials for ${room.name || `Section ${roomIndex + 1}`}`}
                      groupedNotes={groupedNotes}
                    />
                  );
                })()}

                {room.photos && room.photos.length > 0 && (
                  <div className="px-1 py-2">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] text-muted-foreground font-medium">
                        {room.photos.length} photo{room.photos.length !== 1 ? 's' : ''}
                      </span>
                      <div className="flex items-center gap-1">
                        {photoSelectMode && photoViewerRoom === roomIndex ? (
                          <>
                            {selectedPhotos.size > 0 && (
                              <button type="button" onClick={() => setPhotoDeleteConfirm({ type: 'bulk', roomIndex })} className="text-[10px] px-2 py-0.5 rounded-full bg-destructive text-destructive-foreground font-medium" data-testid={`button-delete-selected-${roomIndex}`}>
                                Delete {selectedPhotos.size}
                              </button>
                            )}
                            <button type="button" onClick={() => { setPhotoSelectMode(false); setSelectedPhotos(new Set()); }} className="text-[10px] px-2 py-0.5 rounded-full border border-border text-muted-foreground font-medium" data-testid={`button-cancel-select-${roomIndex}`}>
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button type="button" onClick={() => { setPhotoSelectMode(true); setPhotoViewerRoom(roomIndex); setSelectedPhotos(new Set()); }} className="text-[10px] px-2 py-0.5 rounded-full border border-border text-muted-foreground font-medium hover:text-foreground" data-testid={`button-select-photos-${roomIndex}`}>
                            Select
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {room.photos.map((photo, pIdx) => (
                        <div
                          key={pIdx}
                          className="relative group rounded-lg overflow-hidden border border-border bg-muted aspect-square cursor-pointer"
                          onClick={() => {
                            if (photoSelectMode && photoViewerRoom === roomIndex) {
                              setSelectedPhotos(prev => { const next = new Set(prev); next.has(pIdx) ? next.delete(pIdx) : next.add(pIdx); return next; });
                            } else if (!photo.uploading) {
                              setPhotoViewerRoom(roomIndex); setPhotoViewerIndex(pIdx); setPhotoViewerOpen(true);
                            }
                          }}
                          data-testid={`photo-thumbnail-${roomIndex}-${pIdx}`}
                        >
                          <img src={photo.url} alt={`${room.name || 'Section'} photo ${pIdx + 1}`} className="w-full h-full object-cover" loading="lazy" />
                          {photo.uploading && <div className="absolute inset-0 bg-black/40 flex items-center justify-center"><Loader2 className="w-5 h-5 text-white animate-spin" /></div>}
                          {photoSelectMode && photoViewerRoom === roomIndex && (
                            <div className={cn("absolute top-1 left-1 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors", selectedPhotos.has(pIdx) ? "bg-primary border-primary text-primary-foreground" : "bg-black/30 border-white/70")}>
                              {selectedPhotos.has(pIdx) && <Check className="w-3 h-3" />}
                            </div>
                          )}
                          {!photoSelectMode && !photo.uploading && (
                            <button
                              type="button"
                              className={cn("absolute bottom-1 right-1 w-8 h-8 rounded-full flex items-center justify-center transition-all", photo.showOnProposal === true ? "bg-green-600/90 text-white" : "bg-black/40 text-white/50")}
                              onClick={(e) => { e.stopPropagation(); const updatedPhotos = [...(room.photos || [])]; updatedPhotos[pIdx] = { ...updatedPhotos[pIdx], showOnProposal: !updatedPhotos[pIdx].showOnProposal }; updateRoom(roomIndex, { photos: updatedPhotos }); }}
                              data-testid={`button-toggle-photo-proposal-${roomIndex}-${pIdx}`}
                            >
                              {photo.showOnProposal === true ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {showCancelConfirm && (
                <div className="fixed inset-0 z-[10002] bg-black/50 flex items-center justify-center p-4">
                  <div className="bg-card rounded-xl border border-border shadow-lg p-4 max-w-sm w-full space-y-3">
                    <h3 className="text-sm font-semibold">Discard changes?</h3>
                    <p className="text-xs text-muted-foreground">Your changes to this section will not be saved.</p>
                    <div className="flex gap-2 justify-end">
                      <button type="button" onClick={() => setShowCancelConfirm(false)} className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground font-medium" data-testid="button-cancel-discard-keep">
                        Keep Editing
                      </button>
                      <button type="button" onClick={handleConfirmCancel} className="text-xs px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground font-medium" data-testid="button-cancel-discard-confirm">
                        Discard
                      </button>
                    </div>
                  </div>
                </div>
              )}
              </div>,
              document.body
            )}
          </div>
        );
      })}

      <div className="relative" data-testid="add-section-container">
        <button
          type="button"
          onClick={() => {
            const sectionType = resolveSectionType(jobType);
            setRooms(prev => {
              const newRooms = prev.map(r => ({ ...r, expanded: false }));
              const newRoom = createDefaultArea(newRooms.length, doorHDefault, doorWDefault, true, jobType, sectionType);
              newRoom.name = uniqueSectionName(newRoom.name, newRooms.map(r => r.name));
              pendingOpenIndexRef.current = newRooms.length;
              newSectionIndexRef.current = newRooms.length;
              return [...newRooms, newRoom];
            });
          }}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border-2 border-dashed border-primary/20 text-sm font-medium text-muted-foreground hover:bg-muted/40 transition-colors"
          data-testid="button-add-section"
          data-mutating="true"
        >
          <Plus className="w-4 h-4" />
          Add Section
        </button>
      </div>
        </div>
        {rooms.length > 0 && (
          <div className="flex items-center justify-between px-3 py-2.5 border-t border-border/40 bg-muted/20">
            <span className="text-sm font-semibold">Total</span>
            <span className="text-sm font-semibold tabular-nums">
              {grandLaborHours.toFixed(1)} hrs — ${grandTotal.toFixed(0)}
            </span>
          </div>
        )}
      </div>

      <div className="space-y-2 rounded-xl border-2 border-indigo-200 dark:border-indigo-800/40 bg-card px-2.5 py-2.5 shadow-md shadow-indigo-500/5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Switch
                checked={showMaterialGroups || showPrimerGroups}
                onCheckedChange={(checked) => {
                  setShowMaterialGroups(checked);
                  setShowPrimerGroups(checked);
                  if (checked && materialGroups.length === 0 && primerGroups.length === 0) {
                    const serviceSurfaces = (allSurfacesData || []).filter(s => s.estimateType === jobType);
                    // Only include surfaces actually enabled on at least one section/room
                    const enabledKeys = new Set<string>();
                    rooms.forEach(room => {
                      serviceSurfaces.forEach(s => {
                        if ((room as any)[s.surfaceKey]) enabledKeys.add(s.surfaceKey);
                      });
                    });
                    const usedSurfaces = serviceSurfaces.filter(s => enabledKeys.has(s.surfaceKey));
                    const surfaceKeys = usedSurfaces.map(s => s.surfaceKey);
                    const labels = usedSurfaces.map(s => s.surfaceName);
                    const groupName = labels.length === 0
                      ? "All Surfaces"
                      : labels.length <= 3
                        ? labels.join(" & ")
                        : "All Surfaces";
                    const matCounts: Record<number, number> = {};
                    rooms.forEach(room => {
                      surfaceKeys.forEach(sk => {
                        const sKey = sk as SurfaceKey;
                        if (!room[sKey]) return;
                        const matId = getEffectiveMaterialId(room, sKey);
                        if (matId != null) matCounts[matId] = (matCounts[matId] || 0) + 1;
                      });
                    });
                    let dominantMatId: number | null = null;
                    let maxCount = 0;
                    Object.entries(matCounts).forEach(([id, count]) => {
                      if (count > maxCount) { maxCount = count; dominantMatId = Number(id); }
                    });
                    if (!dominantMatId && paintPrimerMaterials.length > 0) {
                      const regalSelect = paintPrimerMaterials.find(m =>
                        m.materialName.toLowerCase().includes('regal select') || m.materialName.toLowerCase().includes('regal')
                      );
                      dominantMatId = regalSelect?.id || paintPrimerMaterials[0].id;
                    }
                    const newGroup: MaterialGroup = {
                      id: `mg-${Date.now()}`,
                      name: groupName,
                      surfaceKeys,
                      materialId: dominantMatId,
                      type: 'paint',
                    };
                    setEditingGroup(newGroup);
                    setShowGroupEditor(true);
                  }
                }}
                className="scale-[0.65] origin-left shrink-0"
                data-testid="toggle-material-groups"
              />
              <span className="text-[13px] font-medium">Material Groups</span>
              <InfoBubble text="Group surfaces to share one paint or primer selection. Toggle off to disable grouping without losing your configuration. Remove groups individually with the X button." />
            </div>
          </div>

          {(materialGroups.length > 0 || primerGroups.length > 0) && (
            <div className="mt-2 space-y-2">
              {[...materialGroups.map(g => ({ ...g, type: (g.type || 'paint') as 'paint' | 'primer' })), ...primerGroups.map(g => ({ ...g, type: 'primer' as const }))].map((group) => {
                const isGroupPrimer = group.type === 'primer';
                const groupResult = isGroupPrimer
                  ? primerGroupResults.find(r => r.groupId === group.id)
                  : materialGroupResults.find(r => r.groupId === group.id);
                const selectedMat = group.materialId ? allMaterials.find(m => m.id === group.materialId) : null;
                const matLabel = selectedMat ? `${selectedMat.materialName} (${selectedMat.brand})` : null;
                const groupsActive = showMaterialGroups || showPrimerGroups;
                return (
                  <MaterialGroupSummaryCard
                    key={group.id}
                    group={group}
                    groupResult={groupsActive ? groupResult : undefined}
                    matLabel={matLabel}
                    allMaterials={allMaterials}
                    rooms={rooms}
                    dimmed={!groupsActive}
                    onEdit={() => {
                      setEditingGroup({ ...group });
                      setShowGroupEditor(true);
                    }}
                    onRemove={() => {
                      setGroupToRemove(group);
                    }}
                  />
                );
              })}

              {(showMaterialGroups || showPrimerGroups) && (
                <button
                  type="button"
                  onClick={() => {
                    const serviceSurfaces = (allSurfacesData || []).filter(s => s.estimateType === jobType);
                    const claimedKeys = new Set(materialGroups.flatMap(g => g.surfaceKeys));
                    // Build full chip list: built-ins + dynamic service surfaces
                    const staticChips: { key: string; label: string }[] = [
                      ...AREA_SURFACES,
                      ...ITEM_SURFACES.map(s => ({ key: s.key, label: s.label })),
                      ...EXTRA_SURFACES.map(s => ({ key: s.key, label: s.label })),
                    ];
                    const staticKeys = new Set(staticChips.map(c => c.key));
                    const dynamicChips = serviceSurfaces
                      .filter(s => !staticKeys.has(s.surfaceKey))
                      .map(s => ({ key: s.surfaceKey, label: s.surfaceName }));
                    const allChips = [...staticChips, ...dynamicChips];
                    // Surface is enabled if any room has the flag set (built-in or dynamic)
                    const isEnabled = (k: string) => rooms.some(r =>
                      Boolean((r as any)[k]) || Boolean(r.dynamicSurfaces?.[k]?.enabled)
                    );
                    const availableChips = allChips.filter(c => isEnabled(c.key) && !claimedKeys.has(c.key));
                    const surfaceKeys = availableChips.map(c => c.key);
                    const labels = availableChips.map(c => c.label);
                    const groupName = labels.length === 0
                      ? `Group ${materialGroups.length + primerGroups.length + 1}`
                      : labels.length <= 3
                        ? labels.join(" & ")
                        : "All Surfaces";
                    const matCounts: Record<number, number> = {};
                    rooms.forEach(room => {
                      surfaceKeys.forEach(sk => {
                        const sKey = sk as SurfaceKey;
                        if (!room[sKey]) return;
                        const matId = getEffectiveMaterialId(room, sKey);
                        if (matId != null) matCounts[matId] = (matCounts[matId] || 0) + 1;
                      });
                    });
                    let dominantMatId: number | null = null;
                    let maxCount = 0;
                    Object.entries(matCounts).forEach(([id, count]) => {
                      if (count > maxCount) { maxCount = count; dominantMatId = Number(id); }
                    });
                    if (!dominantMatId && paintPrimerMaterials.length > 0) {
                      const regalSelect = paintPrimerMaterials.find(m =>
                        m.materialName.toLowerCase().includes('regal select') || m.materialName.toLowerCase().includes('regal')
                      );
                      dominantMatId = regalSelect?.id || paintPrimerMaterials[0].id;
                    }
                    const newGroup: MaterialGroup = {
                      id: `mg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                      name: groupName,
                      surfaceKeys,
                      materialId: dominantMatId,
                      type: 'paint',
                    };
                    setEditingGroup(newGroup);
                    setShowGroupEditor(true);
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border-2 border-dashed border-border text-sm text-muted-foreground hover-elevate"
                  data-testid="button-add-material-group"
                  data-mutating="true"
                >
                  <Plus className="w-4 h-4" />
                  Add Material Group
                </button>
              )}
            </div>
          )}
      </div>

      <MaterialGroupEditorModal
        open={showGroupEditor}
        onClose={() => {
          setShowGroupEditor(false);
          setEditingGroup(null);
          if (materialGroups.length === 0 && primerGroups.length === 0) {
            setShowMaterialGroups(false);
            setShowPrimerGroups(false);
          }
        }}
        group={editingGroup}
        allSurfacesData={allSurfacesData || []}
        jobType={jobType}
        allGroups={[...materialGroups.map(g => ({ ...g, type: (g.type || 'paint') as 'paint' | 'primer' })), ...primerGroups.map(g => ({ ...g, type: 'primer' as const }))]}
        onSave={(saved) => {
          // Close editor immediately (handleSave no longer calls onClose to avoid stale-state race)
          setShowGroupEditor(false);
          setEditingGroup(null);
          const isPrimer = saved.type === 'primer';
          const prevGroup = isPrimer
            ? primerGroups.find(g => g.id === saved.id)
            : materialGroups.find(g => g.id === saved.id);

          if (isPrimer) {
            setPrimerGroups(prev => {
              const exists = prev.some(g => g.id === saved.id);
              if (exists) return prev.map(g => g.id === saved.id ? saved : g);
              return [...prev, saved];
            });
            setMaterialGroups(prev => prev.filter(g => g.id !== saved.id));
            setShowPrimerGroups(true);
          } else {
            setMaterialGroups(prev => {
              const exists = prev.some(g => g.id === saved.id);
              if (exists) return prev.map(g => g.id === saved.id ? saved : g);
              return [...prev, saved];
            });
            setPrimerGroups(prev => prev.filter(g => g.id !== saved.id));
            setShowMaterialGroups(true);
          }

          const prevAreaIds = prevGroup?.areaIds || [];
          const nextAreaIds = saved.areaIds || [];
          const prevSurfaces = new Set(prevGroup?.surfaceKeys || []);
          const nextSurfaces = new Set(saved.surfaceKeys);
          const allSurfaces = new Set<string>([...prevSurfaces, ...nextSurfaces]);

          setRooms(prev => prev.map(room => {
            const prevApplies = !prevGroup ? false : (prevAreaIds.length === 0 || prevAreaIds.includes(room.id));
            const nextApplies = nextAreaIds.length === 0 || nextAreaIds.includes(room.id);
            let changed = false;

            if (isPrimer) {
              const primerOvr = { ...(room.primerOverride || {}) };
              allSurfaces.forEach(sKey => {
                const wasIn = prevApplies && prevSurfaces.has(sKey);
                const nowIn = nextApplies && nextSurfaces.has(sKey);
                if (nowIn) {
                  const cur = primerOvr[sKey] || { enabled: false };
                  if (cur.materialId !== saved.materialId) {
                    primerOvr[sKey] = { ...cur, materialId: saved.materialId };
                    changed = true;
                  }
                } else if (wasIn) {
                  const cur = primerOvr[sKey];
                  if (cur && cur.materialId !== undefined) {
                    const { materialId, ...rest } = cur;
                    primerOvr[sKey] = rest;
                    changed = true;
                  }
                }
              });
              return changed ? { ...room, primerOverride: primerOvr } : room;
            } else {
              const matOvr = { ...(room.materialOverride || {}) };
              allSurfaces.forEach(sKey => {
                const wasIn = prevApplies && prevSurfaces.has(sKey);
                const nowIn = nextApplies && nextSurfaces.has(sKey);
                if (nowIn) {
                  if (matOvr[sKey] !== saved.materialId) {
                    matOvr[sKey] = saved.materialId;
                    changed = true;
                  }
                } else if (wasIn) {
                  if (matOvr[sKey] !== undefined) {
                    delete matOvr[sKey];
                    changed = true;
                  }
                }
              });
              return changed ? { ...room, materialOverride: matOvr } : room;
            }
          }));
        }}
        availableMaterials={paintPrimerMaterials}
        primerMaterials={primerMaterials}
        rooms={rooms}
        getEffectiveMaterialId={getEffectiveMaterialId}
        groupResult={editingGroup ? [...materialGroupResults, ...primerGroupResults].find(r => r.groupId === editingGroup.id) : undefined}
      />

      <AlertDialog open={!!groupToRemove} onOpenChange={(o) => { if (!o) setGroupToRemove(null); }}>
        <AlertDialogContent className="z-[10002]" overlayClassName="z-[10002]">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove "{groupToRemove?.name || 'Untitled Group'}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {groupToRemove && groupToRemove.surfaceKeys.length > 0
                ? `This group has ${groupToRemove.surfaceKeys.length} surface${groupToRemove.surfaceKeys.length > 1 ? 's' : ''} assigned. Removing it will revert those surfaces to individual material calculations.`
                : 'This will permanently remove this material group.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (groupToRemove) {
                  const isPrimer = groupToRemove.type === 'primer';
                  const remainingMaterial = isPrimer ? materialGroups : materialGroups.filter(g => g.id !== groupToRemove.id);
                  const remainingPrimer = isPrimer ? primerGroups.filter(g => g.id !== groupToRemove.id) : primerGroups;
                  if (isPrimer) {
                    setPrimerGroups(remainingPrimer);
                  } else {
                    setMaterialGroups(remainingMaterial);
                  }

                  const removedAreaIds = groupToRemove.areaIds || [];
                  const removedSurfaces = new Set(groupToRemove.surfaceKeys);
                  setRooms(prev => prev.map(room => {
                    const applies = removedAreaIds.length === 0 || removedAreaIds.includes(room.id);
                    if (!applies) return room;
                    let changed = false;
                    if (isPrimer) {
                      const primerOvr = { ...(room.primerOverride || {}) };
                      removedSurfaces.forEach(sKey => {
                        const cur = primerOvr[sKey];
                        if (cur && cur.materialId !== undefined) {
                          const { materialId, ...rest } = cur;
                          primerOvr[sKey] = rest;
                          changed = true;
                        }
                      });
                      return changed ? { ...room, primerOverride: primerOvr } : room;
                    } else {
                      const matOvr = { ...(room.materialOverride || {}) };
                      removedSurfaces.forEach(sKey => {
                        if (matOvr[sKey] !== undefined) {
                          delete matOvr[sKey];
                          changed = true;
                        }
                      });
                      return changed ? { ...room, materialOverride: matOvr } : room;
                    }
                  }));

                  if (remainingMaterial.length === 0 && remainingPrimer.length === 0) {
                    setShowMaterialGroups(false);
                    setShowPrimerGroups(false);
                  }
                }
                setGroupToRemove(null);
              }}
              data-testid="button-confirm-remove-group"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {totalMaterialCost > 0 && (
        <div className="rounded-xl border-2 border-emerald-200 dark:border-emerald-800/40 bg-card p-4 space-y-3 shadow-md shadow-emerald-500/5" data-testid="consolidated-materials-summary">
          <div className="flex items-center gap-2">
            <Droplets className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold">Materials Summary</span>
          </div>

          {materialGroupResults.length > 0 && (
            <div className="space-y-2">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Grouped Materials</span>
              {materialGroupResults.map((gr, i) => (
                <div key={gr.groupId || i} className="text-sm space-y-0.5 pl-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-foreground truncate">{gr.groupName}</span>
                    <span className="tabular-nums text-muted-foreground shrink-0">${gr.totalCost.toFixed(2)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground pl-2 space-y-0">
                    <div>{gr.materialName}</div>
                    <div>{gr.totalSqft.toFixed(0)} sqft — {gr.coveragePerUnit} sqft/gal</div>
                    <div>{gr.exactQtyNeeded.toFixed(2)} gal needed — Buy {gr.qtyToBuy} gal @ ${gr.costPerUnit.toFixed(2)}/gal</div>
                    {gr.surfaces.length > 0 && (
                      <div className="text-[10px] opacity-70 mt-0.5">{gr.surfaces.map(s => `${s.surfaceName} (${s.sqft.toLocaleString()} sqft)`).join(", ")}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {ungroupedMaterialCosts.length > 0 && (
            <div className="space-y-2">
              {materialGroupResults.length > 0 && (
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Per-Area Materials</span>
              )}
              {ungroupedMaterialCosts.map((c, i) => (
                <div key={i} className="text-sm space-y-0.5 pl-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-foreground truncate">{c.surfaceName}</span>
                    <span className="tabular-nums text-muted-foreground shrink-0">${c.totalCost.toFixed(2)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground pl-2 space-y-0">
                    <div>{c.materialName}</div>
                    <div>{c.totalSqft.toFixed(0)} sqft — {c.coveragePerUnit} sqft/{c.materialUnit}</div>
                    <div>{c.exactQtyNeeded.toFixed(2)} {c.materialUnit} needed — Buy {c.qtyToBuy} {c.materialUnit} @ ${c.costPerUnit.toFixed(2)}/{c.materialUnit}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between text-sm font-semibold border-t border-border pt-2">
            <span>Materials Total{customerProvidingMaterials ? ' (Not Included)' : ''}</span>
            <span className={`tabular-nums ${customerProvidingMaterials ? 'line-through text-muted-foreground' : ''}`}>${totalMaterialCost.toFixed(2)}</span>
          </div>
        </div>
      )}

      <div className="pt-3 space-y-2">
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Labor ({rooms.length} area{rooms.length !== 1 ? "s" : ""})</span>
            <span className="tabular-nums">{grandLaborHours.toFixed(1)} hrs — ${grandTotal.toFixed(0)}</span>
          </div>
          {totalMaterialCost > 0 && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Materials{customerProvidingMaterials ? ' (Not Included)' : ''}</span>
              <span className={`tabular-nums ${customerProvidingMaterials ? 'line-through' : ''}`}>${totalMaterialCost.toFixed(0)}</span>
            </div>
          )}
          <div className="flex items-center justify-between text-sm font-semibold pt-1 border-t border-border">
            <span>Grand Total</span>
            <span className="tabular-nums">${(customerProvidingMaterials ? grandTotal : grandTotal + totalMaterialCost).toFixed(0)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCancelClick}
            data-testid="button-builder-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={handleGenerate}
            className="flex-1"
            size="sm"
            data-testid="button-builder-generate"
          >
            <Save className="w-4 h-4 mr-2" />
            {(customerProvidingMaterials ? grandTotal : grandTotal + totalMaterialCost) > 0 
              ? `Save & Add Items ($${(customerProvidingMaterials ? grandTotal : grandTotal + totalMaterialCost).toFixed(0)})` 
              : 'Save Estimate'}
          </Button>
        </div>
      </div>

      <Dialog open={wallEditModal !== null} onOpenChange={(open) => { if (!open) setWallEditModal(null); }}>
        <DialogContent className="z-[10002] max-w-sm" data-testid="wall-edit-modal">
          <DialogHeader>
            <DialogTitle className="text-base">Edit Wall Dimensions</DialogTitle>
          </DialogHeader>
          {wallEditModal && (() => {
            const room = rooms[wallEditModal.roomIndex];
            if (!room) return null;
            const wallLabels = [
              `Left (${room.length}' × ${room.ceilingHeight}')`,
              `Front (${room.width}' × ${room.ceilingHeight}')`,
              `Right (${room.length}' × ${room.ceilingHeight}')`,
              `Back (${room.width}' × ${room.ceilingHeight}')`,
            ];
            return (
              <div className="space-y-3">
                {wallEditModal.wallSelections.map((w, i) => (
                  <div key={i} className="flex items-center gap-3" data-testid={`wall-edit-row-${i}`}>
                    <button
                      type="button"
                      onClick={() => {
                        setWallEditModal(prev => {
                          if (!prev) return prev;
                          const updated = [...prev.wallSelections];
                          updated[i] = { ...updated[i], enabled: !updated[i].enabled };
                          return { ...prev, wallSelections: updated };
                        });
                      }}
                      className={cn(
                        "w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors",
                        w.enabled ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/40"
                      )}
                      data-testid={`wall-edit-check-${i}`}
                    >
                      {w.enabled && <Check className="w-3 h-3" />}
                    </button>
                    <span className="text-sm flex-1 min-w-0">{wallLabels[i]}</span>
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        min={0}
                        value={w.sqftOverride ?? Math.round(w._defaultSqft)}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const num = raw === '' ? null : Number(raw);
                          const val = num !== null && (!Number.isFinite(num) || num < 0) ? null : num;
                          setWallEditModal(prev => {
                            if (!prev) return prev;
                            const updated = [...prev.wallSelections];
                            const defaultVal = Math.round(updated[i]._defaultSqft);
                            updated[i] = { ...updated[i], sqftOverride: val !== null && val !== defaultVal ? val : null };
                            return { ...prev, wallSelections: updated };
                          });
                        }}
                        className={cn(
                          "w-20 h-8 text-xs text-right tabular-nums",
                          w.sqftOverride != null && "text-amber-600 dark:text-amber-400 font-semibold"
                        )}
                        data-testid={`wall-edit-sqft-${i}`}
                      />
                      <span className="text-xs text-muted-foreground">sf</span>
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-2 border-t border-border/40">
                  <span className="text-sm font-semibold">Total</span>
                  <span className="text-sm font-semibold tabular-nums">
                    {Math.round(wallEditModal.wallSelections.reduce((s, w) => s + (w.enabled ? (w.sqftOverride ?? w._defaultSqft) : 0), 0))} sf
                  </span>
                </div>
              </div>
            );
          })()}
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setWallEditModal(null)} data-testid="wall-edit-cancel">Cancel</Button>
            <Button size="sm" onClick={() => {
              if (!wallEditModal) return;
              setRooms(prev => prev.map((r, ri) => {
                if (ri !== wallEditModal.roomIndex) return r;
                return {
                  ...r,
                  wallSelections: wallEditModal.wallSelections.map(w => ({
                    enabled: w.enabled,
                    sqftOverride: w.sqftOverride,
                  })),
                };
              }));
              setWallEditModal(null);
            }} data-testid="wall-edit-save">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
        <AlertDialogContent className="z-[10001]" overlayClassName="z-[10001]" data-testid="discard-changes-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes in the estimator. If you go back now, your changes will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-keep-editing">Keep Editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { setShowDiscardDialog(false); onCancel(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-discard-changes"
            >
              Discard Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={photoDeleteConfirm !== null} onOpenChange={(open) => { if (!open) setPhotoDeleteConfirm(null); }}>
        <AlertDialogContent className="z-[10002]" overlayClassName="z-[10002]" data-testid="photo-delete-confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Unlink {photoDeleteConfirm?.type === 'bulk' ? `${selectedPhotos.size} photo${selectedPhotos.size !== 1 ? 's' : ''}` : 'photo'}?</AlertDialogTitle>
            <AlertDialogDescription>
              {photoDeleteConfirm?.type === 'bulk'
                ? `This unlinks ${selectedPhotos.size} photo${selectedPhotos.size !== 1 ? 's' : ''} from this area. The photo${selectedPhotos.size !== 1 ? 's stay' : ' stays'} in your project photos and can be added back here or to another area anytime.`
                : 'This unlinks the photo from this area. The photo stays in your project photos and can be added back here or to another area anytime.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-photo-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-photo-delete"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (photoDeleteConfirm?.type === 'bulk') {
                  const ri = photoDeleteConfirm.roomIndex;
                  const keep = (rooms[ri]?.photos || []).filter((_, i) => !selectedPhotos.has(i));
                  updateRoom(ri, { photos: keep });
                  setSelectedPhotos(new Set());
                  setPhotoSelectMode(false);
                } else if (photoDeleteConfirm?.type === 'single') {
                  const { roomIndex: ri, photoIndex: pi } = photoDeleteConfirm;
                  removeRoomPhoto(ri, pi);
                  const viewerPhotos = rooms[ri]?.photos || [];
                  if (pi >= viewerPhotos.length - 1) {
                    if (viewerPhotos.length <= 1) setPhotoViewerOpen(false);
                    else setPhotoViewerIndex(pi - 1);
                  }
                }
                setPhotoDeleteConfirm(null);
              }}
            >
              Unlink
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={overrideDialogRoom !== null}
        onOpenChange={(open) => { if (!open) setOverrideDialogRoom(null); }}
      >
        <DialogContent className="z-[10002] max-w-xs top-[30%] translate-y-0 sm:top-[50%] sm:-translate-y-1/2" data-testid="override-price-dialog">
          <DialogHeader>
            <DialogTitle className="text-base">Override Price</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <p className="text-xs text-muted-foreground mb-3">
              Production rate: <span className="font-semibold tabular-nums">${overrideDialogRoom !== null && roomResults[overrideDialogRoom] ? roomResults[overrideDialogRoom]!.totalPrice.toFixed(0) : '—'}</span>
            </p>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="number"
                placeholder="Enter your price"
                value={overrideDialogValue}
                onChange={(e) => setOverrideDialogValue(e.target.value)}
                className="pl-8 text-lg font-semibold tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                autoFocus
                data-testid="input-override-price"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && overrideDialogRoom !== null) {
                    const val = parseFloat(overrideDialogValue);
                    if (!isNaN(val) && val > 0) {
                      updateRoom(overrideDialogRoom, { priceOverride: val });
                      setOverrideDialogRoom(null);
                    }
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            {overrideDialogRoom !== null && rooms[overrideDialogRoom]?.priceOverride != null && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  updateRoom(overrideDialogRoom!, { priceOverride: undefined });
                  setOverrideDialogRoom(null);
                }}
                className="text-destructive hover:text-destructive"
                data-testid="button-remove-override"
                data-mutating="true"
              >
                Remove Override
              </Button>
            )}
            <Button
              onClick={() => {
                if (overrideDialogRoom !== null) {
                  const val = parseFloat(overrideDialogValue);
                  if (!isNaN(val) && val > 0) {
                    updateRoom(overrideDialogRoom, { priceOverride: val });
                  }
                  setOverrideDialogRoom(null);
                }
              }}
              disabled={!overrideDialogValue || isNaN(parseFloat(overrideDialogValue)) || parseFloat(overrideDialogValue) <= 0}
              data-testid="button-save-override"
              data-mutating="true"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={surfacePriceOverrideDialog !== null}
        onOpenChange={(open) => { if (!open) setSurfacePriceOverrideDialog(null); }}
      >
        <DialogContent className="z-[10002] max-w-xs top-[20%] translate-y-0 sm:top-[50%] sm:-translate-y-1/2 shadow-[0_8px_32px_rgba(220,38,38,0.25)]" data-testid="surface-price-override-dialog">
          <DialogHeader>
            <DialogTitle className="text-base">Override Unit Price</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <p className="text-sm font-medium mb-1">{surfacePriceOverrideDialog?.surfaceName}</p>
            <p className="text-xs text-muted-foreground mb-3">
              Production rate: <span className="font-semibold tabular-nums">${surfacePriceOverrideDialog?.calcPerUnit?.toFixed(2) ?? '—'}/ea</span>
            </p>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="number"
                placeholder="Price per unit"
                value={surfacePriceOverrideValue}
                onChange={(e) => setSurfacePriceOverrideValue(e.target.value)}
                className="pl-8 text-lg font-semibold tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                autoFocus
                data-testid="input-surface-price-override"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && surfacePriceOverrideDialog) {
                    const val = parseFloat(surfacePriceOverrideValue);
                    if (!isNaN(val) && val > 0) {
                      const { roomIndex: ri, surfaceKey: sk } = surfacePriceOverrideDialog;
                      setRooms(prev => prev.map((r, i) => {
                        if (i !== ri) return r;
                        return { ...r, surfacePriceOverride: { ...(r.surfacePriceOverride || {}), [sk]: val } };
                      }));
                      setSurfacePriceOverrideDialog(null);
                    }
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            {surfacePriceOverrideDialog?.currentOverride != null && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (surfacePriceOverrideDialog) {
                    const { roomIndex: ri, surfaceKey: sk } = surfacePriceOverrideDialog;
                    setRooms(prev => prev.map((r, i) => {
                      if (i !== ri) return r;
                      const updated = { ...(r.surfacePriceOverride || {}) };
                      delete updated[sk];
                      return { ...r, surfacePriceOverride: Object.keys(updated).length > 0 ? updated : undefined };
                    }));
                    setSurfacePriceOverrideDialog(null);
                  }
                }}
                className="text-destructive hover:text-destructive"
                data-testid="button-remove-surface-override"
                data-mutating="true"
              >
                Remove Override
              </Button>
            )}
            <Button
              onClick={() => {
                if (surfacePriceOverrideDialog) {
                  const val = parseFloat(surfacePriceOverrideValue);
                  if (!isNaN(val) && val > 0) {
                    const { roomIndex: ri, surfaceKey: sk } = surfacePriceOverrideDialog;
                    setRooms(prev => prev.map((r, i) => {
                      if (i !== ri) return r;
                      return { ...r, surfacePriceOverride: { ...(r.surfacePriceOverride || {}), [sk]: val } };
                    }));
                  }
                  setSurfacePriceOverrideDialog(null);
                }
              }}
              disabled={!surfacePriceOverrideValue || isNaN(parseFloat(surfacePriceOverrideValue)) || parseFloat(surfacePriceOverrideValue) <= 0}
              data-testid="button-save-surface-override"
              data-mutating="true"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!overrideEditor} onOpenChange={(o) => { if (!o) setOverrideEditor(null); }}>
        <DialogContent className="z-[10003] sm:max-w-md top-[8%] translate-y-0 shadow-lg border-2 border-red-400 dark:border-red-700">
          <DialogHeader>
            <DialogTitle>Override {overrideEditor?.surfaceName}</DialogTitle>
          </DialogHeader>
          {overrideEditor && (
            <div className="space-y-3 py-2">
              <div className="text-sm text-muted-foreground">
                Auto-calculated from section dimensions: <strong className="text-foreground">{overrideEditor.autoQty} {overrideEditor.unit === 'lf' ? 'linear feet' : 'sq ft'}</strong>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {overrideEditor.unit === 'lf' ? 'Linear Feet' : 'Sq Ft'}
                </label>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={overrideEditor.tempValue}
                  onChange={(e) => setOverrideEditor(prev => prev ? { ...prev, tempValue: e.target.value } : prev)}
                  className="text-center text-lg mt-1"
                  autoFocus
                  data-testid="input-override-value"
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="ghost"
              onClick={() => {
                if (!overrideEditor) return;
                const { roomIndex: ri, dynKey: dk, unit: u } = overrideEditor;
                setRooms(prev => prev.map((r, i) => {
                  if (i !== ri) return r;
                  const auto = autoCalcDynamicQty(r, u);
                  const existing = r.dynamicSurfaces?.[dk] || { enabled: true, qty: 0 };
                  return { ...r, dynamicSurfaces: { ...r.dynamicSurfaces, [dk]: { ...existing, qty: auto, manual: false } } };
                }));
                setOverrideEditor(null);
              }}
              data-testid="button-use-auto-override"
            >
              Use Auto ({overrideEditor?.autoQty})
            </Button>
            <Button variant="outline" onClick={() => setOverrideEditor(null)} data-testid="button-cancel-override">
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!overrideEditor) return;
                const v = parseFloat(overrideEditor.tempValue);
                if (isNaN(v) || v <= 0) {
                  setOverrideEditor(null);
                  return;
                }
                const { roomIndex: ri, dynKey: dk, autoQty: aq } = overrideEditor;
                setRooms(prev => prev.map((r, i) => {
                  if (i !== ri) return r;
                  const existing = r.dynamicSurfaces?.[dk] || { enabled: true, qty: 0 };
                  const isManual = v !== aq;
                  return { ...r, dynamicSurfaces: { ...r.dynamicSurfaces, [dk]: { ...existing, qty: v, manual: isManual } } };
                }));
                setOverrideEditor(null);
              }}
              data-testid="button-save-override"
              data-mutating="true"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {cameraRoomIndex !== null && (
        <CameraCapture
          onCapture={(blob) => handleCameraCapture(blob, cameraRoomIndex)}
          onClose={() => setCameraRoomIndex(null)}
        />
      )}

      {projectId && projectPhotoPickerRoom !== null && (
        <ProjectPhotoPicker
          projectId={projectId}
          open={true}
          onOpenChange={(open) => { if (!open) setProjectPhotoPickerRoom(null); }}
          existingUrls={(rooms[projectPhotoPickerRoom]?.photos || []).map(p => p.url)}
          onSelect={(photos) => {
            const roomIdx = projectPhotoPickerRoom;
            if (roomIdx === null) return;
            const existing = rooms[roomIdx]?.photos || [];
            const existingUrls = new Set(existing.map(p => p.url));
            const newPhotos = photos.filter(p => !existingUrls.has(p.url));
            if (newPhotos.length > 0) {
              updateRoom(roomIdx, { photos: [...existing, ...newPhotos] });
              setExpandedPhotoRoom(roomIdx);
            }
            setProjectPhotoPickerRoom(null);
          }}
        />
      )}

      {photoViewerOpen && (() => {
        const viewerPhotos = rooms[photoViewerRoom]?.photos || [];
        const currentPhoto = viewerPhotos[photoViewerIndex];
        if (!currentPhoto) return null;
        const areaName = rooms[photoViewerRoom]?.name || 'Area';
        return createPortal(
          <div
            className="fixed inset-0 z-[10001] bg-black flex flex-col select-none"
            data-testid="photo-viewer-fullscreen"
          >
            <div
              className="flex items-center justify-between px-4 text-white shrink-0"
              style={{
                background: 'linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)',
                paddingTop: 'max(12px, env(safe-area-inset-top, 12px))',
                paddingBottom: '16px',
              }}
            >
              <button
                onClick={() => setPhotoViewerOpen(false)}
                className="px-4 py-2 rounded-xl text-sm font-bold bg-white/20 active:bg-white/30 backdrop-blur-md"
                data-testid="button-viewer-close"
              >
                Done
              </button>
              <span className="text-sm font-medium text-white/80">
                {areaName} · {photoViewerIndex + 1}/{viewerPhotos.length}
              </span>
              <button
                onClick={() => {
                  setPhotoDeleteConfirm({ type: 'single', roomIndex: photoViewerRoom, photoIndex: photoViewerIndex });
                }}
                className="px-3 py-2 rounded-xl text-sm font-bold bg-white/20 active:bg-white/30 backdrop-blur-md text-red-400"
                data-testid="button-viewer-delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 relative flex items-center justify-center overflow-hidden min-h-0">
              <RoomPhotoAnnotated photo={currentPhoto} areaName={areaName} />
              {viewerPhotos.length > 1 && photoViewerIndex > 0 && (
                <button
                  onClick={() => setPhotoViewerIndex(photoViewerIndex - 1)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 text-white flex items-center justify-center active:bg-black/60 backdrop-blur-sm"
                  data-testid="button-viewer-prev"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}
              {viewerPhotos.length > 1 && photoViewerIndex < viewerPhotos.length - 1 && (
                <button
                  onClick={() => setPhotoViewerIndex(photoViewerIndex + 1)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 text-white flex items-center justify-center active:bg-black/60 backdrop-blur-sm"
                  data-testid="button-viewer-next"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              )}
            </div>

            <div
              className="shrink-0 bg-black/80 px-4"
              style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom, 12px))', paddingTop: '8px' }}
            >
              <p className="text-xs text-white/60 text-center">
                {new Date(currentPhoto.timestamp).toLocaleDateString()} · {new Date(currentPhoto.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>,
          document.body
        );
      })()}
    </div>
    <Dialog open={showRateModal} onOpenChange={setShowRateModal}>
      <DialogContent className="z-[10002] max-w-sm" overlayClassName="z-[10002]" data-testid="dialog-edit-sell-rate">
        <DialogHeader>
          <DialogTitle>Edit Hourly Sell Rate</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="rounded-md border bg-muted/40 p-3 space-y-2">
            <div>
              <div className="text-xs text-muted-foreground">Current rate on this estimate</div>
              <div className="text-lg font-semibold tabular-nums" data-testid="text-current-sell-rate">
                ${effectiveSellRate.toFixed(2)}/hr
              </div>
              {sellRateSnapshot != null && sellRateSnapshot > 0 && rateOverride == null && (
                <div className="text-[11px] text-muted-foreground mt-1">
                  Locked from when this estimate was created.
                </div>
              )}
              {rateOverride != null && (
                <div className="text-[11px] text-muted-foreground mt-1">
                  Manually overridden for this estimate.
                </div>
              )}
            </div>
            {financialData?.settings?.sellRatePerHour != null && financialData.settings.sellRatePerHour > 0 && (
              <div className="pt-2 border-t border-border/50">
                <div className="text-xs text-muted-foreground">Company default rate (for reference)</div>
                <div className="text-sm font-medium tabular-nums" data-testid="text-company-sell-rate">
                  ${financialData.settings.sellRatePerHour.toFixed(2)}/hr
                </div>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">New hourly rate</label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">$</span>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={rateModalInput}
                onChange={(e) => setRateModalInput(e.target.value)}
                placeholder="80.00"
                data-testid="input-new-sell-rate"
                autoFocus
              />
              <span className="text-sm text-muted-foreground">/hr</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              This only changes the rate for this estimate. Your default rate in Settings stays the same.
            </p>
          </div>
        </div>
        <DialogFooter className="gap-2">
          {rateOverride != null && (
            <Button
              variant="ghost"
              onClick={() => setShowResetRateConfirm(true)}
              data-testid="button-reset-sell-rate"
            >
              Reset to original
            </Button>
          )}
          <Button variant="outline" onClick={() => setShowRateModal(false)} data-testid="button-cancel-sell-rate">
            Cancel
          </Button>
          <Button
            onClick={() => {
              const v = parseFloat(rateModalInput);
              if (!isNaN(v) && v > 0) {
                setRateOverride(v);
                setShowRateModal(false);
              }
            }}
            data-testid="button-save-sell-rate"
            data-mutating="true"
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <AlertDialog open={showResetRateConfirm} onOpenChange={setShowResetRateConfirm}>
      <AlertDialogContent className="z-[10003]" overlayClassName="z-[10003]">
        <AlertDialogHeader>
          <AlertDialogTitle>Reset to original rate?</AlertDialogTitle>
          <AlertDialogDescription>
            This estimate will go back to its original rate of{' '}
            <span className="font-semibold">
              ${(sellRateSnapshot && sellRateSnapshot > 0
                ? sellRateSnapshot
                : (financialData?.settings?.sellRatePerHour || 0)
              ).toFixed(2)}/hr
            </span>
            . All room totals, hours and line item prices will recalculate. Your manual override of{' '}
            <span className="font-semibold">${(rateOverride || 0).toFixed(2)}/hr</span> will be removed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="button-cancel-reset-sell-rate">Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              setRateOverride(null);
              setShowResetRateConfirm(false);
              setShowRateModal(false);
            }}
            data-testid="button-confirm-reset-sell-rate"
          >
            Yes, reset
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
