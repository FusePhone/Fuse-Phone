import { pgTable, text, serial, integer, boolean, timestamp, jsonb, varchar, doublePrecision, uniqueIndex } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./models/auth";

export * from "./models/auth";
export * from "./models/chat";

// === SUBSCRIPTION & PROMO CODES ===

export const promoCodes = pgTable("promo_codes", {
  id: serial("id").primaryKey(),
  code: varchar("code").notNull().unique(),
  description: text("description"),
  discountType: varchar("discount_type").notNull().default('fixed'),
  discountAmount: integer("discount_amount").notNull(),
  tier: varchar("tier"),
  appliesTo: varchar("applies_to").default('plan'),
  durationMonths: integer("duration_months"),
  trialDays: integer("trial_days"),
  maxUses: integer("max_uses"),
  currentUses: integer("current_uses").default(0),
  active: boolean("active").default(true),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// === TAX PROFILES ===

export const taxProfiles = pgTable("tax_profiles", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  name: varchar("name").notNull(),
  rate: text("rate").notNull(),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTaxProfileSchema = createInsertSchema(taxProfiles).omit({ id: true, createdAt: true });
export type InsertTaxProfile = z.infer<typeof insertTaxProfileSchema>;
export type TaxProfile = typeof taxProfiles.$inferSelect;

// === TABLE DEFINITIONS ===

export const contacts = pgTable("contacts", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(), // Owner of this contact
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  address: text("address"), // Street address
  city: text("city"),
  state: text("state"),
  zipCode: text("zip_code"),
  type: text("type").notNull().default('lead'), // 'lead' | 'contact' | 'client'
  status: text("status").notNull().default('new'), // 'new', 'contacted', 'qualified', 'proposal_sent', 'won', 'lost'
  leadSource: text("lead_source"), // 'website', 'referral', 'social_media', 'cold_call', 'trade_show', 'other'
  notes: text("notes"),
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  pauseAutomations: boolean("pause_automations").default(false),
  archived: boolean("archived").notNull().default(false),
  archivedAt: timestamp("archived_at"),
  unsubscribedAt: timestamp("unsubscribed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export interface PaymentScheduleItem {
  label: string;
  amount: number;
  dueCondition?: string;
  paid?: boolean;
  paidAt?: string;
  stripePaymentId?: string;
}

export interface PaymentSettings {
  depositRequired: boolean;
  depositType: 'fixed' | 'percentage';
  depositAmount: number;
  schedule: PaymentScheduleItem[];
  showPaymentSchedule?: boolean;
  allowOnlinePayment?: boolean;
  allowOfflinePayment?: boolean;
  showFinancing?: boolean;
  cardFeeEnabled?: boolean;
  cardFeePercent?: number;
}

export interface SurfaceCalcResult {
  surfaceName: string;
  surfaceKey: string;
  quantity: number;
  unit: string;
  coats: number;
  coatsLabel?: string;
  usePrimer?: boolean;
  usePaint?: boolean;
  laborHours: number;
  price: number;
  paintableSqft: number;
  materialName?: string;
  materialType?: string;
  materialId?: number | null;
  materialCoverageRate?: number;
  materialQtyExact?: number;
  materialQtyBuy?: number;
  materialCostPerUnit?: number;
  materialTotalCost?: number;
  materialUnit?: string;
  inMaterialGroup?: boolean;
  materialGroupName?: string;
  primerCoats?: number;
  primerLaborHours?: number;
  primerPaintableSqft?: number;
  primerMaterialId?: number | null;
  primerMaterialName?: string;
  primerMaterialType?: string;
  primerMaterialCoverageRate?: number;
  primerMaterialQtyExact?: number;
  primerMaterialQtyBuy?: number;
  primerMaterialCostPerUnit?: number;
  primerMaterialTotalCost?: number;
  primerMaterialUnit?: string;
  inPrimerGroup?: boolean;
  primerGroupName?: string;
  complexityHours?: number;
  repairHours?: number;
  repairPrice?: number;
  repairDescription?: string;
  description?: string;
}

export interface AreaCalcResult {
  roomId: string;
  roomName: string;
  scopeNotes?: string;
  crewNotes?: string[];
  length: number;
  width: number;
  ceilingHeight: number;
  surfaces: SurfaceCalcResult[];
  setupHours: number;
  totalLaborHours: number;
  totalPrice: number;
  materialCosts: MaterialCostEntry[];
  isOptional?: boolean;
}

export type SectionType = 'room' | 'exterior' | 'area' | 'cabinets';

export interface RoomBuilderRoom {
  id: string;
  name: string;
  sectionType?: SectionType;
  length: number;
  width: number;
  ceilingHeight: number;
  walls: boolean;
  ceiling: boolean;
  baseboard: boolean;
  crownMolding: boolean;
  shoeMolding: boolean;
  chairRail: boolean;
  doorCount: number;
  windowCount: number;
  doorCasing: boolean;
  windowCasing: boolean;
  doors: boolean;
  cabinets?: boolean;
  cabinetsLf?: number;
  staircaseRailing?: boolean;
  staircaseRailingLf?: number;
  accentWall?: boolean;
  accentWallSqft?: number;
  closetInterior?: boolean;
  closetInteriorSqft?: number;
  doorHeightFt?: number;
  doorWidthFt?: number;
  scopeNotes?: string;
  coatsOverride: Record<string, number>;
  materialOverride?: Record<string, number | null>;
  primerOverride?: Record<string, { enabled: boolean; coats?: number; materialId?: number | null }>;
  surfaceDescriptionOverride?: Record<string, string>;
  complexityOverride?: Record<string, number>;
  repairOverride?: Record<string, { hours: number; description?: string }>;
  isOptional?: boolean;
  priceOverride?: number | null;
  photos?: Array<{ url: string; timestamp: string; showOnProposal?: boolean }>;
  showPhotosOnProposal?: boolean;
  wallSelections?: Array<{ enabled: boolean; sqftOverride?: number | null }>;
  dynamicSurfaces?: Record<string, { enabled: boolean; qty: number }>;
  surfacePriceOverride?: Record<string, number>;
  excludeMaterialCost?: Record<string, boolean>;
  excludePrimerCost?: Record<string, boolean>;
}

export interface BookingFieldConfig {
  id: string;
  label: string;
  type: 'text' | 'email' | 'phone' | 'date' | 'time' | 'textarea' | 'file' | 'address';
  required: boolean;
  enabled: boolean;
}

export const DEFAULT_BOOKING_FIELDS: BookingFieldConfig[] = [
  { id: 'firstName', label: 'First Name', type: 'text', required: true, enabled: true },
  { id: 'lastName', label: 'Last Name', type: 'text', required: true, enabled: true },
  { id: 'email', label: 'Email', type: 'email', required: true, enabled: true },
  { id: 'phone', label: 'Phone', type: 'phone', required: true, enabled: true },
  { id: 'address', label: 'Address', type: 'address', required: false, enabled: true },
  { id: 'preferredDate', label: 'Preferred Date', type: 'date', required: false, enabled: true },
  { id: 'preferredTime', label: 'Preferred Time', type: 'time', required: false, enabled: true },
  { id: 'alternateDate', label: 'Alternative Date', type: 'date', required: false, enabled: true },
  { id: 'alternateTime', label: 'Alternative Time', type: 'time', required: false, enabled: true },
  { id: 'projectDescription', label: 'Project Description', type: 'textarea', required: false, enabled: true },
  { id: 'fileUpload', label: 'Photos / Documents', type: 'file', required: false, enabled: true },
];

export interface MaterialCostEntry {
  surfaceName: string;
  materialName: string;
  materialUnit: string;
  totalSqft: number;
  coveragePerUnit: number;
  exactQtyNeeded: number;
  qtyToBuy: number;
  costPerUnit: number;
  totalCost: number;
  excludedSqft?: number;
  excludedCost?: number;
}

export interface DisplayToggles {
  showLaborHrs: boolean;
  showLaborPrice: boolean;
  showMaterialQty: boolean;
  showMaterialPrice: boolean;
  showSurfaceDetails: boolean;
  showSurfaceTotal?: boolean;
  showRepairPrice?: boolean;
  showOverrideTotal?: boolean;
  showCostBreakdown?: boolean;
  showMaterials?: boolean;
  showProjectTotalSqft?: boolean;
}

export interface ItemSurface {
  key: string;
  label: string;
  qty: number | null;
  unit: string | null;
  coats: number;
  coatsLabel?: string;
  usePrimer?: boolean;
  usePaint?: boolean;
  primerCoats?: number;
  paintGroupKey?: string;
}

export interface ItemPricingDetails {
  mode: 'simple' | 'production';
  dimensions?: { L: number; W: number; H: number };
  surfaceBreakdown?: Array<{
    key: string;
    label: string;
    qty: number;
    unit: string;
    coats: number;
    laborHours: number;
  }>;
  setupHours?: number;
  totalLaborHours?: number;
  sellRateUsed?: number;
}

export interface ItemMaterialsBreakdown {
  materialsConfigured: boolean;
  selectedPaintLine?: string;
  coverageUsedWasDefault?: boolean;
  wasteUsedWasDefault?: boolean;
  totals?: {
    paintableSqft: number;
    gallonsExact: number;
    gallonsToBuy: number;
    estimatedMaterialCostCents: number | null;
  };
}

export interface ItemDisplayOverrides {
  pricingDetails?: boolean | null;
  showSurfaceDetails?: boolean | null;
  showLaborHrs?: boolean | null;
  showLaborRate?: boolean | null;
  showLaborPrice?: boolean | null;
  showMaterialQty?: boolean | null;
  showMaterialPrice?: boolean | null;
  showCoats?: boolean | null;
}

export interface ProposalDisplayDefaults {
  pricingDetails: boolean;
  showSurfaceDetails: boolean;
  showLaborHrs: boolean;
  showLaborRate: boolean;
  showLaborPrice: boolean;
  showMaterialQty: boolean;
  showMaterialPrice: boolean;
  showCoats: boolean;
}

export const DEFAULT_PROPOSAL_DISPLAY: ProposalDisplayDefaults = {
  pricingDetails: false,
  showSurfaceDetails: false,
  showLaborHrs: false,
  showLaborRate: false,
  showLaborPrice: false,
  showMaterialQty: false,
  showMaterialPrice: false,
  showCoats: true,
};

export interface ItemPaintAssignment {
  paintGroupKey?: string;
  colorName?: string;
  colorText?: string;
  finish?: string;
  brand?: string;
  product?: string;
  materialId?: number;
}

export interface ItemDebug {
  mode?: string;
  dimensions?: { L: number; W: number; H: number };
  surfacesUsed?: string[];
  laborHours?: Record<string, number>;
  materialsBreakdown?: ItemMaterialsBreakdown;
  warnings?: string[];
}

export interface UnifiedLineItem {
  name?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  taxable?: boolean;
  taxProfileId?: number;
  taxProfileName?: string;
  taxProfileRate?: number;
  isOptional?: boolean;
  descriptionOnly?: boolean;
  hidePrice?: boolean;
  isOverallPrep?: boolean;
  scopeNoteHtml?: string;
  surfaces?: ItemSurface[];
  pricingDetails?: ItemPricingDetails;
  paintAssignment?: ItemPaintAssignment;
  displayOverrides?: ItemDisplayOverrides;
  debug?: ItemDebug;
}

export interface MaterialGroup {
  id: string;
  name: string;
  surfaceKeys: string[];
  materialId: number | null;
  materialName?: string;
  areaIds?: string[];
  type?: 'paint' | 'primer';
  qtyToBuyOverride?: number | null;
}

export interface MaterialGroupCalcResult {
  groupId: string;
  groupName: string;
  materialName: string;
  materialUnit: string;
  totalSqft: number;
  coveragePerUnit: number;
  exactQtyNeeded: number;
  qtyToBuy: number;
  costPerUnit: number;
  totalCost: number;
  surfaces: { surfaceName: string; sqft: number }[];
  excludedSqft?: number;
  excludedCost?: number;
}

export interface RoomBuilderData {
  rooms: RoomBuilderRoom[];
  areaResults?: AreaCalcResult[];
  materialGroups?: MaterialGroup[];
  materialGroupResults?: MaterialGroupCalcResult[];
  primerGroups?: MaterialGroup[];
  primerGroupResults?: MaterialGroupCalcResult[];
  sellRate: number;
  setupHoursPerRoom: number;
  sameColorAllAreas?: boolean;
  subtractOpenings?: boolean;
  estimateType?: string;
  displayToggles: DisplayToggles;
  materialCosts: MaterialCostEntry[];
  totalLaborHours: number;
  totalLaborCost: number;
  totalMaterialCost: number;
  grandTotal: number;
  customerProvidingMaterials?: boolean;
}

export interface ProductionRateBlock {
  id: string;
  name: string;
  roomBuilderData: RoomBuilderData;
  lineItems: Array<UnifiedLineItem>;
  taxable?: boolean;
  taxProfileId?: number;
  taxProfileName?: string;
  taxProfileRate?: number;
  isOptional?: boolean;
}

export interface PackageFeature {
  name: string;
  included: boolean;
  description?: string;
  active?: boolean;
}

export interface PackageSnapshot {
  id: number;
  name: string;
  description?: string;
  recommended: boolean;
  priceAdjustmentType: 'percent' | 'flat';
  adjustmentValue: number;
  materialMultiplier: number;
  features: PackageFeature[];
  active?: boolean;
}

export interface UpsellSnapshot {
  id: number;
  name: string;
  description?: string;
  priceValue: number;
  active?: boolean;
}

export interface DocumentDiscount {
  id?: string;
  type: 'flat' | 'percentage';
  value: number;
  label?: string;
  description?: string;
}

export interface DocumentContent {
  items: Array<UnifiedLineItem>;
  notes?: string;
  validUntil?: string;
  paymentSettings?: PaymentSettings;
  roomBuilderData?: RoomBuilderData;
  productionRateBlocks?: ProductionRateBlock[];
  // Saved order of items+blocks. Each entry is "item" or "block"; the n-th
  // "item" entry maps to items[n] and the n-th "block" maps to
  // productionRateBlocks[n]. Used to interleave both lists when rendering.
  itemOrder?: string[];
  proposalDisplayDefaults?: ProposalDisplayDefaults;
  acceptedOptionalItems?: string[];
  // Customer-accepted optional Room Builder areas, encoded as
  // `${blockId}:area:${roomId}`. Persisted on the document at signing time.
  acceptedOptionalAreas?: string[];
  excludedSurfaces?: string[];
  contractorHiddenAreas?: string[];
  contractorHiddenSurfaces?: string[];
  selectedPackageId?: number;
  selectedUpsellIds?: number[];
  packageSnapshot?: PackageSnapshot;
  upsellSnapshots?: UpsellSnapshot[];
  proposalPackagesEnabled?: boolean;
  proposalPackagesData?: PackageSnapshot[];
  proposalUpsellsData?: UpsellSnapshot[];
  proposalMaterialAdjustments?: boolean;
  discount?: DocumentDiscount;
  discounts?: DocumentDiscount[];
  includedSourcePhotos?: string[];
}

export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(), // Owner of this document
  publicToken: text("public_token").notNull().unique(), // Secure random token for public access
  contactId: integer("contact_id").notNull(),
  projectId: integer("project_id"),
  type: text("type").notNull(), // 'estimate', 'proposal', 'change_order', 'invoice'
  status: text("status").notNull().default('draft'), // 'draft', 'sent', 'viewed', 'accepted', 'rejected', 'paid', 'created' (created is for invoices only)
  title: text("title").notNull(),
  content: jsonb("content").notNull().$type<DocumentContent>(),
  totalAmount: integer("total_amount").notNull(), // in cents
  // Job Address fields (separate from contact billing address)
  jobAddress: text("job_address"),
  jobCity: text("job_city"),
  jobState: text("job_state"),
  jobZipCode: text("job_zip_code"),
  jobAddressSameAsBilling: boolean("job_address_same_as_billing").default(false),
  signature: text("signature"), // base64 or text representation
  signedAt: timestamp("signed_at"),
  // Link to invoice created from this proposal/estimate
  linkedInvoiceId: integer("linked_invoice_id"), // ID of the invoice created when this proposal is accepted
  // Link back to source proposal/estimate (for invoices created from proposals)
  sourceDocumentId: integer("source_document_id"), // ID of the proposal/estimate this invoice was created from
  // View tracking
  firstViewedAt: timestamp("first_viewed_at"), // When customer first opened the link
  lastViewedAt: timestamp("last_viewed_at"), // Most recent view
  viewCount: integer("view_count").notNull().default(0), // Total number of views
  // Payment request tracking (in cents)
  requestedPaymentAmount: integer("requested_payment_amount"),
  // Archive status
  documentNumber: integer("document_number"),
  companyCamProjectId: text("company_cam_project_id"),
  companyCamProjectName: text("company_cam_project_name"),
  archived: boolean("archived").notNull().default(false),
  allowClientColorSubmission: boolean("allow_client_color_submission").default(true),
  colorSubmissionStatus: text("color_submission_status").default('not_requested'),
  publishedContent: jsonb("published_content").$type<DocumentContent>(),
  publishedTotalAmount: integer("published_total_amount"),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// View history for documents - records each time a customer views a document
export const documentViews = pgTable("document_views", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull(),
  viewedAt: timestamp("viewed_at").defaultNow(),
  ipAddress: text("ip_address"), // Optional: track IP for analytics
  userAgent: text("user_agent"), // Optional: track browser/device
});

export const communications = pgTable("communications", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  contactId: integer("contact_id"),
  projectId: integer("project_id"),
  phoneNumber: text("phone_number"),
  type: text("type").notNull(), // 'call', 'sms', 'email'
  direction: text("direction").notNull(), // 'inbound', 'outbound'
  content: text("content"),
  mediaUrl: text("media_url"),
  mediaUrls: text("media_urls").array(),
  mediaContentTypes: text("media_content_types").array(),
  mediaType: text("media_type"), // 'image', 'audio', 'video', 'pdf', 'mixed'
  documentId: integer("document_id"), // Link to document for group messaging
  // Set on the synthetic inbound mimic SMS we create when a booking form is
  // submitted, so the in-thread "View & Schedule Appointment" button can deep-
  // link straight into the matching booking request card on the calendar.
  bookingRequestId: integer("booking_request_id"),
  isRead: boolean("is_read").notNull().default(false),
  timestamp: timestamp("timestamp").defaultNow(),
  messageSid: text("message_sid"),
});

export const companySettings = pgTable("company_settings", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().unique(), // One settings per user
  companyName: text("company_name").notNull().default('My Company'),
  companyLicense: text("company_license"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zipCode: text("zip_code"),
  phone: text("phone"),
  email: text("email"),
  website: text("website"),
  bookingUrl: text("booking_url"),
  bookingToken: text("booking_token").unique(), // Secure token for public booking form
  bookingSlug: text("booking_slug").unique(), // URL-friendly slug for public booking page (e.g. gama-interior-painting)
  crewClockToken: text("crew_clock_token").unique(), // Token for public crew clock-in/out page
  logo: text("logo"),
  twilioAccountSid: text("twilio_account_sid"),
  twilioAuthToken: text("twilio_auth_token"),
  twilioPhoneNumber: text("twilio_phone_number"),
  twilioOfficePhone: text("twilio_office_phone"),
  twilioMessagingServiceSid: text("twilio_messaging_service_sid"),
  phoneProvider: text("phone_provider").default("twilio"),
  openphoneApiKey: text("openphone_api_key"),
  openphonePhoneNumber: text("openphone_phone_number"),
  openphoneWebhookSecret: text("openphone_webhook_secret"),
  twilioBusinessType: text("twilio_business_type"),
  twilioEin: text("twilio_ein"),
  twilioA2pBrandSid: text("twilio_a2p_brand_sid"),
  twilioA2pBrandStatus: text("twilio_a2p_brand_status"),
  twilioA2pCampaignSid: text("twilio_a2p_campaign_sid"),
  twilioA2pCampaignStatus: text("twilio_a2p_campaign_status"),
  googleMapsApiKey: text("google_maps_api_key"),
  // Google OAuth integration fields
  googleAccessToken: text("google_access_token"),
  googleRefreshToken: text("google_refresh_token"),
  googleTokenExpiry: timestamp("google_token_expiry"),
  googleEmail: text("google_email"),
  googleCalendarId: text("google_calendar_id"),
  googleCalendarSyncEnabled: boolean("google_calendar_sync_enabled").default(false),
  googleConnectedAt: timestamp("google_connected_at"),
  companyCamApiToken: text("company_cam_api_token"),
  companyCamConnectedAt: timestamp("company_cam_connected_at"),
  companyCamAutoCreateProject: boolean("company_cam_auto_create_project").default(false),
  thumbtackBusinessId: text("thumbtack_business_id"),
  thumbtackWebhookSecret: text("thumbtack_webhook_secret"),
  thumbtackWebhookToken: text("thumbtack_webhook_token").unique(),
  thumbtackConnectedAt: timestamp("thumbtack_connected_at"),
  thumbtackSetupEmailSentAt: timestamp("thumbtack_setup_email_sent_at"),
  thumbtackFirstLeadAt: timestamp("thumbtack_first_lead_at"),
  zapierWebhookSecret: text("zapier_webhook_secret"),
  zapierWebhookToken: text("zapier_webhook_token").unique(),
  zapierConnectedAt: timestamp("zapier_connected_at"),
  facebookPageId: text("facebook_page_id"),
  facebookPageName: text("facebook_page_name"),
  facebookPageAccessToken: text("facebook_page_access_token"),
  facebookUserToken: text("facebook_user_token"),
  facebookWebhookVerifyToken: text("facebook_webhook_verify_token"),
  facebookWebhookToken: text("facebook_webhook_token").unique(),
  facebookConnectedAt: timestamp("facebook_connected_at"),
  facebookFirstLeadAt: timestamp("facebook_first_lead_at"),
  facebookPixelId: text("facebook_pixel_id"),
  facebookCapiToken: text("facebook_capi_token"),
  reviewLink: text("review_link"),
  timezone: text("timezone").default("America/New_York"),
  workingHours: text("working_hours"),
  businessHoursGreeting: text("business_hours_greeting"),
  afterHoursGreeting: text("after_hours_greeting"),
  voicemailGreeting: text("voicemail_greeting"),
  businessHoursGreetingAudio: text("business_hours_greeting_audio"),
  afterHoursGreetingAudio: text("after_hours_greeting_audio"),
  voicemailGreetingAudio: text("voicemail_greeting_audio"),
  tryOfficeAfterHours: boolean("try_office_after_hours").default(false),
  browserCallsEnabled: boolean("browser_calls_enabled").default(false),
  browserCallActiveDeviceId: text("browser_call_active_device_id"),
  browserCallActiveDeviceName: text("browser_call_active_device_name"),
  browserCallActiveAt: timestamp("browser_call_active_at"),
  twilioTwimlAppSid: text("twilio_twiml_app_sid"),
  twilioApiKeySid: text("twilio_api_key_sid"),
  twilioApiKeySecret: text("twilio_api_key_secret"),
  lastSeenLeadsAt: timestamp("last_seen_leads_at"),
  lastSeenProjectsAt: timestamp("last_seen_projects_at"),
  lastSeenCalendarAt: timestamp("last_seen_calendar_at"),
  stripePublishableKey: text("stripe_publishable_key"),
  stripeSecretKey: text("stripe_secret_key"),
  stripeConnectedAt: timestamp("stripe_connected_at"),
  stripeAccountId: text("stripe_account_id"),
  squareMerchantId: text("square_merchant_id"),
  squareAccessToken: text("square_access_token"),
  squareRefreshToken: text("square_refresh_token"),
  squareLocationId: text("square_location_id"),
  activePaymentProcessor: text("active_payment_processor"),
  smtpHost: text("smtp_host"),
  smtpPort: integer("smtp_port"),
  smtpUser: text("smtp_user"),
  smtpPass: text("smtp_pass"),
  smtpSecure: boolean("smtp_secure").default(true),
  smtpFromEmail: text("smtp_from_email"),
  smtpFromName: text("smtp_from_name"),
  imapHost: text("imap_host"),
  imapPort: integer("imap_port"),
  imapUser: text("imap_user"),
  imapPass: text("imap_pass"),
  imapSecure: boolean("imap_secure").default(true),
  smtpConnectedAt: timestamp("smtp_connected_at"),
  sendgridDomain: text("sendgrid_domain"),
  sendgridDomainId: integer("sendgrid_domain_id"),
  sendgridDomainVerified: boolean("sendgrid_domain_verified").default(false),
  sendgridFromEmail: text("sendgrid_from_email"),
  sendgridConnectedAt: timestamp("sendgrid_connected_at"),
  taxRate: text("tax_rate"),
  aiAutoRespond: boolean("ai_auto_respond").default(false),
  brandColor: text("brand_color"),
  secondaryColor: text("secondary_color"),
  tagline: text("tagline"),
  documentTrustBadges: jsonb("document_trust_badges").$type<Array<{ id: string; label: string }>>(),
  useBrandColorOnDocs: boolean("use_brand_color_on_docs").default(false),
  aiSmsMode: text("ai_sms_mode").default("suggest_only"),
  aiSmsResponseDelay: integer("ai_sms_response_delay").default(30),
  aiAssistantEnabled: boolean("ai_assistant_enabled").default(false),
  aiAssistantGreeting: text("ai_assistant_greeting"),
  aiAssistantName: text("ai_assistant_name"),
  aiAssistantVoice: text("ai_assistant_voice").default("sage"),
  aiAssistantMode: text("ai_assistant_mode").default("receptionist"),
  aiCallDisclosureMessage: text("ai_call_disclosure_message").default("This call may be monitored or recorded for quality and training purposes."),
  aiCallDisclosureEnabled: boolean("ai_call_disclosure_enabled").default(true),
  aiFollowUpSmsEnabled: boolean("ai_follow_up_sms_enabled").default(true),
  aiFollowUpSmsMessage: text("ai_follow_up_sms_message"),
  newSmsAutoReplyEnabled: boolean("new_sms_auto_reply_enabled").default(false),
  newSmsAutoReplyMessage: text("new_sms_auto_reply_message"),
  aiCallRoutingMode: text("ai_call_routing_mode").default("office_first"),
  appointmentReminderIntervals: jsonb("appointment_reminder_intervals").$type<number[]>().default([1440, 120]),
  defaultPaymentSettings: jsonb("default_payment_settings").$type<PaymentSettings>(),
  roleCapabilityDefaults: jsonb("role_capability_defaults").$type<Record<string, Record<string, boolean>>>(),
  customRoles: jsonb("custom_roles").$type<Array<{ value: string; label: string; description: string }>>(),
  dismissedAttention: jsonb("dismissed_attention").$type<{ date: string; items: string[] }>(),
  lastAttentionDigestSentAt: timestamp("last_attention_digest_sent_at"),
  lastAttentionDigestCount: integer("last_attention_digest_count").default(0),
  // Daily reminder (digest) push: fires once per day at the user's chosen
  // local hour, even if no new items appeared, so stragglers don't rot.
  attentionDigestEnabled: boolean("attention_digest_enabled").default(true),
  attentionDigestHour: integer("attention_digest_hour").default(6),
  // Immediate push: fires the moment a project enters the attention set,
  // so the user knows about it in real time.
  attentionImmediateEnabled: boolean("attention_immediate_enabled").default(true),
  // Snapshot of the project IDs we've already notified the user about. The
  // scheduler diffs the current attention set against this list and only
  // pushes for newly-added IDs. NULL = never observed yet (the next tick
  // seeds the snapshot WITHOUT firing pushes, so users with pre-existing
  // attention items don't get a burst on first deploy).
  attentionLastNotifiedIds: jsonb("attention_last_notified_ids").$type<number[]>(),
  financingEnabled: boolean("financing_enabled").default(false),
  financingProvider: text("financing_provider"),
  financingLink: text("financing_link"),
  packagesEnabled: boolean("packages_enabled").default(false),
  packageMaterialAdjustments: boolean("package_material_adjustments").default(false),
  upsellsEnabled: boolean("upsells_enabled").default(true),
  complianceData: jsonb("compliance_data").$type<{
    insurances: Array<{ id: string; type: string; provider: string; policyNumber: string; expirationDate: string; coverageAmount: string; documentPath?: string }>;
    certificates: Array<{ id: string; name: string; issuedBy: string; number: string; expirationDate: string; documentPath?: string }>;
    awards?: Array<{ id: string; name: string; issuedBy: string; year: string; documentPath?: string }>;
  }>(),
  coiFilePath: text("coi_file_path"),
  aiLeadSuggestionsEnabled: boolean("ai_lead_suggestions_enabled").default(true),
  customDomain: text("custom_domain"),
  customDomainVerified: boolean("custom_domain_verified").default(false),
  customDomainVerifiedAt: timestamp("custom_domain_verified_at"),
  cloudflareHostnameId: text("cloudflare_hostname_id"),
  whiteLabelEnabled: boolean("white_label_enabled").default(false),
  contractorSignature: text("contractor_signature"),
  useContractorSignature: boolean("use_contractor_signature").default(false),
  monthlySalesGoal: integer("monthly_sales_goal"),
  archiveFreelancerEmail: text("archive_freelancer_email"),
  archiveDripjobsEmail: text("archive_dripjobs_email"),
  archiveDripjobsPassword: text("archive_dripjobs_password"),
  paintStoreName: text("paint_store_name"),
  paintStorePhone: text("paint_store_phone"),
  paintStoreEmail: text("paint_store_email"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Payments table for tracking payments on invoices
export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(), // Owner of this payment
  documentId: integer("document_id").notNull(),
  amount: integer("amount").notNull(), // in cents
  paymentType: text("payment_type").notNull(), // 'cash', 'check', 'zelle', 'credit_card'
  paymentDate: timestamp("payment_date").notNull().defaultNow(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Templates table for reusable content (terms, expectations, etc.)
export const templates = pgTable("templates", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(), // Owner of this template
  slug: text("slug").notNull(), // 'terms_and_conditions', 'standard_expectations', etc.
  title: text("title").notNull(),
  content: text("content").notNull(), // Rich text HTML content
  enabled: boolean("enabled").default(false), // Show on customer documents (off by default)
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Proposal templates - reusable proposal structures with line items
export const proposalTemplates = pgTable("proposal_templates", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(), // Owner of this template
  name: text("name").notNull(), // Template name
  lineItems: jsonb("line_items").notNull().$type<
    Array<{ name?: string; description: string; quantity: number; unitPrice: number; total: number }>
  >(),
  productionRateBlocks: jsonb("production_rate_blocks").$type<ProductionRateBlock[]>(),
  // Persists the unified ordering of blocks + line items as the user arranges them
  // via drag-and-drop. Each entry references a block by its id or a line item by
  // its ordinal index in the saved `lineItems` array.
  entryOrder: jsonb("entry_order").$type<Array<{ kind: 'block' | 'item'; key: string | number }>>(),
  totalAmount: integer("total_amount").notNull(), // in cents
  validUntilDays: integer("valid_until_days"),
  paymentSettings: jsonb("payment_settings").$type<PaymentSettings>(),
  discounts: jsonb("discounts").$type<DocumentDiscount[]>(),
  proposalPackagesEnabled: boolean("proposal_packages_enabled").default(false),
  proposalPackagesData: jsonb("proposal_packages_data").$type<PackageSnapshot[]>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Service templates - reusable services (production rate blocks or line items)
// that can be inserted into proposals from the Builder
export const serviceTemplates = pgTable("service_templates", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(), // 'production_rate' | 'line_item'
  // For 'production_rate' type, productionRateBlock holds the saved block
  productionRateBlock: jsonb("production_rate_block").$type<ProductionRateBlock>(),
  // For 'line_item' type, lineItem holds the saved item
  lineItem: jsonb("line_item").$type<{ name?: string; description: string; quantity: number; unitPrice: number; total: number }>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertServiceTemplateSchema = createInsertSchema(serviceTemplates).omit({ id: true, userId: true, createdAt: true, updatedAt: true });
export type ServiceTemplate = typeof serviceTemplates.$inferSelect;
export type InsertServiceTemplate = z.infer<typeof insertServiceTemplateSchema>;

// Message templates - reusable SMS/email templates with variable tags
export const messageTemplates = pgTable("message_templates", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  slug: text("slug").notNull(),
  category: text("category").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull().default(''),
  emailSubject: text("email_subject").default(''),
  emailContent: text("email_content").default(''),
  isEnabled: boolean("is_enabled").default(true),
  // For automated follow-up templates: minutes after the trigger (lead created,
  // doc sent, etc.) to send this message. NULL = use the system default for
  // this slug. 0 = send immediately. Editable per-user from the template UI.
  delayMinutes: integer("delay_minutes"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Booking forms - multiple customizable booking links per user
export const bookingForms = pgTable("booking_forms", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  slug: text("slug").unique(),
  bookingToken: text("booking_token").unique().notNull(),
  fields: jsonb("fields").$type<BookingFieldConfig[]>(),
  thankYouUrl: text("thank_you_url"),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Booking requests from public form
export const bookingRequests = pgTable("booking_requests", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  bookingFormId: integer("booking_form_id"),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zipCode: text("zip_code"),
  requestedDate: text("requested_date"),
  requestedTime: text("requested_time"),
  alternateDate: text("alternate_date"),
  alternateTime: text("alternate_time"),
  projectDescription: text("project_description"),
  uploadedFiles: jsonb("uploaded_files").$type<string[]>(),
  status: text("status").notNull().default('new'),
  contactId: integer("contact_id"),
  projectId: integer("project_id"),
  landingPage: text("landing_page"),
  formPage: text("form_page"),
  referrer: text("referrer"),
  utmSource: text("utm_source"),
  utmMedium: text("utm_medium"),
  utmCampaign: text("utm_campaign"),
  sourceChannel: text("source_channel"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Jobs for scheduled work
export const jobs = pgTable("jobs", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(), // Owner of this job
  contactId: integer("contact_id").notNull(), // Client for this job
  documentId: integer("document_id"), // Optional: linked proposal/estimate
  title: text("title").notNull(),
  jobAddress: text("job_address"),
  jobCity: text("job_city"),
  jobState: text("job_state"),
  jobZipCode: text("job_zip_code"),
  scheduledDate: text("scheduled_date"), // Start date of job (YYYY-MM-DD)
  scheduledTime: text("scheduled_time"), // Start time of job (HH:MM)
  endDate: text("end_date"), // End date of job (YYYY-MM-DD)
  endTime: text("end_time"), // End time of job (HH:MM)
  stage: text("stage").notNull().default('scheduled'), // 'scheduled', 'in_progress', 'completed'
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Appointments for contacts
export const appointments = pgTable("appointments", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  contactId: integer("contact_id").notNull(),
  type: text("type").notNull(),
  date: text("date").notNull(),
  time: text("time"),
  notes: text("notes"),
  status: text("status").notNull().default('scheduled'),
  googleEventId: text("google_event_id"),
  assignedToId: integer("assigned_to_id"),
  bookingRequestId: integer("booking_request_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const appointmentSessions = pgTable("appointment_sessions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  appointmentId: integer("appointment_id").notNull(),
  salespersonId: integer("salesperson_id"),
  arrivalDetectedAt: timestamp("arrival_detected_at"),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time"),
  duration: integer("duration"),
  result: text("result"),
  status: text("status").notNull().default('active'),
  createdAt: timestamp("created_at").defaultNow(),
});

export const documentRecipients = pgTable("document_recipients", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull(),
  contactId: integer("contact_id"),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  role: text("role").notNull().default('additional'),
  createdAt: timestamp("created_at").defaultNow(),
});

// === RELATIONS ===

export const contactsRelations = relations(contacts, ({ many }) => ({
  documents: many(documents),
  communications: many(communications),
  appointments: many(appointments),
  jobs: many(jobs),
  projects: many(projects),
}));

export const appointmentsRelations = relations(appointments, ({ one }) => ({
  contact: one(contacts, {
    fields: [appointments.contactId],
    references: [contacts.id],
  }),
}));

export const jobsRelations = relations(jobs, ({ one }) => ({
  contact: one(contacts, {
    fields: [jobs.contactId],
    references: [contacts.id],
  }),
  document: one(documents, {
    fields: [jobs.documentId],
    references: [documents.id],
  }),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  contact: one(contacts, {
    fields: [documents.contactId],
    references: [contacts.id],
  }),
  views: many(documentViews),
  payments: many(payments),
  recipients: many(documentRecipients),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  document: one(documents, {
    fields: [payments.documentId],
    references: [documents.id],
  }),
}));

export const documentViewsRelations = relations(documentViews, ({ one }) => ({
  document: one(documents, {
    fields: [documentViews.documentId],
    references: [documents.id],
  }),
}));

export const communicationsRelations = relations(communications, ({ one }) => ({
  contact: one(contacts, {
    fields: [communications.contactId],
    references: [contacts.id],
  }),
}));

export const documentRecipientsRelations = relations(documentRecipients, ({ one }) => ({
  document: one(documents, {
    fields: [documentRecipients.documentId],
    references: [documents.id],
  }),
  contact: one(contacts, {
    fields: [documentRecipients.contactId],
    references: [contacts.id],
  }),
}));

// Projects - the main container that wraps leads through completion
export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  projectNumber: integer("project_number").notNull(),
  contactId: integer("contact_id").notNull(),
  title: text("title").notNull(),
  stage: text("stage").notNull().default('new_lead'),
  source: text("source"),
  description: text("description"),
  totalAmount: integer("total_amount"),
  scheduledDate: text("scheduled_date"),
  scheduledTime: text("scheduled_time"),
  scheduledEndDate: text("scheduled_end_date"),
  scheduledEndTime: text("scheduled_end_time"),
  jobAddress: text("job_address"),
  jobCity: text("job_city"),
  jobState: text("job_state"),
  jobZipCode: text("job_zip_code"),
  archived: boolean("archived").notNull().default(false),
  automationPausedReason: text("automation_paused_reason"),
  automationPausedAt: timestamp("automation_paused_at"),
  automationPausedCategory: text("automation_paused_category"),
  automationPausedStep: text("automation_paused_step"),
  automationPausedDocumentId: integer("automation_paused_document_id"),
  reminderAt: timestamp("reminder_at"),
  reminderType: text("reminder_type"),
  reminderNote: text("reminder_note"),
  leadQuality: text("lead_quality"),
  lostReason: text("lost_reason"),
  lostAt: timestamp("lost_at"),
  sentimentScore: integer("sentiment_score"),
  sentimentLabel: text("sentiment_label"),
  sentimentUpdatedAt: timestamp("sentiment_updated_at"),
  coiFilePath: text("coi_file_path"),
  costingSnapshot: jsonb("costing_snapshot"),
  lockedOverheadPerHour: integer("locked_overhead_per_hour"),
  manualLaborCostCents: integer("manual_labor_cost_cents"),
  stageChangedAt: timestamp("stage_changed_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Project activities - notes center (manual notes + auto-logged events)
export const projectActivities = pgTable("project_activities", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  userId: varchar("user_id").notNull(),
  type: text("type").notNull(),
  content: text("content").notNull(),
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const projectRecipients = pgTable("project_recipients", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  contactId: integer("contact_id"),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zipCode: text("zip_code"),
  role: text("role"),
  createdAt: timestamp("created_at").defaultNow(),
  removedAt: timestamp("removed_at"),
});

export const projectsRelations = relations(projects, ({ one, many }) => ({
  contact: one(contacts, {
    fields: [projects.contactId],
    references: [contacts.id],
  }),
  activities: many(projectActivities),
  recipients: many(projectRecipients),
}));

export const projectRecipientsRelations = relations(projectRecipients, ({ one }) => ({
  project: one(projects, {
    fields: [projectRecipients.projectId],
    references: [projects.id],
  }),
  contact: one(contacts, {
    fields: [projectRecipients.contactId],
    references: [contacts.id],
  }),
}));

export const projectActivitiesRelations = relations(projectActivities, ({ one }) => ({
  project: one(projects, {
    fields: [projectActivities.projectId],
    references: [projects.id],
  }),
}));

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Native device tokens for push notifications (iOS/Android via FCM)
export const deviceTokens = pgTable("device_tokens", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  token: text("token").notNull().unique(),
  platform: varchar("platform").notNull(),
  environment: varchar("environment").default("production"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type DeviceToken = typeof deviceTokens.$inferSelect;

// Team members - crew, leads, sales people
export const teamMembers = pgTable("team_members", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull(), // 'crew', 'lead', 'sales', or custom
  employeeType: text("employee_type").default("production"), // 'production' or 'not_production'
  phone: text("phone"),
  email: text("email"),
  hourlyRate: integer("hourly_rate"), // in cents
  pin: text("pin"), // simple PIN for clock in/out
  isActive: boolean("is_active").default(true),
  activeForPricing: boolean("active_for_pricing").default(true),
  payrollBurdenPercentage: doublePrecision("payroll_burden_percentage").default(0.12),
  workersCompPercentage: doublePrecision("workers_comp_percentage").default(0.18),
  benefitsPerHour: doublePrecision("benefits_per_hour").default(0),
  linkedUserId: varchar("linked_user_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Crew groups - named groups of team members for quick project assignment
export const crewGroups = pgTable("crew_groups", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Crew group members - which team members belong to which group
export const crewGroupMembers = pgTable("crew_group_members", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull(),
  teamMemberId: integer("team_member_id").notNull(),
  userId: varchar("user_id").notNull(),
});

// Project expenses - materials/spendings tracking for job costing
export const projectExpenses = pgTable("project_expenses", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  userId: varchar("user_id").notNull(),
  title: text("title").notNull(),
  category: text("category"),
  vendor: text("vendor"),
  description: text("description"),
  amount: integer("amount").notNull(), // in cents
  receiptDate: timestamp("receipt_date"),
  receiptImageUrl: text("receipt_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Manual labor entries - per-day labor cost ledger for Core-tier "Lite Job P&L"
export const manualLaborEntries = pgTable("manual_labor_entries", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  userId: varchar("user_id").notNull(),
  workDate: text("work_date").notNull(),
  amountCents: integer("amount_cents").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertManualLaborEntrySchema = createInsertSchema(manualLaborEntries).omit({
  id: true,
  userId: true,
  projectId: true,
  createdAt: true,
});
export type InsertManualLaborEntry = z.infer<typeof insertManualLaborEntrySchema>;
export type ManualLaborEntry = typeof manualLaborEntries.$inferSelect;

// Project expense photos - receipt/purchase images
export const projectExpensePhotos = pgTable("project_expense_photos", {
  id: serial("id").primaryKey(),
  expenseId: integer("expense_id").notNull(),
  userId: varchar("user_id").notNull(),
  fileName: text("file_name").notNull(),
  storageKey: text("storage_key").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// Project crew assignments - which crew members are assigned to a project
export const projectCrewAssignments = pgTable("project_crew_assignments", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  teamMemberId: integer("team_member_id").notNull(),
  userId: varchar("user_id").notNull(),
  assignedAt: timestamp("assigned_at").defaultNow(),
});

// Job schedule dates - specific work days for a project
export const jobScheduleDates = pgTable("job_schedule_dates", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  userId: varchar("user_id").notNull(),
  date: text("date").notNull(),
  startTime: text("start_time"),
  endTime: text("end_time"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Time entries - crew clock in/out records
// teamMemberId is nullable to support ad-hoc one-time workers logged manually
// (Elite tier). When teamMemberId is null, adHocWorkerName + lockedHourlyRate +
// lockedPayrollBurden + lockedWorkersComp + lockedBenefitsPerHour describe the
// worker entirely. When teamMemberId is set, the locked_* fields snapshot the
// member's rates at entry creation so future rate changes don't retroactively
// alter historical job-costing.
export const timeEntries = pgTable("time_entries", {
  id: serial("id").primaryKey(),
  teamMemberId: integer("team_member_id"),
  adHocWorkerName: text("ad_hoc_worker_name"),
  projectId: integer("project_id"),
  userId: varchar("user_id").notNull(),
  clockIn: timestamp("clock_in").notNull(),
  clockOut: timestamp("clock_out"),
  totalMinutes: integer("total_minutes"),
  notes: text("notes"),
  clockInLat: varchar("clock_in_lat", { length: 20 }),
  clockInLng: varchar("clock_in_lng", { length: 20 }),
  clockOutLat: varchar("clock_out_lat", { length: 20 }),
  clockOutLng: varchar("clock_out_lng", { length: 20 }),
  lockedHourlyRate: integer("locked_hourly_rate"),
  lockedPayrollBurden: text("locked_payroll_burden"),
  lockedWorkersComp: text("locked_workers_comp"),
  lockedBenefitsPerHour: text("locked_benefits_per_hour"),
  editedAt: timestamp("edited_at"),
  editedBy: varchar("edited_by"),
  editReason: text("edit_reason"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Document photos - images attached to documents with annotation support
export const documentPhotos = pgTable("document_photos", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id"),
  projectId: integer("project_id"),
  userId: varchar("user_id").notNull(),
  fileName: text("file_name").notNull(),
  storageKey: text("storage_key").notNull(),
  caption: text("caption"),
  annotations: jsonb("annotations").$type<PhotoAnnotation[]>(),
  annotatedStorageKey: text("annotated_storage_key"),
  sortOrder: integer("sort_order").notNull().default(0),
  source: text("source"),
  createdAt: timestamp("created_at").defaultNow(),
});

export interface PhotoAnnotation {
  type: 'arrow' | 'circle' | 'rectangle' | 'text' | 'freehand';
  x: number;
  y: number;
  endX?: number;
  endY?: number;
  radius?: number;
  width?: number;
  height?: number;
  text?: string;
  color: string;
  strokeWidth: number;
  points?: Array<{ x: number; y: number }>;
}

// Scheduled automations - automated messages queued for sending
export const scheduledAutomations = pgTable("scheduled_automations", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  contactId: integer("contact_id").notNull(),
  projectId: integer("project_id"),
  documentId: integer("document_id"),
  templateSlug: text("template_slug").notNull(),
  category: text("category").notNull(),
  channel: text("channel").notNull().default('both'),
  status: text("status").notNull().default('pending'),
  scheduledFor: timestamp("scheduled_for").notNull(),
  sentAt: timestamp("sent_at"),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertScheduledAutomationSchema = createInsertSchema(scheduledAutomations).omit({ id: true, sentAt: true, error: true, createdAt: true });

// Campaigns - bulk SMS/email outreach
export const campaigns = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  channel: text("channel").notNull().default('email'),
  segment: text("segment").notNull().default('all_contacts'),
  specificContactIds: integer("specific_contact_ids").array(),
  subject: text("subject"),
  body: text("body").notNull(),
  ctaText: text("cta_text"),
  ctaUrl: text("cta_url"),
  status: text("status").notNull().default('draft'),
  dailySmsLimit: integer("daily_sms_limit").default(20),
  dailyEmailLimit: integer("daily_email_limit").default(50),
  totalRecipients: integer("total_recipients").default(0),
  sentCount: integer("sent_count").default(0),
  failedCount: integer("failed_count").default(0),
  scheduledAt: timestamp("scheduled_at"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const campaignMessages = pgTable("campaign_messages", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull(),
  contactId: integer("contact_id").notNull(),
  channel: text("channel").notNull(),
  to: text("to").notNull(),
  status: text("status").notNull().default('pending'),
  sentAt: timestamp("sent_at"),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCampaignSchema = createInsertSchema(campaigns).omit({ id: true, userId: true, sentCount: true, failedCount: true, totalRecipients: true, startedAt: true, completedAt: true, createdAt: true, updatedAt: true });
export const insertCampaignMessageSchema = createInsertSchema(campaignMessages).omit({ id: true, sentAt: true, error: true, createdAt: true });

// === BASE SCHEMAS ===
// Note: userId is omitted from insert schemas - it's added server-side from authenticated user

export const insertContactSchema = createInsertSchema(contacts).omit({ id: true, userId: true, createdAt: true, updatedAt: true });
export const insertDocumentSchema = createInsertSchema(documents).omit({ id: true, userId: true, publicToken: true, documentNumber: true, createdAt: true, updatedAt: true, firstViewedAt: true, lastViewedAt: true, viewCount: true });
export const insertDocumentViewSchema = createInsertSchema(documentViews).omit({ id: true, viewedAt: true });
export const insertCommunicationSchema = createInsertSchema(communications).omit({ id: true, userId: true, timestamp: true });
export const insertCompanySettingsSchema = createInsertSchema(companySettings).omit({ id: true, userId: true, updatedAt: true });
export const insertPaymentSchema = createInsertSchema(payments).omit({ id: true, userId: true, createdAt: true });
export const insertTemplateSchema = createInsertSchema(templates).omit({ id: true, userId: true, updatedAt: true });
export const insertProposalTemplateSchema = createInsertSchema(proposalTemplates).omit({ id: true, userId: true, createdAt: true, updatedAt: true });
export const insertMessageTemplateSchema = createInsertSchema(messageTemplates).omit({ id: true, userId: true, updatedAt: true });
export const insertBookingFormSchema = createInsertSchema(bookingForms).omit({ id: true, userId: true, createdAt: true, updatedAt: true });
export const insertBookingRequestSchema = createInsertSchema(bookingRequests).omit({ id: true, userId: true, createdAt: true, status: true, contactId: true });
export const insertAppointmentSchema = createInsertSchema(appointments).omit({ id: true, userId: true, createdAt: true });
export const insertAppointmentSessionSchema = createInsertSchema(appointmentSessions).omit({ id: true, userId: true, createdAt: true });
export const insertJobSchema = createInsertSchema(jobs).omit({ id: true, userId: true, createdAt: true });

export const insertProjectSchema = createInsertSchema(projects).omit({ id: true, userId: true, projectNumber: true, createdAt: true, updatedAt: true });
export const insertProjectActivitySchema = createInsertSchema(projectActivities).omit({ id: true, userId: true, createdAt: true });
export const insertProjectRecipientSchema = createInsertSchema(projectRecipients).omit({ id: true, createdAt: true });
export const insertTeamMemberSchema = createInsertSchema(teamMembers).omit({ id: true, userId: true, createdAt: true });
export const insertDocumentPhotoSchema = createInsertSchema(documentPhotos).omit({ id: true, userId: true, createdAt: true });
export const insertDocumentRecipientSchema = createInsertSchema(documentRecipients).omit({ id: true, createdAt: true });
export const insertPromoCodeSchema = createInsertSchema(promoCodes).omit({ id: true, currentUses: true, createdAt: true });
export const insertProjectExpenseSchema = createInsertSchema(projectExpenses).omit({ id: true, userId: true, createdAt: true });
export const insertProjectExpensePhotoSchema = createInsertSchema(projectExpensePhotos).omit({ id: true, userId: true, createdAt: true });
export const insertProjectCrewAssignmentSchema = createInsertSchema(projectCrewAssignments).omit({ id: true, userId: true, assignedAt: true });
export const insertJobScheduleDateSchema = createInsertSchema(jobScheduleDates).omit({ id: true, userId: true, createdAt: true });
export const insertTimeEntrySchema = createInsertSchema(timeEntries).omit({ id: true, userId: true, createdAt: true });

// === EXPLICIT API CONTRACT TYPES ===

export type Contact = typeof contacts.$inferSelect;
export type InsertContact = z.infer<typeof insertContactSchema>;
export type Document = typeof documents.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type DocumentView = typeof documentViews.$inferSelect;
export type InsertDocumentView = z.infer<typeof insertDocumentViewSchema>;
export type Communication = typeof communications.$inferSelect;
export type InsertCommunication = z.infer<typeof insertCommunicationSchema>;
export type CompanySettings = typeof companySettings.$inferSelect;
export type InsertCompanySettings = z.infer<typeof insertCompanySettingsSchema>;
export type Payment = typeof payments.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Template = typeof templates.$inferSelect;
export type InsertTemplate = z.infer<typeof insertTemplateSchema>;
export type ProposalTemplate = typeof proposalTemplates.$inferSelect;
export type InsertProposalTemplate = z.infer<typeof insertProposalTemplateSchema>;
export type MessageTemplate = typeof messageTemplates.$inferSelect;
export type InsertMessageTemplate = z.infer<typeof insertMessageTemplateSchema>;
export type BookingForm = typeof bookingForms.$inferSelect;
export type InsertBookingForm = z.infer<typeof insertBookingFormSchema>;
export type BookingRequest = typeof bookingRequests.$inferSelect;
export type InsertBookingRequest = z.infer<typeof insertBookingRequestSchema>;
export type Appointment = typeof appointments.$inferSelect;
export type InsertAppointment = z.infer<typeof insertAppointmentSchema>;
export type AppointmentSession = typeof appointmentSessions.$inferSelect;
export type InsertAppointmentSession = z.infer<typeof insertAppointmentSessionSchema>;
export type Job = typeof jobs.$inferSelect;
export type InsertJob = z.infer<typeof insertJobSchema>;
export type JobWithContact = Job & { contact: Contact };
export type JobWithDetails = Job & { contact: Contact; document?: Document | null };

export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type ProjectActivity = typeof projectActivities.$inferSelect;
export type InsertProjectActivity = z.infer<typeof insertProjectActivitySchema>;
export type ProjectRecipient = typeof projectRecipients.$inferSelect;
export type InsertProjectRecipient = z.infer<typeof insertProjectRecipientSchema>;
export type ProjectWithContact = Project & { contact: Contact };
export type ProjectWithDetails = Project & { contact: Contact; activities?: ProjectActivity[] };

export type TeamMember = typeof teamMembers.$inferSelect;
export type InsertTeamMember = z.infer<typeof insertTeamMemberSchema>;
export type CrewGroup = typeof crewGroups.$inferSelect;
export type CrewGroupMember = typeof crewGroupMembers.$inferSelect;
export type DocumentRecipient = typeof documentRecipients.$inferSelect;
export type InsertDocumentRecipient = z.infer<typeof insertDocumentRecipientSchema>;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type PromoCode = typeof promoCodes.$inferSelect;
export type InsertPromoCode = z.infer<typeof insertPromoCodeSchema>;

export type DocumentPhoto = typeof documentPhotos.$inferSelect;
export type InsertDocumentPhoto = z.infer<typeof insertDocumentPhotoSchema>;

export type ProjectExpense = typeof projectExpenses.$inferSelect;
export type InsertProjectExpense = z.infer<typeof insertProjectExpenseSchema>;
export type ProjectExpensePhoto = typeof projectExpensePhotos.$inferSelect;
export type InsertProjectExpensePhoto = z.infer<typeof insertProjectExpensePhotoSchema>;
export type ProjectCrewAssignment = typeof projectCrewAssignments.$inferSelect;
export type InsertProjectCrewAssignment = z.infer<typeof insertProjectCrewAssignmentSchema>;
export type JobScheduleDate = typeof jobScheduleDates.$inferSelect;
export type InsertJobScheduleDate = z.infer<typeof insertJobScheduleDateSchema>;
export type TimeEntry = typeof timeEntries.$inferSelect;
export type InsertTimeEntry = z.infer<typeof insertTimeEntrySchema>;

export type ProjectExpenseWithPhotos = ProjectExpense & { photos: ProjectExpensePhoto[] };
export type CrewAssignmentWithMember = ProjectCrewAssignment & { teamMember: TeamMember };
export type TimeEntryWithMember = TimeEntry & { teamMember: TeamMember | null };

export type ScheduledAutomation = typeof scheduledAutomations.$inferSelect;
export type InsertScheduledAutomation = z.infer<typeof insertScheduledAutomationSchema>;
export type Campaign = typeof campaigns.$inferSelect;
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
export type CampaignMessage = typeof campaignMessages.$inferSelect;
export type InsertCampaignMessage = z.infer<typeof insertCampaignMessageSchema>;

export const onboardingBookings = pgTable("onboarding_bookings", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  preferredDate: timestamp("preferred_date").notNull(),
  confirmedTime: text("confirmed_time"),
  status: text("status").notNull().default('pending'),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const supportMessages = pgTable("support_messages", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  senderType: text("sender_type").notNull().default('user'),
  message: text("message").notNull(),
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertOnboardingBookingSchema = createInsertSchema(onboardingBookings).omit({ id: true, createdAt: true, status: true, confirmedTime: true });
export type OnboardingBooking = typeof onboardingBookings.$inferSelect;
export type InsertOnboardingBooking = z.infer<typeof insertOnboardingBookingSchema>;

export const insertSupportMessageSchema = createInsertSchema(supportMessages).omit({ id: true, createdAt: true, isRead: true });
export type SupportMessage = typeof supportMessages.$inferSelect;
export type InsertSupportMessage = z.infer<typeof insertSupportMessageSchema>;

export const scheduledMessages = pgTable("scheduled_messages", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  contactId: integer("contact_id"),
  phoneNumber: varchar("phone_number"),
  body: text("body"),
  mediaUrl: varchar("media_url"),
  scheduledAt: timestamp("scheduled_at").notNull(),
  status: varchar("status").notNull().default('pending'),
  createdAt: timestamp("created_at").defaultNow(),
  sentAt: timestamp("sent_at"),
  error: text("error"),
  emailTo: varchar("email_to"),
  emailSubject: varchar("email_subject"),
  emailBody: text("email_body"),
  emailFromName: varchar("email_from_name"),
  emailCtaText: varchar("email_cta_text"),
  emailCtaUrl: varchar("email_cta_url"),
});

export const insertScheduledMessageSchema = createInsertSchema(scheduledMessages).omit({ id: true, createdAt: true, sentAt: true, error: true });
export type ScheduledMessage = typeof scheduledMessages.$inferSelect;
export type InsertScheduledMessage = z.infer<typeof insertScheduledMessageSchema>;

// === FINANCIAL SETTINGS ===

export const financialSettings = pgTable("financial_settings", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  sellRatePerHour: doublePrecision("sell_rate_per_hour").default(0),
  defaultSetupHoursPerRoom: doublePrecision("default_setup_hours_per_room").default(1.0),
  defaultDoorWidthFt: doublePrecision("default_door_width_ft").default(3),
  defaultDoorHeightFt: doublePrecision("default_door_height_ft").default(7),
  defaultWindowWidthFt: doublePrecision("default_window_width_ft").default(3),
  defaultWindowHeightFt: doublePrecision("default_window_height_ft").default(4),
  payrollBurdenPercentage: doublePrecision("payroll_burden_percentage").default(0.12),
  workersCompPercentage: doublePrecision("workers_comp_percentage").default(0.18),
  benefitsPerHour: doublePrecision("benefits_per_hour").default(0),
  useProductionTeamForLaborCost: boolean("use_production_team_for_labor_cost").default(true),
  manualLaborCostPerHour: doublePrecision("manual_labor_cost_per_hour").default(0),
  targetGrossMarginPercentage: doublePrecision("target_gross_margin_percentage").default(0.50),
  targetGrossProfitPerHour: doublePrecision("target_gross_profit_per_hour").default(0),
  targetNetProfitPercentage: doublePrecision("target_net_profit_percentage").default(0.2),
  defaultShowLaborHrs: boolean("default_show_labor_hrs").default(true),
  defaultShowLaborPrice: boolean("default_show_labor_price").default(true),
  defaultShowMaterialQty: boolean("default_show_material_qty").default(true),
  defaultShowMaterialPrice: boolean("default_show_material_price").default(true),
  defaultShowSurfaceDetails: boolean("default_show_surface_details").default(true),
  defaultSameColorAllAreas: boolean("default_same_color_all_areas").default(true),
  defaultsPopulated: boolean("defaults_populated").default(false),
  aiNegotiationFloor: doublePrecision("ai_negotiation_floor").default(0.30),
  serviceSectionTypes: jsonb("service_section_types").$type<Record<string, 'room' | 'exterior' | 'area' | 'cabinets'>>().default({}),
  customCategoriesByService: jsonb("custom_categories_by_service").$type<Record<string, string[]>>().default({}),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const employeeOverheadCosts = pgTable("employee_overhead_costs", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  teamMemberId: integer("team_member_id").notNull(),
  monthlyCost: doublePrecision("monthly_cost").notNull().default(0),
  frequency: varchar("frequency").notNull().default('monthly'),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const overheadExpenses = pgTable("overhead_expenses", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  expenseName: text("expense_name").notNull(),
  category: varchar("category").notNull().default('other'),
  amount: doublePrecision("amount").notNull().default(0),
  frequency: varchar("frequency").notNull().default('monthly'),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertFinancialSettingsSchema = createInsertSchema(financialSettings).omit({ id: true, userId: true, updatedAt: true });
export type FinancialSettings = typeof financialSettings.$inferSelect;
export type InsertFinancialSettings = z.infer<typeof insertFinancialSettingsSchema>;

export const insertOverheadExpenseSchema = createInsertSchema(overheadExpenses).omit({ id: true, userId: true, createdAt: true });
export type OverheadExpense = typeof overheadExpenses.$inferSelect;
export type InsertOverheadExpense = z.infer<typeof insertOverheadExpenseSchema>;

export const insertEmployeeOverheadCostSchema = createInsertSchema(employeeOverheadCosts).omit({ id: true, userId: true, updatedAt: true });
export type EmployeeOverheadCost = typeof employeeOverheadCosts.$inferSelect;
export type InsertEmployeeOverheadCost = z.infer<typeof insertEmployeeOverheadCostSchema>;

// === MATERIALS ===

export const materials = pgTable("materials", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  materialName: text("material_name").notNull(),
  brand: text("brand").notNull().default("Generic"),
  type: varchar("type").notNull().default("paint"),
  finish: text("finish"),
  coverageSqftPerGallon: doublePrecision("coverage_sqft_per_gallon"),
  costPerUnit: doublePrecision("cost_per_unit").notNull().default(0),
  markupPercentage: doublePrecision("markup_percentage").notNull().default(0),
  wastePercentage: doublePrecision("waste_percentage").notNull().default(0.10),
  active: boolean("active").notNull().default(true),
  defaultsPopulated: boolean("defaults_populated").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMaterialSchema = createInsertSchema(materials).omit({ id: true, userId: true, createdAt: true });
export type Material = typeof materials.$inferSelect;
export type InsertMaterial = z.infer<typeof insertMaterialSchema>;

// === SURFACES ===

export const surfaces = pgTable("surfaces", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  surfaceName: text("surface_name").notNull(),
  surfaceKey: varchar("surface_key").notNull(),
  unit: varchar("unit").notNull().default("sqft"),
  productionRateUnitsPerLaborHour: doublePrecision("production_rate_units_per_labor_hour").notNull().default(0),
  defaultCoats: integer("default_coats").notNull().default(1),
  defaultMaterialId: integer("default_material_id"),
  defaultPrimerCoats: integer("default_primer_coats").notNull().default(0),
  defaultPrimerMaterialId: integer("default_primer_material_id"),
  estimateType: varchar("estimate_type").notNull().default("Residential Interior"),
  rateCategory: varchar("rate_category"),
  areaDescription: text("area_description"),
  surfaceDescription: text("surface_description"),
  crewNote: text("crew_note"),
  coatRates: jsonb("coat_rates").$type<{ rate: number; materialId: number | null }[]>(),
  primerRates: jsonb("primer_rates").$type<{ rate: number; materialId: number | null }[]>(),
  sqftPerUnit: doublePrecision("sqft_per_unit"),
  pricingMode: varchar("pricing_mode").default("production_rate"),
  pricePerUnit: doublePrecision("price_per_unit"),
  coatsLabel: varchar("coats_label"),
  usePrimer: boolean("use_primer").notNull().default(true),
  usePaint: boolean("use_paint").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSurfaceSchema = createInsertSchema(surfaces).omit({ id: true, userId: true, createdAt: true });
export type Surface = typeof surfaces.$inferSelect;
export type InsertSurface = z.infer<typeof insertSurfaceSchema>;

// === PRODUCTION CALCULATORS ===

export const productionCalculators = pgTable("production_calculators", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  surfaceId: integer("surface_id"),
  materialId: integer("material_id"),
  teamMemberId: integer("team_member_id"),
  painters: jsonb("painters").$type<{ name: string; sqftPerHour?: number; areaPainted?: number; timeTaken?: number }[]>().notNull().default([]),
  averageRate: doublePrecision("average_rate").notNull().default(0),
  useAsProductionRate: boolean("use_as_production_rate").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProductionCalculatorSchema = createInsertSchema(productionCalculators).omit({ id: true, userId: true, createdAt: true });
export type ProductionCalculator = typeof productionCalculators.$inferSelect;
export type InsertProductionCalculator = z.infer<typeof insertProductionCalculatorSchema>;

// === AI MESSAGE DRAFTS ===

export const aiMessageDrafts = pgTable("ai_message_drafts", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  contactId: integer("contact_id"),
  projectId: integer("project_id"),
  phoneNumber: text("phone_number"),
  inboundMessageId: integer("inbound_message_id"),
  suggestedText: text("suggested_text").notNull(),
  contextSnapshot: jsonb("context_snapshot").$type<AiDraftContext>(),
  status: text("status").notNull().default('pending'),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export interface AiDraftContext {
  projectStage?: string;
  projectTitle?: string;
  projectPnL?: { revenue: number; laborCost: number; materialCost: number; grossProfit: number; grossMargin: number };
  contactName?: string;
  recentMessages?: Array<{ direction: string; content: string; timestamp?: string }>;
  companyName?: string;
  targetMargin?: number;
  negotiationFloor?: number;
}

export const insertAiMessageDraftSchema = createInsertSchema(aiMessageDrafts).omit({ id: true, createdAt: true, updatedAt: true });
export type AiMessageDraft = typeof aiMessageDrafts.$inferSelect;
export type InsertAiMessageDraft = z.infer<typeof insertAiMessageDraftSchema>;

export const aiActions = pgTable("ai_actions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  projectId: integer("project_id"),
  contactId: integer("contact_id"),
  type: text("type").notNull(),
  summary: text("summary").notNull(),
  details: jsonb("details").$type<Record<string, any>>(),
  status: text("status").notNull().default('pending'),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAiActionSchema = createInsertSchema(aiActions).omit({ id: true, createdAt: true });
export type AiAction = typeof aiActions.$inferSelect;
export type InsertAiAction = z.infer<typeof insertAiActionSchema>;

// === MARKETING LEADS ===

export const marketingLeads = pgTable("marketing_leads", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  name: text("name"),
  source: text("source").notNull().default('calculator'),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMarketingLeadSchema = createInsertSchema(marketingLeads).omit({ id: true, createdAt: true });
export type MarketingLead = typeof marketingLeads.$inferSelect;
export type InsertMarketingLead = z.infer<typeof insertMarketingLeadSchema>;

// === COLOR SUBMISSIONS ===

export interface ColorSubmissionEntry {
  paintGroupKey: string;
  groupLabel: string;
  colorName: string;
  colorCode?: string;
  hexColor?: string;
  finish: string;
  brand?: string;
  paintColorId?: number;
  roomName?: string;
  surfaceKey?: string;
}

export const colorSubmissions = pgTable("color_submissions", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id"),
  projectId: integer("project_id"),
  userId: varchar("user_id").notNull(),
  entries: jsonb("entries").notNull().$type<ColorSubmissionEntry[]>(),
  status: text("status").notNull().default('pending'),
  reviewNote: text("review_note"),
  reviewedAt: timestamp("reviewed_at"),
  contractorApproved: boolean("contractor_approved").default(false),
  contractorApprovedAt: timestamp("contractor_approved_at"),
  customerApproved: boolean("customer_approved").default(false),
  customerApprovedAt: timestamp("customer_approved_at"),
  customerNote: text("customer_note"),
  deadline: timestamp("deadline"),
  customerToken: varchar("customer_token"),
  customerSignature: text("customer_signature"),
  customerSignedAt: timestamp("customer_signed_at"),
  selectedAreas: jsonb("selected_areas").$type<string[]>(),
  manualRooms: jsonb("manual_rooms").$type<Array<{ id: string; name: string; surfaces: Array<{ key: string; label: string }> }>>(),
  hiddenProdSurfaces: jsonb("hidden_prod_surfaces").$type<string[]>(),
  activityLog: jsonb("activity_log").$type<Array<{ action: string; timestamp: string; actor?: string; note?: string }>>(),
  sectionNotes: jsonb("section_notes").$type<Record<string, string>>(),
  submittedAt: timestamp("submitted_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertColorSubmissionSchema = createInsertSchema(colorSubmissions).omit({ id: true, createdAt: true, reviewedAt: true });
export type ColorSubmission = typeof colorSubmissions.$inferSelect;
export type InsertColorSubmission = z.infer<typeof insertColorSubmissionSchema>;

// === PAINT ORDERS ===

export interface PaintOrderItem {
  colorName: string;
  colorCode?: string;
  brand?: string;
  hexColor?: string;
  finish?: string;
  roomName?: string;
  surfaceLabel?: string;
  containers: Array<{ size: 'five_gallon' | 'one_gallon' | 'quart'; quantity: number }>;
}

export const paintOrders = pgTable("paint_orders", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  userId: varchar("user_id").notNull(),
  supplierId: integer("supplier_id"),
  items: jsonb("items").notNull().$type<PaintOrderItem[]>(),
  status: text("status").notNull().default('draft'),
  sentAt: timestamp("sent_at"),
  sentVia: text("sent_via"),
  sentTo: text("sent_to"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPaintOrderSchema = createInsertSchema(paintOrders).omit({ id: true, createdAt: true, updatedAt: true });
export type PaintOrder = typeof paintOrders.$inferSelect;
export type InsertPaintOrder = z.infer<typeof insertPaintOrderSchema>;

// === SUPPLIERS ===

export const suppliers = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSupplierSchema = createInsertSchema(suppliers).omit({ id: true, createdAt: true, updatedAt: true });
export type Supplier = typeof suppliers.$inferSelect;
export type InsertSupplier = z.infer<typeof insertSupplierSchema>;

// === PERSISTENT NOTIFICATIONS ===

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  documentId: integer("document_id"),
  projectId: integer("project_id"),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  link: text("link"),
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  dedupKey: varchar("dedup_key"),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  dedupKeyUnique: uniqueIndex("notifications_dedup_key_unique").on(t.dedupKey),
}));

export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true, readAt: true });
export type AppNotification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;

// === APPOINTMENT REMINDERS ===

export const appointmentReminders = pgTable("appointment_reminders", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  appointmentId: integer("appointment_id").notNull(),
  minutesBefore: integer("minutes_before").notNull(),
  fireAt: timestamp("fire_at").notNull(),
  fired: boolean("fired").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAppointmentReminderSchema = createInsertSchema(appointmentReminders).omit({ id: true, createdAt: true });
export type AppointmentReminder = typeof appointmentReminders.$inferSelect;
export type InsertAppointmentReminder = z.infer<typeof insertAppointmentReminderSchema>;

// === GAMEPLAN MODULE (Admin-only SEO/Content Automation) ===

export const gamePlanSettings = pgTable("game_plan_settings", {
  id: serial("id").primaryKey(),
  wpBaseUrl: text("wp_base_url"),
  wpUsername: text("wp_username"),
  wpAppPassword: text("wp_app_password"),
  wpHomepageId: integer("wp_homepage_id"),
  wpLocationsParentId: integer("wp_locations_parent_id"),
  wpNassauParentId: integer("wp_nassau_parent_id"),
  wpBrooklynParentId: integer("wp_brooklyn_parent_id"),
  defaultFeaturedImageId: integer("default_featured_image_id"),
  googleReviewLinkNassau: text("google_review_link_nassau"),
  googleReviewLinkBrooklyn: text("google_review_link_brooklyn"),
  reviewsWidgetCode: text("reviews_widget_code"),
  wpPublishMode: text("wp_publish_mode").notNull().default('draft_only'),
  gbpPublishMode: text("gbp_publish_mode").notNull().default('draft_only'),
  metaPublishMode: text("meta_publish_mode").notNull().default('draft_only'),
  gbpAccessToken: text("gbp_access_token"),
  gbpRefreshToken: text("gbp_refresh_token"),
  gbpAccountId: text("gbp_account_id"),
  gbpLocationId: text("gbp_location_id"),
  gbpLocationIdNassau: text("gbp_location_id_nassau"),
  gbpLocationIdBrooklyn: text("gbp_location_id_brooklyn"),
  gbpLocationNameNassau: text("gbp_location_name_nassau"),
  gbpLocationNameBrooklyn: text("gbp_location_name_brooklyn"),
  gbpConnected: boolean("gbp_connected").default(false),
  metaAccessToken: text("meta_access_token"),
  metaLongLivedToken: text("meta_long_lived_token"),
  metaPageId: text("meta_page_id"),
  metaPageName: text("meta_page_name"),
  metaAppId: text("meta_app_id"),
  metaAppSecret: text("meta_app_secret"),
  igBusinessAccountId: text("ig_business_account_id"),
  igUsername: text("ig_username"),
  metaConnected: boolean("meta_connected").default(false),
  brandVoiceNotes: text("brand_voice_notes"),
  defaultCta: text("default_cta"),
  autoTriggerEstimate: boolean("auto_trigger_estimate").default(false),
  autoTriggerProjectStarted: boolean("auto_trigger_project_started").default(false),
  autoTriggerProjectCompleted: boolean("auto_trigger_project_completed").default(false),
  autoTriggerPlatforms: jsonb("auto_trigger_platforms").$type<{ wp?: boolean; gbp?: boolean; facebook?: boolean; instagram?: boolean }>(),
  trustBadges: jsonb("trust_badges").$type<Array<{ id: string; label: string; imageUrl: string }>>(),
  serviceThumbnails: jsonb("service_thumbnails").$type<Array<{ slug: string; label: string; imageUrl: string }>>(),
  customerVisits: boolean("customer_visits").default(false),
  ownerPhoto: jsonb("owner_photo").$type<{ imageUrl: string; name: string; title: string }>(),
  teamPhotos: jsonb("team_photos").$type<Array<{ imageUrl: string; name: string; role: string }>>(),
  teamGroupPhoto: jsonb("team_group_photo").$type<Array<{ imageUrl: string; caption?: string }>>(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertGamePlanSettingsSchema = createInsertSchema(gamePlanSettings).omit({ id: true, updatedAt: true });
export type GamePlanSettings = typeof gamePlanSettings.$inferSelect;
export type InsertGamePlanSettings = z.infer<typeof insertGamePlanSettingsSchema>;

export const gamePlanTargetCities = pgTable("game_plan_target_cities", {
  id: serial("id").primaryKey(),
  market: text("market").notNull(),
  city: text("city").notNull(),
  neighborhood: text("neighborhood"),
  zipCodes: text("zip_codes").array().notNull(),
  state: text("state").notNull().default('NY'),
  serviceTypes: text("service_types").array().notNull(),
  isPremium: boolean("is_premium").default(false),
  wpPageId: integer("wp_page_id"),
  wpSlug: text("wp_slug"),
  wpPageUrl: text("wp_page_url"),
  pageStatus: text("page_status").notNull().default('not_created'),
  lastGeneratedContent: text("last_generated_content"),
  lastPublishedAt: timestamp("last_published_at"),
  active: boolean("active").notNull().default(true),
  cityProfile: text("city_profile"),
  toneType: text("tone_type"),
  localHousingNotes: text("local_housing_notes"),
  commonProblems: text("common_problems").array(),
  priorityServices: text("priority_services").array(),
  needsUpdate: boolean("needs_update").default(false),
  updateNotes: text("update_notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertGamePlanTargetCitySchema = createInsertSchema(gamePlanTargetCities).omit({ id: true, createdAt: true, updatedAt: true, lastPublishedAt: true });
export type GamePlanTargetCity = typeof gamePlanTargetCities.$inferSelect;
export type InsertGamePlanTargetCity = z.infer<typeof insertGamePlanTargetCitySchema>;

export type GamePlanImageSlot = {
  url?: string;
  wpMediaId?: number;
  alt?: string;
  caption?: string;
};

export type GamePlanImageSlots = {
  featured?: GamePlanImageSlot;
  mid?: GamePlanImageSlot;
  supporting?: GamePlanImageSlot;
};

export type SeoSectionScore = {
  score: number;
  maxScore: number;
  status: 'pass' | 'warning' | 'fail';
  details: string[];
};

export type SeoSectionScores = {
  title?: SeoSectionScore;
  metaDescription?: SeoSectionScore;
  h1?: SeoSectionScore;
  hero?: SeoSectionScore;
  localContent?: SeoSectionScore;
  projectShowcase?: SeoSectionScore;
  services?: SeoSectionScore;
  internalLinking?: SeoSectionScore;
  faq?: SeoSectionScore;
  imageSeo?: SeoSectionScore;
  cta?: SeoSectionScore;
  duplicateContent?: SeoSectionScore;
};

export const gamePlanQueue = pgTable("game_plan_queue", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id"),
  type: text("type").notNull(),
  pageType: text("page_type"),
  targetCityId: integer("target_city_id"),
  jobId: integer("job_id"),
  projectId: integer("project_id"),
  market: text("market"),
  city: text("city"),
  zip: text("zip"),
  title: text("title").notNull(),
  slug: text("slug"),
  generatedContent: text("generated_content"),
  previewHtml: text("preview_html"),
  diffHtml: text("diff_html"),
  previousContent: text("previous_content"),
  primaryImageUrl: text("primary_image_url"),
  imageSlots: jsonb("image_slots").$type<GamePlanImageSlots>(),
  imageChoices: jsonb("image_choices").$type<string[]>(),
  imageWarnings: text("image_warnings").array(),
  socialCaptions: jsonb("social_captions").$type<{ gbp?: string; facebook?: string; instagram?: string }>(),
  status: text("status").notNull().default('draft'),
  seoScore: integer("seo_score"),
  seoWarnings: text("seo_warnings").array(),
  seoDetails: jsonb("seo_details").$type<SeoSectionScores>(),
  toneType: text("tone_type"),
  introStyle: text("intro_style"),
  ctaStyle: text("cta_style"),
  publishBlocked: boolean("publish_blocked"),
  publishBlockReasons: text("publish_block_reasons").array(),
  wpPostId: integer("wp_post_id"),
  wpFeaturedMediaId: integer("wp_featured_media_id"),
  notes: text("notes"),
  automationTrigger: text("automation_trigger"),
  createdAt: timestamp("created_at").defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
  publishedAt: timestamp("published_at"),
});

export const insertGamePlanQueueSchema = createInsertSchema(gamePlanQueue).omit({ id: true, createdAt: true, reviewedAt: true, publishedAt: true });
export type GamePlanQueueItem = typeof gamePlanQueue.$inferSelect;
export type InsertGamePlanQueueItem = z.infer<typeof insertGamePlanQueueSchema>;

export const gamePlanHistory = pgTable("game_plan_history", {
  id: serial("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id"),
  action: text("action").notNull(),
  summary: text("summary").notNull(),
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertGamePlanHistorySchema = createInsertSchema(gamePlanHistory).omit({ id: true, createdAt: true });
export type GamePlanHistoryEntry = typeof gamePlanHistory.$inferSelect;
export type InsertGamePlanHistoryEntry = z.infer<typeof insertGamePlanHistorySchema>;

export const gamePlanCityProjects = pgTable("game_plan_city_projects", {
  id: serial("id").primaryKey(),
  targetCityId: integer("target_city_id").notNull(),
  projectTitle: text("project_title").notNull(),
  projectCity: text("project_city").notNull(),
  completionDate: text("completion_date"),
  projectSummary: text("project_summary"),
  projectImages: text("project_images").array().default([]),
  beforeAfterImages: jsonb("before_after_images").$type<Array<{ before: string; after: string; label?: string }>>(),
  scopeOfWork: text("scope_of_work").array().default([]),
  productsUsed: text("products_used").array(),
  projectTimeline: text("project_timeline"),
  projectResult: text("project_result"),
  testimonial: text("testimonial"),
  propertyType: text("property_type"),
  roomsOrAreas: text("rooms_or_areas"),
  sortOrder: integer("sort_order").default(0),
  publishedToPage: boolean("published_to_page").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertGamePlanCityProjectSchema = createInsertSchema(gamePlanCityProjects).omit({ id: true, createdAt: true, updatedAt: true });
export type GamePlanCityProject = typeof gamePlanCityProjects.$inferSelect;
export type InsertGamePlanCityProject = z.infer<typeof insertGamePlanCityProjectSchema>;

// === AI ASSISTANT USAGE ===

export const aiAssistantUsage = pgTable("ai_assistant_usage", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  minutesUsed: doublePrecision("minutes_used").notNull().default(0),
  minutesIncluded: integer("minutes_included").notNull().default(500),
  overageMinutes: doublePrecision("overage_minutes").notNull().default(0),
  callCount: integer("call_count").notNull().default(0),
  leadsCaptured: integer("leads_captured").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAiAssistantUsageSchema = createInsertSchema(aiAssistantUsage).omit({ id: true, createdAt: true, updatedAt: true });
export type AiAssistantUsage = typeof aiAssistantUsage.$inferSelect;
export type InsertAiAssistantUsage = z.infer<typeof insertAiAssistantUsageSchema>;

// === AI ASSISTANT CALL LOGS ===

export const aiAssistantCalls = pgTable("ai_assistant_calls", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  contactId: integer("contact_id"),
  projectId: integer("project_id"),
  callerPhone: text("caller_phone").notNull(),
  callSid: text("call_sid"),
  durationSeconds: integer("duration_seconds").default(0),
  outcome: text("outcome").notNull().default('pending'),
  transcript: text("transcript"),
  summary: text("summary"),
  leadCaptured: boolean("lead_captured").default(false),
  leadData: jsonb("lead_data").$type<{ name?: string; phone?: string; address?: string; description?: string; email?: string }>(),
  recordingUrl: text("recording_url"),
  officeAttempted: boolean("office_attempted").default(false),
  officeAnswered: boolean("office_answered").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAiAssistantCallSchema = createInsertSchema(aiAssistantCalls).omit({ id: true, createdAt: true });
export type AiAssistantCall = typeof aiAssistantCalls.$inferSelect;
export type InsertAiAssistantCall = z.infer<typeof insertAiAssistantCallSchema>;

// === HELP CENTER TUTORIALS ===

export const helpTutorials = pgTable("help_tutorials", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category").notNull().default("overview"),
  videoUrl: text("video_url"),
  thumbnailUrl: text("thumbnail_url"),
  recordingNotes: text("recording_notes"),
  sortOrder: integer("sort_order").notNull().default(0),
  published: boolean("published").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertHelpTutorialSchema = createInsertSchema(helpTutorials).omit({ id: true, createdAt: true, updatedAt: true });
export type HelpTutorial = typeof helpTutorials.$inferSelect;
export type InsertHelpTutorial = z.infer<typeof insertHelpTutorialSchema>;

// === WORK ORDER SYSTEM ===

export const workOrderSettings = pgTable("work_order_settings", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().unique(),
  showCustomerName: boolean("show_customer_name").notNull().default(true),
  showCustomerPhone: boolean("show_customer_phone").notNull().default(true),
  showCustomerEmail: boolean("show_customer_email").notNull().default(false),
  showJobAddress: boolean("show_job_address").notNull().default(true),
  showLineItems: boolean("show_line_items").notNull().default(true),
  showNotes: boolean("show_notes").notNull().default(true),
  showScheduledDates: boolean("show_scheduled_dates").notNull().default(true),
  showProjectDescription: boolean("show_project_description").notNull().default(true),
  autoSendEnabled: boolean("auto_send_enabled").notNull().default(false),
  autoSendTiming: text("auto_send_timing").notNull().default("on_acceptance"),
  autoSendDaysBefore: integer("auto_send_days_before").default(1),
  autoSendToRoles: text("auto_send_to_roles").array(),
  sendReminderEnabled: boolean("send_reminder_enabled").notNull().default(false),
  reminderDaysBefore: integer("reminder_days_before").default(1),
  // When true, the public work-order page shows an "Assigned Crew"
  // section listing every team member assigned to the project. Off
  // by default so the page stays customer-friendly unless the user
  // opts in.
  showAssignedCrew: boolean("show_assigned_crew").notNull().default(false),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const workOrders = pgTable("work_orders", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  // Each proposal/estimate document owns its own work order. Nullable
  // for legacy rows; the migration backfills it to the project's oldest
  // proposal so existing data lands somewhere sensible.
  documentId: integer("document_id"),
  userId: varchar("user_id").notNull(),
  publicToken: text("public_token").notNull().unique(),
  status: text("status").notNull().default("draft"),
  showCustomerName: boolean("show_customer_name").notNull().default(true),
  showCustomerPhone: boolean("show_customer_phone").notNull().default(true),
  showCustomerEmail: boolean("show_customer_email").notNull().default(false),
  showJobAddress: boolean("show_job_address").notNull().default(true),
  showLineItems: boolean("show_line_items").notNull().default(true),
  showNotes: boolean("show_notes").notNull().default(true),
  showScheduledDates: boolean("show_scheduled_dates").notNull().default(true),
  showProjectDescription: boolean("show_project_description").notNull().default(true),
  showAssignedCrew: boolean("show_assigned_crew").notNull().default(false),
  additionalNotes: text("additional_notes"),
  autoSendTiming: text("auto_send_timing").default("on_acceptance"),
  autoSendDaysBefore: integer("auto_send_days_before").default(1),
  sendToRoles: text("send_to_roles").array(),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const workOrderViews = pgTable("work_order_views", {
  id: serial("id").primaryKey(),
  workOrderId: integer("work_order_id").notNull(),
  teamMemberId: integer("team_member_id").notNull(),
  viewedAt: timestamp("viewed_at").defaultNow(),
});

export const workOrderSends = pgTable("work_order_sends", {
  id: serial("id").primaryKey(),
  workOrderId: integer("work_order_id").notNull(),
  teamMemberId: integer("team_member_id").notNull(),
  channel: text("channel").notNull().default("sms"),
  sentAt: timestamp("sent_at").defaultNow(),
  status: text("status").notNull().default("sent"),
});

export const insertWorkOrderSettingsSchema = createInsertSchema(workOrderSettings).omit({ id: true, updatedAt: true });
export const insertWorkOrderSchema = createInsertSchema(workOrders).omit({ id: true, publicToken: true, createdAt: true, updatedAt: true });
export const insertWorkOrderViewSchema = createInsertSchema(workOrderViews).omit({ id: true, viewedAt: true });
export const insertWorkOrderSendSchema = createInsertSchema(workOrderSends).omit({ id: true, sentAt: true });

export type WorkOrderSettings = typeof workOrderSettings.$inferSelect;
export type InsertWorkOrderSettings = z.infer<typeof insertWorkOrderSettingsSchema>;
export type WorkOrder = typeof workOrders.$inferSelect;
export type InsertWorkOrder = z.infer<typeof insertWorkOrderSchema>;
export type WorkOrderView = typeof workOrderViews.$inferSelect;
export type InsertWorkOrderView = z.infer<typeof insertWorkOrderViewSchema>;
export type WorkOrderSend = typeof workOrderSends.$inferSelect;
export type InsertWorkOrderSend = z.infer<typeof insertWorkOrderSendSchema>;

// Company Users - multi-user system for team access
export const companyUsers = pgTable("company_users", {
  id: serial("id").primaryKey(),
  ownerId: varchar("owner_id").notNull(),
  userId: varchar("user_id").notNull(),
  role: text("role").notNull(), // 'office_manager', 'project_manager', 'sales_rep', 'crew_lead', 'laborer'
  status: text("status").notNull().default('active'), // 'active', 'suspended'
  capabilities: jsonb("capabilities").$type<Record<string, boolean>>(),
  linkedTeamMemberId: integer("linked_team_member_id"),
  invitedAt: timestamp("invited_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const companyInvitations = pgTable("company_invitations", {
  id: serial("id").primaryKey(),
  ownerId: varchar("owner_id").notNull(),
  email: text("email"),
  phone: text("phone"),
  role: text("role").notNull(),
  token: text("token").notNull().unique(),
  status: text("status").notNull().default('pending'),
  linkedTeamMemberId: integer("linked_team_member_id"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCompanyUserSchema = createInsertSchema(companyUsers).omit({ id: true, createdAt: true });
export const insertCompanyInvitationSchema = createInsertSchema(companyInvitations).omit({ id: true, createdAt: true });

export type CompanyUser = typeof companyUsers.$inferSelect;
export type InsertCompanyUser = z.infer<typeof insertCompanyUserSchema>;
export type CompanyInvitation = typeof companyInvitations.$inferSelect;
export type InsertCompanyInvitation = z.infer<typeof insertCompanyInvitationSchema>;

export const teamChannels = pgTable("team_channels", {
  id: serial("id").primaryKey(),
  companyOwnerId: varchar("company_owner_id").notNull(),
  name: text("name"),
  type: text("type").notNull().default("general"),
  createdById: varchar("created_by_id").notNull(),
  memberIds: text("member_ids").array().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTeamChannelSchema = createInsertSchema(teamChannels).omit({ id: true, createdAt: true, updatedAt: true });
export type TeamChannel = typeof teamChannels.$inferSelect;
export type InsertTeamChannel = z.infer<typeof insertTeamChannelSchema>;

export const teamMessages = pgTable("team_messages", {
  id: serial("id").primaryKey(),
  companyOwnerId: varchar("company_owner_id").notNull(),
  senderId: varchar("sender_id").notNull(),
  recipientId: varchar("recipient_id"),
  channel: text("channel").notNull().default("general"),
  channelId: integer("channel_id"),
  message: text("message").notNull(),
  imageUrl: text("image_url"),
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTeamMessageSchema = createInsertSchema(teamMessages).omit({ id: true, createdAt: true });
export type TeamMessage = typeof teamMessages.$inferSelect;
export type InsertTeamMessage = z.infer<typeof insertTeamMessageSchema>;

// === TEAM MESSAGE READS (per-user read tracking) ===

export const teamMessageReads = pgTable("team_message_reads", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").notNull(),
  userId: varchar("user_id").notNull(),
  readAt: timestamp("read_at").defaultNow(),
});

// === OTP CODES (for native app authentication) ===

export const otpCodes = pgTable("otp_codes", {
  id: serial("id").primaryKey(),
  email: varchar("email").notNull(),
  codeHash: varchar("code_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  attempts: integer("attempts").default(0),
  ip: varchar("ip"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type OtpCode = typeof otpCodes.$inferSelect;

// === REFRESH TOKENS (for native app JWT auth) ===

export const refreshTokens = pgTable("refresh_tokens", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  tokenHash: varchar("token_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  lastUsedAt: timestamp("last_used_at").defaultNow(),
  ip: varchar("ip"),
  userAgent: varchar("user_agent"),
  revoked: boolean("revoked").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export type RefreshToken = typeof refreshTokens.$inferSelect;

// === PROPOSAL PACKAGES ===

export const proposalPackages = pgTable("proposal_packages", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  recommended: boolean("recommended").default(false),
  priceAdjustmentType: text("price_adjustment_type").notNull().default('percent'),
  adjustmentValue: doublePrecision("adjustment_value").notNull().default(0),
  materialMultiplier: doublePrecision("material_multiplier").notNull().default(1.0),
  features: jsonb("features").$type<PackageFeature[]>().default([]),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProposalPackageSchema = createInsertSchema(proposalPackages).omit({ id: true, createdAt: true });
export type ProposalPackage = typeof proposalPackages.$inferSelect;
export type InsertProposalPackage = z.infer<typeof insertProposalPackageSchema>;

// === PACKAGE FEATURE LIBRARY ===

export const packageFeaturesLibrary = pgTable("package_features_library", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPackageFeatureLibrarySchema = createInsertSchema(packageFeaturesLibrary).omit({ id: true, createdAt: true });
export type PackageFeatureLibrary = typeof packageFeaturesLibrary.$inferSelect;
export type InsertPackageFeatureLibrary = z.infer<typeof insertPackageFeatureLibrarySchema>;

export const packageFeatureAssignments = pgTable("package_feature_assignments", {
  id: serial("id").primaryKey(),
  packageId: integer("package_id").notNull(),
  featureId: integer("feature_id").notNull(),
  included: boolean("included").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPackageFeatureAssignmentSchema = createInsertSchema(packageFeatureAssignments).omit({ id: true, createdAt: true });
export type PackageFeatureAssignment = typeof packageFeatureAssignments.$inferSelect;
export type InsertPackageFeatureAssignment = z.infer<typeof insertPackageFeatureAssignmentSchema>;

// === PROPOSAL UPSELLS ===

export const proposalUpsells = pgTable("proposal_upsells", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  priceType: text("price_type").notNull().default('flat'),
  priceValue: doublePrecision("price_value").notNull().default(0),
  category: text("category"),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProposalUpsellSchema = createInsertSchema(proposalUpsells).omit({ id: true, createdAt: true });
export type ProposalUpsell = typeof proposalUpsells.$inferSelect;
export type InsertProposalUpsell = z.infer<typeof insertProposalUpsellSchema>;

// === CREW RECEIPT SUBMISSIONS ===

export const crewReceiptSubmissions = pgTable("crew_receipt_submissions", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  userId: varchar("user_id").notNull(),
  ownerId: varchar("owner_id").notNull(),
  fileName: text("file_name").notNull(),
  storageKey: text("storage_key").notNull(),
  status: text("status").notNull().default('pending'),
  title: text("title"),
  amount: integer("amount"),
  vendor: text("vendor"),
  category: text("category"),
  receiptDate: timestamp("receipt_date"),
  expenseId: integer("expense_id"),
  paidByWorker: boolean("paid_by_worker").default(false),
  workerReimbursementAmount: integer("worker_reimbursement_amount"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCrewReceiptSubmissionSchema = createInsertSchema(crewReceiptSubmissions).omit({ id: true, createdAt: true });
export type CrewReceiptSubmission = typeof crewReceiptSubmissions.$inferSelect;
export type InsertCrewReceiptSubmission = z.infer<typeof insertCrewReceiptSubmissionSchema>;

export const projectCrewNotes = pgTable("project_crew_notes", {
  id: serial("id").primaryKey(),
  companyOwnerId: varchar("company_owner_id").notNull(),
  projectId: integer("project_id"),
  createdById: varchar("created_by_id").notNull(),
  title: text("title").notNull(),
  message: text("message"),
  priority: text("priority").notNull().default("normal"),
  tasks: jsonb("tasks"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProjectCrewNoteSchema = createInsertSchema(projectCrewNotes).omit({ id: true, createdAt: true });
export type ProjectCrewNote = typeof projectCrewNotes.$inferSelect;
export type InsertProjectCrewNote = z.infer<typeof insertProjectCrewNoteSchema>;

export const projectCrewNoteReads = pgTable("project_crew_note_reads", {
  id: serial("id").primaryKey(),
  noteId: integer("note_id").notNull(),
  userId: varchar("user_id").notNull(),
  readAt: timestamp("read_at").defaultNow(),
});

export type ProjectCrewNoteRead = typeof projectCrewNoteReads.$inferSelect;

// Paint Color Library
export const paintColors = pgTable("paint_colors", {
  id: serial("id").primaryKey(),
  brand: text("brand").notNull(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  hexColor: text("hex_color").notNull(),
  family: text("family").notNull(),
  collection: text("collection"),
  active: boolean("active").default(true),
});

export const insertPaintColorSchema = createInsertSchema(paintColors).omit({ id: true });
export type InsertPaintColor = z.infer<typeof insertPaintColorSchema>;
export type PaintColor = typeof paintColors.$inferSelect;

export const projectColorSelections = pgTable("project_color_selections", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  projectId: integer("project_id").notNull(),
  // Per-proposal ownership — nullable for legacy rows; backfilled to
  // the project's oldest proposal during migration.
  documentId: integer("document_id"),
  paintColorId: integer("paint_color_id"),
  area: text("area").notNull(),
  customColorName: text("custom_color_name"),
  customHex: text("custom_hex"),
  customImage: text("custom_image"),
  sheen: text("sheen"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProjectColorSelectionSchema = createInsertSchema(projectColorSelections).omit({ id: true, createdAt: true });
export type InsertProjectColorSelection = z.infer<typeof insertProjectColorSelectionSchema>;
export type ProjectColorSelection = typeof projectColorSelections.$inferSelect;

export const projectColorGroups = pgTable("project_color_groups", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  projectId: integer("project_id").notNull(),
  // Per-proposal ownership — nullable for legacy rows; backfilled to
  // the project's oldest proposal during migration.
  documentId: integer("document_id"),
  name: text("name").notNull(),
  paintColorId: integer("paint_color_id"),
  customColorName: text("custom_color_name"),
  customHex: text("custom_hex"),
  brand: text("brand"),
  finish: text("finish"),
  surfaces: text("surfaces").array().notNull().default(sql`ARRAY[]::text[]`),
  gallonsOverride: integer("gallons_override"),
  displayOrder: integer("display_order").notNull().default(0),
  notes: text("notes"),
  customerNotes: text("customer_notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProjectColorGroupSchema = createInsertSchema(projectColorGroups).omit({ id: true, createdAt: true });
export type InsertProjectColorGroup = z.infer<typeof insertProjectColorGroupSchema>;
export type ProjectColorGroup = typeof projectColorGroups.$inferSelect;

// messageGroups / messageGroupMembers were removed. Group SMS routing was unreliable
// and caused empty-thread bugs on push notifications. All conversations are now
// 1-on-1 contact threads. Outbound proposals can still be sent to multiple recipients;
// each reply lands on the sender's individual contact thread. Existing tables (if any)
// are intentionally left in the database — they will not be referenced by the app.

// Shared photo links - public sharing of selected photos.
// Two formats supported:
//   1. Legacy: photoIds array of document_photos row IDs (kept for backward compat).
//   2. Universal: entries JSONB array — { kind: 'doc', photoId } | { kind: 'url', url, caption?, fileName?, annotations? }
// New shares always use entries so any photo source can be mixed in one link
// (uploaded doc photos, CompanyCam, source/text/form photos, area photos).
export type SharePhotoEntry =
  | { kind: 'doc'; photoId: number }
  | { kind: 'url'; url: string; caption?: string | null; fileName?: string | null; annotations?: any[] | null };

export const sharedPhotoLinks = pgTable("shared_photo_links", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  documentId: integer("document_id").notNull().default(0),
  projectId: integer("project_id"),
  token: text("token").notNull().unique(),
  photoIds: integer("photo_ids").array().notNull(),
  entries: jsonb("entries").$type<SharePhotoEntry[]>(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSharedPhotoLinkSchema = createInsertSchema(sharedPhotoLinks).omit({ id: true, createdAt: true });
export type InsertSharedPhotoLink = z.infer<typeof insertSharedPhotoLinkSchema>;
export type SharedPhotoLink = typeof sharedPhotoLinks.$inferSelect;

// Blocked Numbers
export const blockedNumbers = pgTable("blocked_numbers", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  phoneNumber: text("phone_number").notNull(),
  label: text("label"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertBlockedNumberSchema = createInsertSchema(blockedNumbers).omit({ id: true, createdAt: true });
export type InsertBlockedNumber = z.infer<typeof insertBlockedNumberSchema>;
export type BlockedNumber = typeof blockedNumbers.$inferSelect;

// Request types
export type CreateContactRequest = InsertContact;
export type UpdateContactRequest = Partial<InsertContact>;
export type CreateDocumentRequest = InsertDocument;
export type UpdateDocumentRequest = Partial<InsertDocument>;
export type SignDocumentRequest = { signature: string };
export type UpdateCompanySettingsRequest = Partial<InsertCompanySettings>;

// === CLIENT ERROR LOGS ===
export const clientErrorLogs = pgTable("client_error_logs", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id"),
  errorCode: varchar("error_code", { length: 20 }),
  message: text("message"),
  stack: text("stack"),
  componentStack: text("component_stack"),
  url: text("url"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ===== Referral Program =====
export const referrals = pgTable("referrals", {
  id: serial("id").primaryKey(),
  referrerUserId: varchar("referrer_user_id").notNull(),
  referredUserId: varchar("referred_user_id").notNull().unique(),
  status: varchar("status", { length: 20 }).notNull().default('pending'),
  creditedAt: timestamp("credited_at"),
  createdAt: timestamp("created_at").defaultNow(),
});
export const insertReferralSchema = createInsertSchema(referrals).omit({ id: true, createdAt: true });
export type InsertReferral = z.infer<typeof insertReferralSchema>;
export type Referral = typeof referrals.$inferSelect;

export const giftCardRequests = pgTable("gift_card_requests", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  amountCents: integer("amount_cents").notNull(),
  status: varchar("status", { length: 20 }).notNull().default('requested'),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  fulfilledAt: timestamp("fulfilled_at"),
});
export const insertGiftCardRequestSchema = createInsertSchema(giftCardRequests).omit({ id: true, createdAt: true, fulfilledAt: true });
export type InsertGiftCardRequest = z.infer<typeof insertGiftCardRequestSchema>;
export type GiftCardRequest = typeof giftCardRequests.$inferSelect;

// ===== Affiliate Program =====
export const affiliates = pgTable("affiliates", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").unique(),
  email: varchar("email"),
  phone: varchar("phone"),
  status: varchar("status", { length: 20 }).notNull().default('applied'),
  fullName: varchar("full_name"),
  socialHandle: varchar("social_handle"),
  socialPlatform: varchar("social_platform", { length: 30 }),
  followerCount: integer("follower_count"),
  websiteUrl: varchar("website_url"),
  applicationNotes: text("application_notes"),
  rejectionReason: text("rejection_reason"),
  approvedAt: timestamp("approved_at"),
  stripeConnectAccountId: varchar("stripe_connect_account_id"),
  stripeOnboardingComplete: boolean("stripe_onboarding_complete").default(false),
  commissionBps: integer("commission_bps").notNull().default(1000),
  adminNotes: text("admin_notes"),
  createdAt: timestamp("created_at").defaultNow(),
});
export const insertAffiliateSchema = createInsertSchema(affiliates).omit({ id: true, createdAt: true, approvedAt: true, stripeConnectAccountId: true, stripeOnboardingComplete: true, status: true, rejectionReason: true, commissionBps: true, adminNotes: true });
export type InsertAffiliate = z.infer<typeof insertAffiliateSchema>;
export type Affiliate = typeof affiliates.$inferSelect;

export const affiliateReferrals = pgTable("affiliate_referrals", {
  id: serial("id").primaryKey(),
  affiliateId: integer("affiliate_id").notNull(),
  referredUserId: varchar("referred_user_id").notNull().unique(),
  status: varchar("status", { length: 20 }).notNull().default('pending'),
  firstPaidAt: timestamp("first_paid_at"),
  commissionEndsAt: timestamp("commission_ends_at"),
  createdAt: timestamp("created_at").defaultNow(),
});
export type AffiliateReferral = typeof affiliateReferrals.$inferSelect;

export const affiliateCommissions = pgTable("affiliate_commissions", {
  id: serial("id").primaryKey(),
  affiliateId: integer("affiliate_id").notNull(),
  affiliateReferralId: integer("affiliate_referral_id").notNull(),
  stripeInvoiceId: varchar("stripe_invoice_id"),
  customerPaymentCents: integer("customer_payment_cents").notNull(),
  amountCents: integer("amount_cents").notNull(),
  earnedAt: timestamp("earned_at").defaultNow(),
  payoutId: integer("payout_id"),
});
export type AffiliateCommission = typeof affiliateCommissions.$inferSelect;

export const affiliatePayouts = pgTable("affiliate_payouts", {
  id: serial("id").primaryKey(),
  affiliateId: integer("affiliate_id").notNull(),
  amountCents: integer("amount_cents").notNull(),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  status: varchar("status", { length: 20 }).notNull().default('pending'),
  stripeTransferId: varchar("stripe_transfer_id"),
  failureReason: text("failure_reason"),
  createdAt: timestamp("created_at").defaultNow(),
  paidAt: timestamp("paid_at"),
});
export type AffiliatePayout = typeof affiliatePayouts.$inferSelect;

export const featureRequests = pgTable("feature_requests", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  title: text("title").notNull(),
  location: text("location"),
  description: text("description").notNull(),
  imageUrls: text("image_urls").array().default(sql`ARRAY[]::text[]`).notNull(),
  videoUrl: text("video_url"),
  status: varchar("status", { length: 20 }).notNull().default('submitted'),
  adminNote: text("admin_note"),
  shareToken: varchar("share_token", { length: 32 }).notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export const insertFeatureRequestSchema = createInsertSchema(featureRequests).omit({
  id: true, userId: true, status: true, adminNote: true, shareToken: true, createdAt: true, updatedAt: true,
});
export type FeatureRequest = typeof featureRequests.$inferSelect;
export type InsertFeatureRequest = z.infer<typeof insertFeatureRequestSchema>;

// Response types
export type ContactWithDocs = Contact & { documents: Document[] };
export type DocumentWithContact = Document & { contact: Contact };
