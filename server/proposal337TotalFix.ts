import { db } from "./db";
import { sql } from "drizzle-orm";

const FLAG = "proposal_337_match_invoice_341_v3";
const DOC_ID = 337;
const TARGET_TOTAL_INC_TAX = 795.21;
const TAX_RATE_PCT = 8.14;
const TARGET_SUBTOTAL = Math.round((TARGET_TOTAL_INC_TAX / (1 + TAX_RATE_PCT / 100)) * 100) / 100;
const TARGET_TOTAL_CENTS = Math.round(TARGET_TOTAL_INC_TAX * 100);

export async function runProposal337TotalFix() {
  try {
    const flagCheck = await db.execute(sql`
      SELECT EXISTS(
        SELECT 1 FROM project_activities
        WHERE content LIKE ${"%" + FLAG + "%"}
        AND user_id = 'migration_marker'
      ) as done
    `);
    const isDone =
      (flagCheck as any).rows?.[0]?.done === true ||
      (flagCheck as any).rows?.[0]?.done === "t";
    if (isDone) {
      console.log("[Proposal337Fix] Already completed, skipping.");
      return;
    }
  } catch {
    console.log("[Proposal337Fix] project_activities not ready yet, will retry next start.");
    return;
  }

  try {
    const docResult = await db.execute(sql`
      SELECT id, type, total_amount,
             content->'productionRateBlocks'->0->'roomBuilderData'->'grandTotal' AS current_block_total
      FROM documents WHERE id = ${DOC_ID}
    `);
    const doc = (docResult as any).rows?.[0];
    if (!doc) {
      console.log(`[Proposal337Fix] Document ${DOC_ID} not found, skipping.`);
      await markDone();
      return;
    }

    const currentBlockTotal = parseFloat(doc.current_block_total);
    console.log(
      `[Proposal337Fix] Setting block grandTotal: $${currentBlockTotal} -> $${TARGET_SUBTOTAL} (target total $${TARGET_TOTAL_INC_TAX} incl. ${TAX_RATE_PCT}% tax) and total_amount -> ${TARGET_TOTAL_CENTS} cents`,
    );

    await db.execute(sql`
      UPDATE documents
      SET content = jsonb_set(
        content,
        '{productionRateBlocks,0,roomBuilderData,grandTotal}',
        ${TARGET_SUBTOTAL}::text::jsonb
      ),
      total_amount = ${TARGET_TOTAL_CENTS}
      WHERE id = ${DOC_ID}
    `);

    console.log("[Proposal337Fix] Block grandTotal locked to signed amount.");
    await markDone();
  } catch (err) {
    console.error("[Proposal337Fix] Error:", err);
  }
}

async function markDone() {
  try {
    await db.execute(sql`
      INSERT INTO project_activities (project_id, user_id, type, content, created_at)
      VALUES (0, 'migration_marker', 'system', ${FLAG}, NOW())
    `);
  } catch (err) {
    console.error("[Proposal337Fix] Failed to mark done:", err);
  }
}
