import type { CompanySettings } from "@shared/schema";

function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('1') && digits.length === 11) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (phone.startsWith('+')) return phone;
  return `+${digits}`;
}

export interface SendSmsOptions {
  to: string;
  body: string;
  from?: string;
  mediaUrl?: string[];
}

export interface SendSmsResult {
  success: boolean;
  sid?: string;
  provider: 'twilio' | 'openphone';
  error?: string;
}

export async function sendSms(settings: CompanySettings, options: SendSmsOptions): Promise<SendSmsResult> {
  const provider = settings.phoneProvider || 'twilio';

  if (provider === 'openphone') {
    if (options.mediaUrl && options.mediaUrl.length > 0) {
      console.warn('[SMS Provider] OpenPhone does not support MMS/media attachments - sending text only');
    }
    return sendViaOpenPhone(settings, options);
  }
  return sendViaTwilio(settings, options);
}

async function sendViaTwilio(settings: CompanySettings, options: SendSmsOptions): Promise<SendSmsResult> {
  if (!settings.twilioAccountSid || !settings.twilioAuthToken) {
    return { success: false, provider: 'twilio', error: 'Twilio credentials not configured' };
  }

  const twilio = await import('twilio');
  const client = twilio.default(settings.twilioAccountSid, settings.twilioAuthToken);

  const messageOptions: Record<string, any> = {
    to: toE164(options.to),
    body: options.body,
  };

  if (settings.twilioMessagingServiceSid) {
    messageOptions.messagingServiceSid = settings.twilioMessagingServiceSid;
  } else {
    messageOptions.from = options.from || settings.twilioPhoneNumber;
  }

  if (options.mediaUrl && options.mediaUrl.length > 0) {
    messageOptions.mediaUrl = options.mediaUrl;
  }

  try {
    const message = await client.messages.create(messageOptions);
    return { success: true, sid: message.sid, provider: 'twilio' };
  } catch (err: any) {
    return { success: false, provider: 'twilio', error: err.message || 'Failed to send via Twilio' };
  }
}

async function sendViaOpenPhone(settings: CompanySettings, options: SendSmsOptions): Promise<SendSmsResult> {
  if (!settings.openphoneApiKey || !settings.openphonePhoneNumber) {
    return { success: false, provider: 'openphone', error: 'OpenPhone credentials not configured' };
  }

  try {
    let toNumber = options.to.replace(/[\s\-\(\)\.]/g, '');
    if (!toNumber.startsWith('+')) {
      toNumber = toNumber.startsWith('1') ? `+${toNumber}` : `+1${toNumber}`;
    }

    let fromValue = settings.openphonePhoneNumber;
    if (!fromValue.startsWith('+')) {
      const digits = fromValue.replace(/\D/g, '');
      if (digits.length >= 10) {
        fromValue = digits.startsWith('1') ? `+${digits}` : `+1${digits}`;
      }
    }

    const requestBody = {
      content: options.body,
      to: [toNumber],
      from: fromValue,
    };

    console.log(`[OpenPhone] Sending SMS: from=${fromValue}, to=${toNumber}, contentLength=${options.body.length}`);

    const response = await fetch('https://api.openphone.com/v1/messages', {
      method: 'POST',
      headers: {
        'Authorization': settings.openphoneApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage: string;
      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.message || errorData.error || JSON.stringify(errorData);
      } catch {
        errorMessage = errorText;
      }
      console.error(`[OpenPhone] API error ${response.status}: ${errorMessage}`);
      return {
        success: false,
        provider: 'openphone',
        error: errorMessage || `OpenPhone API error: ${response.status}`,
      };
    }

    const data = await response.json() as any;
    console.log(`[OpenPhone] Message sent successfully, id=${data.data?.id || data.id}`);
    return { success: true, sid: data.data?.id || data.id, provider: 'openphone' };
  } catch (err: any) {
    console.error(`[OpenPhone] Send error:`, err);
    return { success: false, provider: 'openphone', error: err.message || 'Failed to send via OpenPhone' };
  }
}

export function getPhoneProvider(settings: CompanySettings | null | undefined): 'twilio' | 'openphone' | null {
  if (!settings) return null;
  return (settings.phoneProvider as 'twilio' | 'openphone') || 'twilio';
}

export function canMakeCalls(settings: CompanySettings | null | undefined): boolean {
  if (!settings) return false;
  const provider = settings.phoneProvider || 'twilio';
  if (provider === 'openphone') return false;
  return !!(settings.twilioAccountSid && settings.twilioAuthToken && settings.twilioPhoneNumber);
}

export function canSendSms(settings: CompanySettings | null | undefined): boolean {
  if (!settings) return false;
  const provider = settings.phoneProvider || 'twilio';
  if (provider === 'openphone') {
    return !!(settings.openphoneApiKey && settings.openphonePhoneNumber);
  }
  return !!(settings.twilioAccountSid && settings.twilioAuthToken && (settings.twilioPhoneNumber || settings.twilioMessagingServiceSid));
}
