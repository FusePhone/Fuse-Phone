// Background scheduler that hard-purges soft-deleted accounts whose
// 60-day grace window has elapsed. Runs hourly and is idempotent.

import { db } from "../db";
import { users } from "@shared/models/auth";
import { sql, and, eq, isNull, lte } from "drizzle-orm";
import { hardPurgeAccount } from "../accountDeletion";

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

let started = false;

async function runOnce(): Promise<void> {
  try {
    const now = new Date();
    const due = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(
        and(
          eq(users.accountStatus, "deleted"),
          isNull(users.purgedAt),
          lte(users.scheduledPurgeAt, now),
        ),
      );

    if (due.length === 0) return;
    console.log(`[AccountPurge] Found ${due.length} account(s) due for hard purge`);
    for (const u of due) {
      try {
        await hardPurgeAccount(u.id);
      } catch (err) {
        console.error(`[AccountPurge] hardPurgeAccount failed for ${u.id} (${u.email}):`, err);
      }
    }
  } catch (err) {
    console.error("[AccountPurge] Scheduler tick failed:", err);
  }
}

export function startAccountPurgeScheduler(): void {
  if (started) return;
  started = true;
  // Run once 30 seconds after boot (gives the rest of startup time to
  // settle), then every hour.
  setTimeout(() => { void runOnce(); }, 30_000);
  setInterval(() => { void runOnce(); }, CHECK_INTERVAL_MS);
  console.log(`[AccountPurge] Scheduler started (checks every ${CHECK_INTERVAL_MS / 60000}min)`);
}
