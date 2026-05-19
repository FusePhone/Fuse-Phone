import { Paintbrush, Hammer, Home, Fence, Layers, Package, Palette, Droplets, type LucideIcon } from "lucide-react";

const MATERIAL_ICON_MAP: Record<string, LucideIcon> = {
  paint: Paintbrush,
  primer: Paintbrush,
  stain: Paintbrush,
  coating: Paintbrush,
  concrete: Hammer,
  roofing: Home,
  decking: Fence,
  wood: Fence,
  siding: Layers,
  sundries: Package,
  supplies: Package,
  epoxy: Droplets,
  sealant: Droplets,
  sealer: Droplets,
};

export function getMaterialIcon(type?: string): LucideIcon {
  if (!type) return Paintbrush;
  const key = type.toLowerCase().trim();
  return MATERIAL_ICON_MAP[key] || Palette;
}

const MATERIAL_PDF_LABEL_MAP: Record<string, string> = {
  paint: "Paint",
  primer: "Primer",
  stain: "Stain",
  coating: "Coating",
  concrete: "Concrete",
  roofing: "Roofing",
  decking: "Decking",
  wood: "Wood",
  siding: "Siding",
  sundries: "Sundries",
  supplies: "Supplies",
  epoxy: "Epoxy",
  sealant: "Sealant",
  sealer: "Sealer",
};

export function getMaterialPdfLabel(type?: string): string {
  if (!type) return "Paint";
  const key = type.toLowerCase().trim();
  return MATERIAL_PDF_LABEL_MAP[key] || type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
}
