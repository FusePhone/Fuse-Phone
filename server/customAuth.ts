import type { Express, RequestHandler, Request, Response } from "express";
import session from "express-session";
import connectPg from "connect-pg-simple";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { google } from "googleapis";
import { db } from "./db";
import { users } from "@shared/models/auth";
import { companySettings, companyUsers, teamMembers } from "@shared/schema";
import { isAppleReviewerEmail, PRIMARY_APPLE_REVIEW_EMAIL } from "@shared/apple-review";
import { eq, and, isNotNull } from "drizzle-orm";
import { sendSystemEmail, isSystemEmailConfigured } from "./systemEmail";
import { seedDefaultTemplatesForUser } from "./defaultTemplates";
import { seedDefaultPackagesForUser, seedDefaultUpsellsForUser, seedNewFeaturesForUser } from "./defaultPackages";
import { generateUniqueReferralCode, findReferrerByCode, recordPendingReferral } from "./referrals";

const SALT_ROUNDS = 12;
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 1 week in seconds
const SESSION_TTL_MS = SESSION_TTL_SECONDS * 1000; // 1 week in milliseconds
const VERIFICATION_TOKEN_EXPIRY_HOURS = 24;

// Generate a secure verification token
function generateVerificationToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

// Get the base URL for verification links
function getBaseUrl(): string {
  if (process.env.REPLIT_DEPLOYMENT === '1' && process.env.REPLIT_DOMAINS) {
    const domains = process.env.REPLIT_DOMAINS.split(',');
    const domain = domains.find(d => !d.includes('.replit.')) || domains[0];
    return `https://${domain}`;
  }
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  return 'http://localhost:5000';
}

// Send verification email using system email
async function sendVerificationEmail(
  toEmail: string,
  verificationToken: string,
  firstName?: string | null
): Promise<{ sent: boolean; error?: string }> {
  try {
    if (!isSystemEmailConfigured()) {
      console.log('[Email Verification] System email not configured - verification email not sent');
      return { sent: false, error: 'System email not configured' };
    }

    const verificationUrl = `${getBaseUrl()}/verify-email?token=${verificationToken}`;

    const emailBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .button { display: inline-block; padding: 12px 24px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .footer { margin-top: 30px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <h2>Verify Your Email Address</h2>
    <p>Hi${firstName ? ` ${firstName}` : ''},</p>
    <p>Thank you for creating an account with Fuse Phone. Please verify your email address by clicking the button below:</p>
    <a href="${verificationUrl}" class="button">Verify Email Address</a>
    <p>Or copy and paste this link into your browser:</p>
    <p style="word-break: break-all; font-size: 14px; color: #666;">${verificationUrl}</p>
    <p>This link will expire in ${VERIFICATION_TOKEN_EXPIRY_HOURS} hours.</p>
    <p>If you didn't create an account, you can safely ignore this email.</p>
    <div class="footer">
      <p>Best regards,<br>Fuse Phone Team</p>
    </div>
  </div>
</body>
</html>`;

    const result = await sendSystemEmail(
      toEmail,
      'Verify Your Email Address',
      emailBody,
      'Fuse Phone'
    );

    if (result.success) {
      console.log(`[Email Verification] Sent verification email to ${toEmail}`);
      return { sent: true };
    } else {
      return { sent: false, error: result.error };
    }
  } catch (error: any) {
    console.error('[Email Verification] Failed to send email:', error.message);
    return { sent: false, error: error.message };
  }
}

// Send password reset email using system email
async function sendPasswordResetEmail(
  toEmail: string,
  resetToken: string,
  firstName?: string | null
): Promise<{ sent: boolean; error?: string }> {
  try {
    if (!isSystemEmailConfigured()) {
      console.log('[Password Reset] System email not configured - reset email not sent');
      return { sent: false, error: 'System email not configured' };
    }

    const resetUrl = `${getBaseUrl()}/reset-password?token=${resetToken}`;

    const emailBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .button { display: inline-block; padding: 12px 24px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .footer { margin-top: 30px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <h2>Reset Your Password</h2>
    <p>Hi${firstName ? ` ${firstName}` : ''},</p>
    <p>We received a request to reset your password for your Fuse Phone account. Click the button below to set a new password:</p>
    <a href="${resetUrl}" class="button">Reset Password</a>
    <p>Or copy and paste this link into your browser:</p>
    <p style="word-break: break-all; font-size: 14px; color: #666;">${resetUrl}</p>
    <p>This link will expire in ${VERIFICATION_TOKEN_EXPIRY_HOURS} hours.</p>
    <p>If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>
    <div class="footer">
      <p>Best regards,<br>Fuse Phone Team</p>
    </div>
  </div>
</body>
</html>`;

    const result = await sendSystemEmail(
      toEmail,
      'Fuse Phone - Password Reset Request',
      emailBody,
      'Fuse Phone'
    );

    if (result.success) {
      console.log(`[Password Reset] Sent reset email to ${toEmail}`);
      return { sent: true };
    } else {
      return { sent: false, error: result.error };
    }
  } catch (error: any) {
    console.error('[Password Reset] Failed to send email:', error.message);
    return { sent: false, error: error.message };
  }
}

function getSession() {
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: SESSION_TTL_SECONDS, // connect-pg-simple expects seconds
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT === "1",
      maxAge: SESSION_TTL_MS, // cookie maxAge is in milliseconds
      sameSite: "lax", // Provides CSRF protection for same-site requests
      domain: getCookieDomain(),
    },
  });
}

function getAppDomain(): string | null {
  if (process.env.REPLIT_DEPLOYMENT === '1' && process.env.REPLIT_DOMAINS) {
    const domains = process.env.REPLIT_DOMAINS.split(',');
    return domains.find(d => d.startsWith('app.')) || domains.find(d => !d.includes('.replit.')) || domains[0];
  }
  return null;
}

function getAppBaseUrl(): string {
  const domain = getAppDomain();
  return domain ? `https://${domain}` : '';
}

function getCookieDomain(): string | undefined {
  const domain = getAppDomain();
  if (!domain) return undefined;
  const parts = domain.split('.');
  if (parts.length >= 2) {
    return '.' + parts.slice(-2).join('.');
  }
  return undefined;
}

function getGoogleRedirectUri() {
  // In production, use the deployment URL
  if (process.env.REPLIT_DEPLOYMENT === '1' && process.env.REPLIT_DOMAINS) {
    const domains = process.env.REPLIT_DOMAINS.split(',');
    // Prefer app.fusephone.com for OAuth callback (where the CRM lives)
    const appDomain = domains.find(d => d.startsWith('app.')) || domains.find(d => !d.includes('.replit.')) || domains[0];
    console.log('[Auth Google OAuth] Production mode, using domain:', appDomain);
    return `https://${appDomain}/api/auth/google/callback`;
  }
  
  // In development, use dev domain
  if (process.env.REPLIT_DEV_DOMAIN) {
    console.log('[Auth Google OAuth] Dev mode, using domain:', process.env.REPLIT_DEV_DOMAIN);
    return `https://${process.env.REPLIT_DEV_DOMAIN}/api/auth/google/callback`;
  }
  
  // Fallback for local development
  console.log('[Auth Google OAuth] Local mode, using localhost');
  return 'http://localhost:5000/api/auth/google/callback';
}

function getGoogleOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = getGoogleRedirectUri();

  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth credentials not configured");
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

// Generate a self-verifiable HMAC-signed OAuth state token
// This eliminates the need to store state in the session, which can be lost
// when mobile browsers don't preserve cookies across the Google redirect chain
function generateSignedOAuthState(intent: string, plan: string): string {
  const nonce = crypto.randomBytes(16).toString("hex");
  const timestamp = Date.now().toString();
  const payload = { n: nonce, t: timestamp, i: intent, p: plan };
  const payloadStr = JSON.stringify(payload);
  const signature = crypto.createHmac("sha256", process.env.SESSION_SECRET!)
    .update(payloadStr)
    .digest("hex");
  const stateObj = { ...payload, sig: signature };
  return Buffer.from(JSON.stringify(stateObj)).toString("base64url");
}

function verifySignedOAuthState(stateParam: string): { valid: boolean; intent: string; plan: string } {
  try {
    const stateObj = JSON.parse(Buffer.from(stateParam, "base64url").toString());
    const { sig, ...payload } = stateObj;
    const payloadStr = JSON.stringify(payload);
    const expectedSig = crypto.createHmac("sha256", process.env.SESSION_SECRET!)
      .update(payloadStr)
      .digest("hex");
    if (sig !== expectedSig) {
      console.error("[Auth OAuth State] Signature mismatch");
      return { valid: false, intent: "signin", plan: "" };
    }
    const timestamp = parseInt(payload.t, 10);
    const ageMs = Date.now() - timestamp;
    const maxAgeMs = 10 * 60 * 1000; // 10 minutes
    if (ageMs > maxAgeMs) {
      console.error(`[Auth OAuth State] State expired: ${ageMs}ms old`);
      return { valid: false, intent: "signin", plan: "" };
    }
    return { valid: true, intent: payload.i || "signin", plan: payload.p || "" };
  } catch (e) {
    console.error("[Auth OAuth State] Failed to parse state:", e);
    return { valid: false, intent: "signin", plan: "" };
  }
}

const authTokens = new Map<string, { userId: string; redirectPath: string; expiresAt: number; userData?: any }>();

function generateMobileAuthToken(userId: string, redirectPath: string): string {
  const token = crypto.randomBytes(32).toString("hex");
  authTokens.set(token, {
    userId,
    redirectPath,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });
  setTimeout(() => authTokens.delete(token), 5 * 60 * 1000);
  return token;
}

function generateWebAuthToken(userId: string, redirectPath: string, userData: any): string {
  const token = crypto.randomBytes(32).toString("hex");
  authTokens.set(token, {
    userId,
    redirectPath,
    expiresAt: Date.now() + 5 * 60 * 1000,
    userData,
  });
  setTimeout(() => authTokens.delete(token), 5 * 60 * 1000);
  return token;
}

function consumeMobileAuthToken(token: string): { userId: string; redirectPath: string } | null {
  const entry = authTokens.get(token);
  if (!entry || entry.expiresAt < Date.now()) {
    authTokens.delete(token);
    return null;
  }
  authTokens.delete(token);
  return { userId: entry.userId, redirectPath: entry.redirectPath };
}

function consumeWebAuthToken(token: string): { userId: string; redirectPath: string; userData: any } | null {
  const entry = authTokens.get(token);
  if (!entry || entry.expiresAt < Date.now()) {
    authTokens.delete(token);
    return null;
  }
  authTokens.delete(token);
  return { userId: entry.userId, redirectPath: entry.redirectPath, userData: entry.userData };
}

export function getClearCookieOptions(): any {
  const isSecure = process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT === "1";
  const opts: any = {
    path: "/",
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax" as const,
  };
  const domain = getCookieDomain();
  if (domain) opts.domain = domain;
  return opts;
}

export function setupCustomAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());

  // Public landing for referral links: /r/:slug
  app.get("/r/:slug", async (req: Request, res: Response) => {
    try {
      const slug = String(req.params.slug || '').toLowerCase();
      if (slug) {
        res.cookie('fp_ref', slug, {
          maxAge: 30 * 24 * 60 * 60 * 1000,
          httpOnly: false,
          sameSite: 'lax',
          path: '/',
        });
      }
      // Land visitors on the marketing home page (not the auth form) so
      // they can browse the product first. The `fp_ref` cookie above
      // carries the referral credit through to /api/auth/register, and
      // we also pass `?ref=` so the home page (and Auth page if they
      // click Sign Up) can show the partner banner and stash it in
      // localStorage as a backup.
      const target = `/?ref=${encodeURIComponent(slug)}`;
      res.redirect(302, target);
    } catch (e) {
      res.redirect(302, '/');
    }
  });

  // Register with email/password
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const { email, password, firstName, lastName, inviteToken } = req.body;
      const cookieHeader = String(req.headers.cookie || '');
      const refCookieMatch = cookieHeader.match(/(?:^|;\s*)fp_ref=([^;]+)/);
      const refCookieValue = refCookieMatch ? decodeURIComponent(refCookieMatch[1]) : '';
      const refCodeRaw = (req.body.referralCode || refCookieValue || '') as string;

      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      if (password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters" });
      }

      const emailDomain = email.toLowerCase().split('@')[1];
      if (emailDomain === 'fusephone.com') {
        return res.status(400).json({ message: "Registration with this email domain is not allowed. Please use a different email address." });
      }

      const isInviteFlow = !!inviteToken;
      let validInvite = false;
      if (isInviteFlow) {
        const { storage } = await import('./storage');
        const inv = await storage.getInvitation(inviteToken);
        validInvite = !!(inv && inv.status === 'pending' && new Date(inv.expiresAt!) > new Date());
      }

      const existingUsers = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
      
      if (existingUsers.length > 0) {
        const existingUser = existingUsers[0];
        if (existingUser.authProvider === "google") {
          return res.status(400).json({ 
            message: "This email is already registered with Google. Please sign in with Google." 
          });
        }
        return res.status(400).json({ message: "Welcome back! An account with this email already exists. Please sign in instead." });
      }

      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

      // Resolve referral code (block self-referral by email match)
      let referrerId: string | null = null;
      if (refCodeRaw) {
        const refUser = await findReferrerByCode(refCodeRaw);
        if (refUser) {
          // Self-referral guard: same email is impossible here (existingUsers check above)
          // Also block if existing referral code belongs to same email accidentally
          referrerId = refUser.id;
        }
      }
      const referralCode = await generateUniqueReferralCode(firstName, lastName, email);

      const selectedPlan = req.body.selectedPlan;
      const tier = selectedPlan === 'elite' ? 'elite' : selectedPlan === 'starter' ? 'starter' : 'core';
      // Trial no longer auto-granted at signup. User must complete Stripe Checkout
      // (which captures a card and starts a 14-day trial) before subscriptionStatus
      // becomes 'trialing'. We persist their selected tier so the Billing page can
      // pre-select the right plan.

      if (validInvite) {
        const [newUser] = await db.insert(users).values({
          email: email.toLowerCase(),
          passwordHash,
          authProvider: "email",
          firstName: firstName || null,
          lastName: lastName || null,
          emailVerified: new Date(),
          subscriptionTier: tier,
          subscriptionStatus: 'inactive',
          trialEndsAt: null,
          referralCode,
          referredByUserId: referrerId || null,
        }).returning();

        if (referrerId) {
          try { await recordPendingReferral(referrerId, newUser.id); } catch (e) { console.error('[Referral] record pending failed', e); }
        }

        await seedDefaultTemplatesForUser(newUser.id);
        await seedDefaultPackagesForUser(newUser.id);
        await seedDefaultUpsellsForUser(newUser.id);
        await seedNewFeaturesForUser(newUser.id);

        const { storage } = await import('./storage');
        await storage.acceptInvitation(inviteToken, newUser.id);
        console.log(`[Auth Register] Accepted invite for new user ${newUser.id}`);

        (req.session as any).userId = newUser.id;
        (req.session as any).user = {
          id: newUser.id,
          email: newUser.email,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          profileImageUrl: null,
        };

        return req.session.save((err) => {
          if (err) {
            console.error("Session save error:", err);
            return res.status(500).json({ message: "Failed to create session" });
          }
          res.json({
            success: true,
            requiresVerification: false,
            inviteAccepted: true,
            user: {
              id: newUser.id,
              email: newUser.email,
              firstName: newUser.firstName,
              lastName: newUser.lastName,
            },
          });
        });
      }

      const verificationToken = generateVerificationToken();
      const verificationTokenExpiry = new Date(Date.now() + VERIFICATION_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

      const isAppleReviewAccount = email.toLowerCase() === 'applereview@fusephonecrm.com';

      // Apple reviewers can't run a real Stripe Checkout, so we keep their 14-day
      // trial auto-granted. Everyone else has to go through Stripe Checkout (which
      // captures a card) before any trial begins.
      const subscriptionStatus = isAppleReviewAccount ? 'trialing' : 'inactive';
      const trialEndsAt = isAppleReviewAccount
        ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
        : null;

      const [newUser] = await db.insert(users).values({
        email: email.toLowerCase(),
        passwordHash,
        authProvider: "email",
        firstName: firstName || null,
        lastName: lastName || null,
        emailVerified: isAppleReviewAccount ? new Date() : null,
        verificationToken: isAppleReviewAccount ? null : verificationToken,
        verificationTokenExpiry: isAppleReviewAccount ? null : verificationTokenExpiry,
        subscriptionTier: tier,
        subscriptionStatus,
        trialEndsAt,
        referralCode,
        referredByUserId: referrerId || null,
      }).returning();

      if (referrerId) {
        try { await recordPendingReferral(referrerId, newUser.id); } catch (e) { console.error('[Referral] record pending failed', e); }
      }

      await seedDefaultTemplatesForUser(newUser.id);
      await seedDefaultPackagesForUser(newUser.id);
      await seedDefaultUpsellsForUser(newUser.id);
      await seedNewFeaturesForUser(newUser.id);

      if (isAppleReviewAccount) {
        (req.session as any).userId = newUser.id;
        (req.session as any).user = {
          id: newUser.id,
          email: newUser.email,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          profileImageUrl: newUser.profileImageUrl,
        };
        return req.session.save((err) => {
          if (err) console.error("Session save error:", err);
          res.json({
            success: true,
            requiresVerification: false,
            emailSent: false,
            message: "Account created and verified.",
            user: {
              id: newUser.id,
              email: newUser.email,
              firstName: newUser.firstName,
              lastName: newUser.lastName,
            },
          });
        });
      }

      const emailResult = await sendVerificationEmail(
        email.toLowerCase(),
        verificationToken,
        firstName
      );

      res.json({
        success: true,
        requiresVerification: true,
        emailSent: emailResult.sent,
        message: emailResult.sent
          ? "Please check your email to verify your account."
          : "Account created. Please verify your email to log in.",
        user: {
          id: newUser.id,
          email: newUser.email,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
        },
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  // Login with email/password
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { email, password, inviteToken } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      const existingUsers = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
      
      if (existingUsers.length === 0) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      const user = existingUsers[0];

      if (user.authProvider === "google" && !user.passwordHash) {
        return res.status(401).json({ 
          message: "This account uses Google Sign-In. Please sign in with Google." 
        });
      }

      if (!user.passwordHash && user.authProvider === "email") {
        const newHash = await bcrypt.hash(password, SALT_ROUNDS);
        await db.update(users).set({ passwordHash: newHash, updatedAt: new Date() }).where(eq(users.id, user.id));
        console.log(`[Auth] First-login password set for ${user.email}`);
      } else if (!user.passwordHash) {
        return res.status(401).json({ 
          message: "Please sign in with Google or reset your password." 
        });
      } else {
        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) {
          return res.status(401).json({ message: "Invalid email or password" });
        }
      }

      if (user.authProvider === "email" && !user.emailVerified) {
        return res.status(403).json({ 
          message: "Please verify your email address before logging in.",
          requiresVerification: true,
          email: user.email,
        });
      }

      // Deleted-account gate: don't create a normal session. Set a
      // restore-only session marker and return a restore token. Client
      // navigates to /restore-account.
      if ((user as any).accountStatus === "deleted") {
        const { mintRestoreToken } = await import("./accountDeletion");
        const restoreToken = mintRestoreToken(user.id);
        (req.session as any).deletedUserId = user.id;
        (req.session as any).canRestore = true;
        return req.session.save((err) => {
          if (err) console.error("[Auth] Session save (deleted state) error:", err);
          res.json({
            deleted: true,
            email: user.email,
            scheduledPurgeAt: (user as any).scheduledPurgeAt,
            restoreToken,
          });
        });
      }

      await seedDefaultTemplatesForUser(user.id);
      await seedDefaultPackagesForUser(user.id);
      await seedDefaultUpsellsForUser(user.id);
      await seedNewFeaturesForUser(user.id);

      if (inviteToken) {
        try {
          const { storage } = await import('./storage');
          await storage.acceptInvitation(inviteToken, user.id);
          console.log(`[Auth Login] Accepted invite for user ${user.id}`);
        } catch (invErr: any) {
          console.error('[Auth Login] Invite acceptance failed:', invErr.message);
        }
      }

      (req.session as any).userId = user.id;
      (req.session as any).user = {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImageUrl: user.profileImageUrl,
      };

      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
          return res.status(500).json({ message: "Failed to create session" });
        }
        res.json({
          success: true,
          inviteAccepted: !!inviteToken,
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
          },
        });
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.get("/api/auth/mobile-token", async (req: Request, res: Response) => {
    try {
      const token = req.query.token as string;
      if (!token) {
        return res.status(400).json({ message: "Token required" });
      }
      const tokenData = consumeMobileAuthToken(token);
      if (!tokenData) {
        return res.status(401).json({ message: "Invalid or expired token" });
      }
      const [user] = await db.select().from(users).where(eq(users.id, tokenData.userId));
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      (req.session as any).userId = user.id;
      (req.session as any).user = {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImageUrl: user.profileImageUrl,
      };
      req.session.save((err) => {
        if (err) {
          return res.status(500).json({ message: "Session error" });
        }
        res.json({ success: true, redirectPath: tokenData.redirectPath });
      });
    } catch (error) {
      console.error("[Auth Mobile Token] Error:", error);
      res.status(500).json({ message: "Token exchange failed" });
    }
  });

  // Initiate Google OAuth for login
  app.get("/api/auth/google", (req: Request, res: Response) => {
    const appBase = getAppBaseUrl();
    try {
      const oauth2Client = getGoogleOAuth2Client();
      
      const plan = (req.query.plan as string) || '';
      if (plan === 'core' || plan === 'elite') {
        (req.session as any).selectedPlan = plan;
      }

      const mobile = req.query.mobile === '1';
      const intent = (req.query.intent as string) || 'signin';
      const validIntent = (intent === 'signin' || intent === 'signup') ? intent : 'signin';
      const inviteToken = (req.query.invite as string) || '';

      if (inviteToken) {
        (req.session as any).inviteToken = inviteToken;
      }

      const planExtra = plan + (mobile ? ':mobile' : '') + (inviteToken ? `:invite:${inviteToken}` : '');
      const state = generateSignedOAuthState(validIntent, planExtra);
      
      const authUrl = oauth2Client.generateAuthUrl({
        access_type: "offline",
        scope: [
          "https://www.googleapis.com/auth/userinfo.email",
          "https://www.googleapis.com/auth/userinfo.profile",
        ],
        prompt: "consent",
        state: state,
      });

      res.redirect(authUrl);
    } catch (error) {
      console.error("[Auth Google Init] Error:", error);
      res.redirect(`${appBase}/auth?error=google_auth_failed`);
    }
  });

  // Google OAuth callback for login
  app.get("/api/auth/google/callback", async (req: Request, res: Response) => {
    const appBase = getAppBaseUrl();
    try {
      const { code, error, state } = req.query;

      if (error || !code) {
        console.error("[Auth Google Callback] OAuth error:", error);
        return res.redirect(`${appBase}/auth?error=google_auth_cancelled`);
      }

      const stateResult = verifySignedOAuthState(state as string);
      if (!stateResult.valid) {
        return res.redirect(`${appBase}/auth?error=invalid_state`);
      }

      const stateIntent = stateResult.intent;
      const rawPlan = stateResult.plan;

      let inviteTokenFromState = '';
      let cleanPlan = rawPlan;
      const inviteMatch = cleanPlan.match(/:invite:(.+)$/);
      if (inviteMatch) {
        inviteTokenFromState = inviteMatch[1];
        cleanPlan = cleanPlan.replace(/:invite:.+$/, '');
      }

      const isMobile = cleanPlan.endsWith(':mobile');
      const statePlan = isMobile ? cleanPlan.replace(':mobile', '') : cleanPlan;

      const oauth2Client = getGoogleOAuth2Client();
      const { tokens } = await oauth2Client.getToken(code as string);
      oauth2Client.setCredentials(tokens);

      const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
      const userInfo = await oauth2.userinfo.get();
      
      const email = userInfo.data.email?.toLowerCase();
      const firstName = userInfo.data.given_name || null;
      const lastName = userInfo.data.family_name || null;
      const profileImageUrl = userInfo.data.picture || null;

      if (!email) {
        return res.redirect(`${appBase}/auth?error=no_email`);
      }

      const emailDomain = email.split('@')[1];
      if (emailDomain === 'fusephone.com') {
        const existingFuseUsers = await db.select().from(users).where(eq(users.email, email));
        if (existingFuseUsers.length === 0) {
          return res.redirect(`${appBase}/auth?error=domain_blocked`);
        }
      }

      const existingUsers = await db.select().from(users).where(eq(users.email, email));
      const authIntent = stateIntent;
      const selectedPlan = statePlan;

      // Referral attribution from cookie (set by /r/:slug)
      const cookieHeader = String(req.headers.cookie || '');
      const refCookieMatch = cookieHeader.match(/(?:^|;\s*)fp_ref=([^;]+)/);
      const refCookieValue = refCookieMatch ? decodeURIComponent(refCookieMatch[1]) : '';
      let googleReferrerId: string | null = null;
      if (refCookieValue) {
        const refUser = await findReferrerByCode(refCookieValue);
        if (refUser) googleReferrerId = refUser.id;
      }

      console.log(`[Auth Google] Intent: ${authIntent}, Email: ${email}, Exists: ${existingUsers.length > 0}`);
      
      let user;
      if (existingUsers.length > 0) {
        user = existingUsers[0];
        await db.update(users)
          .set({
            authProvider: user.authProvider === "email" ? "email" : "google",
            firstName: firstName || user.firstName,
            lastName: lastName || user.lastName,
            profileImageUrl: profileImageUrl || user.profileImageUrl,
            emailVerified: user.emailVerified || new Date(),
            verificationToken: null,
            verificationTokenExpiry: null,
            updatedAt: new Date(),
          })
          .where(eq(users.id, user.id));

        await seedDefaultTemplatesForUser(user.id);
        await seedDefaultPackagesForUser(user.id);
        await seedDefaultUpsellsForUser(user.id);
        await seedNewFeaturesForUser(user.id);
      } else {
        if (authIntent === 'signin') {
          return res.redirect(`${appBase}/auth?error=no_account`);
        }

        const googlePlan = selectedPlan;

        const googleRefCode = await generateUniqueReferralCode(firstName, lastName, email);

        if (googlePlan === 'starter' || googlePlan === 'core' || googlePlan === 'elite') {
          // Trial no longer auto-granted. User must complete Stripe Checkout
          // (14-day trial, card required) to begin their trial.
          const [newUser] = await db.insert(users).values({
            email,
            authProvider: "google",
            firstName,
            lastName,
            profileImageUrl,
            emailVerified: new Date(),
            subscriptionTier: googlePlan,
            subscriptionStatus: 'inactive',
            trialEndsAt: null,
            referralCode: googleRefCode,
            referredByUserId: googleReferrerId,
          }).returning();
          user = newUser;
        } else {
          const [newUser] = await db.insert(users).values({
            email,
            authProvider: "google",
            firstName,
            lastName,
            profileImageUrl,
            emailVerified: new Date(),
            subscriptionTier: 'core',
            subscriptionStatus: 'inactive',
            referralCode: googleRefCode,
            referredByUserId: googleReferrerId,
          }).returning();
          user = newUser;
        }

        if (googleReferrerId) {
          try { await recordPendingReferral(googleReferrerId, user.id); } catch (e) { console.error('[Referral] record pending (google) failed', e); }
        }

        await seedDefaultTemplatesForUser(user.id);
        await seedDefaultPackagesForUser(user.id);
        await seedDefaultUpsellsForUser(user.id);
        await seedNewFeaturesForUser(user.id);
      }

      (req.session as any).userId = user.id;
      (req.session as any).user = {
        id: user.id,
        email: user.email,
        firstName: firstName || user.firstName,
        lastName: lastName || user.lastName,
        profileImageUrl: profileImageUrl || user.profileImageUrl,
      };

      const inviteToken = inviteTokenFromState || (req.session as any).inviteToken || '';
      if (inviteToken) {
        try {
          const { storage } = await import('./storage');
          await storage.acceptInvitation(inviteToken, user.id);
          console.log(`[Auth Google] Accepted invite for user ${user.id}`);
          delete (req.session as any).inviteToken;
        } catch (invErr: any) {
          console.error('[Auth Google] Invite acceptance failed:', invErr.message);
        }
      }

      let redirectPath = '/';
      if (inviteToken) {
        redirectPath = '/?invite_accepted=true';
      } else if (!user.subscriptionStatus || user.subscriptionStatus === 'inactive') {
        redirectPath = '/billing';
      }

      const isExistingUserSignup = authIntent === 'signup' && existingUsers.length > 0;
      if (!inviteToken && isExistingUserSignup && redirectPath === '/') {
        redirectPath = '/?welcome_back=true';
      } else if (!inviteToken && isExistingUserSignup && redirectPath === '/billing') {
        redirectPath = '/billing?welcome_back=true';
      }

      if (isMobile) {
        const mobileToken = generateMobileAuthToken(user.id, redirectPath);
        const mobileRedirect = `fusephone://auth/callback?token=${mobileToken}`;
        console.log(`[Auth Google] Mobile flow - redirecting to app via deep link`);
        return res.redirect(mobileRedirect);
      }

      const userData = {
        id: user.id,
        email: user.email,
        firstName: firstName || user.firstName,
        lastName: lastName || user.lastName,
        profileImageUrl: profileImageUrl || user.profileImageUrl,
      };
      const webToken = generateWebAuthToken(user.id, redirectPath, userData);
      const finalRedirect = `${appBase}/auth?auth_token=${webToken}&redirect=${encodeURIComponent(redirectPath)}`;
      console.log(`[Auth Google] Web flow - redirecting with auth token`);
      res.redirect(finalRedirect);
    } catch (error) {
      console.error("Google callback error:", error);
      res.redirect(`${appBase}/auth?error=google_auth_failed`);
    }
  });

  // Apple Sign-In - verify identity token and create/login user
  app.post("/api/auth/apple", async (req: Request, res: Response) => {
    try {
      const { identityToken, email, firstName, lastName, nonce } = req.body;
      if (!identityToken) {
        return res.status(400).json({ message: "Identity token required" });
      }

      const jwt = await import("jsonwebtoken");
      const https = await import("https");

      const appleKeys = await new Promise<any[]>((resolve, reject) => {
        https.get("https://appleid.apple.com/auth/keys", (resp) => {
          let data = "";
          resp.on("data", (chunk: string) => data += chunk);
          resp.on("end", () => {
            try { resolve(JSON.parse(data).keys); } catch (e) { reject(e); }
          });
        }).on("error", reject);
      });

      const tokenHeader = JSON.parse(Buffer.from(identityToken.split(".")[0], "base64url").toString());
      const matchingKey = appleKeys.find((k: any) => k.kid === tokenHeader.kid);
      if (!matchingKey) {
        return res.status(401).json({ message: "Invalid token signing key" });
      }

      const { createPublicKey } = await import("crypto");
      const publicKey = createPublicKey({ key: matchingKey, format: "jwk" });

      let decoded: any;
      try {
        decoded = jwt.default.verify(identityToken, publicKey, {
          algorithms: ["RS256"],
          issuer: "https://appleid.apple.com",
          audience: "com.fusephone.app",
        });
      } catch (verifyErr: any) {
        console.error("[Auth Apple] Token verification failed:", verifyErr.message);
        return res.status(401).json({ message: "Invalid identity token" });
      }

      const appleUserId = decoded.sub;
      const tokenEmail = decoded.email || email;

      if (!appleUserId) {
        return res.status(400).json({ message: "No user identifier in token" });
      }

      console.log(`[Auth Apple] Sub: ${appleUserId}, Email: ${tokenEmail}`);

      const existingByAppleId = await db.select().from(users).where(eq(users.appleUserId, appleUserId));
      let user;

      if (existingByAppleId.length > 0) {
        user = existingByAppleId[0];
        await db.update(users)
          .set({
            firstName: firstName || user.firstName,
            lastName: lastName || user.lastName,
            updatedAt: new Date(),
          })
          .where(eq(users.id, user.id));
      } else if (tokenEmail) {
        const existingByEmail = await db.select().from(users).where(eq(users.email, tokenEmail.toLowerCase()));
        if (existingByEmail.length > 0) {
          user = existingByEmail[0];
          await db.update(users)
            .set({
              appleUserId,
              firstName: firstName || user.firstName,
              lastName: lastName || user.lastName,
              emailVerified: user.emailVerified || new Date(),
              updatedAt: new Date(),
            })
            .where(eq(users.id, user.id));
        } else {
          const trialEnd = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
          const appleRefCode = await generateUniqueReferralCode(firstName, lastName, tokenEmail);
          const [newUser] = await db.insert(users).values({
            email: tokenEmail.toLowerCase(),
            authProvider: "apple",
            appleUserId,
            firstName: firstName || null,
            lastName: lastName || null,
            emailVerified: new Date(),
            subscriptionTier: 'core',
            subscriptionStatus: 'trialing',
            trialEndsAt: trialEnd,
            referralCode: appleRefCode,
          }).returning();
          user = newUser;
          await seedDefaultTemplatesForUser(user.id);
          await seedDefaultPackagesForUser(user.id);
          await seedDefaultUpsellsForUser(user.id);
          await seedNewFeaturesForUser(user.id);
        }
      } else {
        return res.status(400).json({ message: "No email available from Apple Sign-In" });
      }

      const redirectPath = (!user.subscriptionStatus || user.subscriptionStatus === 'inactive') ? '/billing' : '/';
      const mobileToken = generateMobileAuthToken(user.id, redirectPath);

      (req.session as any).userId = user.id;
      (req.session as any).user = {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImageUrl: user.profileImageUrl,
      };

      req.session.save((err) => {
        if (err) {
          console.error("[Auth Apple] Session save error:", err);
          return res.status(500).json({ message: "Session error" });
        }
        res.json({
          success: true,
          mobileToken,
          redirectPath,
          user: {
            id: user!.id,
            email: user!.email,
            firstName: user!.firstName,
            lastName: user!.lastName,
          },
        });
      });
    } catch (error: any) {
      console.error("[Auth Apple] Error:", error);
      res.status(500).json({ message: "Apple sign-in failed" });
    }
  });

  // Set plan for new users who signed up without selecting one (e.g. Google OAuth)
  app.post("/api/auth/select-plan", async (req: Request, res: Response) => {
    const sessionUser = (req.session as any).user;
    if (!sessionUser) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const { plan, promoCode } = req.body;
    if (plan !== 'starter' && plan !== 'core' && plan !== 'elite' && plan !== 'early_access') {
      return res.status(400).json({ message: "Invalid plan. Choose 'starter', 'core', 'elite', or 'early_access'." });
    }

    const [user] = await db.select().from(users).where(eq(users.id, sessionUser.id));
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.subscriptionStatus === 'active' || user.subscriptionStatus === 'trialing') {
      return res.status(400).json({ message: "Plan already selected" });
    }

    // Card is now required up front: instead of granting an immediate trial,
    // record the chosen tier and tell the client to send the user through
    // Stripe Checkout. The webhook flips them to 'trialing' (with the
    // 14-day trial Stripe attached) once the card is captured.
    const updateData: any = {
      subscriptionTier: plan,
      subscriptionStatus: 'inactive',
      trialEndsAt: null,
      updatedAt: new Date(),
    };

    if (promoCode) {
      const { promoCodes } = await import("@shared/schema");
      const { and } = await import("drizzle-orm");
      const [promo] = await db.select().from(promoCodes)
        .where(and(eq(promoCodes.code, promoCode.toUpperCase()), eq(promoCodes.active, true)));
      if (promo) {
        updateData.promoCodeId = promo.id;
        await db.update(promoCodes).set({ currentUses: (promo.currentUses || 0) + 1 }).where(eq(promoCodes.id, promo.id));
      }
    }

    await db.update(users)
      .set(updateData)
      .where(eq(users.id, user.id));

    res.json({
      success: true,
      tier: plan,
      status: 'inactive',
      requiresCheckout: true,
      redirectTo: `/billing?plan=${plan}`,
    });
  });

  app.post("/api/auth/exchange-token", async (req: Request, res: Response) => {
    try {
      const { token } = req.body;
      if (!token) {
        return res.status(400).json({ message: "Token required" });
      }

      const result = consumeWebAuthToken(token);
      if (!result) {
        return res.status(401).json({ message: "Invalid or expired token" });
      }

      const existingUsers = await db.select().from(users).where(eq(users.id, result.userId));
      if (existingUsers.length === 0) {
        return res.status(401).json({ message: "User not found" });
      }

      const user = existingUsers[0];
      (req.session as any).userId = user.id;
      (req.session as any).user = {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImageUrl: user.profileImageUrl,
      };

      req.session.save((err) => {
        if (err) {
          console.error("[Auth Exchange] Session save error:", err);
          return res.status(500).json({ message: "Session creation failed" });
        }
        console.log(`[Auth Exchange] Token exchanged for user ${user.id}`);
        res.json({
          success: true,
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            profileImageUrl: user.profileImageUrl,
            subscriptionTier: user.subscriptionTier,
            subscriptionStatus: user.subscriptionStatus,
            trialEndsAt: user.trialEndsAt,
            isAdmin: user.isAdmin,
          },
          redirectPath: result.redirectPath,
        });
      });
    } catch (error) {
      console.error("[Auth Exchange] Error:", error);
      res.status(500).json({ message: "Token exchange failed" });
    }
  });

  app.post("/api/auth/web/request-otp", async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      if (!email || typeof email !== "string") {
        return res.status(400).json({ success: false, message: "Email is required." });
      }

      const normalizedEmail = email.toLowerCase().trim();
      const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown";

      const { sql } = await import("drizzle-orm");
      const existingUsers = await db.select().from(users).where(sql`lower(${users.email}) = ${normalizedEmail}`);
      if (existingUsers.length === 0) {
        return res.json({ success: true, message: "If an account exists, a verification code was sent." });
      }

      const { generateOTP, sendOtpEmail } = await import("./otp");
      const otpResult = await generateOTP(normalizedEmail, ip);
      if (!otpResult.success) {
        return res.status(429).json({ success: false, message: otpResult.error });
      }
      const emailSent = await sendOtpEmail(normalizedEmail, otpResult.code!);
      if (!emailSent) {
        console.error(`[WebAuth] Failed to send OTP email to ${normalizedEmail}`);
      }

      console.log(`[WebAuth] OTP sent to ${normalizedEmail}`);
      res.json({ success: true, message: "If an account exists, a verification code was sent." });
    } catch (error: any) {
      console.error("[WebAuth] Request OTP error:", error);
      res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
    }
  });

  app.post("/api/auth/web/verify-otp", async (req: Request, res: Response) => {
    try {
      const { email, code } = req.body;
      if (!email || !code) {
        return res.status(400).json({ success: false, message: "Email and code are required." });
      }

      const normalizedEmail = email.toLowerCase().trim();

      const APPLE_REVIEW_BYPASS_CODE = "000000";
      const isAppleReviewBypass = isAppleReviewerEmail(normalizedEmail) && code.toUpperCase() === APPLE_REVIEW_BYPASS_CODE;

      // Owner-only test-account bypass: any account whose email ends with one
      // of these suffixes can log in with code "111111" without real email
      // delivery. Used to test multi-account flows (IAP, role-based access,
      // etc.) without burning real inboxes. Never matches real customer
      // emails — the suffixes are owner-controlled fake domains.
      const TEST_EMAIL_SUFFIXES = ["@gamagttttt.com", "@fpdev.test", "@fptest.dev"];
      const TEST_BYPASS_CODE = "111111";
      const isTestAccountBypass =
        code === TEST_BYPASS_CODE &&
        TEST_EMAIL_SUFFIXES.some((s) => normalizedEmail.endsWith(s));
      if (isTestAccountBypass) {
        console.log(`[WebAuth] Test-account bypass for ${normalizedEmail} — skipping OTP verify`);
      }

      const { sql } = await import("drizzle-orm");

      if (isAppleReviewBypass) {
        // Per Apple Guideline 2.1: reviewer needs an account WITHOUT an active
        // subscription so they can see the IAP purchase flow. Do NOT force
        // Elite/Active here — leave whatever state is in the DB (intentionally
        // reset to starter/inactive for App Review).
      }

      if (!isAppleReviewBypass && !isTestAccountBypass) {
        const { verifyOTP } = await import("./otp");
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
        return res.status(401).json({ success: false, message: "No account found." });
      }

      const user = existingUsers[0];

      (req.session as any).userId = user.id;
      (req.session as any).user = {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImageUrl: user.profileImageUrl,
      };

      if (isAppleReviewBypass) {
        const { seedAppleReviewData } = await import("./appleReviewSeed");
        seedAppleReviewData(user.id).catch(() => {});
      }

      req.session.save((err) => {
        if (err) {
          console.error("[WebAuth] Session save error:", err);
          return res.status(500).json({ success: false, message: "Session creation failed" });
        }
        console.log(`[WebAuth] User ${user.id} authenticated via OTP`);
        res.json({
          success: true,
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            profileImageUrl: user.profileImageUrl,
            subscriptionTier: user.subscriptionTier,
            subscriptionStatus: user.subscriptionStatus,
            trialEndsAt: user.trialEndsAt,
            isAdmin: user.isAdmin,
          },
        });
      });
    } catch (error: any) {
      console.error("[WebAuth] Verify OTP error:", error);
      res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
    }
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    res.clearCookie("connect.sid", getClearCookieOptions());

    if (!(req.session as any).user) {
      return res.json({ success: true });
    }

    req.session.destroy((err) => {
      if (err) {
        console.error("Logout error:", err);
        return res.status(500).json({ message: "Logout failed" });
      }
      res.json({ success: true });
    });
  });

  // Get current user
  app.get("/api/auth/user", async (req: Request, res: Response) => {
    let sessionUser = (req.session as any).user;

    if (!sessionUser) {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        try {
          const { authenticateNativeToken } = await import('./nativeAuth');
          const result = await authenticateNativeToken(authHeader.slice(7));
          if (result) {
            sessionUser = {
              id: result.userId,
              email: result.email,
              firstName: result.firstName,
              lastName: result.lastName,
            };
            (req.session as any).userId = result.userId;
            (req.session as any).user = sessionUser;
          }
        } catch (err) {
          console.error('[Auth] Bearer token check failed:', err);
        }
      }
    }

    if (!sessionUser) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const [dbUser] = await db.select({
      isAdmin: users.isAdmin,
      subscriptionTier: users.subscriptionTier,
      fuseAiStatus: users.fuseAiStatus,
      subscriptionStatus: users.subscriptionStatus,
      eliteBonusEndsAt: users.eliteBonusEndsAt,
      referralCode: users.referralCode,
    }).from(users).where(eq(users.id, sessionUser.id));

    if (!dbUser) {
      req.session.destroy(() => {});
      res.clearCookie("connect.sid", getClearCookieOptions());
      return res.status(401).json({ message: "Not authenticated" });
    }

    let nameOverride: { firstName?: string; lastName?: string } = {};
    try {
      const [linked] = await db
        .select({ teamMemberName: teamMembers.name })
        .from(companyUsers)
        .innerJoin(teamMembers, and(
          eq(teamMembers.id, companyUsers.linkedTeamMemberId),
          eq(teamMembers.userId, companyUsers.ownerId),
        ))
        .where(eq(companyUsers.userId, sessionUser.id))
        .limit(1);
      const trimmedName = linked?.teamMemberName?.trim();
      if (trimmedName && trimmedName.length > 0) {
        const parts = trimmedName.split(/\s+/);
        nameOverride.firstName = parts[0];
        nameOverride.lastName = parts.slice(1).join(' ') || undefined;
      }
    } catch (_) {}

    res.json({
      ...sessionUser,
      ...nameOverride,
      isAdmin: dbUser?.isAdmin || false,
      subscriptionTier: dbUser?.subscriptionTier || 'starter',
      fuseAiStatus: dbUser?.fuseAiStatus || 'inactive',
      subscriptionStatus: dbUser?.subscriptionStatus || 'inactive',
      eliteBonusEndsAt: dbUser?.eliteBonusEndsAt || null,
      referralCode: dbUser?.referralCode || null,
    });
  });

  // Verify email with token
  app.get("/api/auth/verify-email", async (req: Request, res: Response) => {
    try {
      const { token } = req.query;

      if (!token || typeof token !== "string") {
        return res.status(400).json({ message: "Invalid verification token" });
      }

      // Find user with this token
      const [user] = await db.select().from(users).where(eq(users.verificationToken, token));

      if (!user) {
        return res.status(400).json({ message: "Invalid or expired verification token" });
      }

      // Check if token is expired
      if (user.verificationTokenExpiry && new Date() > user.verificationTokenExpiry) {
        return res.status(400).json({ 
          message: "Verification token has expired. Please request a new one.",
          expired: true,
          email: user.email,
        });
      }

      // Mark email as verified
      await db.update(users)
        .set({
          emailVerified: new Date(),
          verificationToken: null,
          verificationTokenExpiry: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      res.json({ 
        success: true, 
        message: "Email verified successfully. You can now log in.",
        email: user.email,
      });
    } catch (error) {
      console.error("Email verification error:", error);
      res.status(500).json({ message: "Email verification failed" });
    }
  });

  // Resend verification email
  app.post("/api/auth/resend-verification", async (req: Request, res: Response) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      // Find user
      const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));

      if (!user) {
        // Don't reveal if user exists
        return res.json({ 
          success: true, 
          message: "If this email is registered, a verification link will be sent." 
        });
      }

      // Check if already verified
      if (user.emailVerified) {
        return res.status(400).json({ message: "Email is already verified. You can log in." });
      }

      // Generate new token
      const verificationToken = generateVerificationToken();
      const verificationTokenExpiry = new Date(Date.now() + VERIFICATION_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

      // Update user with new token
      await db.update(users)
        .set({
          verificationToken,
          verificationTokenExpiry,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      // Try to send verification email
      const emailResult = await sendVerificationEmail(
        user.email!,
        verificationToken,
        user.firstName
      );

      res.json({
        success: true,
        emailSent: emailResult.sent,
        message: emailResult.sent
          ? "Verification email sent. Please check your inbox."
          : "Unable to send email. Please try again later.",
      });
    } catch (error) {
      console.error("Resend verification error:", error);
      res.status(500).json({ message: "Failed to resend verification email" });
    }
  });

  // Request password reset
  app.post("/api/auth/forgot-password", async (req: Request, res: Response) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      // Find user
      const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));

      // Always return success to prevent email enumeration
      if (!user) {
        return res.json({ 
          success: true, 
          message: "If an account exists with this email, a password reset link will be sent." 
        });
      }

      // Note: We allow password reset for Google-only users so they can set a password
      // and enable email/password login in addition to Google sign-in

      // Generate password reset token
      const resetToken = generateVerificationToken();
      const resetTokenExpiry = new Date(Date.now() + VERIFICATION_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

      // Update user with reset token
      await db.update(users)
        .set({
          passwordResetToken: resetToken,
          passwordResetTokenExpiry: resetTokenExpiry,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      // Send password reset email
      const emailResult = await sendPasswordResetEmail(
        user.email!,
        resetToken,
        user.firstName
      );

      res.json({
        success: true,
        emailSent: emailResult.sent,
        message: emailResult.sent
          ? "If an account exists with this email, a password reset link will be sent."
          : "Unable to send email. Please try again later.",
      });
    } catch (error) {
      console.error("Forgot password error:", error);
      res.status(500).json({ message: "Failed to process password reset request" });
    }
  });

  // Reset password with token
  app.post("/api/auth/reset-password", async (req: Request, res: Response) => {
    try {
      const { token, password } = req.body;

      if (!token || !password) {
        return res.status(400).json({ message: "Token and new password are required" });
      }

      if (password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters" });
      }

      // Find user by reset token
      const [user] = await db.select().from(users).where(eq(users.passwordResetToken, token));

      if (!user) {
        return res.status(400).json({ message: "Invalid or expired reset link" });
      }

      // Check if token is expired
      if (!user.passwordResetTokenExpiry || new Date() > new Date(user.passwordResetTokenExpiry)) {
        return res.status(400).json({ message: "Reset link has expired. Please request a new one." });
      }

      // Hash new password
      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

      // Update user with new password and clear reset token
      await db.update(users)
        .set({
          passwordHash,
          passwordResetToken: null,
          passwordResetTokenExpiry: null,
          authProvider: user.authProvider === "google" ? "email" : user.authProvider, // Allow email login now
          emailVerified: user.emailVerified || new Date(), // Mark as verified if not already
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      res.json({ 
        success: true, 
        message: "Password reset successfully. You can now log in with your new password." 
      });
    } catch (error) {
      console.error("Reset password error:", error);
      res.status(500).json({ message: "Failed to reset password" });
    }
  });
}

// Endpoints exempt from the deleted-account gate. The user is mid-deletion
// and can only call these (status, restore, purge-now, logout).
const DELETED_ACCOUNT_ALLOWED_PATHS = new Set<string>([
  "/api/account/deletion-status",
  "/api/account/restore",
  "/api/account/purge-now",
  "/api/auth/logout",
  "/api/auth/native/logout",
]);

async function gateDeletedAccount(
  req: any,
  res: any,
  userId: string,
): Promise<boolean> {
  // Returns true if the request was handled (gated). False = continue.
  const path = req.path || req.originalUrl || "";
  if (DELETED_ACCOUNT_ALLOWED_PATHS.has(path)) return false;
  try {
    const [u] = await db
      .select({ accountStatus: users.accountStatus, scheduledPurgeAt: users.scheduledPurgeAt })
      .from(users)
      .where(eq(users.id, userId));
    if (!u) {
      res.status(401).json({ message: "Unauthorized" });
      return true;
    }
    if (u.accountStatus === "deleted") {
      res.status(423).json({
        message: "Account scheduled for deletion",
        deleted: true,
        scheduledPurgeAt: u.scheduledPurgeAt,
      });
      return true;
    }
    if (u.accountStatus === "purged") {
      res.status(401).json({ message: "Account no longer exists" });
      return true;
    }
  } catch (err) {
    // If the query fails (e.g. column doesn't exist yet during a hot
    // restart), fail open — better than blocking everyone.
    console.warn("[Auth] Deleted-account gate query failed:", (err as any)?.message);
  }
  return false;
}

// Custom authentication middleware — supports both session (web) and JWT Bearer (native)
export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const { authenticateNativeToken } = await import('./nativeAuth');
      const result = await authenticateNativeToken(authHeader.slice(7));
      if (result) {
        if (await gateDeletedAccount(req, res, result.userId)) return;
        (req as any).user = {
          claims: {
            sub: result.userId,
            email: result.email,
            first_name: result.firstName,
            last_name: result.lastName,
          },
        };
        (req.session as any).userId = result.userId;
        (req.session as any).user = {
          id: result.userId,
          email: result.email,
          firstName: result.firstName,
          lastName: result.lastName,
        };
        return next();
      }
    } catch (err) {
      console.error('[Native Auth] Token verification failed:', err);
    }
    return res.status(401).json({ message: "Unauthorized" });
  }

  const sessionUser = (req.session as any).user;
  const userId = (req.session as any).userId;

  if (!sessionUser || !userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  if (await gateDeletedAccount(req, res, userId)) return;

  (req as any).user = {
    claims: {
      sub: userId,
      email: sessionUser.email,
      first_name: sessionUser.firstName,
      last_name: sessionUser.lastName,
    },
  };

  next();
};
