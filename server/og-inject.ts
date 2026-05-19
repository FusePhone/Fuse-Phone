import { type Request, type Response, type Express } from "express";
import { db } from "./db";
import { companySettings, documents, users } from "@shared/schema";
import { and, eq } from "drizzle-orm";
import crypto from "crypto";
import sharp from "sharp";

interface CompanyInfo {
  name: string;
  logo: string;
}

interface CompanyCacheEntry extends CompanyInfo {
  ts: number;
}

const companyByDomainCache = new Map<string, CompanyCacheEntry>();
const companyByTokenCache = new Map<string, CompanyCacheEntry>();
const ogImageCache = new Map<string, { png: Buffer; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000;
const OG_IMAGE_CACHE_TTL = 30 * 60 * 1000;

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    const buf = Buffer.alloc(b.length);
    crypto.timingSafeEqual(buf, Buffer.from(b));
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

async function lookupCompanyByDomain(cleanHost: string): Promise<CompanyInfo | null> {
  const cached = companyByDomainCache.get(cleanHost);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return { name: cached.name, logo: cached.logo };
  }

  try {
    const settings = await db.select({
      companyName: companySettings.companyName,
      logo: companySettings.logo,
    }).from(companySettings).where(
      and(
        eq(companySettings.customDomain, cleanHost),
        eq(companySettings.customDomainVerified, true),
        eq(companySettings.whiteLabelEnabled, true),
      )
    ).limit(1);

    if (!settings.length || !settings[0].companyName) {
      return null;
    }

    const entry: CompanyCacheEntry = {
      name: settings[0].companyName,
      logo: settings[0].logo || '',
      ts: Date.now(),
    };
    companyByDomainCache.set(cleanHost, entry);
    return { name: entry.name, logo: entry.logo };
  } catch (err) {
    console.error('[OG-Inject] Error looking up company by domain:', err);
    return null;
  }
}

async function lookupCompanyByDocToken(token: string): Promise<CompanyInfo | null> {
  const cached = companyByTokenCache.get(token);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return { name: cached.name, logo: cached.logo };
  }

  try {
    const docs = await db.select({
      userId: documents.userId,
    }).from(documents).where(
      eq(documents.publicToken, token)
    ).limit(1);

    if (!docs.length) return null;

    const userId = docs[0].userId;

    const settings = await db.select({
      companyName: companySettings.companyName,
      logo: companySettings.logo,
    }).from(companySettings).where(
      eq(companySettings.userId, userId)
    ).limit(1);

    if (settings.length && settings[0].companyName) {
      const entry: CompanyCacheEntry = {
        name: settings[0].companyName,
        logo: settings[0].logo || '',
        ts: Date.now(),
      };
      companyByTokenCache.set(token, entry);
      return { name: entry.name, logo: entry.logo };
    }

    const userRows = await db.select({
      username: users.username,
    }).from(users).where(
      eq(users.id, userId)
    ).limit(1);

    if (userRows.length && userRows[0].username) {
      const entry: CompanyCacheEntry = {
        name: userRows[0].username,
        logo: '',
        ts: Date.now(),
      };
      companyByTokenCache.set(token, entry);
      return { name: entry.name, logo: '' };
    }

    return null;
  } catch (err) {
    console.error('[OG-Inject] Error looking up company by token:', err);
    return null;
  }
}

function extractDocToken(url: string): string | null {
  const match = url.match(/\/portal\/document\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

async function fetchLogoAsBase64(logoUrl: string): Promise<string | null> {
  if (!logoUrl) return null;
  try {
    const res = await fetch(logoUrl);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const resized = await sharp(buf)
      .resize(120, 120, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();
    return `data:image/png;base64,${resized.toString('base64')}`;
  } catch {
    return null;
  }
}

function generateOGSvg(companyName: string, subtitle: string, logoBase64: string | null): string {
  const W = 1200;
  const H = 630;

  const nameParts = companyName.length > 30
    ? splitText(companyName, 28)
    : [companyName];

  const logoSection = logoBase64
    ? `<image href="${logoBase64}" x="${(W - 100) / 2}" y="140" width="100" height="100" />`
    : '';

  const textStartY = logoBase64 ? 290 : 260;

  const nameLines = nameParts.map((line, i) =>
    `<text x="${W / 2}" y="${textStartY + i * 52}" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="42" font-weight="700" fill="#ffffff" text-anchor="middle">${escapeXml(line)}</text>`
  ).join('\n    ');

  const subtitleY = textStartY + nameParts.length * 52 + 30;

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1a1a2e" />
      <stop offset="100%" style="stop-color:#16213e" />
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)" />
  <rect x="40" y="40" width="${W - 80}" height="${H - 80}" rx="20" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="2" />
  ${logoSection}
  ${nameLines}
  <text x="${W / 2}" y="${subtitleY}" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="22" fill="rgba(255,255,255,0.6)" text-anchor="middle">${escapeXml(subtitle)}</text>
  <rect x="${(W - 200) / 2}" y="${subtitleY + 30}" width="200" height="3" rx="2" fill="rgba(255,255,255,0.15)" />
</svg>`;
}

function splitText(text: string, maxLen: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (current && (current + ' ' + word).length > maxLen) {
      lines.push(current);
      current = word;
    } else {
      current = current ? current + ' ' + word : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

async function generateOGImagePng(cacheKey: string, companyName: string, subtitle: string, logoUrl: string): Promise<Buffer | null> {
  const cachedImg = ogImageCache.get(cacheKey);
  if (cachedImg && Date.now() - cachedImg.ts < OG_IMAGE_CACHE_TTL) {
    return cachedImg.png;
  }

  const logoBase64 = await fetchLogoAsBase64(logoUrl);
  const svg = generateOGSvg(companyName, subtitle, logoBase64);

  try {
    const png = await sharp(Buffer.from(svg))
      .resize(1200, 630)
      .png()
      .toBuffer();

    ogImageCache.set(cacheKey, { png, ts: Date.now() });
    return png;
  } catch (err) {
    console.error('[OG-Image] Error generating image:', err);
    return null;
  }
}

export function registerOGImageRoute(app: Express): void {
  app.get('/api/og-image', async (req: Request, res: Response) => {
    const domain = typeof req.query.domain === 'string' ? req.query.domain : '';
    const token = typeof req.query.token === 'string' ? req.query.token : '';

    let company: CompanyInfo | null = null;
    let cacheKey = '';
    let subtitle = '';

    if (token) {
      company = await lookupCompanyByDocToken(token);
      cacheKey = `token:${token}`;
      subtitle = 'View Your Project Details';
    } else if (domain) {
      const cleanHost = domain.replace(/:\d+$/, '').toLowerCase();
      company = await lookupCompanyByDomain(cleanHost);
      cacheKey = `domain:${cleanHost}`;
      subtitle = cleanHost;
    }

    if (!company) {
      res.status(404).send('Company not found');
      return;
    }

    const png = await generateOGImagePng(cacheKey, company.name, subtitle, company.logo);
    if (!png) {
      res.status(500).send('Failed to generate image');
      return;
    }

    res.set({
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=1800',
    });
    res.send(png);
  });
}

export async function injectCustomDomainOGTags(req: Request, html: string): Promise<string> {
  const secret = process.env.WORKER_AUTH_SECRET;
  const workerAuth = req.get('x-worker-auth');
  const customDomain = req.get('x-custom-domain');
  const isCustomDomain = !!(secret && customDomain && workerAuth && timingSafeEqual(workerAuth, secret));

  const docToken = extractDocToken(req.originalUrl);

  let company: CompanyInfo | null = null;
  let cleanHost = '';

  if (isCustomDomain) {
    cleanHost = customDomain!.replace(/:\d+$/, '').toLowerCase();
    company = await lookupCompanyByDomain(cleanHost);
  }

  if (!company && docToken) {
    company = await lookupCompanyByDocToken(docToken);
  }

  if (!company) {
    return html;
  }

  let safeUrl: string;
  const host = cleanHost || req.get('host') || '';
  try {
    const parsed = new URL(req.originalUrl, `https://${host}`);
    safeUrl = parsed.href;
  } catch {
    safeUrl = `https://${escapeHtml(host)}/`;
  }

  const ogImageParams = docToken
    ? `token=${encodeURIComponent(docToken)}`
    : `domain=${encodeURIComponent(cleanHost)}`;
  const ogImageUrl = `https://${escapeHtml(host)}/api/og-image?${ogImageParams}`;

  const ogTags = [
    `<meta property="og:title" content="${escapeHtml(company.name)}" />`,
    `<meta property="og:description" content="View your project details and documents" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${escapeHtml(safeUrl)}" />`,
    `<meta property="og:image" content="${ogImageUrl}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(company.name)}" />`,
    `<meta name="twitter:description" content="View your project details and documents" />`,
    `<meta name="twitter:image" content="${ogImageUrl}" />`,
  ].join('\n    ');

  return html.replace(
    '<title>Fuse Phone</title>',
    `<title>${escapeHtml(company.name)}</title>\n    ${ogTags}`
  );
}

export function setOGCacheHeaders(res: Response, isCustomDomain: boolean): void {
  if (isCustomDomain) {
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Vary': 'X-Custom-Domain',
    });
  } else {
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    });
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
