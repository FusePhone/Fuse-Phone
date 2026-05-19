import { db } from "./db";
import { proposalPackages, packageFeaturesLibrary, packageFeatureAssignments, users } from "@shared/schema";
import { eq } from "drizzle-orm";

const DEFAULT_PACKAGES = [
  {
    name: "Essential",
    description: "Quality workmanship with premium paint and thorough preparation.",
    recommended: false,
    priceAdjustmentType: "percent" as const,
    adjustmentValue: 0,
    materialMultiplier: 1.0,
    sortOrder: 0,
    features: [
      { name: "Premium Paint", included: true },
      { name: "Full Surface Prep", included: true },
      { name: "Color Consultation", included: false },
      { name: "Trim & Baseboard Detail", included: false },
      { name: "Final Walkthrough & Touch-Ups", included: true },
      { name: "Floor & Furniture Protection", included: false },
      { name: "Caulking & Sealing", included: false },
      { name: "Ceiling Painting", included: false },
      { name: "Wall Repair & Patching", included: false },
    ],
  },
  {
    name: "Professional",
    description: "Our most popular option with premium paint, full prep, and detailed trim work.",
    recommended: true,
    priceAdjustmentType: "percent" as const,
    adjustmentValue: 15,
    materialMultiplier: 1.15,
    sortOrder: 1,
    features: [
      { name: "Premium Paint", included: true },
      { name: "Full Surface Prep", included: true },
      { name: "Color Consultation", included: true },
      { name: "Trim & Baseboard Detail", included: true },
      { name: "Final Walkthrough & Touch-Ups", included: true },
      { name: "Floor & Furniture Protection", included: true },
      { name: "Caulking & Sealing", included: true },
      { name: "Ceiling Painting", included: false },
      { name: "Wall Repair & Patching", included: false },
    ],
  },
  {
    name: "Signature",
    description: "Top-tier finishes with designer-grade paint, meticulous detail, and full protection.",
    recommended: false,
    priceAdjustmentType: "percent" as const,
    adjustmentValue: 30,
    materialMultiplier: 1.3,
    sortOrder: 2,
    features: [
      { name: "Premium Paint", included: true },
      { name: "Full Surface Prep", included: true },
      { name: "Color Consultation", included: true },
      { name: "Trim & Baseboard Detail", included: true },
      { name: "Final Walkthrough & Touch-Ups", included: true },
      { name: "Floor & Furniture Protection", included: true },
      { name: "Caulking & Sealing", included: true },
      { name: "Ceiling Painting", included: true },
      { name: "Wall Repair & Patching", included: true },
    ],
  },
];

const DEFAULT_FEATURE_LIBRARY = [
  { title: "Premium Paint", description: "High-quality paint with excellent coverage and durability" },
  { title: "Full Surface Prep", description: "Thorough cleaning, sanding, patching, and priming of all surfaces" },
  { title: "Color Consultation", description: "Professional color selection guidance to find the perfect palette" },
  { title: "Trim & Baseboard Detail", description: "Careful painting of all trim, baseboards, and door frames" },
  { title: "Final Walkthrough & Touch-Ups", description: "Complete inspection with any needed touch-ups before handoff" },
  { title: "Floor & Furniture Protection", description: "Full masking and protection of flooring, furniture, and fixtures" },
  { title: "Caulking & Sealing", description: "Professional caulking around windows, doors, and trim for a clean finish" },
  { title: "Ceiling Painting", description: "Full ceiling painting with proper coverage and finish" },
  { title: "Wall Repair & Patching", description: "Repair holes, cracks, and imperfections before painting" },
];


export async function seedDefaultPackagesForUser(userId: string): Promise<void> {
  try {
    const existing = await db
      .select({ id: proposalPackages.id })
      .from(proposalPackages)
      .where(eq(proposalPackages.userId, userId))
      .limit(1);

    if (existing.length > 0) return;

    for (const pkg of DEFAULT_PACKAGES) {
      await db.insert(proposalPackages).values({
        userId,
        name: pkg.name,
        description: pkg.description,
        recommended: pkg.recommended,
        priceAdjustmentType: pkg.priceAdjustmentType,
        adjustmentValue: pkg.adjustmentValue,
        materialMultiplier: pkg.materialMultiplier,
        sortOrder: pkg.sortOrder,
        features: pkg.features,
      });
    }

    const existingFeatures = await db
      .select({ id: packageFeaturesLibrary.id })
      .from(packageFeaturesLibrary)
      .where(eq(packageFeaturesLibrary.userId, userId))
      .limit(1);

    if (existingFeatures.length === 0) {
      for (const feat of DEFAULT_FEATURE_LIBRARY) {
        await db.insert(packageFeaturesLibrary).values({
          userId,
          title: feat.title,
          description: feat.description,
        });
      }
      console.log(`[Packages] Seeded default feature library for user ${userId}`);
    }

    console.log(`[Packages] Seeded default packages for user ${userId}`);
  } catch (err) {
    console.error(`[Packages] Error seeding packages for user ${userId}:`, err);
  }
}

export async function seedDefaultUpsellsForUser(_userId: string): Promise<void> {
}

export async function seedNewFeaturesForUser(userId: string): Promise<void> {
  try {
    const existingFeatures = await db
      .select({ id: packageFeaturesLibrary.id, title: packageFeaturesLibrary.title })
      .from(packageFeaturesLibrary)
      .where(eq(packageFeaturesLibrary.userId, userId));

    const existingTitles = new Set(existingFeatures.map(f => f.title));
    const newFeatures = DEFAULT_FEATURE_LIBRARY.filter(f => !existingTitles.has(f.title));

    for (const feat of newFeatures) {
      await db.insert(packageFeaturesLibrary).values({
        userId,
        title: feat.title,
        description: feat.description,
      });
    }
    if (newFeatures.length > 0) {
      console.log(`[Packages] Added ${newFeatures.length} new features for user ${userId}`);
    }
  } catch (err) {
    console.error(`[Packages] Error seeding new features for user ${userId}:`, err);
  }
}

export async function seedDefaultPackagesForAllUsers(): Promise<void> {
  try {
    const allUsers = await db.select({ id: users.id }).from(users);
    if (allUsers.length === 0) return;

    for (const user of allUsers) {
      await seedDefaultPackagesForUser(user.id);
      await seedDefaultUpsellsForUser(user.id);
      await seedNewFeaturesForUser(user.id);
    }
    console.log("[Packages] Default package seed complete.");
  } catch (err) {
    console.error("[Packages] Error seeding default packages:", err);
  }
}
