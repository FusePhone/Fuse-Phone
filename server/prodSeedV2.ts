import { db } from "./db";
import { sql } from "drizzle-orm";
import fs from "fs";
import path from "path";
import crypto from "crypto";

export async function runProdSeedV2() {
  try {
    const flagCheck = await db.execute(sql`
      SELECT EXISTS(
        SELECT 1 FROM project_activities 
        WHERE content LIKE '%production_data_migration_v3_ghimprovement%'
        AND user_id = 'migration_marker'
      ) as done
    `);
    
    const isDone = (flagCheck as any).rows?.[0]?.done === true || (flagCheck as any).rows?.[0]?.done === 't';
    if (isDone) {
      console.log("[ProdSeedV2] Already completed, skipping.");
      return;
    }
  } catch (err) {
    console.log("[ProdSeedV2] project_activities table may not exist yet, skipping.");
    return;
  }

  try {
    const dataPath = path.join(process.cwd(), "server", "prodSeedData.json");
    if (!fs.existsSync(dataPath)) {
      console.log("[ProdSeedV2] No seed data file found, skipping.");
      return;
    }

    const data = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
    console.log("[ProdSeedV2] Starting ghimprovement20 data sync (v3)...");

    const targetResult = await db.execute(sql`
      SELECT id FROM users WHERE email = 'ghimprovement20@gmail.com' LIMIT 1
    `);
    const targetUserId = (targetResult as any).rows?.[0]?.id;
    if (!targetUserId) {
      console.log("[ProdSeedV2] ghimprovement20@gmail.com user not found on this database, skipping.");
      return;
    }

    console.log(`[ProdSeedV2] Target user: ${targetUserId}`);

    const contactIdMap = new Map<number, number>();

    if (data.contacts?.length) {
      for (const c of data.contacts) {
        const existing = await db.execute(sql`
          SELECT id FROM contacts WHERE user_id = ${targetUserId} AND email = ${c.email} LIMIT 1
        `);
        if ((existing as any).rows?.length > 0) {
          contactIdMap.set(c.id, (existing as any).rows[0].id);
          continue;
        }
        const result = await db.execute(sql`
          INSERT INTO contacts (user_id, name, email, phone, address, city, state, zip_code, type, status, lead_source, notes)
          VALUES (${targetUserId}, ${c.name}, ${c.email}, ${c.phone}, ${c.address}, ${c.city}, ${c.state}, ${c.zipCode}, ${c.type}, ${c.status}, ${c.leadSource}, ${c.notes})
          RETURNING id
        `);
        contactIdMap.set(c.id, (result as any).rows[0].id);
      }
      console.log(`[ProdSeedV2] Contacts: ${contactIdMap.size} mapped (new + existing)`);
    }

    const projectIdMap = new Map<number, number>();

    if (data.projects?.length) {
      for (const p of data.projects) {
        const newContactId = contactIdMap.get(p.contactId);
        if (!newContactId) continue;
        const existing = await db.execute(sql`
          SELECT id FROM projects WHERE user_id = ${targetUserId} AND title = ${p.title} AND contact_id = ${newContactId} LIMIT 1
        `);
        if ((existing as any).rows?.length > 0) {
          projectIdMap.set(p.id, (existing as any).rows[0].id);
          continue;
        }
        const result = await db.execute(sql`
          INSERT INTO projects (user_id, contact_id, title, description, stage, total_amount, job_address, job_city, job_state, job_zip_code, scheduled_date, scheduled_time, source, project_number)
          VALUES (${targetUserId}, ${newContactId}, ${p.title}, ${p.description || null}, ${p.stage}, ${p.totalAmount || null}, ${p.jobAddress || null}, ${p.jobCity || null}, ${p.jobState || null}, ${p.jobZipCode || null}, ${p.scheduledDate || null}, ${p.scheduledTime || null}, ${p.source || null}, ${p.projectNumber || null})
          RETURNING id
        `);
        projectIdMap.set(p.id, (result as any).rows[0].id);
      }
      console.log(`[ProdSeedV2] Projects: ${projectIdMap.size} mapped`);
    }

    if (data.documents?.length) {
      let docCount = 0;
      for (const d of data.documents) {
        const newContactId = contactIdMap.get(d.contactId);
        if (!newContactId) continue;
        const existing = await db.execute(sql`
          SELECT id FROM documents WHERE user_id = ${targetUserId} AND title = ${d.title} AND contact_id = ${newContactId} LIMIT 1
        `);
        if ((existing as any).rows?.length > 0) continue;
        const newProjectId = d.projectId ? projectIdMap.get(d.projectId) : null;
        const contentJson = typeof d.content === 'string' ? d.content : JSON.stringify(d.content);
        const publicToken = d.publicToken || crypto.randomBytes(16).toString('hex');
        await db.execute(sql`
          INSERT INTO documents (user_id, contact_id, type, title, content, total_amount, status, public_token, job_address, job_city, job_state, job_zip_code, job_address_same_as_billing, project_id, document_number)
          VALUES (${targetUserId}, ${newContactId}, ${d.type}, ${d.title}, ${contentJson}::jsonb, ${d.totalAmount || null}, ${d.status}, ${publicToken}, ${d.jobAddress || null}, ${d.jobCity || null}, ${d.jobState || null}, ${d.jobZipCode || null}, ${d.jobAddressSameAsBilling || false}, ${newProjectId || null}, ${d.documentNumber || null})
        `);
        docCount++;
      }
      console.log(`[ProdSeedV2] Documents: ${docCount} created`);
    }

    if (data.communications?.length) {
      const existingCommsCount = await db.execute(sql`
        SELECT count(*) as cnt FROM communications WHERE user_id = ${targetUserId}
      `);
      const commsCount = parseInt((existingCommsCount as any).rows?.[0]?.cnt || '0');
      if (commsCount < 10) {
        let commCount = 0;
        for (const comm of data.communications) {
          const newContactId = comm.contactId ? contactIdMap.get(comm.contactId) : null;
          const newProjectId = comm.projectId ? projectIdMap.get(comm.projectId) : null;
          await db.execute(sql`
            INSERT INTO communications (user_id, contact_id, type, direction, content, timestamp, is_read, phone_number, message_sid, project_id)
            VALUES (${targetUserId}, ${newContactId || null}, ${comm.type}, ${comm.direction}, ${comm.content}, ${comm.timestamp}::timestamp, ${comm.isRead ?? true}, ${comm.phoneNumber || null}, ${comm.messageSid || null}, ${newProjectId || null})
          `);
          commCount++;
        }
        console.log(`[ProdSeedV2] Communications: ${commCount} created (SMS + calls)`);
      } else {
        console.log(`[ProdSeedV2] Communications: ${commsCount} already exist, skipping`);
      }
    }

    if (data.teamMembers?.length) {
      let tmCount = 0;
      for (const tm of data.teamMembers) {
        const existing = await db.execute(sql`
          SELECT id FROM team_members WHERE user_id = ${targetUserId} AND email = ${tm.email} LIMIT 1
        `);
        if ((existing as any).rows?.length > 0) continue;
        await db.execute(sql`
          INSERT INTO team_members (user_id, name, role, phone, email, is_active, hourly_rate, pin, employee_type, active_for_pricing, payroll_burden_percentage, workers_comp_percentage, benefits_per_hour)
          VALUES (${targetUserId}, ${tm.name}, ${tm.role}, ${tm.phone}, ${tm.email}, ${tm.isActive}, ${tm.hourlyRate || null}, ${tm.pin || null}, ${tm.employeeType || null}, ${tm.activeForPricing ?? true}, ${tm.payrollBurdenPercentage || null}, ${tm.workersCompPercentage || null}, ${tm.benefitsPerHour || null})
        `);
        tmCount++;
      }
      console.log(`[ProdSeedV2] Team Members: ${tmCount} created`);
    }

    const channelIdMap = new Map<number, number>();
    if (data.teamChannels?.length) {
      for (const ch of data.teamChannels) {
        const existing = await db.execute(sql`
          SELECT id FROM team_channels WHERE company_owner_id = ${targetUserId} AND name = ${ch.name || 'General'} AND type = ${ch.type} LIMIT 1
        `);
        if ((existing as any).rows?.length > 0) {
          channelIdMap.set(ch.id, (existing as any).rows[0].id);
          continue;
        }
        const memberIdsStr = ch.memberIds ? `{${ch.memberIds.join(',')}}` : null;
        const result = await db.execute(sql`
          INSERT INTO team_channels (company_owner_id, name, type, created_by_id, member_ids)
          VALUES (${targetUserId}, ${ch.name}, ${ch.type}, ${targetUserId}, ${memberIdsStr}::text[])
          RETURNING id
        `);
        channelIdMap.set(ch.id, (result as any).rows[0].id);
      }
      console.log(`[ProdSeedV2] Team Channels: ${channelIdMap.size} mapped`);
    }

    if (data.teamMessages?.length) {
      const existingMsgCount = await db.execute(sql`
        SELECT count(*) as cnt FROM team_messages WHERE company_owner_id = ${targetUserId}
      `);
      const msgCount = parseInt((existingMsgCount as any).rows?.[0]?.cnt || '0');
      if (msgCount === 0) {
        for (const msg of data.teamMessages) {
          const newChannelId = msg.channelId ? channelIdMap.get(msg.channelId) : null;
          await db.execute(sql`
            INSERT INTO team_messages (company_owner_id, sender_id, recipient_id, channel, channel_id, message, image_url, is_read)
            VALUES (${targetUserId}, ${msg.senderId}, ${msg.recipientId || null}, ${msg.channel || null}, ${newChannelId || null}, ${msg.message}, ${msg.imageUrl || null}, true)
          `);
        }
        console.log(`[ProdSeedV2] Team Messages: ${data.teamMessages.length} created`);
      } else {
        console.log(`[ProdSeedV2] Team Messages: ${msgCount} already exist, skipping`);
      }
    }

    await db.execute(sql`
      INSERT INTO project_activities (project_id, user_id, type, content, created_at)
      VALUES (1, 'migration_marker', 'system', 'production_data_migration_v3_ghimprovement', NOW())
    `);

    console.log("[ProdSeedV2] ✓ ghimprovement20 data sync completed!");

  } catch (err) {
    console.error("[ProdSeedV2] Error:", err);
  }
}
