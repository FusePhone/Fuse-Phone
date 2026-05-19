import { Express, Request, Response, NextFunction } from "express";
import { createHash, randomBytes } from "crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { db } from "./db";
import { users, refreshTokens } from "@shared/schema";
import { isAppleReviewerEmail, PRIMARY_APPLE_REVIEW_EMAIL } from "@shared/apple-review";
import { eq, and, sql } from "drizzle-orm";
import { generateOTP, verifyOTP, sendOtpEmail } from "./otp";
import { seedDefaultTemplatesForUser } from "./defaultTemplates";
import { seedDefaultPackagesForUser, seedDefaultUpsellsForUser, seedNewFeaturesForUser } from "./defaultPackages";
import { generateUniqueReferralCode } from "./referrals";

const SALT_ROUNDS = 12;

const ACCESS_TOKEN_EXPIRY = "2h";
export const REFRESH_TOKEN_SLIDING_WINDOW_DAYS = 7;
const JWT_SECRET = process.env.SESSION_SECRET!;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateAccessToken(userId: string): string {
  return jwt.sign({ userId, type: "access" }, JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
  });
}

export function generateRefreshToken(userId: string): string {
  return jwt.sign({ userId, type: "refresh" }, JWT_SECRET, {
    expiresIn: "7d",
  });
}

// In-memory brute-force lockout for /api/auth/native/login. Tracks failed
// password attempts by email AND IP independently. After PWD_MAX_ATTEMPTS
// failures, the bucket is locked for PWD_LOCK_MINUTES. We don't persist this
// to the DB on purpose: a process restart clears the locks (acceptable for
// password auth — OTP path remains the primary, hardened channel) and there
// are no extra DB writes on every failed attempt.
const PWD_MAX_ATTEMPTS = 5;
const PWD_LOCK_MINUTES = 15;
const PWD_WINDOW_MS = PWD_LOCK_MINUTES * 60 * 1000;
type PwdAttempt = { count: number; firstAt: number; lockedUntil: number };
const pwdAttemptsByEmail = new Map<string, PwdAttempt>();
const pwdAttemptsByIp = new Map<string, PwdAttempt>();

function _bucket(map: Map<string, PwdAttempt>, key: string): PwdAttempt {
  const now = Date.now();
  const cur = map.get(key);
  // Expire stale buckets so a user who failed yesterday isn't locked today.
  if (!cur || (cur.lockedUntil && now > cur.lockedUntil) || (now - cur.firstAt > PWD_WINDOW_MS)) {
    const fresh: PwdAttempt = { count: 0, firstAt: now, lockedUntil: 0 };
    map.set(key, fresh);
    return fresh;
  }
  return cur;
}

export function checkPasswordLoginLock(email: string, ip: string): { locked: boolean; reason?: string; retryAfterMinutes: number } {
  const now = Date.now();
  const e = _bucket(pwdAttemptsByEmail, email);
  const i = _bucket(pwdAttemptsByIp, ip);
  const lockedUntil = Math.max(e.lockedUntil, i.lockedUntil);
  if (lockedUntil > now) {
    return {
      locked: true,
      reason: e.lockedUntil > now ? "email" : "ip",
      retryAfterMinutes: Math.max(1, Math.ceil((lockedUntil - now) / 60000)),
    };
  }
  return { locked: false, retryAfterMinutes: 0 };
}

export function recordPasswordLoginFailure(email: string, ip: string): void {
  for (const [map, key] of [[pwdAttemptsByEmail, email], [pwdAttemptsByIp, ip]] as [Map<string, PwdAttempt>, string][]) {
    const b = _bucket(map, key);
    b.count += 1;
    if (b.count >= PWD_MAX_ATTEMPTS) {
      b.lockedUntil = Date.now() + PWD_WINDOW_MS;
    }
  }
}

export function clearPasswordLoginAttempts(email: string, ip: string): void {
  pwdAttemptsByEmail.delete(email);
  pwdAttemptsByIp.delete(ip);
}


export function registerNativeAuthRoutes(app: Express) {
  const APPLE_REVIEW_BYPASS_CODE = "000000";

  app.post("/api/auth/native/request-otp", async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      if (!email || typeof email !== "string") {
        return res.status(400).json({ success: false, message: "Email is required." });
      }

      const normalizedEmail = email.toLowerCase().trim();
      const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown";

      if (isAppleReviewerEmail(normalizedEmail)) {
        console.log(`[NativeAuth] Apple review bypass — skipping OTP generation/email for ${normalizedEmail}`);
        return res.json({ success: true, message: "If an account exists, a verification code was sent." });
      }

      const existingUsers = await db.select().from(users).where(sql`lower(${users.email}) = ${normalizedEmail}`);
      const userExists = existingUsers.length > 0;

      if (!userExists) {
        console.log(`[NativeAuth] OTP requested for non-existent email: ${normalizedEmail}`);
        return res.json({ success: true, message: "If an account exists, a verification code was sent." });
      }

      const otpResult = await generateOTP(normalizedEmail, ip);
      if (!otpResult.success) {
        console.log(`[NativeAuth] Rate limited OTP request for ${normalizedEmail} from IP ${ip}`);
        return res.status(429).json({ success: false, message: otpResult.error });
      }

      const emailSent = await sendOtpEmail(normalizedEmail, otpResult.code!);
      if (!emailSent) {
        console.error(`[NativeAuth] Failed to send OTP email to ${normalizedEmail}`);
      }

      console.log(`[NativeAuth] OTP sent to ${normalizedEmail}`);
      res.json({ success: true, message: "If an account exists, a verification code was sent." });
    } catch (error: any) {
      console.error("[NativeAuth] Request OTP error:", error?.message, error?.stack);
      res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
    }
  });

  app.post("/api/auth/native/verify-otp", async (req: Request, res: Response) => {
    try {
      const { email, code } = req.body;
      if (!email || !code) {
        return res.status(400).json({ success: false, message: "Email and code are required." });
      }

      const normalizedEmail = email.toLowerCase().trim();

      const isAppleReviewBypass = isAppleReviewerEmail(normalizedEmail) && code.toUpperCase() === APPLE_REVIEW_BYPASS_CODE;

      // Owner-only test-account bypass: lets the owner create accounts with
      // fake emails (any address ending in one of the patterns below) and log
      // in using code "111111" without real email delivery. Used to test
      // multi-account flows (e.g. IAP across two FusePhone accounts on one
      // sandbox Apple ID). Never matches real customer emails.
      const TEST_EMAIL_SUFFIXES = ["@gamagttttt.com", "@fpdev.test", "@fptest.dev"];
      const TEST_BYPASS_CODE = "111111";
      const isTestAccountBypass =
        code === TEST_BYPASS_CODE &&
        TEST_EMAIL_SUFFIXES.some((s) => normalizedEmail.endsWith(s));
      if (isTestAccountBypass) {
        console.log(`[NativeAuth] Test-account bypass for ${normalizedEmail} — skipping OTP verify`);
      }

      if (isAppleReviewBypass) {
        console.log(`[NativeAuth] Apple review bypass — skipping OTP verification for ${normalizedEmail}`);
        // Per Apple Guideline 2.1: reviewer needs an account WITHOUT an active
        // subscription so they can see the IAP purchase flow. We reset on EVERY
        // login (not just server boot) so any sandbox IAP purchase the reviewer
        // completed in a prior session is wiped — they always land on a clean
        // starter/inactive account ready to re-test the purchase flow.
        try {
          await db.execute(sql`UPDATE users SET
            subscription_tier = 'starter',
            subscription_status = 'inactive',
            trial_ends_at = NULL,
            subscription_ends_at = NULL,
            elite_bonus_ends_at = NULL,
            stripe_customer_id = NULL,
            stripe_subscription_id = NULL,
            apple_original_transaction_id = NULL,
            apple_white_label_original_txn_id = NULL,
            apple_fuse_ai_original_txn_id = NULL,
            apple_ai_assistant_original_txn_id = NULL,
            fuse_ai_status = 'inactive',
            fuse_ai_subscription_id = NULL,
            ai_assistant_status = 'inactive',
            ai_assistant_subscription_id = NULL,
            white_label_status = 'inactive',
            white_label_subscription_id = NULL,
            is_admin = false
            WHERE LOWER(email) = ${normalizedEmail}`);
          console.log(`[NativeAuth] Apple reviewer account reset to starter/inactive on login`);
        } catch (err) {
          console.error(`[NativeAuth] Failed to reset Apple reviewer on login:`, err);
        }
      }

      if (!isAppleReviewBypass && !isTestAccountBypass) {
        const otpResult = await verifyOTP(normalizedEmail, code);
        if (!otpResult.valid) {
          return res.status(401).json({
            success: false,
            message: otpResult.error,
            remainingAttempts: otpResult.remainingAttempts,
          });
        }
      }

      const existingUsers = await db.select().from(users).where(sql`lower(${users.email}) = ${normalizedEmail}`);
      if (existingUsers.length === 0) {
        console.log(`[NativeAuth] Verify OTP — no account found for ${normalizedEmail}`);
        return res.status(401).json({ success: false, message: "No account found." });
      }

      const user = existingUsers[0];

      // Deleted-account gate: don't issue auth tokens. Return a restore
      // token instead so the client routes to /restore-account.
      if ((user as any).accountStatus === "deleted") {
        const { mintRestoreToken } = await import("./accountDeletion");
        const restoreToken = mintRestoreToken(user.id);
        console.log(`[NativeAuth] Login attempt on deleted account ${user.id} (${normalizedEmail}) — issued restore token`);
        return res.json({
          success: false,
          deleted: true,
          email: user.email,
          scheduledPurgeAt: (user as any).scheduledPurgeAt,
          restoreToken,
          message: "Account scheduled for deletion",
        });
      }

      const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown";
      const userAgent = req.headers["user-agent"] || "unknown";

      const accessToken = generateAccessToken(user.id);
      const refreshToken = generateRefreshToken(user.id);

      const expiresAt = new Date(Date.now() + REFRESH_TOKEN_SLIDING_WINDOW_DAYS * 24 * 60 * 60 * 1000);

      await db.insert(refreshTokens).values({
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt,
        lastUsedAt: new Date(),
        ip,
        userAgent,
        revoked: false,
      });

      console.log(`[NativeAuth] User ${user.id} (${normalizedEmail}) authenticated via ${isAppleReviewBypass ? 'Apple review bypass' : isTestAccountBypass ? 'test-account bypass' : 'OTP'}`);

      if (isAppleReviewBypass) {
        const { seedAppleReviewData } = await import("./appleReviewSeed");
        seedAppleReviewData(user.id).catch(() => {});
      }

      res.json({
        success: true,
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
        },
      });
    } catch (error: any) {
      console.error("[NativeAuth] Verify OTP error:", error?.message, error?.stack);
      res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
    }
  });

  app.post("/api/auth/native/register", async (req: Request, res: Response) => {
    try {
      const { email, password, firstName, lastName } = req.body;
      if (!email || !password) {
        return res.status(400).json({ success: false, message: "Email and password are required." });
      }
      if (typeof password !== "string" || password.length < 8) {
        return res.status(400).json({ success: false, message: "Password must be at least 8 characters." });
      }
      const normalizedEmail = String(email).toLowerCase().trim();
      const emailDomain = normalizedEmail.split("@")[1];
      if (!emailDomain || !normalizedEmail.includes("@")) {
        return res.status(400).json({ success: false, message: "Please enter a valid email address." });
      }
      if (emailDomain === "fusephone.com") {
        return res.status(400).json({ success: false, message: "Please use a different email address." });
      }

      const existingUsers = await db.select().from(users).where(sql`lower(${users.email}) = ${normalizedEmail}`);
      if (existingUsers.length > 0) {
        const existing = existingUsers[0];
        if (existing.authProvider === "google") {
          return res.status(400).json({ success: false, message: "This email is registered with Google. Please sign in on the web." });
        }
        return res.status(400).json({ success: false, message: "An account with this email already exists. Please sign in instead." });
      }

      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      const referralCode = await generateUniqueReferralCode(firstName || null, lastName || null, normalizedEmail);

      const [newUser] = await db.insert(users).values({
        email: normalizedEmail,
        passwordHash,
        authProvider: "email",
        firstName: firstName || null,
        lastName: lastName || null,
        emailVerified: new Date(),
        subscriptionTier: "starter",
        subscriptionStatus: "inactive",
        trialEndsAt: null,
        referralCode,
      }).returning();

      try {
        await seedDefaultTemplatesForUser(newUser.id);
        await seedDefaultPackagesForUser(newUser.id);
        await seedDefaultUpsellsForUser(newUser.id);
        await seedNewFeaturesForUser(newUser.id);
      } catch (e) {
        console.error("[NativeAuth] Seeding defaults failed (non-fatal):", e);
      }

      const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown";
      const userAgent = req.headers["user-agent"] || "unknown";
      const accessToken = generateAccessToken(newUser.id);
      const refreshToken = generateRefreshToken(newUser.id);
      const expiresAt = new Date(Date.now() + REFRESH_TOKEN_SLIDING_WINDOW_DAYS * 24 * 60 * 60 * 1000);

      await db.insert(refreshTokens).values({
        userId: newUser.id,
        tokenHash: hashToken(refreshToken),
        expiresAt,
        lastUsedAt: new Date(),
        ip,
        userAgent,
        revoked: false,
      });

      console.log(`[NativeAuth] New native user registered: ${newUser.id} (${normalizedEmail})`);

      res.json({
        success: true,
        accessToken,
        refreshToken,
        user: {
          id: newUser.id,
          email: newUser.email,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
        },
      });
    } catch (error: any) {
      console.error("[NativeAuth] Register error:", error?.message, error?.stack);
      res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
    }
  });

  // Email + password login for the native iOS app. Mirrors the web
  // /api/auth/login route (server/customAuth.ts) but returns access +
  // refresh tokens in the same shape as /native/register and /native/verify-otp
  // so the client can call storeTokens() identically. This is the OTP fallback
  // for users who never receive the OTP code (typo'd email, slow delivery,
  // spam folder) but still remember the password they set at signup.
  app.post("/api/auth/native/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ success: false, message: "Email and password are required." });
      }
      const normalizedEmail = String(email).toLowerCase().trim();
      if (!normalizedEmail.includes("@")) {
        return res.status(400).json({ success: false, message: "Please enter a valid email address." });
      }

      const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown";

      // Brute-force gate. Tracks failed attempts per email AND per IP in
      // memory. Locks for 15 minutes after 5 failures so we don't hand
      // attackers an unlimited oracle on stolen email lists.
      const lockCheck = checkPasswordLoginLock(normalizedEmail, ip);
      if (lockCheck.locked) {
        console.log(`[NativeAuth] Password login locked for ${normalizedEmail} from IP ${ip} (${lockCheck.reason})`);
        return res.status(429).json({
          success: false,
          message: `Too many sign-in attempts. Please try again in ${lockCheck.retryAfterMinutes} minute${lockCheck.retryAfterMinutes === 1 ? '' : 's'}, or sign in with a code.`,
        });
      }

      const rows = await db.select().from(users).where(sql`lower(${users.email}) = ${normalizedEmail}`);
      const user = rows[0];

      // Single generic failure message for: no account, no password set
      // (Google-only or OTP-only), and bad password. Prevents account
      // enumeration / provider leakage.
      const genericFail = () => {
        recordPasswordLoginFailure(normalizedEmail, ip);
        return res.status(401).json({ success: false, message: "Invalid email or password." });
      };

      if (!user) return genericFail();
      if (!user.passwordHash) return genericFail();
      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) return genericFail();

      // Account-state gates (parity with /native/verify-otp and web /login).
      if ((user as any).accountStatus === "purged") {
        clearPasswordLoginAttempts(normalizedEmail, ip);
        return res.status(401).json({ success: false, message: "This account is no longer available." });
      }
      if ((user as any).accountStatus === "deleted") {
        const { mintRestoreToken } = await import("./accountDeletion");
        const restoreToken = mintRestoreToken(user.id);
        clearPasswordLoginAttempts(normalizedEmail, ip);
        console.log(`[NativeAuth] Password login on deleted account ${user.id} (${normalizedEmail}) — issued restore token`);
        return res.json({
          success: false,
          deleted: true,
          email: user.email,
          scheduledPurgeAt: (user as any).scheduledPurgeAt,
          restoreToken,
          message: "Account scheduled for deletion",
        });
      }

      // Success — clear the brute-force counters.
      clearPasswordLoginAttempts(normalizedEmail, ip);

      const userAgent = req.headers["user-agent"] || "unknown";
      const accessToken = generateAccessToken(user.id);
      const refreshToken = generateRefreshToken(user.id);
      const expiresAt = new Date(Date.now() + REFRESH_TOKEN_SLIDING_WINDOW_DAYS * 24 * 60 * 60 * 1000);

      await db.insert(refreshTokens).values({
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt,
        lastUsedAt: new Date(),
        ip,
        userAgent,
        revoked: false,
      });

      console.log(`[NativeAuth] Password login: ${user.id} (${normalizedEmail})`);

      res.json({
        success: true,
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
        },
      });
    } catch (error: any) {
      console.error("[NativeAuth] Login error:", error?.message, error?.stack);
      res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
    }
  });

  app.post("/api/auth/native/refresh", async (req: Request, res: Response) => {
    try {
      const { refreshToken: token } = req.body;
      if (!token) {
        return res.status(400).json({ success: false, message: "Refresh token required." });
      }

      let decoded: any;
      try {
        decoded = jwt.verify(token, JWT_SECRET);
      } catch (err) {
        return res.status(401).json({ success: false, message: "Invalid token." });
      }

      if (decoded.type !== "refresh") {
        return res.status(401).json({ success: false, message: "Invalid token type." });
      }

      const tokenHash = hashToken(token);
      const records = await db
        .select()
        .from(refreshTokens)
        .where(and(eq(refreshTokens.tokenHash, tokenHash), eq(refreshTokens.revoked, false)));

      if (records.length === 0) {
        return res.status(401).json({ success: false, message: "Token revoked or not found." });
      }

      const record = records[0];

      const slidingWindowLimit = new Date(Date.now() - REFRESH_TOKEN_SLIDING_WINDOW_DAYS * 24 * 60 * 60 * 1000);
      if (record.lastUsedAt && record.lastUsedAt < slidingWindowLimit) {
        await db.update(refreshTokens).set({ revoked: true }).where(eq(refreshTokens.id, record.id));
        return res.status(401).json({ success: false, message: "Session expired due to inactivity." });
      }

      await db
        .update(refreshTokens)
        .set({ lastUsedAt: new Date() })
        .where(eq(refreshTokens.id, record.id));

      const existingUsers = await db.select().from(users).where(eq(users.id, decoded.userId));
      if (existingUsers.length === 0) {
        return res.status(401).json({ success: false, message: "User not found." });
      }

      const accessToken = generateAccessToken(decoded.userId);

      res.json({
        success: true,
        accessToken,
      });
    } catch (error: any) {
      console.error("[NativeAuth] Refresh error:", error);
      res.status(500).json({ success: false, message: "Something went wrong." });
    }
  });

  app.post("/api/auth/native/logout", async (req: Request, res: Response) => {
    try {
      const { refreshToken: token } = req.body;
      if (!token) {
        return res.status(400).json({ success: false, message: "Refresh token required." });
      }

      const tokenHash = hashToken(token);
      await db
        .update(refreshTokens)
        .set({ revoked: true })
        .where(eq(refreshTokens.tokenHash, tokenHash));

      res.json({ success: true, message: "Logged out." });
    } catch (error: any) {
      console.error("[NativeAuth] Logout error:", error);
      res.status(500).json({ success: false, message: "Something went wrong." });
    }
  });
}

export async function authenticateNativeToken(
  token: string
): Promise<{ userId: string; email: string; firstName: string | null; lastName: string | null } | null> {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (decoded.type !== "access") {
      return null;
    }

    const existingUsers = await db.select().from(users).where(eq(users.id, decoded.userId));
    if (existingUsers.length === 0) {
      return null;
    }

    const user = existingUsers[0];
    return {
      userId: user.id,
      email: user.email || "",
      firstName: user.firstName || null,
      lastName: user.lastName || null,
    };
  } catch (err) {
    return null;
  }
}
