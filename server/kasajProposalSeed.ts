import { db } from "./db";
import { sql } from "drizzle-orm";
import crypto from "crypto";

export async function seedKasajProposal() {
  const MARKER = "kasaj_proposal_seed_v1";

  try {
    const flagCheck = await db.execute(sql`
      SELECT EXISTS(
        SELECT 1 FROM project_activities
        WHERE content LIKE ${'%' + MARKER + '%'}
        AND user_id = 'migration_marker'
      ) as done
    `);

    const isDone =
      (flagCheck as any).rows?.[0]?.done === true ||
      (flagCheck as any).rows?.[0]?.done === "t";
    if (isDone) {
      console.log("[KasajSeed] Already completed, skipping.");
      return;
    }
  } catch {
    console.log("[KasajSeed] project_activities table may not exist yet.");
    return;
  }

  try {
    const userResult = await db.execute(sql`
      SELECT id FROM users WHERE LOWER(email) = 'office@kasajpainting.com' OR LOWER(email) = 'office@kasaipainting.com' LIMIT 1
    `);
    const userId = (userResult as any).rows?.[0]?.id;
    if (!userId) {
      console.log("[KasajSeed] Kasaj Painting user not found, skipping.");
      return;
    }

    const contactResult = await db.execute(sql`
      SELECT id, name, address, city, state, zip_code FROM contacts
      WHERE user_id = ${userId} AND LOWER(name) LIKE '%wondra%' LIMIT 1
    `);
    const contact = (contactResult as any).rows?.[0];
    if (!contact) {
      console.log("[KasajSeed] Nicole Wondra contact not found, skipping.");
      return;
    }

    const projectResult = await db.execute(sql`
      SELECT id FROM projects WHERE user_id = ${userId} AND contact_id = ${contact.id} LIMIT 1
    `);
    const projectId = (projectResult as any).rows?.[0]?.id;
    if (!projectId) {
      console.log("[KasajSeed] Project for Nicole Wondra not found, skipping.");
      return;
    }

    const existingDoc = await db.execute(sql`
      SELECT id FROM documents WHERE user_id = ${userId} AND contact_id = ${contact.id} AND type = 'proposal' AND title = 'Interior Painting Proposal' LIMIT 1
    `);
    if ((existingDoc as any).rows?.length > 0) {
      console.log("[KasajSeed] Proposal already exists, skipping.");
      await db.execute(sql`
        INSERT INTO project_activities (user_id, project_id, type, content, created_at)
        VALUES ('migration_marker', ${projectId}, 'note', ${MARKER + '_already_exists'}, NOW())
      `);
      return;
    }

    const items = [
      {
        name: "Foyer",
        description: "Ceilings (2 coats, SW INT Duration Home Flat), Walls (2 coats, SW INT Duration), Base Boards (2 coats, SW INT Duration), Prep/setup/cleanup",
        quantity: 1,
        unitPrice: 89982,
        total: 89982,
        taxable: false,
        isOptional: false,
      },
      {
        name: "Living Room",
        description: "Walls (2 coats, SW INT Duration), Prep/setup/cleanup",
        quantity: 1,
        unitPrice: 48113,
        total: 48113,
        taxable: false,
        isOptional: false,
      },
      {
        name: "Dining Room",
        description: "Walls (2 coats, SW INT Duration), Prep/setup/cleanup",
        quantity: 1,
        unitPrice: 36276,
        total: 36276,
        taxable: false,
        isOptional: false,
      },
      {
        name: "Kitchen",
        description: "Base Boards (2 coats, SW INT Duration), Prep/setup/cleanup",
        quantity: 1,
        unitPrice: 19347,
        total: 19347,
        taxable: false,
        isOptional: false,
      },
      {
        name: "Family Room",
        description: "Walls (2 coats, SW INT Duration), Base Boards (2 coats, SW INT Duration), Casing Simple Window Interior (2 coats, SW INT Duration), Prep/setup/cleanup",
        quantity: 1,
        unitPrice: 152951,
        total: 152951,
        taxable: false,
        isOptional: false,
      },
      {
        name: "Office",
        description: "Walls (2 coats, SW INT Duration), Base Boards (2 coats, SW INT Duration), Crown Molding (2 coats, SW INT Duration), Prep/setup/cleanup",
        quantity: 1,
        unitPrice: 74571,
        total: 74571,
        taxable: false,
        isOptional: false,
      },
      {
        name: "Half Bath",
        description: "Ceilings (2 coats, SW INT Duration Home Flat), Prep/setup/cleanup",
        quantity: 1,
        unitPrice: 11063,
        total: 11063,
        taxable: false,
        isOptional: false,
      },
      {
        name: "Bedroom 2",
        description: "Ceilings (2 coats, SW INT Duration Home Flat), Prep/setup/cleanup",
        quantity: 1,
        unitPrice: 27762,
        total: 27762,
        taxable: false,
        isOptional: false,
      },
      {
        name: "Primary Bedroom",
        description: "Ceilings (2 coats, SW INT Duration Home Flat), Walls (2 coats, SW INT Duration), Prep/setup/cleanup",
        quantity: 1,
        unitPrice: 95573,
        total: 95573,
        taxable: false,
        isOptional: false,
      },
      {
        name: "Primary Bathroom",
        description: "Walls (2 coats, SW INT Duration)",
        quantity: 1,
        unitPrice: 5919,
        total: 5919,
        taxable: false,
        isOptional: false,
      },
      {
        name: "Bedroom 4",
        description: "Walls (2 coats, SW INT Duration), 1g (5-8 panel) Door Int. includes casing (2 coats, SW INT Duration)",
        quantity: 1,
        unitPrice: 22114,
        total: 22114,
        taxable: false,
        isOptional: false,
      },
      {
        name: "Bathroom",
        description: "Ceilings (2 coats, SW INT Duration Home Flat), Walls (2 coats, SW INT Duration), Prep/setup/cleanup",
        quantity: 1,
        unitPrice: 38150,
        total: 38150,
        taxable: false,
        isOptional: false,
      },
      {
        name: "Basement Stairway",
        description: "Walls (2 coats, SW INT Duration), Base Boards (2 coats, SW INT Duration), Prep/setup/cleanup",
        quantity: 1,
        unitPrice: 43742,
        total: 43742,
        taxable: false,
        isOptional: false,
      },
      {
        name: "Main Basement Area",
        description: "Ceilings (2 coats, SW INT Duration Home Flat), Walls (2 coats, SW INT Duration), Base Boards (2 coats, SW INT Duration), Prep/setup/cleanup",
        quantity: 1,
        unitPrice: 216415,
        total: 216415,
        taxable: false,
        isOptional: false,
      },
      {
        name: "Basement Theater Room",
        description: "Walls (2 coats, SW INT Duration), Base Boards (2 coats, SW INT Duration), Prep/setup/cleanup",
        quantity: 1,
        unitPrice: 67854,
        total: 67854,
        taxable: false,
        isOptional: false,
      },
      {
        name: "Bathroom (Option)",
        description: "Prep/setup/cleanup, Base Boards (2 coats, SW INT Duration), Walls (2 coats, SW INT Duration)",
        quantity: 1,
        unitPrice: 25802,
        total: 25802,
        taxable: false,
        isOptional: true,
      },
      {
        name: "Bedroom 3 (Option)",
        description: "Prep/setup/cleanup, Walls (2 coats, SW INT Duration)",
        quantity: 1,
        unitPrice: 41642,
        total: 41642,
        taxable: false,
        isOptional: true,
      },
      {
        name: "Bathroom (Option 2)",
        description: "Walls (2 coats, SW INT Duration), Base Boards (2 coats, SW INT Duration), Prep/setup/cleanup",
        quantity: 1,
        unitPrice: 27427,
        total: 27427,
        taxable: false,
        isOptional: true,
      },
    ];

    const nonOptionalTotal = items
      .filter((i) => !i.isOptional)
      .reduce((sum, i) => sum + i.total, 0);

    const content = JSON.stringify({
      items,
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    });

    const publicToken = crypto.randomBytes(32).toString("hex");

    const docNumResult = await db.execute(sql`
      SELECT COALESCE(MAX(document_number), 0) + 1 as next_num FROM documents WHERE user_id = ${userId}
    `);
    const documentNumber = (docNumResult as any).rows?.[0]?.next_num || 1;

    await db.execute(sql`
      INSERT INTO documents (
        user_id, contact_id, project_id, type, status, title, content, total_amount,
        public_token, document_number,
        job_address, job_city, job_state, job_zip_code
      ) VALUES (
        ${userId}, ${contact.id}, ${projectId}, 'proposal', 'draft',
        'Interior Painting Proposal',
        ${content},
        ${nonOptionalTotal},
        ${publicToken},
        ${documentNumber},
        ${contact.address || null},
        ${contact.city || null},
        ${contact.state || null},
        ${contact.zip_code || null}
      )
    `);

    await db.execute(sql`
      INSERT INTO project_activities (user_id, project_id, type, content, created_at)
      VALUES ('migration_marker', ${projectId}, 'note', ${MARKER}, NOW())
    `);

    console.log(`[KasajSeed] Created proposal for Nicole Wondra (contact ${contact.id}, project ${projectId}) — $${(nonOptionalTotal / 100).toFixed(2)} total, 15 included + 3 optional items.`);
  } catch (err: any) {
    console.error("[KasajSeed] Error:", err.message);
  }
}
