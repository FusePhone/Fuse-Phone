import { z } from 'zod';
import { insertContactSchema, insertDocumentSchema, insertCompanySettingsSchema, insertTemplateSchema, insertProposalTemplateSchema, insertMessageTemplateSchema, insertBookingRequestSchema, insertAppointmentSchema, insertJobSchema, insertProjectSchema, insertServiceTemplateSchema, contacts, documents, communications, companySettings, templates, proposalTemplates, messageTemplates, serviceTemplates, bookingRequests, appointments, jobs, projects, projectActivities } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  contacts: {
    list: {
      method: 'GET' as const,
      path: '/api/contacts',
      input: z.object({
        type: z.enum(['lead', 'client']).optional(),
        search: z.string().optional(),
      }).optional(),
      responses: {
        200: z.array(z.custom<typeof contacts.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/contacts/:id',
      responses: {
        200: z.custom<typeof contacts.$inferSelect & { documents: typeof documents.$inferSelect[] }>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/contacts',
      input: insertContactSchema,
      responses: {
        201: z.custom<typeof contacts.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/contacts/:id',
      input: insertContactSchema.partial(),
      responses: {
        200: z.custom<typeof contacts.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/contacts/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  documents: {
    list: {
      method: 'GET' as const,
      path: '/api/documents',
      input: z.object({
        contactId: z.coerce.number().optional(),
        type: z.string().optional(),
      }).optional(),
      responses: {
        200: z.array(z.custom<typeof documents.$inferSelect & { contact: typeof contacts.$inferSelect }>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/documents/:id',
      responses: {
        200: z.custom<typeof documents.$inferSelect & { contact: typeof contacts.$inferSelect }>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/documents',
      input: insertDocumentSchema,
      responses: {
        201: z.custom<typeof documents.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/documents/:id',
      input: insertDocumentSchema.partial(),
      responses: {
        200: z.custom<typeof documents.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    sign: {
      method: 'POST' as const,
      path: '/api/documents/:id/sign',
      input: z.object({ signature: z.string() }),
      responses: {
        200: z.custom<typeof documents.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
  },
  dashboard: {
    stats: {
      method: 'GET' as const,
      path: '/api/dashboard/stats',
      responses: {
        200: z.object({
          totalLeads: z.number(),
          totalContacts: z.number(),
          totalClients: z.number(),
          activeProposals: z.number(),
          pendingEstimates: z.number(),
          pendingChangeOrders: z.number(),
          pendingInvoicesCount: z.number(),
          pendingInvoicesAmount: z.number(),
          activeJobs: z.number(),
          scheduledJobs: z.number(),
          completedJobsThisMonth: z.number(),
          unreadMessages: z.number(),
          missedCalls: z.number(),
          upcomingAppointmentsCount: z.number(),
          monthlyRevenue: z.number(),
          yearlyRevenue: z.number(),
          recentLeads: z.array(z.custom<typeof contacts.$inferSelect>()),
          upcomingAppointments: z.array(z.custom<typeof appointments.$inferSelect & { contact: typeof contacts.$inferSelect }>()),
          activeJobsList: z.array(z.custom<typeof jobs.$inferSelect & { contact: typeof contacts.$inferSelect }>()),
          unreadCommunications: z.array(z.custom<typeof communications.$inferSelect & { contact: typeof contacts.$inferSelect }>()),
        }),
      },
    },
    pipeline: {
      method: 'GET' as const,
      path: '/api/dashboard/pipeline',
      responses: {
        200: z.object({
          projects: z.array(z.custom<typeof projects.$inferSelect & { contact: typeof contacts.$inferSelect }>()),
          stats: z.object({
            newLeadsThisWeek: z.number(),
            proposalsPending: z.number(),
            activeJobsCount: z.number(),
            monthlyRevenue: z.number(),
            yearlyRevenue: z.number(),
            pendingInvoicesAmount: z.number(),
            pendingInvoicesCount: z.number(),
            unreadMessages: z.number(),
            missedCalls: z.number(),
          }),
        }),
      },
    },
  },
  companySettings: {
    get: {
      method: 'GET' as const,
      path: '/api/settings/company',
      responses: {
        200: z.custom<typeof companySettings.$inferSelect>().nullable(),
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/settings/company',
      input: insertCompanySettingsSchema.partial(),
      responses: {
        200: z.custom<typeof companySettings.$inferSelect>(),
      },
    },
  },
  communications: {
    list: {
      method: 'GET' as const,
      path: '/api/communications',
      input: z.object({
        contactId: z.coerce.number().optional(),
      }).optional(),
      responses: {
        200: z.array(z.custom<typeof communications.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/communications',
      input: z.object({
        contactId: z.number(),
        type: z.string(),
        direction: z.string(),
        content: z.string().optional(),
      }),
      responses: {
        201: z.custom<typeof communications.$inferSelect>(),
      },
    },
  },
  twilio: {
    getNumbers: {
      method: 'GET' as const,
      path: '/api/twilio/numbers',
      responses: {
        200: z.array(z.object({
          sid: z.string(),
          phoneNumber: z.string(),
          friendlyName: z.string(),
        })),
        400: errorSchemas.validation,
      },
    },
    sendSms: {
      method: 'POST' as const,
      path: '/api/twilio/send-sms',
      input: z.object({
        to: z.string(),
        body: z.string(),
        contactId: z.number().optional(),
        mediaUrl: z.string().optional(),
      }),
      responses: {
        200: z.object({ success: z.boolean(), messageSid: z.string().optional() }),
        400: errorSchemas.validation,
      },
    },
    makeCall: {
      method: 'POST' as const,
      path: '/api/twilio/make-call',
      input: z.object({
        to: z.string(),
        contactId: z.number().optional(),
      }),
      responses: {
        200: z.object({ success: z.boolean(), callSid: z.string().optional() }),
        400: errorSchemas.validation,
      },
    },
  },
  templates: {
    list: {
      method: 'GET' as const,
      path: '/api/templates',
      responses: {
        200: z.array(z.custom<typeof templates.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/templates/:slug',
      responses: {
        200: z.custom<typeof templates.$inferSelect>().nullable(),
      },
    },
    upsert: {
      method: 'PUT' as const,
      path: '/api/templates/:slug',
      input: insertTemplateSchema,
      responses: {
        200: z.custom<typeof templates.$inferSelect>(),
      },
    },
  },
  proposalTemplates: {
    list: {
      method: 'GET' as const,
      path: '/api/proposal-templates',
      responses: {
        200: z.array(z.custom<typeof proposalTemplates.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/proposal-templates/:id',
      responses: {
        200: z.custom<typeof proposalTemplates.$inferSelect>().nullable(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/proposal-templates',
      input: insertProposalTemplateSchema,
      responses: {
        201: z.custom<typeof proposalTemplates.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/proposal-templates/:id',
      input: insertProposalTemplateSchema.partial(),
      responses: {
        200: z.custom<typeof proposalTemplates.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/proposal-templates/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  serviceTemplates: {
    list: {
      method: 'GET' as const,
      path: '/api/service-templates',
      responses: {
        200: z.array(z.custom<typeof serviceTemplates.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/service-templates',
      input: insertServiceTemplateSchema,
      responses: {
        201: z.custom<typeof serviceTemplates.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/service-templates/:id',
      input: insertServiceTemplateSchema.partial(),
      responses: {
        200: z.custom<typeof serviceTemplates.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/service-templates/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  messageTemplates: {
    list: {
      method: 'GET' as const,
      path: '/api/message-templates',
      responses: {
        200: z.array(z.custom<typeof messageTemplates.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/message-templates/:slug',
      responses: {
        200: z.custom<typeof messageTemplates.$inferSelect>().nullable(),
      },
    },
    upsert: {
      method: 'PUT' as const,
      path: '/api/message-templates/:slug',
      input: insertMessageTemplateSchema.pick({ content: true }).extend({
        emailSubject: z.string().optional(),
        emailContent: z.string().optional(),
        isEnabled: z.boolean().optional(),
        delayMinutes: z.number().int().min(0).max(60 * 24 * 365).nullable().optional(),
      }),
      responses: {
        200: z.custom<typeof messageTemplates.$inferSelect>(),
      },
    },
    patch: {
      method: 'PATCH' as const,
      path: '/api/message-templates/:slug',
      input: z.object({
        isEnabled: z.boolean().optional(),
        delayMinutes: z.number().int().min(0).max(60 * 24 * 365).nullable().optional(),
      }),
      responses: {
        200: z.custom<typeof messageTemplates.$inferSelect>(),
      },
    },
  },
  bookingRequests: {
    list: {
      method: 'GET' as const,
      path: '/api/booking-requests',
      responses: {
        200: z.array(z.custom<typeof bookingRequests.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/booking-requests/:id',
      responses: {
        200: z.custom<typeof bookingRequests.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/public/booking-request',
      input: insertBookingRequestSchema,
      responses: {
        201: z.custom<typeof bookingRequests.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/booking-requests/:id',
      input: z.object({
        status: z.enum(['new', 'contacted', 'scheduled', 'completed', 'cancelled']).optional(),
        contactId: z.number().optional(),
      }),
      responses: {
        200: z.custom<typeof bookingRequests.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
  },
  appointments: {
    list: {
      method: 'GET' as const,
      path: '/api/appointments',
      responses: {
        200: z.array(z.custom<typeof appointments.$inferSelect & { contact: typeof contacts.$inferSelect }>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/appointments/:id',
      responses: {
        200: z.custom<typeof appointments.$inferSelect & { contact: typeof contacts.$inferSelect }>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/appointments',
      input: insertAppointmentSchema,
      responses: {
        201: z.custom<typeof appointments.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/appointments/:id',
      input: insertAppointmentSchema.partial(),
      responses: {
        200: z.custom<typeof appointments.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/appointments/:id',
      responses: {
        200: z.object({ success: z.boolean() }),
        404: errorSchemas.notFound,
      },
    },
  },
  jobs: {
    list: {
      method: 'GET' as const,
      path: '/api/jobs',
      responses: {
        200: z.array(z.custom<typeof jobs.$inferSelect & { contact: typeof contacts.$inferSelect; document?: typeof documents.$inferSelect | null }>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/jobs/:id',
      responses: {
        200: z.custom<typeof jobs.$inferSelect & { contact: typeof contacts.$inferSelect; document?: typeof documents.$inferSelect | null }>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/jobs',
      input: insertJobSchema,
      responses: {
        201: z.custom<typeof jobs.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/jobs/:id',
      input: insertJobSchema.partial(),
      responses: {
        200: z.custom<typeof jobs.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/jobs/:id',
      responses: {
        200: z.object({ success: z.boolean() }),
        404: errorSchemas.notFound,
      },
    },
  },
  projects: {
    list: {
      method: 'GET' as const,
      path: '/api/projects',
      responses: {
        200: z.array(z.custom<typeof projects.$inferSelect & { contact: typeof contacts.$inferSelect }>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/projects/:id',
      responses: {
        200: z.custom<typeof projects.$inferSelect & { contact: typeof contacts.$inferSelect; activities?: (typeof projectActivities.$inferSelect)[] }>(),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/projects',
      input: insertProjectSchema,
      responses: {
        201: z.custom<typeof projects.$inferSelect>(),
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/projects/:id',
      input: insertProjectSchema.partial(),
      responses: {
        200: z.custom<typeof projects.$inferSelect>(),
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/projects/:id',
      responses: {
        200: z.object({ success: z.boolean() }),
      },
    },
  },
  projectActivities: {
    list: {
      method: 'GET' as const,
      path: '/api/projects/:projectId/activities',
      responses: {
        200: z.array(z.custom<typeof projectActivities.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/projects/:projectId/activities',
      input: z.object({ content: z.string(), type: z.string().optional() }),
      responses: {
        201: z.custom<typeof projectActivities.$inferSelect>(),
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/projects/:projectId/activities/:id',
      responses: {
        200: z.object({ success: z.boolean() }),
      },
    },
  },
};

export type { 
  CreateContactRequest, 
  UpdateContactRequest, 
  CreateDocumentRequest, 
  UpdateDocumentRequest, 
  SignDocumentRequest,
  UpdateCompanySettingsRequest 
} from './schema';

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
