import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Mail, XCircle, Lock, User, AlertCircle } from "lucide-react";
import { FusePhoneLogoImage } from "@/components/FusePhoneLogo";
import { clearLogoutFlag } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";

function useKeyboardVisibleHeight() {
  const [visibleHeight, setVisibleHeight] = useState<number | null>(null);
  const cleanupRef = useRef<(() => void) | undefined>();

  useEffect(() => {
    const setup = async () => {
      try {
        const { Keyboard } = await import('@capacitor/keyboard');
        const showL = await Keyboard.addListener('keyboardWillShow', (info) => {
          setVisibleHeight(window.innerHeight - info.keyboardHeight);
        });
        const hideL = await Keyboard.addListener('keyboardWillHide', () => {
          setVisibleHeight(null);
        });
        cleanupRef.current = () => { showL.remove(); hideL.remove(); };
      } catch {
        const vv = window.visualViewport;
        if (vv) {
          const handler = () => {
            if (vv.height < window.innerHeight - 100) {
              setVisibleHeight(Math.round(vv.height));
            } else {
              setVisibleHeight(null);
            }
          };
          vv.addEventListener('resize', handler);
          cleanupRef.current = () => vv.removeEventListener('resize', handler);
        }
      }
    };
    setup();
    return () => cleanupRef.current?.();
  }, []);

  return visibleHeight;
}

// 'password' is the fallback sign-in path for users whose OTP code never
// arrives (typo'd email, slow delivery, spam). Reachable via the
// "Use password instead" link on the email and OTP steps.
type Step = 'email' | 'otp' | 'error' | 'signup' | 'password';
type Mode = 'signin' | 'signup';

async function fetchWithRetry(url: string, options: RequestInit, retries = 2, delay = 1500): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeout);
      return res;
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('Network request failed');
}

// Persist sign-in flow state across cold reloads. Mobile OS aggressively kills
// backgrounded apps; if a user requests an OTP, switches to their email app to
// read the code, then returns, the OS may have killed Fuse Phone. Without
// persistence the user is dumped back to the email-input screen and the OTP
// they just received looks meaningless. We snapshot to sessionStorage so the
// OTP step + email are restored on reload.
const FLOW_KEY = 'fusephone_native_login_flow';
type FlowSnapshot = { mode: Mode; step: Step; email: string; ts: number };
function loadFlow(): FlowSnapshot | null {
  try {
    const raw = sessionStorage.getItem(FLOW_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FlowSnapshot;
    // Expire after 10 minutes — OTP codes are only valid that long anyway.
    if (Date.now() - parsed.ts > 10 * 60 * 1000) {
      sessionStorage.removeItem(FLOW_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
function saveFlow(snapshot: Omit<FlowSnapshot, 'ts'>) {
  try {
    sessionStorage.setItem(FLOW_KEY, JSON.stringify({ ...snapshot, ts: Date.now() }));
  } catch {}
}
function clearFlow() {
  try { sessionStorage.removeItem(FLOW_KEY); } catch {}
}

export default function NativeLoginPage() {
  const queryClient = useQueryClient();
  const visibleHeight = useKeyboardVisibleHeight();
  const restored = loadFlow();
  const [mode, setMode] = useState<Mode>(restored?.mode ?? 'signin');
  const [step, setStep] = useState<Step>(restored?.step ?? 'email');
  const [email, setEmail] = useState(restored?.email ?? '');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);

  // Login intent banner: when the user arrives here from the paywall's
  // "Sign in as ga***t@..." button (their Apple ID's subscription belongs
  // to a different FusePhone account), show a top banner reminding them
  // what they came to do. Without this they land at a blank login screen
  // and forget the context. Expires after 30 minutes.
  const [loginIntent, setLoginIntent] = useState<{ maskedEmail: string } | null>(() => {
    try {
      const raw = sessionStorage.getItem("fusephone_login_intent");
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (
        parsed?.intent === "cancel_existing_sub" &&
        parsed?.maskedEmail &&
        typeof parsed.setAt === "number" &&
        Date.now() - parsed.setAt < 30 * 60 * 1000
      ) {
        return { maskedEmail: String(parsed.maskedEmail) };
      }
      sessionStorage.removeItem("fusephone_login_intent");
      return null;
    } catch {
      return null;
    }
  });
  const dismissLoginIntent = () => {
    try { sessionStorage.removeItem("fusephone_login_intent"); } catch { /* non-fatal */ }
    setLoginIntent(null);
  };

  useEffect(() => {
    const fn = (window as any).__dismissSplash;
    if (fn) fn();
  }, []);

  // Persist current flow position whenever step/email/mode changes so the
  // user doesn't lose their place on cold-reload mid-login.
  useEffect(() => {
    if (step === 'otp' || (step === 'email' && email)) {
      saveFlow({ mode, step, email });
    } else if (step === 'signup') {
      saveFlow({ mode, step, email });
    } else {
      clearFlow();
    }
  }, [mode, step, email]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const requestOtp = async () => {
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetchWithRetry('/api/auth/native/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (res.status === 429) {
        setError(data.message || 'Too many requests. Please try again later.');
      } else {
        setStep('otp');
        setResendCooldown(60);
        setRemainingAttempts(null);
      }
    } catch {
      setError('Unable to connect. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (!otp.trim()) {
      setError('Please enter the verification code.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetchWithRetry('/api/auth/native/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), code: otp.trim().toUpperCase() }),
      });
      const data = await res.json();
      // Account was scheduled for deletion — route to restore screen.
      if (data.deleted) {
        try {
          const { setRestoreContext } = await import("@/pages/RestoreAccount");
          setRestoreContext(data.restoreToken || "", data.email || email.trim());
        } catch {}
        clearFlow();
        window.location.href = "/restore-account";
        return;
      }
      if (data.success) {
        clearLogoutFlag();
        clearFlow();

        const { storeTokens } = await import('@/lib/native-auth');
        await storeTokens(data.accessToken, data.refreshToken);

        queryClient.removeQueries({
          predicate: (query) => String(query.queryKey[0]) !== '/api/auth/user',
        });

        try {
          const subRes = await fetch('/api/subscription', {
            credentials: 'include',
            headers: { 'Authorization': `Bearer ${data.accessToken}` },
          });
          if (subRes.ok) {
            const subData = await subRes.json();
            queryClient.setQueryData(['/api/subscription'], subData);
          }
        } catch {}

        queryClient.setQueryData(['/api/auth/user'], data.user || { email: email.trim() });
      } else {
        if (data.message === 'No account found.') {
          setStep('error');
        } else {
          setError(data.message || 'Invalid code.');
          if (data.remainingAttempts !== undefined) {
            setRemainingAttempts(data.remainingAttempts);
            if (data.remainingAttempts === 0) {
              setStep('error');
              setError('Too many attempts. Please try again.');
            }
          }
        }
      }
    } catch {
      setError('Unable to connect. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setOtp('');
    setError('');
    setRemainingAttempts(null);
    await requestOtp();
  };

  // Password fallback. Same token-storage + cache-priming pattern as
  // submitSignup() so successful login slides straight into the app.
  const submitPasswordLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetchWithRetry('/api/auth/native/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.message || 'Invalid email or password.');
        return;
      }
      clearLogoutFlag();
      clearFlow();
      const { storeTokens } = await import('@/lib/native-auth');
      await storeTokens(data.accessToken, data.refreshToken);
      queryClient.removeQueries({
        predicate: (query) => String(query.queryKey[0]) !== '/api/auth/user',
      });
      try {
        const subRes = await fetch('/api/subscription', {
          credentials: 'include',
          headers: { 'Authorization': `Bearer ${data.accessToken}` },
        });
        if (subRes.ok) {
          const subData = await subRes.json();
          queryClient.setQueryData(['/api/subscription'], subData);
        }
      } catch {}
      queryClient.setQueryData(['/api/auth/user'], data.user || { email: email.trim() });
    } catch {
      setError('Unable to connect. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const submitSignup = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetchWithRetry('/api/auth/native/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          firstName: firstName.trim() || undefined,
          lastName: lastName.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.message || 'Unable to create account. Please try again.');
        return;
      }
      clearLogoutFlag();
      clearFlow();
      const { storeTokens } = await import('@/lib/native-auth');
      await storeTokens(data.accessToken, data.refreshToken);
      queryClient.removeQueries({
        predicate: (query) => String(query.queryKey[0]) !== '/api/auth/user',
      });
      try {
        const subRes = await fetch('/api/subscription', {
          credentials: 'include',
          headers: { 'Authorization': `Bearer ${data.accessToken}` },
        });
        if (subRes.ok) {
          const subData = await subRes.json();
          queryClient.setQueryData(['/api/subscription'], subData);
        }
      } catch {}
      queryClient.setQueryData(['/api/auth/user'], data.user || { email: email.trim() });
    } catch {
      setError('Unable to connect. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setStep(next === 'signup' ? 'signup' : 'email');
    setError('');
    setOtp('');
    setPassword('');
    setRemainingAttempts(null);
    clearFlow();
  };

  return (
    <div
      className="flex flex-col items-center justify-center px-6 overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #0F172A 100%)',
        height: visibleHeight ? `${visibleHeight}px` : '100vh',
        minHeight: visibleHeight ? `${visibleHeight}px` : '100vh',
        transition: 'height 0.28s ease-out, min-height 0.28s ease-out',
      }}
      data-testid="native-auth-screen"
    >
      <div className="w-full max-w-sm">
        {loginIntent && !visibleHeight && (
          <div
            className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-left"
            data-testid="banner-login-intent"
          >
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-amber-200" data-testid="text-login-intent-title">
                  Sign in to {loginIntent.maskedEmail}
                </p>
                <p className="text-[11px] text-amber-100/80 mt-1 leading-snug" data-testid="text-login-intent-body">
                  After signing in: open Profile → scroll to the bottom → tap{" "}
                  <span className="font-semibold">Delete Account</span>. Then
                  cancel the subscription in iPhone Settings → Subscriptions,
                  sign back into your new account, and tap Subscribe.
                </p>
                <button
                  type="button"
                  onClick={dismissLoginIntent}
                  className="mt-2 text-[11px] text-amber-300 underline"
                  data-testid="button-dismiss-login-intent"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="text-center flex flex-col items-center" style={{ marginBottom: visibleHeight ? '16px' : '32px', transition: 'margin-bottom 0.28s ease-out' }}>
          <div
            className="bg-white rounded-2xl flex items-center justify-center shadow-lg"
            style={{
              // Keyboard-up: shrink so the form stays visible. Keyboard-down:
              // a more prominent 144px tile so the brand reads at a glance,
              // matching the boot splash size.
              width: visibleHeight ? '64px' : '144px',
              height: visibleHeight ? '64px' : '144px',
              transition: 'width 0.28s ease-out, height 0.28s ease-out',
            }}
          >
            <FusePhoneLogoImage size="xl" className={visibleHeight ? "!w-11 !h-11" : "!w-28 !h-28"} />
          </div>
          <h1 className="font-bold text-white" style={{ fontSize: visibleHeight ? '18px' : '32px', marginTop: visibleHeight ? '8px' : '20px', letterSpacing: '0.3px', transition: 'font-size 0.28s ease-out, margin-top 0.28s ease-out' }}>Fuse Phone</h1>
          {!visibleHeight && (
            <p className="text-slate-300 text-sm mt-1.5 max-w-xs leading-snug" data-testid="text-native-login-tagline">
              The CRM for painters and home services contractors
            </p>
          )}
          <p className="text-slate-400 text-sm mt-3">
            {step === 'signup' ? 'Create your account' : step === 'email' ? 'Sign in to your account' : step === 'otp' ? 'Enter your verification code' : step === 'password' ? 'Sign in with your password' : ''}
          </p>
        </div>

        {step === 'email' && (
          <div className="space-y-4" data-testid="native-email-step">
            <div className="space-y-2">
              <Label htmlFor="native-email" className="text-slate-300 text-sm">Email address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                  id="native-email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(''); }}
                  onKeyDown={(e) => e.key === 'Enter' && requestOtp()}
                  className="pl-10 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-blue-500"
                  autoComplete="email"
                  data-testid="input-native-email"
                />
              </div>
            </div>

            {error && (
              <p className="text-red-400 text-sm text-center" data-testid="text-native-error">{error}</p>
            )}

            <Button
              onClick={requestOtp}
              disabled={loading || !email.trim()}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              size="lg"
              data-testid="button-native-continue"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Continue
            </Button>

            {/* Password fallback for users who can't get the OTP code */}
            <div className="text-center">
              <button
                type="button"
                onClick={() => { setPassword(''); setError(''); setStep('password'); }}
                className="text-slate-400 hover:text-slate-300 text-sm transition-colors"
                data-testid="button-native-use-password"
              >
                Use password instead
              </button>
            </div>
          </div>
        )}

        {step === 'password' && (
          <div className="space-y-4" data-testid="native-password-step">
            <div className="space-y-2">
              <Label htmlFor="native-login-email" className="text-slate-300 text-sm">Email address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                  id="native-login-email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(''); }}
                  className="pl-10 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-blue-500"
                  autoComplete="email"
                  data-testid="input-native-login-email"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="native-login-password" className="text-slate-300 text-sm">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                  id="native-login-password"
                  type="password"
                  placeholder="Your password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(''); }}
                  onKeyDown={(e) => e.key === 'Enter' && submitPasswordLogin()}
                  className="pl-10 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-blue-500"
                  autoComplete="current-password"
                  data-testid="input-native-login-password"
                />
              </div>
            </div>

            {error && (
              <p className="text-red-400 text-sm text-center" data-testid="text-native-login-error">{error}</p>
            )}

            <Button
              onClick={submitPasswordLogin}
              disabled={loading || !email.trim() || !password.trim()}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              size="lg"
              data-testid="button-native-password-signin"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Sign in
            </Button>

            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={async () => {
                  // Use Capacitor Browser on iOS so the in-app SFSafariViewController
                  // opens reliably and returns the user to the app. window.open is
                  // unpredictable inside a Capacitor WKWebView. Fallback to window.open
                  // when the plugin isn't available (web/dev).
                  const url = 'https://app.fusephone.com/forgot-password';
                  try {
                    const { Browser } = await import('@capacitor/browser');
                    await Browser.open({ url });
                  } catch {
                    window.open(url, '_blank');
                  }
                }}
                className="text-blue-400 hover:text-blue-300 transition-colors"
                data-testid="button-native-forgot-password"
              >
                Forgot password?
              </button>
              <button
                type="button"
                onClick={() => { setPassword(''); setError(''); setStep('email'); }}
                className="text-slate-400 hover:text-slate-300 transition-colors"
                data-testid="button-native-use-code"
              >
                Use code instead
              </button>
            </div>
          </div>
        )}

        {step === 'otp' && (
          <div className="space-y-4" data-testid="native-otp-step">
            <p className="text-slate-400 text-sm text-center">
              We sent a 6-digit code to<br />
              <span className="text-white font-medium">{email}</span>
            </p>

            <div className="space-y-2">
              <Input
                type="text"
                placeholder="Enter 6-digit code"
                value={otp}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6);
                  setOtp(val);
                  setError('');
                }}
                onKeyDown={(e) => e.key === 'Enter' && otp.length === 6 && verifyOtp()}
                className="text-center text-2xl tracking-[0.3em] font-mono bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 placeholder:text-base placeholder:tracking-normal focus:border-blue-500"
                maxLength={6}
                autoFocus
                autoComplete="one-time-code"
                data-testid="input-native-otp"
              />
            </div>

            {error && (
              <p className="text-red-400 text-sm text-center" data-testid="text-native-error">{error}</p>
            )}

            {remainingAttempts !== null && remainingAttempts > 0 && (
              <p className="text-slate-500 text-xs text-center">{remainingAttempts} attempt{remainingAttempts !== 1 ? 's' : ''} remaining</p>
            )}

            <Button
              onClick={verifyOtp}
              disabled={loading || otp.length < 6}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              size="lg"
              data-testid="button-native-verify"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Verify
            </Button>

            <div className="flex items-center justify-between text-sm">
              <button
                onClick={handleResend}
                disabled={resendCooldown > 0}
                className={`${resendCooldown > 0 ? 'text-slate-600' : 'text-blue-400 hover:text-blue-300'} transition-colors`}
                data-testid="button-native-resend"
              >
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
              </button>
              <button
                onClick={() => { setStep('email'); setOtp(''); setError(''); setRemainingAttempts(null); }}
                className="text-slate-400 hover:text-slate-300 transition-colors"
                data-testid="button-native-change-email"
              >
                Different email
              </button>
            </div>

            {/* Secondary fallback in case the code never arrives */}
            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => { setOtp(''); setPassword(''); setError(''); setRemainingAttempts(null); setStep('password'); }}
                className="text-slate-400 hover:text-slate-300 text-sm transition-colors"
                data-testid="button-native-otp-use-password"
              >
                Code not arriving? Use password instead
              </button>
            </div>
          </div>
        )}

        {step === 'signup' && (
          <div className="space-y-3" data-testid="native-signup-step">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label htmlFor="native-firstname" className="text-slate-300 text-sm">First name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <Input
                    id="native-firstname"
                    type="text"
                    placeholder="Jane"
                    value={firstName}
                    onChange={(e) => { setFirstName(e.target.value); setError(''); }}
                    className="pl-10 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-blue-500"
                    autoComplete="given-name"
                    data-testid="input-native-firstname"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="native-lastname" className="text-slate-300 text-sm">Last name</Label>
                <Input
                  id="native-lastname"
                  type="text"
                  placeholder="Doe"
                  value={lastName}
                  onChange={(e) => { setLastName(e.target.value); setError(''); }}
                  className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-blue-500"
                  autoComplete="family-name"
                  data-testid="input-native-lastname"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="native-signup-email" className="text-slate-300 text-sm">Email address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                  id="native-signup-email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(''); }}
                  className="pl-10 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-blue-500"
                  autoComplete="email"
                  data-testid="input-native-signup-email"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="native-password" className="text-slate-300 text-sm">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                  id="native-password"
                  type="password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(''); }}
                  onKeyDown={(e) => e.key === 'Enter' && submitSignup()}
                  className="pl-10 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-blue-500"
                  autoComplete="new-password"
                  data-testid="input-native-password"
                />
              </div>
            </div>

            {error && (
              <p className="text-red-400 text-sm text-center" data-testid="text-native-signup-error">{error}</p>
            )}

            <Button
              onClick={submitSignup}
              disabled={loading || !email.trim() || password.length < 8}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              size="lg"
              data-testid="button-native-signup"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Create account
            </Button>

            <p className="text-slate-500 text-xs text-center px-2">
              By creating an account, you agree to our Terms of Service and Privacy Policy. You'll choose a subscription plan on the next screen.
            </p>
          </div>
        )}

        {step === 'error' && (
          <div className="text-center space-y-4" data-testid="native-error-step">
            <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mx-auto">
              <XCircle className="w-8 h-8 text-slate-400" />
            </div>
            <p className="text-slate-300 text-base">No account found.</p>
            <p className="text-slate-500 text-sm">Create an account to get started with Fuse Phone.</p>
            <div className="flex flex-col gap-2">
              <Button
                onClick={() => { setStep('signup'); setMode('signup'); setOtp(''); setError(''); setRemainingAttempts(null); }}
                className="bg-blue-600 hover:bg-blue-700 text-white"
                data-testid="button-native-create-from-error"
              >
                Create account
              </Button>
              <Button
                onClick={() => { setStep('email'); setMode('signin'); setOtp(''); setError(''); setRemainingAttempts(null); }}
                variant="outline"
                className="border-slate-700 text-slate-300 hover:bg-slate-800"
                data-testid="button-native-try-again"
              >
                Try a different email
              </Button>
            </div>
          </div>
        )}

        {(step === 'email' || step === 'signup' || step === 'password') && (
          <p className="text-center text-slate-400 text-sm mt-6" data-testid="text-native-mode-toggle">
            {step === 'signup' ? (
              <>
                Already have an account?{' '}
                <button
                  onClick={() => switchMode('signin')}
                  className="text-blue-400 hover:text-blue-300 font-medium"
                  data-testid="button-native-switch-signin"
                >
                  Sign in
                </button>
              </>
            ) : (
              <>
                New to Fuse Phone?{' '}
                <button
                  onClick={() => switchMode('signup')}
                  className="text-blue-400 hover:text-blue-300 font-medium"
                  data-testid="button-native-switch-signup"
                >
                  Create an account
                </button>
              </>
            )}
          </p>
        )}

        <p className="text-center text-slate-600 text-xs mt-6" data-testid="text-native-footer">
          Fuse Phone CRM
        </p>
      </div>
    </div>
  );
}
