import { db } from "./db";
import { sql, eq } from "drizzle-orm";
import { documents, documentPhotos } from "@shared/schema";

/**
 * Idempotent canonical form used ONLY for dedupe comparison.
 * Stripping the /objects/ prefix lets us treat these as the same key:
 *   /objects/uploads/foo.jpg   ===   uploads/foo.jpg
 * Storage keys are persisted UNCHANGED so the picker can render them as-is
 * (the frontend expects /objects/-prefixed paths for image src).
 */
function dedupeKey(k: string): string {
  if (!k) return k;
  return k.replace(/^\/objects\//, "");
}

/**
 * One-time backfill: every photo found in
 *   documents.content.productionRateBlocks[].roomBuilderData.rooms[].photos[]
 * gets a matching row in document_photos (project pool, documentId=null) so
 * that the project photo picker can surface it for cross-block reuse.
 *
 * Idempotent: skips pool entries whose storage key (compared via dedupeKey)
 * already exists for the same project.
 */
export async function runAreaPhotosToPoolMigration() {
  try {
    console.log("[AreaPhotosMigration] Starting scan...");

    const projectDocs = await db
      .select({
        id: documents.id,
        userId: documents.userId,
        projectId: documents.projectId,
        content: documents.content,
      })
      .from(documents)
      .where(sql`${documents.projectId} IS NOT NULL`);

    let scannedDocs = 0;
    let createdPoolRows = 0;
    let skippedExisting = 0;

    // Cache existing pool dedupeKeys per project so we don't requery each photo.
    const poolCache = new Map<number, Set<string>>();

    for (const doc of projectDocs) {
      scannedDocs++;
      const content = doc.content as any;
      const blocks: any[] = content?.productionRateBlocks || [];
      if (!Array.isArray(blocks) || blocks.length === 0) continue;
      if (!doc.projectId || !doc.userId) continue;

      // Collect unique inline photos for this document, preserving original URLs.
      type InlinePhoto = { url: string; annotations?: any[] | null; areaName?: string };
      const inlinePhotos: InlinePhoto[] = [];
      const seenInThisDoc = new Set<string>();

      for (const block of blocks) {
        const rooms: any[] = block?.roomBuilderData?.rooms || [];
        for (const room of rooms) {
          const photos: any[] = room?.photos || [];
          for (const p of photos) {
            const url: string | undefined = p?.url;
            if (!url || typeof url !== "string") continue;
            if (p.uploading) continue;
            if (url.startsWith("blob:")) continue;
            const dk = dedupeKey(url);
            if (!dk) continue;
            if (seenInThisDoc.has(dk)) continue;
            seenInThisDoc.add(dk);
            inlinePhotos.push({
              url, // preserve as-is (likely /objects/...)
              annotations: Array.isArray(p.annotations) ? p.annotations : null,
              areaName: room.name || "Area",
            });
          }
        }
      }

      if (inlinePhotos.length === 0) continue;

      // Load existing pool storageKeys for this project (canonicalized for compare).
      let existingDedupeKeys = poolCache.get(doc.projectId);
      if (!existingDedupeKeys) {
        const existing = await db
          .select({ storageKey: documentPhotos.storageKey })
          .from(documentPhotos)
          .where(eq(documentPhotos.projectId, doc.projectId));
        existingDedupeKeys = new Set(existing.map((r) => dedupeKey(r.storageKey)));
        poolCache.set(doc.projectId, existingDedupeKeys);
      }

      const toInsert = inlinePhotos
        .filter((p) => !existingDedupeKeys!.has(dedupeKey(p.url)))
        .map((p) => ({
          projectId: doc.projectId!,
          documentId: null,
          userId: doc.userId,
          fileName: `${p.areaName || "Area"} photo`,
          storageKey: p.url,
          caption: null,
          annotations: p.annotations as any,
          sortOrder: 0,
          source: "area_photo" as const,
        }));

      skippedExisting += inlinePhotos.length - toInsert.length;

      if (toInsert.length > 0) {
        await db.insert(documentPhotos).values(toInsert);
        createdPoolRows += toInsert.length;
        toInsert.forEach((row) => existingDedupeKeys!.add(dedupeKey(row.storageKey)));
      }
    }

    console.log(
      `[AreaPhotosMigration] Done. docs=${scannedDocs} created=${createdPoolRows} alreadyInPool=${skippedExisting}`
    );
  } catch (err) {
    console.error("[AreaPhotosMigration] Failed:", err);
  }
}
