import { db } from "./db";
import { contacts, projects, companySettings } from "@shared/schema";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";

export async function seedAppleReviewData(userId: string) {
  try {
    const existingContacts = await db.select().from(contacts).where(eq(contacts.userId, userId)).limit(1);
    if (existingContacts.length > 0) {
      return;
    }

    console.log(`[AppleReview] Seeding demo data for user ${userId}`);

    const existingSettings = await db.select().from(companySettings).where(eq(companySettings.userId, userId)).limit(1);
    if (existingSettings.length === 0) {
      await db.insert(companySettings).values({
        userId,
        companyName: "Fuse Demo Company",
        firstName: "Apple",
        lastName: "Review",
        phone: "555-123-4567",
        bookingToken: randomBytes(16).toString("hex"),
      } as any);
    }

    const demoContacts = [
      { firstName: "Sarah", lastName: "Johnson", email: "sarah.j@example.com", phone: "555-234-5678", leadSource: "referral", leadStatus: "qualified", address: "123 Oak Street" },
      { firstName: "Michael", lastName: "Chen", email: "m.chen@example.com", phone: "555-345-6789", leadSource: "website", leadStatus: "new", address: "456 Elm Avenue" },
      { firstName: "Emily", lastName: "Rodriguez", email: "emily.r@example.com", phone: "555-456-7890", leadSource: "google", leadStatus: "proposal_sent", address: "789 Pine Boulevard" },
      { firstName: "David", lastName: "Kim", email: "d.kim@example.com", phone: "555-567-8901", leadSource: "facebook", leadStatus: "qualified", address: "321 Maple Drive" },
      { firstName: "Jessica", lastName: "Williams", email: "j.williams@example.com", phone: "555-678-9012", leadSource: "referral", leadStatus: "won", address: "654 Cedar Lane" },
    ];

    const insertedContacts = [];
    for (const c of demoContacts) {
      const [inserted] = await db.insert(contacts).values({
        ...c,
        userId,
      } as any).returning();
      insertedContacts.push(inserted);
    }

    const demoProjects = [
      { name: "Interior Painting - Johnson Residence", stage: "proposal", contactId: insertedContacts[0]?.id, address: "123 Oak Street", projectAmount: 450000 },
      { name: "Exterior Painting - Chen Home", stage: "new_lead", contactId: insertedContacts[1]?.id, address: "456 Elm Avenue", projectAmount: 320000 },
      { name: "Kitchen Remodel Painting", stage: "signed", contactId: insertedContacts[2]?.id, address: "789 Pine Boulevard", projectAmount: 280000 },
      { name: "Office Renovation", stage: "in_progress", contactId: insertedContacts[3]?.id, address: "321 Maple Drive", projectAmount: 520000 },
      { name: "Living Room Refresh", stage: "completed", contactId: insertedContacts[4]?.id, address: "654 Cedar Lane", projectAmount: 180000 },
    ];

    for (const p of demoProjects) {
      await db.insert(projects).values({
        ...p,
        userId,
      } as any);
    }

    console.log(`[AppleReview] Demo data seeded: ${demoContacts.length} contacts, ${demoProjects.length} projects`);
  } catch (err: any) {
    console.error("[AppleReview] Failed to seed demo data:", err?.message);
  }
}
