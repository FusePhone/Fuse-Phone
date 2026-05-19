import { db } from "./db";
import { eq, desc, and, sql, isNull, isNotNull, inArray, gt, gte } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  contacts, documents, documentViews, communications, companySettings, payments, templates, proposalTemplates, messageTemplates, bookingRequests, appointments, jobs, users, pushSubscriptions, deviceTokens, teamMembers, documentRecipients, projects, projectActivities, projectRecipients,
  projectExpenses, projectExpensePhotos, projectCrewAssignments, timeEntries, scheduledAutomations, scheduledMessages, crewReceiptSubmissions, manualLaborEntries,
  type Contact, type InsertContact,
  type Document, type InsertDocument,
  type DocumentView,
  type Communication, type InsertCommunication,
  type CompanySettings, type InsertCompanySettings,
  type Payment, type InsertPayment,
  type Template, type InsertTemplate,
  type ProposalTemplate, type InsertProposalTemplate,
  type MessageTemplate, type InsertMessageTemplate,
  bookingForms,
  type BookingForm, type InsertBookingForm,
  type BookingRequest, type InsertBookingRequest,
  type Appointment, type InsertAppointment,
  appointmentSessions,
  type AppointmentSession, type InsertAppointmentSession,
  type Job, type InsertJob, type JobWithDetails,
  type TeamMember, type InsertTeamMember,
  type DocumentRecipient, type InsertDocumentRecipient,
  type Project, type InsertProject, type ProjectWithContact, type ProjectWithDetails,
  type ProjectActivity, type InsertProjectActivity,
  type ProjectRecipient, type InsertProjectRecipient,
  type ProjectExpense, type InsertProjectExpense, type ProjectExpenseWithPhotos,
  type ProjectExpensePhoto, type InsertProjectExpensePhoto,
  type ManualLaborEntry, type InsertManualLaborEntry,
  type ProjectCrewAssignment, type InsertProjectCrewAssignment, type CrewAssignmentWithMember,
  type TimeEntry, type InsertTimeEntry, type TimeEntryWithMember,
  type ScheduledAutomation, type InsertScheduledAutomation,
  type ScheduledMessage, type InsertScheduledMessage,
  financialSettings, overheadExpenses, employeeOverheadCosts,
  type FinancialSettings, type InsertFinancialSettings,
  type OverheadExpense, type InsertOverheadExpense,
  type EmployeeOverheadCost, type InsertEmployeeOverheadCost,
  materials,
  type Material, type InsertMaterial,
  surfaces,
  type Surface, type InsertSurface,
  aiMessageDrafts,
  type AiMessageDraft, type InsertAiMessageDraft,
  aiActions,
  type AiAction, type InsertAiAction,
  gamePlanSettings, gamePlanTargetCities, gamePlanQueue, gamePlanHistory, gamePlanCityProjects,
  type GamePlanSettings, type InsertGamePlanSettings,
  type GamePlanTargetCity, type InsertGamePlanTargetCity,
  type GamePlanQueueItem, type InsertGamePlanQueueItem,
  type GamePlanHistoryEntry, type InsertGamePlanHistoryEntry,
  type GamePlanCityProject, type InsertGamePlanCityProject,
  helpTutorials,
  type HelpTutorial, type InsertHelpTutorial,
  workOrderSettings, workOrders, workOrderViews, workOrderSends,
  type WorkOrderSettings, type InsertWorkOrderSettings,
  type WorkOrder, type InsertWorkOrder,
  type WorkOrderView, type InsertWorkOrderView,
  type WorkOrderSend, type InsertWorkOrderSend,
  companyUsers, companyInvitations,
  type CompanyUser, type InsertCompanyUser,
  type CompanyInvitation, type InsertCompanyInvitation,
  teamMessages, teamChannels, teamMessageReads,
  type TeamMessage, type InsertTeamMessage,
  type TeamChannel, type InsertTeamChannel,
  proposalPackages,
  type ProposalPackage, type InsertProposalPackage,
  packageFeaturesLibrary, packageFeatureAssignments,
  type PackageFeatureLibrary, type InsertPackageFeatureLibrary,
  type PackageFeatureAssignment, type InsertPackageFeatureAssignment,
  type CrewReceiptSubmission, type InsertCrewReceiptSubmission,
  blockedNumbers,
  type BlockedNumber, type InsertBlockedNumber,
  featureRequests,
  type FeatureRequest, type InsertFeatureRequest,
} from "@shared/schema";

function generatePublicToken(): string {
  return nanoid(24);
}

export interface IStorage {
  // Contacts - all filtered by userId
  getContacts(userId: string, filters?: { type?: string; archived?: boolean }): Promise<Contact[]>;
  getContact(userId: string, id: number): Promise<Contact | undefined>;
  getContactByPhone(userId: string, phone: string): Promise<Contact | undefined>;
  getContactByEmail(userId: string, email: string): Promise<Contact | undefined>;
  createContact(userId: string, contact: InsertContact): Promise<Contact>;
  updateContact(userId: string, id: number, updates: Partial<InsertContact>): Promise<Contact | undefined>;
  deleteContact(userId: string, id: number): Promise<void>;

  // Documents - all filtered by userId
  getDocuments(userId: string, filters?: { contactId?: number; type?: string }): Promise<(Document & { contact: Contact })[]>;
  getDocument(userId: string, id: number): Promise<(Document & { contact: Contact }) | undefined>;
  getDocumentByToken(token: string): Promise<(Document & { contact: Contact }) | undefined>;
  getDocumentBySlugAndId(companySlug: string, docId: number): Promise<(Document & { contact: Contact }) | undefined>;
  getNextDocumentNumber(userId: string): Promise<number>;
  createDocument(userId: string, doc: InsertDocument): Promise<Document>;
  updateDocument(userId: string, id: number, updates: Partial<InsertDocument> & { signedAt?: Date | null, linkedInvoiceId?: number | null }): Promise<Document | undefined>;
  deleteDocument(userId: string, id: number): Promise<void>;
  trackDocumentView(id: number, ipAddress?: string, userAgent?: string, skipCount?: boolean): Promise<{ counted: boolean }>;
  getDocumentViews(documentId: number): Promise<DocumentView[]>;
  getChangeOrdersBySourceDocument(userId: string, sourceDocumentId: number): Promise<Document[]>;

  // Dashboard - filtered by userId
  getDashboardStats(userId: string): Promise<{
    // Contact metrics
    totalLeads: number;
    totalContacts: number;
    totalClients: number;
    // Document metrics
    activeProposals: number;
    pendingEstimates: number;
    pendingChangeOrders: number;
    pendingInvoicesCount: number;
    pendingInvoicesAmount: number;
    // Jobs metrics
    activeJobs: number;
    scheduledJobs: number;
    completedJobsThisMonth: number;
    // Communication metrics
    unreadMessages: number;
    missedCalls: number;
    // Appointments
    upcomingAppointmentsCount: number;
    // Revenue metrics
    monthlyRevenue: number;
    yearlyRevenue: number;
    // Recent data for display
    recentLeads: Contact[];
    upcomingAppointments: (Appointment & { contact: Contact })[];
    activeJobsList: (Job & { contact: Contact })[];
    unreadCommunications: (Communication & { contact: Contact })[];
  }>;

  getDashboardPipeline(userId: string): Promise<{
    projects: ProjectWithContact[];
    stats: {
      newLeadsThisWeek: number;
      proposalsPending: number;
      activeJobsCount: number;
      monthlyRevenue: number;
      yearlyRevenue: number;
      pendingInvoicesAmount: number;
      pendingInvoicesCount: number;
      unreadMessages: number;
      missedCalls: number;
    };
  }>;

  // Company Settings - per user
  getCompanySettings(userId: string): Promise<CompanySettings | undefined>;
  getCompanySettingsByBookingToken(bookingToken: string): Promise<CompanySettings | undefined>;
  getCompanySettingsBySlug(slug: string): Promise<CompanySettings | undefined>;
  getCompanySettingsByTwilioPhone(phone: string): Promise<CompanySettings | undefined>;
  getCompanySettingsByOpenPhone(phone: string): Promise<CompanySettings | undefined>;
  getCompanySettingsByWebhookToken(tokenColumn: 'thumbtackWebhookToken' | 'zapierWebhookToken' | 'facebookWebhookToken', token: string): Promise<CompanySettings | undefined>;
  isSlugAvailable(slug: string, excludeUserId?: string): Promise<boolean>;
  updateCompanySettings(userId: string, updates: Partial<InsertCompanySettings>): Promise<CompanySettings>;

  // Communications - filtered by userId
  getCommunicationByMessageSid(messageSid: string): Promise<Communication | undefined>;
  createCommunication(userId: string, comm: InsertCommunication): Promise<Communication>;
  getCommunications(userId: string, contactId?: number): Promise<Communication[]>;
  getCommunicationsByPhone(userId: string, phoneNumber: string): Promise<Communication[]>;
  getUnknownNumberConversations(userId: string): Promise<{ phoneNumber: string; lastMessage: string; lastTimestamp: Date; unreadCount: number }[]>;
  linkPhoneCommunicationsToContact(userId: string, phoneNumber: string, contactId: number): Promise<void>;
  getUnreadCounts(userId: string): Promise<{ unreadMessages: number; missedCalls: number; newLeads: number; newProjects: number; newBookingRequests: number; unreadTeamMessages: number }>;
  markSectionSeen(userId: string, section: 'leads' | 'projects' | 'calendar'): Promise<void>;
  markCommunicationsAsRead(userId: string, contactId: number, type?: string): Promise<void>;
  markCommunicationsAsReadByPhone(userId: string, phoneNumber: string, type?: string): Promise<void>;
  markCommunicationsAsReadByIds(userId: string, ids: number[]): Promise<void>;
  markAllCommunicationsAsReadByType(userId: string, type: string): Promise<void>;
  updateCommunication(id: number, data: { mediaUrl?: string; mediaUrls?: string[]; mediaType?: string; content?: string }): Promise<void>;

  // Push Subscriptions
  savePushSubscription(userId: string, endpoint: string, p256dh: string, auth: string): Promise<void>;
  deletePushSubscription(endpoint: string): Promise<void>;
  getPushSubscriptions(userId: string): Promise<{ endpoint: string; p256dh: string; auth: string }[]>;

  // Native Device Tokens (FCM)
  saveDeviceToken(userId: string, token: string, platform: string, environment?: string): Promise<void>;
  deleteDeviceToken(token: string): Promise<void>;
  getDeviceTokens(userId: string): Promise<{ token: string; platform: string; environment: string | null }[]>;

  // Payments - filtered by userId
  getPayments(userId: string, documentId: number): Promise<Payment[]>;
  createPayment(userId: string, payment: InsertPayment): Promise<Payment>;
  deletePayment(userId: string, id: number): Promise<void>;

  // Templates - filtered by userId
  getTemplates(userId: string): Promise<Template[]>;
  getTemplate(userId: string, slug: string): Promise<Template | undefined>;
  upsertTemplate(userId: string, template: InsertTemplate): Promise<Template>;

  // Message Templates - filtered by userId
  getMessageTemplates(userId: string): Promise<MessageTemplate[]>;
  getMessageTemplate(userId: string, slug: string): Promise<MessageTemplate | undefined>;
  upsertMessageTemplate(userId: string, slug: string, data: { content: string; emailSubject?: string; emailContent?: string; isEnabled?: boolean }): Promise<MessageTemplate>;
  patchMessageTemplate(userId: string, slug: string, data: { isEnabled: boolean }): Promise<MessageTemplate>;

  // Proposal Templates - filtered by userId
  getProposalTemplates(userId: string): Promise<ProposalTemplate[]>;
  getProposalTemplate(userId: string, id: number): Promise<ProposalTemplate | undefined>;
  createProposalTemplate(userId: string, template: InsertProposalTemplate): Promise<ProposalTemplate>;
  updateProposalTemplate(userId: string, id: number, updates: Partial<InsertProposalTemplate>): Promise<ProposalTemplate | undefined>;
  deleteProposalTemplate(userId: string, id: number): Promise<void>;

  // Booking Forms - filtered by userId
  getBookingForms(userId: string): Promise<BookingForm[]>;
  getBookingForm(userId: string, id: number): Promise<BookingForm | undefined>;
  getBookingFormBySlug(slug: string): Promise<BookingForm | undefined>;
  getBookingFormByToken(token: string): Promise<BookingForm | undefined>;
  getDefaultBookingForm(userId: string): Promise<BookingForm | undefined>;
  createBookingForm(userId: string, form: InsertBookingForm): Promise<BookingForm>;
  updateBookingForm(userId: string, id: number, updates: Partial<InsertBookingForm>): Promise<BookingForm | undefined>;
  deleteBookingForm(userId: string, id: number): Promise<void>;
  setDefaultBookingForm(userId: string, id: number): Promise<void>;
  ensureDefaultBookingForm(userId: string): Promise<BookingForm>;

  // Booking Requests - filtered by userId
  getBookingRequests(userId: string): Promise<BookingRequest[]>;
  getBookingRequest(userId: string, id: number): Promise<BookingRequest | undefined>;
  createBookingRequest(userId: string, request: InsertBookingRequest): Promise<BookingRequest>;
  updateBookingRequest(userId: string, id: number, updates: Partial<BookingRequest>): Promise<BookingRequest | undefined>;
  deleteBookingRequest(userId: string, id: number): Promise<void>;

  // Appointments - filtered by userId
  getAppointments(userId: string, filters?: { contactId?: number }): Promise<(Appointment & { contact: Contact })[]>;
  getAppointment(userId: string, id: number): Promise<(Appointment & { contact: Contact }) | undefined>;
  createAppointment(userId: string, appointment: InsertAppointment): Promise<Appointment>;
  updateAppointment(userId: string, id: number, updates: Partial<InsertAppointment>): Promise<Appointment | undefined>;
  deleteAppointment(userId: string, id: number): Promise<void>;

  // Appointment Sessions - filtered by userId
  getActiveAppointmentSession(userId: string): Promise<(AppointmentSession & { appointment: Appointment & { contact: Contact } }) | undefined>;
  getAppointmentSession(userId: string, id: number): Promise<AppointmentSession | undefined>;
  createAppointmentSession(userId: string, session: InsertAppointmentSession): Promise<AppointmentSession>;
  updateAppointmentSession(userId: string, id: number, updates: Partial<InsertAppointmentSession>): Promise<AppointmentSession | undefined>;

  // Jobs - filtered by userId
  getJobs(userId: string, filters?: { contactId?: number; stage?: string }): Promise<JobWithDetails[]>;
  getJob(userId: string, id: number): Promise<JobWithDetails | undefined>;
  createJob(userId: string, job: InsertJob): Promise<Job>;
  updateJob(userId: string, id: number, updates: Partial<InsertJob>): Promise<Job | undefined>;
  deleteJob(userId: string, id: number): Promise<void>;

  // Team Members - filtered by userId
  getTeamMembers(userId: string): Promise<TeamMember[]>;
  getTeamMember(userId: string, id: number): Promise<TeamMember | undefined>;
  createTeamMember(userId: string, member: InsertTeamMember): Promise<TeamMember>;
  updateTeamMember(userId: string, id: number, updates: Partial<InsertTeamMember>): Promise<TeamMember | undefined>;
  deleteTeamMember(userId: string, id: number): Promise<void>;

  // Document Recipients
  getDocumentRecipients(documentId: number): Promise<DocumentRecipient[]>;
  addDocumentRecipient(recipient: InsertDocumentRecipient): Promise<DocumentRecipient>;
  updateDocumentRecipient(documentId: number, recipientId: number, data: Partial<Pick<InsertDocumentRecipient, 'name' | 'email' | 'phone'>>): Promise<DocumentRecipient>;
  removeDocumentRecipient(documentId: number, recipientId: number): Promise<void>;

  // Project Recipients
  getProjectRecipients(projectId: number): Promise<ProjectRecipient[]>;
  addProjectRecipient(recipient: InsertProjectRecipient): Promise<ProjectRecipient>;
  updateProjectRecipient(projectId: number, recipientId: number, data: Partial<Pick<InsertProjectRecipient, 'name' | 'email' | 'phone' | 'role' | 'address' | 'city' | 'state' | 'zipCode'>>): Promise<ProjectRecipient>;
  removeProjectRecipient(projectId: number, recipientId: number): Promise<void>;

  // Projects
  getProjects(userId: string, filters?: { stage?: string; contactId?: number; archived?: boolean }): Promise<ProjectWithContact[]>;
  getProject(userId: string, id: number): Promise<ProjectWithDetails | undefined>;
  getProjectByContact(userId: string, contactId: number): Promise<Project | undefined>;
  getNextProjectNumber(userId: string): Promise<number>;
  createProject(userId: string, project: InsertProject): Promise<Project>;
  updateProject(userId: string, id: number, updates: Partial<InsertProject>): Promise<Project | undefined>;
  deleteProject(userId: string, id: number): Promise<void>;

  // Project Activities
  getProjectActivities(userId: string, projectId: number): Promise<ProjectActivity[]>;
  createProjectActivity(userId: string, activity: InsertProjectActivity): Promise<ProjectActivity>;
  updateProjectActivity(userId: string, id: number, content: string): Promise<ProjectActivity>;
  deleteProjectActivity(userId: string, id: number): Promise<void>;

  // Project Expenses (Job Costing - Spendings)
  getProjectExpenses(userId: string, projectId: number): Promise<ProjectExpenseWithPhotos[]>;
  getProjectExpense(userId: string, id: number): Promise<ProjectExpenseWithPhotos | undefined>;
  createProjectExpense(userId: string, expense: InsertProjectExpense): Promise<ProjectExpense>;
  updateProjectExpense(userId: string, id: number, updates: Partial<InsertProjectExpense>): Promise<ProjectExpense | undefined>;
  deleteProjectExpense(userId: string, id: number): Promise<void>;

  // Project Expense Photos
  createProjectExpensePhoto(userId: string, photo: InsertProjectExpensePhoto): Promise<ProjectExpensePhoto>;
  deleteProjectExpensePhoto(userId: string, id: number): Promise<void>;

  // Manual Labor Entries (Lite Job P&L for Core tier)
  getManualLaborEntries(userId: string, projectId: number): Promise<ManualLaborEntry[]>;
  createManualLaborEntry(userId: string, projectId: number, entry: InsertManualLaborEntry): Promise<ManualLaborEntry>;
  deleteManualLaborEntry(userId: string, id: number): Promise<void>;
  getManualLaborTotalCents(userId: string, projectId: number): Promise<number>;

  // Project Crew Assignments
  getProjectCrewAssignments(userId: string, projectId: number): Promise<CrewAssignmentWithMember[]>;
  assignCrewToProject(userId: string, assignment: InsertProjectCrewAssignment): Promise<ProjectCrewAssignment>;
  removeCrewFromProject(userId: string, id: number): Promise<void>;

  // Time Entries
  getTimeEntries(userId: string, filters?: { projectId?: number; teamMemberId?: number }): Promise<TimeEntryWithMember[]>;
  getActiveTimeEntry(userId: string, teamMemberId: number): Promise<TimeEntry | undefined>;
  createTimeEntry(userId: string, entry: InsertTimeEntry): Promise<TimeEntry>;
  updateTimeEntry(userId: string, id: number, updates: Partial<InsertTimeEntry>): Promise<TimeEntry | undefined>;
  deleteTimeEntry(userId: string, id: number): Promise<void>;

  // Scheduled Automations
  createScheduledAutomation(data: InsertScheduledAutomation): Promise<ScheduledAutomation>;
  getDueAutomations(): Promise<ScheduledAutomation[]>;
  markAutomationSent(id: number): Promise<void>;
  markAutomationFailed(id: number, error: string): Promise<void>;
  rescheduleAutomation(id: number, scheduledFor: Date): Promise<void>;
  cancelAutomations(userId: string, filters: { contactId?: number; documentId?: number; projectId?: number; category?: string }): Promise<ScheduledAutomation[]>;
  getAutomationsForContact(userId: string, contactId: number): Promise<ScheduledAutomation[]>;
  getSentAutomationSlugs(userId: string, projectId: number, category: string): Promise<string[]>;
  getNextScheduledAutomation(userId: string, projectId: number): Promise<ScheduledAutomation | null>;

  // Scheduled messages
  createScheduledMessage(data: InsertScheduledMessage): Promise<ScheduledMessage>;
  getScheduledMessages(userId: string): Promise<ScheduledMessage[]>;
  getDueScheduledMessages(): Promise<ScheduledMessage[]>;
  markScheduledMessageSent(id: number): Promise<void>;
  markScheduledMessageFailed(id: number, error: string): Promise<void>;
  cancelScheduledMessage(userId: string, id: number): Promise<boolean>;
  updateScheduledMessage(userId: string, id: number, updates: { scheduledAt?: Date; body?: string }): Promise<ScheduledMessage | undefined>;

  // Financial Settings
  getFinancialSettings(userId: string): Promise<FinancialSettings | undefined>;
  updateFinancialSettings(userId: string, updates: Partial<InsertFinancialSettings>): Promise<FinancialSettings>;
  getOverheadExpenses(userId: string): Promise<OverheadExpense[]>;
  createOverheadExpense(userId: string, expense: InsertOverheadExpense): Promise<OverheadExpense>;
  updateOverheadExpense(userId: string, id: number, updates: Partial<InsertOverheadExpense>): Promise<OverheadExpense | undefined>;
  deleteOverheadExpense(userId: string, id: number): Promise<void>;

  // Employee Overhead Costs
  getEmployeeOverheadCosts(userId: string): Promise<EmployeeOverheadCost[]>;
  upsertEmployeeOverheadCost(userId: string, teamMemberId: number, updates: { monthlyCost: number; frequency: string }): Promise<EmployeeOverheadCost>;

  // Materials
  getMaterials(userId: string): Promise<Material[]>;
  createMaterial(userId: string, material: InsertMaterial): Promise<Material>;
  updateMaterial(userId: string, id: number, updates: Partial<InsertMaterial>): Promise<Material | undefined>;
  deleteMaterial(userId: string, id: number): Promise<void>;

  // Surfaces
  getSurfaces(userId: string): Promise<Surface[]>;
  createSurface(userId: string, surface: InsertSurface): Promise<Surface>;
  updateSurface(userId: string, id: number, updates: Partial<InsertSurface>): Promise<Surface | undefined>;
  deleteSurface(userId: string, id: number): Promise<void>;

  // AI Message Drafts
  getAiMessageDrafts(userId: string, filters?: { contactId?: number; phoneNumber?: string; status?: string }): Promise<AiMessageDraft[]>;
  getAiMessageDraft(userId: string, id: number): Promise<AiMessageDraft | undefined>;
  createAiMessageDraft(draft: InsertAiMessageDraft): Promise<AiMessageDraft>;
  updateAiMessageDraft(userId: string, id: number, updates: { suggestedText?: string; status?: string }): Promise<AiMessageDraft | undefined>;
  getPendingDraftsForConversation(userId: string, contactId?: number, phoneNumber?: string): Promise<AiMessageDraft[]>;
  dismissPendingDraftsForConversation(userId: string, contactId?: number, phoneNumber?: string): Promise<number>;

  // AI Actions
  getAiActions(userId: string, filters?: { status?: string; limit?: number }): Promise<AiAction[]>;
  getAiActionById(userId: string, id: number): Promise<AiAction | undefined>;
  createAiAction(action: InsertAiAction): Promise<AiAction>;
  updateAiActionStatus(userId: string, id: number, status: string): Promise<void>;

  // Admin - user management
  deleteUserByEmail(email: string): Promise<boolean>;

  // GamePlan (admin-only, no userId scoping)
  getGamePlanSettings(): Promise<GamePlanSettings | undefined>;
  upsertGamePlanSettings(settings: Partial<InsertGamePlanSettings>): Promise<GamePlanSettings>;
  getGamePlanTargetCities(filters?: { market?: string; active?: boolean }): Promise<GamePlanTargetCity[]>;
  getGamePlanTargetCity(id: number): Promise<GamePlanTargetCity | undefined>;
  createGamePlanTargetCity(city: InsertGamePlanTargetCity): Promise<GamePlanTargetCity>;
  updateGamePlanTargetCity(id: number, updates: Partial<InsertGamePlanTargetCity>): Promise<GamePlanTargetCity | undefined>;
  deleteGamePlanTargetCity(id: number): Promise<void>;
  getGamePlanQueue(filters?: { status?: string; type?: string }): Promise<GamePlanQueueItem[]>;
  getGamePlanQueueItem(id: number): Promise<GamePlanQueueItem | undefined>;
  createGamePlanQueueItem(item: InsertGamePlanQueueItem): Promise<GamePlanQueueItem>;
  updateGamePlanQueueItem(id: number, updates: Partial<InsertGamePlanQueueItem>): Promise<GamePlanQueueItem | undefined>;
  deleteGamePlanQueueItem(id: number): Promise<void>;
  getGamePlanHistory(limit?: number): Promise<GamePlanHistoryEntry[]>;
  createGamePlanHistoryEntry(entry: InsertGamePlanHistoryEntry): Promise<GamePlanHistoryEntry>;
  getGamePlanCityProjects(targetCityId: number): Promise<GamePlanCityProject[]>;
  getGamePlanCityProject(id: number): Promise<GamePlanCityProject | undefined>;
  createGamePlanCityProject(project: InsertGamePlanCityProject): Promise<GamePlanCityProject>;
  updateGamePlanCityProject(id: number, updates: Partial<InsertGamePlanCityProject>): Promise<GamePlanCityProject>;
  deleteGamePlanCityProject(id: number): Promise<void>;

  // Work Order Settings
  getWorkOrderSettings(userId: string): Promise<WorkOrderSettings | undefined>;
  upsertWorkOrderSettings(userId: string, settings: Partial<InsertWorkOrderSettings>): Promise<WorkOrderSettings>;

  // Work Orders
  getWorkOrder(userId: string, projectId: number): Promise<WorkOrder | undefined>;
  getWorkOrderByDocument(userId: string, documentId: number): Promise<WorkOrder | undefined>;
  getWorkOrderByToken(token: string): Promise<WorkOrder | undefined>;
  createWorkOrder(userId: string, data: InsertWorkOrder): Promise<WorkOrder>;
  updateWorkOrder(userId: string, id: number, updates: Partial<InsertWorkOrder>): Promise<WorkOrder | undefined>;

  // Work Order Views
  getWorkOrderViews(workOrderId: number): Promise<(WorkOrderView & { teamMember: { id: number; name: string; role: string; phone: string | null } })[]>;
  recordWorkOrderView(data: InsertWorkOrderView): Promise<WorkOrderView>;

  // Work Order Sends
  getWorkOrderSends(workOrderId: number): Promise<(WorkOrderSend & { teamMember: { id: number; name: string; role: string; phone: string | null } })[]>;
  recordWorkOrderSend(data: InsertWorkOrderSend): Promise<WorkOrderSend>;

  // Help Center Tutorials (admin-managed, no userId scoping)
  getHelpTutorials(publishedOnly?: boolean): Promise<HelpTutorial[]>;
  getHelpTutorial(id: number): Promise<HelpTutorial | undefined>;
  createHelpTutorial(tutorial: InsertHelpTutorial): Promise<HelpTutorial>;
  updateHelpTutorial(id: number, updates: Partial<InsertHelpTutorial>): Promise<HelpTutorial | undefined>;
  deleteHelpTutorial(id: number): Promise<void>;

  // Company Users (multi-user / roles)
  getCompanyUsers(ownerId: string): Promise<CompanyUser[]>;
  getCompanyUser(ownerId: string, userId: string): Promise<CompanyUser | undefined>;
  addCompanyUser(data: InsertCompanyUser): Promise<CompanyUser>;
  updateCompanyUser(ownerId: string, id: number, updates: Partial<InsertCompanyUser>): Promise<CompanyUser | undefined>;
  removeCompanyUser(ownerId: string, id: number): Promise<void>;

  // Company Invitations
  createInvitation(data: InsertCompanyInvitation): Promise<CompanyInvitation>;
  getInvitation(token: string): Promise<CompanyInvitation | undefined>;
  getInvitations(ownerId: string): Promise<CompanyInvitation[]>;
  acceptInvitation(token: string, userId: string): Promise<CompanyInvitation | undefined>;
  deleteInvitation(ownerId: string, id: number): Promise<void>;

  // Team Messages
  getTeamMessages(companyOwnerId: string, channel?: string): Promise<TeamMessage[]>;
  getTeamMessagesByChannelId(channelId: number): Promise<TeamMessage[]>;
  sendTeamMessage(data: InsertTeamMessage): Promise<TeamMessage>;
  getTeamMessageUnreadCount(companyOwnerId: string, userId: string): Promise<number>;
  markTeamMessagesRead(companyOwnerId: string, userId: string, channel?: string): Promise<void>;
  markTeamMessagesReadByChannelId(channelId: number, userId: string): Promise<void>;

  // Team Channels
  createTeamChannel(data: InsertTeamChannel): Promise<TeamChannel>;
  getTeamChannels(companyOwnerId: string, userId: string): Promise<TeamChannel[]>;
  getTeamChannel(id: number): Promise<TeamChannel | undefined>;
  ensureGeneralChannel(companyOwnerId: string, memberIds: string[]): Promise<TeamChannel>;

  // Proposal Packages
  getProposalPackages(userId: string): Promise<ProposalPackage[]>;
  getProposalPackage(userId: string, id: number): Promise<ProposalPackage | undefined>;
  createProposalPackage(data: InsertProposalPackage): Promise<ProposalPackage>;
  updateProposalPackage(userId: string, id: number, updates: Partial<InsertProposalPackage>): Promise<ProposalPackage | undefined>;
  deleteProposalPackage(userId: string, id: number): Promise<void>;

  // Feature Library
  getPackageFeatures(userId: string): Promise<PackageFeatureLibrary[]>;
  createPackageFeature(data: InsertPackageFeatureLibrary): Promise<PackageFeatureLibrary>;
  updatePackageFeature(userId: string, id: number, updates: Partial<InsertPackageFeatureLibrary>): Promise<PackageFeatureLibrary | undefined>;
  deletePackageFeature(userId: string, id: number): Promise<void>;
  getFeatureAssignments(packageIds: number[]): Promise<PackageFeatureAssignment[]>;
  setFeatureAssignments(packageId: number, featureIds: { featureId: number; included: boolean; sortOrder: number }[]): Promise<void>;

  // Crew Receipt Submissions
  getCrewReceiptSubmissions(filters: { projectId: number; userId?: string; ownerId?: string; status?: string }): Promise<CrewReceiptSubmission[]>;
  getCrewReceiptSubmission(id: number): Promise<CrewReceiptSubmission | undefined>;
  createCrewReceiptSubmission(data: InsertCrewReceiptSubmission): Promise<CrewReceiptSubmission>;
  updateCrewReceiptSubmission(id: number, updates: Partial<InsertCrewReceiptSubmission>): Promise<CrewReceiptSubmission | undefined>;

  // Blocked Numbers
  getBlockedNumbers(userId: string): Promise<BlockedNumber[]>;
  getBlockedNumber(userId: string, phoneNumber: string): Promise<BlockedNumber | undefined>;
  createBlockedNumber(data: InsertBlockedNumber): Promise<BlockedNumber>;
  deleteBlockedNumber(userId: string, id: number): Promise<void>;
  isNumberBlocked(userId: string, phoneNumber: string): Promise<boolean>;

}

export class DatabaseStorage implements IStorage {
  // Contacts
  async getContacts(userId: string, filters?: { type?: string; archived?: boolean }): Promise<Contact[]> {
    const conditions = [eq(contacts.userId, userId)];
    if (filters?.type) {
      conditions.push(eq(contacts.type, filters.type));
    }
    if (filters?.archived !== undefined) {
      conditions.push(eq(contacts.archived, filters.archived));
    }
    return await db.select().from(contacts).where(and(...conditions)).orderBy(desc(contacts.createdAt));
  }

  async getContact(userId: string, id: number): Promise<Contact | undefined> {
    const [contact] = await db.select().from(contacts).where(and(eq(contacts.id, id), eq(contacts.userId, userId)));
    return contact;
  }

  async getContactByPhone(userId: string, phone: string): Promise<Contact | undefined> {
    const normalized = phone.replace(/\D/g, '');
    const userContacts = await db.select().from(contacts).where(eq(contacts.userId, userId));
    return userContacts.find(c => c.phone.replace(/\D/g, '').endsWith(normalized.slice(-10)));
  }

  async getContactByEmail(userId: string, email: string): Promise<Contact | undefined> {
    const [contact] = await db.select().from(contacts)
      .where(and(eq(contacts.userId, userId), eq(contacts.email, email)))
      .limit(1);
    return contact;
  }

  async createContact(userId: string, contact: InsertContact): Promise<Contact> {
    const [newContact] = await db.insert(contacts).values({ ...contact, userId }).returning();
    return newContact;
  }

  async updateContact(userId: string, id: number, updates: Partial<InsertContact>): Promise<Contact | undefined> {
    const [updatedContact] = await db
      .update(contacts)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(contacts.id, id), eq(contacts.userId, userId)))
      .returning();
    return updatedContact;
  }

  async deleteContact(userId: string, id: number): Promise<void> {
    await db.delete(contacts).where(and(eq(contacts.id, id), eq(contacts.userId, userId)));
  }

  // Documents
  async getDocuments(userId: string, filters?: { contactId?: number; type?: string }): Promise<(Document & { contact: Contact })[]> {
    const results = await db.select({
      id: documents.id,
      userId: documents.userId,
      publicToken: documents.publicToken,
      contactId: documents.contactId,
      projectId: documents.projectId,
      type: documents.type,
      status: documents.status,
      title: documents.title,
      content: documents.content,
      totalAmount: documents.totalAmount,
      jobAddress: documents.jobAddress,
      jobCity: documents.jobCity,
      jobState: documents.jobState,
      jobZipCode: documents.jobZipCode,
      jobAddressSameAsBilling: documents.jobAddressSameAsBilling,
      signature: documents.signature,
      signedAt: documents.signedAt,
      linkedInvoiceId: documents.linkedInvoiceId,
      sourceDocumentId: documents.sourceDocumentId,
      firstViewedAt: documents.firstViewedAt,
      lastViewedAt: documents.lastViewedAt,
      viewCount: documents.viewCount,
      requestedPaymentAmount: documents.requestedPaymentAmount,
      documentNumber: documents.documentNumber,
      companyCamProjectId: documents.companyCamProjectId,
      companyCamProjectName: documents.companyCamProjectName,
      archived: documents.archived,
      allowClientColorSubmission: documents.allowClientColorSubmission,
      colorSubmissionStatus: documents.colorSubmissionStatus,
      createdAt: documents.createdAt,
      updatedAt: documents.updatedAt,
      contact: contacts
    })
      .from(documents)
      .innerJoin(contacts, eq(documents.contactId, contacts.id))
      .where(eq(documents.userId, userId))
      .orderBy(desc(documents.createdAt));

    let filtered = results;
    if (filters?.type) {
      filtered = filtered.filter(d => d.type === filters.type);
    }
    if (filters?.contactId) {
      filtered = filtered.filter(d => d.contactId === filters.contactId);
    }
    return filtered;
  }

  async getDocument(userId: string, id: number): Promise<(Document & { contact: Contact }) | undefined> {
    const [doc] = await db.select({
      id: documents.id,
      userId: documents.userId,
      publicToken: documents.publicToken,
      contactId: documents.contactId,
      projectId: documents.projectId,
      type: documents.type,
      status: documents.status,
      title: documents.title,
      content: documents.content,
      totalAmount: documents.totalAmount,
      jobAddress: documents.jobAddress,
      jobCity: documents.jobCity,
      jobState: documents.jobState,
      jobZipCode: documents.jobZipCode,
      jobAddressSameAsBilling: documents.jobAddressSameAsBilling,
      signature: documents.signature,
      signedAt: documents.signedAt,
      linkedInvoiceId: documents.linkedInvoiceId,
      sourceDocumentId: documents.sourceDocumentId,
      firstViewedAt: documents.firstViewedAt,
      lastViewedAt: documents.lastViewedAt,
      viewCount: documents.viewCount,
      requestedPaymentAmount: documents.requestedPaymentAmount,
      archived: documents.archived,
      allowClientColorSubmission: documents.allowClientColorSubmission,
      colorSubmissionStatus: documents.colorSubmissionStatus,
      publishedContent: documents.publishedContent,
      publishedTotalAmount: documents.publishedTotalAmount,
      publishedAt: documents.publishedAt,
      createdAt: documents.createdAt,
      updatedAt: documents.updatedAt,
      contact: contacts
    })
      .from(documents)
      .innerJoin(contacts, eq(documents.contactId, contacts.id))
      .where(and(eq(documents.id, id), eq(documents.userId, userId)));
    return doc;
  }

  async getDocumentByToken(token: string): Promise<(Document & { contact: Contact }) | undefined> {
    const [doc] = await db.select({
      id: documents.id,
      userId: documents.userId,
      publicToken: documents.publicToken,
      contactId: documents.contactId,
      projectId: documents.projectId,
      type: documents.type,
      status: documents.status,
      title: documents.title,
      content: documents.content,
      totalAmount: documents.totalAmount,
      jobAddress: documents.jobAddress,
      jobCity: documents.jobCity,
      jobState: documents.jobState,
      jobZipCode: documents.jobZipCode,
      jobAddressSameAsBilling: documents.jobAddressSameAsBilling,
      signature: documents.signature,
      signedAt: documents.signedAt,
      linkedInvoiceId: documents.linkedInvoiceId,
      sourceDocumentId: documents.sourceDocumentId,
      firstViewedAt: documents.firstViewedAt,
      lastViewedAt: documents.lastViewedAt,
      viewCount: documents.viewCount,
      requestedPaymentAmount: documents.requestedPaymentAmount,
      archived: documents.archived,
      allowClientColorSubmission: documents.allowClientColorSubmission,
      colorSubmissionStatus: documents.colorSubmissionStatus,
      publishedContent: documents.publishedContent,
      publishedTotalAmount: documents.publishedTotalAmount,
      publishedAt: documents.publishedAt,
      createdAt: documents.createdAt,
      updatedAt: documents.updatedAt,
      contact: contacts
    })
      .from(documents)
      .innerJoin(contacts, eq(documents.contactId, contacts.id))
      .where(eq(documents.publicToken, token));
    return doc;
  }

  async getDocumentBySlugAndId(companySlug: string, docId: number): Promise<(Document & { contact: Contact }) | undefined> {
    const settings = await this.getCompanySettingsBySlug(companySlug);
    if (!settings) return undefined;
    
    const [doc] = await db.select({
      id: documents.id,
      userId: documents.userId,
      publicToken: documents.publicToken,
      contactId: documents.contactId,
      projectId: documents.projectId,
      type: documents.type,
      status: documents.status,
      title: documents.title,
      content: documents.content,
      totalAmount: documents.totalAmount,
      jobAddress: documents.jobAddress,
      jobCity: documents.jobCity,
      jobState: documents.jobState,
      jobZipCode: documents.jobZipCode,
      jobAddressSameAsBilling: documents.jobAddressSameAsBilling,
      signature: documents.signature,
      signedAt: documents.signedAt,
      linkedInvoiceId: documents.linkedInvoiceId,
      sourceDocumentId: documents.sourceDocumentId,
      firstViewedAt: documents.firstViewedAt,
      lastViewedAt: documents.lastViewedAt,
      viewCount: documents.viewCount,
      requestedPaymentAmount: documents.requestedPaymentAmount,
      archived: documents.archived,
      allowClientColorSubmission: documents.allowClientColorSubmission,
      colorSubmissionStatus: documents.colorSubmissionStatus,
      publishedContent: documents.publishedContent,
      publishedTotalAmount: documents.publishedTotalAmount,
      publishedAt: documents.publishedAt,
      createdAt: documents.createdAt,
      updatedAt: documents.updatedAt,
      contact: contacts
    })
      .from(documents)
      .innerJoin(contacts, eq(documents.contactId, contacts.id))
      .where(and(eq(documents.userId, settings.userId), eq(documents.id, docId)));
    return doc;
  }

  async trackDocumentView(id: number, ipAddress?: string, userAgent?: string, skipCount?: boolean): Promise<{ counted: boolean }> {
    const now = new Date();
    const [doc] = await db.select({ 
      firstViewedAt: documents.firstViewedAt, 
      viewCount: documents.viewCount,
      status: documents.status 
    })
      .from(documents)
      .where(eq(documents.id, id));
    
    if (!doc) return { counted: false };

    if (skipCount) {
      await db.insert(documentViews).values({
        documentId: id,
        ipAddress: ipAddress || null,
        userAgent: userAgent || null
      });
      return { counted: false };
    }

    if (ipAddress && ipAddress !== 'unknown') {
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
      const [recentView] = await db.select({ id: documentViews.id })
        .from(documentViews)
        .where(
          and(
            eq(documentViews.documentId, id),
            eq(documentViews.ipAddress, ipAddress),
            gte(documentViews.viewedAt, fiveMinutesAgo)
          )
        )
        .limit(1);

      if (recentView) {
        await db.insert(documentViews).values({
          documentId: id,
          ipAddress: ipAddress || null,
          userAgent: userAgent || null
        });
        return { counted: false };
      }
    }

    const updates: any = {
      lastViewedAt: now,
      viewCount: (doc.viewCount || 0) + 1
    };
    if (!['accepted', 'paid'].includes(doc.status)) {
      updates.status = 'viewed';
    }
    if (!doc.firstViewedAt) {
      updates.firstViewedAt = now;
    }
    await db.update(documents).set(updates).where(eq(documents.id, id));
    
    await db.insert(documentViews).values({
      documentId: id,
      ipAddress: ipAddress || null,
      userAgent: userAgent || null
    });

    return { counted: true };
  }

  async getDocumentViews(documentId: number): Promise<DocumentView[]> {
    return await db.select()
      .from(documentViews)
      .where(eq(documentViews.documentId, documentId))
      .orderBy(desc(documentViews.viewedAt));
  }

  async getNextDocumentNumber(userId: string): Promise<number> {
    const result = await db.select({ maxNum: sql<number>`COALESCE(MAX(${documents.documentNumber}), 249)` }).from(documents).where(eq(documents.userId, userId));
    return (result[0]?.maxNum ?? 249) + 1;
  }

  async createDocument(userId: string, doc: InsertDocument): Promise<Document> {
    const documentNumber = await this.getNextDocumentNumber(userId);
    const docWithToken = {
      ...doc,
      userId,
      documentNumber,
      publicToken: generatePublicToken()
    };
    const [newDoc] = await db.insert(documents).values(docWithToken as any).returning();
    return newDoc;
  }

  async updateDocument(userId: string, id: number, updates: Partial<InsertDocument> & { signedAt?: Date | null, linkedInvoiceId?: number | null }): Promise<Document | undefined> {
    const [updatedDoc] = await db
      .update(documents)
      .set({ ...updates, updatedAt: new Date() } as any)
      .where(and(eq(documents.id, id), eq(documents.userId, userId)))
      .returning();
    return updatedDoc;
  }

  async deleteDocument(userId: string, id: number): Promise<void> {
    await db.delete(documentViews).where(eq(documentViews.documentId, id));
    await db.delete(payments).where(eq(payments.documentId, id));
    await db.delete(documents).where(and(eq(documents.id, id), eq(documents.userId, userId)));
  }

  async getChangeOrdersBySourceDocument(userId: string, sourceDocumentId: number): Promise<Document[]> {
    return await db.select()
      .from(documents)
      .where(and(
        eq(documents.userId, userId),
        eq(documents.sourceDocumentId, sourceDocumentId),
        eq(documents.type, 'change_order')
      ))
      .orderBy(desc(documents.createdAt));
  }

  // Dashboard
  async getDashboardStats(userId: string) {
    const allContacts = await db.select().from(contacts).where(eq(contacts.userId, userId));
    const allDocs = await db.select().from(documents).where(eq(documents.userId, userId));
    const allJobs = await db.select().from(jobs).where(eq(jobs.userId, userId));
    const allComms = await db.select().from(communications).where(eq(communications.userId, userId));
    const allAppointments = await db.select().from(appointments).where(eq(appointments.userId, userId));
    const allPayments = await db.select().from(payments).where(eq(payments.userId, userId));

    // Contact metrics
    const totalLeads = allContacts.filter(c => c.type === 'lead').length;
    const totalContacts = allContacts.length; // Total of all contacts (leads + clients + others)
    const totalClients = allContacts.filter(c => c.type === 'client').length;

    // Document metrics
    const activeProposals = allDocs.filter(d => d.type === 'proposal' && ['sent', 'viewed'].includes(d.status)).length;
    const pendingEstimates = allDocs.filter(d => d.type === 'estimate' && ['sent', 'viewed'].includes(d.status)).length;
    const pendingChangeOrders = allDocs.filter(d => d.type === 'change_order' && ['sent', 'viewed'].includes(d.status)).length;
    // Include 'accepted' so auto-created (proposal-signed) invoices still count as pending until paid.
    const pendingInvoices = allDocs.filter(d => d.type === 'invoice' && (d.status === 'sent' || d.status === 'created' || d.status === 'accepted'));
    const pendingInvoicesCount = pendingInvoices.length;
    const pendingInvoicesAmount = pendingInvoices.reduce((sum, doc) => sum + doc.totalAmount, 0);

    // Jobs metrics
    const activeJobs = allJobs.filter(j => j.stage === 'in_progress').length;
    const scheduledJobs = allJobs.filter(j => j.stage === 'scheduled').length;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const completedJobsThisMonth = allJobs.filter(j => {
      if (j.stage !== 'completed') return false;
      const createdAt = j.createdAt ? new Date(j.createdAt) : null;
      return createdAt && createdAt >= startOfMonth;
    }).length;

    // Communication metrics
    const unreadMessages = allComms.filter(c => !c.isRead && c.type === 'sms' && c.direction === 'inbound').length;
    const missedCalls = allComms.filter(c => !c.isRead && c.type === 'call' && c.direction === 'inbound').length;

    // Upcoming appointments (next 7 days)
    const today = new Date();
    const weekFromNow = new Date();
    weekFromNow.setDate(today.getDate() + 7);
    const todayStr = today.toISOString().split('T')[0];
    const weekFromNowStr = weekFromNow.toISOString().split('T')[0];
    
    const upcomingAppointmentsList = allAppointments.filter(a => {
      if (a.status !== 'scheduled') return false;
      return a.date >= todayStr && a.date <= weekFromNowStr;
    });

    // Revenue metrics (from paid invoices)
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const monthlyRevenue = allPayments.filter(p => {
      const paymentDate = p.paymentDate ? new Date(p.paymentDate) : null;
      return paymentDate && paymentDate >= startOfMonth;
    }).reduce((sum, p) => sum + p.amount, 0);

    const yearlyRevenue = allPayments.filter(p => {
      const paymentDate = p.paymentDate ? new Date(p.paymentDate) : null;
      return paymentDate && paymentDate >= startOfYear;
    }).reduce((sum, p) => sum + p.amount, 0);

    // Recent leads (last 5)
    const recentLeads = allContacts
      .filter(c => c.type === 'lead')
      .sort((a, b) => {
        const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bDate - aDate;
      })
      .slice(0, 5);

    // Upcoming appointments with contacts
    const upcomingAppointments = upcomingAppointmentsList
      .sort((a, b) => {
        const aDateTime = `${a.date} ${a.time || '00:00'}`;
        const bDateTime = `${b.date} ${b.time || '00:00'}`;
        return aDateTime.localeCompare(bDateTime);
      })
      .slice(0, 5)
      .map(apt => {
        const contact = allContacts.find(c => c.id === apt.contactId);
        return { ...apt, contact: contact! };
      })
      .filter(apt => apt.contact);

    // Active jobs with contacts
    const activeJobsList = allJobs
      .filter(j => j.stage === 'in_progress' || j.stage === 'scheduled')
      .sort((a, b) => {
        const aDate = a.scheduledDate || '';
        const bDate = b.scheduledDate || '';
        return aDate.localeCompare(bDate);
      })
      .slice(0, 5)
      .map(job => {
        const contact = allContacts.find(c => c.id === job.contactId);
        return { ...job, contact: contact! };
      })
      .filter(job => job.contact);

    // Unread communications with contacts
    const unreadCommunications = allComms
      .filter(c => !c.isRead && c.direction === 'inbound')
      .sort((a, b) => {
        const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, 5)
      .map(comm => {
        const contact = allContacts.find(c => c.id === comm.contactId);
        return { ...comm, contact: contact! };
      })
      .filter(comm => comm.contact);

    // Recently accepted proposals (signed in last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentlyAcceptedProposals = allDocs
      .filter(d => (d.type === 'proposal' || d.type === 'estimate') && d.status === 'accepted')
      .filter(d => {
        const signedAt = d.signedAt ? new Date(d.signedAt) : null;
        return signedAt && signedAt >= sevenDaysAgo;
      })
      .sort((a, b) => {
        const aDate = a.signedAt ? new Date(a.signedAt).getTime() : 0;
        const bDate = b.signedAt ? new Date(b.signedAt).getTime() : 0;
        return bDate - aDate;
      })
      .slice(0, 5)
      .map(doc => {
        const contact = allContacts.find(c => c.id === doc.contactId);
        return { ...doc, contact: contact! };
      })
      .filter(doc => doc.contact);

    // Recently contacted leads (contacted in last 7 days)
    const recentlyContactedLeads = allContacts
      .filter(c => c.type === 'lead' && c.status === 'contacted')
      .filter(c => {
        const updatedAt = c.updatedAt ? new Date(c.updatedAt) : null;
        return updatedAt && updatedAt >= sevenDaysAgo;
      })
      .sort((a, b) => {
        const aDate = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const bDate = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return bDate - aDate;
      })
      .slice(0, 5);

    return {
      // Contact metrics
      totalLeads,
      totalContacts,
      totalClients,
      // Document metrics
      activeProposals,
      pendingEstimates,
      pendingChangeOrders,
      pendingInvoicesCount,
      pendingInvoicesAmount,
      // Jobs metrics
      activeJobs,
      scheduledJobs,
      completedJobsThisMonth,
      // Communication metrics
      unreadMessages,
      missedCalls,
      // Appointments
      upcomingAppointmentsCount: upcomingAppointmentsList.length,
      // Revenue metrics
      monthlyRevenue,
      yearlyRevenue,
      // Recent data for display
      recentLeads,
      upcomingAppointments,
      activeJobsList,
      unreadCommunications,
      recentlyAcceptedProposals,
      recentlyContactedLeads
    };
  }

  async getDashboardPipeline(userId: string) {
    const allProjects = await db.select().from(projects)
      .where(and(eq(projects.userId, userId), eq(projects.archived, false)))
      .orderBy(desc(projects.updatedAt));

    const allContacts = await db.select().from(contacts).where(eq(contacts.userId, userId));
    const contactMap = new Map(allContacts.map(c => [c.id, c]));

    const allDocs = await db.select().from(documents).where(eq(documents.userId, userId));
    const allPayments = await db.select().from(payments).where(eq(payments.userId, userId));

    const docProjectMap = new Map<number, number>();
    for (const d of allDocs) {
      if (d.projectId) docProjectMap.set(d.id, d.projectId);
    }
    const projectPaidMap = new Map<number, number>();
    for (const p of allPayments) {
      const projId = docProjectMap.get(p.documentId);
      if (projId) {
        projectPaidMap.set(projId, (projectPaidMap.get(projId) || 0) + p.amount);
      }
    }

    const projectsWithContacts = allProjects
      .filter(p => contactMap.has(p.contactId))
      .map(p => ({
        ...p,
        contact: contactMap.get(p.contactId)!,
        totalPaid: projectPaidMap.get(p.id) || 0,
      }));
    const allComms = await db.select().from(communications).where(eq(communications.userId, userId));

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const newLeadsThisWeek = allProjects.filter(p => {
      const created = p.createdAt ? new Date(p.createdAt) : null;
      return p.stage === 'new_lead' && created && created >= oneWeekAgo;
    }).length;

    const proposalsPending = allDocs.filter(d =>
      (d.type === 'proposal' || d.type === 'estimate') &&
      ['sent', 'viewed'].includes(d.status)
    ).length;

    const activeJobsCount = allProjects.filter(p =>
      ['scheduled', 'in_progress'].includes(p.stage)
    ).length;

    const monthlyRevenue = allPayments.filter(p => {
      const paymentDate = p.paymentDate ? new Date(p.paymentDate) : null;
      return paymentDate && paymentDate >= startOfMonth;
    }).reduce((sum, p) => sum + p.amount, 0);

    const yearlyRevenue = allPayments.filter(p => {
      const paymentDate = p.paymentDate ? new Date(p.paymentDate) : null;
      return paymentDate && paymentDate >= startOfYear;
    }).reduce((sum, p) => sum + p.amount, 0);

    const invoicePaymentsMap: Record<number, number> = {};
    for (const p of allPayments) {
      invoicePaymentsMap[p.documentId] = (invoicePaymentsMap[p.documentId] || 0) + p.amount;
    }
    const outstandingInvoices = allDocs
      .filter(d => d.type === 'invoice' && d.status !== 'paid' && d.status !== 'draft' && d.status !== 'cancelled')
      .map(d => ({
        id: d.id,
        remaining: Math.max(0, d.totalAmount - (invoicePaymentsMap[d.id] || 0)),
      }))
      .filter(d => d.remaining > 0);
    const pendingInvoicesAmount = outstandingInvoices.reduce((sum, d) => sum + d.remaining, 0);
    const pendingInvoicesCount = outstandingInvoices.length;

    const unreadMessages = allComms.filter(c => !c.isRead && c.type === 'sms' && c.direction === 'inbound').length;
    const missedCalls = allComms.filter(c => !c.isRead && c.type === 'call' && c.direction === 'inbound').length;

    return {
      projects: projectsWithContacts,
      stats: {
        newLeadsThisWeek,
        proposalsPending,
        activeJobsCount,
        monthlyRevenue,
        yearlyRevenue,
        pendingInvoicesAmount,
        pendingInvoicesCount,
        unreadMessages,
        missedCalls,
      },
    };
  }

  // Company Settings - per user
  async getCompanySettings(userId: string): Promise<CompanySettings | undefined> {
    const [settings] = await db.select().from(companySettings).where(eq(companySettings.userId, userId)).limit(1);
    return settings;
  }

  async getCompanySettingsByBookingToken(bookingToken: string): Promise<CompanySettings | undefined> {
    if (!bookingToken) return undefined;
    const [settings] = await db.select().from(companySettings).where(eq(companySettings.bookingToken, bookingToken)).limit(1);
    return settings;
  }

  async getCompanySettingsByTwilioPhone(normalizedPhone: string): Promise<CompanySettings | undefined> {
    const allSettings = await db.select().from(companySettings);
    return allSettings.find(s => 
      s.twilioPhoneNumber && s.twilioPhoneNumber.replace(/\D/g, '').slice(-10) === normalizedPhone
    );
  }

  async getCompanySettingsByOpenPhone(phone: string): Promise<CompanySettings | undefined> {
    const normalizedPhone = phone.replace(/\D/g, '').slice(-10);
    const allSettings = await db.select().from(companySettings);
    return allSettings.find(s =>
      s.phoneProvider === 'openphone' &&
      s.openphonePhoneNumber &&
      s.openphonePhoneNumber.replace(/\D/g, '').slice(-10) === normalizedPhone
    );
  }

  async getCompanySettingsByWebhookToken(tokenColumn: 'thumbtackWebhookToken' | 'zapierWebhookToken' | 'facebookWebhookToken', token: string): Promise<CompanySettings | undefined> {
    if (!token) return undefined;
    const colMap = {
      thumbtackWebhookToken: companySettings.thumbtackWebhookToken,
      zapierWebhookToken: companySettings.zapierWebhookToken,
      facebookWebhookToken: companySettings.facebookWebhookToken,
    };
    const col = colMap[tokenColumn];
    const [settings] = await db.select().from(companySettings).where(eq(col, token)).limit(1);
    return settings;
  }

  async getCompanySettingsBySlug(slug: string): Promise<CompanySettings | undefined> {
    if (!slug) return undefined;
    const [settings] = await db.select().from(companySettings).where(eq(companySettings.bookingSlug, slug)).limit(1);
    return settings;
  }

  async isSlugAvailable(slug: string, excludeUserId?: string): Promise<boolean> {
    if (!slug) return false;
    const conditions = [eq(companySettings.bookingSlug, slug)];
    if (excludeUserId) {
      conditions.push(sql`${companySettings.userId} != ${excludeUserId}` as any);
    }
    const [existing] = await db.select({ id: companySettings.id }).from(companySettings).where(and(...conditions)).limit(1);
    return !existing;
  }

  async updateCompanySettings(userId: string, updates: Partial<InsertCompanySettings>): Promise<CompanySettings> {
    const existing = await this.getCompanySettings(userId);
    if (existing) {
      const [updated] = await db
        .update(companySettings)
        .set({ ...updates, updatedAt: new Date() } as any)
        .where(eq(companySettings.userId, userId))
        .returning();
      return updated;
    } else {
      // Generate booking token for new company settings
      const bookingToken = generatePublicToken();
      const [newSettings] = await db
        .insert(companySettings)
        .values({ companyName: 'My Company', bookingToken, ...updates, userId } as any)
        .returning();
      return newSettings;
    }
  }

  // Communications
  async getCommunicationByMessageSid(messageSid: string): Promise<Communication | undefined> {
    const [comm] = await db.select().from(communications).where(eq(communications.messageSid, messageSid)).limit(1);
    return comm;
  }

  async createCommunication(userId: string, comm: InsertCommunication): Promise<Communication> {
    if (comm.messageSid) {
      const existing = await this.getCommunicationByMessageSid(comm.messageSid);
      if (existing) return existing;
    }
    const [newComm] = await db.insert(communications).values({ ...comm, userId }).returning();
    return newComm;
  }

  async getCommunications(userId: string, contactId?: number): Promise<Communication[]> {
    const conditions = [eq(communications.userId, userId)];
    if (contactId) {
      conditions.push(eq(communications.contactId, contactId));
      // NOTE: We deliberately do NOT filter out project-tagged messages
      // here. The contact thread is the user's complete history with
      // that person — every text/call should appear, regardless of
      // whether it was sent in a project context. The project-thread
      // endpoint (/api/communications/project-thread/:projectId) still
      // returns the project-scoped view when needed.
    }
    return await db.select().from(communications).where(and(...conditions)).orderBy(desc(communications.timestamp));
  }

  async getUnreadCounts(userId: string): Promise<{ unreadMessages: number; missedCalls: number; newLeads: number; newProjects: number; newBookingRequests: number; unreadTeamMessages: number }> {
    const unreadMessages = await db.select().from(communications)
      .where(and(
        eq(communications.userId, userId),
        eq(communications.type, 'sms'),
        eq(communications.direction, 'inbound'),
        eq(communications.isRead, false)
      ));
    
    const missedCalls = await db.select().from(communications)
      .where(and(
        eq(communications.userId, userId),
        eq(communications.type, 'call'),
        eq(communications.direction, 'inbound'),
        eq(communications.isRead, false)
      ));

    const settings = await db.select().from(companySettings).where(eq(companySettings.userId, userId)).limit(1);
    const lastSeenLeads = settings[0]?.lastSeenLeadsAt;
    const lastSeenProjects = settings[0]?.lastSeenProjectsAt;
    const lastSeenCalendar = settings[0]?.lastSeenCalendarAt;

    const leadConditions = [
      eq(contacts.userId, userId),
      eq(contacts.type, 'lead'),
    ];
    if (lastSeenLeads) leadConditions.push(gt(contacts.createdAt, lastSeenLeads));
    const newLeadsResult = await db.select({ count: sql<number>`count(*)` }).from(contacts)
      .where(and(...leadConditions));

    const projectConditions = [
      eq(projects.userId, userId),
    ];
    if (lastSeenProjects) projectConditions.push(gt(projects.createdAt, lastSeenProjects));
    const newProjectsResult = await db.select({ count: sql<number>`count(*)` }).from(projects)
      .where(and(...projectConditions));

    const bookingConditions = [
      eq(bookingRequests.userId, userId),
      eq(bookingRequests.status, 'new'),
    ];
    if (lastSeenCalendar) bookingConditions.push(gt(bookingRequests.createdAt, lastSeenCalendar));
    const newBookingResult = await db.select({ count: sql<number>`count(*)` }).from(bookingRequests)
      .where(and(...bookingConditions));
    
    let unreadTeamCount = 0;
    try {
      const [membership] = await db.select().from(companyUsers).where(eq(companyUsers.userId, userId));
      const companyOwnerId = membership ? membership.ownerId : userId;

      const teamUnread = await db.select({ count: sql<number>`count(*)` })
        .from(teamMessages)
        .where(and(
          eq(teamMessages.companyOwnerId, companyOwnerId),
          sql`${teamMessages.senderId} != ${userId}`,
          sql`NOT EXISTS (SELECT 1 FROM team_message_reads WHERE team_message_reads.message_id = ${teamMessages.id} AND team_message_reads.user_id = ${userId})`,
          sql`(
            ${teamMessages.channel} = 'general'
            OR ${teamMessages.channelId} IS NULL
            OR ${teamMessages.channelId} IN (
              SELECT id FROM team_channels WHERE ${userId} = ANY(member_ids) AND company_owner_id = ${companyOwnerId}
            )
          )`
        ));
      unreadTeamCount = Number(teamUnread[0]?.count || 0);
    } catch {}

    return {
      unreadMessages: unreadMessages.length,
      missedCalls: missedCalls.length,
      newLeads: Number(newLeadsResult[0]?.count || 0),
      newProjects: Number(newProjectsResult[0]?.count || 0),
      newBookingRequests: Number(newBookingResult[0]?.count || 0),
      unreadTeamMessages: unreadTeamCount,
    };
  }

  async markSectionSeen(userId: string, section: 'leads' | 'projects' | 'calendar'): Promise<void> {
    const now = new Date();
    const field = section === 'leads' ? 'lastSeenLeadsAt' : section === 'projects' ? 'lastSeenProjectsAt' : 'lastSeenCalendarAt';
    const existing = await db.select().from(companySettings).where(eq(companySettings.userId, userId)).limit(1);
    if (existing.length > 0) {
      await db.update(companySettings).set({ [field]: now }).where(eq(companySettings.userId, userId));
    }
  }

  async markCommunicationsAsRead(userId: string, contactId: number, type?: string): Promise<void> {
    const conditions = [
      eq(communications.userId, userId),
      eq(communications.contactId, contactId),
      eq(communications.direction, 'inbound')
    ];
    if (type) {
      conditions.push(eq(communications.type, type));
    }
    await db.update(communications).set({ isRead: true }).where(and(...conditions));
  }

  async markCommunicationsAsReadByPhone(userId: string, phoneNumber: string, type?: string): Promise<void> {
    const normalizePhone = (p: string) => p.replace(/\D/g, '').slice(-10);
    const normalized = normalizePhone(phoneNumber);
    const conditions = [
      eq(communications.userId, userId),
      eq(communications.direction, 'inbound'),
      isNull(communications.contactId),
      isNotNull(communications.phoneNumber),
      eq(communications.isRead, false)
    ];
    if (type) {
      conditions.push(eq(communications.type, type));
    }
    const unread = await db.select().from(communications).where(and(...conditions));
    for (const msg of unread) {
      if (msg.phoneNumber && normalizePhone(msg.phoneNumber) === normalized) {
        await db.update(communications).set({ isRead: true }).where(eq(communications.id, msg.id));
      }
    }
  }

  async markCommunicationsAsReadByIds(userId: string, ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    await db.update(communications)
      .set({ isRead: true })
      .where(and(
        eq(communications.userId, userId),
        inArray(communications.id, ids)
      ));
  }

  async markAllCommunicationsAsReadByType(userId: string, type: string): Promise<void> {
    await db.update(communications)
      .set({ isRead: true })
      .where(and(
        eq(communications.userId, userId),
        eq(communications.type, type),
        eq(communications.direction, 'inbound'),
        eq(communications.isRead, false)
      ));
  }

  async updateCommunication(id: number, data: { mediaUrl?: string; mediaUrls?: string[]; mediaType?: string; content?: string }): Promise<void> {
    await db.update(communications).set(data).where(eq(communications.id, id));
  }

  async linkPhoneCommunicationsToContact(userId: string, phoneNumber: string, contactId: number): Promise<void> {
    const normalizePhone = (p: string) => p.replace(/\D/g, '').slice(-10);
    const normalized = normalizePhone(phoneNumber);
    const allComms = await db.select().from(communications)
      .where(and(
        eq(communications.userId, userId),
        isNull(communications.contactId)
      ));
    for (const comm of allComms) {
      if (comm.phoneNumber && normalizePhone(comm.phoneNumber) === normalized) {
        await db.update(communications)
          .set({ contactId })
          .where(eq(communications.id, comm.id));
      }
    }
  }

  async getCommunicationsByPhone(userId: string, phoneNumber: string): Promise<Communication[]> {
    const normalizePhone = (p: string) => p.replace(/\D/g, '').slice(-10);
    const normalized = normalizePhone(phoneNumber);
    const allComms = await db.select().from(communications)
      .where(and(
        eq(communications.userId, userId),
        isNull(communications.contactId),
        isNotNull(communications.phoneNumber)
      ))
      .orderBy(desc(communications.timestamp));
    return allComms.filter(c => c.phoneNumber && normalizePhone(c.phoneNumber) === normalized);
  }

  async getUnknownNumberConversations(userId: string): Promise<{ phoneNumber: string; lastMessage: string; lastTimestamp: Date; unreadCount: number }[]> {
    const msgs = await db.select().from(communications)
      .where(and(
        eq(communications.userId, userId),
        isNull(communications.contactId),
        isNotNull(communications.phoneNumber),
        eq(communications.type, 'sms')
      ))
      .orderBy(desc(communications.timestamp));

    if (msgs.length === 0) return [];

    const uniquePhones = [...new Set(msgs.map(m => m.phoneNumber).filter(Boolean))] as string[];
    const autoLinked = new Set<string>();
    for (const phone of uniquePhones) {
      const contact = await this.getContactByPhone(userId, phone);
      if (contact) {
        await this.linkPhoneCommunicationsToContact(userId, phone, contact.id);
        autoLinked.add(phone);
      }
    }

    const grouped = new Map<string, { phoneNumber: string; lastMessage: string; lastTimestamp: Date; unreadCount: number }>();
    for (const msg of msgs) {
      if (!msg.phoneNumber || autoLinked.has(msg.phoneNumber)) continue;
      const displayPhone = msg.phoneNumber;
      if (!grouped.has(displayPhone)) {
        grouped.set(displayPhone, {
          phoneNumber: displayPhone,
          lastMessage: msg.content || '',
          lastTimestamp: msg.timestamp || new Date(),
          unreadCount: 0
        });
      }
      const entry = grouped.get(displayPhone)!;
      if (msg.direction === 'inbound' && !msg.isRead) {
        entry.unreadCount++;
      }
    }

    return Array.from(grouped.values());
  }

  // Payments
  async getPayments(userId: string, documentId: number): Promise<Payment[]> {
    return await db.select().from(payments)
      .where(and(eq(payments.userId, userId), eq(payments.documentId, documentId)))
      .orderBy(desc(payments.paymentDate));
  }

  async createPayment(userId: string, payment: InsertPayment): Promise<Payment> {
    const [newPayment] = await db.insert(payments).values({ ...payment, userId }).returning();
    return newPayment;
  }

  async deletePayment(userId: string, id: number): Promise<void> {
    await db.delete(payments).where(and(eq(payments.id, id), eq(payments.userId, userId)));
  }

  // Push Subscriptions
  async savePushSubscription(userId: string, endpoint: string, p256dh: string, auth: string): Promise<void> {
    const existing = await db.select().from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint))
      .limit(1);
    if (existing.length > 0) {
      await db.update(pushSubscriptions)
        .set({ userId, p256dh, auth })
        .where(eq(pushSubscriptions.endpoint, endpoint));
    } else {
      await db.insert(pushSubscriptions).values({ userId, endpoint, p256dh, auth });
    }
  }

  async deletePushSubscription(endpoint: string): Promise<void> {
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
  }

  async getPushSubscriptions(userId: string): Promise<{ endpoint: string; p256dh: string; auth: string }[]> {
    const subs = await db.select({
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
    }).from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId));
    return subs;
  }

  // Native Device Tokens (FCM)
  async saveDeviceToken(userId: string, token: string, platform: string, environment?: string): Promise<void> {
    const existing = await db.select().from(deviceTokens)
      .where(eq(deviceTokens.token, token));
    if (existing.length > 0) {
      await db.update(deviceTokens)
        .set({ userId, platform, environment: environment || 'production', updatedAt: new Date() })
        .where(eq(deviceTokens.token, token));
    } else {
      await db.insert(deviceTokens).values({ userId, token, platform, environment: environment || 'production' });
    }
  }

  async deleteDeviceToken(token: string): Promise<void> {
    await db.delete(deviceTokens).where(eq(deviceTokens.token, token));
  }

  async getDeviceTokens(userId: string): Promise<{ token: string; platform: string; environment: string | null }[]> {
    const tokens = await db.select({
      token: deviceTokens.token,
      platform: deviceTokens.platform,
      environment: deviceTokens.environment,
    }).from(deviceTokens)
      .where(eq(deviceTokens.userId, userId));
    return tokens;
  }

  // Templates
  async getTemplates(userId: string): Promise<Template[]> {
    return await db.select().from(templates).where(eq(templates.userId, userId));
  }

  async getTemplate(userId: string, slug: string): Promise<Template | undefined> {
    const [template] = await db.select().from(templates).where(and(eq(templates.userId, userId), eq(templates.slug, slug)));
    return template;
  }

  async upsertTemplate(userId: string, template: InsertTemplate): Promise<Template> {
    const existing = await this.getTemplate(userId, template.slug);
    if (existing) {
      const [updated] = await db
        .update(templates)
        .set({ ...template, updatedAt: new Date() })
        .where(and(eq(templates.userId, userId), eq(templates.slug, template.slug)))
        .returning();
      return updated;
    } else {
      const [newTemplate] = await db.insert(templates).values({ ...template, userId }).returning();
      return newTemplate;
    }
  }

  // Message Templates
  async getMessageTemplates(userId: string): Promise<MessageTemplate[]> {
    return await db.select().from(messageTemplates).where(eq(messageTemplates.userId, userId));
  }

  async getMessageTemplate(userId: string, slug: string): Promise<MessageTemplate | undefined> {
    const [template] = await db.select().from(messageTemplates).where(and(eq(messageTemplates.userId, userId), eq(messageTemplates.slug, slug)));
    return template;
  }

  async upsertMessageTemplate(userId: string, slug: string, data: { content: string; emailSubject?: string; emailContent?: string; isEnabled?: boolean; delayMinutes?: number | null }): Promise<MessageTemplate> {
    const existing = await this.getMessageTemplate(userId, slug);
    if (existing) {
      const updateData: any = { content: data.content, updatedAt: new Date() };
      if (data.emailSubject !== undefined) updateData.emailSubject = data.emailSubject;
      if (data.emailContent !== undefined) updateData.emailContent = data.emailContent;
      if (data.isEnabled !== undefined) updateData.isEnabled = data.isEnabled;
      if (data.delayMinutes !== undefined) updateData.delayMinutes = data.delayMinutes;
      const [updated] = await db
        .update(messageTemplates)
        .set(updateData)
        .where(and(eq(messageTemplates.userId, userId), eq(messageTemplates.slug, slug)))
        .returning();
      return updated;
    }
    throw new Error(`Message template with slug "${slug}" not found`);
  }

  async patchMessageTemplate(userId: string, slug: string, data: { isEnabled?: boolean; delayMinutes?: number | null }): Promise<MessageTemplate> {
    const existing = await this.getMessageTemplate(userId, slug);
    if (!existing) throw new Error(`Message template with slug "${slug}" not found`);
    const updateData: any = { updatedAt: new Date() };
    if (data.isEnabled !== undefined) updateData.isEnabled = data.isEnabled;
    if (data.delayMinutes !== undefined) updateData.delayMinutes = data.delayMinutes;
    const [updated] = await db
      .update(messageTemplates)
      .set(updateData)
      .where(and(eq(messageTemplates.userId, userId), eq(messageTemplates.slug, slug)))
      .returning();
    return updated;
  }

  // Proposal Templates
  async getProposalTemplates(userId: string): Promise<ProposalTemplate[]> {
    return await db.select().from(proposalTemplates).where(eq(proposalTemplates.userId, userId)).orderBy(desc(proposalTemplates.updatedAt));
  }

  async getProposalTemplate(userId: string, id: number): Promise<ProposalTemplate | undefined> {
    const [template] = await db.select().from(proposalTemplates).where(and(eq(proposalTemplates.userId, userId), eq(proposalTemplates.id, id)));
    return template;
  }

  async createProposalTemplate(userId: string, template: InsertProposalTemplate): Promise<ProposalTemplate> {
    const [newTemplate] = await db.insert(proposalTemplates).values({ ...template, userId }).returning();
    return newTemplate;
  }

  async updateProposalTemplate(userId: string, id: number, updates: Partial<InsertProposalTemplate>): Promise<ProposalTemplate | undefined> {
    const [updated] = await db
      .update(proposalTemplates)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(proposalTemplates.userId, userId), eq(proposalTemplates.id, id)))
      .returning();
    return updated;
  }

  async deleteProposalTemplate(userId: string, id: number): Promise<void> {
    await db.delete(proposalTemplates).where(and(eq(proposalTemplates.userId, userId), eq(proposalTemplates.id, id)));
  }

  // Booking Requests
  // Booking Forms
  async getBookingForms(userId: string): Promise<BookingForm[]> {
    return await db.select().from(bookingForms).where(eq(bookingForms.userId, userId)).orderBy(desc(bookingForms.createdAt));
  }

  async getBookingForm(userId: string, id: number): Promise<BookingForm | undefined> {
    const [form] = await db.select().from(bookingForms).where(and(eq(bookingForms.id, id), eq(bookingForms.userId, userId)));
    return form;
  }

  async getBookingFormBySlug(slug: string): Promise<BookingForm | undefined> {
    if (!slug) return undefined;
    const [form] = await db.select().from(bookingForms).where(eq(bookingForms.slug, slug));
    return form;
  }

  async getBookingFormByToken(token: string): Promise<BookingForm | undefined> {
    if (!token) return undefined;
    const [form] = await db.select().from(bookingForms).where(eq(bookingForms.bookingToken, token));
    return form;
  }

  async getDefaultBookingForm(userId: string): Promise<BookingForm | undefined> {
    const [form] = await db.select().from(bookingForms)
      .where(and(eq(bookingForms.userId, userId), eq(bookingForms.isDefault, true)));
    return form;
  }

  async createBookingForm(userId: string, form: InsertBookingForm): Promise<BookingForm> {
    const [newForm] = await db.insert(bookingForms).values({ ...form, userId, bookingToken: form.bookingToken || nanoid(12) }).returning();
    return newForm;
  }

  async updateBookingForm(userId: string, id: number, updates: Partial<InsertBookingForm>): Promise<BookingForm | undefined> {
    const [updated] = await db.update(bookingForms)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(bookingForms.id, id), eq(bookingForms.userId, userId)))
      .returning();
    return updated;
  }

  async deleteBookingForm(userId: string, id: number): Promise<void> {
    await db.delete(bookingForms).where(and(eq(bookingForms.id, id), eq(bookingForms.userId, userId)));
  }

  async setDefaultBookingForm(userId: string, id: number): Promise<void> {
    const [form] = await db.select().from(bookingForms).where(and(eq(bookingForms.id, id), eq(bookingForms.userId, userId)));
    if (!form) throw new Error("Booking form not found");
    await db.update(bookingForms).set({ isDefault: false }).where(eq(bookingForms.userId, userId));
    await db.update(bookingForms).set({ isDefault: true }).where(and(eq(bookingForms.id, id), eq(bookingForms.userId, userId)));
  }

  async ensureDefaultBookingForm(userId: string): Promise<BookingForm> {
    const existing = await this.getBookingForms(userId);
    if (existing.length > 0) {
      const defaultForm = existing.find(f => f.isDefault) || existing[0];
      return defaultForm;
    }
    const settings = await this.getCompanySettings(userId);
    const { DEFAULT_BOOKING_FIELDS } = await import("@shared/schema");
    const form = await this.createBookingForm(userId, {
      name: 'Default Booking Form',
      slug: settings?.bookingSlug || undefined,
      bookingToken: settings?.bookingToken || nanoid(12),
      fields: DEFAULT_BOOKING_FIELDS,
      isDefault: true,
    });
    return form;
  }

  async getBookingRequests(userId: string): Promise<BookingRequest[]> {
    return await db.select().from(bookingRequests).where(eq(bookingRequests.userId, userId)).orderBy(desc(bookingRequests.createdAt));
  }

  async getBookingRequest(userId: string, id: number): Promise<BookingRequest | undefined> {
    const [request] = await db.select().from(bookingRequests).where(and(eq(bookingRequests.id, id), eq(bookingRequests.userId, userId)));
    return request;
  }

  async createBookingRequest(userId: string, request: InsertBookingRequest): Promise<BookingRequest> {
    const [newRequest] = await db.insert(bookingRequests).values({ ...request, userId }).returning();
    return newRequest;
  }

  async updateBookingRequest(userId: string, id: number, updates: Partial<BookingRequest>): Promise<BookingRequest | undefined> {
    const [updated] = await db.update(bookingRequests)
      .set(updates)
      .where(and(eq(bookingRequests.id, id), eq(bookingRequests.userId, userId)))
      .returning();
    return updated;
  }

  async deleteBookingRequest(userId: string, id: number): Promise<void> {
    await db.delete(bookingRequests).where(and(eq(bookingRequests.id, id), eq(bookingRequests.userId, userId)));
  }

  // Appointments
  async getAppointments(userId: string, filters?: { contactId?: number }): Promise<(Appointment & { contact: Contact })[]> {
    const conditions = [eq(appointments.userId, userId)];
    if (filters?.contactId) {
      conditions.push(eq(appointments.contactId, filters.contactId));
    }
    const allAppointments = await db.select().from(appointments).where(and(...conditions)).orderBy(desc(appointments.date));
    
    const result: (Appointment & { contact: Contact })[] = [];
    for (const appt of allAppointments) {
      const contact = await this.getContact(userId, appt.contactId);
      if (contact) {
        result.push({ ...appt, contact });
      }
    }
    return result;
  }

  async getAppointment(userId: string, id: number): Promise<(Appointment & { contact: Contact }) | undefined> {
    const [appt] = await db.select().from(appointments).where(and(eq(appointments.id, id), eq(appointments.userId, userId)));
    if (!appt) return undefined;
    const contact = await this.getContact(userId, appt.contactId);
    if (!contact) return undefined;
    return { ...appt, contact };
  }

  async createAppointment(userId: string, appointment: InsertAppointment): Promise<Appointment> {
    const [newAppointment] = await db.insert(appointments).values({ ...appointment, userId }).returning();
    return newAppointment;
  }

  async updateAppointment(userId: string, id: number, updates: Partial<InsertAppointment>): Promise<Appointment | undefined> {
    const [updated] = await db.update(appointments)
      .set(updates)
      .where(and(eq(appointments.id, id), eq(appointments.userId, userId)))
      .returning();
    return updated;
  }

  async deleteAppointment(userId: string, id: number): Promise<void> {
    await db.delete(appointments).where(and(eq(appointments.id, id), eq(appointments.userId, userId)));
  }

  // Jobs
  async getJobs(userId: string, filters?: { contactId?: number; stage?: string }): Promise<JobWithDetails[]> {
    const conditions = [eq(jobs.userId, userId)];
    if (filters?.contactId) {
      conditions.push(eq(jobs.contactId, filters.contactId));
    }
    if (filters?.stage) {
      conditions.push(eq(jobs.stage, filters.stage));
    }
    const allJobs = await db.select().from(jobs).where(and(...conditions)).orderBy(desc(jobs.scheduledDate));
    
    const result: JobWithDetails[] = [];
    for (const job of allJobs) {
      const contact = await this.getContact(userId, job.contactId);
      if (contact) {
        let document: Document | null = null;
        if (job.documentId) {
          const doc = await this.getDocument(userId, job.documentId);
          document = doc || null;
        }
        result.push({ ...job, contact, document });
      }
    }
    return result;
  }

  async getJob(userId: string, id: number): Promise<JobWithDetails | undefined> {
    const [job] = await db.select().from(jobs).where(and(eq(jobs.id, id), eq(jobs.userId, userId)));
    if (!job) return undefined;
    const contact = await this.getContact(userId, job.contactId);
    if (!contact) return undefined;
    let document: Document | null = null;
    if (job.documentId) {
      const doc = await this.getDocument(userId, job.documentId);
      document = doc || null;
    }
    return { ...job, contact, document };
  }

  async createJob(userId: string, job: InsertJob): Promise<Job> {
    const [newJob] = await db.insert(jobs).values({ ...job, userId }).returning();
    return newJob;
  }

  async updateJob(userId: string, id: number, updates: Partial<InsertJob>): Promise<Job | undefined> {
    const [updated] = await db.update(jobs)
      .set(updates)
      .where(and(eq(jobs.id, id), eq(jobs.userId, userId)))
      .returning();
    return updated;
  }

  async deleteJob(userId: string, id: number): Promise<void> {
    await db.delete(jobs).where(and(eq(jobs.id, id), eq(jobs.userId, userId)));
  }

  // Team Members
  async getTeamMembers(userId: string): Promise<TeamMember[]> {
    return db.select().from(teamMembers).where(eq(teamMembers.userId, userId)).orderBy(teamMembers.name);
  }

  async getTeamMember(userId: string, id: number): Promise<TeamMember | undefined> {
    const [member] = await db.select().from(teamMembers).where(and(eq(teamMembers.id, id), eq(teamMembers.userId, userId)));
    return member;
  }

  async createTeamMember(userId: string, member: InsertTeamMember): Promise<TeamMember> {
    const [newMember] = await db.insert(teamMembers).values({ ...member, userId }).returning();
    return newMember;
  }

  async updateTeamMember(userId: string, id: number, updates: Partial<InsertTeamMember>): Promise<TeamMember | undefined> {
    const [updated] = await db.update(teamMembers)
      .set(updates)
      .where(and(eq(teamMembers.id, id), eq(teamMembers.userId, userId)))
      .returning();
    return updated;
  }

  async deleteTeamMember(userId: string, id: number): Promise<void> {
    await db.delete(teamMembers).where(and(eq(teamMembers.id, id), eq(teamMembers.userId, userId)));
  }

  // Document Recipients
  async getDocumentRecipients(documentId: number): Promise<DocumentRecipient[]> {
    return db.select().from(documentRecipients).where(eq(documentRecipients.documentId, documentId));
  }

  async addDocumentRecipient(recipient: InsertDocumentRecipient): Promise<DocumentRecipient> {
    const [newRecipient] = await db.insert(documentRecipients).values(recipient).returning();
    return newRecipient;
  }

  async updateDocumentRecipient(documentId: number, recipientId: number, data: Partial<Pick<InsertDocumentRecipient, 'name' | 'email' | 'phone'>>): Promise<DocumentRecipient> {
    const [updated] = await db.update(documentRecipients).set(data).where(and(eq(documentRecipients.id, recipientId), eq(documentRecipients.documentId, documentId))).returning();
    return updated;
  }

  async removeDocumentRecipient(documentId: number, recipientId: number): Promise<void> {
    await db.delete(documentRecipients).where(and(eq(documentRecipients.id, recipientId), eq(documentRecipients.documentId, documentId)));
  }

  async getProjectRecipients(projectId: number): Promise<ProjectRecipient[]> {
    return db.select().from(projectRecipients).where(and(eq(projectRecipients.projectId, projectId), isNull(projectRecipients.removedAt)));
  }

  async addProjectRecipient(recipient: InsertProjectRecipient): Promise<ProjectRecipient> {
    const [newRecipient] = await db.insert(projectRecipients).values(recipient).returning();
    return newRecipient;
  }

  async updateProjectRecipient(projectId: number, recipientId: number, data: Partial<Pick<InsertProjectRecipient, 'name' | 'email' | 'phone' | 'role' | 'address' | 'city' | 'state' | 'zipCode'>>): Promise<ProjectRecipient> {
    const [updated] = await db.update(projectRecipients).set(data).where(and(eq(projectRecipients.id, recipientId), eq(projectRecipients.projectId, projectId))).returning();
    return updated;
  }

  async removeProjectRecipient(projectId: number, recipientId: number): Promise<void> {
    await db.delete(projectRecipients).where(and(eq(projectRecipients.id, recipientId), eq(projectRecipients.projectId, projectId)));
  }

  // Projects
  async getProjects(userId: string, filters?: { stage?: string; contactId?: number; archived?: boolean }): Promise<ProjectWithContact[]> {
    const conditions = [eq(projects.userId, userId)];
    if (filters?.stage) {
      conditions.push(eq(projects.stage, filters.stage));
    }
    if (filters?.contactId) {
      conditions.push(eq(projects.contactId, filters.contactId));
    }
    if (filters?.archived !== undefined) {
      conditions.push(eq(projects.archived, filters.archived));
    } else {
      conditions.push(eq(projects.archived, false));
    }
    const allProjects = await db.select().from(projects).where(and(...conditions)).orderBy(desc(projects.updatedAt));
    
    const result: ProjectWithContact[] = [];
    for (const project of allProjects) {
      const contact = await this.getContact(userId, project.contactId);
      if (contact) {
        result.push({ ...project, contact });
      }
    }
    return result;
  }

  async getProject(userId: string, id: number): Promise<ProjectWithDetails | undefined> {
    const [project] = await db.select().from(projects).where(and(eq(projects.id, id), eq(projects.userId, userId)));
    if (!project) return undefined;
    const contact = await this.getContact(userId, project.contactId);
    if (!contact) return undefined;
    const activities = await this.getProjectActivities(userId, id);
    return { ...project, contact, activities };
  }

  async getProjectByContact(userId: string, contactId: number): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(and(eq(projects.userId, userId), eq(projects.contactId, contactId))).orderBy(desc(projects.createdAt)).limit(1);
    return project;
  }

  async getNextProjectNumber(userId: string): Promise<number> {
    const result = await db.select({ maxNum: sql<number>`COALESCE(MAX(${projects.projectNumber}), 4199)` }).from(projects).where(eq(projects.userId, userId));
    return (result[0]?.maxNum ?? 4199) + 1;
  }

  async createProject(userId: string, project: InsertProject): Promise<Project> {
    const projectNumber = await this.getNextProjectNumber(userId);
    const [newProject] = await db.insert(projects).values({ ...project, userId, projectNumber }).returning();
    return newProject;
  }

  async updateProject(userId: string, id: number, updates: Partial<InsertProject>): Promise<Project | undefined> {
    const setValues: any = { ...updates, updatedAt: new Date() };
    if (updates.stage) {
      const [existing] = await db.select({ stage: projects.stage }).from(projects).where(and(eq(projects.id, id), eq(projects.userId, userId)));
      if (existing && existing.stage !== updates.stage) {
        setValues.stageChangedAt = new Date();
      }
    }
    const [updated] = await db.update(projects)
      .set(setValues)
      .where(and(eq(projects.id, id), eq(projects.userId, userId)))
      .returning();
    return updated;
  }

  async deleteProject(userId: string, id: number): Promise<void> {
    await db.delete(projectActivities).where(and(eq(projectActivities.projectId, id), eq(projectActivities.userId, userId)));
    await db.delete(projects).where(and(eq(projects.id, id), eq(projects.userId, userId)));
  }

  // Project Activities
  async getProjectActivities(userId: string, projectId: number): Promise<ProjectActivity[]> {
    return await db.select().from(projectActivities).where(and(eq(projectActivities.projectId, projectId), eq(projectActivities.userId, userId))).orderBy(desc(projectActivities.createdAt));
  }

  async createProjectActivity(userId: string, activity: InsertProjectActivity): Promise<ProjectActivity> {
    const [newActivity] = await db.insert(projectActivities).values({ ...activity, userId }).returning();
    await db.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, activity.projectId));
    return newActivity;
  }

  async updateProjectActivity(userId: string, id: number, content: string): Promise<ProjectActivity> {
    const [updated] = await db.update(projectActivities)
      .set({ content })
      .where(and(eq(projectActivities.id, id), eq(projectActivities.userId, userId)))
      .returning();
    return updated;
  }

  async deleteProjectActivity(userId: string, id: number): Promise<void> {
    await db.delete(projectActivities).where(and(eq(projectActivities.id, id), eq(projectActivities.userId, userId)));
  }

  // Project Expenses (Job Costing - Spendings)
  async getProjectExpenses(userId: string, projectId: number): Promise<ProjectExpenseWithPhotos[]> {
    const expenses = await db.select().from(projectExpenses)
      .where(and(eq(projectExpenses.projectId, projectId), eq(projectExpenses.userId, userId)))
      .orderBy(desc(projectExpenses.createdAt));
    const result: ProjectExpenseWithPhotos[] = [];
    for (const expense of expenses) {
      const photos = await db.select().from(projectExpensePhotos)
        .where(eq(projectExpensePhotos.expenseId, expense.id))
        .orderBy(projectExpensePhotos.sortOrder);
      result.push({ ...expense, photos });
    }
    return result;
  }

  async getProjectExpense(userId: string, id: number): Promise<ProjectExpenseWithPhotos | undefined> {
    const [expense] = await db.select().from(projectExpenses)
      .where(and(eq(projectExpenses.id, id), eq(projectExpenses.userId, userId)));
    if (!expense) return undefined;
    const photos = await db.select().from(projectExpensePhotos)
      .where(eq(projectExpensePhotos.expenseId, expense.id))
      .orderBy(projectExpensePhotos.sortOrder);
    return { ...expense, photos };
  }

  async createProjectExpense(userId: string, expense: InsertProjectExpense): Promise<ProjectExpense> {
    const [newExpense] = await db.insert(projectExpenses).values({ ...expense, userId }).returning();
    return newExpense;
  }

  async updateProjectExpense(userId: string, id: number, updates: Partial<InsertProjectExpense>): Promise<ProjectExpense | undefined> {
    const [updated] = await db.update(projectExpenses)
      .set(updates)
      .where(and(eq(projectExpenses.id, id), eq(projectExpenses.userId, userId)))
      .returning();
    return updated;
  }

  async deleteProjectExpense(userId: string, id: number): Promise<void> {
    await db.delete(projectExpensePhotos).where(eq(projectExpensePhotos.expenseId, id));
    await db.delete(projectExpenses).where(and(eq(projectExpenses.id, id), eq(projectExpenses.userId, userId)));
  }

  // Project Expense Photos
  async createProjectExpensePhoto(userId: string, photo: InsertProjectExpensePhoto): Promise<ProjectExpensePhoto> {
    const [newPhoto] = await db.insert(projectExpensePhotos).values({ ...photo, userId }).returning();
    return newPhoto;
  }

  async deleteProjectExpensePhoto(userId: string, id: number): Promise<void> {
    await db.delete(projectExpensePhotos).where(and(eq(projectExpensePhotos.id, id), eq(projectExpensePhotos.userId, userId)));
  }

  // Manual Labor Entries (Lite Job P&L for Core tier)
  async getManualLaborEntries(userId: string, projectId: number): Promise<ManualLaborEntry[]> {
    return await db.select().from(manualLaborEntries)
      .where(and(eq(manualLaborEntries.projectId, projectId), eq(manualLaborEntries.userId, userId)))
      .orderBy(desc(manualLaborEntries.workDate), desc(manualLaborEntries.id));
  }

  async createManualLaborEntry(userId: string, projectId: number, entry: InsertManualLaborEntry): Promise<ManualLaborEntry> {
    const [created] = await db.insert(manualLaborEntries).values({
      ...entry,
      userId,
      projectId,
    }).returning();
    return created;
  }

  async deleteManualLaborEntry(userId: string, id: number): Promise<void> {
    await db.delete(manualLaborEntries).where(and(eq(manualLaborEntries.id, id), eq(manualLaborEntries.userId, userId)));
  }

  async getManualLaborTotalCents(userId: string, projectId: number): Promise<number> {
    const [row] = await db.select({ total: sql<number>`COALESCE(SUM(${manualLaborEntries.amountCents}), 0)::int` })
      .from(manualLaborEntries)
      .where(and(eq(manualLaborEntries.projectId, projectId), eq(manualLaborEntries.userId, userId)));
    return row?.total ?? 0;
  }

  // Project Crew Assignments
  async getProjectCrewAssignments(userId: string, projectId: number): Promise<CrewAssignmentWithMember[]> {
    const assignments = await db.select().from(projectCrewAssignments)
      .where(and(eq(projectCrewAssignments.projectId, projectId), eq(projectCrewAssignments.userId, userId)))
      .orderBy(projectCrewAssignments.assignedAt);
    const result: CrewAssignmentWithMember[] = [];
    for (const assignment of assignments) {
      const [member] = await db.select().from(teamMembers).where(eq(teamMembers.id, assignment.teamMemberId));
      if (member) {
        result.push({ ...assignment, teamMember: member });
      }
    }
    return result;
  }

  async assignCrewToProject(userId: string, assignment: InsertProjectCrewAssignment): Promise<ProjectCrewAssignment> {
    const [newAssignment] = await db.insert(projectCrewAssignments).values({ ...assignment, userId }).returning();
    return newAssignment;
  }

  async removeCrewFromProject(userId: string, id: number): Promise<void> {
    await db.delete(projectCrewAssignments).where(and(eq(projectCrewAssignments.id, id), eq(projectCrewAssignments.userId, userId)));
  }

  // Time Entries
  async getTimeEntries(userId: string, filters?: { projectId?: number; teamMemberId?: number }): Promise<TimeEntryWithMember[]> {
    const conditions = [eq(timeEntries.userId, userId)];
    if (filters?.projectId) conditions.push(eq(timeEntries.projectId, filters.projectId));
    if (filters?.teamMemberId) conditions.push(eq(timeEntries.teamMemberId, filters.teamMemberId));
    const entries = await db.select().from(timeEntries)
      .where(and(...conditions))
      .orderBy(desc(timeEntries.clockIn));
    const result: TimeEntryWithMember[] = [];
    for (const entry of entries) {
      // Ad-hoc one-time workers have no teamMemberId — return them with teamMember:null
      if (entry.teamMemberId == null) {
        result.push({ ...entry, teamMember: null });
        continue;
      }
      // Tenant-scope the team-member lookup so a malformed/cross-tenant
      // teamMemberId can't hydrate someone else's member into the response.
      const [member] = await db.select().from(teamMembers)
        .where(and(eq(teamMembers.id, entry.teamMemberId), eq(teamMembers.userId, userId)));
      // Even if the team member was deleted, we still want to surface the entry
      // (the locked_* fields preserve cost). Show with teamMember:null in that case.
      result.push({ ...entry, teamMember: member || null });
    }
    return result;
  }

  async getActiveTimeEntry(userId: string, teamMemberId: number): Promise<TimeEntry | undefined> {
    const [entry] = await db.select().from(timeEntries)
      .where(and(eq(timeEntries.userId, userId), eq(timeEntries.teamMemberId, teamMemberId), isNull(timeEntries.clockOut)));
    return entry;
  }

  async createTimeEntry(userId: string, entry: InsertTimeEntry): Promise<TimeEntry> {
    // Snapshot the team member's current pay rates into locked_* columns so
    // historical job-costing is preserved if the member's rates change later.
    // Ad-hoc workers (teamMemberId == null) supply their own locked_* values
    // directly in the insert payload.
    const payload: any = { ...entry, userId };
    if (entry.teamMemberId != null) {
      // Tenant-scope the lookup so callers cannot snapshot rates from (or
      // attribute time entries to) a team member that belongs to a different
      // tenant — even if a forged teamMemberId leaks past the route layer.
      const [member] = await db.select().from(teamMembers)
        .where(and(eq(teamMembers.id, entry.teamMemberId), eq(teamMembers.userId, userId)));
      if (!member) {
        throw new Error("Team member not found for this account");
      }
      if (payload.lockedHourlyRate == null) {
        payload.lockedHourlyRate = member.hourlyRate ?? null;
        payload.lockedPayrollBurden = member.payrollBurdenPercentage != null ? String(member.payrollBurdenPercentage) : null;
        payload.lockedWorkersComp = member.workersCompPercentage != null ? String(member.workersCompPercentage) : null;
        payload.lockedBenefitsPerHour = member.benefitsPerHour != null ? String(member.benefitsPerHour) : null;
      }
    }
    const [newEntry] = await db.insert(timeEntries).values(payload).returning();
    return newEntry;
  }

  async updateTimeEntry(userId: string, id: number, updates: Partial<InsertTimeEntry>): Promise<TimeEntry | undefined> {
    const [updated] = await db.update(timeEntries)
      .set(updates)
      .where(and(eq(timeEntries.id, id), eq(timeEntries.userId, userId)))
      .returning();
    return updated;
  }

  async deleteTimeEntry(userId: string, id: number): Promise<void> {
    await db.delete(timeEntries).where(and(eq(timeEntries.id, id), eq(timeEntries.userId, userId)));
  }

  // Scheduled Automations
  async createScheduledAutomation(data: InsertScheduledAutomation): Promise<ScheduledAutomation> {
    const [automation] = await db.insert(scheduledAutomations).values(data).returning();
    return automation;
  }

  async getDueAutomations(): Promise<ScheduledAutomation[]> {
    return db.select().from(scheduledAutomations)
      .where(and(
        eq(scheduledAutomations.status, 'pending'),
        sql`${scheduledAutomations.scheduledFor} <= NOW()`
      ))
      .orderBy(scheduledAutomations.scheduledFor)
      .limit(50);
  }

  async markAutomationSent(id: number): Promise<void> {
    await db.update(scheduledAutomations)
      .set({ status: 'sent', sentAt: new Date() })
      .where(eq(scheduledAutomations.id, id));
  }

  async markAutomationFailed(id: number, error: string): Promise<void> {
    await db.update(scheduledAutomations)
      .set({ status: 'failed', error })
      .where(eq(scheduledAutomations.id, id));
  }

  async rescheduleAutomation(id: number, scheduledFor: Date): Promise<void> {
    await db.update(scheduledAutomations)
      .set({ scheduledFor })
      .where(eq(scheduledAutomations.id, id));
  }

  async cancelAutomations(userId: string, filters: { contactId?: number; documentId?: number; projectId?: number; category?: string }): Promise<ScheduledAutomation[]> {
    const conditions = [eq(scheduledAutomations.userId, userId), eq(scheduledAutomations.status, 'pending')];
    if (filters.contactId) conditions.push(eq(scheduledAutomations.contactId, filters.contactId));
    if (filters.documentId) conditions.push(eq(scheduledAutomations.documentId, filters.documentId));
    if (filters.projectId) conditions.push(eq(scheduledAutomations.projectId, filters.projectId));
    if (filters.category) conditions.push(eq(scheduledAutomations.category, filters.category));
    const result = await db.update(scheduledAutomations)
      .set({ status: 'cancelled' })
      .where(and(...conditions))
      .returning();
    return result;
  }

  async getAutomationsForContact(userId: string, contactId: number): Promise<ScheduledAutomation[]> {
    return db.select().from(scheduledAutomations)
      .where(and(eq(scheduledAutomations.userId, userId), eq(scheduledAutomations.contactId, contactId)))
      .orderBy(desc(scheduledAutomations.scheduledFor));
  }

  async getSentAutomationSlugs(userId: string, projectId: number, category: string): Promise<string[]> {
    const rows = await db.select({ slug: scheduledAutomations.templateSlug })
      .from(scheduledAutomations)
      .where(and(
        eq(scheduledAutomations.userId, userId),
        eq(scheduledAutomations.projectId, projectId),
        eq(scheduledAutomations.category, category),
        inArray(scheduledAutomations.status, ['sent', 'pending'])
      ));
    return rows.map(r => r.slug);
  }

  async getNextScheduledAutomation(userId: string, projectId: number): Promise<ScheduledAutomation | null> {
    const rows = await db.select().from(scheduledAutomations)
      .where(and(
        eq(scheduledAutomations.userId, userId),
        eq(scheduledAutomations.projectId, projectId),
        eq(scheduledAutomations.status, 'pending')
      ))
      .orderBy(scheduledAutomations.scheduledFor)
      .limit(1);
    return rows[0] || null;
  }

  // Scheduled messages
  async createScheduledMessage(data: InsertScheduledMessage): Promise<ScheduledMessage> {
    const [msg] = await db.insert(scheduledMessages).values(data).returning();
    return msg;
  }

  async getScheduledMessages(userId: string): Promise<ScheduledMessage[]> {
    return db.select().from(scheduledMessages)
      .where(and(eq(scheduledMessages.userId, userId), eq(scheduledMessages.status, 'pending')))
      .orderBy(scheduledMessages.scheduledAt);
  }

  async getDueScheduledMessages(): Promise<ScheduledMessage[]> {
    return db.select().from(scheduledMessages)
      .where(and(
        eq(scheduledMessages.status, 'pending'),
        sql`${scheduledMessages.scheduledAt} <= NOW()`
      ));
  }

  async markScheduledMessageSent(id: number): Promise<void> {
    await db.update(scheduledMessages).set({ status: 'sent', sentAt: new Date() }).where(eq(scheduledMessages.id, id));
  }

  async markScheduledMessageFailed(id: number, error: string): Promise<void> {
    await db.update(scheduledMessages).set({ status: 'failed', error }).where(eq(scheduledMessages.id, id));
  }

  async cancelScheduledMessage(userId: string, id: number): Promise<boolean> {
    const result = await db.update(scheduledMessages)
      .set({ status: 'cancelled' })
      .where(and(eq(scheduledMessages.id, id), eq(scheduledMessages.userId, userId), eq(scheduledMessages.status, 'pending')))
      .returning();
    return result.length > 0;
  }

  async updateScheduledMessage(userId: string, id: number, updates: { scheduledAt?: Date; body?: string }): Promise<ScheduledMessage | undefined> {
    const setData: Record<string, any> = {};
    if (updates.scheduledAt) setData.scheduledAt = updates.scheduledAt;
    if (updates.body !== undefined) setData.body = updates.body;
    if (Object.keys(setData).length === 0) return undefined;
    const [updated] = await db.update(scheduledMessages)
      .set(setData)
      .where(and(eq(scheduledMessages.id, id), eq(scheduledMessages.userId, userId), eq(scheduledMessages.status, 'pending')))
      .returning();
    return updated;
  }

  // Financial Settings
  async getFinancialSettings(userId: string): Promise<FinancialSettings | undefined> {
    const [result] = await db.select().from(financialSettings).where(eq(financialSettings.userId, userId));
    return result;
  }

  async updateFinancialSettings(userId: string, updates: Partial<InsertFinancialSettings>): Promise<FinancialSettings> {
    const existing = await this.getFinancialSettings(userId);
    if (existing) {
      const [updated] = await db.update(financialSettings)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(financialSettings.userId, userId))
        .returning();
      return updated;
    }
    const [created] = await db.insert(financialSettings)
      .values({ userId, ...updates, updatedAt: new Date() })
      .returning();
    return created;
  }

  async getOverheadExpenses(userId: string): Promise<OverheadExpense[]> {
    return db.select().from(overheadExpenses).where(eq(overheadExpenses.userId, userId));
  }

  async createOverheadExpense(userId: string, expense: InsertOverheadExpense): Promise<OverheadExpense> {
    const [created] = await db.insert(overheadExpenses)
      .values({ ...expense, userId })
      .returning();
    return created;
  }

  async updateOverheadExpense(userId: string, id: number, updates: Partial<InsertOverheadExpense>): Promise<OverheadExpense | undefined> {
    const [updated] = await db.update(overheadExpenses)
      .set(updates)
      .where(and(eq(overheadExpenses.id, id), eq(overheadExpenses.userId, userId)))
      .returning();
    return updated;
  }

  async deleteOverheadExpense(userId: string, id: number): Promise<void> {
    await db.delete(overheadExpenses)
      .where(and(eq(overheadExpenses.id, id), eq(overheadExpenses.userId, userId)));
  }

  // Employee Overhead Costs
  async getEmployeeOverheadCosts(userId: string): Promise<EmployeeOverheadCost[]> {
    return db.select().from(employeeOverheadCosts).where(eq(employeeOverheadCosts.userId, userId));
  }

  async upsertEmployeeOverheadCost(userId: string, teamMemberId: number, updates: { monthlyCost: number; frequency: string }): Promise<EmployeeOverheadCost> {
    const [existing] = await db.select().from(employeeOverheadCosts)
      .where(and(eq(employeeOverheadCosts.userId, userId), eq(employeeOverheadCosts.teamMemberId, teamMemberId)));
    if (existing) {
      const [updated] = await db.update(employeeOverheadCosts)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(employeeOverheadCosts.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(employeeOverheadCosts)
      .values({ userId, teamMemberId, ...updates, updatedAt: new Date() })
      .returning();
    return created;
  }

  // Materials
  async getMaterials(userId: string): Promise<Material[]> {
    return await db.select().from(materials).where(eq(materials.userId, userId)).orderBy(materials.id);
  }

  async createMaterial(userId: string, material: InsertMaterial): Promise<Material> {
    const [created] = await db.insert(materials)
      .values({ ...material, userId })
      .returning();
    return created;
  }

  async updateMaterial(userId: string, id: number, updates: Partial<InsertMaterial>): Promise<Material | undefined> {
    const [updated] = await db.update(materials)
      .set(updates)
      .where(and(eq(materials.id, id), eq(materials.userId, userId)))
      .returning();
    return updated;
  }

  async deleteMaterial(userId: string, id: number): Promise<void> {
    await db.delete(materials)
      .where(and(eq(materials.id, id), eq(materials.userId, userId)));
  }

  // Surfaces
  async getSurfaces(userId: string): Promise<Surface[]> {
    return await db.select().from(surfaces).where(eq(surfaces.userId, userId)).orderBy(surfaces.id);
  }

  async createSurface(userId: string, surface: InsertSurface): Promise<Surface> {
    const [created] = await db.insert(surfaces)
      .values({ ...surface, userId })
      .returning();
    return created;
  }

  async updateSurface(userId: string, id: number, updates: Partial<InsertSurface>): Promise<Surface | undefined> {
    const [updated] = await db.update(surfaces)
      .set(updates)
      .where(and(eq(surfaces.id, id), eq(surfaces.userId, userId)))
      .returning();
    return updated;
  }

  async deleteSurface(userId: string, id: number): Promise<void> {
    await db.delete(surfaces)
      .where(and(eq(surfaces.id, id), eq(surfaces.userId, userId)));
  }

  // AI Message Drafts
  async getAiMessageDrafts(userId: string, filters?: { contactId?: number; phoneNumber?: string; status?: string }): Promise<AiMessageDraft[]> {
    const conditions = [eq(aiMessageDrafts.userId, userId)];
    if (filters?.contactId) conditions.push(eq(aiMessageDrafts.contactId, filters.contactId));
    if (filters?.phoneNumber) conditions.push(eq(aiMessageDrafts.phoneNumber, filters.phoneNumber));
    if (filters?.status) conditions.push(eq(aiMessageDrafts.status, filters.status));
    return await db.select().from(aiMessageDrafts).where(and(...conditions)).orderBy(desc(aiMessageDrafts.createdAt));
  }

  async getAiMessageDraft(userId: string, id: number): Promise<AiMessageDraft | undefined> {
    const [draft] = await db.select().from(aiMessageDrafts).where(and(eq(aiMessageDrafts.id, id), eq(aiMessageDrafts.userId, userId)));
    return draft;
  }

  async createAiMessageDraft(draft: InsertAiMessageDraft): Promise<AiMessageDraft> {
    const [created] = await db.insert(aiMessageDrafts).values(draft).returning();
    return created;
  }

  async updateAiMessageDraft(userId: string, id: number, updates: { suggestedText?: string; status?: string }): Promise<AiMessageDraft | undefined> {
    const [updated] = await db.update(aiMessageDrafts)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(aiMessageDrafts.id, id), eq(aiMessageDrafts.userId, userId)))
      .returning();
    return updated;
  }

  async getPendingDraftsForConversation(userId: string, contactId?: number, phoneNumber?: string): Promise<AiMessageDraft[]> {
    const conditions = [eq(aiMessageDrafts.userId, userId), eq(aiMessageDrafts.status, 'pending')];
    if (contactId) conditions.push(eq(aiMessageDrafts.contactId, contactId));
    else if (phoneNumber) conditions.push(eq(aiMessageDrafts.phoneNumber, phoneNumber));
    return await db.select().from(aiMessageDrafts).where(and(...conditions)).orderBy(desc(aiMessageDrafts.createdAt));
  }

  async dismissPendingDraftsForConversation(userId: string, contactId?: number, phoneNumber?: string): Promise<number> {
    const conditions = [eq(aiMessageDrafts.userId, userId), eq(aiMessageDrafts.status, 'pending')];
    if (contactId) conditions.push(eq(aiMessageDrafts.contactId, contactId));
    else if (phoneNumber) conditions.push(eq(aiMessageDrafts.phoneNumber, phoneNumber));
    const result = await db.update(aiMessageDrafts)
      .set({ status: 'auto_dismissed', updatedAt: new Date() })
      .where(and(...conditions))
      .returning();
    return result.length;
  }

  // AI Actions
  async getAiActions(userId: string, filters?: { status?: string; limit?: number }): Promise<AiAction[]> {
    const conditions = [eq(aiActions.userId, userId)];
    if (filters?.status) conditions.push(eq(aiActions.status, filters.status));
    const query = db.select().from(aiActions).where(and(...conditions)).orderBy(desc(aiActions.createdAt));
    if (filters?.limit) return await query.limit(filters.limit);
    return await query;
  }

  async getAiActionById(userId: string, id: number): Promise<AiAction | undefined> {
    const [action] = await db.select().from(aiActions).where(and(eq(aiActions.id, id), eq(aiActions.userId, userId)));
    return action;
  }

  async createAiAction(action: InsertAiAction): Promise<AiAction> {
    const [created] = await db.insert(aiActions).values(action).returning();
    return created;
  }

  async updateAiActionStatus(userId: string, id: number, status: string): Promise<void> {
    await db.update(aiActions).set({ status }).where(and(eq(aiActions.id, id), eq(aiActions.userId, userId)));
  }

  // Admin - delete user by email
  async deleteUserByEmail(email: string): Promise<boolean> {
    const result = await db.delete(users).where(eq(users.email, email)).returning();
    return result.length > 0;
  }

  // GamePlan
  async getGamePlanSettings(): Promise<GamePlanSettings | undefined> {
    const [settings] = await db.select().from(gamePlanSettings).limit(1);
    return settings;
  }

  async upsertGamePlanSettings(settings: Partial<InsertGamePlanSettings>): Promise<GamePlanSettings> {
    const existing = await this.getGamePlanSettings();
    if (existing) {
      const [updated] = await db.update(gamePlanSettings).set({ ...settings, updatedAt: new Date() }).where(eq(gamePlanSettings.id, existing.id)).returning();
      return updated;
    }
    const [created] = await db.insert(gamePlanSettings).values(settings as any).returning();
    return created;
  }

  async getGamePlanTargetCities(filters?: { market?: string; active?: boolean }): Promise<GamePlanTargetCity[]> {
    const conditions: any[] = [];
    if (filters?.market) conditions.push(eq(gamePlanTargetCities.market, filters.market));
    if (filters?.active !== undefined) conditions.push(eq(gamePlanTargetCities.active, filters.active));
    const query = conditions.length > 0
      ? db.select().from(gamePlanTargetCities).where(and(...conditions))
      : db.select().from(gamePlanTargetCities);
    return await query.orderBy(gamePlanTargetCities.market, gamePlanTargetCities.city);
  }

  async getGamePlanTargetCity(id: number): Promise<GamePlanTargetCity | undefined> {
    const [city] = await db.select().from(gamePlanTargetCities).where(eq(gamePlanTargetCities.id, id));
    return city;
  }

  async createGamePlanTargetCity(city: InsertGamePlanTargetCity): Promise<GamePlanTargetCity> {
    const [created] = await db.insert(gamePlanTargetCities).values(city).returning();
    return created;
  }

  async updateGamePlanTargetCity(id: number, updates: Partial<InsertGamePlanTargetCity>): Promise<GamePlanTargetCity | undefined> {
    const [updated] = await db.update(gamePlanTargetCities).set({ ...updates, updatedAt: new Date() }).where(eq(gamePlanTargetCities.id, id)).returning();
    return updated;
  }

  async deleteGamePlanTargetCity(id: number): Promise<void> {
    await db.delete(gamePlanTargetCities).where(eq(gamePlanTargetCities.id, id));
  }

  async getGamePlanQueue(filters?: { status?: string; type?: string }): Promise<GamePlanQueueItem[]> {
    const conditions: any[] = [];
    if (filters?.status) conditions.push(eq(gamePlanQueue.status, filters.status));
    if (filters?.type) conditions.push(eq(gamePlanQueue.type, filters.type));
    const query = conditions.length > 0
      ? db.select().from(gamePlanQueue).where(and(...conditions))
      : db.select().from(gamePlanQueue);
    return await query.orderBy(desc(gamePlanQueue.createdAt));
  }

  async getGamePlanQueueItem(id: number): Promise<GamePlanQueueItem | undefined> {
    const [item] = await db.select().from(gamePlanQueue).where(eq(gamePlanQueue.id, id));
    return item;
  }

  async createGamePlanQueueItem(item: InsertGamePlanQueueItem): Promise<GamePlanQueueItem> {
    const [created] = await db.insert(gamePlanQueue).values(item).returning();
    return created;
  }

  async updateGamePlanQueueItem(id: number, updates: Partial<InsertGamePlanQueueItem>): Promise<GamePlanQueueItem | undefined> {
    const [updated] = await db.update(gamePlanQueue).set(updates).where(eq(gamePlanQueue.id, id)).returning();
    return updated;
  }

  async deleteGamePlanQueueItem(id: number): Promise<void> {
    await db.delete(gamePlanQueue).where(eq(gamePlanQueue.id, id));
  }

  async getGamePlanHistory(limit?: number): Promise<GamePlanHistoryEntry[]> {
    const query = db.select().from(gamePlanHistory).orderBy(desc(gamePlanHistory.createdAt));
    if (limit) return await query.limit(limit);
    return await query;
  }

  async createGamePlanHistoryEntry(entry: InsertGamePlanHistoryEntry): Promise<GamePlanHistoryEntry> {
    const [created] = await db.insert(gamePlanHistory).values(entry).returning();
    return created;
  }

  async getGamePlanCityProjects(targetCityId: number): Promise<GamePlanCityProject[]> {
    return await db.select().from(gamePlanCityProjects)
      .where(eq(gamePlanCityProjects.targetCityId, targetCityId))
      .orderBy(desc(gamePlanCityProjects.completionDate), desc(gamePlanCityProjects.createdAt));
  }

  async getGamePlanCityProject(id: number): Promise<GamePlanCityProject | undefined> {
    const [project] = await db.select().from(gamePlanCityProjects).where(eq(gamePlanCityProjects.id, id));
    return project;
  }

  async createGamePlanCityProject(project: InsertGamePlanCityProject): Promise<GamePlanCityProject> {
    const [created] = await db.insert(gamePlanCityProjects).values(project).returning();
    return created;
  }

  async updateGamePlanCityProject(id: number, updates: Partial<InsertGamePlanCityProject>): Promise<GamePlanCityProject> {
    const [updated] = await db.update(gamePlanCityProjects).set({ ...updates, updatedAt: new Date() }).where(eq(gamePlanCityProjects.id, id)).returning();
    return updated;
  }

  async deleteGamePlanCityProject(id: number): Promise<void> {
    await db.delete(gamePlanCityProjects).where(eq(gamePlanCityProjects.id, id));
  }

  // Help Center Tutorials
  async getHelpTutorials(publishedOnly?: boolean): Promise<HelpTutorial[]> {
    if (publishedOnly) {
      return await db.select().from(helpTutorials)
        .where(eq(helpTutorials.published, true))
        .orderBy(helpTutorials.sortOrder, helpTutorials.category);
    }
    return await db.select().from(helpTutorials)
      .orderBy(helpTutorials.sortOrder, helpTutorials.category);
  }

  async getHelpTutorial(id: number): Promise<HelpTutorial | undefined> {
    const [tutorial] = await db.select().from(helpTutorials).where(eq(helpTutorials.id, id));
    return tutorial;
  }

  async createHelpTutorial(tutorial: InsertHelpTutorial): Promise<HelpTutorial> {
    const [created] = await db.insert(helpTutorials).values(tutorial).returning();
    return created;
  }

  async updateHelpTutorial(id: number, updates: Partial<InsertHelpTutorial>): Promise<HelpTutorial | undefined> {
    const [updated] = await db.update(helpTutorials)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(helpTutorials.id, id))
      .returning();
    return updated;
  }

  async deleteHelpTutorial(id: number): Promise<void> {
    await db.delete(helpTutorials).where(eq(helpTutorials.id, id));
  }

  // Work Order Settings
  async getWorkOrderSettings(userId: string): Promise<WorkOrderSettings | undefined> {
    const [settings] = await db.select().from(workOrderSettings).where(eq(workOrderSettings.userId, userId));
    return settings;
  }

  async upsertWorkOrderSettings(userId: string, settings: Partial<InsertWorkOrderSettings>): Promise<WorkOrderSettings> {
    const existing = await this.getWorkOrderSettings(userId);
    if (existing) {
      const [updated] = await db.update(workOrderSettings)
        .set({ ...settings, updatedAt: new Date() })
        .where(eq(workOrderSettings.userId, userId))
        .returning();
      return updated;
    }
    const [created] = await db.insert(workOrderSettings)
      .values({ ...settings, userId })
      .returning();
    return created;
  }

  // Work Orders
  async getWorkOrder(userId: string, projectId: number): Promise<WorkOrder | undefined> {
    const [wo] = await db.select().from(workOrders)
      .where(and(eq(workOrders.userId, userId), eq(workOrders.projectId, projectId)));
    return wo;
  }

  async getWorkOrderByDocument(userId: string, documentId: number): Promise<WorkOrder | undefined> {
    const [wo] = await db.select().from(workOrders)
      .where(and(eq(workOrders.userId, userId), eq(workOrders.documentId, documentId)));
    return wo;
  }

  async getWorkOrderByToken(token: string): Promise<WorkOrder | undefined> {
    const [wo] = await db.select().from(workOrders).where(eq(workOrders.publicToken, token));
    return wo;
  }

  async createWorkOrder(userId: string, data: InsertWorkOrder): Promise<WorkOrder> {
    const [created] = await db.insert(workOrders)
      .values({ ...data, userId, publicToken: generatePublicToken() })
      .returning();
    return created;
  }

  async updateWorkOrder(userId: string, id: number, updates: Partial<InsertWorkOrder>): Promise<WorkOrder | undefined> {
    const [updated] = await db.update(workOrders)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(workOrders.id, id), eq(workOrders.userId, userId)))
      .returning();
    return updated;
  }

  // Work Order Views
  async getWorkOrderViews(workOrderId: number): Promise<(WorkOrderView & { teamMember: { id: number; name: string; role: string; phone: string | null } })[]> {
    const views = await db.select({
      id: workOrderViews.id,
      workOrderId: workOrderViews.workOrderId,
      teamMemberId: workOrderViews.teamMemberId,
      viewedAt: workOrderViews.viewedAt,
      teamMember: {
        id: teamMembers.id,
        name: teamMembers.name,
        role: teamMembers.role,
        phone: teamMembers.phone,
      }
    }).from(workOrderViews)
      .innerJoin(teamMembers, eq(workOrderViews.teamMemberId, teamMembers.id))
      .where(eq(workOrderViews.workOrderId, workOrderId));
    return views;
  }

  async recordWorkOrderView(data: InsertWorkOrderView): Promise<WorkOrderView> {
    const [created] = await db.insert(workOrderViews).values(data).returning();
    return created;
  }

  // Work Order Sends
  async getWorkOrderSends(workOrderId: number): Promise<(WorkOrderSend & { teamMember: { id: number; name: string; role: string; phone: string | null } })[]> {
    const sends = await db.select({
      id: workOrderSends.id,
      workOrderId: workOrderSends.workOrderId,
      teamMemberId: workOrderSends.teamMemberId,
      channel: workOrderSends.channel,
      sentAt: workOrderSends.sentAt,
      status: workOrderSends.status,
      teamMember: {
        id: teamMembers.id,
        name: teamMembers.name,
        role: teamMembers.role,
        phone: teamMembers.phone,
      }
    }).from(workOrderSends)
      .innerJoin(teamMembers, eq(workOrderSends.teamMemberId, teamMembers.id))
      .where(eq(workOrderSends.workOrderId, workOrderId));
    return sends;
  }

  async recordWorkOrderSend(data: InsertWorkOrderSend): Promise<WorkOrderSend> {
    const [created] = await db.insert(workOrderSends).values(data).returning();
    return created;
  }

  async getCompanyUsers(ownerId: string): Promise<CompanyUser[]> {
    return db.select().from(companyUsers).where(eq(companyUsers.ownerId, ownerId));
  }

  async getCompanyUser(ownerId: string, userId: string): Promise<CompanyUser | undefined> {
    const [cu] = await db.select().from(companyUsers)
      .where(and(eq(companyUsers.ownerId, ownerId), eq(companyUsers.userId, userId)));
    return cu;
  }

  async addCompanyUser(data: InsertCompanyUser): Promise<CompanyUser> {
    const [created] = await db.insert(companyUsers).values(data).returning();
    return created;
  }

  async updateCompanyUser(ownerId: string, id: number, updates: Partial<InsertCompanyUser>): Promise<CompanyUser | undefined> {
    const [updated] = await db.update(companyUsers)
      .set(updates)
      .where(and(eq(companyUsers.id, id), eq(companyUsers.ownerId, ownerId)))
      .returning();
    return updated;
  }

  async removeCompanyUser(ownerId: string, id: number): Promise<void> {
    await db.delete(companyUsers)
      .where(and(eq(companyUsers.id, id), eq(companyUsers.ownerId, ownerId)));
  }

  async createInvitation(data: InsertCompanyInvitation): Promise<CompanyInvitation> {
    const [created] = await db.insert(companyInvitations).values(data).returning();
    return created;
  }

  async getInvitation(token: string): Promise<CompanyInvitation | undefined> {
    const [inv] = await db.select().from(companyInvitations)
      .where(eq(companyInvitations.token, token));
    return inv;
  }

  async getInvitations(ownerId: string): Promise<CompanyInvitation[]> {
    return db.select().from(companyInvitations)
      .where(and(eq(companyInvitations.ownerId, ownerId), eq(companyInvitations.status, 'pending')));
  }

  async acceptInvitation(token: string, userId: string): Promise<CompanyInvitation | undefined> {
    const inv = await this.getInvitation(token);
    if (!inv || inv.status !== 'pending') return undefined;

    if (new Date(inv.expiresAt) < new Date()) {
      return undefined;
    }

    const existingMembership = await db.select()
      .from(companyUsers)
      .where(and(eq(companyUsers.ownerId, inv.ownerId), eq(companyUsers.userId, userId)))
      .limit(1);

    const [updated] = await db.update(companyInvitations)
      .set({ status: 'accepted' })
      .where(eq(companyInvitations.token, token))
      .returning();

    if (existingMembership.length === 0) {
      await this.addCompanyUser({
        ownerId: inv.ownerId,
        userId,
        role: inv.role,
        status: 'active',
        linkedTeamMemberId: inv.linkedTeamMemberId || undefined,
        invitedAt: inv.createdAt,
      });
    }

    return updated;
  }

  async deleteInvitation(ownerId: string, id: number): Promise<void> {
    await db.delete(companyInvitations)
      .where(and(eq(companyInvitations.id, id), eq(companyInvitations.ownerId, ownerId)));
  }

  async getTeamMessages(companyOwnerId: string, channel?: string): Promise<TeamMessage[]> {
    const conditions = [eq(teamMessages.companyOwnerId, companyOwnerId)];
    if (channel) conditions.push(eq(teamMessages.channel, channel));
    return db.select().from(teamMessages)
      .where(and(...conditions))
      .orderBy(desc(teamMessages.createdAt))
      .limit(200);
  }

  async sendTeamMessage(data: InsertTeamMessage): Promise<TeamMessage> {
    const [created] = await db.insert(teamMessages).values(data).returning();
    return created;
  }

  async getTeamMessageUnreadCount(companyOwnerId: string, userId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(teamMessages)
      .where(and(
        eq(teamMessages.companyOwnerId, companyOwnerId),
        sql`${teamMessages.senderId} != ${userId}`,
        sql`NOT EXISTS (SELECT 1 FROM team_message_reads WHERE team_message_reads.message_id = ${teamMessages.id} AND team_message_reads.user_id = ${userId})`,
        sql`(
          ${teamMessages.channel} = 'general'
          OR ${teamMessages.channelId} IS NULL
          OR ${teamMessages.channelId} IN (
            SELECT id FROM team_channels WHERE ${userId} = ANY(member_ids) AND company_owner_id = ${companyOwnerId}
          )
        )`
      ));
    return result[0]?.count || 0;
  }

  async markTeamMessagesRead(companyOwnerId: string, userId: string, channel?: string): Promise<void> {
    const conditions = [
      eq(teamMessages.companyOwnerId, companyOwnerId),
      sql`${teamMessages.senderId} != ${userId}`,
    ];
    if (channel) conditions.push(eq(teamMessages.channel, channel));

    const unreadMessages = await db.select({ id: teamMessages.id })
      .from(teamMessages)
      .where(and(
        ...conditions,
        sql`NOT EXISTS (SELECT 1 FROM team_message_reads WHERE team_message_reads.message_id = ${teamMessages.id} AND team_message_reads.user_id = ${userId})`
      ));

    if (unreadMessages.length > 0) {
      await db.insert(teamMessageReads).values(
        unreadMessages.map(m => ({ messageId: m.id, userId }))
      ).onConflictDoNothing();
    }
  }

  async getTeamMessagesByChannelId(channelId: number): Promise<TeamMessage[]> {
    return db.select().from(teamMessages)
      .where(eq(teamMessages.channelId, channelId))
      .orderBy(desc(teamMessages.createdAt))
      .limit(200);
  }

  async markTeamMessagesReadByChannelId(channelId: number, userId: string): Promise<void> {
    const unreadMessages = await db.select({ id: teamMessages.id })
      .from(teamMessages)
      .where(and(
        eq(teamMessages.channelId, channelId),
        sql`${teamMessages.senderId} != ${userId}`,
        sql`NOT EXISTS (SELECT 1 FROM team_message_reads WHERE team_message_reads.message_id = ${teamMessages.id} AND team_message_reads.user_id = ${userId})`
      ));

    if (unreadMessages.length > 0) {
      await db.insert(teamMessageReads).values(
        unreadMessages.map(m => ({ messageId: m.id, userId }))
      ).onConflictDoNothing();
    }
  }

  async createTeamChannel(data: InsertTeamChannel): Promise<TeamChannel> {
    const [created] = await db.insert(teamChannels).values(data).returning();
    return created;
  }

  async getTeamChannels(companyOwnerId: string, userId: string): Promise<TeamChannel[]> {
    return db.select().from(teamChannels)
      .where(and(
        eq(teamChannels.companyOwnerId, companyOwnerId),
        sql`${userId} = ANY(${teamChannels.memberIds})`
      ))
      .orderBy(desc(teamChannels.updatedAt));
  }

  async getTeamChannel(id: number): Promise<TeamChannel | undefined> {
    const [channel] = await db.select().from(teamChannels).where(eq(teamChannels.id, id));
    return channel;
  }

  async ensureGeneralChannel(companyOwnerId: string, memberIds: string[]): Promise<TeamChannel> {
    const existing = await db.select().from(teamChannels)
      .where(and(
        eq(teamChannels.companyOwnerId, companyOwnerId),
        eq(teamChannels.type, "general")
      ));
    if (existing.length > 0) {
      const channel = existing[0];
      const allMembers = Array.from(new Set([...channel.memberIds, ...memberIds]));
      if (allMembers.length !== channel.memberIds.length) {
        await db.update(teamChannels)
          .set({ memberIds: allMembers, updatedAt: new Date() })
          .where(eq(teamChannels.id, channel.id));
        return { ...channel, memberIds: allMembers };
      }
      return channel;
    }
    const [created] = await db.insert(teamChannels).values({
      companyOwnerId,
      name: "General",
      type: "general",
      createdById: companyOwnerId,
      memberIds,
    }).returning();
    return created;
  }

  // Proposal Packages
  async getProposalPackages(userId: string): Promise<ProposalPackage[]> {
    return db.select().from(proposalPackages).where(eq(proposalPackages.userId, userId)).orderBy(proposalPackages.sortOrder, proposalPackages.id);
  }

  async getProposalPackage(userId: string, id: number): Promise<ProposalPackage | undefined> {
    const [pkg] = await db.select().from(proposalPackages).where(and(eq(proposalPackages.userId, userId), eq(proposalPackages.id, id)));
    return pkg;
  }

  async createProposalPackage(data: InsertProposalPackage): Promise<ProposalPackage> {
    const [pkg] = await db.insert(proposalPackages).values(data).returning();
    return pkg;
  }

  async updateProposalPackage(userId: string, id: number, updates: Partial<InsertProposalPackage>): Promise<ProposalPackage | undefined> {
    const [pkg] = await db.update(proposalPackages).set(updates).where(and(eq(proposalPackages.userId, userId), eq(proposalPackages.id, id))).returning();
    return pkg;
  }

  async deleteProposalPackage(userId: string, id: number): Promise<void> {
    await db.delete(proposalPackages).where(and(eq(proposalPackages.userId, userId), eq(proposalPackages.id, id)));
  }

  // Feature Library
  async getPackageFeatures(userId: string): Promise<PackageFeatureLibrary[]> {
    return db.select().from(packageFeaturesLibrary).where(eq(packageFeaturesLibrary.userId, userId)).orderBy(packageFeaturesLibrary.id);
  }

  async createPackageFeature(data: InsertPackageFeatureLibrary): Promise<PackageFeatureLibrary> {
    const [feat] = await db.insert(packageFeaturesLibrary).values(data).returning();
    return feat;
  }

  async updatePackageFeature(userId: string, id: number, updates: Partial<InsertPackageFeatureLibrary>): Promise<PackageFeatureLibrary | undefined> {
    const [feat] = await db.update(packageFeaturesLibrary).set(updates).where(and(eq(packageFeaturesLibrary.userId, userId), eq(packageFeaturesLibrary.id, id))).returning();
    return feat;
  }

  async deletePackageFeature(userId: string, id: number): Promise<void> {
    await db.delete(packageFeatureAssignments).where(eq(packageFeatureAssignments.featureId, id));
    await db.delete(packageFeaturesLibrary).where(and(eq(packageFeaturesLibrary.userId, userId), eq(packageFeaturesLibrary.id, id)));
  }

  async getFeatureAssignments(packageIds: number[]): Promise<PackageFeatureAssignment[]> {
    if (packageIds.length === 0) return [];
    return db.select().from(packageFeatureAssignments).where(inArray(packageFeatureAssignments.packageId, packageIds)).orderBy(packageFeatureAssignments.sortOrder);
  }

  async setFeatureAssignments(packageId: number, assignments: { featureId: number; included: boolean; sortOrder: number }[]): Promise<void> {
    await db.delete(packageFeatureAssignments).where(eq(packageFeatureAssignments.packageId, packageId));
    if (assignments.length > 0) {
      await db.insert(packageFeatureAssignments).values(
        assignments.map(a => ({ packageId, featureId: a.featureId, included: a.included, sortOrder: a.sortOrder }))
      );
    }
  }

  async getActiveAppointmentSession(userId: string): Promise<(AppointmentSession & { appointment: Appointment & { contact: Contact } }) | undefined> {
    const [session] = await db.select().from(appointmentSessions)
      .where(and(eq(appointmentSessions.userId, userId), eq(appointmentSessions.status, 'active')))
      .orderBy(desc(appointmentSessions.startTime))
      .limit(1);
    if (!session) return undefined;
    const appt = await this.getAppointment(userId, session.appointmentId);
    if (!appt) return undefined;
    return { ...session, appointment: appt };
  }

  async getAppointmentSession(userId: string, id: number): Promise<AppointmentSession | undefined> {
    const [session] = await db.select().from(appointmentSessions)
      .where(and(eq(appointmentSessions.id, id), eq(appointmentSessions.userId, userId)));
    return session;
  }

  async createAppointmentSession(userId: string, session: InsertAppointmentSession): Promise<AppointmentSession> {
    const [newSession] = await db.insert(appointmentSessions).values({ ...session, userId }).returning();
    return newSession;
  }

  async updateAppointmentSession(userId: string, id: number, updates: Partial<InsertAppointmentSession>): Promise<AppointmentSession | undefined> {
    const [updated] = await db.update(appointmentSessions)
      .set(updates)
      .where(and(eq(appointmentSessions.id, id), eq(appointmentSessions.userId, userId)))
      .returning();
    return updated;
  }

  async getCrewReceiptSubmissions(filters: { projectId: number; userId?: string; ownerId?: string; status?: string }): Promise<CrewReceiptSubmission[]> {
    const conditions = [eq(crewReceiptSubmissions.projectId, filters.projectId)];
    if (filters.userId) conditions.push(eq(crewReceiptSubmissions.userId, filters.userId));
    if (filters.ownerId) conditions.push(eq(crewReceiptSubmissions.ownerId, filters.ownerId));
    if (filters.status) conditions.push(eq(crewReceiptSubmissions.status, filters.status));
    return db.select().from(crewReceiptSubmissions).where(and(...conditions)).orderBy(desc(crewReceiptSubmissions.createdAt));
  }

  async getCrewReceiptSubmission(id: number): Promise<CrewReceiptSubmission | undefined> {
    const [submission] = await db.select().from(crewReceiptSubmissions).where(eq(crewReceiptSubmissions.id, id));
    return submission;
  }

  async createCrewReceiptSubmission(data: InsertCrewReceiptSubmission): Promise<CrewReceiptSubmission> {
    const [submission] = await db.insert(crewReceiptSubmissions).values(data).returning();
    return submission;
  }

  async updateCrewReceiptSubmission(id: number, updates: Partial<InsertCrewReceiptSubmission>): Promise<CrewReceiptSubmission | undefined> {
    const [updated] = await db.update(crewReceiptSubmissions).set(updates).where(eq(crewReceiptSubmissions.id, id)).returning();
    return updated;
  }

  async getBlockedNumbers(userId: string): Promise<BlockedNumber[]> {
    return await db.select().from(blockedNumbers).where(eq(blockedNumbers.userId, userId)).orderBy(desc(blockedNumbers.createdAt));
  }

  async getBlockedNumber(userId: string, phoneNumber: string): Promise<BlockedNumber | undefined> {
    const normalized = phoneNumber.replace(/\D/g, '').slice(-10);
    const all = await db.select().from(blockedNumbers).where(eq(blockedNumbers.userId, userId));
    return all.find(b => b.phoneNumber.replace(/\D/g, '').slice(-10) === normalized);
  }

  async createBlockedNumber(data: InsertBlockedNumber): Promise<BlockedNumber> {
    const [created] = await db.insert(blockedNumbers).values(data).returning();
    return created;
  }

  async deleteBlockedNumber(userId: string, id: number): Promise<void> {
    await db.delete(blockedNumbers).where(and(eq(blockedNumbers.id, id), eq(blockedNumbers.userId, userId)));
  }

  async isNumberBlocked(userId: string, phoneNumber: string): Promise<boolean> {
    const found = await this.getBlockedNumber(userId, phoneNumber);
    return !!found;
  }

  // Feature Requests
  async getFeatureRequests(userId: string): Promise<FeatureRequest[]> {
    return await db.select().from(featureRequests).where(eq(featureRequests.userId, userId)).orderBy(desc(featureRequests.createdAt));
  }
  async getAllFeatureRequests(): Promise<Array<FeatureRequest & { submitterEmail?: string | null; submitterName?: string | null }>> {
    const rows = await db
      .select({
        request: featureRequests,
        submitterEmail: users.email,
        submitterFirstName: users.firstName,
        submitterLastName: users.lastName,
      })
      .from(featureRequests)
      .leftJoin(users, eq(users.id, featureRequests.userId))
      .orderBy(desc(featureRequests.createdAt));
    return rows.map((r: any) => ({
      ...r.request,
      submitterEmail: r.submitterEmail,
      submitterName: [r.submitterFirstName, r.submitterLastName].filter(Boolean).join(" ") || null,
    }));
  }
  async adminGetFeatureRequest(id: number): Promise<FeatureRequest | undefined> {
    const [row] = await db.select().from(featureRequests).where(eq(featureRequests.id, id));
    return row;
  }
  async adminUpdateFeatureRequest(id: number, updates: Partial<InsertFeatureRequest> & { adminNote?: string | null; status?: string }): Promise<FeatureRequest | undefined> {
    const [row] = await db.update(featureRequests)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(featureRequests.id, id))
      .returning();
    return row;
  }
  async getFeatureRequest(userId: string, id: number): Promise<FeatureRequest | undefined> {
    const [row] = await db.select().from(featureRequests).where(and(eq(featureRequests.id, id), eq(featureRequests.userId, userId)));
    return row;
  }
  async getFeatureRequestByToken(token: string): Promise<FeatureRequest | undefined> {
    const [row] = await db.select().from(featureRequests).where(eq(featureRequests.shareToken, token));
    return row;
  }
  async createFeatureRequest(userId: string, data: InsertFeatureRequest): Promise<FeatureRequest> {
    const [row] = await db.insert(featureRequests).values({
      ...data,
      userId,
      shareToken: nanoid(24),
    }).returning();
    return row;
  }
  async updateFeatureRequest(userId: string, id: number, updates: Partial<InsertFeatureRequest>): Promise<FeatureRequest | undefined> {
    const [row] = await db.update(featureRequests)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(featureRequests.id, id), eq(featureRequests.userId, userId)))
      .returning();
    return row;
  }
  async deleteFeatureRequest(userId: string, id: number): Promise<void> {
    await db.delete(featureRequests).where(and(eq(featureRequests.id, id), eq(featureRequests.userId, userId)));
  }
}

export const storage = new DatabaseStorage();
