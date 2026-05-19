import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Loader2, Plus, Trash2, Package, Layers, Save, Settings2, Clock, DollarSign, Droplets, Tag, Star, Ruler, Sparkles, Zap, Upload, Download, Copy, ChevronDown, ChevronRight, Paintbrush, AlertTriangle, Calculator, Users, ArrowRight, Check, Play, Square, Timer, Pause, RotateCcw, Pencil, X, MoreVertical, Crown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger, PopoverClose } from "@/components/ui/popover";
import type { Material, Surface, ProductionCalculator, TeamMember } from "@shared/schema";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useSubscription } from "@/hooks/use-subscription";
import { useIsNativeApp } from "@/hooks/use-ios-app";
import { FeatureTipBanner } from "@/components/FeatureTipBanner";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

const DEFAULT_SURFACES = [
  { surfaceName: "Walls", unit: "sqft", productionRateUnitsPerLaborHour: 200, defaultCoats: 2, rateCategory: "Walls", estimateType: "Residential Interior" },
  { surfaceName: "Ceiling", unit: "sqft", productionRateUnitsPerLaborHour: 250, defaultCoats: 2, rateCategory: "Ceilings", estimateType: "Residential Interior" },
  { surfaceName: "Baseboard", unit: "lf", productionRateUnitsPerLaborHour: 35, defaultCoats: 2, rateCategory: "Trim", estimateType: "Residential Interior" },
  { surfaceName: "Crown Molding", unit: "lf", productionRateUnitsPerLaborHour: 25, defaultCoats: 2, rateCategory: "Trim", estimateType: "Residential Interior" },
  { surfaceName: "Chair Rail", unit: "lf", productionRateUnitsPerLaborHour: 30, defaultCoats: 2, rateCategory: "Trim", estimateType: "Residential Interior" },
  { surfaceName: "Door Casing", unit: "lf", productionRateUnitsPerLaborHour: 25, defaultCoats: 2, rateCategory: "Trim", estimateType: "Residential Interior" },
  { surfaceName: "Window Casing", unit: "lf", productionRateUnitsPerLaborHour: 25, defaultCoats: 2, rateCategory: "Trim", estimateType: "Residential Interior" },
  { surfaceName: "Doors", unit: "each", productionRateUnitsPerLaborHour: 1.5, defaultCoats: 2, rateCategory: "Doors & Windows", estimateType: "Residential Interior" },
  { surfaceName: "Cabinets", unit: "lf", productionRateUnitsPerLaborHour: 8, defaultCoats: 2, rateCategory: "Specialty", estimateType: "Residential Interior" },
  { surfaceName: "Staircase / Railing", unit: "lf", productionRateUnitsPerLaborHour: 12, defaultCoats: 2, rateCategory: "Specialty", estimateType: "Residential Interior" },
  { surfaceName: "Accent Wall", unit: "sqft", productionRateUnitsPerLaborHour: 150, defaultCoats: 2, rateCategory: "Walls", estimateType: "Residential Interior" },
  { surfaceName: "Closet Interior", unit: "sqft", productionRateUnitsPerLaborHour: 180, defaultCoats: 2, rateCategory: "Walls", estimateType: "Residential Interior" },

  { surfaceName: "Exterior Walls / Siding", unit: "sqft", productionRateUnitsPerLaborHour: 150, defaultCoats: 2, rateCategory: "Walls", estimateType: "Residential Exterior" },
  { surfaceName: "Fascia", unit: "lf", productionRateUnitsPerLaborHour: 30, defaultCoats: 2, rateCategory: "Trim", estimateType: "Residential Exterior" },
  { surfaceName: "Soffit", unit: "sqft", productionRateUnitsPerLaborHour: 120, defaultCoats: 2, rateCategory: "Trim", estimateType: "Residential Exterior" },
  { surfaceName: "Exterior Trim", unit: "lf", productionRateUnitsPerLaborHour: 25, defaultCoats: 2, rateCategory: "Trim", estimateType: "Residential Exterior" },
  { surfaceName: "Shutters", unit: "each", productionRateUnitsPerLaborHour: 1, defaultCoats: 2, rateCategory: "Doors & Windows", estimateType: "Residential Exterior" },
  { surfaceName: "Front Door", unit: "each", productionRateUnitsPerLaborHour: 1.2, defaultCoats: 2, rateCategory: "Doors & Windows", estimateType: "Residential Exterior" },
  { surfaceName: "Garage Door", unit: "each", productionRateUnitsPerLaborHour: 0.5, defaultCoats: 2, rateCategory: "Doors & Windows", estimateType: "Residential Exterior" },
  { surfaceName: "Deck / Fence", unit: "sqft", productionRateUnitsPerLaborHour: 100, defaultCoats: 2, rateCategory: "Specialty", estimateType: "Residential Exterior" },
  { surfaceName: "Porch Ceiling", unit: "sqft", productionRateUnitsPerLaborHour: 200, defaultCoats: 2, rateCategory: "Ceilings", estimateType: "Residential Exterior" },
  { surfaceName: "Columns / Posts", unit: "each", productionRateUnitsPerLaborHour: 1.5, defaultCoats: 2, rateCategory: "Specialty", estimateType: "Residential Exterior" },

  { surfaceName: "Walls", unit: "sqft", productionRateUnitsPerLaborHour: 250, defaultCoats: 2, rateCategory: "Walls", estimateType: "Commercial Interior" },
  { surfaceName: "Ceiling", unit: "sqft", productionRateUnitsPerLaborHour: 300, defaultCoats: 2, rateCategory: "Ceilings", estimateType: "Commercial Interior" },
  { surfaceName: "Doors", unit: "each", productionRateUnitsPerLaborHour: 1.5, defaultCoats: 2, rateCategory: "Doors", estimateType: "Commercial Interior" },
  { surfaceName: "Door Frames", unit: "lf", productionRateUnitsPerLaborHour: 30, defaultCoats: 2, rateCategory: "Trim", estimateType: "Commercial Interior" },
  { surfaceName: "Baseboard", unit: "lf", productionRateUnitsPerLaborHour: 40, defaultCoats: 2, rateCategory: "Trim", estimateType: "Commercial Interior" },
  { surfaceName: "Accent Wall", unit: "sqft", productionRateUnitsPerLaborHour: 200, defaultCoats: 2, rateCategory: "Walls", estimateType: "Commercial Interior" },

  { surfaceName: "Exterior Walls", unit: "sqft", productionRateUnitsPerLaborHour: 180, defaultCoats: 2, rateCategory: "Walls", estimateType: "Commercial Exterior" },
  { surfaceName: "Fascia", unit: "lf", productionRateUnitsPerLaborHour: 30, defaultCoats: 2, rateCategory: "Trim", estimateType: "Commercial Exterior" },
  { surfaceName: "Metal Railing", unit: "lf", productionRateUnitsPerLaborHour: 15, defaultCoats: 2, rateCategory: "Specialty", estimateType: "Commercial Exterior" },
  { surfaceName: "Exterior Doors", unit: "each", productionRateUnitsPerLaborHour: 1.2, defaultCoats: 2, rateCategory: "Doors", estimateType: "Commercial Exterior" },
  { surfaceName: "Bollards", unit: "each", productionRateUnitsPerLaborHour: 2, defaultCoats: 2, rateCategory: "Specialty", estimateType: "Commercial Exterior" },
  { surfaceName: "Exterior Trim", unit: "lf", productionRateUnitsPerLaborHour: 25, defaultCoats: 2, rateCategory: "Trim", estimateType: "Commercial Exterior" },

  { surfaceName: "Hardwood Floor", unit: "sqft", productionRateUnitsPerLaborHour: 40, defaultCoats: 1, rateCategory: "Hardwood", estimateType: "Flooring Installation", pricingMode: "per_unit", pricePerUnit: 6 },
  { surfaceName: "Sanding", unit: "sqft", productionRateUnitsPerLaborHour: 80, defaultCoats: 1, rateCategory: "Hardwood", estimateType: "Flooring Installation", pricingMode: "per_unit", pricePerUnit: 2 },
  { surfaceName: "Polyurethane / Finish", unit: "sqft", productionRateUnitsPerLaborHour: 200, defaultCoats: 2, rateCategory: "Hardwood", estimateType: "Flooring Installation", pricingMode: "per_unit", pricePerUnit: 1.50 },
  { surfaceName: "Laminate Floor", unit: "sqft", productionRateUnitsPerLaborHour: 60, defaultCoats: 1, rateCategory: "Laminate", estimateType: "Flooring Installation", pricingMode: "per_unit", pricePerUnit: 4 },
  { surfaceName: "Underlayment", unit: "sqft", productionRateUnitsPerLaborHour: 100, defaultCoats: 1, rateCategory: "Prep", estimateType: "Flooring Installation", pricingMode: "per_unit", pricePerUnit: 1 },
  { surfaceName: "Carpet Removal", unit: "sqft", productionRateUnitsPerLaborHour: 100, defaultCoats: 1, rateCategory: "Demo", estimateType: "Flooring Installation", pricingMode: "per_unit", pricePerUnit: 1.50 },
];

const DEFAULT_MATERIALS = [
  { materialName: "Regal Select Interior", brand: "Benjamin Moore", type: "paint", finish: "Matte/Eggshell/Satin", coverageSqftPerGallon: 375, costPerUnit: 78, wastePercentage: 0.10 },
  { materialName: "Aura Interior", brand: "Benjamin Moore", type: "paint", finish: "Matte/Eggshell/Satin/Semi-Gloss", coverageSqftPerGallon: 350, costPerUnit: 95, wastePercentage: 0.10 },
  { materialName: "Ben Interior", brand: "Benjamin Moore", type: "paint", finish: "Flat/Eggshell/Semi-Gloss", coverageSqftPerGallon: 375, costPerUnit: 60, wastePercentage: 0.10 },
  { materialName: "Natura Interior", brand: "Benjamin Moore", type: "paint", finish: "Flat/Eggshell/Semi-Gloss", coverageSqftPerGallon: 375, costPerUnit: 80, wastePercentage: 0.10 },
  { materialName: "Advance Interior", brand: "Benjamin Moore", type: "paint", finish: "Satin/Semi-Gloss/High Gloss", coverageSqftPerGallon: 350, costPerUnit: 85, wastePercentage: 0.10 },
  { materialName: "Regal Select Exterior", brand: "Benjamin Moore", type: "paint", finish: "Flat/Low Lustre/Soft Gloss", coverageSqftPerGallon: 350, costPerUnit: 78, wastePercentage: 0.10 },
  { materialName: "Aura Exterior", brand: "Benjamin Moore", type: "paint", finish: "Flat/Low Lustre/Satin", coverageSqftPerGallon: 350, costPerUnit: 95, wastePercentage: 0.10 },
  { materialName: "Ben Exterior", brand: "Benjamin Moore", type: "paint", finish: "Flat/Low Lustre", coverageSqftPerGallon: 375, costPerUnit: 55, wastePercentage: 0.10 },
  { materialName: "Arborcoat Exterior Stain", brand: "Benjamin Moore", type: "paint", finish: "Solid/Semi-Solid/Semi-Transparent", coverageSqftPerGallon: 300, costPerUnit: 75, wastePercentage: 0.10 },
  { materialName: "Cabinet Coat", brand: "Benjamin Moore", type: "paint", finish: "Satin", coverageSqftPerGallon: 350, costPerUnit: 80, wastePercentage: 0.10 },
  { materialName: "Scuff-X Interior", brand: "Benjamin Moore", type: "paint", finish: "Eggshell/Satin", coverageSqftPerGallon: 375, costPerUnit: 82, wastePercentage: 0.10 },
  { materialName: "Ultra Spec 500", brand: "Benjamin Moore", type: "paint", finish: "Flat/Eggshell/Semi-Gloss", coverageSqftPerGallon: 400, costPerUnit: 48, wastePercentage: 0.10 },
  { materialName: "Fresh Start Primer", brand: "Benjamin Moore", type: "primer", finish: null, coverageSqftPerGallon: 300, costPerUnit: 55, wastePercentage: 0.10 },
  { materialName: "Stix Bonding Primer", brand: "Benjamin Moore", type: "primer", finish: null, coverageSqftPerGallon: 300, costPerUnit: 60, wastePercentage: 0.10 },
  { materialName: "Ultra Spec Masonry Primer", brand: "Benjamin Moore", type: "primer", finish: null, coverageSqftPerGallon: 250, costPerUnit: 52, wastePercentage: 0.10 },

  { materialName: "Emerald Interior", brand: "Sherwin-Williams", type: "paint", finish: "Flat/Matte/Satin/Semi-Gloss", coverageSqftPerGallon: 350, costPerUnit: 95, wastePercentage: 0.10 },
  { materialName: "Duration Home Interior", brand: "Sherwin-Williams", type: "paint", finish: "Flat/Matte/Satin/Semi-Gloss", coverageSqftPerGallon: 350, costPerUnit: 85, wastePercentage: 0.10 },
  { materialName: "SuperPaint Interior", brand: "Sherwin-Williams", type: "paint", finish: "Flat/Satin/Semi-Gloss", coverageSqftPerGallon: 375, costPerUnit: 65, wastePercentage: 0.10 },
  { materialName: "Cashmere Interior", brand: "Sherwin-Williams", type: "paint", finish: "Flat/Low Lustre/Medium Lustre", coverageSqftPerGallon: 375, costPerUnit: 72, wastePercentage: 0.10 },
  { materialName: "Harmony Interior", brand: "Sherwin-Williams", type: "paint", finish: "Flat/Eg-Shel/Semi-Gloss", coverageSqftPerGallon: 375, costPerUnit: 68, wastePercentage: 0.10 },
  { materialName: "ProMar 200", brand: "Sherwin-Williams", type: "paint", finish: "Flat/Eg-Shel/Semi-Gloss", coverageSqftPerGallon: 400, costPerUnit: 42, wastePercentage: 0.10 },
  { materialName: "ProMar 400", brand: "Sherwin-Williams", type: "paint", finish: "Flat/Eg-Shel", coverageSqftPerGallon: 400, costPerUnit: 32, wastePercentage: 0.10 },
  { materialName: "Emerald Urethane Trim Enamel", brand: "Sherwin-Williams", type: "paint", finish: "Satin/Semi-Gloss/Gloss", coverageSqftPerGallon: 350, costPerUnit: 95, wastePercentage: 0.10 },
  { materialName: "Emerald Exterior", brand: "Sherwin-Williams", type: "paint", finish: "Flat/Satin/Gloss", coverageSqftPerGallon: 350, costPerUnit: 95, wastePercentage: 0.10 },
  { materialName: "Duration Exterior", brand: "Sherwin-Williams", type: "paint", finish: "Flat/Satin/Gloss", coverageSqftPerGallon: 350, costPerUnit: 85, wastePercentage: 0.10 },
  { materialName: "SuperPaint Exterior", brand: "Sherwin-Williams", type: "paint", finish: "Flat/Satin/Gloss", coverageSqftPerGallon: 375, costPerUnit: 65, wastePercentage: 0.10 },
  { materialName: "A-100 Exterior", brand: "Sherwin-Williams", type: "paint", finish: "Flat/Satin/Gloss", coverageSqftPerGallon: 375, costPerUnit: 52, wastePercentage: 0.10 },
  { materialName: "WoodScapes Exterior Stain", brand: "Sherwin-Williams", type: "paint", finish: "Solid/Semi-Transparent", coverageSqftPerGallon: 300, costPerUnit: 65, wastePercentage: 0.10 },
  { materialName: "Multi-Purpose Primer", brand: "Sherwin-Williams", type: "primer", finish: null, coverageSqftPerGallon: 300, costPerUnit: 50, wastePercentage: 0.10 },
  { materialName: "Extreme Bond Primer", brand: "Sherwin-Williams", type: "primer", finish: null, coverageSqftPerGallon: 300, costPerUnit: 58, wastePercentage: 0.10 },
  { materialName: "PrimeRx Peel Bonding Primer", brand: "Sherwin-Williams", type: "primer", finish: null, coverageSqftPerGallon: 275, costPerUnit: 55, wastePercentage: 0.10 },

  { materialName: "Caulk (tube)", brand: "Generic", type: "sundries", finish: null, coverageSqftPerGallon: null, costPerUnit: 4, wastePercentage: 0 },
  { materialName: "Plastic & Masking Materials", brand: "Generic", type: "sundries", finish: null, coverageSqftPerGallon: null, costPerUnit: 25, wastePercentage: 0 },
  { materialName: "Roller Covers", brand: "Generic", type: "sundries", finish: null, coverageSqftPerGallon: null, costPerUnit: 8, wastePercentage: 0 },
  { materialName: "Sandpaper & Prep Materials", brand: "Generic", type: "sundries", finish: null, coverageSqftPerGallon: null, costPerUnit: 15, wastePercentage: 0 },
  { materialName: "Painter's Tape", brand: "Generic", type: "sundries", finish: null, coverageSqftPerGallon: null, costPerUnit: 7, wastePercentage: 0 },
  { materialName: "Drop Cloths", brand: "Generic", type: "sundries", finish: null, coverageSqftPerGallon: null, costPerUnit: 12, wastePercentage: 0 },
  { materialName: "Wood Filler / Spackle", brand: "Generic", type: "sundries", finish: null, coverageSqftPerGallon: null, costPerUnit: 10, wastePercentage: 0 },
];

const UNIT_LABELS: Record<string, string> = { sqft: "sq ft", lf: "linear ft", each: "each" };

const ordinal = (n: number): string => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

type FilterType = "all" | "paint" | "primer" | "sundries";

function parseCSV(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          currentField += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        currentField += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ',') {
        currentRow.push(currentField.trim());
        currentField = '';
        i++;
      } else if (ch === '\r' || ch === '\n') {
        currentRow.push(currentField.trim());
        currentField = '';
        if (currentRow.some(f => f !== '')) {
          rows.push(currentRow);
        }
        currentRow = [];
        if (ch === '\r' && i + 1 < text.length && text[i + 1] === '\n') {
          i += 2;
        } else {
          i++;
        }
      } else {
        currentField += ch;
        i++;
      }
    }
  }

  if (currentField !== '' || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some(f => f !== '')) {
      rows.push(currentRow);
    }
  }

  if (rows.length < 2) return [];
  const headers = rows[0];
  return rows.slice(1).map(values => {
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = values[idx] || ''; });
    return row;
  });
}

function downloadCSV(filename: string, headers: string[], rows: string[][]) {
  const escape = (v: string) => v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
  const csv = [headers.join(','), ...rows.map(r => r.map(escape).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

interface FinancialSettingsData {
  settings: {
    defaultShowLaborHrs?: boolean;
    defaultShowLaborPrice?: boolean;
    defaultShowMaterialQty?: boolean;
    defaultShowMaterialPrice?: boolean;
    defaultShowSurfaceDetails?: boolean;
    defaultSameColorAllAreas?: boolean;
  };
}

function DisplayDefaultToggle({ active, icon: Icon, label, onChange, testId }: {
  active: boolean;
  icon: any;
  label: string;
  onChange: (v: boolean) => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!active)}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors border ${
        active
          ? "bg-primary/10 text-primary border-primary/30"
          : "bg-muted/40 text-muted-foreground/50 border-transparent line-through"
      }`}
      data-testid={testId}
    >
      <Icon className="w-3.5 h-3.5" />
      <span>{label}</span>
    </button>
  );
}

function DocumentDefaultsCard() {
  const { toast } = useToast();
  const { data: financialData, isLoading } = useQuery<FinancialSettingsData>({
    queryKey: ["/api/financial-settings"],
  });

  const [showLaborHrs, setShowLaborHrs] = useState(true);
  const [showLaborPrice, setShowLaborPrice] = useState(true);
  const [showMaterialQty, setShowMaterialQty] = useState(true);
  const [showMaterialPrice, setShowMaterialPrice] = useState(true);
  const [showSurfaceDetails, setShowSurfaceDetails] = useState(true);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (financialData?.settings) {
      const s = financialData.settings;
      setShowLaborHrs(s.defaultShowLaborHrs ?? true);
      setShowLaborPrice(s.defaultShowLaborPrice ?? true);
      setShowMaterialQty(s.defaultShowMaterialQty ?? true);
      setShowMaterialPrice(s.defaultShowMaterialPrice ?? true);
      setShowSurfaceDetails(s.defaultShowSurfaceDetails ?? true);
      setDirty(false);
    }
  }, [financialData]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", "/api/financial-settings", {
        defaultShowLaborHrs: showLaborHrs,
        defaultShowLaborPrice: showLaborPrice,
        defaultShowMaterialQty: showMaterialQty,
        defaultShowMaterialPrice: showMaterialPrice,
        defaultShowSurfaceDetails: showSurfaceDetails,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/financial-settings"] });
      setDirty(false);
      toast({ title: "Document defaults saved" });
    },
    onError: () => toast({ title: "Failed to save defaults", variant: "destructive" }),
  });

  const toggle = (setter: (v: boolean) => void, current: boolean) => {
    setter(!current);
    setDirty(true);
  };

  if (isLoading && !financialData) return null;

  return (
    <Card data-testid="card-document-defaults">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <div className="flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">Document Defaults</CardTitle>
          <InfoTooltip text="These settings control what information shows by default on new estimates and proposals. You can still override them per document when building an estimate." />
        </div>
        <Button
          size="sm"
          onClick={() => saveMutation.mutate()}
          disabled={!dirty || saveMutation.isPending}
          data-testid="button-save-defaults"
        >
          {saveMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
          Save
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <span className="text-xs text-muted-foreground font-medium">Show on customer documents:</span>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <DisplayDefaultToggle
              active={showLaborHrs}
              icon={Clock}
              label="Labor Hrs"
              onChange={() => toggle(setShowLaborHrs, showLaborHrs)}
              testId="toggle-default-labor-hrs"
            />
            <DisplayDefaultToggle
              active={showLaborPrice}
              icon={DollarSign}
              label="Labor Price"
              onChange={() => toggle(setShowLaborPrice, showLaborPrice)}
              testId="toggle-default-labor-price"
            />
            <DisplayDefaultToggle
              active={showMaterialQty}
              icon={Droplets}
              label="Material Qty"
              onChange={() => toggle(setShowMaterialQty, showMaterialQty)}
              testId="toggle-default-material-qty"
            />
            <DisplayDefaultToggle
              active={showMaterialPrice}
              icon={Tag}
              label="Material Price"
              onChange={() => toggle(setShowMaterialPrice, showMaterialPrice)}
              testId="toggle-default-material-price"
            />
            <DisplayDefaultToggle
              active={showSurfaceDetails}
              icon={Ruler}
              label="Surface Details"
              onChange={() => toggle(setShowSurfaceDetails, showSurfaceDetails)}
              testId="toggle-default-surface-details"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ProductionRates() {
  const { hasFuseAi, isLoading } = useSubscription();
  const isNativeApp = useIsNativeApp();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!hasFuseAi) {
    return (
      <div className="p-4 sm:p-6 max-w-3xl mx-auto">
        <Card className="border-dashed" data-testid="card-fuse-ai-gate">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="p-3 rounded-md bg-purple-100 dark:bg-purple-900/30 mb-4">
              <Sparkles className="w-10 h-10 text-purple-600 dark:text-purple-400" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Services requires the Elite plan</h2>
            <p className="text-sm text-muted-foreground max-w-md mb-6">
              Services is part of FuseAI, which is included with the Elite plan. Upgrade to unlock AI-powered proposals, service-based estimation, and more.
            </p>
            {!isNativeApp && (
              <Link href="/billing">
                <Button size="lg" data-testid="button-go-elite">
                  <Crown className="w-4 h-4 mr-2" />
                  Upgrade to Elite
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      <FeatureTipBanner
        id="production-rates"
        title="Service Rate Estimator"
        description="Set up your surfaces, materials, and labor rates to generate accurate estimates."
      />
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Services</h1>
          <Badge variant="secondary" className="text-xs gap-1" data-testid="badge-fuseai-production">
            <Sparkles className="w-3 h-3" />
            FuseAI
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-1">Configure your services, surface rates, and material pricing</p>
      </div>

      <DocumentDefaultsCard />

      <Tabs defaultValue="surfaces">
        <TabsList data-testid="tabs-list">
          <TabsTrigger value="surfaces" data-testid="tab-surfaces">
            <Layers className="w-4 h-4 mr-2" />
            Services
          </TabsTrigger>
          <TabsTrigger value="materials" data-testid="tab-materials">
            <Package className="w-4 h-4 mr-2" />
            Materials
          </TabsTrigger>
          <TabsTrigger value="calculators" data-testid="tab-calculators">
            <Calculator className="w-4 h-4 mr-2" />
            Calculators
          </TabsTrigger>
        </TabsList>

        <TabsContent value="surfaces" className="mt-4">
          <SurfacesTab />
        </TabsContent>

        <TabsContent value="materials" className="mt-4">
          <MaterialsTab />
        </TabsContent>

        <TabsContent value="calculators" className="mt-4">
          <CalculatorsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

const DEFAULT_ESTIMATE_TYPES = ["Residential Interior", "Residential Exterior", "Commercial Interior", "Commercial Exterior", "Kitchen Cabinets", "Flooring Installation"];
const RATE_CATEGORIES = ["Prep Work", "Walls", "Ceilings", "Trim", "Baseboards", "Doors", "Windows", "Cabinets", "Closets", "Misc"];
const SUBSTRATE_PRESETS = ["Drywall", "Wood", "Brick", "Stucco", "Concrete", "Metal", "Plaster", "MDF", "PVC/Vinyl", "Hardie Board", "Fiber Cement", "T1-11", "Cedar", "Composite"];

function SurfacesTab() {
  const { toast } = useToast();
  const defaultsPopulatedRef = useRef(false);
  const [activeEstimateType, setActiveEstimateType] = useState("Residential Interior");
  const [addTabOpen, setAddTabOpen] = useState(false);
  const [newTabName, setNewTabName] = useState("");
  const [newTabSurfaces, setNewTabSurfaces] = useState<string[]>([""]);
  const [newTabSurfaceInput, setNewTabSurfaceInput] = useState("");
  const [newTabSectionType, setNewTabSectionType] = useState<'room' | 'exterior' | 'area' | 'cabinets'>('area');
  const [copyFromOpen, setCopyFromOpen] = useState(false);
  const [copyFromSource, setCopyFromSource] = useState("");
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [renameServiceTarget, setRenameServiceTarget] = useState<string | null>(null);
  const [renameServiceValue, setRenameServiceValue] = useState("");
  const [deleteServiceTarget, setDeleteServiceTarget] = useState<string | null>(null);
  const [renameCategoryTarget, setRenameCategoryTarget] = useState<string | null>(null);
  const [renameCategoryValue, setRenameCategoryValue] = useState("");
  const [deleteCategoryTarget, setDeleteCategoryTarget] = useState<string | null>(null);
  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [newCategoryValue, setNewCategoryValue] = useState("");
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [newCategoryInPicker, setNewCategoryInPicker] = useState("");

  interface CoatRate {
    rate: number;
    materialId: number | null;
  }

  interface LocalSurface {
    id?: number;
    surfaceName: string;
    surfaceKey: string;
    unit: string;
    productionRateUnitsPerLaborHour: number;
    defaultCoats: number;
    defaultMaterialId: number | null;
    defaultPrimerCoats: number;
    defaultPrimerMaterialId: number | null;
    estimateType: string;
    rateCategory: string | null;
    areaDescription: string | null;
    surfaceDescription: string | null;
    crewNote: string | null;
    coatRates: CoatRate[];
    primerRates: CoatRate[];
    sqftPerUnit: number | null;
    pricingMode: string;
    pricePerUnit: number | null;
    coatsLabel: string | null;
    usePrimer: boolean;
    usePaint: boolean;
  }

  const [localSurfaces, setLocalSurfaces] = useState<LocalSurface[]>([]);

  const { data: surfaces, isLoading } = useQuery<Surface[]>({
    queryKey: ["/api/surfaces"],
    staleTime: 10 * 60 * 1000,
  });

  const { data: materials } = useQuery<Material[]>({
    queryKey: ["/api/materials"],
    staleTime: 10 * 60 * 1000,
  });

  const { data: estimateTypes } = useQuery<string[]>({
    queryKey: ["/api/surfaces/estimate-types"],
    staleTime: 10 * 60 * 1000,
  });

  const { data: financialData } = useQuery<any>({
    queryKey: ["/api/financial-settings"],
    staleTime: 10 * 60 * 1000,
  });

  const allTabs = [...new Set([...DEFAULT_ESTIMATE_TYPES, ...(estimateTypes || [])])];

  const activeMaterials = (materials || []).filter(m => m.active);

  useEffect(() => {
    if (surfaces) {
      setLocalSurfaces(surfaces.map(s => {
        const coatRates: CoatRate[] = (s.coatRates as CoatRate[] | null)?.length
          ? (s.coatRates as CoatRate[])
          : Array.from({ length: Math.max(1, s.defaultCoats ?? 1) }, () => ({ rate: s.productionRateUnitsPerLaborHour, materialId: s.defaultMaterialId ?? null }));
        const primerRates: CoatRate[] = (s.primerRates as CoatRate[] | null)?.length
          ? (s.primerRates as CoatRate[])
          : (s.defaultPrimerCoats ?? 0) > 0
            ? Array.from({ length: s.defaultPrimerCoats ?? 1 }, () => ({ rate: s.productionRateUnitsPerLaborHour, materialId: s.defaultPrimerMaterialId ?? null }))
            : [];
        return {
          id: s.id,
          surfaceName: s.surfaceName,
          surfaceKey: s.surfaceKey,
          unit: s.unit,
          productionRateUnitsPerLaborHour: s.productionRateUnitsPerLaborHour,
          defaultCoats: s.defaultCoats,
          defaultMaterialId: s.defaultMaterialId ?? null,
          defaultPrimerCoats: s.defaultPrimerCoats ?? 0,
          defaultPrimerMaterialId: s.defaultPrimerMaterialId ?? null,
          estimateType: s.estimateType || "Residential Interior",
          rateCategory: s.rateCategory ?? null,
          areaDescription: s.areaDescription ?? null,
          surfaceDescription: s.surfaceDescription ?? null,
          crewNote: s.crewNote ?? null,
          coatRates,
          primerRates,
          sqftPerUnit: s.sqftPerUnit ?? null,
          pricingMode: (s as any).pricingMode || 'production_rate',
          pricePerUnit: (s as any).pricePerUnit ?? null,
          coatsLabel: (s as any).coatsLabel ?? null,
          usePrimer: s.usePrimer ?? true,
          usePaint: (s as any).usePaint ?? true,
        };
      }));
    }
  }, [surfaces]);

  const filteredSurfaces = localSurfaces.filter(s => s.estimateType === activeEstimateType);

  const customCategoriesForActive: string[] = ((financialData as any)?.settings?.customCategoriesByService || {})[activeEstimateType] || [];

  const groupedSurfaces = (() => {
    const groups: Record<string, { surfaces: LocalSurface[] }> = {};
    filteredSurfaces.forEach(s => {
      const cat = s.rateCategory || "General";
      if (!groups[cat]) groups[cat] = { surfaces: [] };
      groups[cat].surfaces.push(s);
    });
    customCategoriesForActive.forEach(c => { if (!groups[c]) groups[c] = { surfaces: [] }; });
    const ordered = RATE_CATEGORIES.filter(c => groups[c]);
    const remaining = Object.keys(groups).filter(c => !RATE_CATEGORIES.includes(c) && c !== "General");
    const result = [...ordered, ...remaining];
    if (groups["General"]) result.push("General");
    return result.map(cat => ({ category: cat, ...groups[cat] }));
  })();

  const allCategoryNames = groupedSurfaces.map(g => g.category);
  const hasCategories = filteredSurfaces.some(s => s.rateCategory) || customCategoriesForActive.length > 0;

  const populateDefaults = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/surfaces/bulk", { surfaces: DEFAULT_SURFACES });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/surfaces"] });
      queryClient.invalidateQueries({ queryKey: ["/api/surfaces/estimate-types"] });
      toast({ title: "Default surfaces loaded" });
    },
  });

  useEffect(() => {
    if (surfaces && surfaces.length === 0 && !defaultsPopulatedRef.current) {
      defaultsPopulatedRef.current = true;
      populateDefaults.mutate();
    }
  }, [surfaces]);

  const copyFromMutation = useMutation({
    mutationFn: async ({ from, to }: { from: string; to: string }) => {
      const res = await apiRequest("POST", "/api/surfaces/copy-from", { fromEstimateType: from, toEstimateType: to });
      return res.json();
    },
    onSuccess: (data: { created: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/surfaces"] });
      queryClient.invalidateQueries({ queryKey: ["/api/surfaces/estimate-types"] });
      setCopyFromOpen(false);
      toast({ title: "Surfaces copied", description: `${data.created} surfaces duplicated. Adjust rates as needed.` });
    },
    onError: () => toast({ title: "Failed to copy surfaces", variant: "destructive" }),
  });

  const createSurface = useMutation({
    mutationFn: async (surface: Omit<LocalSurface, 'id'>) => {
      const res = await apiRequest("POST", "/api/surfaces", surface);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/surfaces"] });
      queryClient.invalidateQueries({ queryKey: ["/api/surfaces/estimate-types"] });
      toast({ title: "Surface created" });
    },
    onError: () => toast({ title: "Failed to create surface", variant: "destructive" }),
  });

  const updateSurface = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Partial<LocalSurface> }) => {
      const res = await apiRequest("PUT", `/api/surfaces/${id}`, updates);
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/surfaces"] });
      toast({ title: "Surface saved" });
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  const deleteSurface = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/surfaces/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/surfaces"] });
      toast({ title: "Surface removed" });
    },
  });

  const renameServiceMutation = useMutation({
    mutationFn: async ({ oldName, newName }: { oldName: string; newName: string }) => {
      const res = await apiRequest("PATCH", "/api/surfaces/estimate-types/rename", { oldName, newName });
      return res.json();
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/surfaces"] });
      queryClient.invalidateQueries({ queryKey: ["/api/surfaces/estimate-types"] });
      queryClient.invalidateQueries({ queryKey: ["/api/financial-settings"] });
      if (activeEstimateType === vars.oldName) setActiveEstimateType(vars.newName);
      toast({ title: "Service renamed" });
    },
    onError: () => toast({ title: "Failed to rename service", variant: "destructive" }),
  });

  const deleteServiceMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("DELETE", `/api/surfaces/estimate-types/${encodeURIComponent(name)}`);
      return res.json();
    },
    onSuccess: (_data, name) => {
      queryClient.invalidateQueries({ queryKey: ["/api/surfaces"] });
      queryClient.invalidateQueries({ queryKey: ["/api/surfaces/estimate-types"] });
      queryClient.invalidateQueries({ queryKey: ["/api/financial-settings"] });
      if (activeEstimateType === name) setActiveEstimateType("Residential Interior");
      toast({ title: "Service deleted" });
    },
    onError: () => toast({ title: "Failed to delete service", variant: "destructive" }),
  });

  const renameCategoryMutation = useMutation({
    mutationFn: async ({ estimateType, oldCategory, newCategory }: { estimateType: string; oldCategory: string; newCategory: string }) => {
      const res = await apiRequest("PATCH", "/api/surfaces/categories/rename", { estimateType, oldCategory, newCategory });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/surfaces"] });
      queryClient.invalidateQueries({ queryKey: ["/api/financial-settings"] });
      toast({ title: "Category renamed" });
    },
    onError: () => toast({ title: "Failed to rename category", variant: "destructive" }),
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async ({ estimateType, category, mode }: { estimateType: string; category: string; mode: 'ungroup' | 'delete' }) => {
      const res = await apiRequest("DELETE", "/api/surfaces/categories", { estimateType, category, mode });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/surfaces"] });
      queryClient.invalidateQueries({ queryKey: ["/api/financial-settings"] });
      toast({ title: data?.mode === 'delete' ? "Category and surfaces deleted" : "Category removed" });
    },
    onError: () => toast({ title: "Failed to delete category", variant: "destructive" }),
  });

  const moveCategoryMutation = useMutation({
    mutationFn: async ({ id, rateCategory }: { id: number; rateCategory: string | null }) => {
      const res = await apiRequest("PUT", `/api/surfaces/${id}`, { rateCategory });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/surfaces"] });
      toast({ title: "Surface moved" });
    },
    onError: () => toast({ title: "Failed to move surface", variant: "destructive" }),
  });

  const upsertCustomCategory = useMutation({
    mutationFn: async ({ estimateType, category }: { estimateType: string; category: string }) => {
      const current = (financialData as any)?.settings?.customCategoriesByService || {};
      const list: string[] = current[estimateType] || [];
      if (list.includes(category)) return current;
      const next = { ...current, [estimateType]: [...list, category] };
      const res = await apiRequest("PUT", "/api/financial-settings", { customCategoriesByService: next });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/financial-settings"] });
      toast({ title: "Category added" });
    },
    onError: () => toast({ title: "Failed to add category", variant: "destructive" }),
  });

  const buildSavePayload = (s: LocalSurface) => {
    const coats = s.coatRates.length > 0 ? s.coatRates : [{ rate: s.productionRateUnitsPerLaborHour, materialId: s.defaultMaterialId }];
    return {
      surfaceName: s.surfaceName,
      unit: s.unit,
      productionRateUnitsPerLaborHour: coats[0]?.rate || 0,
      defaultCoats: coats.length,
      defaultMaterialId: coats[0]?.materialId ?? null,
      defaultPrimerCoats: s.primerRates.length,
      defaultPrimerMaterialId: s.primerRates[0]?.materialId ?? null,
      estimateType: s.estimateType,
      rateCategory: s.rateCategory,
      areaDescription: s.areaDescription,
      surfaceDescription: s.surfaceDescription,
      crewNote: s.crewNote,
      coatRates: coats,
      primerRates: s.primerRates,
      sqftPerUnit: s.sqftPerUnit,
      pricingMode: s.pricingMode || 'production_rate',
      pricePerUnit: s.pricePerUnit,
      coatsLabel: s.coatsLabel,
      usePrimer: s.usePrimer,
      usePaint: s.usePaint,
    };
  };

  const [surfaceModalOpen, setSurfaceModalOpen] = useState(false);
  const [editingSurface, setEditingSurface] = useState<LocalSurface | null>(null);
  const [deleteConfirmSurface, setDeleteConfirmSurface] = useState<LocalSurface | null>(null);
  const [modalSurface, setModalSurface] = useState<LocalSurface>({
    surfaceName: "", surfaceKey: "", unit: "sqft", productionRateUnitsPerLaborHour: 0,
    defaultCoats: 1, defaultMaterialId: null, defaultPrimerCoats: 0, defaultPrimerMaterialId: null,
    estimateType: activeEstimateType, rateCategory: null, areaDescription: null, surfaceDescription: null,
    crewNote: null, coatRates: [{ rate: 0, materialId: null }], primerRates: [], sqftPerUnit: null,
    pricingMode: 'production_rate', pricePerUnit: null, coatsLabel: null,
    usePrimer: activeEstimateType !== 'Flooring Installation',
    usePaint: true,
  });
  const [modalSubstrateOther, setModalSubstrateOther] = useState(false);
  const [openMaterialPicker, setOpenMaterialPicker] = useState<string | null>(null);

  const openAddSurfaceModal = () => {
    setCategoryPickerOpen(true);
    setNewCategoryInPicker("");
  };

  const proceedToSurfaceModalWithCategory = (category: string | null) => {
    setEditingSurface(null);
    setModalSubstrateOther(false);
    setModalSurface({
      surfaceName: "", surfaceKey: "", unit: "sqft", productionRateUnitsPerLaborHour: 0,
      defaultCoats: 1, defaultMaterialId: null, defaultPrimerCoats: 0, defaultPrimerMaterialId: null,
      estimateType: activeEstimateType, rateCategory: category, areaDescription: null, surfaceDescription: null,
      crewNote: null, coatRates: [{ rate: 0, materialId: null }], primerRates: [], sqftPerUnit: null,
      pricingMode: 'production_rate', pricePerUnit: null, coatsLabel: null,
      usePrimer: activeEstimateType !== 'Flooring Installation',
      usePaint: true,
    });
    setCategoryPickerOpen(false);
    setSurfaceModalOpen(true);
  };

  const openEditSurfaceModal = (s: LocalSurface) => {
    setEditingSurface(s);
    setModalSurface({ ...s, coatRates: [...s.coatRates.map(c => ({...c}))], primerRates: [...s.primerRates.map(c => ({...c}))] });
    const isPreset = SUBSTRATE_PRESETS.includes(s.surfaceDescription || "");
    setModalSubstrateOther(!!(s.surfaceDescription && !isPreset));
    setSurfaceModalOpen(true);
  };

  const handleModalSurfaceSave = () => {
    if (!modalSurface.surfaceName.trim()) {
      toast({ title: "Surface name is required", variant: "destructive" });
      return;
    }
    const payload = buildSavePayload(modalSurface);
    if (editingSurface?.id) {
      updateSurface.mutate({ id: editingSurface.id, updates: payload });
    } else {
      createSurface.mutate({
        ...payload,
        surfaceKey: modalSurface.surfaceName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''),
      });
    }
    setSurfaceModalOpen(false);
  };

  const handleDeleteSurface = (s: LocalSurface) => {
    if (s.id) {
      deleteSurface.mutate(s.id);
    }
    setDeleteConfirmSurface(null);
    setSurfaceModalOpen(false);
  };

  const updateModalField = (field: keyof LocalSurface, value: any) => {
    setModalSurface(prev => ({ ...prev, [field]: value }));
  };

  const handleModalCoatRateChange = (coatIndex: number, field: 'rate' | 'materialId', value: any) => {
    setModalSurface(prev => {
      const rates = [...prev.coatRates];
      rates[coatIndex] = { ...rates[coatIndex], [field]: value };
      return { ...prev, coatRates: rates };
    });
  };

  const handleModalAddCoat = () => {
    setModalSurface(prev => {
      const lastMaterial = prev.coatRates.length > 0 ? prev.coatRates[prev.coatRates.length - 1].materialId : null;
      return { ...prev, coatRates: [...prev.coatRates, { rate: 0, materialId: lastMaterial }] };
    });
  };

  const handleModalRemoveCoat = (coatIndex: number) => {
    setModalSurface(prev => {
      const rates = prev.coatRates.filter((_, i) => i !== coatIndex);
      return { ...prev, coatRates: rates.length === 0 ? [{ rate: 0, materialId: null }] : rates };
    });
  };

  const handleModalPrimerRateChange = (coatIndex: number, field: 'rate' | 'materialId', value: any) => {
    setModalSurface(prev => {
      const rates = [...prev.primerRates];
      rates[coatIndex] = { ...rates[coatIndex], [field]: value };
      return { ...prev, primerRates: rates };
    });
  };

  const handleModalAddPrimer = () => {
    setModalSurface(prev => {
      const lastMaterial = prev.primerRates.length > 0 ? prev.primerRates[prev.primerRates.length - 1].materialId : null;
      return { ...prev, primerRates: [...prev.primerRates, { rate: 0, materialId: lastMaterial }] };
    });
  };

  const handleModalRemovePrimer = (coatIndex: number) => {
    setModalSurface(prev => ({ ...prev, primerRates: prev.primerRates.filter((_, i) => i !== coatIndex) }));
  };

  const handleModalSetAllCoatMaterials = (materialId: number | null) => {
    setModalSurface(prev => ({
      ...prev,
      coatRates: prev.coatRates.map(c => ({ ...c, materialId })),
      defaultMaterialId: materialId,
    }));
  };

  const handleModalSetAllPrimerMaterials = (materialId: number | null) => {
    setModalSurface(prev => ({
      ...prev,
      primerRates: prev.primerRates.map(c => ({ ...c, materialId })),
      defaultPrimerMaterialId: materialId,
    }));
  };

  const handleAddTab = async () => {
    if (!newTabName.trim()) return;
    const serviceName = newTabName.trim();
    const surfaceNames = newTabSurfaces.map(s => s.trim()).filter(s => s.length > 0);
    
    if (surfaceNames.length > 0) {
      try {
        const surfaces = surfaceNames.map(name => ({
          surfaceName: name,
          surfaceKey: name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''),
          unit: 'sqft',
          productionRateUnitsPerLaborHour: 0,
          defaultCoats: 1,
          defaultMaterialId: null,
          defaultPrimerCoats: 0,
          defaultPrimerMaterialId: null,
          estimateType: serviceName,
          rateCategory: null,
          areaDescription: null,
          surfaceDescription: null,
          crewNote: null,
          pricingMode: 'production_rate',
          pricePerUnit: null,
          coatsLabel: null,
        }));
        await apiRequest("POST", "/api/surfaces/bulk", { surfaces });
        queryClient.invalidateQueries({ queryKey: ["/api/surfaces"] });
        queryClient.invalidateQueries({ queryKey: ["/api/surfaces/estimate-types"] });
      } catch (err) {
        console.error('[AddService] Failed to create surfaces:', err);
      }
    }
    
    try {
      const existingMap = (financialData?.settings?.serviceSectionTypes as Record<string, string> | undefined) || {};
      const updatedMap = { ...existingMap, [serviceName]: newTabSectionType };
      await apiRequest("PUT", "/api/financial-settings", { serviceSectionTypes: updatedMap });
      queryClient.invalidateQueries({ queryKey: ["/api/financial-settings"] });
    } catch (err) {
      console.error('[AddService] Failed to save section type mapping:', err);
    }
    
    setActiveEstimateType(serviceName);
    setNewTabName("");
    setNewTabSurfaces([""]);
    setNewTabSectionType('area');
    setAddTabOpen(false);
  };


  const toggleCategory = (cat: string) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const surfaceCsvFileRef = useRef<HTMLInputElement>(null);

  const importSurfacesCSV = useMutation({
    mutationFn: async (rows: Record<string, string>[]) => {
      const mapped = rows.map(r => ({
        name: r['Name'] || r['name'] || r['Surface Name'] || r['surface_name'] || r['Rate Label'] || r['Rate Label (Internal)'] || '',
        unit: r['Unit'] || r['unit'] || r['Rate Type'] || '',
        productionRate: r['Production Rate (units/hr)'] || r['production_rate'] || r['Rate'] || r['rate'] || r['1 Coats'] || '',
        coat2Rate: r['2 Coats'] || r['2 coats'] || r['Coat 2'] || '',
        coat3Rate: r['3 Coats'] || r['3 coats'] || r['Coat 3'] || '',
        coat4Rate: r['4 Coats'] || r['4 coats'] || r['Coat 4'] || '',
        defaultCoats: r['Default Coats'] || r['default_coats'] || r['Coats'] || r['coats'] || '',
        defaultPrimerCoats: r['Default Primer Coats'] || r['default_primer_coats'] || r['Primer Coats'] || r['primer_coats'] || '',
        estimateType: r['Estimate Type'] || r['estimate_type'] || r['Estimate Types'] || '',
        rateCategory: r['Rate Category'] || r['rate_category'] || r['Category'] || '',
        surfaceDescription: r['Substrate'] || r['substrate'] || r['Substrate Description'] || r['substrate_description'] || r['Area Description'] || r['area_description'] || '',
        crewNote: r['Crew Note'] || r['crew_note'] || '',
      }));
      const res = await apiRequest("POST", "/api/surfaces/csv-import", { rows: mapped, defaultEstimateType: activeEstimateType });
      return res.json();
    },
    onSuccess: (data: { updated: number; created: number; skipped: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/surfaces"] });
      queryClient.invalidateQueries({ queryKey: ["/api/surfaces/estimate-types"] });
      toast({ title: "CSV Import Complete", description: `${data.updated} updated, ${data.created} created, ${data.skipped} skipped` });
    },
    onError: () => toast({ title: "Import failed", variant: "destructive" }),
  });

  const [pendingSurfaceCSVRows, setPendingSurfaceCSVRows] = useState<Record<string, string>[] | null>(null);

  const handleSurfaceCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCSV(text);
      if (rows.length === 0) {
        toast({ title: "No data found in file", variant: "destructive" });
        return;
      }
      setPendingSurfaceCSVRows(rows);
    };
    reader.readAsText(file);
    if (surfaceCsvFileRef.current) surfaceCsvFileRef.current.value = '';
  };

  const handleDownloadSurfaceSample = () => {
    const headers = ['Name', 'Unit', '1 Coats', '2 Coats', '3 Coats', '4 Coats', 'Default Coats', 'Default Primer Coats', 'Estimate Type', 'Rate Category', 'Substrate Description', 'Crew Note'];
    const rows = filteredSurfaces.length > 0
      ? filteredSurfaces.map(s => {
          const cr = s.coatRates || [];
          return [
            s.surfaceName, s.unit,
            (cr[0]?.rate ?? s.productionRateUnitsPerLaborHour).toString(),
            cr[1]?.rate ? cr[1].rate.toString() : '',
            cr[2]?.rate ? cr[2].rate.toString() : '',
            cr[3]?.rate ? cr[3].rate.toString() : '',
            s.defaultCoats.toString(), (s.defaultPrimerCoats || 0).toString(),
            s.estimateType || '', s.rateCategory || '', s.surfaceDescription || '', s.crewNote || '',
          ];
        })
      : [
          ['Walls', 'sqft', '200', '175', '', '', '2', '0', activeEstimateType, 'Walls', '', ''],
          ['Ceiling', 'sqft', '250', '225', '', '', '2', '0', activeEstimateType, 'Ceilings', '', ''],
          ['Baseboard', 'lf', '35', '30', '', '', '2', '0', activeEstimateType, 'Baseboards', '', ''],
        ];
    downloadCSV('surfaces_template.csv', headers, rows);
  };

  if (isLoading && !surfaces) {
    return <div className="flex items-center justify-center h-32"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  const tabsWithSurfaces = allTabs.filter(t => localSurfaces.some(s => s.estimateType === t));
  const sourceTabs = tabsWithSurfaces.filter(t => t !== activeEstimateType);


  const renderMaterialPicker = (
    selectedId: number | null,
    onSelect: (id: number | null) => void,
    filterType: 'paint' | 'primer',
    testIdPrefix: string,
    icon: typeof Paintbrush,
  ) => {
    const Icon = icon;
    const isPrimer = filterType === 'primer';
    const selectedMat = selectedId ? activeMaterials.find(m => m.id === selectedId) : null;
    const isOpen = openMaterialPicker === testIdPrefix;
    const filteredMats = activeMaterials.filter(m => isPrimer ? m.type === 'primer' : (m.type === 'paint' || m.type === 'primer'));
    return (
      <div className="relative">
        <button
          type="button"
          className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors w-full text-left ${
            selectedId
              ? isPrimer ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-foreground" : "bg-primary/5 border-primary/20 text-foreground"
              : "bg-background text-muted-foreground"
          }`}
          onClick={() => setOpenMaterialPicker(isOpen ? null : testIdPrefix)}
          data-testid={testIdPrefix}
        >
          <Icon className="w-4 h-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="font-medium truncate">{selectedMat?.materialName || "Select material"}</div>
            {selectedMat?.brand && <div className="text-[10px] text-muted-foreground">{selectedMat.brand}{selectedMat.finish ? ` · ${selectedMat.finish}` : ''}</div>}
          </div>
          <ChevronDown className={`w-3.5 h-3.5 shrink-0 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        {isOpen && (
          <div className="mt-1 rounded-md border bg-popover shadow-md">
            <div
              className="max-h-[240px] overflow-y-auto p-1 space-y-0.5"
              onTouchMove={(e) => e.stopPropagation()}
            >
              <button type="button" className={`w-full text-left rounded px-2 py-1.5 text-xs hover:bg-muted/80 transition-colors ${!selectedId ? "bg-primary/10 font-medium" : ""}`} onClick={() => { onSelect(null); setOpenMaterialPicker(null); }} data-testid={`${testIdPrefix}-none`}>None</button>
              {filteredMats.map(m => (
                <button key={m.id} type="button" className={`w-full text-left rounded px-2 py-1.5 text-xs hover:bg-muted/80 transition-colors ${selectedId === m.id ? "bg-primary/10 font-medium" : ""}`} onClick={() => { onSelect(m.id); setOpenMaterialPicker(null); }} data-testid={`${testIdPrefix}-${m.id}`}>
                  <div className="font-medium">{m.materialName}</div>
                  <div className="text-muted-foreground text-[10px]">{m.brand}{m.finish ? ` · ${m.finish}` : ''}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderSurfaceRow = (surface: LocalSurface, cardIndex: number) => {
    const unitLabel = UNIT_LABELS[surface.unit] || surface.unit;
    return (
      <Card key={surface.id || `new-${cardIndex}`} data-testid={`card-surface-${cardIndex}`}>
        <CardContent className="p-3">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <div className="font-medium text-sm truncate" data-testid={`text-surface-name-${cardIndex}`}>{surface.surfaceName || "Unnamed"}</div>
              <div className="text-xs text-muted-foreground truncate">
                {unitLabel} &middot; {surface.coatRates.length} coat{surface.coatRates.length !== 1 ? 's' : ''}
                {surface.primerRates.length > 0 && ` + ${surface.primerRates.length} primer`}
                {surface.unit === 'each' && surface.sqftPerUnit ? ` · ${surface.sqftPerUnit} sqft/item` : ''}
                {surface.surfaceDescription && ` · ${surface.surfaceDescription}`}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-sm font-medium whitespace-nowrap">
                {(surface as any).pricingMode === 'per_unit' && (surface as any).pricePerUnit != null
                  ? `$${(surface as any).pricePerUnit}/${surface.unit === 'each' ? 'ea' : surface.unit}`
                  : `${surface.coatRates[0]?.rate || 0} ${unitLabel}/hr`
                }
              </span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    data-testid={`button-move-surface-${cardIndex}`}
                    title="Move to category"
                  >
                    <Tag className="w-3 h-3" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-1" align="end">
                  <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">Move to category</div>
                  <div className="max-h-64 overflow-y-auto space-y-0.5">
                    {[...new Set([...allCategoryNames, ...RATE_CATEGORIES])].filter(c => c !== "General").map(cat => (
                      <PopoverClose asChild key={cat}>
                        <button
                          type="button"
                          className={cn(
                            "w-full text-left rounded px-2 py-1.5 text-xs hover:bg-muted",
                            (surface.rateCategory || "") === cat ? "bg-primary/10 font-medium" : ""
                          )}
                          onClick={() => surface.id && moveCategoryMutation.mutate({ id: surface.id, rateCategory: cat })}
                          data-testid={`button-move-to-${cat.toLowerCase().replace(/\s+/g, '-')}-${cardIndex}`}
                        >
                          {cat}
                        </button>
                      </PopoverClose>
                    ))}
                    <PopoverClose asChild>
                      <button
                        type="button"
                        className={cn(
                          "w-full text-left rounded px-2 py-1.5 text-xs hover:bg-muted italic text-muted-foreground",
                          !surface.rateCategory ? "bg-primary/10 font-medium" : ""
                        )}
                        onClick={() => surface.id && moveCategoryMutation.mutate({ id: surface.id, rateCategory: null })}
                        data-testid={`button-move-uncategorized-${cardIndex}`}
                      >
                        Uncategorized
                      </button>
                    </PopoverClose>
                  </div>
                </PopoverContent>
              </Popover>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-xs"
                onClick={() => openEditSurfaceModal(surface)}
                data-testid={`button-edit-surface-${cardIndex}`}
              >
                <Pencil className="w-3 h-3 mr-1" />
                Edit
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  let cardCounter = 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1 border-b pb-2">
        {allTabs.map(tab => {
          const slug = tab.toLowerCase().replace(/\s+/g, '-');
          const isActive = activeEstimateType === tab;
          return (
            <div key={tab} className={cn(
              "inline-flex items-stretch rounded-md overflow-hidden border",
              isActive ? "border-primary" : "border-input"
            )}>
              <button
                type="button"
                onClick={() => setActiveEstimateType(tab)}
                className={cn(
                  "text-xs px-3 py-1 font-medium transition-colors",
                  isActive ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
                )}
                data-testid={`tab-estimate-type-${slug}`}
              >
                {tab}
              </button>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "px-1.5 transition-colors border-l",
                      isActive ? "bg-primary text-primary-foreground border-primary-foreground/20 hover:bg-primary/90" : "bg-background hover:bg-muted border-input"
                    )}
                    data-testid={`button-tab-menu-${slug}`}
                    onClick={(e) => e.stopPropagation()}
                    aria-label="Service options"
                  >
                    <MoreVertical className="w-3.5 h-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-44 p-1" align="end">
                  <PopoverClose asChild>
                    <button
                      type="button"
                      className="w-full text-left rounded px-2 py-1.5 text-xs hover:bg-muted flex items-center gap-2"
                      onClick={() => { setRenameServiceTarget(tab); setRenameServiceValue(tab); }}
                      data-testid={`button-rename-service-${slug}`}
                    >
                      <Pencil className="w-3 h-3" /> Rename
                    </button>
                  </PopoverClose>
                  <PopoverClose asChild>
                    <button
                      type="button"
                      className="w-full text-left rounded px-2 py-1.5 text-xs hover:bg-destructive/10 text-destructive flex items-center gap-2"
                      onClick={() => setDeleteServiceTarget(tab)}
                      data-testid={`button-delete-service-${slug}`}
                    >
                      <Trash2 className="w-3 h-3" /> Delete service
                    </button>
                  </PopoverClose>
                </PopoverContent>
              </Popover>
            </div>
          );
        })}
        <Dialog open={addTabOpen} onOpenChange={(open) => { setAddTabOpen(open); if (!open) { setNewTabName(""); setNewTabSurfaces([""]); setNewTabSectionType('area'); } }}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" className="text-xs" data-testid="button-add-estimate-tab">
              <Plus className="w-3 h-3 mr-1" />
              Add Service
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add Custom Service</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Service Name</Label>
                <Input
                  value={newTabName}
                  onChange={(e) => setNewTabName(e.target.value)}
                  placeholder="e.g., Deck Staining, Power Washing"
                  data-testid="input-new-tab-name"
                />
              </div>
              <div className="space-y-2">
                <Label>How is this measured?</Label>
                <p className="text-xs text-muted-foreground">Pick how each section will be sized when you build estimates.</p>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    { value: 'room' as const, title: 'Room (L × W × H)', desc: 'Interior rooms — uses length, width, and ceiling height' },
                    { value: 'exterior' as const, title: 'Perimeter + Height', desc: 'Exterior siding — uses perimeter of the building × wall height' },
                    { value: 'area' as const, title: 'Area (L × W)', desc: 'Flat areas — flooring, decks, ceilings only' },
                    { value: 'cabinets' as const, title: 'Count only', desc: 'Cabinets — no dimensions, just quantity' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setNewTabSectionType(opt.value)}
                      className={cn(
                        "text-left rounded-md border px-3 py-2 transition-colors",
                        newTabSectionType === opt.value
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-muted-foreground/40"
                      )}
                      data-testid={`button-section-type-${opt.value}`}
                    >
                      <div className="text-sm font-medium">{opt.title}</div>
                      <div className="text-xs text-muted-foreground">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Surfaces</Label>
                <p className="text-xs text-muted-foreground">Add surfaces you'll use for this service. You can add more later.</p>
                <div className="space-y-2">
                  {newTabSurfaces.map((surface, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
                        value={surface}
                        onChange={(e) => {
                          const updated = [...newTabSurfaces];
                          updated[idx] = e.target.value;
                          setNewTabSurfaces(updated);
                        }}
                        placeholder={`Surface ${idx + 1} name`}
                        data-testid={`input-new-tab-surface-${idx}`}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (surface.trim()) {
                              setNewTabSurfaces([...newTabSurfaces, ""]);
                              setTimeout(() => {
                                const next = document.querySelector(`[data-testid="input-new-tab-surface-${idx + 1}"]`) as HTMLInputElement;
                                next?.focus();
                              }, 50);
                            }
                          }
                        }}
                      />
                      {newTabSurfaces.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="shrink-0 h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => setNewTabSurfaces(newTabSurfaces.filter((_, i) => i !== idx))}
                          data-testid={`button-remove-tab-surface-${idx}`}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => setNewTabSurfaces([...newTabSurfaces, ""])}
                    data-testid="button-add-more-surface"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Add Another Surface
                  </Button>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleAddTab} disabled={!newTabName.trim()} data-testid="button-confirm-add-tab">
                Add Service
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Production rates for <span className="font-medium">{activeEstimateType}</span>
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {filteredSurfaces.length === 0 && sourceTabs.length > 0 && (
            <Dialog open={copyFromOpen} onOpenChange={setCopyFromOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" data-testid="button-copy-from">
                  <Copy className="w-4 h-4 mr-1" />
                  Copy from...
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                  <DialogTitle>Copy Surfaces From</DialogTitle>
                </DialogHeader>
                <p className="text-sm text-muted-foreground">
                  Duplicate all surfaces from another tab into "{activeEstimateType}". You can then adjust the rates.
                </p>
                <div className="space-y-2">
                  <Label>Source Tab</Label>
                  <Select value={copyFromSource} onValueChange={setCopyFromSource}>
                    <SelectTrigger data-testid="select-copy-source">
                      <SelectValue placeholder="Select a tab" />
                    </SelectTrigger>
                    <SelectContent>
                      {sourceTabs.map(t => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter>
                  <Button
                    onClick={() => copyFromMutation.mutate({ from: copyFromSource, to: activeEstimateType })}
                    disabled={!copyFromSource || copyFromMutation.isPending}
                    data-testid="button-confirm-copy"
                  >
                    {copyFromMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Copy className="w-4 h-4 mr-1" />}
                    Copy Surfaces
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          <Button variant="outline" size="sm" onClick={handleDownloadSurfaceSample} data-testid="button-download-surfaces-csv">
            <Download className="w-4 h-4 mr-1" />
            Sample CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => surfaceCsvFileRef.current?.click()} disabled={importSurfacesCSV.isPending} data-testid="button-upload-surfaces-csv">
            {importSurfacesCSV.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
            Upload CSV
          </Button>
          <input ref={surfaceCsvFileRef} type="file" accept=".csv" className="hidden" onChange={handleSurfaceCSVUpload} data-testid="input-surfaces-csv-file" />
          <Button type="button" onClick={openAddSurfaceModal} data-testid="button-add-surface">
            <Plus className="w-4 h-4 mr-2" />
            Add Surface
          </Button>
        </div>
      </div>

      {filteredSurfaces.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground" data-testid="text-surfaces-empty">
            {populateDefaults.isPending ? (
              <div className="flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Loading default surfaces...</span>
              </div>
            ) : (
              <div className="space-y-2">
                <span>No surfaces configured for {activeEstimateType}.</span>
                <div className="flex items-center justify-center gap-2 mt-2">
                  <Button type="button" variant="outline" size="sm" onClick={openAddSurfaceModal} data-testid="button-add-surface-empty">
                    <Plus className="w-4 h-4 mr-1" /> Add Surface
                  </Button>
                  {sourceTabs.length > 0 && (
                    <Button variant="outline" size="sm" onClick={() => setCopyFromOpen(true)} data-testid="button-copy-from-empty">
                      <Copy className="w-4 h-4 mr-1" /> Copy from another tab
                    </Button>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : hasCategories ? (
        <div className="space-y-4">
          {groupedSurfaces.map(group => {
            const slug = group.category.toLowerCase().replace(/\s+/g, '-');
            return (
              <div key={group.category}>
                <div className="flex items-center gap-2 mb-2">
                  <button
                    onClick={() => toggleCategory(group.category)}
                    className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                    data-testid={`button-toggle-category-${slug}`}
                  >
                    {collapsedCategories.has(group.category) ? (
                      <ChevronRight className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                    {group.category}
                    <Badge variant="secondary" className="text-xs">{group.surfaces.length}</Badge>
                  </button>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        data-testid={`button-category-menu-${slug}`}
                        aria-label="Category options"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-44 p-1" align="start">
                      <PopoverClose asChild>
                        <button
                          type="button"
                          className="w-full text-left rounded px-2 py-1.5 text-xs hover:bg-muted flex items-center gap-2"
                          onClick={() => { setRenameCategoryTarget(group.category); setRenameCategoryValue(group.category); }}
                          data-testid={`button-rename-category-${slug}`}
                        >
                          <Pencil className="w-3 h-3" /> Rename
                        </button>
                      </PopoverClose>
                      <PopoverClose asChild>
                        <button
                          type="button"
                          className="w-full text-left rounded px-2 py-1.5 text-xs hover:bg-destructive/10 text-destructive flex items-center gap-2"
                          onClick={() => setDeleteCategoryTarget(group.category)}
                          data-testid={`button-delete-category-${slug}`}
                        >
                          <Trash2 className="w-3 h-3" /> Delete category
                        </button>
                      </PopoverClose>
                    </PopoverContent>
                  </Popover>
                </div>
                {!collapsedCategories.has(group.category) && (
                  <div className="grid gap-2">
                    {group.surfaces.length === 0 ? (
                      <div className="text-xs text-muted-foreground italic px-3 py-2 border border-dashed rounded-md" data-testid={`text-empty-category-${slug}`}>
                        Empty — move surfaces here from other categories.
                      </div>
                    ) : group.surfaces.map((surface) => {
                      const ci = cardCounter++;
                      return renderSurfaceRow(surface, ci);
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid gap-2">
          {filteredSurfaces.map((surface) => {
            const ci = cardCounter++;
            return renderSurfaceRow(surface, ci);
          })}
        </div>
      )}

      {/* Category Picker (shown before creating a new surface) */}
      <Dialog open={categoryPickerOpen} onOpenChange={setCategoryPickerOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pick a category</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Choose where this new surface should live, then we'll continue to the surface details.</p>
            <div className="flex flex-wrap gap-2">
              {[...new Set([...allCategoryNames, ...RATE_CATEGORIES])].filter(c => c !== "General").map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => proceedToSurfaceModalWithCategory(cat)}
                  className="rounded-full border border-input bg-background hover:bg-primary/10 hover:border-primary text-xs font-medium px-3 py-1.5 transition-colors"
                  data-testid={`button-pick-category-${cat.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  {cat}
                </button>
              ))}
              <button
                type="button"
                onClick={() => proceedToSurfaceModalWithCategory(null)}
                className="rounded-full border border-dashed text-muted-foreground hover:bg-muted text-xs font-medium px-3 py-1.5 transition-colors italic"
                data-testid="button-pick-category-uncategorized"
              >
                Uncategorized
              </button>
            </div>
            <div className="border-t pt-3 space-y-2">
              <Label className="text-xs text-muted-foreground">Or create a new category</Label>
              <div className="flex gap-2">
                <Input
                  value={newCategoryInPicker}
                  onChange={(e) => setNewCategoryInPicker(e.target.value)}
                  placeholder="e.g., Doors, Trim, Specialty"
                  data-testid="input-picker-new-category"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newCategoryInPicker.trim()) {
                      e.preventDefault();
                      const name = newCategoryInPicker.trim();
                      upsertCustomCategory.mutate({ estimateType: activeEstimateType, category: name });
                      proceedToSurfaceModalWithCategory(name);
                    }
                  }}
                />
                <Button
                  type="button"
                  disabled={!newCategoryInPicker.trim()}
                  onClick={() => {
                    const name = newCategoryInPicker.trim();
                    if (!name) return;
                    upsertCustomCategory.mutate({ estimateType: activeEstimateType, category: name });
                    proceedToSurfaceModalWithCategory(name);
                  }}
                  data-testid="button-picker-create-category"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> New
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCategoryPickerOpen(false)} data-testid="button-cancel-category-picker">Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Service Dialog */}
      <Dialog open={!!renameServiceTarget} onOpenChange={(open) => { if (!open) setRenameServiceTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename Service</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Current</Label>
            <div className="text-sm font-medium">{renameServiceTarget}</div>
            <Label className="text-xs text-muted-foreground pt-2">New name</Label>
            <Input
              value={renameServiceValue}
              onChange={(e) => setRenameServiceValue(e.target.value)}
              autoFocus
              data-testid="input-rename-service"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameServiceTarget(null)} data-testid="button-cancel-rename-service">Cancel</Button>
            <Button
              disabled={!renameServiceValue.trim() || renameServiceValue.trim() === renameServiceTarget || renameServiceMutation.isPending}
              onClick={() => {
                if (!renameServiceTarget) return;
                renameServiceMutation.mutate(
                  { oldName: renameServiceTarget, newName: renameServiceValue.trim() },
                  { onSuccess: () => setRenameServiceTarget(null) }
                );
              }}
              data-testid="button-confirm-rename-service"
            >
              {renameServiceMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Service Confirm */}
      <AlertDialog open={!!deleteServiceTarget} onOpenChange={(open) => { if (!open) setDeleteServiceTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Delete "{deleteServiceTarget}"?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the service and all of its surfaces. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-service">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteServiceTarget) deleteServiceMutation.mutate(deleteServiceTarget);
                setDeleteServiceTarget(null);
              }}
              data-testid="button-confirm-delete-service"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rename Category Dialog */}
      <Dialog open={!!renameCategoryTarget} onOpenChange={(open) => { if (!open) setRenameCategoryTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename Category</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Current</Label>
            <div className="text-sm font-medium">{renameCategoryTarget}</div>
            <Label className="text-xs text-muted-foreground pt-2">New name</Label>
            <Input
              value={renameCategoryValue}
              onChange={(e) => setRenameCategoryValue(e.target.value)}
              autoFocus
              data-testid="input-rename-category"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameCategoryTarget(null)} data-testid="button-cancel-rename-category">Cancel</Button>
            <Button
              disabled={!renameCategoryValue.trim() || renameCategoryValue.trim() === renameCategoryTarget || renameCategoryMutation.isPending}
              onClick={() => {
                if (!renameCategoryTarget) return;
                renameCategoryMutation.mutate(
                  { estimateType: activeEstimateType, oldCategory: renameCategoryTarget, newCategory: renameCategoryValue.trim() },
                  { onSuccess: () => setRenameCategoryTarget(null) }
                );
              }}
              data-testid="button-confirm-rename-category"
            >
              {renameCategoryMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Category Dialog */}
      <AlertDialog open={!!deleteCategoryTarget} onOpenChange={(open) => { if (!open) setDeleteCategoryTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Delete "{deleteCategoryTarget}"?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Choose what to do with the surfaces in this category.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel data-testid="button-cancel-delete-category">Cancel</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => {
                if (deleteCategoryTarget) deleteCategoryMutation.mutate({ estimateType: activeEstimateType, category: deleteCategoryTarget, mode: 'ungroup' });
                setDeleteCategoryTarget(null);
              }}
              data-testid="button-ungroup-category"
            >
              Keep surfaces (ungroup)
            </Button>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteCategoryTarget) deleteCategoryMutation.mutate({ estimateType: activeEstimateType, category: deleteCategoryTarget, mode: 'delete' });
                setDeleteCategoryTarget(null);
              }}
              data-testid="button-confirm-delete-category"
            >
              Delete category and surfaces
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* New Category Dialog */}
      <Dialog open={newCategoryOpen} onOpenChange={(open) => { setNewCategoryOpen(open); if (!open) setNewCategoryValue(""); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New Category</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Category name</Label>
            <Input
              value={newCategoryValue}
              onChange={(e) => setNewCategoryValue(e.target.value)}
              placeholder="e.g., Doors, Trim, Specialty"
              autoFocus
              data-testid="input-new-category-name"
            />
            <p className="text-xs text-muted-foreground">After creating, use the tag button on each surface to move it into this category.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewCategoryOpen(false)} data-testid="button-cancel-new-category">Cancel</Button>
            <Button
              disabled={!newCategoryValue.trim() || upsertCustomCategory.isPending}
              onClick={() => {
                upsertCustomCategory.mutate(
                  { estimateType: activeEstimateType, category: newCategoryValue.trim() },
                  { onSuccess: () => { setNewCategoryOpen(false); setNewCategoryValue(""); } }
                );
              }}
              data-testid="button-confirm-new-category"
            >
              {upsertCustomCategory.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingSurfaceCSVRows} onOpenChange={(open) => { if (!open) setPendingSurfaceCSVRows(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Overwrite Existing Surfaces?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Uploading this CSV will overwrite any existing surfaces that share the same name. Your current production rates, coats, materials, and other settings for matching surfaces will be replaced with the data from the file. New surfaces will be added. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-surface-csv-import">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingSurfaceCSVRows) {
                  importSurfacesCSV.mutate(pendingSurfaceCSVRows);
                }
                setPendingSurfaceCSVRows(null);
              }}
              data-testid="button-confirm-surface-csv-import"
            >
              Yes, Import & Overwrite
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={surfaceModalOpen} onOpenChange={setSurfaceModalOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" onOpenAutoFocus={(e) => { if (editingSurface) e.preventDefault(); }}>
          <DialogHeader>
            <DialogTitle>{editingSurface ? "Edit Surface" : "Add Surface"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Surface Name</Label>
              <Input
                value={modalSurface.surfaceName}
                onChange={(e) => updateModalField("surfaceName", e.target.value)}
                placeholder="Surface name"
                data-testid="input-modal-surface-name"
              />
            </div>
            <div className="flex gap-3">
              <div className="w-28 space-y-1">
                <Label className="text-xs text-muted-foreground">Unit</Label>
                <Select value={modalSurface.unit} onValueChange={(v) => updateModalField("unit", v)}>
                  <SelectTrigger data-testid="select-modal-unit"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sqft">sq ft</SelectItem>
                    <SelectItem value="lf">linear ft</SelectItem>
                    <SelectItem value="each">each</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="w-28 space-y-1">
                <Label className="text-xs text-muted-foreground">Qty Label</Label>
                <Select value={modalSurface.coatsLabel || "coat"} onValueChange={(v) => updateModalField("coatsLabel", v === "coat" ? null : v)}>
                  <SelectTrigger data-testid="select-modal-coats-label"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="coat">Coats</SelectItem>
                    <SelectItem value="layer">Layers</SelectItem>
                    <SelectItem value="application">Applications</SelectItem>
                    <SelectItem value="pass">Passes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5 text-blue-500" />
                  <Label className="text-xs text-muted-foreground">Substrate</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors ${modalSurface.surfaceDescription ? "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-foreground" : "bg-background text-muted-foreground"}`}
                        data-testid="select-modal-substrate"
                      >
                        <Layers className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate max-w-[140px]">{modalSurface.surfaceDescription || "Select"}</span>
                        <ChevronDown className="w-3 h-3 shrink-0 text-muted-foreground" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-48 p-1.5 z-[10000]" align="start" side="bottom" avoidCollisions>
                      <div className="max-h-[260px] overflow-y-auto space-y-0.5">
                        <PopoverClose asChild>
                          <button
                            type="button"
                            className={`w-full text-left rounded px-2 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 border border-dashed border-primary/40 ${modalSubstrateOther ? "bg-primary/10" : ""}`}
                            onClick={() => { setModalSubstrateOther(true); if (!modalSurface.surfaceDescription) updateModalField("surfaceDescription", ""); }}
                            data-testid="button-modal-add-new-substrate"
                          >
                            + Add New Substrate...
                          </button>
                        </PopoverClose>
                        <PopoverClose asChild><button type="button" className={`w-full text-left rounded px-2 py-1.5 text-xs hover:bg-muted/80 mt-1 ${!modalSurface.surfaceDescription ? "bg-primary/10 font-medium" : ""}`} onClick={() => { updateModalField("surfaceDescription", null); setModalSubstrateOther(false); }}>None</button></PopoverClose>
                        {SUBSTRATE_PRESETS.map(s => (
                          <PopoverClose key={s} asChild><button type="button" className={`w-full text-left rounded px-2 py-1.5 text-xs hover:bg-muted/80 ${modalSurface.surfaceDescription === s ? "bg-primary/10 font-medium" : ""}`} onClick={() => { updateModalField("surfaceDescription", s); setModalSubstrateOther(false); }}>{s}</button></PopoverClose>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                  {modalSubstrateOther && (
                    <Input
                      value={modalSurface.surfaceDescription || ""}
                      onChange={(e) => updateModalField("surfaceDescription", e.target.value || null)}
                      placeholder="Enter substrate..."
                      className="text-sm flex-1"
                      data-testid="input-modal-custom-substrate"
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Pricing Mode</Label>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={`flex-1 rounded-md border px-3 py-2 text-xs font-medium transition-colors ${modalSurface.pricingMode !== 'per_unit' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground hover:bg-muted/50'}`}
                  onClick={() => updateModalField('pricingMode', 'production_rate')}
                  data-testid="button-pricing-mode-production-rate"
                >
                  Production Rate
                </button>
                <button
                  type="button"
                  className={`flex-1 rounded-md border px-3 py-2 text-xs font-medium transition-colors ${modalSurface.pricingMode === 'per_unit' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground hover:bg-muted/50'}`}
                  onClick={() => updateModalField('pricingMode', 'per_unit')}
                  data-testid="button-pricing-mode-per-unit"
                >
                  Per {modalSurface.unit === 'each' ? 'Unit' : modalSurface.unit === 'lf' ? 'LF' : 'Sqft'}
                </button>
              </div>
              {modalSurface.pricingMode === 'per_unit' && (
                <div className="flex items-center gap-2 rounded-md border border-blue-200 dark:border-blue-800/50 bg-blue-50/50 dark:bg-blue-950/20 px-3 py-2">
                  <DollarSign className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">Price per {modalSurface.unit === 'each' ? 'unit' : modalSurface.unit}</span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={modalSurface.pricePerUnit ?? ""}
                    onChange={(e) => updateModalField("pricePerUnit", parseFloat(e.target.value) || null)}
                    placeholder="0.00"
                    className="w-20 h-7 text-sm text-right"
                    data-testid="input-modal-price-per-unit"
                  />
                </div>
              )}
            </div>

            {modalSurface.unit === 'each' && modalSurface.pricingMode !== 'per_unit' && (() => {
              const effSellRate = financialData?.settings?.sellRatePerHour ?? 0;
              const totalCoatHrs = modalSurface.coatRates.reduce((sum, c) => sum + (c.rate > 0 ? 1 / c.rate : 0), 0);
              const totalPrimerHrs = modalSurface.primerRates.reduce((sum, c) => sum + (c.rate > 0 ? 1 / c.rate : 0), 0);
              const totalHrs = totalCoatHrs + totalPrimerHrs;
              const totalPrice = totalHrs * effSellRate;
              return (
              <div className="flex items-center gap-2 rounded-md border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/50 dark:bg-emerald-950/20 px-3 py-2">
                <Calculator className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="text-xs font-medium text-muted-foreground">${effSellRate.toFixed(2)}/hr</span>
                {effSellRate > 0 && totalHrs > 0 && (
                  <>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums" data-testid="text-preview-total">
                      {totalHrs.toFixed(2)}h = ${totalPrice.toFixed(2)}
                    </span>
                    <span className="text-[10px] text-muted-foreground ml-auto">per item</span>
                  </>
                )}
              </div>
              );
            })()}

            {modalSurface.unit === 'each' && (
              <div className="flex items-center gap-2 rounded-md border px-3 py-2">
                <Ruler className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs text-muted-foreground whitespace-nowrap">Sqft per item</span>
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  value={modalSurface.sqftPerUnit ?? ""}
                  onChange={(e) => updateModalField("sqftPerUnit", parseFloat(e.target.value) || null)}
                  placeholder="0"
                  className="w-16 h-7 text-sm text-right"
                  data-testid="input-modal-sqft-per-unit"
                />
                <span className="text-[10px] text-muted-foreground">for material calc</span>
              </div>
            )}

            <div className={`rounded-lg border p-3 space-y-3 ${modalSurface.usePaint ? 'border-primary/20 bg-primary/[0.02] dark:bg-primary/[0.04]' : 'border-muted bg-muted/30'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Paintbrush className={`w-4 h-4 ${modalSurface.usePaint ? 'text-primary' : 'text-muted-foreground'}`} />
                  <span className="text-xs font-semibold text-foreground uppercase tracking-wide">Top {modalSurface.coatsLabel ? (modalSurface.coatsLabel.charAt(0).toUpperCase() + modalSurface.coatsLabel.slice(1)) : "Coat"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">{modalSurface.usePaint ? 'On' : 'Off'}</span>
                  <Switch
                    checked={modalSurface.usePaint}
                    onCheckedChange={(checked) => {
                      setModalSurface(prev => ({
                        ...prev,
                        usePaint: checked,
                        coatRates: checked
                          ? (prev.coatRates.length > 0 ? prev.coatRates : [{ rate: 0, materialId: null }])
                          : [],
                        defaultCoats: checked ? (prev.defaultCoats || 1) : 0,
                      }));
                    }}
                    data-testid="switch-use-paint"
                  />
                </div>
              </div>
              {!modalSurface.usePaint ? (
                <p className="text-xs text-muted-foreground">Default paint/material is disabled — coats will be hidden in the room builder</p>
              ) : (
              <>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Default Material</Label>
                {renderMaterialPicker(
                  modalSurface.coatRates[0]?.materialId ?? null,
                  (id) => handleModalSetAllCoatMaterials(id),
                  'paint',
                  'select-modal-coat-material',
                  Paintbrush,
                )}
              </div>
              {modalSurface.pricingMode !== 'per_unit' && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{UNIT_LABELS[modalSurface.unit] || modalSurface.unit} per hour</Label>
                <div className="flex items-end gap-2 flex-wrap">
                  {modalSurface.coatRates.map((coat, ci) => {
                    const coatHrs = coat.rate > 0 ? 1 / coat.rate : 0;
                    const effectiveSellRate = financialData?.settings?.sellRatePerHour ?? 0;
                    const coatPrice = coatHrs * effectiveSellRate;
                    return (
                    <div key={ci} className="space-y-1">
                      <span className="text-[10px] font-medium text-muted-foreground">{ordinal(ci + 1)} {modalSurface.coatsLabel || "coat"}</span>
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={coat.rate || ""}
                          onChange={(e) => handleModalCoatRateChange(ci, 'rate', parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          className="w-20 h-8 text-sm"
                          data-testid={`input-modal-coat-rate-${ci}`}
                        />
                        {modalSurface.coatRates.length > 1 && (
                          <button type="button" onClick={() => handleModalRemoveCoat(ci)} className="text-destructive/60 hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
                        )}
                      </div>
                      {modalSurface.unit === 'each' && coat.rate > 0 && effectiveSellRate > 0 && (
                        <div className="text-[10px] text-muted-foreground tabular-nums">
                          {coatHrs.toFixed(2)}h · ${coatPrice.toFixed(2)}
                        </div>
                      )}
                    </div>
                    );
                  })}
                  <button
                    type="button"
                    onClick={handleModalAddCoat}
                    className="flex items-center justify-center w-8 h-8 rounded-md border border-dashed border-primary/30 text-primary hover:bg-primary/5"
                    data-testid="button-modal-add-coat"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              )}
              </>
              )}
            </div>

            <div className={`rounded-lg border p-3 space-y-3 ${modalSurface.usePrimer ? 'border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-950/20' : 'border-muted bg-muted/30'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Droplets className={`w-4 h-4 ${modalSurface.usePrimer ? 'text-amber-600' : 'text-muted-foreground'}`} />
                  <span className="text-xs font-semibold text-foreground uppercase tracking-wide">Primer</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">{modalSurface.usePrimer ? 'On' : 'Off'}</span>
                  <Switch
                    checked={modalSurface.usePrimer}
                    onCheckedChange={(checked) => {
                      setModalSurface(prev => ({
                        ...prev,
                        usePrimer: checked,
                        primerRates: checked ? prev.primerRates : [],
                      }));
                    }}
                    data-testid="switch-use-primer"
                  />
                </div>
              </div>
              {!modalSurface.usePrimer ? (
                <p className="text-xs text-muted-foreground">Primer is disabled for this surface type</p>
              ) : modalSurface.primerRates.length === 0 ? (
                <button
                  type="button"
                  onClick={handleModalAddPrimer}
                  className="flex items-center gap-1.5 text-xs text-amber-600 hover:text-amber-500 py-1"
                  data-testid="button-modal-add-primer"
                >
                  <Plus className="w-3 h-3" />
                  Add Primer
                </button>
              ) : (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Default Primer Material</Label>
                    {renderMaterialPicker(
                      modalSurface.primerRates[0]?.materialId ?? null,
                      (id) => handleModalSetAllPrimerMaterials(id),
                      'primer',
                      'select-modal-primer-material',
                      Droplets,
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">{UNIT_LABELS[modalSurface.unit] || modalSurface.unit} per hour</Label>
                    <div className="flex items-end gap-2 flex-wrap">
                      {modalSurface.primerRates.map((coat, ci) => {
                        const pCoatHrs = coat.rate > 0 ? 1 / coat.rate : 0;
                        const pSellRate = financialData?.settings?.sellRatePerHour ?? 0;
                        const pCoatPrice = pCoatHrs * pSellRate;
                        return (
                        <div key={ci} className="space-y-1">
                          <span className="text-[10px] font-medium text-muted-foreground">{ordinal(ci + 1)} {modalSurface.coatsLabel || "coat"}</span>
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={coat.rate || ""}
                              onChange={(e) => handleModalPrimerRateChange(ci, 'rate', parseFloat(e.target.value) || 0)}
                              placeholder="0"
                              className="w-20 h-8 text-sm"
                              data-testid={`input-modal-primer-rate-${ci}`}
                            />
                            <button type="button" onClick={() => handleModalRemovePrimer(ci)} className="text-destructive/60 hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
                          </div>
                          {modalSurface.unit === 'each' && coat.rate > 0 && pSellRate > 0 && (
                            <div className="text-[10px] text-muted-foreground tabular-nums">
                              {pCoatHrs.toFixed(2)}h · ${pCoatPrice.toFixed(2)}
                            </div>
                          )}
                        </div>
                        );
                      })}
                      <button
                        type="button"
                        onClick={handleModalAddPrimer}
                        className="flex items-center justify-center w-8 h-8 rounded-md border border-dashed border-amber-300 dark:border-amber-700 text-amber-600 hover:bg-amber-100/50 dark:hover:bg-amber-900/20"
                        data-testid="button-modal-add-primer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <Settings2 className="w-3.5 h-3.5 text-muted-foreground" />
                <Label className="text-xs text-muted-foreground">Scope & Notes</Label>
              </div>
              <Textarea
                value={modalSurface.areaDescription || ""}
                onChange={(e) => updateModalField("areaDescription", e.target.value || null)}
                placeholder="Describe the scope of work..."
                rows={2}
                className="text-sm resize-y min-h-[52px] max-h-[240px]"
                data-testid="textarea-modal-area-desc"
              />
            </div>
          </div>
          <DialogFooter className="flex items-center justify-between sm:justify-between gap-2 pt-2">
            {editingSurface ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDeleteConfirmSurface(editingSurface)}
                className="text-destructive hover:text-destructive"
                data-testid="button-modal-delete-surface"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                Delete
              </Button>
            ) : <div />}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setSurfaceModalOpen(false)} data-testid="button-modal-cancel-surface">Cancel</Button>
              <Button onClick={handleModalSurfaceSave} disabled={updateSurface.isPending || createSurface.isPending} data-testid="button-modal-save-surface">
                {(updateSurface.isPending || createSurface.isPending) ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />}
                {editingSurface ? "Save Changes" : "Add Surface"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteConfirmSurface} onOpenChange={(open) => { if (!open) setDeleteConfirmSurface(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Surface</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteConfirmSurface?.surfaceName}"? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-surface">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmSurface && handleDeleteSurface(deleteConfirmSurface)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-surface"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MaterialsTab() {
  const { toast } = useToast();
  const defaultsPopulatedRef = useRef(false);
  const [filterType, setFilterType] = useState<FilterType>("all");

  interface LocalMaterial {
    id?: number;
    materialName: string;
    brand: string;
    type: string;
    finish: string | null;
    coverageSqftPerGallon: number | null;
    costPerUnit: number;
    markupPercentage: number;
    wastePercentage: number;
    active: boolean;
    dirty?: boolean;
    isNew?: boolean;
  }

  const [localMaterials, setLocalMaterials] = useState<LocalMaterial[]>([]);

  const { data: materials, isLoading } = useQuery<Material[]>({
    queryKey: ["/api/materials"],
  });

  useEffect(() => {
    if (materials) {
      setLocalMaterials(materials.map(m => ({
        id: m.id,
        materialName: m.materialName,
        brand: m.brand,
        type: m.type,
        finish: m.finish,
        coverageSqftPerGallon: m.coverageSqftPerGallon,
        costPerUnit: m.costPerUnit,
        markupPercentage: m.markupPercentage ?? 0,
        wastePercentage: m.wastePercentage,
        active: m.active,
        dirty: false,
      })));
    }
  }, [materials]);

  const populateDefaults = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/materials/bulk", { materials: DEFAULT_MATERIALS.map(m => ({ ...m, active: true })) });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/materials"] });
      toast({ title: "Default materials loaded" });
    },
  });

  useEffect(() => {
    if (materials && materials.length === 0 && !defaultsPopulatedRef.current) {
      defaultsPopulatedRef.current = true;
      populateDefaults.mutate();
    }
  }, [materials]);

  const createMaterial = useMutation({
    mutationFn: async (material: Omit<LocalMaterial, 'id' | 'isNew' | 'dirty'>) => {
      const res = await apiRequest("POST", "/api/materials", material);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/materials"] });
      toast({ title: "Material created" });
    },
  });

  const updateMaterial = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Partial<LocalMaterial> }) => {
      const res = await apiRequest("PUT", `/api/materials/${id}`, updates);
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/materials"] });
      setLocalMaterials(prev => prev.map(m => m.id === variables.id ? { ...m, dirty: false } : m));
      toast({ title: "Material saved" });
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  const deleteMaterial = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/materials/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/materials"] });
      toast({ title: "Material removed" });
    },
  });

  const [materialModalOpen, setMaterialModalOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<LocalMaterial | null>(null);
  const [deleteConfirmMaterial, setDeleteConfirmMaterial] = useState<LocalMaterial | null>(null);

  const [modalForm, setModalForm] = useState<LocalMaterial>({
    materialName: "",
    brand: "Generic",
    type: "paint",
    finish: null,
    coverageSqftPerGallon: 350,
    costPerUnit: 0,
    markupPercentage: 0,
    wastePercentage: 0.10,
    active: true,
  });

  const openAddModal = () => {
    setEditingMaterial(null);
    setModalForm({
      materialName: "",
      brand: "Generic",
      type: "paint",
      finish: null,
      coverageSqftPerGallon: 350,
      costPerUnit: 0,
      markupPercentage: 0,
      wastePercentage: 0.10,
      active: true,
    });
    setMaterialModalOpen(true);
  };

  const openEditModal = (mat: LocalMaterial) => {
    setEditingMaterial(mat);
    setModalForm({ ...mat });
    setMaterialModalOpen(true);
  };

  const handleModalSave = () => {
    if (!modalForm.materialName.trim()) {
      toast({ title: "Material name is required", variant: "destructive" });
      return;
    }
    if (editingMaterial?.id) {
      updateMaterial.mutate({
        id: editingMaterial.id,
        updates: {
          materialName: modalForm.materialName,
          brand: modalForm.brand,
          type: modalForm.type,
          finish: modalForm.finish,
          coverageSqftPerGallon: modalForm.coverageSqftPerGallon,
          costPerUnit: modalForm.costPerUnit,
          markupPercentage: modalForm.markupPercentage,
          wastePercentage: modalForm.wastePercentage,
          active: modalForm.active,
        },
      });
    } else {
      createMaterial.mutate({
        materialName: modalForm.materialName,
        brand: modalForm.brand,
        type: modalForm.type,
        finish: modalForm.finish,
        coverageSqftPerGallon: modalForm.coverageSqftPerGallon,
        costPerUnit: modalForm.costPerUnit,
        markupPercentage: modalForm.markupPercentage,
        wastePercentage: modalForm.wastePercentage,
        active: modalForm.active,
      });
    }
    setMaterialModalOpen(false);
  };

  const handleDeleteMaterial = (mat: LocalMaterial) => {
    if (mat.id) {
      deleteMaterial.mutate(mat.id);
    }
    setDeleteConfirmMaterial(null);
    setMaterialModalOpen(false);
  };

  const csvFileRef = useRef<HTMLInputElement>(null);

  const importMaterialsCSV = useMutation({
    mutationFn: async (rows: Record<string, string>[]) => {
      const mapped = rows.map(r => ({
        name: r['Name'] || r['name'] || r['Material Name'] || r['material_name'] || '',
        brand: r['Brand'] || r['brand'] || '',
        type: r['Type'] || r['type'] || '',
        finish: r['Finish'] || r['finish'] || '',
        costPerUnit: r['Cost Per Unit'] || r['cost_per_unit'] || r['Cost'] || r['cost'] || '',
        coverageSqftPerGallon: r['Coverage (sqft/gal)'] || r['coverage_sqft_per_gallon'] || r['Coverage'] || r['coverage'] || '',
        wastePercentage: r['Waste %'] || r['waste_percentage'] || r['Waste'] || r['waste'] || '',
        markupPercentage: r['Markup %'] || r['markup_percentage'] || r['Markup'] || r['markup'] || '',
      }));
      const res = await apiRequest("POST", "/api/materials/csv-import", { rows: mapped });
      return res.json();
    },
    onSuccess: (data: { updated: number; created: number; skipped: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/materials"] });
      toast({ title: "CSV Import Complete", description: `${data.updated} updated, ${data.created} created, ${data.skipped} skipped` });
    },
    onError: () => toast({ title: "Import failed", variant: "destructive" }),
  });

  const [pendingMaterialCSVRows, setPendingMaterialCSVRows] = useState<Record<string, string>[] | null>(null);

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCSV(text);
      if (rows.length === 0) {
        toast({ title: "No data found in file", variant: "destructive" });
        return;
      }
      setPendingMaterialCSVRows(rows);
    };
    reader.readAsText(file);
    if (csvFileRef.current) csvFileRef.current.value = '';
  };

  const handleDownloadSample = () => {
    const headers = ['Name', 'Brand', 'Type', 'Finish', 'Cost Per Unit', 'Coverage (sqft/gal)', 'Waste %', 'Markup %'];
    const rows = localMaterials.length > 0
      ? localMaterials.map(m => [
          m.materialName, m.brand, m.type, m.finish || '',
          m.costPerUnit.toString(), (m.coverageSqftPerGallon || '').toString(),
          (m.wastePercentage * 100).toFixed(0), (m.markupPercentage || 0).toString(),
        ])
      : [
          ['Regal Select Interior', 'Benjamin Moore', 'paint', 'Eggshell', '78', '375', '10', '0'],
          ['Fresh Start Primer', 'Benjamin Moore', 'primer', '', '55', '300', '10', '0'],
        ];
    downloadCSV('materials_template.csv', headers, rows);
  };

  const filteredMaterials = localMaterials.map((m, i) => ({ ...m, originalIndex: i })).filter(m =>
    filterType === "all" || m.type === filterType
  );

  if (isLoading && !materials) {
    return <div className="flex items-center justify-center h-32"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Manage paint lines, primers, and contractor materials with pricing</p>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleDownloadSample} data-testid="button-download-materials-csv">
            <Download className="w-4 h-4 mr-1" />
            Sample CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => csvFileRef.current?.click()} disabled={importMaterialsCSV.isPending} data-testid="button-upload-materials-csv">
            {importMaterialsCSV.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
            Upload CSV
          </Button>
          <input ref={csvFileRef} type="file" accept=".csv" className="hidden" onChange={handleCSVUpload} data-testid="input-materials-csv-file" />
          <Select value={filterType} onValueChange={(v) => setFilterType(v as FilterType)}>
            <SelectTrigger className="w-32" data-testid="select-filter-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="paint">Paint</SelectItem>
              <SelectItem value="primer">Primer</SelectItem>
              <SelectItem value="sundries">Sundries</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={openAddModal} data-testid="button-add-material">
            <Plus className="w-4 h-4 mr-2" />
            Add Material
          </Button>
        </div>
      </div>

      {filteredMaterials.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground" data-testid="text-materials-empty">
            {populateDefaults.isPending ? (
              <div className="flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Loading default materials...</span>
              </div>
            ) : (
              <span>No materials found. Click "Add Material" to get started.</span>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-2">
          {filteredMaterials.map((material) => {
            const idx = material.originalIndex;
            const typeBadge = material.type === "paint" ? "default" : material.type === "primer" ? "secondary" : "outline";
            const customerPrice = (material.costPerUnit * (1 + material.markupPercentage / 100)).toFixed(2);
            return (
              <Card
                key={material.id || `new-${idx}`}
                className={!material.active ? "opacity-50" : ""}
                data-testid={`card-material-${idx}`}
              >
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    <Badge variant={typeBadge as any} className="text-xs shrink-0">{material.type}</Badge>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm truncate" data-testid={`text-material-name-${idx}`}>{material.materialName || "Unnamed"}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {material.brand}{material.finish ? ` - ${material.finish}` : ""}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2 pl-1">
                    <span className="text-sm font-medium" data-testid={`text-material-price-${idx}`}>${customerPrice}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2.5 text-xs"
                      onClick={() => openEditModal(material)}
                      data-testid={`button-edit-material-${idx}`}
                    >
                      <Pencil className="w-3 h-3 mr-1" />
                      Edit
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {filteredMaterials.length > 0 && (
        <div className="flex items-center gap-4 flex-wrap text-sm text-muted-foreground pt-2">
          <span><strong className="text-foreground">{filteredMaterials.filter(m => m.active).length}</strong> active</span>
          <span><strong className="text-foreground">{filteredMaterials.filter(m => !m.active).length}</strong> inactive</span>
          <span><strong className="text-foreground">{filteredMaterials.filter(m => m.type === "paint" && m.active).length}</strong> paints</span>
          <span><strong className="text-foreground">{filteredMaterials.filter(m => m.type === "primer" && m.active).length}</strong> primers</span>
          <span><strong className="text-foreground">{filteredMaterials.filter(m => m.type === "sundries" && m.active).length}</strong> sundries</span>
        </div>
      )}

      <Dialog open={materialModalOpen} onOpenChange={setMaterialModalOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{editingMaterial?.id ? "Edit Material" : "Add Material"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-sm">Material Name</Label>
              <Input
                value={modalForm.materialName}
                onChange={(e) => setModalForm(prev => ({ ...prev, materialName: e.target.value }))}
                placeholder="e.g. Regal Select Interior"
                data-testid="input-modal-material-name"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">Brand</Label>
                <Input
                  value={modalForm.brand}
                  onChange={(e) => setModalForm(prev => ({ ...prev, brand: e.target.value }))}
                  placeholder="Brand"
                  data-testid="input-modal-brand"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Type</Label>
                <Select value={modalForm.type} onValueChange={(v) => setModalForm(prev => ({ ...prev, type: v }))}>
                  <SelectTrigger data-testid="select-modal-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="paint">Paint</SelectItem>
                    <SelectItem value="primer">Primer</SelectItem>
                    <SelectItem value="sundries">Sundries</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">Finish</Label>
                <Input
                  value={modalForm.finish || ""}
                  onChange={(e) => setModalForm(prev => ({ ...prev, finish: e.target.value || null }))}
                  placeholder={modalForm.type === "sundries" ? "N/A" : "e.g. Eggshell"}
                  disabled={modalForm.type === "sundries"}
                  data-testid="input-modal-finish"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Coverage (sqft/gal)</Label>
                <Input
                  type="number"
                  step="1"
                  min="0"
                  value={modalForm.coverageSqftPerGallon ?? ""}
                  onChange={(e) => setModalForm(prev => ({ ...prev, coverageSqftPerGallon: e.target.value ? parseFloat(e.target.value) : null }))}
                  placeholder={modalForm.type === "sundries" ? "N/A" : "sqft/gal"}
                  disabled={modalForm.type === "sundries"}
                  data-testid="input-modal-coverage"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">Cost / Unit ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={modalForm.costPerUnit || ""}
                  onChange={(e) => setModalForm(prev => ({ ...prev, costPerUnit: parseFloat(e.target.value) || 0 }))}
                  placeholder="0.00"
                  data-testid="input-modal-cost"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Markup %</Label>
                <Input
                  type="number"
                  step="1"
                  min="0"
                  value={modalForm.markupPercentage || ""}
                  onChange={(e) => setModalForm(prev => ({ ...prev, markupPercentage: parseFloat(e.target.value) || 0 }))}
                  placeholder="0"
                  data-testid="input-modal-markup"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">Customer Price ($)</Label>
                <Input
                  type="text"
                  readOnly
                  value={(modalForm.costPerUnit * (1 + modalForm.markupPercentage / 100)).toFixed(2)}
                  className="bg-muted/50"
                  data-testid="input-modal-customer-price"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Waste %</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={modalForm.wastePercentage ?? ""}
                  onChange={(e) => setModalForm(prev => ({ ...prev, wastePercentage: parseFloat(e.target.value) || 0 }))}
                  placeholder="0.10"
                  data-testid="input-modal-waste"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={modalForm.active}
                onCheckedChange={(checked) => setModalForm(prev => ({ ...prev, active: checked }))}
                data-testid="switch-modal-active"
              />
              <Label className="text-sm">{modalForm.active ? "Active" : "Inactive"}</Label>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            {editingMaterial?.id && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setDeleteConfirmMaterial(editingMaterial)}
                className="sm:mr-auto"
                data-testid="button-modal-delete-material"
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Delete
              </Button>
            )}
            <Button variant="outline" onClick={() => setMaterialModalOpen(false)} data-testid="button-modal-cancel">
              Cancel
            </Button>
            <Button
              onClick={handleModalSave}
              disabled={updateMaterial.isPending || createMaterial.isPending}
              data-testid="button-modal-save-material"
            >
              {(updateMaterial.isPending || createMaterial.isPending) ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-1" />
              )}
              {editingMaterial?.id ? "Save Changes" : "Add Material"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteConfirmMaterial} onOpenChange={(open) => { if (!open) setDeleteConfirmMaterial(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Material?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteConfirmMaterial?.materialName}"? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-material">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmMaterial && handleDeleteMaterial(deleteConfirmMaterial)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-material"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!pendingMaterialCSVRows} onOpenChange={(open) => { if (!open) setPendingMaterialCSVRows(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Overwrite Existing Materials?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Uploading this CSV will overwrite any existing materials that share the same name and brand. Your current pricing, coverage, waste, and markup settings for matching materials will be replaced with the data from the file. New materials will be added. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-material-csv-import">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingMaterialCSVRows) {
                  importMaterialsCSV.mutate(pendingMaterialCSVRows);
                }
                setPendingMaterialCSVRows(null);
              }}
              data-testid="button-confirm-material-csv-import"
            >
              Yes, Import & Overwrite
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatHoursFromSeconds(totalSec: number): string {
  const hrs = totalSec / 3600;
  if (hrs < 1) return `${Math.round(hrs * 60)} min`;
  return `${Math.round(hrs * 100) / 100} hrs`;
}

type TimerStep = 'setup' | 'running' | 'paused' | 'results';

function CalculatorsTab() {
  const { toast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [step, setStep] = useState<TimerStep>('setup');
  const [calcSurfaceId, setCalcSurfaceId] = useState<string>("");
  const [calcMaterialId, setCalcMaterialId] = useState<string>("");
  const [calcTeamMemberId, setCalcTeamMemberId] = useState<string>("");
  const [goalSqft, setGoalSqft] = useState<string>("");
  const [painterName, setPainterName] = useState("");
  const [startTimestamp, setStartTimestamp] = useState<number>(0);
  const [accumulatedMs, setAccumulatedMs] = useState<number>(0);
  const [displaySeconds, setDisplaySeconds] = useState(0);
  const [finalSeconds, setFinalSeconds] = useState(0);
  const [actualSqft, setActualSqft] = useState<string>("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: calculators = [], isLoading } = useQuery<ProductionCalculator[]>({ queryKey: ['/api/production-calculators'] });
  const { data: surfacesList = [] } = useQuery<Surface[]>({ queryKey: ['/api/surfaces'] });
  const { data: materialsList = [] } = useQuery<Material[]>({ queryKey: ['/api/materials'] });
  const { data: crewMembers = [] } = useQuery<TeamMember[]>({ queryKey: ['/api/team-members'] });

  const createCalc = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest('POST', '/api/production-calculators', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/production-calculators'] });
      toast({ title: "Recorded!", description: "Production rate saved" });
      closeModal();
    },
    onError: () => toast({ title: "Error", description: "Failed to save", variant: "destructive" }),
  });

  const updateCalc = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const res = await apiRequest('PUT', `/api/production-calculators/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/production-calculators'] });
      queryClient.invalidateQueries({ queryKey: ['/api/surfaces'] });
      toast({ title: "Updated" });
    },
    onError: () => toast({ title: "Error", description: "Failed to update", variant: "destructive" }),
  });

  const deleteCalc = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('DELETE', `/api/production-calculators/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/production-calculators'] });
      toast({ title: "Deleted" });
      setDeleteId(null);
    },
  });

  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const clearTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const closeModal = () => {
    clearTimer();
    setModalOpen(false);
    setStep('setup');
    setCalcSurfaceId("");
    setCalcMaterialId("");
    setCalcTeamMemberId("");
    setGoalSqft("");
    setPainterName("");
    setStartTimestamp(0);
    setAccumulatedMs(0);
    setDisplaySeconds(0);
    setFinalSeconds(0);
    setActualSqft("");
    setConfirmDiscard(false);
  };

  const tryClose = () => {
    if (step === 'running' || step === 'paused') {
      setConfirmDiscard(true);
    } else {
      closeModal();
    }
  };

  const tickTimer = () => {
    setStartTimestamp(prev => {
      const now = Date.now();
      const liveMs = now - prev;
      setAccumulatedMs(acc => {
        setDisplaySeconds(Math.floor((acc + liveMs) / 1000));
        return acc;
      });
      return prev;
    });
  };

  const startTimer = () => {
    if (!calcSurfaceId || calcSurfaceId === 'none') {
      toast({ title: "Select a Surface", description: "Pick which surface you're painting", variant: "destructive" });
      return;
    }
    clearTimer();
    setAccumulatedMs(0);
    setDisplaySeconds(0);
    setStartTimestamp(Date.now());
    setStep('running');
    timerRef.current = setInterval(tickTimer, 250);
  };

  const pauseTimer = () => {
    const now = Date.now();
    clearTimer();
    setStartTimestamp(ts => {
      setAccumulatedMs(prev => {
        const newAcc = prev + (now - ts);
        setDisplaySeconds(Math.floor(newAcc / 1000));
        return newAcc;
      });
      return ts;
    });
    setStep('paused');
  };

  const resumeTimer = () => {
    clearTimer();
    setStartTimestamp(Date.now());
    setStep('running');
    timerRef.current = setInterval(tickTimer, 250);
  };

  const stopTimer = () => {
    const now = Date.now();
    clearTimer();
    setStartTimestamp(ts => {
      setAccumulatedMs(acc => {
        const totalMs = step === 'running' ? acc + (now - ts) : acc;
        const totalSec = Math.round(totalMs / 1000);
        setFinalSeconds(totalSec);
        setDisplaySeconds(totalSec);
        return totalMs;
      });
      return ts;
    });
    if (goalSqft) setActualSqft(goalSqft);
    setStep('results');
  };

  useEffect(() => {
    return () => { clearTimer(); };
  }, []);

  const totalSeconds = step === 'results' ? finalSeconds : displaySeconds;
  const totalHours = totalSeconds / 3600;
  const areaDone = parseFloat(actualSqft) || 0;
  const calculatedRate = areaDone > 0 && totalHours > 0 ? Math.round((areaDone / totalHours) * 100) / 100 : 0;

  const handleRecord = () => {
    if (areaDone <= 0) {
      toast({ title: "Enter Area", description: "How many sqft did you paint?", variant: "destructive" });
      return;
    }
    const surface = surfacesList.find(s => s.id.toString() === calcSurfaceId);
    const member = crewMembers.find(m => m.id.toString() === calcTeamMemberId);
    const displayName = member?.name || painterName.trim() || (surface ? surface.surfaceName : 'Timed Session');
    createCalc.mutate({
      name: `${displayName} - ${new Date().toLocaleDateString()}`,
      surfaceId: calcSurfaceId && calcSurfaceId !== 'none' ? parseInt(calcSurfaceId) : null,
      materialId: calcMaterialId && calcMaterialId !== 'none' ? parseInt(calcMaterialId) : null,
      teamMemberId: calcTeamMemberId && calcTeamMemberId !== 'none' && calcTeamMemberId !== 'manual' ? parseInt(calcTeamMemberId) : null,
      painters: [{
        name: member?.name || painterName.trim() || 'Painter',
        areaPainted: areaDone,
        timeTaken: totalHours,
        sqftPerHour: calculatedRate,
      }],
    });
  };

  const toggleUseAsRate = (calc: ProductionCalculator) => {
    if (!calc.surfaceId) {
      toast({ title: "No Surface Linked", description: "This calculation needs a surface to apply the rate to", variant: "destructive" });
      return;
    }
    if (calc.averageRate <= 0) {
      toast({ title: "No Rate", description: "No calculated rate available", variant: "destructive" });
      return;
    }
    updateCalc.mutate({ id: calc.id, useAsProductionRate: !calc.useAsProductionRate });
  };

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold" data-testid="text-calculators-title">Production Calculators</h3>
          <p className="text-sm text-muted-foreground">Time yourself painting, get your real production rate</p>
        </div>
        <Button onClick={() => { closeModal(); setModalOpen(true); }} className="gap-2" data-testid="button-start-calculation">
          <Play className="w-4 h-4" /> Start Calculation
        </Button>
      </div>

      {calculators.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Timer className="w-12 h-12 mx-auto text-muted-foreground/40 mb-4" />
            <h4 className="font-semibold mb-1">No Calculations Yet</h4>
            <p className="text-sm text-muted-foreground mb-4">Start a timer while you paint, and we'll calculate your exact sqft/hour rate.</p>
            <Button onClick={() => { closeModal(); setModalOpen(true); }} className="gap-2" data-testid="button-first-calculation">
              <Play className="w-4 h-4" /> Start Your First Calculation
            </Button>
          </CardContent>
        </Card>
      )}

      {calculators.map(calc => {
        const surface = surfacesList.find(s => s.id === calc.surfaceId);
        const material = materialsList.find(m => m.id === calc.materialId);
        const member = crewMembers.find(m => m.id === calc.teamMemberId);
        const painterData = (calc.painters as any[]) || [];
        const p = painterData[0];
        const timeStr = p?.timeTaken ? formatHoursFromSeconds(p.timeTaken * 3600) : '';
        return (
          <Card key={calc.id} data-testid={`card-calculator-${calc.id}`}>
            <CardContent className="py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Timer className="w-5 h-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-semibold text-sm truncate" data-testid={`text-calc-name-${calc.id}`}>{calc.name}</h4>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
                      {member && <><span className="font-medium">{member.name}</span><span>·</span></>}
                      {surface && <span>{surface.surfaceName}</span>}
                      {material && <><span>·</span><span>{material.materialName}</span></>}
                      {p?.areaPainted && <><span>·</span><span>{p.areaPainted} sqft</span></>}
                      {timeStr && <><span>·</span><span>{timeStr}</span></>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="text-right mr-1">
                    <p className="text-xl font-bold tabular-nums text-primary" data-testid={`text-calc-rate-${calc.id}`}>
                      {calc.averageRate > 0 ? calc.averageRate : '—'}
                    </p>
                    <p className="text-[10px] text-muted-foreground">sqft/hr</p>
                  </div>
                  <div className="flex flex-col items-center gap-0.5">
                    <Switch
                      checked={!!calc.useAsProductionRate}
                      onCheckedChange={() => toggleUseAsRate(calc)}
                      data-testid={`switch-use-rate-${calc.id}`}
                    />
                    <span className="text-[10px] text-muted-foreground">Apply</span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive/70 hover:text-destructive" onClick={() => setDeleteId(calc.id)} data-testid={`button-delete-calc-${calc.id}`}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              {calc.useAsProductionRate && surface && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-600">
                  <Check className="w-3.5 h-3.5" />
                  Applied to "{surface.surfaceName}" at {calc.averageRate} sqft/hr
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      <Dialog open={modalOpen} onOpenChange={(open) => { if (!open) tryClose(); }}>
        <DialogContent className="sm:max-w-md" onInteractOutside={(e) => { if (step === 'running' || step === 'paused') e.preventDefault(); }}>
          {step === 'setup' && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Timer className="w-5 h-5 text-primary" />
                  Start Production Calculation
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label>Surface <span className="text-destructive">*</span></Label>
                  <Select value={calcSurfaceId} onValueChange={setCalcSurfaceId}>
                    <SelectTrigger data-testid="select-timer-surface">
                      <SelectValue placeholder="What are you painting?" />
                    </SelectTrigger>
                    <SelectContent>
                      {surfacesList.map(s => (
                        <SelectItem key={s.id} value={s.id.toString()}>{s.surfaceName} ({s.estimateType})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Material (optional)</Label>
                  <Select value={calcMaterialId} onValueChange={setCalcMaterialId}>
                    <SelectTrigger data-testid="select-timer-material">
                      <SelectValue placeholder="What paint/material?" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {materialsList.filter(m => m.active).map(m => (
                        <SelectItem key={m.id} value={m.id.toString()}>{m.materialName} ({m.brand})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Who's Painting?</Label>
                  {crewMembers.filter(m => m.isActive).length > 0 ? (
                    <Select value={calcTeamMemberId} onValueChange={(val) => {
                      setCalcTeamMemberId(val);
                      if (val === 'none') {
                        setPainterName("");
                      } else if (val === 'manual') {
                        setPainterName("");
                      } else if (val) {
                        const m = crewMembers.find(c => c.id.toString() === val);
                        if (m) setPainterName(m.name);
                      }
                    }}>
                      <SelectTrigger data-testid="select-timer-crew">
                        <SelectValue placeholder="Choose team member..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Skip / No one specific</SelectItem>
                        <SelectItem value="manual">Type a name instead</SelectItem>
                        {crewMembers.filter(m => m.isActive).map(m => (
                          <SelectItem key={m.id} value={m.id.toString()}>
                            {m.name} {m.role ? `(${m.role})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input placeholder="Painter name (optional)" value={painterName} onChange={e => setPainterName(e.target.value)} data-testid="input-timer-painter" />
                  )}
                  {calcTeamMemberId === 'manual' && (
                    <Input placeholder="Painter name" value={painterName} onChange={e => setPainterName(e.target.value)} className="mt-2" data-testid="input-timer-painter-manual" />
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Goal (optional)</Label>
                  <div className="relative">
                    <Input
                      type="number"
                      placeholder="How much sqft do you plan to cover?"
                      value={goalSqft}
                      onChange={e => setGoalSqft(e.target.value)}
                      className="pr-12"
                      data-testid="input-timer-goal"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">sqft</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Set a goal and we'll pre-fill it when you're done. Leave blank to enter after.</p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeModal} data-testid="button-cancel-timer">Cancel</Button>
                <Button onClick={startTimer} className="gap-2 bg-emerald-600 hover:bg-emerald-700" data-testid="button-go-start">
                  <Play className="w-4 h-4" /> Start Timer
                </Button>
              </DialogFooter>
            </>
          )}

          {(step === 'running' || step === 'paused') && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base">
                  {step === 'running' ? (
                    <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" /> Painting in Progress</span>
                  ) : (
                    <span className="flex items-center gap-2"><Pause className="w-4 h-4 text-amber-500" /> Paused</span>
                  )}
                </DialogTitle>
              </DialogHeader>
              <div className="py-6 text-center space-y-6">
                <div>
                  <p className="text-6xl font-bold tabular-nums tracking-tight" data-testid="text-timer-display">
                    {formatTime(displaySeconds)}
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    {surfacesList.find(s => s.id.toString() === calcSurfaceId)?.surfaceName || 'Surface'}
                    {goalSqft ? ` · Goal: ${goalSqft} sqft` : ''}
                  </p>
                </div>
                <div className="flex items-center justify-center gap-3">
                  {step === 'running' ? (
                    <Button variant="outline" size="lg" onClick={pauseTimer} className="gap-2 px-6" data-testid="button-pause-timer">
                      <Pause className="w-5 h-5" /> Pause
                    </Button>
                  ) : (
                    <Button variant="outline" size="lg" onClick={resumeTimer} className="gap-2 px-6" data-testid="button-resume-timer">
                      <Play className="w-5 h-5" /> Resume
                    </Button>
                  )}
                  <Button size="lg" onClick={stopTimer} className="gap-2 px-8 bg-red-600 hover:bg-red-700" data-testid="button-stop-timer">
                    <Square className="w-5 h-5" /> Done
                  </Button>
                </div>
              </div>
            </>
          )}

          {step === 'results' && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-primary" />
                  Your Results
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-muted/50 border text-center">
                    <Clock className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
                    <p className="text-lg font-bold tabular-nums" data-testid="text-result-time">{formatTime(finalSeconds)}</p>
                    <p className="text-[10px] text-muted-foreground">Total Time</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50 border text-center">
                    <Ruler className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
                    <p className="text-lg font-bold tabular-nums">{areaDone > 0 ? areaDone : '—'}</p>
                    <p className="text-[10px] text-muted-foreground">Sqft Painted</p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="result-sqft" className="text-sm font-medium">How many sqft did you paint?</Label>
                  <div className="relative">
                    <Input
                      id="result-sqft"
                      type="number"
                      inputMode="decimal"
                      value={actualSqft}
                      onChange={e => setActualSqft(e.target.value)}
                      placeholder="Enter sqft painted"
                      className="text-lg font-semibold h-12 pr-14"
                      autoFocus
                      data-testid="input-result-sqft"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">sqft</span>
                  </div>
                </div>

                <div className="p-5 rounded-xl bg-primary/5 border border-primary/20 text-center">
                  <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wide font-medium">Your Production Rate</p>
                  <p className="text-4xl font-bold tabular-nums text-primary" data-testid="text-result-rate">
                    {calculatedRate > 0 ? calculatedRate : '—'}
                  </p>
                  <p className="text-sm text-muted-foreground">sqft / hour</p>
                  {areaDone > 0 && calculatedRate > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">{areaDone} sqft in {formatTime(finalSeconds)}</p>
                  )}
                </div>

                <p className="text-xs text-muted-foreground text-center">
                  {(() => {
                    const memberName = calcTeamMemberId && calcTeamMemberId !== 'none' && calcTeamMemberId !== 'manual'
                      ? crewMembers.find(m => m.id.toString() === calcTeamMemberId)?.name
                      : painterName;
                    const surfaceName = surfacesList.find(s => s.id.toString() === calcSurfaceId)?.surfaceName;
                    return [memberName, surfaceName].filter(Boolean).join(' · ');
                  })()}
                </p>
              </div>
              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button variant="outline" onClick={closeModal} className="flex-1" data-testid="button-discard-result">Discard</Button>
                <Button
                  onClick={handleRecord}
                  disabled={createCalc.isPending || calculatedRate <= 0}
                  className="flex-1 gap-2 bg-emerald-600 hover:bg-emerald-700"
                  data-testid="button-record-result"
                >
                  {createCalc.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  <Check className="w-4 h-4" /> Record Result
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this session?</AlertDialogTitle>
            <AlertDialogDescription>Your timer is still active. Closing now will lose all progress.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-discard">Keep Going</AlertDialogCancel>
            <AlertDialogAction onClick={closeModal} data-testid="button-confirm-discard">Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteId !== null} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this calculation?</AlertDialogTitle>
            <AlertDialogDescription>This removes the recorded rate. Your surface production rates won't be changed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-calc">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteCalc.mutate(deleteId)} data-testid="button-confirm-delete-calc">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
