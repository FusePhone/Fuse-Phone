import { db } from "./db";
import { sql } from "drizzle-orm";

const SEED_MATERIALS = [
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
  { materialName: "Gallery Series Waterborne Topcoat", brand: "Sherwin-Williams", type: "paint", finish: "Satin/Semi-Gloss", coverageSqftPerGallon: 350, costPerUnit: 70, wastePercentage: 0.10 },

  { materialName: "BIN Shellac-Base Primer", brand: "Zinsser", type: "primer", finish: null, coverageSqftPerGallon: 400, costPerUnit: 55, wastePercentage: 0.10 },
  { materialName: "Bulls Eye 1-2-3 Primer", brand: "Zinsser", type: "primer", finish: null, coverageSqftPerGallon: 400, costPerUnit: 40, wastePercentage: 0.10 },
  { materialName: "Kilz Original Primer", brand: "Kilz", type: "primer", finish: null, coverageSqftPerGallon: 400, costPerUnit: 28, wastePercentage: 0.10 },
  { materialName: "Kilz 2 All-Purpose Primer", brand: "Kilz", type: "primer", finish: null, coverageSqftPerGallon: 400, costPerUnit: 25, wastePercentage: 0.10 },

  { materialName: "Caulk (tube)", brand: "Generic", type: "sundries", finish: null, coverageSqftPerGallon: null, costPerUnit: 4, wastePercentage: 0 },
  { materialName: "Plastic & Masking Materials", brand: "Generic", type: "sundries", finish: null, coverageSqftPerGallon: null, costPerUnit: 25, wastePercentage: 0 },
  { materialName: "Roller Covers", brand: "Generic", type: "sundries", finish: null, coverageSqftPerGallon: null, costPerUnit: 8, wastePercentage: 0 },
  { materialName: "Sandpaper & Prep Materials", brand: "Generic", type: "sundries", finish: null, coverageSqftPerGallon: null, costPerUnit: 15, wastePercentage: 0 },
  { materialName: "Painter's Tape", brand: "Generic", type: "sundries", finish: null, coverageSqftPerGallon: null, costPerUnit: 7, wastePercentage: 0 },
  { materialName: "Drop Cloths", brand: "Generic", type: "sundries", finish: null, coverageSqftPerGallon: null, costPerUnit: 12, wastePercentage: 0 },
  { materialName: "Wood Filler / Spackle", brand: "Generic", type: "sundries", finish: null, coverageSqftPerGallon: null, costPerUnit: 10, wastePercentage: 0 },
];

const SEED_SURFACES = [
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

  { surfaceName: "Cabinet Doors", unit: "each", productionRateUnitsPerLaborHour: 1.5, defaultCoats: 2, rateCategory: "Cabinets", estimateType: "Kitchen Cabinets" },
  { surfaceName: "Cabinet Drawers", unit: "each", productionRateUnitsPerLaborHour: 2, defaultCoats: 2, rateCategory: "Cabinets", estimateType: "Kitchen Cabinets" },
  { surfaceName: "Cabinet Boxes / Frames", unit: "each", productionRateUnitsPerLaborHour: 1, defaultCoats: 2, rateCategory: "Cabinets", estimateType: "Kitchen Cabinets" },
  { surfaceName: "Side Panels", unit: "each", productionRateUnitsPerLaborHour: 1.5, defaultCoats: 2, rateCategory: "Cabinets", estimateType: "Kitchen Cabinets" },
  { surfaceName: "Cabinet Interiors", unit: "each", productionRateUnitsPerLaborHour: 0.8, defaultCoats: 2, rateCategory: "Cabinets", estimateType: "Kitchen Cabinets" },
  { surfaceName: "Islands", unit: "each", productionRateUnitsPerLaborHour: 0.5, defaultCoats: 2, rateCategory: "Cabinets", estimateType: "Kitchen Cabinets" },
];

export async function runProductionRatesExpansionSeed() {
  try {
    const flagCheck = await db.execute(sql`
      SELECT EXISTS(
        SELECT 1 FROM project_activities 
        WHERE content LIKE '%production_rates_expansion_seed_v1%'
        AND user_id = 'migration_marker'
      ) as done
    `);

    const isDone = (flagCheck as any).rows?.[0]?.done === true || (flagCheck as any).rows?.[0]?.done === 't';
    if (isDone) {
      console.log("[RatesExpansion] Already completed, skipping.");
      return;
    }
  } catch (err) {
    console.log("[RatesExpansion] project_activities table may not exist yet, skipping.");
    return;
  }

  try {
    console.log("[RatesExpansion] Starting production rates expansion seed for all users...");

    const usersResult = await db.execute(sql`SELECT DISTINCT id FROM users`);
    const userIds = (usersResult as any).rows?.map((r: any) => r.id) || [];
    console.log(`[RatesExpansion] Found ${userIds.length} users to process`);

    let totalMaterialsAdded = 0;
    let totalSurfacesAdded = 0;

    for (const userId of userIds) {
      const existingMatsResult = await db.execute(
        sql`SELECT material_name, brand FROM materials WHERE user_id = ${userId}`
      );
      const existingMats = new Set(
        ((existingMatsResult as any).rows || []).map(
          (r: any) => `${(r.material_name || '').toLowerCase()}|||${(r.brand || '').toLowerCase()}`
        )
      );

      let matsAdded = 0;
      for (const mat of SEED_MATERIALS) {
        const key = `${mat.materialName.toLowerCase()}|||${mat.brand.toLowerCase()}`;
        if (existingMats.has(key)) continue;

        await db.execute(sql`
          INSERT INTO materials (user_id, material_name, brand, type, finish, coverage_sqft_per_gallon, cost_per_unit, waste_percentage, markup_percentage, active)
          VALUES (${userId}, ${mat.materialName}, ${mat.brand}, ${mat.type}, ${mat.finish}, ${mat.coverageSqftPerGallon}, ${mat.costPerUnit}, ${mat.wastePercentage}, ${0}, ${true})
        `);
        matsAdded++;
      }

      const existingSurfsResult = await db.execute(
        sql`SELECT surface_name, estimate_type FROM surfaces WHERE user_id = ${userId}`
      );
      const existingSurfs = new Set(
        ((existingSurfsResult as any).rows || []).map(
          (r: any) => `${(r.surface_name || '').toLowerCase()}|||${(r.estimate_type || '').toLowerCase()}`
        )
      );

      let surfsAdded = 0;
      for (const surf of SEED_SURFACES) {
        const key = `${surf.surfaceName.toLowerCase()}|||${surf.estimateType.toLowerCase()}`;
        if (existingSurfs.has(key)) continue;

        const surfaceKey = surf.surfaceName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
        await db.execute(sql`
          INSERT INTO surfaces (user_id, surface_name, surface_key, unit, production_rate_units_per_labor_hour, default_coats, estimate_type, rate_category)
          VALUES (${userId}, ${surf.surfaceName}, ${surfaceKey}, ${surf.unit}, ${surf.productionRateUnitsPerLaborHour}, ${surf.defaultCoats}, ${surf.estimateType}, ${surf.rateCategory})
        `);
        surfsAdded++;
      }

      if (matsAdded > 0 || surfsAdded > 0) {
        console.log(`[RatesExpansion] User ${userId}: +${matsAdded} materials, +${surfsAdded} surfaces`);
      }
      totalMaterialsAdded += matsAdded;
      totalSurfacesAdded += surfsAdded;
    }

    await db.execute(sql`
      INSERT INTO project_activities (project_id, user_id, content, type, created_at)
      VALUES (0, 'migration_marker', 'production_rates_expansion_seed_v1', 'note', NOW())
    `);

    console.log(`[RatesExpansion] ✓ Completed! Added ${totalMaterialsAdded} materials and ${totalSurfacesAdded} surfaces across ${userIds.length} users`);
  } catch (err) {
    console.error("[RatesExpansion] Error:", err);
  }
}

const KITCHEN_CABINET_SURFACES = SEED_SURFACES.filter(s => s.estimateType === "Kitchen Cabinets");

export async function runKitchenCabinetsSeed() {
  try {
    const flagCheck = await db.execute(sql`
      SELECT EXISTS(
        SELECT 1 FROM project_activities 
        WHERE content LIKE '%production_rates_kitchen_cabinets_v1%'
        AND user_id = 'migration_marker'
      ) as done
    `);
    const isDone = (flagCheck as any).rows?.[0]?.done === true || (flagCheck as any).rows?.[0]?.done === 't';
    if (isDone) {
      console.log("[KitchenCabinets] Already completed, skipping.");
      return;
    }
  } catch (err) {
    console.log("[KitchenCabinets] project_activities table may not exist yet, skipping.");
    return;
  }

  try {
    console.log("[KitchenCabinets] Seeding Kitchen Cabinets surfaces for all users...");
    const usersResult = await db.execute(sql`SELECT DISTINCT id FROM users`);
    const userIds = (usersResult as any).rows?.map((r: any) => r.id) || [];
    let totalAdded = 0;

    for (const userId of userIds) {
      const existingSurfsResult = await db.execute(
        sql`SELECT surface_name, estimate_type FROM surfaces WHERE user_id = ${userId}`
      );
      const existingSurfs = new Set(
        ((existingSurfsResult as any).rows || []).map(
          (r: any) => `${(r.surface_name || '').toLowerCase()}|||${(r.estimate_type || '').toLowerCase()}`
        )
      );

      let added = 0;
      for (const surf of KITCHEN_CABINET_SURFACES) {
        const key = `${surf.surfaceName.toLowerCase()}|||${surf.estimateType.toLowerCase()}`;
        if (existingSurfs.has(key)) continue;
        const surfaceKey = surf.surfaceName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
        await db.execute(sql`
          INSERT INTO surfaces (user_id, surface_name, surface_key, unit, production_rate_units_per_labor_hour, default_coats, estimate_type, rate_category)
          VALUES (${userId}, ${surf.surfaceName}, ${surfaceKey}, ${surf.unit}, ${surf.productionRateUnitsPerLaborHour}, ${surf.defaultCoats}, ${surf.estimateType}, ${surf.rateCategory})
        `);
        added++;
      }
      if (added > 0) console.log(`[KitchenCabinets] User ${userId}: +${added} surfaces`);
      totalAdded += added;
    }

    await db.execute(sql`
      INSERT INTO project_activities (project_id, user_id, content, type, created_at)
      VALUES (0, 'migration_marker', 'production_rates_kitchen_cabinets_v1', 'note', NOW())
    `);

    console.log(`[KitchenCabinets] ✓ Completed! Added ${totalAdded} surfaces across ${userIds.length} users`);
  } catch (err) {
    console.error("[KitchenCabinets] Error:", err);
  }
}

const ADDITIONAL_PRIMERS_AND_PAINTS_V1 = [
  { materialName: "Gallery Series Waterborne Topcoat", brand: "Sherwin-Williams", type: "paint", finish: "Satin/Semi-Gloss", coverageSqftPerGallon: 350, costPerUnit: 70, wastePercentage: 0.10 },
  { materialName: "BIN Shellac-Base Primer", brand: "Zinsser", type: "primer", finish: null, coverageSqftPerGallon: 400, costPerUnit: 55, wastePercentage: 0.10 },
  { materialName: "Bulls Eye 1-2-3 Primer", brand: "Zinsser", type: "primer", finish: null, coverageSqftPerGallon: 400, costPerUnit: 40, wastePercentage: 0.10 },
  { materialName: "Kilz Original Primer", brand: "Kilz", type: "primer", finish: null, coverageSqftPerGallon: 400, costPerUnit: 28, wastePercentage: 0.10 },
  { materialName: "Kilz 2 All-Purpose Primer", brand: "Kilz", type: "primer", finish: null, coverageSqftPerGallon: 400, costPerUnit: 25, wastePercentage: 0.10 },
];

export async function runAdditionalPrimersAndPaintsSeed() {
  try {
    const flagCheck = await db.execute(sql`
      SELECT EXISTS(
        SELECT 1 FROM project_activities
        WHERE content LIKE '%additional_primers_and_paints_v1%'
        AND user_id = 'migration_marker'
      ) as done
    `);
    const isDone = (flagCheck as any).rows?.[0]?.done === true || (flagCheck as any).rows?.[0]?.done === 't';
    if (isDone) {
      console.log("[AdditionalPrimers] Already completed, skipping.");
      return;
    }
  } catch (err) {
    console.log("[AdditionalPrimers] project_activities table may not exist yet, skipping.");
    return;
  }

  try {
    console.log("[AdditionalPrimers] Seeding additional primers and SW Gallery topcoat for all users...");
    const usersResult = await db.execute(sql`SELECT DISTINCT id FROM users`);
    const userIds = (usersResult as any).rows?.map((r: any) => r.id) || [];
    let totalAdded = 0;

    for (const userId of userIds) {
      const existingMatsResult = await db.execute(
        sql`SELECT material_name, brand FROM materials WHERE user_id = ${userId}`
      );
      const existingMats = new Set(
        ((existingMatsResult as any).rows || []).map(
          (r: any) => `${(r.material_name || '').toLowerCase()}|||${(r.brand || '').toLowerCase()}`
        )
      );

      let added = 0;
      for (const mat of ADDITIONAL_PRIMERS_AND_PAINTS_V1) {
        const key = `${mat.materialName.toLowerCase()}|||${mat.brand.toLowerCase()}`;
        if (existingMats.has(key)) continue;
        await db.execute(sql`
          INSERT INTO materials (user_id, material_name, brand, type, finish, coverage_sqft_per_gallon, cost_per_unit, waste_percentage, markup_percentage, active)
          VALUES (${userId}, ${mat.materialName}, ${mat.brand}, ${mat.type}, ${mat.finish}, ${mat.coverageSqftPerGallon}, ${mat.costPerUnit}, ${mat.wastePercentage}, ${0}, ${true})
        `);
        added++;
      }
      if (added > 0) console.log(`[AdditionalPrimers] User ${userId}: +${added} materials`);
      totalAdded += added;
    }

    await db.execute(sql`
      INSERT INTO project_activities (project_id, user_id, content, type, created_at)
      VALUES (0, 'migration_marker', 'additional_primers_and_paints_v1', 'note', NOW())
    `);

    console.log(`[AdditionalPrimers] ✓ Completed! Added ${totalAdded} materials across ${userIds.length} users`);
  } catch (err) {
    console.error("[AdditionalPrimers] Error:", err);
  }
}

const ECO_SPEC_PAINTS_V1 = [
  { materialName: "Eco Spec WB Flat", brand: "Benjamin Moore", type: "paint", finish: "Flat", coverageSqftPerGallon: 400, costPerUnit: 45, wastePercentage: 0.10 },
  { materialName: "Eco Spec WB Eggshell", brand: "Benjamin Moore", type: "paint", finish: "Eggshell", coverageSqftPerGallon: 400, costPerUnit: 47, wastePercentage: 0.10 },
  { materialName: "Eco Spec WB Semi-Gloss", brand: "Benjamin Moore", type: "paint", finish: "Semi-Gloss", coverageSqftPerGallon: 400, costPerUnit: 49, wastePercentage: 0.10 },
  { materialName: "Eco Spec WB Interior Latex Primer", brand: "Benjamin Moore", type: "primer", finish: null, coverageSqftPerGallon: 400, costPerUnit: 42, wastePercentage: 0.10 },
];

export async function runEcoSpecPaintsSeed() {
  try {
    const flagCheck = await db.execute(sql`
      SELECT EXISTS(
        SELECT 1 FROM project_activities
        WHERE content LIKE '%eco_spec_paints_v1%'
        AND user_id = 'migration_marker'
      ) as done
    `);
    const isDone = (flagCheck as any).rows?.[0]?.done === true || (flagCheck as any).rows?.[0]?.done === 't';
    if (isDone) {
      console.log("[EcoSpec] Already completed, skipping.");
      return;
    }
  } catch (err) {
    console.log("[EcoSpec] project_activities table may not exist yet, skipping.");
    return;
  }

  try {
    console.log("[EcoSpec] Seeding Benjamin Moore Eco Spec line for all users...");
    const usersResult = await db.execute(sql`SELECT DISTINCT id FROM users`);
    const userIds = (usersResult as any).rows?.map((r: any) => r.id) || [];
    let totalAdded = 0;

    for (const userId of userIds) {
      const existingMatsResult = await db.execute(
        sql`SELECT material_name, brand FROM materials WHERE user_id = ${userId}`
      );
      const existingMats = new Set(
        ((existingMatsResult as any).rows || []).map(
          (r: any) => `${(r.material_name || '').toLowerCase()}|||${(r.brand || '').toLowerCase()}`
        )
      );

      let added = 0;
      for (const mat of ECO_SPEC_PAINTS_V1) {
        const key = `${mat.materialName.toLowerCase()}|||${mat.brand.toLowerCase()}`;
        if (existingMats.has(key)) continue;
        await db.execute(sql`
          INSERT INTO materials (user_id, material_name, brand, type, finish, coverage_sqft_per_gallon, cost_per_unit, waste_percentage, markup_percentage, active)
          VALUES (${userId}, ${mat.materialName}, ${mat.brand}, ${mat.type}, ${mat.finish}, ${mat.coverageSqftPerGallon}, ${mat.costPerUnit}, ${mat.wastePercentage}, ${0}, ${true})
        `);
        added++;
      }
      if (added > 0) console.log(`[EcoSpec] User ${userId}: +${added} materials`);
      totalAdded += added;
    }

    await db.execute(sql`
      INSERT INTO project_activities (project_id, user_id, content, type, created_at)
      VALUES (0, 'migration_marker', 'eco_spec_paints_v1', 'note', NOW())
    `);

    console.log(`[EcoSpec] ✓ Completed! Added ${totalAdded} materials across ${userIds.length} users`);
  } catch (err) {
    console.error("[EcoSpec] Error:", err);
  }
}
