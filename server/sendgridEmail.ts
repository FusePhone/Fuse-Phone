import sgMail from '@sendgrid/mail';

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || '';

if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
}

export function isSendGridConfigured(): boolean {
  return !!SENDGRID_API_KEY;
}

interface DomainAuthResult {
  domainId: number;
  domain: string;
  dnsRecords: Array<{
    type: string;
    host: string;
    data: string;
    valid: boolean;
  }>;
}

export async function authenticateDomain(domain: string): Promise<DomainAuthResult> {
  if (!SENDGRID_API_KEY) {
    throw new Error('SendGrid is not configured');
  }

  const res = await fetch('https://api.sendgrid.com/v3/whitelabel/domains', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      domain,
      automatic_security: true,
    }),
  });

  if (!res.ok) {
    const error = await res.json();
    console.error('[SendGrid] Domain auth error:', JSON.stringify(error));
    if (error.errors?.[0]?.message?.includes('already exists')) {
      throw new Error('This domain is already registered. Please contact support or try a different domain.');
    }
    throw new Error(error.errors?.[0]?.message || 'Failed to register domain with SendGrid');
  }

  const data = await res.json();
  console.log('[SendGrid] Domain authenticated:', data.id, data.domain);

  const dnsRecords: DomainAuthResult['dnsRecords'] = [];

  if (data.dns) {
    for (const [, record] of Object.entries(data.dns) as any) {
      if (record.host && record.data) {
        dnsRecords.push({
          type: record.type || 'CNAME',
          host: record.host,
          data: record.data,
          valid: record.valid || false,
        });
      }
    }
  }

  return {
    domainId: data.id,
    domain: data.domain,
    dnsRecords,
  };
}

export async function getDomainDnsRecords(domainId: number): Promise<{
  verified: boolean;
  dnsRecords: Array<{
    type: string;
    host: string;
    data: string;
    valid: boolean;
  }>;
}> {
  if (!SENDGRID_API_KEY) {
    throw new Error('SendGrid is not configured');
  }

  const res = await fetch(`https://api.sendgrid.com/v3/whitelabel/domains/${domainId}`, {
    headers: {
      'Authorization': `Bearer ${SENDGRID_API_KEY}`,
    },
  });

  if (!res.ok) {
    throw new Error('Failed to fetch domain records');
  }

  const data = await res.json();
  const dnsRecords: Array<{ type: string; host: string; data: string; valid: boolean }> = [];

  if (data.dns) {
    for (const [, record] of Object.entries(data.dns) as any) {
      if (record.host && record.data) {
        dnsRecords.push({
          type: record.type || 'CNAME',
          host: record.host,
          data: record.data,
          valid: record.valid || false,
        });
      }
    }
  }

  return {
    verified: data.valid || false,
    dnsRecords,
  };
}

export async function verifyDomain(domainId: number): Promise<{
  verified: boolean;
  dnsRecords: Array<{ type: string; host: string; data: string; valid: boolean }>;
}> {
  if (!SENDGRID_API_KEY) {
    throw new Error('SendGrid is not configured');
  }

  const res = await fetch(`https://api.sendgrid.com/v3/whitelabel/domains/${domainId}/validate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const error = await res.json();
    console.error('[SendGrid] Verify error:', JSON.stringify(error));
    throw new Error('Verification failed. Make sure you added the DNS records correctly.');
  }

  const data = await res.json();
  console.log('[SendGrid] Domain validation result:', data.valid, 'id:', domainId);

  const dnsRecords: Array<{ type: string; host: string; data: string; valid: boolean }> = [];
  if (data.validation_results) {
    for (const [, result] of Object.entries(data.validation_results) as any) {
      if (result.host && result.reason) {
        dnsRecords.push({
          type: result.type || 'CNAME',
          host: result.host,
          data: result.reason,
          valid: result.valid || false,
        });
      }
    }
  }

  return {
    verified: data.valid || false,
    dnsRecords,
  };
}

export async function deleteDomain(domainId: number): Promise<void> {
  if (!SENDGRID_API_KEY) return;

  await fetch(`https://api.sendgrid.com/v3/whitelabel/domains/${domainId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${SENDGRID_API_KEY}`,
    },
  });
  console.log('[SendGrid] Domain deleted:', domainId);
}

export async function sendSendGridEmail(
  to: string,
  subject: string,
  htmlBody: string,
  fromEmail: string,
  fromName?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!SENDGRID_API_KEY) {
    return { success: false, error: 'SendGrid is not configured' };
  }

  try {
    const msg = {
      to,
      from: {
        email: fromEmail,
        name: fromName || fromEmail.split('@')[0],
      },
      subject,
      html: htmlBody,
    };

    const [response] = await sgMail.send(msg);
    const messageId = response.headers?.['x-message-id'] || undefined;
    console.log(`[SendGrid] Email sent to ${to} from ${fromEmail}, messageId: ${messageId}`);
    return { success: true, messageId };
  } catch (error: any) {
    console.error('[SendGrid] Send error:', error.message);
    if (error.response?.body) {
      console.error('[SendGrid] Error details:', JSON.stringify(error.response.body));
    }
    return { success: false, error: error.message };
  }
}
