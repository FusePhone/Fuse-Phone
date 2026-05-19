import { db } from "../server/db";
import { contacts, projects, documents, payments, projectActivities, teamMembers, projectCrewAssignments, timeEntries, projectExpenses } from "../shared/schema";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

const USER_ID = "83e2c8fc-6797-44dc-9771-cfb529bdebc4";

function randomToken() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

const FIRST_NAMES = ["James", "Maria", "Robert", "Linda", "Michael", "Patricia", "David", "Jennifer", "Carlos", "Susan", "Thomas", "Karen", "Daniel", "Nancy", "Anthony", "Lisa", "Mark", "Sandra", "Steven", "Ashley"];
const LAST_NAMES = ["Thompson", "Rodriguez", "Martinez", "Anderson", "Williams", "Johnson", "Garcia", "Brown", "Davis", "Miller", "Wilson", "Taylor", "Moore", "Jackson", "Martin", "Lee", "Harris", "Clark", "Lewis", "Robinson"];
const STREETS = ["Oak St", "Maple Ave", "Cedar Ln", "Pine Dr", "Elm Blvd", "Birch Rd", "Willow Way", "Spruce Ct", "Ash Pl", "Poplar Ter"];
const CITIES = ["Uniondale", "Hempstead", "Freeport", "Baldwin", "Merrick", "Roosevelt", "Garden City", "Mineola", "Westbury", "New Hyde Park"];
const LEAD_SOURCES = ["google", "referral", "thumbtack", "facebook", "website", "yelp", "word_of_mouth"];

const JOB_TYPES = [
  { title: "Interior Painting", rooms: ["Living Room", "Bedroom", "Kitchen", "Bathroom", "Dining Room", "Hallway", "Office"], minPrice: 180000, maxPrice: 650000 },
  { title: "Exterior Painting", rooms: ["Front", "Sides", "Back", "Trim", "Shutters", "Garage Door"], minPrice: 350000, maxPrice: 850000 },
  { title: "Cabinet Refinishing", rooms: ["Kitchen Cabinets", "Bathroom Vanity"], minPrice: 250000, maxPrice: 550000 },
  { title: "Deck Staining", rooms: ["Deck Surface", "Railings", "Steps"], minPrice: 150000, maxPrice: 350000 },
  { title: "Drywall Repair & Paint", rooms: ["Patches", "Skim Coat", "Texture Match", "Prime & Paint"], minPrice: 80000, maxPrice: 200000 },
  { title: "Accent Wall & Feature", rooms: ["Accent Wall", "Wainscoting", "Crown Molding"], minPrice: 60000, maxPrice: 180000 },
  { title: "Full House Interior", rooms: ["Living Room", "Master Bedroom", "Bedroom 2", "Kitchen", "Bathrooms", "Hallway", "Foyer"], minPrice: 600000, maxPrice: 1200000 },
  { title: "Commercial Office Paint", rooms: ["Reception", "Conference Room", "Open Office", "Break Room"], minPrice: 400000, maxPrice: 900000 },
];

function randInt(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

function generatePhone() {
  return `(516) ${randInt(200,999)}-${String(randInt(1000,9999))}`;
}

function generateEmail(first: string, last: string) {
  const domains = ["gmail.com", "yahoo.com", "outlook.com", "aol.com", "icloud.com"];
  return `${first.toLowerCase()}.${last.toLowerCase()}${randInt(1,99)}@${pick(domains)}`;
}

interface ProjectPlan {
  weekDate: Date;
  jobType: typeof JOB_TYPES[0];
  status: "completed" | "in_progress" | "lost" | "scheduled" | "invoiced" | "paid";
  totalAmount: number;
  contactFirst: string;
  contactLast: string;
}

async function seed() {
  console.log("Starting demo data seed for GH Improvement account...");

  // 1. Create financial settings (copy from production Gama account)
  const existingFS = await db.execute(sql`SELECT id FROM financial_settings WHERE user_id = ${USER_ID}`);
  if ((existingFS as any).rows?.length === 0 || (existingFS as any).length === 0) {
    await db.execute(sql`
      INSERT INTO financial_settings (user_id, sell_rate_per_hour, default_setup_hours_per_room, default_door_width_ft, default_door_height_ft, default_window_width_ft, default_window_height_ft, defaults_populated, payroll_burden_percentage, workers_comp_percentage, benefits_per_hour, use_production_team_for_labor_cost, manual_labor_cost_per_hour, target_gross_margin_percentage, default_show_labor_hrs, default_show_labor_price, default_show_material_qty, default_show_material_price, default_same_color_all_areas, default_show_surface_details, ai_negotiation_floor, target_net_profit_percentage, target_gross_profit_per_hour)
      VALUES (${USER_ID}, 79.01, 0.5, 3, 7, 3, 4, true, 0.12, 0.18, 0, true, 89, 0.578, true, true, true, true, true, true, 0.15, 0.21, 0)
    `);
    console.log("Created financial settings");
  }

  // 2. Create team members - Lead, Helper
  const existingTM = await db.select().from(teamMembers).where(eq(teamMembers.userId, USER_ID));
  let leadId: number, helperId: number;

  if (existingTM.length === 0) {
    const [lead] = await db.insert(teamMembers).values({
      userId: USER_ID,
      name: "Marco Reyes",
      role: "lead",
      phone: "(516) 445-8821",
      email: "marco.reyes@email.com",
      isActive: true,
      hourlyRate: 3125,
      pin: "4412",
      employeeType: "production",
      activeForPricing: true,
      payrollBurdenPercentage: 0.12,
      workersCompPercentage: 0.18,
      benefitsPerHour: 0,
    }).returning();
    const [helper] = await db.insert(teamMembers).values({
      userId: USER_ID,
      name: "Luis Hernandez",
      role: "helper",
      phone: "(516) 332-7104",
      email: "luis.hernandez@email.com",
      isActive: true,
      hourlyRate: 2000,
      pin: "2281",
      employeeType: "production",
      activeForPricing: true,
      payrollBurdenPercentage: 0.12,
      workersCompPercentage: 0.18,
      benefitsPerHour: 0,
    }).returning();
    leadId = lead.id;
    helperId = helper.id;
    console.log(`Created team members: Marco (lead #${leadId}), Luis (helper #${helperId})`);
  } else {
    leadId = existingTM.find(t => t.role === "lead")?.id || existingTM[0].id;
    helperId = existingTM.find(t => t.role === "helper")?.id || existingTM[existingTM.length > 1 ? 1 : 0].id;
    console.log(`Using existing team members: lead #${leadId}, helper #${helperId}`);
  }

  // 3. Plan out projects week by week from Jan 6 to Feb 21, 2026
  const plans: ProjectPlan[] = [];
  let usedFirstNames = new Set<string>();
  let totalRevenue = 0;

  const weekStarts = [
    new Date("2026-01-05"), // Week 1
    new Date("2026-01-12"), // Week 2
    new Date("2026-01-19"), // Week 3
    new Date("2026-01-26"), // Week 4
    new Date("2026-02-02"), // Week 5
    new Date("2026-02-09"), // Week 6
    new Date("2026-02-16"), // Week 7
  ];

  // Week 1: 2 projects completed
  // Week 2: 1 project completed, 1 lost
  // Week 3: 2 projects completed
  // Week 4: 1 project completed, 1 project completed
  // Week 5: 2 projects completed
  // Week 6: 1 project in_progress, 1 project completed
  // Week 7: 1 project scheduled, 1 new lead (in_progress)

  const statusPlan: Array<{ statuses: Array<"completed"|"in_progress"|"lost"|"scheduled"|"invoiced"|"paid"> }> = [
    { statuses: ["paid", "paid"] },
    { statuses: ["paid", "lost"] },
    { statuses: ["paid", "paid"] },
    { statuses: ["paid", "paid"] },
    { statuses: ["paid", "invoiced"] },
    { statuses: ["in_progress", "paid"] },
    { statuses: ["scheduled", "in_progress"] },
  ];

  for (let w = 0; w < weekStarts.length; w++) {
    const weekDate = weekStarts[w];
    const { statuses } = statusPlan[w];

    for (const status of statuses) {
      let first: string;
      do { first = pick(FIRST_NAMES); } while (usedFirstNames.has(first));
      usedFirstNames.add(first);
      const last = pick(LAST_NAMES);

      const jobType = pick(JOB_TYPES);
      let amount = randInt(jobType.minPrice, jobType.maxPrice);
      amount = Math.round(amount / 100) * 100;

      if (status !== "lost") {
        totalRevenue += amount;
      }

      plans.push({ weekDate, jobType, status, totalAmount: amount, contactFirst: first, contactLast: last });
    }
  }

  // Adjust to hit ~$100K target
  const targetTotal = randInt(9500000, 11000000);
  const currentPaidTotal = plans.filter(p => p.status !== "lost").reduce((s, p) => s + p.totalAmount, 0);
  if (currentPaidTotal > 0) {
    const ratio = targetTotal / currentPaidTotal;
    for (const p of plans) {
      if (p.status !== "lost") {
        p.totalAmount = Math.round((p.totalAmount * ratio) / 100) * 100;
      }
    }
  }

  const finalTotal = plans.filter(p => p.status !== "lost").reduce((s, p) => s + p.totalAmount, 0);
  console.log(`Planned ${plans.length} projects, target revenue: $${(finalTotal / 100).toLocaleString()}`);

  // 4. Create all the data
  let projectNumber = 1;
  for (let i = 0; i < plans.length; i++) {
    const plan = plans[i];
    const { weekDate, jobType, status, totalAmount, contactFirst, contactLast } = plan;

    // Create contact
    const contactName = `${contactFirst} ${contactLast}`;
    const contactType = (status === "lost" || status === "scheduled" || (status === "in_progress" && i >= plans.length - 2)) ? "lead" : "client";
    const [contact] = await db.insert(contacts).values({
      name: contactName,
      email: generateEmail(contactFirst, contactLast),
      phone: generatePhone(),
      address: `${randInt(100, 9999)} ${pick(STREETS)}`,
      city: pick(CITIES),
      state: "NY",
      zipCode: `115${randInt(10, 99)}`,
      type: contactType,
      status: contactType === "lead" ? "new" : "active",
      leadSource: pick(LEAD_SOURCES),
      userId: USER_ID,
      createdAt: weekDate,
      updatedAt: weekDate,
    }).returning();

    console.log(`  Contact: ${contactName} (${contactType})`);

    // Determine project stage
    let stage: string;
    switch (status) {
      case "paid": stage = "paid"; break;
      case "invoiced": stage = "invoiced"; break;
      case "in_progress": stage = "in_progress"; break;
      case "scheduled": stage = "scheduled"; break;
      case "lost": stage = "new_lead"; break;
      default: stage = "new_lead";
    }

    const jobAddress = contact.address || `${randInt(100, 999)} ${pick(STREETS)}`;
    const jobCity = contact.city || pick(CITIES);

    // Calculate scheduled dates
    const scheduledDate = new Date(weekDate);
    scheduledDate.setDate(scheduledDate.getDate() + randInt(5, 14));
    const endDate = new Date(scheduledDate);
    endDate.setDate(endDate.getDate() + randInt(2, 5));

    const [project] = await db.insert(projects).values({
      userId: USER_ID,
      contactId: contact.id,
      projectNumber: projectNumber++,
      title: `${contactLast} - ${jobType.title}`,
      description: `${jobType.title} for ${contactName} at ${jobAddress}, ${jobCity}`,
      stage,
      totalAmount: totalAmount,
      jobAddress,
      jobCity,
      jobState: "NY",
      jobZipCode: contact.zipCode || "11550",
      scheduledDate: scheduledDate.toISOString().split("T")[0],
      scheduledTime: `${randInt(7, 9)}:00 AM`,
      scheduledEndDate: endDate.toISOString().split("T")[0],
      scheduledEndTime: "4:00 PM",
      source: contact.leadSource || "google",
      archived: false,
      createdAt: weekDate,
      updatedAt: weekDate,
      stageChangedAt: weekDate,
      lostReason: status === "lost" ? pick(["Price too high", "Went with another contractor", "Project postponed", "No response"]) : null,
      lostAt: status === "lost" ? new Date(weekDate.getTime() + 5 * 24 * 3600000) : null,
    }).returning();

    console.log(`  Project #${project.id}: ${project.title} (${stage}) $${(totalAmount / 100).toFixed(2)}`);

    // Create line items for the document content
    const lineItems = jobType.rooms.map((room, idx) => {
      const roomTotal = Math.round(totalAmount / jobType.rooms.length);
      return {
        name: room,
        quantity: 1,
        unitPrice: roomTotal,
        total: roomTotal,
        description: `${room} - Professional ${jobType.title.toLowerCase()} service`,
        taxable: false,
      };
    });

    // Adjust last item to make total exact
    const lineItemSum = lineItems.reduce((s, li) => s + li.total, 0);
    lineItems[lineItems.length - 1].total += (totalAmount - lineItemSum);
    lineItems[lineItems.length - 1].unitPrice = lineItems[lineItems.length - 1].total;

    const docContent = JSON.stringify({
      items: lineItems,
      validUntil: new Date(weekDate.getTime() + 30 * 24 * 3600000).toISOString().split("T")[0],
    });

    // Create proposal
    const proposalDate = new Date(weekDate.getTime() + 1 * 24 * 3600000);
    const [proposal] = await db.insert(documents).values({
      contactId: contact.id,
      userId: USER_ID,
      type: "proposal",
      status: status === "lost" ? "sent" : "accepted",
      title: `Proposal - ${contactLast} ${jobType.title}`,
      content: docContent,
      totalAmount,
      publicToken: randomToken(),
      viewCount: randInt(1, 5),
      firstViewedAt: new Date(proposalDate.getTime() + randInt(1, 24) * 3600000),
      lastViewedAt: new Date(proposalDate.getTime() + randInt(24, 72) * 3600000),
      signature: status !== "lost" ? contactName : null,
      signedAt: status !== "lost" ? new Date(proposalDate.getTime() + randInt(1, 3) * 24 * 3600000) : null,
      jobAddress,
      jobCity,
      jobState: "NY",
      jobZipCode: contact.zipCode || "11550",
      archived: false,
      createdAt: proposalDate,
      updatedAt: proposalDate,
      projectId: project.id,
    }).returning();

    console.log(`  Proposal #${proposal.id}: ${proposal.title}`);

    // Create invoice for completed/paid/invoiced
    if (["paid", "invoiced", "completed"].includes(status)) {
      const invoiceDate = new Date(endDate.getTime() + 1 * 24 * 3600000);
      const [invoice] = await db.insert(documents).values({
        contactId: contact.id,
        userId: USER_ID,
        type: "invoice",
        status: status === "paid" ? "accepted" : "sent",
        title: `Invoice - ${contactLast} ${jobType.title}`,
        content: docContent,
        totalAmount,
        publicToken: randomToken(),
        viewCount: randInt(1, 3),
        firstViewedAt: new Date(invoiceDate.getTime() + randInt(1, 12) * 3600000),
        lastViewedAt: new Date(invoiceDate.getTime() + randInt(12, 48) * 3600000),
        signature: status === "paid" ? contactName : null,
        signedAt: status === "paid" ? new Date(invoiceDate.getTime() + randInt(1, 2) * 24 * 3600000) : null,
        sourceDocumentId: proposal.id,
        jobAddress,
        jobCity,
        jobState: "NY",
        jobZipCode: contact.zipCode || "11550",
        archived: false,
        createdAt: invoiceDate,
        updatedAt: invoiceDate,
        projectId: project.id,
      }).returning();

      console.log(`  Invoice #${invoice.id}: ${invoice.title}`);

      // Create payment for paid projects
      if (status === "paid") {
        const paymentDate = new Date(invoiceDate.getTime() + randInt(1, 5) * 24 * 3600000);
        const paymentTypes = ["credit_card", "check", "cash", "zelle"];
        await db.insert(payments).values({
          documentId: invoice.id,
          userId: USER_ID,
          amount: totalAmount,
          paymentType: pick(paymentTypes),
          paymentDate,
          notes: `Payment received from ${contactName}`,
          createdAt: paymentDate,
        });
        console.log(`  Payment: $${(totalAmount / 100).toFixed(2)}`);
      }
    }

    // Create project activities (stage changes, notes)
    const activities = [];

    // New lead activity
    activities.push({
      projectId: project.id,
      userId: USER_ID,
      type: "stage_change",
      content: "Project created as New Lead",
      metadata: JSON.stringify({ from: null, to: "new_lead" }),
      createdAt: weekDate,
    });

    if (status !== "lost") {
      // Proposal sent
      activities.push({
        projectId: project.id,
        userId: USER_ID,
        type: "document_sent",
        content: `Proposal sent to ${contactName}`,
        createdAt: new Date(weekDate.getTime() + 1 * 24 * 3600000),
      });

      // Proposal signed
      activities.push({
        projectId: project.id,
        userId: USER_ID,
        type: "document_signed",
        content: `Proposal signed by ${contactName}`,
        createdAt: new Date(weekDate.getTime() + 3 * 24 * 3600000),
      });

      // Stage to scheduled
      activities.push({
        projectId: project.id,
        userId: USER_ID,
        type: "stage_change",
        content: "Moved to Scheduled",
        metadata: JSON.stringify({ from: "accepted", to: "scheduled" }),
        createdAt: new Date(weekDate.getTime() + 3 * 24 * 3600000),
      });

      if (["in_progress", "paid", "invoiced", "completed"].includes(status)) {
        // Stage to in_progress
        activities.push({
          projectId: project.id,
          userId: USER_ID,
          type: "stage_change",
          content: "Work started",
          metadata: JSON.stringify({ from: "scheduled", to: "in_progress" }),
          createdAt: scheduledDate,
        });

        // Add a note
        const noteTexts = [
          `Crew arrived on site. Started prep work and covered floors/furniture.`,
          `Client requested ${pick(["warm white", "light gray", "navy blue", "sage green", "cream"])} for the ${pick(jobType.rooms)}.`,
          `First coat complete. ${pick(["Looking great", "Client happy with color choice", "Minor touch-ups needed", "On schedule"])}`,
          `Job going smoothly. ${pick(["Crew working efficiently", "Weather cooperating", "Client very pleased", "Ahead of schedule"])}`,
        ];
        activities.push({
          projectId: project.id,
          userId: USER_ID,
          type: "note",
          content: pick(noteTexts),
          createdAt: new Date(scheduledDate.getTime() + randInt(2, 8) * 3600000),
        });
      }

      if (["paid", "invoiced", "completed"].includes(status)) {
        // Stage to invoiced
        activities.push({
          projectId: project.id,
          userId: USER_ID,
          type: "stage_change",
          content: "Invoice sent",
          metadata: JSON.stringify({ from: "in_progress", to: "invoiced" }),
          createdAt: endDate,
        });
      }

      if (status === "paid") {
        // Stage to paid
        activities.push({
          projectId: project.id,
          userId: USER_ID,
          type: "stage_change",
          content: "Payment received",
          metadata: JSON.stringify({ from: "invoiced", to: "paid" }),
          createdAt: new Date(endDate.getTime() + randInt(2, 5) * 24 * 3600000),
        });
      }
    } else {
      // Lost project
      activities.push({
        projectId: project.id,
        userId: USER_ID,
        type: "stage_change",
        content: `Project marked as lost: ${project.lostReason}`,
        metadata: JSON.stringify({ from: "new_lead", to: "lost" }),
        createdAt: new Date(weekDate.getTime() + 5 * 24 * 3600000),
      });
    }

    for (const act of activities) {
      await db.insert(projectActivities).values(act as any);
    }
    console.log(`  Activities: ${activities.length} entries`);

    // Assign crew to projects that are scheduled or further
    if (status !== "lost") {
      await db.insert(projectCrewAssignments).values([
        { projectId: project.id, teamMemberId: leadId, userId: USER_ID },
        { projectId: project.id, teamMemberId: helperId, userId: USER_ID },
      ]);
      console.log(`  Crew assigned: Marco (lead) + Luis (helper)`);

      // Add time entries for in_progress/completed/paid projects
      if (["in_progress", "paid", "invoiced", "completed"].includes(status)) {
        const workDays = randInt(2, 4);
        for (let d = 0; d < workDays; d++) {
          const workDate = new Date(scheduledDate);
          workDate.setDate(workDate.getDate() + d);

          // Lead time entry
          const leadClockIn = new Date(workDate);
          leadClockIn.setHours(7 + randInt(0, 1), randInt(0, 30), 0);
          const leadHours = randInt(7, 9);
          const leadClockOut = new Date(leadClockIn);
          leadClockOut.setHours(leadClockIn.getHours() + leadHours, randInt(0, 30));

          await db.insert(timeEntries).values({
            teamMemberId: leadId,
            projectId: project.id,
            userId: USER_ID,
            clockIn: leadClockIn,
            clockOut: leadClockOut,
            totalMinutes: leadHours * 60 + randInt(0, 30),
            notes: d === 0 ? "Setup and prep" : d === workDays - 1 ? "Final coat and cleanup" : "Painting",
            createdAt: leadClockIn,
          });

          // Helper time entry
          const helperClockIn = new Date(workDate);
          helperClockIn.setHours(7 + randInt(0, 1), randInt(0, 45), 0);
          const helperHours = randInt(6, 8);
          const helperClockOut = new Date(helperClockIn);
          helperClockOut.setHours(helperClockIn.getHours() + helperHours, randInt(0, 30));

          await db.insert(timeEntries).values({
            teamMemberId: helperId,
            projectId: project.id,
            userId: USER_ID,
            clockIn: helperClockIn,
            clockOut: helperClockOut,
            totalMinutes: helperHours * 60 + randInt(0, 30),
            notes: d === 0 ? "Prep and taping" : d === workDays - 1 ? "Touch-ups and cleanup" : "Assisting",
            createdAt: helperClockIn,
          });
        }
        console.log(`  Time entries: ${workDays} days for both crew members`);

        // Add project expenses for materials
        const materialExpenses = [
          { title: "Paint - Benjamin Moore Regal Select", amount: randInt(15000, 45000) },
          { title: "Supplies - tape, rollers, brushes", amount: randInt(3000, 8000) },
        ];
        if (Math.random() > 0.5) {
          materialExpenses.push({ title: "Primer", amount: randInt(5000, 12000) });
        }
        if (Math.random() > 0.7) {
          materialExpenses.push({ title: "Drop cloths & plastic", amount: randInt(2000, 5000) });
        }

        for (const expense of materialExpenses) {
          await db.insert(projectExpenses).values({
            projectId: project.id,
            userId: USER_ID,
            title: expense.title,
            description: `Materials for ${project.title}`,
            amount: expense.amount,
            createdAt: scheduledDate,
          });
        }
        console.log(`  Expenses: ${materialExpenses.length} material items`);
      }
    }

    console.log("");
  }

  // Update company settings with company name
  await db.execute(sql`
    UPDATE company_settings 
    SET company_name = 'GH Improvement', 
        phone = '(516) 555-0100',
        email = 'office@ghimprovement.com',
        address = '123 Main Street',
        city = 'Hempstead',
        state = 'NY',
        zip_code = '11550'
    WHERE user_id = ${USER_ID}
  `);
  console.log("Updated company settings");

  const totalPaid = plans.filter(p => p.status === "paid").reduce((s, p) => s + p.totalAmount, 0);
  const totalAll = plans.filter(p => p.status !== "lost").reduce((s, p) => s + p.totalAmount, 0);
  console.log(`\n=== SEED COMPLETE ===`);
  console.log(`Total projects: ${plans.length}`);
  console.log(`Completed/Paid: ${plans.filter(p => p.status === "paid").length}`);
  console.log(`Invoiced: ${plans.filter(p => p.status === "invoiced").length}`);
  console.log(`In Progress: ${plans.filter(p => p.status === "in_progress").length}`);
  console.log(`Scheduled: ${plans.filter(p => p.status === "scheduled").length}`);
  console.log(`Lost: ${plans.filter(p => p.status === "lost").length}`);
  console.log(`Total revenue (paid): $${(totalPaid / 100).toLocaleString()}`);
  console.log(`Total pipeline value: $${(totalAll / 100).toLocaleString()}`);
}

seed().then(() => {
  console.log("Done!");
  process.exit(0);
}).catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
