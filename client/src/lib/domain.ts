const MARKETING_DOMAINS = ['fusephone.com', 'www.fusephone.com'];
const APP_DOMAIN = 'app.fusephone.com';
const AFFILIATE_DOMAIN = 'affiliate.fusephone.com';
const KNOWN_DOMAINS = ['fusephone.com', 'www.fusephone.com', 'app.fusephone.com', 'affiliate.fusephone.com', 'localhost'];

const FORCE_DARK_PATHS = ['/calculator', '/auth'];

export function isMarketingDomain(): boolean {
  const hostname = window.location.hostname;
  return MARKETING_DOMAINS.includes(hostname);
}

export function isAffiliateDomain(): boolean {
  const hostname = window.location.hostname;
  return hostname === AFFILIATE_DOMAIN;
}

export function shouldForceDarkTheme(): boolean {
  if (isMarketingDomain()) return true;
  if (isAffiliateDomain()) return true;
  return FORCE_DARK_PATHS.includes(window.location.pathname);
}

export function isAppDomain(): boolean {
  const hostname = window.location.hostname;
  return hostname === APP_DOMAIN;
}

export function getAffiliateUrl(path: string = '/'): string {
  if (isAffiliateDomain()) return path;
  return `https://${AFFILIATE_DOMAIN}${path}`;
}

export function getAppUrl(path: string = '/'): string {
  if (isAppDomain()) {
    return path;
  }
  return `https://${APP_DOMAIN}${path}`;
}

export function getMarketingUrl(path: string = '/'): string {
  if (isMarketingDomain()) {
    return path;
  }
  return `https://fusephone.com${path}`;
}

export function isCustomDomain(): boolean {
  const hostname = window.location.hostname;
  return !KNOWN_DOMAINS.includes(hostname) && !hostname.endsWith('.replit.dev') && !hostname.endsWith('.repl.co');
}

export function getCustomDomainHost(): string | null {
  if (!isCustomDomain()) return null;
  return window.location.hostname;
}
