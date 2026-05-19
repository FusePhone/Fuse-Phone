import { db } from "./db";
import { templates, proposalTemplates, messageTemplates, serviceTemplates } from "@shared/schema";
import type { ProductionRateBlock, RoomBuilderRoom, RoomBuilderData } from "@shared/schema";
import { users } from "@shared/models/auth";
import { and, eq } from "drizzle-orm";

interface DefaultMessageTemplate {
  slug: string;
  category: string;
  title: string;
  content: string;
  emailSubject: string;
  emailContent: string;
}

const DEFAULT_MESSAGE_TEMPLATES: DefaultMessageTemplate[] = [
  // Document Sending
  {
    slug: "sending_proposal",
    category: "document_sending",
    title: "Sending Proposal",
    content: "Hi {{client_name}}, this is {{company_name}}. Your proposal is ready for review. Please take a look here: {{proposal_link}}\n\nFeel free to reach out if you have any questions. {{company_phone}}",
    emailSubject: "Your Proposal from {{company_name}}",
    emailContent: "Hi {{client_name}},\n\nThank you for the opportunity! Your proposal is ready for review.\n\nPlease click the link below to view, review, and approve your proposal:\n{{proposal_link}}\n\nIf you have any questions or need adjustments, don't hesitate to reach out.\n\nBest regards,\n{{company_name}}\n{{company_phone}}\n{{company_email}}",
  },
  {
    slug: "sending_invoice",
    category: "document_sending",
    title: "Sending Invoice",
    content: "Hi {{client_name}}, this is {{company_name}}. Your invoice for {{amount}} is ready. You can view and pay here: {{invoice_link}}\n\nThank you for your business!",
    emailSubject: "Invoice from {{company_name}} - {{amount}}",
    emailContent: "Hi {{client_name}},\n\nYour invoice for {{amount}} is ready.\n\nPlease click the link below to view and submit payment:\n{{invoice_link}}\n\nThank you for your business!\n\nBest regards,\n{{company_name}}\n{{company_phone}}\n{{company_email}}",
  },
  {
    slug: "sending_change_order",
    category: "document_sending",
    title: "Sending Change Order",
    content: "Hi {{client_name}}, this is {{company_name}}. We have a change order for your review. Please take a look here: {{change_order_link}}\n\nPlease reach out with any questions. {{company_phone}}",
    emailSubject: "Change Order from {{company_name}}",
    emailContent: "Hi {{client_name}},\n\nWe have a change order that requires your review and approval.\n\nPlease click the link below to view the details:\n{{change_order_link}}\n\nIf you have any questions about the changes, please don't hesitate to reach out.\n\nBest regards,\n{{company_name}}\n{{company_phone}}\n{{company_email}}",
  },

  // Proposal Acceptance
  {
    slug: "proposal_accepted",
    category: "document_sending",
    title: "Proposal Accepted - Thank You",
    content: "Hi {{client_name}}, this is {{company_name}}. Thank you for accepting our proposal! We truly appreciate your trust in us and are excited to get started on your project.\n\nWe'll be in touch soon with next steps. {{company_phone}}",
    emailSubject: "Thank You for Choosing {{company_name}}!",
    emailContent: "Hi {{client_name}},\n\nThank you for accepting our proposal! We truly appreciate your trust in {{company_name}} and are excited to get started on your project.\n\nWe'll be in touch soon with the next steps. If you have any questions in the meantime, don't hesitate to reach out.\n\nThank you for your business!\n\nBest regards,\n{{company_name}}\n{{company_phone}}\n{{company_email}}",
  },
  {
    slug: "deposit_due",
    category: "payments",
    title: "Deposit Due",
    content: "Hi {{client_name}}, this is {{company_name}}. A deposit of {{amount}} is due to get your project started. You can view your invoice and submit payment here: {{invoice_link}}\n\nThank you!",
    emailSubject: "Deposit Due - {{amount}} | {{company_name}}",
    emailContent: "Hi {{client_name}},\n\nThank you again for choosing {{company_name}}! A deposit of {{amount}} is due to get your project started.\n\nYou can view your invoice and submit payment using the link below:\n{{invoice_link}}\n\nIf you have any questions, please don't hesitate to reach out.\n\nBest regards,\n{{company_name}}\n{{company_phone}}\n{{company_email}}",
  },

  // Payments
  {
    slug: "payment_request",
    category: "payments",
    title: "Payment Request",
    content: "Hi {{client_name}}, this is {{company_name}}. A payment of {{amount}} is due. You can view your invoice and submit payment here: {{document_link}}\n\nThank you!",
    emailSubject: "Payment Request from {{company_name}} - {{amount}}",
    emailContent: "Hi {{client_name}},\n\nThis is a friendly reminder that a payment of {{amount}} is due.\n\nYou can view your invoice and submit payment using the link below:\n{{document_link}}\n\nThank you for your prompt attention to this matter.\n\nBest regards,\n{{company_name}}\n{{company_phone}}\n{{company_email}}",
  },
  {
    slug: "payment_received",
    category: "payments",
    title: "Payment Received",
    content: "Hi {{client_name}}, this is {{company_name}}. We've received your {{payment_label}} of {{amount}}. Thank you!\n\nRemaining balance: {{remaining_balance}}\n\nView your invoice: {{document_link}}\n\nWe appreciate your business.",
    emailSubject: "{{payment_label}} Received - Thank You! | {{company_name}}",
    emailContent: "Hi {{client_name}},\n\nWe've received your {{payment_label}} of {{amount}}. Thank you for your prompt payment!\n\nRemaining balance: {{remaining_balance}}\n\nView your invoice and payment details here:\n{{document_link}}\n\nWe truly appreciate your business and look forward to working with you.\n\nBest regards,\n{{company_name}}\n{{company_phone}}\n{{company_email}}",
  },
  {
    slug: "payment_reminder",
    category: "payments",
    title: "Payment Reminder",
    content: "Hi {{client_name}}, this is a friendly reminder from {{company_name}} that your payment of {{amount}} is still outstanding. You can pay here: {{document_link}}\n\nPlease let us know if you have any questions. {{company_phone}}",
    emailSubject: "Payment Reminder - {{amount}} Due | {{company_name}}",
    emailContent: "Hi {{client_name}},\n\nThis is a friendly reminder that your payment of {{amount}} is still outstanding.\n\nYou can view your invoice and submit payment here:\n{{document_link}}\n\nPlease let us know if you have any questions or need to discuss payment arrangements.\n\nBest regards,\n{{company_name}}\n{{company_phone}}\n{{company_email}}",
  },

  // Follow-ups: Not Viewed
  {
    slug: "followup_not_viewed_1_day",
    category: "followup_not_viewed",
    title: "Not Viewed - 1 Day",
    content: "Hi {{client_name}}, this is {{company_name}}. We sent you a document yesterday but it looks like you haven't had a chance to view it yet. Here's the link again: {{document_link}}\n\nLet us know if you have any questions!",
    emailSubject: "Just Following Up - Your {{document_type}} from {{company_name}}",
    emailContent: "Hi {{client_name}},\n\nWe sent you a {{document_type}} yesterday but it looks like you haven't had a chance to view it yet.\n\nHere's the link again for your convenience:\n{{document_link}}\n\nLet us know if you have any questions!\n\nBest regards,\n{{company_name}}\n{{company_phone}}",
  },
  {
    slug: "followup_not_viewed_2_days",
    category: "followup_not_viewed",
    title: "Not Viewed - 2 Days",
    content: "Hi {{client_name}}, just following up from {{company_name}}. We sent you a document a couple days ago. You can view it here: {{document_link}}\n\nFeel free to reach out if you need anything. {{company_phone}}",
    emailSubject: "Following Up - Your {{document_type}} | {{company_name}}",
    emailContent: "Hi {{client_name}},\n\nJust following up on the {{document_type}} we sent a couple of days ago.\n\nYou can view it here:\n{{document_link}}\n\nFeel free to reach out if you need anything.\n\nBest regards,\n{{company_name}}\n{{company_phone}}",
  },
  {
    slug: "followup_not_viewed_5_days",
    category: "followup_not_viewed",
    title: "Not Viewed - 5 Days",
    content: "Hi {{client_name}}, this is {{company_name}} checking in. We sent you a document about 5 days ago that's still waiting for your review: {{document_link}}\n\nWould love to hear back from you when you get a chance.",
    emailSubject: "Checking In - Your {{document_type}} | {{company_name}}",
    emailContent: "Hi {{client_name}},\n\nThis is {{company_name}} checking in. We sent you a {{document_type}} about 5 days ago that's still waiting for your review.\n\nYou can view it here:\n{{document_link}}\n\nWould love to hear back from you when you get a chance.\n\nBest regards,\n{{company_name}}\n{{company_phone}}",
  },
  {
    slug: "followup_not_viewed_9_days",
    category: "followup_not_viewed",
    title: "Not Viewed - 9 Days",
    content: "Hi {{client_name}}, this is {{company_name}}. We wanted to make sure you received the document we sent. You can view it here: {{document_link}}\n\nPlease let us know if you're still interested or have any questions. {{company_phone}}",
    emailSubject: "Still Interested? Your {{document_type}} | {{company_name}}",
    emailContent: "Hi {{client_name}},\n\nWe wanted to make sure you received the {{document_type}} we sent. You can view it here:\n{{document_link}}\n\nPlease let us know if you're still interested or have any questions. We're happy to help!\n\nBest regards,\n{{company_name}}\n{{company_phone}}",
  },
  {
    slug: "followup_not_viewed_15_days",
    category: "followup_not_viewed",
    title: "Not Viewed - 15 Days",
    content: "Hi {{client_name}}, {{company_name}} here. It's been about two weeks since we sent your document. Just wanted to check in and see if you're still interested: {{document_link}}\n\nWe're here if you need us. {{company_phone}}",
    emailSubject: "Two Weeks - Your {{document_type}} | {{company_name}}",
    emailContent: "Hi {{client_name}},\n\nIt's been about two weeks since we sent your {{document_type}}. Just wanted to check in and see if you're still interested.\n\nYou can view it here:\n{{document_link}}\n\nWe're here if you need us.\n\nBest regards,\n{{company_name}}\n{{company_phone}}",
  },
  {
    slug: "followup_not_viewed_21_days",
    category: "followup_not_viewed",
    title: "Not Viewed - 21 Days",
    content: "Hi {{client_name}}, this is {{company_name}}. We sent you a document about 3 weeks ago. If you're still considering, you can view it here: {{document_link}}\n\nNo pressure at all - just let us know either way. {{company_phone}}",
    emailSubject: "Quick Check-In | {{company_name}}",
    emailContent: "Hi {{client_name}},\n\nWe sent you a {{document_type}} about 3 weeks ago. If you're still considering, you can view it here:\n{{document_link}}\n\nNo pressure at all - just let us know either way.\n\nBest regards,\n{{company_name}}\n{{company_phone}}",
  },
  {
    slug: "followup_not_viewed_30_days",
    category: "followup_not_viewed",
    title: "Not Viewed - 30 Days",
    content: "Hi {{client_name}}, this is {{company_name}}. We sent you a document about a month ago. We understand life gets busy! If you're still interested, you can review it here: {{document_link}}\n\nThis will be our last follow-up, but feel free to reach out anytime. {{company_phone}}",
    emailSubject: "Final Follow-Up - Your {{document_type}} | {{company_name}}",
    emailContent: "Hi {{client_name}},\n\nWe sent you a {{document_type}} about a month ago. We understand life gets busy!\n\nIf you're still interested, you can review it here:\n{{document_link}}\n\nThis will be our last follow-up, but feel free to reach out anytime. We'd love to work with you.\n\nBest regards,\n{{company_name}}\n{{company_phone}}",
  },

  // Follow-ups: Viewed but not signed
  {
    slug: "followup_viewed_1_day",
    category: "followup_viewed",
    title: "Viewed - 1 Day",
    content: "Hi {{client_name}}, this is {{company_name}}. We noticed you've had a chance to look at the document we sent. Do you have any questions? We'd be happy to go over it with you: {{document_link}}\n\n{{company_phone}}",
    emailSubject: "Any Questions About Your {{document_type}}? | {{company_name}}",
    emailContent: "Hi {{client_name}},\n\nWe noticed you've had a chance to look at the {{document_type}} we sent. Do you have any questions? We'd be happy to go over it with you.\n\nView it again here:\n{{document_link}}\n\nBest regards,\n{{company_name}}\n{{company_phone}}",
  },
  {
    slug: "followup_viewed_2_days",
    category: "followup_viewed",
    title: "Viewed - 2 Days",
    content: "Hi {{client_name}}, {{company_name}} here. Thanks for reviewing the document! We wanted to check if you have any questions or need any changes: {{document_link}}\n\nFeel free to call us anytime. {{company_phone}}",
    emailSubject: "Thanks for Reviewing! | {{company_name}}",
    emailContent: "Hi {{client_name}},\n\nThanks for reviewing the {{document_type}}! We wanted to check if you have any questions or need any changes.\n\nView it again here:\n{{document_link}}\n\nFeel free to reach out anytime.\n\nBest regards,\n{{company_name}}\n{{company_phone}}",
  },
  {
    slug: "followup_viewed_5_days",
    category: "followup_viewed",
    title: "Viewed - 5 Days",
    content: "Hi {{client_name}}, this is {{company_name}}. Just checking in since you reviewed our document a few days ago. Would you like to discuss anything or move forward? {{document_link}}\n\n{{company_phone}}",
    emailSubject: "Ready to Move Forward? | {{company_name}}",
    emailContent: "Hi {{client_name}},\n\nJust checking in since you reviewed our {{document_type}} a few days ago. Would you like to discuss anything or are you ready to move forward?\n\nView it here:\n{{document_link}}\n\nBest regards,\n{{company_name}}\n{{company_phone}}",
  },
  {
    slug: "followup_viewed_9_days",
    category: "followup_viewed",
    title: "Viewed - 9 Days",
    content: "Hi {{client_name}}, {{company_name}} here. We noticed you reviewed our document but haven't signed yet. Is there anything holding you back? We're happy to address any concerns: {{document_link}}\n\n{{company_phone}}",
    emailSubject: "Need Any Changes? | {{company_name}}",
    emailContent: "Hi {{client_name}},\n\nWe noticed you reviewed our {{document_type}} but haven't signed yet. Is there anything holding you back? We're happy to address any concerns.\n\nView it here:\n{{document_link}}\n\nBest regards,\n{{company_name}}\n{{company_phone}}",
  },
  {
    slug: "followup_viewed_15_days",
    category: "followup_viewed",
    title: "Viewed - 15 Days",
    content: "Hi {{client_name}}, this is {{company_name}}. It's been a couple weeks since you viewed our document. We'd love to help answer any remaining questions and get the project started: {{document_link}}\n\n{{company_phone}}",
    emailSubject: "Let's Get Started! | {{company_name}}",
    emailContent: "Hi {{client_name}},\n\nIt's been a couple weeks since you viewed our {{document_type}}. We'd love to help answer any remaining questions and get the project started.\n\nView it here:\n{{document_link}}\n\nBest regards,\n{{company_name}}\n{{company_phone}}",
  },
  {
    slug: "followup_viewed_21_days",
    category: "followup_viewed",
    title: "Viewed - 21 Days",
    content: "Hi {{client_name}}, {{company_name}} checking in one more time. If you have any questions about the document or need adjustments, we're here to help: {{document_link}}\n\nJust let us know. {{company_phone}}",
    emailSubject: "Checking In One More Time | {{company_name}}",
    emailContent: "Hi {{client_name}},\n\n{{company_name}} checking in one more time. If you have any questions about the {{document_type}} or need adjustments, we're here to help.\n\nView it here:\n{{document_link}}\n\nJust let us know.\n\nBest regards,\n{{company_name}}\n{{company_phone}}",
  },
  {
    slug: "followup_viewed_30_days",
    category: "followup_viewed",
    title: "Viewed - 30 Days",
    content: "Hi {{client_name}}, this is {{company_name}}. It's been about a month since you reviewed our document. If you're still considering, we'd love to chat: {{document_link}}\n\nThis will be our last follow-up, but we're always here if you need us. {{company_phone}}",
    emailSubject: "Final Follow-Up | {{company_name}}",
    emailContent: "Hi {{client_name}},\n\nIt's been about a month since you reviewed our {{document_type}}. If you're still considering, we'd love to chat.\n\nView it here:\n{{document_link}}\n\nThis will be our last follow-up, but we're always here if you need us.\n\nBest regards,\n{{company_name}}\n{{company_phone}}",
  },

  // Lead Follow-ups
  {
    slug: "lead_welcome",
    category: "lead_followup",
    title: "Welcome - New Lead",
    content: "Hi {{client_name}}, thanks for reaching out to {{company_name}}! We received your inquiry and will be in touch shortly to discuss your project.\n\nFeel free to call us anytime at {{company_phone}}.",
    emailSubject: "Thanks for Reaching Out! | {{company_name}}",
    emailContent: "Hi {{client_name}},\n\nThank you for reaching out to {{company_name}}! We received your inquiry and are excited to learn more about your project.\n\nWe'll be in touch shortly to discuss next steps. In the meantime, feel free to reply to this email or call us at {{company_phone}} with any questions.\n\nWe look forward to working with you!\n\nBest regards,\n{{company_name}}\n{{company_phone}}\n{{company_email}}",
  },
  {
    slug: "lead_followup_2_hours",
    category: "lead_followup",
    title: "Follow-up - 2 Hours",
    content: "Hi {{client_name}}, this is {{company_name}} following up on your recent inquiry. We'd love to schedule a time to discuss your project. What time works best for you?\n\n{{company_phone}}",
    emailSubject: "Following Up on Your Inquiry | {{company_name}}",
    emailContent: "Hi {{client_name}},\n\nJust following up on your recent inquiry to {{company_name}}. We'd love to schedule a time to discuss your project in more detail.\n\nWhat time works best for you? You can reach us at {{company_phone}} or simply reply to this email.\n\nLooking forward to hearing from you!\n\nBest regards,\n{{company_name}}\n{{company_phone}}\n{{company_email}}",
  },
  {
    slug: "lead_followup_1_day",
    category: "lead_followup",
    title: "Follow-up - 1 Day",
    content: "Hi {{client_name}}, this is {{company_name}}. We reached out yesterday about your project inquiry. Are you still looking for help? We'd love to chat when you have a moment.\n\n{{company_phone}}",
    emailSubject: "Still Interested? | {{company_name}}",
    emailContent: "Hi {{client_name}},\n\nWe reached out yesterday about your project inquiry and wanted to follow up. Are you still looking for help?\n\nWe'd love to chat when you have a moment. Feel free to call us at {{company_phone}} or reply to this email.\n\nBest regards,\n{{company_name}}\n{{company_phone}}\n{{company_email}}",
  },
  {
    slug: "lead_followup_2_days",
    category: "lead_followup",
    title: "Follow-up - 2 Days",
    content: "Hi {{client_name}}, {{company_name}} here. Just checking in on your inquiry from a couple days ago. We'd be happy to provide a free proposal for your project. Let us know!\n\n{{company_phone}}",
    emailSubject: "Free Proposal Available | {{company_name}}",
    emailContent: "Hi {{client_name}},\n\nJust checking in on your inquiry from a couple days ago. We'd be happy to provide a free proposal for your project.\n\nLet us know when would be a good time to discuss, or feel free to call us at {{company_phone}}.\n\nBest regards,\n{{company_name}}\n{{company_phone}}\n{{company_email}}",
  },
  {
    slug: "lead_followup_5_days",
    category: "lead_followup",
    title: "Follow-up - 5 Days",
    content: "Hi {{client_name}}, this is {{company_name}}. We've been trying to reach you about your project. If you're still interested, we'd love to help. Just give us a call or text back!\n\n{{company_phone}}",
    emailSubject: "We'd Love to Help | {{company_name}}",
    emailContent: "Hi {{client_name}},\n\nWe've been trying to reach you about your project inquiry. If you're still interested, we'd love to help!\n\nJust give us a call at {{company_phone}} or reply to this email. We're here when you're ready.\n\nBest regards,\n{{company_name}}\n{{company_phone}}\n{{company_email}}",
  },
  {
    slug: "lead_followup_9_days",
    category: "lead_followup",
    title: "Follow-up - 9 Days",
    content: "Hi {{client_name}}, {{company_name}} here. We wanted to check in one more time about your project. If your plans have changed, no worries at all. We're here whenever you need us.\n\n{{company_phone}}",
    emailSubject: "Checking In | {{company_name}}",
    emailContent: "Hi {{client_name}},\n\nWe wanted to check in one more time about your project. If your plans have changed, no worries at all.\n\nWe're here whenever you need us. Feel free to reach out anytime at {{company_phone}}.\n\nBest regards,\n{{company_name}}\n{{company_phone}}\n{{company_email}}",
  },
  {
    slug: "lead_followup_15_days",
    category: "lead_followup",
    title: "Follow-up - 15 Days",
    content: "Hi {{client_name}}, this is {{company_name}}. It's been a couple weeks since your inquiry. If you're still looking for help with your project, we'd love to hear from you. No pressure!\n\n{{company_phone}}",
    emailSubject: "Still Here for You | {{company_name}}",
    emailContent: "Hi {{client_name}},\n\nIt's been a couple weeks since your inquiry. If you're still looking for help with your project, we'd love to hear from you.\n\nNo pressure at all - just know we're here when you're ready.\n\nBest regards,\n{{company_name}}\n{{company_phone}}\n{{company_email}}",
  },
  {
    slug: "lead_followup_30_days",
    category: "lead_followup",
    title: "Follow-up - 30 Days",
    content: "Hi {{client_name}}, {{company_name}} here. It's been about a month since your inquiry. This is our last check-in, but feel free to reach out anytime in the future. We'd love to work with you!\n\n{{company_phone}}",
    emailSubject: "Final Check-In | {{company_name}}",
    emailContent: "Hi {{client_name}},\n\nIt's been about a month since your initial inquiry. This is our last check-in, but please don't hesitate to reach out anytime in the future.\n\nWe'd love to work with you when the time is right.\n\nBest regards,\n{{company_name}}\n{{company_phone}}\n{{company_email}}",
  },

  // Jobs
  {
    slug: "job_scheduled",
    category: "jobs",
    title: "Job Scheduled",
    content: "Hi {{client_name}}, this is {{company_name}}. Your job has been scheduled for {{scheduled_date}} at {{scheduled_time}}.\n\n{{job_address}}\n\nWe look forward to seeing you! Please let us know if you have any questions.\n\n{{company_phone}}",
    emailSubject: "Your Job is Scheduled for {{scheduled_date}} | {{company_name}}",
    emailContent: "Hi {{client_name}},\n\nGreat news! Your job has been scheduled with {{company_name}}.\n\nStart Date: {{scheduled_date}}\nTime: {{scheduled_time}}\n{{job_address}}\n\nPlease let us know if you have any questions before we get started. You can reach us at {{company_phone}} or reply to this email.\n\nWe look forward to getting started!\n\nBest regards,\n{{company_name}}\n{{company_phone}}\n{{company_email}}",
  },
  {
    slug: "job_reminder_day_before",
    category: "jobs",
    title: "Day-Before Reminder",
    content: "Hi {{client_name}}, this is {{company_name}}. Just a friendly reminder that we'll be starting your job tomorrow. Please make sure the work area is accessible.\n\n{{job_address}}\n\nSee you tomorrow! {{company_phone}}",
    emailSubject: "Reminder: We're Starting Tomorrow | {{company_name}}",
    emailContent: "Hi {{client_name}},\n\nJust a friendly reminder that our team from {{company_name}} will be starting your job tomorrow.\n\n{{job_address}}\n\nPlease make sure the work area is accessible and feel free to reach out if you have any last-minute questions.\n\nSee you tomorrow!\n\nBest regards,\n{{company_name}}\n{{company_phone}}\n{{company_email}}",
  },
  {
    slug: "job_in_progress",
    category: "jobs",
    title: "Job In Progress",
    content: "Hi {{client_name}}, this is {{company_name}}. Just a quick update - your job is underway! Everything is going smoothly. We'll keep you posted on our progress.\n\n{{company_phone}}",
    emailSubject: "Your Job is Underway | {{company_name}}",
    emailContent: "Hi {{client_name}},\n\nJust a quick update from {{company_name}} - your job is underway and everything is going smoothly!\n\nWe'll keep you posted on our progress. If you have any questions or concerns, don't hesitate to reach out.\n\nBest regards,\n{{company_name}}\n{{company_phone}}\n{{company_email}}",
  },
  {
    slug: "job_crew_started",
    category: "jobs",
    title: "Crew Working on Your Project",
    content: "Hi {{client_name}}, this is {{company_name}}. Just wanted to let you know that our team is actively working on your project at {{job_address}}. Everything is going well and we'll keep you updated on progress.\n\n{{company_phone}}",
    emailSubject: "Your Project is In Progress | {{company_name}}",
    emailContent: "Hi {{client_name}},\n\nJust a quick update from {{company_name}} — our crew is actively working on your project and things are going well!\n\n{{job_address}}\n\nWe'll keep you updated as work progresses. If you have any questions, feel free to reach out to us at {{company_phone}} or reply to this email.\n\nBest regards,\n{{company_name}}\n{{company_phone}}\n{{company_email}}",
  },
  {
    slug: "review_in_progress",
    category: "jobs",
    title: "Review Request (In Progress)",
    content: "Hi {{client_name}}, this is {{company_name}}! We're currently working on your project and hope you're loving what you see so far.\n\nIf you're happy with the work, it would mean the world to us if you could leave us a quick review: {{review_link}}\n\nThank you for trusting us with your project! {{company_phone}}",
    emailSubject: "Enjoying Our Work? We'd Love Your Feedback | {{company_name}}",
    emailContent: "Hi {{client_name}},\n\nWe're currently working on your project and hope everything is looking great so far!\n\nIf you're enjoying the results, it would mean the world to us if you could take a moment to leave a quick review:\n{{review_link}}\n\nYour feedback helps us grow and lets other homeowners know what to expect. Thank you for trusting us with your project!\n\nWarm regards,\n{{company_name}}\n{{company_phone}}\n{{company_email}}",
  },
  {
    slug: "job_completed",
    category: "jobs",
    title: "Job Completed",
    content: "Hi {{client_name}}, this is {{company_name}}. We've completed the work at your property! We hope you're happy with the results.\n\nIf you have a moment, we'd really appreciate a review: {{review_link}}\n\nThank you for your business! {{company_phone}}",
    emailSubject: "Job Completed | {{company_name}}",
    emailContent: "Hi {{client_name}},\n\nWe're pleased to let you know that we've completed the work at your property.\n\nPlease take a moment to review everything and let us know if you have any questions or concerns. Your satisfaction is our priority.\n\nIf you're happy with the results, we'd really appreciate a review:\n{{review_link}}\n\nThank you for your business!\n\nBest regards,\n{{company_name}}\n{{company_phone}}\n{{company_email}}",
  },

  // General
  {
    slug: "appointment_confirmation",
    category: "general",
    title: "Appointment Confirmation",
    content: "Hi {{client_name}}, this is {{company_name}}. Your appointment has been confirmed for {{appointment_date}} at {{appointment_time}}.\n\n{{appointment_address}}\n\nWe look forward to seeing you! If you need to reschedule, please let us know. {{company_phone}}",
    emailSubject: "Appointment Confirmed | {{company_name}}",
    emailContent: "Hi {{client_name}},\n\nYour appointment with {{company_name}} has been confirmed!\n\nDate: {{appointment_date}}\nTime: {{appointment_time}}\n{{appointment_address}}\n\nIf you need to reschedule or have any questions, please reach out to us at {{company_phone}} or reply to this email.\n\nWe look forward to seeing you!\n\nBest regards,\n{{company_name}}\n{{company_phone}}\n{{company_email}}",
  },
  {
    slug: "appointment_reminder",
    category: "general",
    title: "Appointment Reminder",
    content: "Hi {{client_name}}, this is {{company_name}}. Just a reminder about your upcoming appointment on {{appointment_date}} at {{appointment_time}}.\n\n{{appointment_address}}\n\nPlease let us know if you need to reschedule. {{company_phone}}",
    emailSubject: "Appointment Reminder | {{company_name}}",
    emailContent: "Hi {{client_name}},\n\nJust a reminder about your upcoming appointment with {{company_name}}.\n\nDate: {{appointment_date}}\nTime: {{appointment_time}}\n{{appointment_address}}\n\nPlease let us know if you need to reschedule. You can reach us at {{company_phone}} or reply to this email.\n\nSee you soon!\n\nBest regards,\n{{company_name}}\n{{company_phone}}\n{{company_email}}",
  },
  {
    slug: "thank_you",
    category: "general",
    title: "Thank You",
    content: "Hi {{client_name}}, this is {{company_name}}. Thank you for choosing us! We truly appreciate your business. If you're happy with the work, we'd love a review: {{review_link}}\n\nThank you again! {{company_phone}}",
    emailSubject: "Thank You for Choosing {{company_name}}!",
    emailContent: "Hi {{client_name}},\n\nThank you for choosing {{company_name}}! We truly appreciate your business and hope you're happy with the work.\n\nIf you have a moment, we'd really appreciate a review:\n{{review_link}}\n\nIt helps other customers find us and means a lot to our team.\n\nThank you again for your trust in us!\n\nBest regards,\n{{company_name}}\n{{company_phone}}\n{{company_email}}",
  },
];

const DEFAULT_TERMS_AND_CONDITIONS = `<p><span style="font-family: Tahoma, sans-serif; font-size: 0.875em;"><strong>Terms &amp; Conditions</strong></span></p><p><span style="font-family: Tahoma, sans-serif; font-size: 0.875em;">All work is performed according to the agreed scope outlined in this proposal. Any changes, additions, or omissions must be approved in writing and may result in additional costs or time adjustments.</span></p><p><span style="font-family: Tahoma, sans-serif; font-size: 0.875em;">Client is responsible for providing reasonable access to the work area during scheduled hours. Delays caused by restricted access, client requests, or unforeseen conditions may affect completion timelines.</span></p><p><span style="font-family: Tahoma, sans-serif; font-size: 0.875em;">Payment terms are as stated in this agreement. Balances are due upon completion unless otherwise noted. Late payments may result in work stoppage or additional fees.</span></p><p><span style="font-family: Tahoma, sans-serif; font-size: 0.875em;">We take reasonable care to protect surrounding areas; however, we are not responsible for pre-existing conditions, hidden defects, or damages beyond our control.</span></p><p><span style="font-family: Tahoma, sans-serif; font-size: 0.875em;">We are fully licensed and insured. Proof of insurance (COI) is available upon request.</span></p><p><span style="font-family: Tahoma, sans-serif; font-size: 0.875em;">Workmanship is guaranteed per the terms stated in this agreement. Manufacturer warranties apply to materials used.</span></p><p><span style="font-family: Tahoma, sans-serif; font-size: 0.875em;">By approving this proposal, the client agrees to these terms and conditions.</span></p>`;

const DEFAULT_STANDARD_EXPECTATIONS = `<p><span style="font-family: Tahoma, sans-serif; font-size: 0.875em;"><strong>Standards, Expectations &amp; Frequently Asked Questions</strong></span></p><ol><li><p><span style="font-family: Tahoma, sans-serif; font-size: 0.875em;"><strong>Are you fully licensed and insured?</strong></span></p></li></ol><ul><li><p><span style="font-family: Tahoma, sans-serif; font-size: 0.875em;">Yes. We are fully licensed and insured. Proof of insurance (COI) is available upon request.</span></p></li></ul><ol start="2"><li><p><span style="font-family: Tahoma, sans-serif; font-size: 0.875em;"><strong>Can you provide proof of insurance?</strong></span></p></li></ol><ul><li><p><span style="font-family: Tahoma, sans-serif; font-size: 0.875em;">Absolutely. We're happy to provide a Certificate of Insurance at any time.</span></p></li></ul><ol start="3"><li><p><span style="font-family: Tahoma, sans-serif; font-size: 0.875em;"><strong>How much experience do you have?</strong></span></p></li></ol><ul><li><p><span style="font-family: Tahoma, sans-serif; font-size: 0.875em;">We bring years of hands-on experience in residential and commercial projects, delivering consistent, high-quality results.</span></p></li></ul><ol start="4"><li><p><span style="font-family: Tahoma, sans-serif; font-size: 0.875em;"><strong>Do you have reviews or references?</strong></span></p></li></ol><ul><li><p><span style="font-family: Tahoma, sans-serif; font-size: 0.875em;">Yes. We have verified reviews and a strong reputation built on satisfied clients. References are available upon request.</span></p></li></ul><ol start="5"><li><p><span style="font-family: Tahoma, sans-serif; font-size: 0.875em;"><strong>Do you use professional materials and equipment?</strong></span></p></li></ol><ul><li><p><span style="font-family: Tahoma, sans-serif; font-size: 0.875em;">Yes. We use professional-grade materials, proper preparation methods, and proven techniques to ensure lasting results.</span></p></li></ul><ol start="6"><li><p><span style="font-family: Tahoma, sans-serif; font-size: 0.875em;"><strong>How long will the project take?</strong></span></p></li></ol><ul><li><p><span style="font-family: Tahoma, sans-serif; font-size: 0.875em;">We provide a projected timeline with every proposal. Timeline is based on the scope of work and weather conditions when applicable.</span></p></li></ul><ol start="7"><li><p><span style="font-family: Tahoma, sans-serif; font-size: 0.875em;"><strong>Will my furniture and belongings be protected?</strong></span></p></li></ol><ul><li><p><span style="font-family: Tahoma, sans-serif; font-size: 0.875em;">We take great care in protecting your property. All areas not being worked on will be properly covered and protected during the project.</span></p></li></ul></p>`;

const DEFAULT_PROPOSAL_TEMPLATES = [
  {
    name: "Interior Painting",
    lineItems: [
      {
        name: "Interior Painting",
        description: `<p><strong>Scope of Work – Interior Painting</strong><br><br><strong>Area Included</strong><br>\t•\tAll work limited to:<br>\t•\tWalls<br>\t•\tCeiling<br>\t•\tTrim, baseboards, window frames<br>\t•\tDoors (both sides)<br><br>Closets and any areas not explicitly listed are excluded.<br><br><strong>Painting Specifications</strong><br>\t•\tCeiling:<br>\t•\t1 coat of Super White – Flat Finish<br>\t•\tWalls:<br>\t•\t2 coats – Matte or Eggshell Finish (to be confirmed)<br>\t•\tTrim &amp; Doors:<br>\t•\t1 coat – Semi-Gloss Finish (standard white unless otherwise specified)<br><br><strong>Surface Preparation</strong><br>\t•\tLight patching of minor holes, cracks, or dents<br>\t•\tCaulking at trim and edge joints as needed<br>\t•\tLight sanding and cleaning of all surfaces prior to painting<br>\t•\tFull masking and protection of flooring, outlets, and fixtures</p>`,
        quantity: 1,
        unitPrice: 0,
        total: 0,
      },
    ],
    totalAmount: 0,
  },
];

// ============================================================
// DEFAULT SERVICE TEMPLATES (Service Templates page)
// ============================================================

const DEFAULT_DISPLAY_TOGGLES = {
  showLaborHrs: false,
  showLaborPrice: false,
  showMaterialQty: false,
  showMaterialPrice: false,
  showSurfaceDetails: false,
  showSurfaceTotal: false,
  showRepairPrice: false,
  showOverrideTotal: false,
  showCostBreakdown: false,
};

function makeRoom(partial: Partial<RoomBuilderRoom> & Pick<RoomBuilderRoom, "id" | "name">): RoomBuilderRoom {
  return {
    sectionType: undefined,
    length: 12,
    width: 12,
    ceilingHeight: 8,
    walls: false,
    ceiling: false,
    baseboard: false,
    crownMolding: false,
    shoeMolding: false,
    chairRail: false,
    doorCount: 0,
    windowCount: 0,
    doorCasing: false,
    windowCasing: false,
    doors: false,
    cabinets: false,
    cabinetsLf: 0,
    staircaseRailing: false,
    staircaseRailingLf: 0,
    accentWall: false,
    accentWallSqft: 0,
    closetInterior: false,
    closetInteriorSqft: 0,
    coatsOverride: {},
    materialOverride: {},
    primerOverride: {},
    surfaceDescriptionOverride: {},
    complexityOverride: {},
    repairOverride: {},
    isOptional: false,
    ...partial,
  };
}

function makeRoomBuilderData(rooms: RoomBuilderRoom[], opts?: Partial<RoomBuilderData>): RoomBuilderData {
  return {
    rooms,
    sellRate: 75,
    setupHoursPerRoom: 0.5,
    sameColorAllAreas: false,
    subtractOpenings: true,
    displayToggles: DEFAULT_DISPLAY_TOGGLES,
    materialCosts: [],
    totalLaborHours: 0,
    totalLaborCost: 0,
    totalMaterialCost: 0,
    grandTotal: 0,
    ...opts,
  };
}

function makeBlock(name: string, rooms: RoomBuilderRoom[], opts?: Partial<RoomBuilderData>): ProductionRateBlock {
  return {
    id: `prb-default-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name,
    roomBuilderData: makeRoomBuilderData(rooms, opts),
    lineItems: [],
    taxable: true,
  };
}

interface DefaultServiceTemplate {
  name: string;
  type: "production_rate" | "line_item";
  productionRateBlock?: ProductionRateBlock;
  lineItem?: { name?: string; description: string; quantity: number; unitPrice: number; total: number };
}

const DEFAULT_SERVICE_TEMPLATES: DefaultServiceTemplate[] = [
  // -------- LINE ITEMS (regular) --------
  {
    name: "Power Washing",
    type: "line_item",
    lineItem: {
      name: "Power Washing",
      description:
        "<p><strong>Exterior Power Washing</strong></p><ul><li>Pre-rinse and detergent application to siding, trim, and accessible exterior surfaces</li><li>Power wash to remove dirt, mildew, and loose chalking</li><li>Final rinse and surface dry prior to any prep or painting</li></ul>",
      quantity: 1,
      unitPrice: 45000,
      total: 45000,
    },
  },
  {
    name: "Paint 1 Room",
    type: "line_item",
    lineItem: {
      name: "Paint 1 Room",
      description:
        "<p><strong>Single Room Repaint – Walls Only</strong></p><ul><li>Light patching of nail holes and minor wall imperfections</li><li>Caulking of trim/edge joints as needed</li><li>2 coats premium paint on walls (color TBD by customer)</li><li>Full floor and furniture protection; clean-up included</li></ul><p><em>Trim, ceiling, and doors not included unless added separately.</em></p>",
      quantity: 1,
      unitPrice: 55000,
      total: 55000,
    },
  },

  // -------- PRODUCTION RATE BLOCKS --------
  {
    name: "Power Washing (Production Rate)",
    type: "production_rate",
    productionRateBlock: makeBlock("Power Washing", [
      makeRoom({
        id: "room-pw-exterior",
        name: "Exterior – Power Wash",
        sectionType: "exterior",
        length: 40,
        width: 30,
        ceilingHeight: 18,
        walls: true,
      }),
    ]),
  },
  {
    name: "Interior Painting",
    type: "production_rate",
    productionRateBlock: makeBlock("Interior Painting", [
      makeRoom({
        id: "room-int-living",
        name: "Living Room",
        sectionType: "room",
        length: 16,
        width: 14,
        ceilingHeight: 9,
        walls: true,
        ceiling: true,
        baseboard: true,
        doors: true,
        doorCount: 2,
        doorCasing: true,
        windowCount: 2,
        windowCasing: true,
      }),
    ]),
  },
  {
    name: "Exterior Painting",
    type: "production_rate",
    productionRateBlock: makeBlock("Exterior Painting", [
      makeRoom({
        id: "room-ext-house",
        name: "House Exterior",
        sectionType: "exterior",
        length: 40,
        width: 30,
        ceilingHeight: 18,
        walls: true,
        baseboard: false,
        doors: true,
        doorCount: 2,
        windowCount: 8,
        windowCasing: true,
      }),
    ]),
  },
  {
    name: "Kitchen Cabinets",
    type: "production_rate",
    productionRateBlock: makeBlock("Kitchen Cabinets", [
      makeRoom({
        id: "room-kitchen-cabs",
        name: "Kitchen Cabinets",
        sectionType: "room",
        length: 14,
        width: 12,
        ceilingHeight: 9,
        cabinets: true,
        cabinetsLf: 24,
      }),
    ]),
  },
  {
    name: "Bathroom Renovation Repaint",
    type: "production_rate",
    productionRateBlock: makeBlock("Bathroom Renovation Repaint", [
      makeRoom({
        id: "room-bath-main",
        name: "Bathroom",
        sectionType: "room",
        length: 8,
        width: 6,
        ceilingHeight: 8,
        walls: true,
        ceiling: true,
        baseboard: true,
        crownMolding: false,
        doors: true,
        doorCount: 1,
        doorCasing: true,
        windowCount: 1,
        windowCasing: true,
        cabinets: true,
        cabinetsLf: 6,
      }),
    ]),
  },
];

async function seedDefaultServiceTemplatesForUser(userId: string): Promise<void> {
  try {
    const existing = await db
      .select()
      .from(serviceTemplates)
      .where(eq(serviceTemplates.userId, userId));

    const existingNames = new Set(existing.map((t) => t.name.toLowerCase()));

    for (const tmpl of DEFAULT_SERVICE_TEMPLATES) {
      if (existingNames.has(tmpl.name.toLowerCase())) continue;
      await db.insert(serviceTemplates).values({
        userId,
        name: tmpl.name,
        type: tmpl.type,
        productionRateBlock: tmpl.productionRateBlock ?? null,
        lineItem: tmpl.lineItem ?? null,
      });
      console.log(`[ServiceTemplates] Created "${tmpl.name}" for user ${userId}`);
    }
  } catch (error) {
    console.error(`[ServiceTemplates] ERROR seeding for user ${userId}:`, error);
  }
}

async function seedMessageTemplatesForUser(userId: string): Promise<void> {
  try {
    const existing = await db
      .select()
      .from(messageTemplates)
      .where(eq(messageTemplates.userId, userId));

    const existingSlugs = new Set(existing.map(t => t.slug));

    for (const tmpl of DEFAULT_MESSAGE_TEMPLATES) {
      if (!existingSlugs.has(tmpl.slug)) {
        await db.insert(messageTemplates).values({
          userId,
          slug: tmpl.slug,
          category: tmpl.category,
          title: tmpl.title,
          content: tmpl.content,
          emailSubject: tmpl.emailSubject,
          emailContent: tmpl.emailContent,
        });
      } else {
        const existingTmpl = existing.find(t => t.slug === tmpl.slug);
        if (existingTmpl && (!existingTmpl.emailSubject && !existingTmpl.emailContent)) {
          await db.update(messageTemplates)
            .set({
              emailSubject: tmpl.emailSubject,
              emailContent: tmpl.emailContent,
            })
            .where(eq(messageTemplates.id, existingTmpl.id));
        }
      }
    }
  } catch (error) {
    console.error(`[MessageTemplates] ERROR seeding for user ${userId}:`, error);
  }
}

export async function seedDefaultTemplatesForUser(userId: string): Promise<void> {
  console.log(`[Templates] Starting template seed for user ${userId}`);

  // Seed Terms and Conditions
  try {
    const existingTerms = await db
      .select()
      .from(templates)
      .where(eq(templates.userId, userId));

    const termsTemplate = existingTerms.find((t) => t.slug === "terms_and_conditions");

    if (!termsTemplate) {
      await db.insert(templates).values({
        userId,
        slug: "terms_and_conditions",
        title: "Terms and Conditions",
        content: DEFAULT_TERMS_AND_CONDITIONS,
      });
      console.log(`[Templates] Created Terms and Conditions for user ${userId}`);
    } else if (!termsTemplate.content || termsTemplate.content.trim() === "") {
      await db.update(templates)
        .set({ content: DEFAULT_TERMS_AND_CONDITIONS })
        .where(eq(templates.id, termsTemplate.id));
      console.log(`[Templates] Filled empty Terms and Conditions for user ${userId}`);
    } else {
      console.log(`[Templates] Terms and Conditions already exists for user ${userId}`);
    }
  } catch (error) {
    console.error(`[Templates] ERROR creating Terms and Conditions for user ${userId}:`, error);
  }

  // Seed Standard Expectations
  try {
    const existingExp = await db
      .select()
      .from(templates)
      .where(eq(templates.userId, userId));

    const expectationsTemplate = existingExp.find((t) => t.slug === "standard_expectations");

    if (!expectationsTemplate) {
      await db.insert(templates).values({
        userId,
        slug: "standard_expectations",
        title: "Standard Expectations",
        content: DEFAULT_STANDARD_EXPECTATIONS,
      });
      console.log(`[Templates] Created Standard Expectations for user ${userId}`);
    } else if (!expectationsTemplate.content || expectationsTemplate.content.trim() === "") {
      await db.update(templates)
        .set({ content: DEFAULT_STANDARD_EXPECTATIONS })
        .where(eq(templates.id, expectationsTemplate.id));
      console.log(`[Templates] Filled empty Standard Expectations for user ${userId}`);
    } else {
      console.log(`[Templates] Standard Expectations already exists for user ${userId}`);
    }
  } catch (error) {
    console.error(`[Templates] ERROR creating Standard Expectations for user ${userId}:`, error);
  }

  // Seed Payment Instructions
  try {
    const existingPI = await db
      .select()
      .from(templates)
      .where(eq(templates.userId, userId));

    const paymentInstructionsTemplate = existingPI.find((t) => t.slug === "payment_instructions");

    if (!paymentInstructionsTemplate) {
      await db.insert(templates).values({
        userId,
        slug: "payment_instructions",
        title: "Payment Instructions",
        content: "<p>Thank you! Please follow up with us for the next steps to process your payment. We accept various payment methods and will work with you to find the most convenient option.</p>",
      });
      console.log(`[Templates] Created Payment Instructions for user ${userId}`);
    } else {
      console.log(`[Templates] Payment Instructions already exists for user ${userId}`);
    }
  } catch (error) {
    console.error(`[Templates] ERROR creating Payment Instructions for user ${userId}:`, error);
  }

  // Seed Proposal Templates
  try {
    const existingProposalTemplates = await db
      .select()
      .from(proposalTemplates)
      .where(eq(proposalTemplates.userId, userId));

    const existingProposalNames = new Set(
      existingProposalTemplates.map((t) => t.name.toLowerCase())
    );

    for (const defaultPT of DEFAULT_PROPOSAL_TEMPLATES) {
      if (!existingProposalNames.has(defaultPT.name.toLowerCase())) {
        await db.insert(proposalTemplates).values({
          userId,
          name: defaultPT.name,
          lineItems: defaultPT.lineItems,
          totalAmount: defaultPT.totalAmount,
        });
        console.log(`[Templates] Created proposal template "${defaultPT.name}" for user ${userId}`);
      }
    }
  } catch (error) {
    console.error(`[Templates] ERROR creating proposal templates for user ${userId}:`, error);
  }

  // Seed Service Templates (reusable services for proposals)
  await seedDefaultServiceTemplatesForUser(userId);

  // Seed Message Templates
  await seedMessageTemplatesForUser(userId);

  console.log(`[Templates] Finished template seed for user ${userId}`);
}

export async function seedDefaultTemplatesForAllExistingUsers(): Promise<void> {
  try {
    const allUsers = await db.select({ id: users.id }).from(users);
    console.log(`[Templates] Checking default templates for ${allUsers.length} existing user(s)...`);
    for (const user of allUsers) {
      await seedDefaultTemplatesForUser(user.id);
    }
    console.log("[Templates] Startup template check complete.");
  } catch (error) {
    console.error("[Templates] Error during startup template seeding:", error);
  }
}
