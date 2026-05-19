import jwt from "jsonwebtoken";
import { compactVerify, importX509, decodeProtectedHeader } from "jose";
import { X509Certificate } from "node:crypto";

const APPLE_ROOT_CA_G3_PEM = `-----BEGIN CERTIFICATE-----
MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwS
QXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9u
IEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcN
MTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBS
b290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9y
aXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49
AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtf
TjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517
IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySr
MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gA
MGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4
at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM
6BgD56KyKA==
-----END CERTIFICATE-----`;

let cachedAppleRoot: X509Certificate | null = null;
function getAppleRoot(): X509Certificate {
  if (!cachedAppleRoot) cachedAppleRoot = new X509Certificate(APPLE_ROOT_CA_G3_PEM);
  return cachedAppleRoot;
}

function getEnv() {
  return (process.env.APPLE_IAP_ENV || "sandbox").toLowerCase();
}

function apiBase(env?: string): string {
  return (env || getEnv()) === "production"
    ? "https://api.storekit.itunes.apple.com"
    : "https://api.storekit-sandbox.itunes.apple.com";
}

export function isAppleIAPConfigured(): boolean {
  return !!(
    process.env.APPLE_IAP_KEY_ID &&
    process.env.APPLE_IAP_ISSUER_ID &&
    process.env.APPLE_IAP_PRIVATE_KEY &&
    process.env.APPLE_IAP_BUNDLE_ID
  );
}

function normalizeP8Key(raw: string): string {
  if (!raw) return raw;
  let key = raw.trim();
  // Convert literal \n sequences to real newlines
  key = key.replace(/\\n/g, "\n");
  // If the key has the BEGIN/END markers but no real newlines (Replit Secrets
  // sometimes flattens pastes — newlines become spaces), reconstruct the PEM:
  // strip headers, collapse the base64 middle, then re-wrap with proper newlines.
  const beginMarker = "-----BEGIN PRIVATE KEY-----";
  const endMarker = "-----END PRIVATE KEY-----";
  if (key.includes(beginMarker) && key.includes(endMarker)) {
    const beginIdx = key.indexOf(beginMarker);
    const endIdx = key.indexOf(endMarker);
    if (beginIdx >= 0 && endIdx > beginIdx) {
      const middle = key
        .substring(beginIdx + beginMarker.length, endIdx)
        .replace(/[\s\r\n]+/g, ""); // strip all whitespace from base64 body
      // Re-wrap base64 at 64 chars per line (standard PEM)
      const wrapped = middle.match(/.{1,64}/g)?.join("\n") || middle;
      key = `${beginMarker}\n${wrapped}\n${endMarker}\n`;
    }
  }
  return key;
}

function generateAppStoreServerJWT(): string {
  const privateKey = normalizeP8Key(process.env.APPLE_IAP_PRIVATE_KEY || "");
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iss: process.env.APPLE_IAP_ISSUER_ID,
      iat: now,
      exp: now + 1200,
      aud: "appstoreconnect-v1",
      bid: process.env.APPLE_IAP_BUNDLE_ID,
    },
    privateKey,
    {
      algorithm: "ES256",
      header: {
        alg: "ES256",
        kid: process.env.APPLE_IAP_KEY_ID || "",
        typ: "JWT",
      },
    },
  );
}

export type AppleTransactionInfo = {
  transactionId: string;
  originalTransactionId: string;
  productId: string;
  expiresDate?: number;
  purchaseDate?: number;
  originalPurchaseDate?: number;
  appAccountToken?: string;
  type?: string;
};

function decodeJwsPayloadUnsafe(jws: string): any | null {
  const parts = jws.split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export async function fetchAppleTransaction(
  transactionId: string,
): Promise<AppleTransactionInfo | null> {
  if (!isAppleIAPConfigured()) return null;
  const token = generateAppStoreServerJWT();
  const tryEnv = async (env: "production" | "sandbox") => {
    const url = `${apiBase(env)}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`;
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!resp.ok) return { ok: false, status: resp.status };
    const data: any = await resp.json();
    const decoded = decodeJwsPayloadUnsafe(data.signedTransactionInfo);
    return { ok: true, decoded };
  };

  const primary = getEnv() === "production" ? "production" : "sandbox";
  const fallback = primary === "production" ? "sandbox" : "production";

  let result = await tryEnv(primary as any);
  if (!result.ok && (result.status === 404 || result.status === 401)) {
    result = await tryEnv(fallback as any);
  }
  if (!result.ok || !result.decoded) return null;
  return result.decoded as AppleTransactionInfo;
}

/**
 * Fetch all subscription statuses for an Apple originalTransactionId.
 *
 * Returns Apple's raw `/inApps/v1/subscriptions/{transactionId}` payload:
 * one entry per subscription group, each with `lastTransactions[]` carrying
 * BOTH `signedTransactionInfo` AND `signedRenewalInfo`. The renewal info
 * is the only place where Apple exposes `autoRenewProductId` — i.e. the
 * tier the user has queued to switch to at next renewal. The webhook does
 * surface this too (DID_CHANGE_RENEWAL_PREF/DOWNGRADE) but Apple delivery
 * can lag minutes, especially in sandbox; calling this endpoint right
 * after a tier sync lets us light up the "Downgrading to X on Y" banner
 * immediately.
 *
 * Auto-falls back to the other environment (sandbox <-> production) on
 * 404/401, mirroring fetchAppleTransaction's pattern, so it works during
 * sandbox testing and in production without configuration changes.
 */
export type AppleLastTransaction = {
  originalTransactionId: string;
  status: number;
  signedTransactionInfo: string;
  signedRenewalInfo?: string;
};
export type AppleSubscriptionStatusGroup = {
  subscriptionGroupIdentifier: string;
  lastTransactions: AppleLastTransaction[];
};
export type AppleSubscriptionStatuses = {
  environment?: string;
  bundleId?: string;
  data: AppleSubscriptionStatusGroup[];
};

export async function fetchAppleSubscriptionStatuses(
  originalTransactionId: string,
): Promise<AppleSubscriptionStatuses | null> {
  if (!isAppleIAPConfigured()) return null;
  if (!originalTransactionId) return null;
  const token = generateAppStoreServerJWT();
  const tryEnv = async (env: "production" | "sandbox") => {
    const url = `${apiBase(env)}/inApps/v1/subscriptions/${encodeURIComponent(originalTransactionId)}`;
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!resp.ok) return { ok: false as const, status: resp.status };
    const data: any = await resp.json();
    return { ok: true as const, data };
  };
  const primary = getEnv() === "production" ? "production" : "sandbox";
  const fallback = primary === "production" ? "sandbox" : "production";
  let result = await tryEnv(primary as any);
  if (!result.ok && (result.status === 404 || result.status === 401)) {
    result = await tryEnv(fallback as any);
  }
  if (!result.ok) {
    console.warn(
      `[AppleIAP] fetchAppleSubscriptionStatuses(${originalTransactionId}) failed: HTTP ${result.status}`,
    );
    return null;
  }
  return result.data as AppleSubscriptionStatuses;
}

export async function verifyAppleSignedPayload(jws: string): Promise<any | null> {
  try {
    const header: any = decodeProtectedHeader(jws);
    const x5c: string[] = Array.isArray(header.x5c) ? header.x5c : [];
    if (x5c.length === 0) {
      console.warn("[AppleIAP] JWS missing x5c chain");
      return null;
    }

    const certs = x5c.map((b64) => new X509Certificate(Buffer.from(b64, "base64")));
    const leaf = certs[0];
    const intermediate = certs[1];
    const root = certs[2];
    const trustedRoot = getAppleRoot();

    const now = Date.now();
    for (const c of certs) {
      const validFrom = new Date(c.validFrom).getTime();
      const validTo = new Date(c.validTo).getTime();
      if (isNaN(validFrom) || isNaN(validTo) || now < validFrom || now > validTo) {
        console.warn("[AppleIAP] cert outside validity window");
        return null;
      }
    }

    // Strict chain validation: leaf -> intermediate -> root, AND root MUST be
    // the hardcoded Apple Root CA G3 (matched by SHA-256 fingerprint).
    // Anything else — even a self-signed chain or a different Apple CA — is
    // rejected. This prevents an attacker from supplying a forged x5c chain.
    const presentedRoot = certs[certs.length - 1];
    if (presentedRoot.fingerprint256 !== trustedRoot.fingerprint256) {
      console.warn("[AppleIAP] root certificate is not Apple Root CA G3");
      return null;
    }
    if (intermediate && !leaf.verify(intermediate.publicKey)) {
      console.warn("[AppleIAP] leaf cert not signed by intermediate");
      return null;
    }
    if (intermediate && root && !intermediate.verify(root.publicKey)) {
      console.warn("[AppleIAP] intermediate cert not signed by root");
      return null;
    }
    // Self-signed leaf-only or 2-cert chains are not produced by Apple — reject.
    if (certs.length < 3) {
      console.warn("[AppleIAP] chain too short (expected 3 certs)");
      return null;
    }

    const leafPem = `-----BEGIN CERTIFICATE-----\n${x5c[0]}\n-----END CERTIFICATE-----`;
    const publicKey = await importX509(leafPem, header.alg || "ES256");
    const { payload } = await compactVerify(jws, publicKey);
    return JSON.parse(new TextDecoder().decode(payload));
  } catch (err) {
    console.error("[AppleIAP] verifyAppleSignedPayload failed:", err);
    return null;
  }
}

export type AppleAddon = "whiteLabel" | "fuseAi" | "aiAssistant";

// Apple Product IDs (auto-renewable subscriptions) created in App Store Connect.
// Exact-match allowlists — anything else is rejected. This eliminates the risk
// of fuzzy matching granting entitlements for unintended product IDs that
// happen to share tokens (e.g. a future "starter_elite_bundle").
export const APPLE_TIER_PRODUCT_IDS: Record<"starter" | "core" | "elite", string> = {
  starter: "starter_monthly",
  core: "core_monthly",
  elite: "elite_monthly",
};

export const APPLE_ADDON_PRODUCT_IDS: Record<AppleAddon, string> = {
  whiteLabel: "make_it_your_own_monthly",
  fuseAi: "fuse_ai_monthly",
  aiAssistant: "ai_assistant_monthly",
};

const TIER_PRODUCT_ID_TO_TIER: Record<string, "starter" | "core" | "elite"> = Object.fromEntries(
  (Object.entries(APPLE_TIER_PRODUCT_IDS) as ["starter" | "core" | "elite", string][])
    .map(([tier, id]) => [id, tier]),
);

const ADDON_PRODUCT_ID_TO_ADDON: Record<string, AppleAddon> = Object.fromEntries(
  (Object.entries(APPLE_ADDON_PRODUCT_IDS) as [AppleAddon, string][])
    .map(([addon, id]) => [id, addon]),
);

export function tierFromAppleProductId(productId: string): "starter" | "core" | "elite" | null {
  return TIER_PRODUCT_ID_TO_TIER[productId] || null;
}

export function addonFromAppleProductId(productId: string): AppleAddon | null {
  return ADDON_PRODUCT_ID_TO_ADDON[productId] || null;
}

// Map an add-on key to the (status, originalTxnId, expiresAt) columns on users.
// `expiresAtCol` is set when the user disables auto-renew in iOS Settings —
// it marks the date access actually ends. The status column STAYS 'active'
// until the EXPIRED webhook arrives, because the user paid for the period.
export const ADDON_USER_COLUMNS: Record<
  AppleAddon,
  {
    statusCol: "whiteLabelStatus" | "fuseAiStatus" | "aiAssistantStatus";
    txnIdCol: "appleWhiteLabelOriginalTxnId" | "appleFuseAiOriginalTxnId" | "appleAiAssistantOriginalTxnId";
    expiresAtCol: "appleWhiteLabelExpiresAt" | "appleFuseAiExpiresAt" | "appleAiAssistantExpiresAt";
    autoRenewOffCol: "appleWhiteLabelAutoRenewOff" | "appleFuseAiAutoRenewOff" | "appleAiAssistantAutoRenewOff";
  }
> = {
  whiteLabel:  { statusCol: "whiteLabelStatus",  txnIdCol: "appleWhiteLabelOriginalTxnId",  expiresAtCol: "appleWhiteLabelExpiresAt",  autoRenewOffCol: "appleWhiteLabelAutoRenewOff" },
  fuseAi:      { statusCol: "fuseAiStatus",      txnIdCol: "appleFuseAiOriginalTxnId",      expiresAtCol: "appleFuseAiExpiresAt",      autoRenewOffCol: "appleFuseAiAutoRenewOff" },
  aiAssistant: { statusCol: "aiAssistantStatus", txnIdCol: "appleAiAssistantOriginalTxnId", expiresAtCol: "appleAiAssistantExpiresAt", autoRenewOffCol: "appleAiAssistantAutoRenewOff" },
};
