import { getStripeSync, getUncachableStripeClient } from './stripeClient';
import { db } from './db';
import { users } from '../shared/models/auth';
import { notifications } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { storage } from './storage';
import { emitToUser } from './realtime';
import { sendPushToUser } from './pushNotifications';

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'This usually means express.json() parsed the body before reaching this handler. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);

    try {
      const event = JSON.parse(payload.toString());
      await WebhookHandlers.handleCustomEvents(event);
    } catch (err) {
      console.error('[Webhook] Error handling custom event:', err);
    }
  }

  static async handleCustomEvents(event: any): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.mode === 'subscription' && session.subscription) {
          const userId = session.metadata?.userId;
          const customerId = session.customer;
          const checkoutType = session.metadata?.type;
          
          if (checkoutType === 'fuse_ai' && userId) {
            console.log(`[Webhook] FuseAI checkout completed for user ${userId}`);
            await db.update(users).set({
              fuseAiSubscriptionId: session.subscription as string,
              fuseAiStatus: 'active',
            }).where(eq(users.id, userId));
          } else if (checkoutType === 'ai_assistant' && userId) {
            console.log(`[Webhook] AI Assistant checkout completed for user ${userId}`);
            await db.update(users).set({
              aiAssistantSubscriptionId: session.subscription as string,
              aiAssistantStatus: 'active',
            }).where(eq(users.id, userId));
          } else if (checkoutType === 'white_label' && userId) {
            console.log(`[Webhook] White Label checkout completed for user ${userId}`);
            await db.update(users).set({
              whiteLabelSubscriptionId: session.subscription as string,
              whiteLabelStatus: 'active',
            }).where(eq(users.id, userId));
            const settings = await storage.getCompanySettings(userId);
            if (settings) {
              await storage.updateCompanySettings(userId, { whiteLabelEnabled: true });
            }
          } else if (userId) {
            console.log(`[Webhook] Checkout completed for user ${userId}, syncing subscription...`);
            await WebhookHandlers.syncUserSubscription(userId, customerId);
          } else if (customerId) {
            const [user] = await db.select().from(users).where(eq(users.stripeCustomerId, customerId as string));
            if (user) {
              console.log(`[Webhook] Checkout completed for customer ${customerId}, syncing subscription...`);
              await WebhookHandlers.syncUserSubscription(user.id, customerId as string);
            }
          }
        } else if (session.mode === 'payment' && session.metadata?.type === 'customer_payment') {
          try {
            await WebhookHandlers.handleCustomerPayment(session);
          } catch (err) {
            console.error('[Webhook] Error handling customer payment:', err);
          }
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const customerId = subscription.customer;
        
        const [user] = await db.select().from(users).where(eq(users.stripeCustomerId, customerId as string));
        if (user) {
          if (user.fuseAiSubscriptionId === subscription.id) {
            const fuseAiStatus = (subscription.status === 'active' || subscription.status === 'trialing') ? 'active' : 'inactive';
            console.log(`[Webhook] FuseAI subscription ${event.type} for user ${user.id}, status=${fuseAiStatus}`);
            await db.update(users).set({ fuseAiStatus }).where(eq(users.id, user.id));
          } else if (user.aiAssistantSubscriptionId === subscription.id) {
            const aiAssistantStatus = (subscription.status === 'active' || subscription.status === 'trialing') ? 'active' : 'inactive';
            console.log(`[Webhook] AI Assistant subscription ${event.type} for user ${user.id}, status=${aiAssistantStatus}`);
            await db.update(users).set({ aiAssistantStatus }).where(eq(users.id, user.id));
          } else if (user.whiteLabelSubscriptionId === subscription.id) {
            const whiteLabelStatus = (subscription.status === 'active' || subscription.status === 'trialing') ? 'active' : 'inactive';
            console.log(`[Webhook] White Label subscription ${event.type} for user ${user.id}, status=${whiteLabelStatus}`);
            await db.update(users).set({ whiteLabelStatus }).where(eq(users.id, user.id));
            if (whiteLabelStatus === 'inactive') {
              await storage.updateCompanySettings(user.id, { whiteLabelEnabled: false });
            }
          } else {
            console.log(`[Webhook] Subscription ${event.type} for user ${user.id}`);
            await WebhookHandlers.syncUserSubscription(user.id, customerId as string);
          }
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId = subscription.customer;
        
        const [user] = await db.select().from(users).where(eq(users.stripeCustomerId, customerId as string));
        if (user) {
          if (user.fuseAiSubscriptionId === subscription.id) {
            console.log(`[Webhook] FuseAI subscription ${subscription.id} deleted for user ${user.id}`);
            await db.update(users).set({
              fuseAiStatus: 'inactive',
              fuseAiSubscriptionId: null,
            }).where(eq(users.id, user.id));
          } else if (user.aiAssistantSubscriptionId === subscription.id) {
            console.log(`[Webhook] AI Assistant subscription ${subscription.id} deleted for user ${user.id}`);
            await db.update(users).set({
              aiAssistantStatus: 'inactive',
              aiAssistantSubscriptionId: null,
            }).where(eq(users.id, user.id));
          } else if (user.whiteLabelSubscriptionId === subscription.id) {
            console.log(`[Webhook] White Label subscription ${subscription.id} deleted for user ${user.id}`);
            await db.update(users).set({
              whiteLabelStatus: 'inactive',
              whiteLabelSubscriptionId: null,
            }).where(eq(users.id, user.id));
            await storage.updateCompanySettings(user.id, { whiteLabelEnabled: false });
          } else if (user.stripeSubscriptionId === subscription.id || !user.stripeSubscriptionId) {
            console.log(`[Webhook] Active subscription ${subscription.id} deleted for user ${user.id}, marking inactive + clearing paid seats`);
            await db.update(users).set({
              subscriptionStatus: 'inactive',
              stripeSubscriptionId: null,
              subscriptionEndsAt: new Date(),
              paidFieldWorkerSeats: 0,
              paidOfficeSeats: 0,
            }).where(eq(users.id, user.id));
          } else {
            console.log(`[Webhook] Old subscription ${subscription.id} deleted for user ${user.id}, ignoring (current sub: ${user.stripeSubscriptionId})`);
          }
        }
        break;
      }
      case 'invoice.paid': {
        const invoice = event.data.object;
        const customerId = invoice.customer;
        
        if (invoice.subscription) {
          const [user] = await db.select().from(users).where(eq(users.stripeCustomerId, customerId as string));
          if (user) {
            if (user.fuseAiSubscriptionId === invoice.subscription) {
              console.log(`[Webhook] FuseAI invoice paid for user ${user.id}`);
              await db.update(users).set({ fuseAiStatus: 'active' }).where(eq(users.id, user.id));
            } else {
              console.log(`[Webhook] Invoice paid for user ${user.id}, syncing subscription...`);
              await WebhookHandlers.syncUserSubscription(user.id, customerId as string);
              // Credit the referrer (idempotent, skipped for affiliate referrers)
              try {
                const { creditReferralOnFirstPayment } = await import('./referrals');
                await creditReferralOnFirstPayment(user.id);
              } catch (e) {
                console.error('[Webhook] referral crediting failed:', e);
              }
              // Affiliate commission (10%, 12-month window)
              try {
                const { recordAffiliateCommissionIfApplicable } = await import('./referralRoutes');
                await recordAffiliateCommissionIfApplicable(user.id, invoice as any);
              } catch (e) {
                console.error('[Webhook] affiliate commission failed:', e);
              }
            }
          }
        }
        break;
      }
    }
  }

  static async syncUserSubscription(userId: string, customerId: string): Promise<void> {
    try {
      const stripe = await getUncachableStripeClient();
      
      // Fetch all subscriptions and find the newest active/trialing one
      const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        limit: 10,
        expand: ['data.items.data.price.product'],
      });

      // Sort by created date descending (newest first) and find active/trialing
      const activeSubs = subscriptions.data
        .filter(s => s.status === 'active' || s.status === 'trialing')
        .sort((a, b) => b.created - a.created);

      if (activeSubs.length > 0) {
        const sub = activeSubs[0]; // newest active subscription
        // Base tier item: pick the first item whose product is NOT a team seat
        // add-on. Falls back to items[0] for legacy subscriptions that only
        // ever had a single item. Without this, when a seat item happens to
        // sort first, tier would misclassify as 'core'.
        const baseItem = sub.items.data.find((it: any) => {
          const meta = (it?.price?.product as any)?.metadata
            || (it?.price as any)?.metadata
            || {};
          return meta.kind !== 'team_seat' && meta.seat_type !== 'field_worker' && meta.seat_type !== 'office';
        }) || sub.items.data[0];
        const product = baseItem?.price?.product as any;
        
        let tier = 'core';
        if (product) {
          tier = product.metadata?.tier || 
            (product.name?.toLowerCase().includes('elite') ? 'elite' : product.name?.toLowerCase().includes('starter') ? 'starter' : 'core');
        }

        if (activeSubs.length > 1) {
          console.log(`[Webhook] Found ${activeSubs.length} active subscriptions for user ${userId}, keeping newest (${sub.id})`);
        }
        
        // Mirror Stripe's actual status so trialing users stay 'trialing' in our DB
        // (this is what the trial-ending reminder jobs and the trial-day-counter UI key off of).
        const localStatus = sub.status === 'trialing' ? 'trialing' : 'active';
        const trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000) : null;

        const updateData: any = {
          stripeSubscriptionId: sub.id,
          subscriptionTier: tier,
          subscriptionStatus: localStatus,
          subscriptionEndsAt: new Date(((baseItem as any)?.current_period_end || sub.current_period_end || Math.floor(Date.now() / 1000) + 30 * 86400) * 1000),
        };
        if (localStatus === 'trialing' && trialEnd) {
          updateData.trialEndsAt = trialEnd;
        }

        // Recount paid extra seats from the subscription items so our DB
        // stays in sync if the customer changes quantities in the Stripe
        // portal or our purchase/release endpoint fails mid-write.
        let paidField = 0;
        let paidOffice = 0;
        for (const item of sub.items.data) {
          const meta = (item.price?.product as any)?.metadata
            || (item.price as any)?.metadata
            || {};
          if (meta.seat_type === 'field_worker') paidField += (item.quantity || 0);
          else if (meta.seat_type === 'office') paidOffice += (item.quantity || 0);
        }
        updateData.paidFieldWorkerSeats = paidField;
        updateData.paidOfficeSeats = paidOffice;

        await db.update(users).set(updateData).where(eq(users.id, userId));
        console.log(`[Webhook] Synced subscription for user ${userId}: tier=${tier}, status=${localStatus}, subId=${sub.id}, paidSeats=field:${paidField}/office:${paidOffice}${trialEnd ? `, trialEnd=${trialEnd.toISOString()}` : ''}`);
      } else {
        // No active subscriptions - check if all are canceled/unpaid
        const anySub = subscriptions.data[0];
        if (anySub && (anySub.status === 'canceled' || anySub.status === 'unpaid')) {
          await db.update(users).set({
            subscriptionStatus: 'inactive',
            stripeSubscriptionId: null,
            subscriptionEndsAt: new Date(),
          }).where(eq(users.id, userId));
          console.log(`[Webhook] Subscription ${anySub.status} for user ${userId}, marked inactive`);
        }
      }
    } catch (err) {
      console.error(`[Webhook] Error syncing subscription for user ${userId}:`, err);
    }
  }

  static async handleCustomerPayment(session: any): Promise<void> {
    const { documentId, userId, token, scheduleIndex } = session.metadata || {};
    if (!documentId || !userId || !token) {
      console.log('[Webhook] Customer payment missing metadata, skipping');
      return;
    }

    const amountTotal = session.amount_total;
    if (!amountTotal || amountTotal <= 0) return;

    console.log(`[Webhook] Processing customer payment: doc=${documentId}, amount=${amountTotal}, scheduleIndex=${scheduleIndex}`);

    const doc = await storage.getDocumentByToken(token);
    if (!doc) {
      console.error(`[Webhook] Document not found for token ${token}`);
      return;
    }

    let invoiceDoc = doc;
    if (doc.type !== 'invoice' && doc.linkedInvoiceId) {
      const linked = await storage.getDocument(doc.userId, doc.linkedInvoiceId);
      if (linked) invoiceDoc = linked;
    }

    // Idempotency guard — Stripe may retry deliveries. If we've already recorded a
    // payment for this checkout session, exit silently (no duplicate payment, no
    // duplicate notification, no duplicate push).
    const priorPayments = await storage.getPayments(doc.userId, invoiceDoc.id);
    if (priorPayments.some((p: any) => p.notes && p.notes.includes(session.id))) {
      console.log(`[Webhook] Duplicate Stripe session ${session.id} — skipping`);
      return;
    }

    await storage.createPayment(doc.userId, {
      documentId: invoiceDoc.id,
      amount: amountTotal,
      paymentType: 'credit_card',
      paymentDate: new Date(),
      notes: `Stripe checkout (${session.id})`,
    });

    if (scheduleIndex !== undefined && scheduleIndex !== '' && invoiceDoc.content?.paymentSettings?.schedule) {
      const updatedContent = { ...invoiceDoc.content };
      const idx = parseInt(scheduleIndex);
      if (updatedContent.paymentSettings && updatedContent.paymentSettings.schedule[idx]) {
        updatedContent.paymentSettings.schedule[idx] = {
          ...updatedContent.paymentSettings.schedule[idx],
          paid: true,
          paidAt: new Date().toISOString(),
        };
        await storage.updateDocument(doc.userId, invoiceDoc.id, { content: updatedContent });
      }
    }

    const allPayments = await storage.getPayments(doc.userId, invoiceDoc.id);
    const totalPaid = allPayments.reduce((sum: number, p: any) => sum + p.amount, 0);
    if (totalPaid >= invoiceDoc.totalAmount) {
      await storage.updateDocument(doc.userId, invoiceDoc.id, { status: 'paid' });
      if (invoiceDoc.sourceDocumentId) {
        await storage.updateDocument(doc.userId, invoiceDoc.sourceDocumentId, { status: 'paid' });
      }

      try {
        const project = invoiceDoc.projectId
          ? await storage.getProject(doc.userId, invoiceDoc.projectId)
          : null;
        if (project) {
          const STAGE_ORDER = ['new_lead', 'appointment_requested', 'draft', 'proposal_sent', 'accepted', 'scheduled', 'in_progress', 'invoiced', 'paid', 'completed', 'lost'];
          const currentIdx = STAGE_ORDER.indexOf(project.stage);
          const paidIdx = STAGE_ORDER.indexOf('paid');
          if (currentIdx !== -1 && paidIdx > currentIdx) {
            await storage.updateProject(doc.userId, project.id, { stage: 'paid' } as any);
            await storage.createProjectActivity(doc.userId, {
              projectId: project.id,
              type: 'stage_change',
              content: 'Stage changed to Paid (Stripe payment received)',
            });
            console.log(`[Webhook] Auto-advanced project ${project.id} to paid`);
          }
        }
      } catch (e) {
        console.error('[Webhook] Failed to advance project stage:', e);
      }
    } else {
      try {
        const project = invoiceDoc.projectId
          ? await storage.getProject(doc.userId, invoiceDoc.projectId)
          : null;
        if (project) {
          const STAGE_ORDER = ['new_lead', 'appointment_requested', 'draft', 'proposal_sent', 'accepted', 'scheduled', 'in_progress', 'invoiced', 'paid', 'completed', 'lost'];
          const currentIdx = STAGE_ORDER.indexOf(project.stage);
          const invoicedIdx = STAGE_ORDER.indexOf('invoiced');
          if (currentIdx !== -1 && invoicedIdx > currentIdx) {
            await storage.updateProject(doc.userId, project.id, { stage: 'invoiced' } as any);
            await storage.createProjectActivity(doc.userId, {
              projectId: project.id,
              type: 'stage_change',
              content: 'Stage changed to Invoiced (payment received)',
            });
            console.log(`[Webhook] Auto-advanced project ${project.id} to invoiced`);
          }
        }
      } catch (e) {
        console.error('[Webhook] Failed to advance project stage to invoiced:', e);
      }
    }

    try {
      const contact = await storage.getContact(doc.userId, doc.contactId);
      if (contact && contact.type === 'lead') {
        await storage.updateContact(doc.userId, doc.contactId, { type: 'client' });
      }
    } catch (e) {}

    emitToUser(doc.userId, doc.userId, { type: "payment.received", tenantId: doc.userId, documentId: invoiceDoc.id, projectId: invoiceDoc.projectId || undefined });
    emitToUser(doc.userId, doc.userId, { type: "document.updated", tenantId: doc.userId, documentId: invoiceDoc.id, projectId: invoiceDoc.projectId || undefined });
    if (invoiceDoc.sourceDocumentId) {
      emitToUser(doc.userId, doc.userId, { type: "document.updated", tenantId: doc.userId, documentId: invoiceDoc.sourceDocumentId, projectId: invoiceDoc.projectId || undefined });
    }
    if (invoiceDoc.projectId) {
      emitToUser(doc.userId, doc.userId, { type: "project.updated", tenantId: doc.userId, projectId: invoiceDoc.projectId });
    }
    emitToUser(doc.userId, doc.userId, { type: "dashboard.refresh", tenantId: doc.userId });

    try {
      const payerContact = await storage.getContact(doc.userId, doc.contactId);
      const payerName = payerContact?.name || 'Customer';
      const amountFormatted = `$${(amountTotal / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
      const isPaidInFull = totalPaid >= invoiceDoc.totalAmount;
      const remainingFormatted = isPaidInFull
        ? ''
        : ` ($${((invoiceDoc.totalAmount - totalPaid) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })} remaining)`;
      const statusSuffix = isPaidInFull ? ' — Paid in full' : remainingFormatted;

      // Deterministic dedup key + DB unique constraint: any concurrent retry
      // gets a no-op insert and is silently dropped (push fires only once).
      const dedupKey = `payment_received:${invoiceDoc.id}:stripe:${session.id}`;
      const [inserted] = await db.insert(notifications).values({
        userId: doc.userId,
        documentId: invoiceDoc.id,
        projectId: invoiceDoc.projectId || null,
        type: 'payment_received',
        title: `💰 Payment Received — ${amountFormatted}`,
        message: `${payerName} paid ${amountFormatted} via card${statusSuffix}`,
        link: `/documents/${invoiceDoc.id}`,
        metadata: { source: 'stripe', amount: amountTotal, paidInFull: isPaidInFull },
        dedupKey,
      }).onConflictDoNothing().returning({ id: notifications.id });

      if (inserted) {
        sendPushToUser(doc.userId, {
          title: `💰 Payment Received — ${amountFormatted}`,
          body: `${payerName} paid ${amountFormatted} via card${statusSuffix}`,
          url: `/documents/${invoiceDoc.id}`,
          tag: `payment-${invoiceDoc.id}-${session.id}`,
        }).catch(err => console.error('[Push] Stripe payment notification error:', err));
      }
    } catch (e) {
      console.error('[Webhook] payment notification insert error:', e);
    }

    emitToUser(doc.userId, doc.userId, { type: "notification.created", tenantId: doc.userId });

    console.log(`[Webhook] Customer payment recorded successfully for doc ${documentId}`);
  }
}
