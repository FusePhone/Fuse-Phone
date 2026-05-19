import { db } from "../server/db";
import { sql } from "drizzle-orm";

type CountRow = {
  type: string;
  total: number;
  unpublished: number;
  published: number;
};

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  console.log(`[Backfill] Starting publish-snapshot backfill (dryRun=${dryRun})`);

  const before = await db.execute<CountRow>(sql`
    SELECT type,
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE published_at IS NULL)::int AS unpublished,
           COUNT(*) FILTER (WHERE published_at IS NOT NULL)::int AS published
    FROM documents
    WHERE type IN ('proposal', 'estimate', 'change_order')
    GROUP BY type
    ORDER BY type
  `);
  console.log("[Backfill] Before:");
  console.table(before.rows);

  if (dryRun) {
    console.log("[Backfill] Dry run — exiting without changes.");
    process.exit(0);
  }

  const updated = await db.execute<{ id: number }>(sql`
    UPDATE documents
    SET published_content = content,
        published_total_amount = total_amount,
        published_at = COALESCE(updated_at, created_at, NOW())
    WHERE type IN ('proposal', 'estimate', 'change_order')
      AND published_at IS NULL
    RETURNING id
  `);

  console.log(`[Backfill] Updated ${updated.rows.length} documents.`);

  const after = await db.execute<CountRow>(sql`
    SELECT type,
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE published_at IS NULL)::int AS unpublished,
           COUNT(*) FILTER (WHERE published_at IS NOT NULL)::int AS published
    FROM documents
    WHERE type IN ('proposal', 'estimate', 'change_order')
    GROUP BY type
    ORDER BY type
  `);
  console.log("[Backfill] After:");
  console.table(after.rows);

  process.exit(0);
}

main().catch((e) => {
  console.error("[Backfill] Failed:", e);
  process.exit(1);
});
