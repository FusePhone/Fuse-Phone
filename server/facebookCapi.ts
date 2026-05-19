import crypto from 'crypto';

type CapiEventName = 'Lead' | 'Purchase' | 'QualifiedLead' | 'Other';

interface CapiEventParams {
  pixelId: string;
  accessToken: string;
  eventName: CapiEventName;
  customEventName?: string;
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  value?: number;
  currency?: string;
  eventId?: string;
  actionSource?: string;
  customData?: Record<string, any>;
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

export async function sendFacebookCapiEvent(params: CapiEventParams): Promise<{ success: boolean; error?: string }> {
  const {
    pixelId,
    accessToken,
    eventName,
    customEventName,
    email,
    phone,
    firstName,
    lastName,
    city,
    state,
    zipCode,
    value,
    currency = 'USD',
    eventId,
    actionSource = 'system_generated',
    customData,
  } = params;

  const userData: Record<string, any> = {};
  if (email) userData.em = [sha256(email)];
  if (phone) {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned) userData.ph = [sha256(cleaned)];
  }
  if (firstName) userData.fn = [sha256(firstName)];
  if (lastName) userData.ln = [sha256(lastName)];
  if (city) userData.ct = [sha256(city)];
  if (state) userData.st = [sha256(state)];
  if (zipCode) userData.zp = [sha256(zipCode)];

  const resolvedEventName = eventName === 'Other' ? (customEventName || 'CustomEvent') : eventName;

  const eventData: Record<string, any> = {
    event_name: resolvedEventName,
    event_time: Math.floor(Date.now() / 1000),
    action_source: actionSource,
    user_data: userData,
  };

  if (eventId) {
    eventData.event_id = eventId;
  }

  const mergedCustomData: Record<string, any> = {};
  if (value !== undefined && value > 0) {
    mergedCustomData.value = value;
    mergedCustomData.currency = currency;
  }
  if (customData) {
    Object.assign(mergedCustomData, customData);
  }
  if (Object.keys(mergedCustomData).length > 0) {
    eventData.custom_data = mergedCustomData;
  }

  try {
    const url = `https://graph.facebook.com/v22.0/${pixelId}/events`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: [eventData],
        access_token: accessToken,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      const errMsg = result?.error?.message || JSON.stringify(result);
      console.error(`[Facebook CAPI] Error sending ${resolvedEventName} event:`, errMsg);
      return { success: false, error: errMsg };
    }

    console.log(`[Facebook CAPI] ${resolvedEventName} event sent successfully (events_received: ${result?.events_received || 0})`);
    return { success: true };
  } catch (err: any) {
    console.error(`[Facebook CAPI] Failed to send ${resolvedEventName} event:`, err.message);
    return { success: false, error: err.message };
  }
}

export async function sendFBLeadEvent(userId: string, contact: { email?: string | null; phone?: string | null; name?: string | null; city?: string | null; state?: string | null; zipCode?: string | null }, settings: { facebookPixelId?: string | null; facebookCapiToken?: string | null; facebookUserToken?: string | null }, contactId: number): Promise<void> {
  const capiToken = settings.facebookCapiToken || settings.facebookUserToken;
  if (!settings.facebookPixelId || !capiToken) return;

  const nameParts = (contact.name || '').split(' ');
  try {
    await sendFacebookCapiEvent({
      pixelId: settings.facebookPixelId,
      accessToken: capiToken,
      eventName: 'Lead',
      email: contact.email,
      phone: contact.phone,
      firstName: nameParts[0] || undefined,
      lastName: nameParts.slice(1).join(' ') || undefined,
      city: contact.city,
      state: contact.state,
      zipCode: contact.zipCode,
      eventId: `lead_received_${userId}_${contactId}`,
    });
  } catch (e: any) {
    console.error('[Facebook CAPI] Failed to send Lead event on lead creation:', e.message);
  }
}

export async function sendFBQualityEvent(userId: string, contact: { email?: string | null; phone?: string | null; name?: string | null; city?: string | null; state?: string | null; zipCode?: string | null }, settings: { facebookPixelId?: string | null; facebookCapiToken?: string | null; facebookUserToken?: string | null }, projectId: number, quality: string): Promise<void> {
  const capiToken = settings.facebookCapiToken || settings.facebookUserToken;
  if (!settings.facebookPixelId || !capiToken) return;
  if (quality !== 'good') return;

  const nameParts = (contact.name || '').split(' ');
  try {
    await sendFacebookCapiEvent({
      pixelId: settings.facebookPixelId,
      accessToken: capiToken,
      eventName: 'Other',
      customEventName: 'QualifiedLead',
      email: contact.email,
      phone: contact.phone,
      firstName: nameParts[0] || undefined,
      lastName: nameParts.slice(1).join(' ') || undefined,
      city: contact.city,
      state: contact.state,
      zipCode: contact.zipCode,
      eventId: `qualified_lead_${userId}_${projectId}`,
      customData: { lead_quality: quality },
    });
  } catch (e: any) {
    console.error('[Facebook CAPI] Failed to send QualifiedLead event:', e.message);
  }
}

export async function sendFBPaymentEvent(userId: string, contact: { email?: string | null; phone?: string | null; name?: string | null; city?: string | null; state?: string | null; zipCode?: string | null }, settings: { facebookPixelId?: string | null; facebookCapiToken?: string | null; facebookUserToken?: string | null }, paymentId: number, amountCents: number, isPaidInFull: boolean): Promise<void> {
  const capiToken = settings.facebookCapiToken || settings.facebookUserToken;
  if (!settings.facebookPixelId || !capiToken) return;

  const nameParts = (contact.name || '').split(' ');
  try {
    await sendFacebookCapiEvent({
      pixelId: settings.facebookPixelId,
      accessToken: capiToken,
      eventName: 'Purchase',
      email: contact.email,
      phone: contact.phone,
      firstName: nameParts[0] || undefined,
      lastName: nameParts.slice(1).join(' ') || undefined,
      city: contact.city,
      state: contact.state,
      zipCode: contact.zipCode,
      value: amountCents / 100,
      eventId: `payment_${userId}_${paymentId}`,
      customData: { paid_in_full: isPaidInFull },
    });
  } catch (e: any) {
    console.error('[Facebook CAPI] Failed to send Purchase/payment event:', e.message);
  }
}
