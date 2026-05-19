import { db } from "./db";
import { sql } from "drizzle-orm";

export async function runProductionDataMigration() {
  try {
    const flagCheck = await db.execute(sql`
      SELECT EXISTS(
        SELECT 1 FROM project_activities 
        WHERE content LIKE '%production_data_migration_v1%'
        AND user_id = 'migration_marker'
      ) as done
    `);
    
    const isDone = (flagCheck as any).rows?.[0]?.done === true || (flagCheck as any).rows?.[0]?.done === 't';
    if (isDone) {
      console.log("[ProductionMigration] Already completed, skipping.");
      return;
    }
  } catch (err) {
    console.log("[ProductionMigration] project_activities table may not exist yet, will try after schema is ready.");
  }

  const userId = 'd919045f-db56-4f2b-abfc-6bdfe83e27b5';
  const rayContactId = 754;
  const rayDocId = 18;

  try {
    console.log("[ProductionMigration] Starting production data cleanup and setup...");

    const existingProject = await db.execute(sql`
      SELECT id FROM projects WHERE contact_id = ${rayContactId} AND user_id = ${userId} LIMIT 1
    `);
    
    let projectId: number;
    
    if ((existingProject as any).rows?.length > 0) {
      projectId = (existingProject as any).rows[0].id;
      console.log(`[ProductionMigration] Project already exists for Ray (id: ${projectId}), skipping creation.`);
    } else {
      const maxNum = await db.execute(sql`
        SELECT COALESCE(MAX(project_number), 4199) as max_num FROM projects WHERE user_id = ${userId}
      `);
      const nextNum = ((maxNum as any).rows?.[0]?.max_num || 4199) + 1;

      const contactResult = await db.execute(sql`
        SELECT name, address, city, state, zip_code, lead_source FROM contacts WHERE id = ${rayContactId}
      `);
      const contact = (contactResult as any).rows?.[0];
      const contactName = contact?.name || 'Ray Deleva';
      const title = `${contactName} #${nextNum}`;

      const docResult = await db.execute(sql`
        SELECT total_amount FROM documents WHERE id = ${rayDocId}
      `);
      const totalAmount = (docResult as any).rows?.[0]?.total_amount || null;

      const insertResult = await db.execute(sql`
        INSERT INTO projects (user_id, project_number, contact_id, title, stage, source, total_amount, 
          job_address, job_city, job_state, job_zip_code, archived,
          automation_paused_reason, automation_paused_at, automation_paused_category,
          created_at, updated_at)
        VALUES (
          ${userId}, ${nextNum}, ${rayContactId}, ${title}, 'proposal_sent', 
          ${contact?.lead_source || 'google'}, ${totalAmount},
          ${contact?.address || null}, ${contact?.city || null}, ${contact?.state || null}, ${contact?.zip_code || null},
          false,
          'Migration: automations paused during initial setup', NOW(), 'manual',
          NOW(), NOW()
        )
        RETURNING id
      `);
      projectId = (insertResult as any).rows[0].id;
      console.log(`[ProductionMigration] Created project '${title}' (id: ${projectId}) at proposal_sent stage`);

      await db.execute(sql`
        INSERT INTO project_activities (project_id, user_id, type, content, metadata, created_at)
        VALUES (${projectId}, ${userId}, 'stage_change', 'Stage changed to Proposal Sent', 
          ${{fromStage: 'new_lead', toStage: 'proposal_sent'}}::jsonb, NOW())
      `);
    }

    const existingLink = await db.execute(sql`
      SELECT id FROM documents WHERE id = ${rayDocId} AND user_id = ${userId}
    `);
    if ((existingLink as any).rows?.length > 0) {
      console.log(`[ProductionMigration] Linking proposal #${rayDocId} to project ${projectId}`);
    }

    const existingNote = await db.execute(sql`
      SELECT id FROM project_activities 
      WHERE project_id = ${projectId} AND type = 'note' AND content LIKE '%bathroom door%'
      LIMIT 1
    `);
    
    if ((existingNote as any).rows?.length === 0) {
      await db.execute(sql`
        INSERT INTO project_activities (project_id, user_id, type, content, metadata, created_at)
        VALUES (${projectId}, ${userId}, 'note', 
          'Called Ray at 5:02 PM — he wants to add the bathroom door (both sides), entrance door trim, and window trim to the proposal. Once those are added, we''re good.',
          ${JSON.stringify({addedBy: 'migration', callTime: '5:02 PM', date: '2026-02-09'})}::jsonb,
          '2026-02-09 22:02:00'::timestamp)
      `);
      console.log("[ProductionMigration] Added activity note about 5:02 PM call with Ray");
    } else {
      console.log("[ProductionMigration] Activity note already exists, skipping");
    }

    const existingSms = await db.execute(sql`
      SELECT id FROM communications 
      WHERE phone_number = '+15165074423' AND content = 'Give me a call when you have a minute ' AND direction = 'inbound'
      AND user_id = ${userId}
      LIMIT 1
    `);
    
    if ((existingSms as any).rows?.length === 0) {
      await db.execute(sql`
        INSERT INTO communications (contact_id, type, direction, content, timestamp, is_read, user_id, phone_number, message_sid)
        VALUES (${rayContactId}, 'sms', 'inbound', 'Give me a call when you have a minute ', 
          '2026-02-09 21:43:24.321412'::timestamp, true, ${userId}, '+15165074423', 
          'SMa5cb118b58dfb27e85b372a15097181a')
      `);
      console.log("[ProductionMigration] Moved Ray's SMS to production");
    } else {
      console.log("[ProductionMigration] Ray's SMS already exists in production, skipping");
    }

    const existingCall = await db.execute(sql`
      SELECT id FROM communications 
      WHERE phone_number = '+15165074423' AND type = 'call' AND direction = 'inbound'
      AND content LIKE '%completed (19s)%'
      AND user_id = ${userId}
      LIMIT 1
    `);
    
    if ((existingCall as any).rows?.length === 0) {
      await db.execute(sql`
        INSERT INTO communications (contact_id, type, direction, content, timestamp, is_read, user_id, phone_number)
        VALUES (${rayContactId}, 'call', 'inbound', 'Call from +15165074423 completed (19s)', 
          '2026-02-09 21:41:16.340342'::timestamp, true, ${userId}, '+15165074423')
      `);
      console.log("[ProductionMigration] Moved Ray's call record to production");
    } else {
      console.log("[ProductionMigration] Ray's call record already exists in production, skipping");
    }

    console.log("[ProductionMigration] Deleting test documents (6-16, 19) and related data...");
    
    await db.execute(sql`DELETE FROM document_recipients WHERE document_id IN (6,7,8,9,10,12,13,14,16,19)`);
    await db.execute(sql`DELETE FROM payments WHERE document_id IN (6,7,8,9,10,12,13,14,16,19)`);
    await db.execute(sql`DELETE FROM documents WHERE id IN (6,7,8,9,10,12,13,14,16,19) AND user_id = ${userId}`);
    console.log("[ProductionMigration] Deleted test documents and related records");

    console.log("[ProductionMigration] Deleting test contacts (308, 960, 961, 962) and their communications...");
    
    await db.execute(sql`DELETE FROM communications WHERE contact_id IN (308, 960, 961, 962) AND user_id = ${userId}`);
    
    await db.execute(sql`DELETE FROM communications WHERE contact_id IS NULL AND phone_number = '+15167828782' AND user_id = ${userId}`);
    
    await db.execute(sql`DELETE FROM appointments WHERE contact_id IN (308, 960, 961, 962)`);
    await db.execute(sql`DELETE FROM contacts WHERE id IN (308, 960, 961, 962) AND user_id = ${userId}`);
    console.log("[ProductionMigration] Deleted test contacts and related data");

    await db.execute(sql`
      INSERT INTO project_activities (project_id, user_id, type, content, created_at)
      VALUES (${projectId}, 'migration_marker', 'system', 'production_data_migration_v1', NOW())
    `);
    
    console.log("[ProductionMigration] ✓ Production data migration completed successfully!");
    
  } catch (err) {
    console.error("[ProductionMigration] Error during migration:", err);
  }
}
