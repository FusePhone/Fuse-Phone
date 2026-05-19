export interface EmailTemplateOptions {
  companyName?: string;
  companyLicense?: string;
  companyLogo?: string | null;
  companyPhone?: string;
  companyEmail?: string;
  companyWebsite?: string;
  recipientName?: string;
  ctaText?: string;
  ctaUrl?: string;
  preheader?: string;
  accentColor?: string;
  isHtmlBody?: boolean;
  unsubscribeUrl?: string;
}

function escapeHtml(str: string): string {
  const s = typeof str === 'string' ? str : String(str ?? '');
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function nl2br(text: string): string {
  const s = typeof text === 'string' ? text : String(text ?? '');
  return s.replace(/\n/g, '<br>');
}

function sanitizeUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('mailto:')) {
    return escapeHtml(trimmed);
  }
  return escapeHtml('https://' + trimmed);
}

function isEmailSafeLogoUrl(logo: string): boolean {
  const trimmed = logo.trim();
  if (trimmed.startsWith('data:')) return false;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return true;
  return false;
}

export function wrapEmailInTemplate(
  bodyText: string,
  options: EmailTemplateOptions = {}
): string {
  const {
    companyName = '',
    companyLicense,
    companyLogo,
    companyPhone,
    companyEmail,
    companyWebsite,
    ctaText,
    ctaUrl,
    preheader,
    accentColor = '#2563eb',
    isHtmlBody = false,
    unsubscribeUrl,
  } = options;

  const safeLogoUrl = companyLogo && isEmailSafeLogoUrl(companyLogo) ? companyLogo : null;
  const logoSection = safeLogoUrl
    ? `<img src="${sanitizeUrl(safeLogoUrl)}" alt="${escapeHtml(companyName)}" style="max-height:60px;max-width:200px;width:auto;height:auto;" />`
    : '';

  const headerName = companyName
    ? `<h1 style="margin:0;font-size:22px;font-weight:700;color:#1a1a2e;">${escapeHtml(companyName)}</h1>${companyLicense ? `<p style="margin:2px 0 0;font-size:11px;color:#9ca3af;">License: ${escapeHtml(companyLicense)}</p>` : ''}`
    : '';

  const ctaSection = ctaText && ctaUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px auto 8px;">
        <tr>
          <td align="center" style="border-radius:8px;background-color:${accentColor};">
            <a href="${sanitizeUrl(ctaUrl)}" target="_blank" style="display:inline-block;padding:14px 32px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
              ${escapeHtml(ctaText)}
            </a>
          </td>
        </tr>
      </table>`
    : '';

  const bodyContent = isHtmlBody ? bodyText : nl2br(escapeHtml(bodyText));

  const footerParts: string[] = [];
  if (companyName) footerParts.push(escapeHtml(companyName));
  if (companyPhone) footerParts.push(escapeHtml(companyPhone));
  if (companyEmail) footerParts.push(`<a href="mailto:${escapeHtml(companyEmail)}" style="color:#6b7280;text-decoration:underline;">${escapeHtml(companyEmail)}</a>`);
  if (companyWebsite) footerParts.push(`<a href="${sanitizeUrl(companyWebsite)}" style="color:#6b7280;text-decoration:underline;">${escapeHtml(companyWebsite)}</a>`);

  const preheaderHtml = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>${escapeHtml(companyName || 'Email')}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;">
${preheaderHtml}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f4f4f7;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="padding:28px 32px 20px;text-align:center;border-bottom:1px solid #eef0f3;">
            ${logoSection}
            ${logoSection && headerName ? '<div style="height:10px;"></div>' : ''}
            ${headerName}
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:28px 32px;font-size:15px;line-height:1.65;color:#374151;">
            ${bodyContent}
            ${ctaSection}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:20px 32px 24px;text-align:center;border-top:1px solid #eef0f3;font-size:12px;color:#9ca3af;line-height:1.6;">
            ${footerParts.length > 0 ? `<p style="margin:0 0 8px;">${footerParts.join(' &bull; ')}</p>` : ''}
            ${unsubscribeUrl ? `<p style="margin:0 0 6px;font-size:11px;"><a href="${sanitizeUrl(unsubscribeUrl)}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe</a> from marketing emails</p>` : ''}
            <p style="margin:0;font-size:11px;color:#b0b4ba;">Powered by <a href="https://fusephone.com" target="_blank" style="color:#2563eb;text-decoration:none;font-weight:600;">Fuse Phone</a></p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
