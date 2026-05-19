import type { DocumentContent, PackageSnapshot, ProposalPackage, UnifiedLineItem } from "@shared/schema";

export interface PackagePricingResult {
  baseTotal: number;
  packageAdjustment: number;
  upsellsTotal: number;
  finalTotal: number;
  selectedPackage?: PackageSnapshot;
}

export function calculateBaseTotal(items: UnifiedLineItem[], acceptedOptionals?: string[]): number {
  let total = 0;
  for (const item of items) {
    if (item.descriptionOnly) continue;
    if (item.isOptional) {
      const itemKey = item.name || item.description;
      if (!acceptedOptionals?.includes(itemKey)) continue;
    }
    total += item.total || 0;
  }
  return total;
}

export function calculateBaseMaterialTotal(content: DocumentContent): number {
  let materialTotal = 0;
  if (content.roomBuilderData) {
    materialTotal += content.roomBuilderData.totalMaterialCost || 0;
  }
  if (content.productionRateBlocks) {
    for (const block of content.productionRateBlocks) {
      if (block.roomBuilderData) {
        materialTotal += block.roomBuilderData.totalMaterialCost || 0;
      }
    }
  }
  return materialTotal;
}

export function calculatePackagePricing(
  content: DocumentContent,
  selectedPackage?: PackageSnapshot | null,
  _selectedUpsells?: unknown[],
  packageMaterialAdjustments?: boolean,
): PackagePricingResult {
  const baseTotal = calculateBaseTotal(content.items, content.acceptedOptionalItems);

  let packageAdjustment = 0;
  if (selectedPackage) {
    if (packageMaterialAdjustments && selectedPackage.materialMultiplier !== 1.0) {
      const materialTotal = calculateBaseMaterialTotal(content);
      const materialAdjustment = materialTotal * (selectedPackage.materialMultiplier - 1.0);
      packageAdjustment += materialAdjustment;
    }

    if (selectedPackage.priceAdjustmentType === 'percent') {
      packageAdjustment += baseTotal * (selectedPackage.adjustmentValue / 100);
    } else if (selectedPackage.priceAdjustmentType === 'flat') {
      packageAdjustment += Math.round((selectedPackage.adjustmentValue || 0) * 100);
    }
  }

  return {
    baseTotal,
    packageAdjustment,
    upsellsTotal: 0,
    finalTotal: baseTotal + packageAdjustment,
    selectedPackage: selectedPackage || undefined,
  };
}

export function packageToSnapshot(pkg: ProposalPackage): PackageSnapshot {
  return {
    id: pkg.id,
    name: pkg.name,
    description: pkg.description || undefined,
    recommended: pkg.recommended || false,
    priceAdjustmentType: (pkg.priceAdjustmentType as 'percent' | 'flat') || 'percent',
    adjustmentValue: pkg.adjustmentValue || 0,
    materialMultiplier: pkg.materialMultiplier || 1.0,
    features: pkg.features || [],
  };
}

export function calculatePackagePrice(baseTotalCents: number, pkg: PackageSnapshot): number {
  if (pkg.priceAdjustmentType === 'percent') {
    return baseTotalCents + baseTotalCents * (pkg.adjustmentValue / 100);
  }
  return baseTotalCents + Math.round((pkg.adjustmentValue || 0) * 100);
}
