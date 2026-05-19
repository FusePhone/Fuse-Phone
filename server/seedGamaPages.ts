import { db } from "./db";
import { gamePlanQueue } from "@shared/schema";
import { eq, or, isNull } from "drizzle-orm";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { sql } from "drizzle-orm";

const GAMA_USER_ID = "d919045f-db56-4f2b-abfc-6bdfe83e27b5";

const SEED_PAGES = [
  { file: "gama-page-homepage.json", slug: "gama-homepage" },
  { file: "gama-page-brooklyn.json", slug: "interior-painting-brooklyn-ny" },
  { file: "gama-page-parkslope.json", slug: "interior-painting-park-slope-ny" },
  { file: "gama-page-brooklynheights.json", slug: "interior-painting-brooklyn-heights-ny" },
];

export async function seedGamaPages() {
  try {
    await db.execute(sql`UPDATE game_plan_queue SET user_id = ${GAMA_USER_ID} WHERE user_id IS NULL OR user_id = ''`);

    const existing = await db.select({ id: gamePlanQueue.id, slug: gamePlanQueue.slug })
      .from(gamePlanQueue)
      .where(eq(gamePlanQueue.userId, GAMA_USER_ID));

    const existingSlugs = new Set(existing.map(e => e.slug));

    let inserted = 0;
    for (const page of SEED_PAGES) {
      if (existingSlugs.has(page.slug)) continue;

      let seedPath: string;
      try {
        const currentDir = dirname(fileURLToPath(import.meta.url));
        seedPath = join(currentDir, "seeds", page.file);
      } catch {
        seedPath = join(process.cwd(), "server", "seeds", page.file);
      }

      if (!existsSync(seedPath)) {
        console.log(`[GamaSeed] Seed file not found: ${seedPath}`);
        continue;
      }

      const data = JSON.parse(readFileSync(seedPath, "utf-8"));
      await db.insert(gamePlanQueue).values({
        userId: GAMA_USER_ID,
        type: data.type || "website_page",
        pageType: data.pageType || null,
        title: data.title,
        slug: data.slug || page.slug,
        generatedContent: data.generatedContent,
        previewHtml: data.previewHtml,
        status: data.status || "draft",
      });
      inserted++;
    }

    if (inserted > 0) {
      console.log(`[GamaSeed] Inserted ${inserted} Gama pages for user ${GAMA_USER_ID}`);
    } else {
      console.log(`[GamaSeed] All Gama pages already exist, skipping`);
    }
  } catch (err) {
    console.error("[GamaSeed] Error seeding Gama pages:", err);
  }
}
