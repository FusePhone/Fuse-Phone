import { createHash, randomBytes } from "crypto";
import { db } from "./db";
import { otpCodes } from "@shared/schema";
import { eq, and, gt, sql } from "drizzle-orm";

const OTP_EXPIRY_MINUTES = 5;
const MAX_ATTEMPTS = 5;
const MAX_REQUESTS_PER_EMAIL_PER_HOUR = 5;
const MAX_REQUESTS_PER_IP_PER_HOUR = 10;
const OTP_LENGTH = 6;

function hashCode(code: string): string {
  return createHash("sha256").update(code.toUpperCase()).digest("hex");
}

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(OTP_LENGTH);
  let code = "";
  for (let i = 0; i < OTP_LENGTH; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

export async function generateOTP(
  email: string,
  ip: string
): Promise<{ success: boolean; code?: string; error?: string }> {
  const normalizedEmail = email.toLowerCase().trim();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const emailCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(otpCodes)
    .where(
      and(
        eq(otpCodes.email, normalizedEmail),
        gt(otpCodes.createdAt, oneHourAgo)
      )
    );

  if (Number(emailCount[0]?.count || 0) >= MAX_REQUESTS_PER_EMAIL_PER_HOUR) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const ipCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(otpCodes)
    .where(and(eq(otpCodes.ip, ip), gt(otpCodes.createdAt, oneHourAgo)));

  if (Number(ipCount[0]?.count || 0) >= MAX_REQUESTS_PER_IP_PER_HOUR) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const code = generateCode();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  await db.insert(otpCodes).values({
    email: normalizedEmail,
    codeHash: hashCode(code),
    expiresAt,
    attempts: 0,
    ip,
  });

  return { success: true, code };
}

export async function verifyOTP(
  email: string,
  code: string
): Promise<{
  valid: boolean;
  error?: string;
  remainingAttempts?: number;
}> {
  const normalizedEmail = email.toLowerCase().trim();
  const now = new Date();

  const records = await db
    .select()
    .from(otpCodes)
    .where(
      and(
        eq(otpCodes.email, normalizedEmail),
        gt(otpCodes.expiresAt, now)
      )
    )
    .orderBy(sql`${otpCodes.createdAt} DESC`)
    .limit(1);

  if (records.length === 0) {
    return { valid: false, error: "Code expired or not found." };
  }

  const record = records[0];

  if ((record.attempts || 0) >= MAX_ATTEMPTS) {
    return { valid: false, error: "Too many attempts. Request a new code.", remainingAttempts: 0 };
  }

  const inputHash = hashCode(code);

  if (inputHash !== record.codeHash) {
    const newAttempts = (record.attempts || 0) + 1;
    await db
      .update(otpCodes)
      .set({ attempts: newAttempts })
      .where(eq(otpCodes.id, record.id));

    const remaining = MAX_ATTEMPTS - newAttempts;
    return {
      valid: false,
      error: remaining > 0 ? "Invalid code." : "Too many attempts. Request a new code.",
      remainingAttempts: remaining,
    };
  }

  await db.delete(otpCodes).where(eq(otpCodes.id, record.id));

  return { valid: true };
}

export async function sendOtpEmail(email: string, code: string): Promise<boolean> {
  const { isSystemEmailConfigured, sendSystemEmail } = await import("./systemEmail");
  if (!isSystemEmailConfigured()) {
    console.log("[OTP] System email not configured");
    return false;
  }

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5; }
    .container { max-width: 500px; margin: 0 auto; padding: 40px 20px; }
    .card { background: white; border-radius: 12px; padding: 40px 30px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .logo { font-size: 24px; font-weight: 700; color: #1E293B; margin-bottom: 8px; }
    .subtitle { font-size: 14px; color: #64748B; margin-bottom: 30px; }
    .code { font-size: 36px; letter-spacing: 8px; font-weight: 700; color: #1E293B; background: #F1F5F9; padding: 16px 24px; border-radius: 8px; display: inline-block; margin: 20px 0; font-family: 'SF Mono', Monaco, monospace; }
    .expiry { font-size: 13px; color: #94A3B8; margin-top: 20px; }
    .footer { text-align: center; margin-top: 24px; font-size: 12px; color: #94A3B8; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="logo">Fuse Phone</div>
      <div class="subtitle">Your verification code</div>
      <div class="code">${code}</div>
      <p style="color: #475569; font-size: 15px; margin-top: 24px;">Enter this code to sign in.</p>
      <p class="expiry">This code expires in 5 minutes.</p>
    </div>
    <div class="footer">
      <p>If you didn't request this code, you can safely ignore this email.</p>
    </div>
  </div>
</body>
</html>`;

  try {
    const result = await sendSystemEmail(email, "Your FusePhone Verification Code", htmlBody, "Fuse Phone");
    return result.success;
  } catch (err) {
    console.error("[OTP] Failed to send OTP email:", err);
    return false;
  }
}

export function startOtpCleanup() {
  setInterval(async () => {
    try {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      await db
        .delete(otpCodes)
        .where(sql`${otpCodes.expiresAt} < ${tenMinutesAgo}`);
    } catch (err) {
      console.error("[OTP Cleanup] Error:", err);
    }
  }, 5 * 60 * 1000);
}
