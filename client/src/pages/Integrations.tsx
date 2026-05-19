import { useCompanySettings, useUpdateCompanySettings, useTwilioNumbers } from "@/hooks/use-company-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, type ReactNode } from "react";
import { Loader2, Settings, Phone, CheckCircle, AlertTriangle, Pencil, Save, Mail, Calendar, Lock, CreditCard, ExternalLink, Camera, Copy, Briefcase, Zap, Info, ArrowRight, Building2, User, MessageSquare, PhoneCall, PhoneOff, Mic, Shield, Radio, RefreshCw, Unlink, ChevronDown, BarChart3, Eye, EyeOff, Globe, Banknote } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SiTwilio, SiGoogle, SiFacebook, SiThumbtack, SiZapier } from "react-icons/si";
import { Badge } from "@/components/ui/badge";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { CompanySettings } from "@shared/schema";
import { PRICE_LABELS } from "@shared/pricing";
import { cn, formatPhoneDisplay } from "@/lib/utils";
import { useSubscription } from "@/hooks/use-subscription";
import { useIsNativeApp } from "@/hooks/use-ios-app";
import { Link } from "wouter";

function IntegrationAccordionItem({ 
  id, icon, iconBg, title, description, status, isExpanded, onToggle, children 
}: { 
  id: string; icon: ReactNode; iconBg: string; title: string; description: string; 
  status: 'connected' | 'not_connected' | 'partial' | 'receiving'; 
  isExpanded: boolean; onToggle: (id: string) => void; children: ReactNode;
}) {
  const statusBadge = {
    connected: <Badge variant="outline" className="text-green-600 border-green-500/30 text-xs">Connected</Badge>,
    receiving: <Badge variant="outline" className="text-green-600 border-green-500/30 text-xs">Receiving Leads</Badge>,
    partial: <Badge variant="outline" className="text-amber-600 border-amber-500/30 text-xs">Partial</Badge>,
    not_connected: <Badge variant="secondary" className="text-xs">Not Connected</Badge>,
  }[status];

  return (
    <Card data-testid={`integration-card-${id}`}>
      <div 
        className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none hover:bg-muted/30 transition-colors rounded-t-lg"
        onClick={() => onToggle(id)}
        data-testid={`integration-toggle-${id}`}
      >
        <div className={`w-9 h-9 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-tight">{title}</p>
          <p className="text-xs text-muted-foreground truncate">{description}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {statusBadge}
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
        </div>
      </div>
      {isExpanded && (
        <CardContent className="pt-0 pb-4 px-4 border-t" onClick={(e) => e.stopPropagation()}>
          {children}
        </CardContent>
      )}
    </Card>
  );
}

function PaymentProcessingCard({ settings }: { settings: CompanySettings | null | undefined }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showDisconnect, setShowDisconnect] = useState<'stripe' | 'square' | null>(null);

  const { data: stripeStatus, isLoading: stripeLoading } = useQuery<{
    connected: boolean;
    legacy: boolean;
    accountId: string | null;
    chargesEnabled: boolean;
    detailsSubmitted: boolean;
    businessName?: string | null;
    email?: string | null;
  }>({
    queryKey: ['/api/stripe/connect/status'],
  });

  const { data: squareStatus, isLoading: squareLoading } = useQuery<{
    connected: boolean;
    merchantId?: string;
    locationId?: string;
    merchantName?: string;
  }>({
    queryKey: ['/api/square/status'],
  });

  const stripeHasAccount = !!settings?.stripeAccountId;
  const stripeLegacy = !!(settings?.stripeSecretKey && settings?.stripePublishableKey);
  const squareHasAccount = !!settings?.squareMerchantId;
  const stripeConnected = stripeStatus ? stripeStatus.connected : (stripeLegacy || false);
  const stripePending = stripeStatus ? (stripeStatus.accountId && !stripeStatus.connected) : (stripeHasAccount && !stripeLegacy);
  const squareConnected = squareStatus ? squareStatus.connected : squareHasAccount;
  const hasAnyProcessor = stripeConnected || squareConnected;

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/stripe/connect/status'] });
    queryClient.invalidateQueries({ queryKey: ['/api/square/status'] });
    queryClient.invalidateQueries({ queryKey: ['/api/settings/company'] });
  };

  const stripeConnectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/stripe/connect/create-account');
      if (!res.ok) { const data = await res.json(); throw new Error(data.message || 'Failed to start Stripe setup'); }
      return res.json();
    },
    onSuccess: (data) => {
      if (data.alreadyConnected) { invalidateAll(); toast({ title: "Already Connected", description: "Your Stripe account is already connected" }); }
      else if (data.url) { window.location.href = data.url; }
    },
    onError: (error: Error) => { toast({ title: "Connection Failed", description: error.message, variant: "destructive" }); }
  });

  const squareConnectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/square/connect');
      if (!res.ok) { const data = await res.json(); throw new Error(data.message || 'Failed to start Square setup'); }
      return res.json();
    },
    onSuccess: (data) => {
      if (data.url) { window.location.href = data.url; }
    },
    onError: (error: Error) => { toast({ title: "Connection Failed", description: error.message, variant: "destructive" }); }
  });

  const stripeDisconnectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/stripe/disconnect');
      if (!res.ok) { const data = await res.json(); throw new Error(data.message || 'Failed to disconnect'); }
      return res.json();
    },
    onSuccess: () => { invalidateAll(); toast({ title: "Stripe Disconnected", description: "Payment processing has been removed" }); setShowDisconnect(null); },
    onError: (error: Error) => { toast({ title: "Failed to disconnect", description: error.message, variant: "destructive" }); setShowDisconnect(null); }
  });

  const squareDisconnectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/square/disconnect');
      if (!res.ok) { const data = await res.json(); throw new Error(data.message || 'Failed to disconnect'); }
      return res.json();
    },
    onSuccess: () => { invalidateAll(); toast({ title: "Square Disconnected", description: "Payment processing has been removed" }); setShowDisconnect(null); },
    onError: (error: Error) => { toast({ title: "Failed to disconnect", description: error.message, variant: "destructive" }); setShowDisconnect(null); }
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('stripe') === 'connected') {
      invalidateAll();
      toast({ title: "Stripe Connected!", description: "Your clients can now pay invoices online" });
      window.history.replaceState({}, '', window.location.pathname);
    } else if (params.get('stripe') === 'error') {
      toast({ title: "Stripe Setup Issue", description: "There was a problem connecting your Stripe account. Please try again.", variant: "destructive" });
      window.history.replaceState({}, '', window.location.pathname);
    } else if (params.get('square') === 'connected') {
      invalidateAll();
      toast({ title: "Square Connected!", description: "Your clients can now pay invoices online via Square" });
      window.history.replaceState({}, '', window.location.pathname);
    } else if (params.get('square') === 'error') {
      toast({ title: "Square Setup Issue", description: "There was a problem connecting your Square account. Please try again.", variant: "destructive" });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  return (
    <>
      <div className="space-y-4">
        {!hasAnyProcessor && !stripePending && (
          <div className="flex items-start gap-3 p-4 bg-muted/30 rounded-lg">
            <Info className="w-5 h-5 text-primary mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-medium">Accept payments from your clients</p>
              <p className="text-sm text-muted-foreground">
                Connect Stripe or Square so your clients can pay invoices and deposits online. Payments go directly to you. Choose one payment processor below.
              </p>
            </div>
          </div>
        )}

        {stripePending && (
          <div className="flex items-start gap-3 p-4 bg-yellow-500/5 border border-yellow-500/20 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-yellow-500 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-medium">Stripe Setup Incomplete</p>
              <p className="text-sm text-muted-foreground">
                Your Stripe account setup is not complete. Click below to finish connecting.
              </p>
            </div>
          </div>
        )}

        <div className="grid gap-3">
          <div className={`relative rounded-lg border p-4 ${stripeConnected ? 'border-green-500/30 bg-green-500/5' : stripePending ? 'border-yellow-500/30 bg-yellow-500/5' : 'border-border'}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-[#635BFF]/10 flex items-center justify-center shrink-0">
                  <CreditCard className="w-5 h-5 text-[#635BFF]" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm">Stripe</p>
                  <p className="text-xs text-muted-foreground">
                    {stripeConnected ? 'Connected' : stripePending ? 'Setup incomplete' : 'Online card payments'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {stripeConnected ? (
                  <>
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <Button variant="outline" size="sm" onClick={() => setShowDisconnect('stripe')} data-testid="button-disconnect-stripe">
                      Disconnect
                    </Button>
                  </>
                ) : stripePending ? (
                  <>
                    <Button size="sm" onClick={() => stripeConnectMutation.mutate()} disabled={stripeConnectMutation.isPending} data-testid="button-finish-stripe-setup">
                      {stripeConnectMutation.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                      Finish Setup
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setShowDisconnect('stripe')} data-testid="button-disconnect-stripe-pending">
                      Disconnect
                    </Button>
                  </>
                ) : (
                  <Button size="sm" onClick={() => stripeConnectMutation.mutate()} disabled={stripeConnectMutation.isPending || squareConnected} data-testid="button-connect-stripe">
                    {stripeConnectMutation.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                    Connect
                  </Button>
                )}
              </div>
            </div>
            {(stripeConnected || stripePending) && (stripeStatus?.email || stripeLoading) && (
              <p className="text-xs text-muted-foreground mt-2 ml-[52px] truncate">
                {stripeStatus?.email || ''}
                {stripeLoading && <Loader2 className="inline w-3 h-3 ml-1 animate-spin" />}
              </p>
            )}
          </div>

          <div className={`relative rounded-lg border p-4 ${squareConnected ? 'border-green-500/30 bg-green-500/5' : 'border-border'}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-black/10 dark:bg-white/10 flex items-center justify-center shrink-0">
                  <Banknote className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm">Square</p>
                  <p className="text-xs text-muted-foreground">
                    {squareConnected ? 'Connected' : 'Online card payments'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {squareConnected ? (
                  <>
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <Button variant="outline" size="sm" onClick={() => setShowDisconnect('square')} data-testid="button-disconnect-square">
                      Disconnect
                    </Button>
                  </>
                ) : (
                  <Button size="sm" onClick={() => squareConnectMutation.mutate()} disabled={squareConnectMutation.isPending || stripeConnected || !!stripePending} data-testid="button-connect-square">
                    {squareConnectMutation.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                    Connect
                  </Button>
                )}
              </div>
            </div>
            {squareConnected && squareStatus?.merchantName && (
              <p className="text-xs text-muted-foreground mt-2 ml-[52px] truncate">
                {squareStatus.merchantName}
              </p>
            )}
          </div>
        </div>

        {(stripeConnected || squareConnected || stripePending) && (
          <p className="text-xs text-muted-foreground">
            {stripePending && !stripeConnected
              ? 'Finish your Stripe setup or disconnect to start fresh or use a different processor.'
              : 'To switch payment processors, disconnect the current one first.'}
          </p>
        )}
      </div>

      <Dialog open={showDisconnect === 'stripe'} onOpenChange={(open) => !open && setShowDisconnect(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect Stripe?</DialogTitle>
            <DialogDescription>
              {stripePending && !stripeConnected
                ? 'This will clear your incomplete Stripe setup. You can start fresh or connect a different processor.'
                : 'Your clients will no longer be able to pay invoices online. You can reconnect anytime.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setShowDisconnect(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => stripeDisconnectMutation.mutate()} disabled={stripeDisconnectMutation.isPending} data-testid="button-confirm-disconnect-stripe">
              {stripeDisconnectMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDisconnect === 'square'} onOpenChange={(open) => !open && setShowDisconnect(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect Square?</DialogTitle>
            <DialogDescription>Your clients will no longer be able to pay invoices online via Square. You can reconnect anytime.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setShowDisconnect(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => squareDisconnectMutation.mutate()} disabled={squareDisconnectMutation.isPending} data-testid="button-confirm-disconnect-square">
              {squareDisconnectMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function EmailIntegrationCard({ settings }: { settings: CompanySettings | null | undefined }) {
  const { canUseCustomDomainEmail } = useSubscription();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const googleConnected = !!settings?.googleEmail;
  const sendgridConnected = !!settings?.sendgridConnectedAt;
  const sendgridVerified = !!settings?.sendgridDomainVerified;
  const anyConnected = googleConnected || sendgridConnected;
  const activeMethod: 'google' | 'domain' | null = googleConnected ? 'google' : sendgridConnected ? 'domain' : null;
  const [selectedMethod, setSelectedMethod] = useState<'google' | 'domain'>(activeMethod || 'google');
  const [showGoogleDisconnect, setShowGoogleDisconnect] = useState(false);
  const [showDomainDisconnect, setShowDomainDisconnect] = useState(false);

  const [domainName, setDomainName] = useState('');
  const [domainFromEmail, setDomainFromEmail] = useState('');
  const [dnsRecords, setDnsRecords] = useState<Array<{ type: string; host: string; data: string; valid: boolean }>>([]);
  const [domainStep, setDomainStep] = useState<'setup' | 'dns' | 'verified'>('setup');
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    if (settings) {
      if (settings.sendgridDomain && settings.sendgridConnectedAt) {
        setDomainName(settings.sendgridDomain);
        setDomainFromEmail(settings.sendgridFromEmail || '');
        setDomainStep(settings.sendgridDomainVerified ? 'verified' : 'dns');
      } else {
        setDomainName('');
        setDomainFromEmail('');
        setDnsRecords([]);
        setDomainStep('setup');
      }
    }
  }, [settings]);

  useEffect(() => {
    if (googleConnected) setSelectedMethod('google');
    else if (sendgridConnected) setSelectedMethod('domain');
  }, [googleConnected, sendgridConnected]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const googleStatus = params.get('google');
    if (googleStatus === 'connected') {
      toast({ title: "Google Connected", description: "Your Gmail and Calendar are now linked" });
      queryClient.invalidateQueries({ queryKey: ['/api/settings/company'] });
      window.history.replaceState({}, '', window.location.pathname);
    } else if (googleStatus === 'error') {
      const message = params.get('message') || 'Connection failed';
      toast({ title: "Connection Failed", description: message, variant: "destructive" });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [toast, queryClient]);

  const isNative = useIsNativeApp();

  const googleConnectMutation = useMutation({
    mutationFn: async () => {
      const mobileParam = isNative ? '?mobile=1' : '';
      const res = await apiRequest('GET', `/api/google/oauth/start${mobileParam}`);
      const data = await res.json();
      return data.authUrl;
    },
    onSuccess: async (authUrl: string) => {
      if (isNative) {
        try {
          const { Browser } = await import('@capacitor/browser');
          await Browser.open({ url: authUrl, windowName: '_self' });
        } catch {
          window.location.href = authUrl;
        }
      } else {
        window.location.href = authUrl;
      }
    },
    onError: (error: Error) => {
      toast({ title: "Failed to connect", description: error.message || "Could not start Google connection.", variant: "destructive" });
    }
  });

  const googleDisconnectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/google/disconnect');
      if (!res.ok) { const data = await res.json(); throw new Error(data.message || 'Failed to disconnect'); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/settings/company'] });
      toast({ title: "Disconnected", description: "Google account has been disconnected" });
      setShowGoogleDisconnect(false);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to disconnect", description: error.message, variant: "destructive" });
      setShowGoogleDisconnect(false);
    }
  });

  const domainSetupMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/sendgrid/domain', { domain: domainName.trim(), fromEmail: domainFromEmail.trim() });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/settings/company'] });
      setDnsRecords(data.dnsRecords || []);
      setDomainStep('dns');
      toast({ title: "Domain registered", description: "Now add the DNS records below to your domain host" });
    },
    onError: (error: Error) => {
      toast({ title: "Setup failed", description: error.message, variant: "destructive" });
    }
  });

  const loadDnsRecords = async () => {
    try {
      const res = await apiRequest('GET', '/api/sendgrid/dns-records');
      if (res.ok) {
        const data = await res.json();
        setDnsRecords(data.dnsRecords || []);
      }
    } catch {}
  };

  useEffect(() => {
    if (sendgridConnected && !sendgridVerified && domainStep === 'dns' && dnsRecords.length === 0) {
      loadDnsRecords();
    }
  }, [sendgridConnected, sendgridVerified, domainStep]);

  const verifyDomainAction = async () => {
    setIsVerifying(true);
    try {
      const res = await apiRequest('POST', '/api/sendgrid/verify');
      const data = await res.json();
      if (data.verified) {
        setDomainStep('verified');
        queryClient.invalidateQueries({ queryKey: ['/api/settings/company'] });
        toast({ title: "Domain verified!", description: "Your custom domain email is now active" });
      } else {
        toast({ title: "Not verified yet", description: "DNS records haven't propagated. This can take up to 48 hours. Try again later.", variant: "destructive" });
        if (data.dnsRecords?.length) setDnsRecords(data.dnsRecords);
      }
    } catch (err: any) {
      toast({ title: "Verification failed", description: err.message, variant: "destructive" });
    } finally {
      setIsVerifying(false);
    }
  };

  const domainDisconnectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/sendgrid/disconnect');
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/settings/company'] });
      toast({ title: "Domain disconnected" });
      setShowDomainDisconnect(false);
      setDomainName(''); setDomainFromEmail(''); setDnsRecords([]); setDomainStep('setup');
    },
    onError: (error: Error) => {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    }
  });

  const renderDomainSetup = () => (
    <div className="space-y-4">
      <div className="p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg space-y-2">
        <p className="text-sm font-medium text-blue-900 dark:text-blue-300">Send professional emails from your own domain</p>
        <p className="text-xs text-blue-700 dark:text-blue-400">
          Instead of emails coming from a generic address, your clients will see emails from something like info@yourbusiness.com — it builds trust and looks professional.
        </p>
        <div className="text-xs text-blue-700 dark:text-blue-400 space-y-1 pt-1">
          <p className="font-medium">How it works (3 simple steps):</p>
          <p>1. Enter your domain name and email below</p>
          <p>2. Copy a few settings to your domain provider (where you bought your domain)</p>
          <p>3. Click verify — that's it!</p>
        </div>
      </div>
      <div className="space-y-3">
        <div>
          <Label htmlFor="domain-name">Your domain</Label>
          <Input id="domain-name" placeholder="yourbusiness.com" value={domainName} onChange={e => setDomainName(e.target.value)} data-testid="input-domain-name" />
          <p className="text-xs text-muted-foreground mt-1">Just the domain — no "www" or "https"</p>
        </div>
        <div>
          <Label htmlFor="domain-from-email">Send emails from</Label>
          <Input id="domain-from-email" placeholder="info@yourbusiness.com" value={domainFromEmail} onChange={e => setDomainFromEmail(e.target.value)} data-testid="input-domain-from-email" />
          <p className="text-xs text-muted-foreground mt-1">This is the email address your clients will see (e.g. info@, hello@, estimates@)</p>
        </div>
      </div>
      <Button
        onClick={() => {
          const emailDomain = domainFromEmail.trim().split('@')[1];
          if (!domainFromEmail.includes('@') || !emailDomain) {
            toast({ title: "Invalid email", description: "Enter a valid email address", variant: "destructive" });
            return;
          }
          if (emailDomain !== domainName.trim()) {
            toast({ title: "Domain mismatch", description: `Email must be @${domainName.trim()}`, variant: "destructive" });
            return;
          }
          domainSetupMutation.mutate();
        }}
        disabled={domainSetupMutation.isPending || !domainName.trim() || !domainFromEmail.trim()}
        data-testid="button-setup-domain"
      >
        {domainSetupMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        Set Up Domain
      </Button>
    </div>
  );

  const handleClipboardCopy = async (text: string) => {
    const { copyToClipboard } = await import("@/lib/clipboard");
    const ok = await copyToClipboard(text);
    toast({ title: ok ? "Copied!" : "Could not copy", description: ok ? undefined : text, variant: ok ? "default" : "destructive" });
  };

  const renderDomainDns = () => (
    <div className="space-y-4">
      <div className="p-4 bg-muted/50 rounded-lg">
        <p className="font-medium" data-testid="text-domain-name">{domainName}</p>
        <p className="text-sm text-muted-foreground">Sending from: {domainFromEmail}</p>
      </div>
      <div className="p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg space-y-2">
        <p className="text-sm font-medium text-amber-900 dark:text-amber-300">Step 2: Add DNS records</p>
        <p className="text-xs text-amber-700 dark:text-amber-400">
          DNS records are settings at the company where you bought your domain name. You need to copy the records below and paste them there. This tells email servers that Fuse Phone is allowed to send emails on your behalf.
        </p>
        <div className="text-xs text-amber-700 dark:text-amber-400 pt-1">
          <p className="font-medium">Where to find your DNS settings:</p>
          <p>GoDaddy: My Products &gt; DNS &gt; Manage</p>
          <p>Namecheap: Domain List &gt; Manage &gt; Advanced DNS</p>
          <p>Google Domains: DNS &gt; Manage custom records</p>
          <p>Cloudflare: Select site &gt; DNS &gt; Records</p>
        </div>
      </div>
      <div>
        <p className="font-medium text-sm mb-3">Copy and paste each record below</p>
        <div className="space-y-3">
          {dnsRecords.map((record, i) => (
            <Card key={i} className={`overflow-hidden ${record.valid ? 'border-green-500/30' : ''}`} data-testid={`card-dns-record-${i}`}>
              <CardContent className="p-0">
                <div className="flex items-center justify-between px-4 py-2.5 bg-muted/50 border-b">
                  <div className="flex items-center gap-2">
                    <Badge variant={record.valid ? "default" : "secondary"} className="text-xs font-semibold uppercase tracking-wide">
                      {record.type}
                    </Badge>
                    <span className="text-xs text-muted-foreground font-medium">Record {i + 1} of {dnsRecords.length}</span>
                  </div>
                  {record.valid && (
                    <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span className="text-xs font-medium">Verified</span>
                    </div>
                  )}
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Host / Name</p>
                      <div className="bg-muted/40 rounded-md px-3 py-2">
                        <p className="font-mono text-xs break-all select-all" data-testid={`text-dns-host-${i}`}>{record.host}</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="shrink-0 h-8 px-2.5 mt-5" onClick={() => handleClipboardCopy(record.host)} data-testid={`button-copy-dns-host-${i}`}>
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Value / Points to</p>
                      <div className="bg-muted/40 rounded-md px-3 py-2">
                        <p className="font-mono text-xs break-all select-all" data-testid={`text-dns-value-${i}`}>{record.data}</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="shrink-0 h-8 px-2.5 mt-5" onClick={() => handleClipboardCopy(record.data)} data-testid={`button-copy-dns-value-${i}`}>
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {dnsRecords.length === 0 && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              <span className="text-sm text-muted-foreground">Loading DNS records...</span>
            </div>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">DNS changes can take up to 48 hours to take effect. If verification fails, wait a bit and try again.</p>
      <div className="flex gap-2 flex-wrap">
        <Button onClick={verifyDomainAction} disabled={isVerifying} data-testid="button-verify-domain">
          {isVerifying && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Verify DNS Records
        </Button>
        <Button variant="outline" onClick={() => setShowDomainDisconnect(true)} data-testid="button-remove-domain">
          Remove Domain
        </Button>
      </div>
      <Dialog open={showDomainDisconnect} onOpenChange={setShowDomainDisconnect}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Domain?</DialogTitle>
            <DialogDescription>
              This will remove {domainName} from your email setup. You can set it up again later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowDomainDisconnect(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => domainDisconnectMutation.mutate()} disabled={domainDisconnectMutation.isPending} data-testid="button-confirm-remove-domain">
              {domainDisconnectMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Yes, Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  const renderDomainVerified = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="font-medium" data-testid="text-verified-domain">{domainName}</p>
            <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Verified</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Sending from: {domainFromEmail}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 p-3 border rounded-lg">
        <Mail className="w-5 h-5 text-blue-500" />
        <div>
          <p className="font-medium text-sm">Custom Domain Email</p>
          <p className="text-xs text-muted-foreground">Emails sent from your domain</p>
        </div>
      </div>
      <div className="pt-4 border-t">
        <Button variant="outline" onClick={() => setShowDomainDisconnect(true)} data-testid="button-disconnect-domain">
          Remove Domain
        </Button>
      </div>
      <Dialog open={showDomainDisconnect} onOpenChange={setShowDomainDisconnect}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Domain?</DialogTitle>
            <DialogDescription>
              This will disconnect {domainName}. You can set it up again later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowDomainDisconnect(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => domainDisconnectMutation.mutate()} disabled={domainDisconnectMutation.isPending}>
              {domainDisconnectMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Yes, Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  const renderGoogleConnected = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
        <div className="flex-1">
          <p className="font-medium" data-testid="text-google-email">{settings?.googleEmail}</p>
          <p className="text-sm text-muted-foreground">
            Connected {settings?.googleConnectedAt ? new Date(settings.googleConnectedAt).toLocaleDateString() : ''}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex items-center gap-2 p-3 border rounded-lg">
          <Mail className="w-5 h-5 text-blue-500" />
          <div>
            <p className="font-medium text-sm">Gmail</p>
            <p className="text-xs text-muted-foreground">Send emails to contacts</p>
          </div>
        </div>
        <div className="flex items-center gap-2 p-3 border rounded-lg">
          <Calendar className="w-5 h-5 text-green-500" />
          <div>
            <p className="font-medium text-sm">Calendar</p>
            <p className="text-xs text-muted-foreground">Sync appointments</p>
          </div>
        </div>
      </div>
      <div className="pt-4 border-t">
        <Button variant="outline" onClick={() => setShowGoogleDisconnect(true)} data-testid="button-disconnect-google">
          Disconnect Google Account
        </Button>
      </div>
      <Dialog open={showGoogleDisconnect} onOpenChange={setShowGoogleDisconnect}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect Google Account?</DialogTitle>
            <DialogDescription>
              Are you sure you want to disconnect your Google account? You will no longer be able to send emails via Gmail or sync appointments to Google Calendar until you reconnect.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowGoogleDisconnect(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); googleDisconnectMutation.mutate(); }}
              disabled={googleDisconnectMutation.isPending}
              data-testid="button-confirm-disconnect-google"
            >
              {googleDisconnectMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Yes, Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  const renderGoogleSetup = () => (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Connect your Google account to send emails via Gmail and sync appointments to Google Calendar.
      </p>
      <div className="flex items-start gap-4 p-4 bg-muted/30 rounded-lg">
        <div className="flex-1 space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-500" />
            <span>Send emails to contacts from your Gmail</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-500" />
            <span>Sync appointments to your Google Calendar</span>
          </div>
        </div>
      </div>
      <Button
        onClick={() => googleConnectMutation.mutate()}
        disabled={googleConnectMutation.isPending}
        data-testid="button-connect-google"
      >
        {googleConnectMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        Connect Google Account
      </Button>
    </div>
  );

  const renderLockedMessage = (lockedBy: string) => (
    <div className="flex items-start gap-3 p-4 bg-muted/30 rounded-lg">
      <Lock className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
      <div>
        <p className="text-sm font-medium text-muted-foreground">
          {lockedBy === 'google' ? 'Google account is currently connected for email'
            : 'Custom domain is currently connected for email'}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Disconnect your current email method first if you want to switch.
        </p>
      </div>
    </div>
  );

  return (
    <>
      <div className="space-y-4">
        {!anyConnected && (
          <div className="flex gap-2 flex-wrap">
            <Button
              variant={selectedMethod === 'google' ? 'default' : 'outline'}
              className="flex-1"
              onClick={() => setSelectedMethod('google')}
              data-testid="button-select-google-email"
            >
              <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Google
            </Button>
            {canUseCustomDomainEmail && (
              <Button
                variant={selectedMethod === 'domain' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setSelectedMethod('domain')}
                data-testid="button-select-domain-email"
              >
                <Globe className="w-4 h-4 mr-2" />
                Custom Domain
              </Button>
            )}
          </div>
        )}

        {activeMethod === 'google' && (
          <>
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-4 h-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
              <p className="font-medium text-sm">Google Account</p>
            </div>
            {renderGoogleConnected()}
            <div className="pt-4 border-t">
              <p className="text-xs font-medium text-muted-foreground mb-3">Other email methods</p>
              {renderLockedMessage('google')}
            </div>
          </>
        )}

        {activeMethod === 'domain' && (
          <>
            <div className="flex items-center gap-2 mb-2">
              <Globe className="w-4 h-4 text-blue-500" />
              <p className="font-medium text-sm">Custom Domain</p>
            </div>
            {domainStep === 'verified' ? renderDomainVerified() : renderDomainDns()}
            <div className="pt-4 border-t">
              <p className="text-xs font-medium text-muted-foreground mb-3">Other email methods</p>
              {renderLockedMessage('domain')}
            </div>
          </>
        )}

        {!anyConnected && selectedMethod === 'google' && renderGoogleSetup()}
        {!anyConnected && selectedMethod === 'domain' && renderDomainSetup()}
      </div>
    </>
  );
}

function CompanyCamIntegrationCard({ settings }: { settings: CompanySettings | null | undefined }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { mutate: updateSettings } = useUpdateCompanySettings();
  const isConnected = !!settings?.companyCamApiToken;
  const [apiToken, setApiToken] = useState('');
  const [showDisconnect, setShowDisconnect] = useState(false);

  const connectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/companycam/connect', { apiToken });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to connect');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/settings/company'] });
      toast({ title: "CompanyCam Connected", description: "Your photo documentation is now linked" });
      setApiToken('');
    },
    onError: (error: Error) => {
      toast({ title: "Connection Failed", description: error.message, variant: "destructive" });
    }
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/companycam/disconnect');
      if (!res.ok) throw new Error('Failed to disconnect');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/settings/company'] });
      toast({ title: "Disconnected", description: "CompanyCam has been disconnected" });
      setShowDisconnect(false);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to disconnect", description: error.message, variant: "destructive" });
      setShowDisconnect(false);
    }
  });

  return (
    <>
      <div>
        {isConnected ? (
          <div className="space-y-4">
            <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
              <div className="flex-1">
                <p className="font-medium">CompanyCam API Connected</p>
                <p className="text-sm text-muted-foreground">
                  Connected {settings?.companyCamConnectedAt ? new Date(settings.companyCamConnectedAt).toLocaleDateString() : ''}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-4 bg-muted/30 rounded-lg">
              <div className="flex-1 space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>View job site photos from CompanyCam</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>Link projects to proposals and invoices</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>Show project photos in document detail view</span>
                </div>
              </div>
            </div>

            <div className="p-4 bg-muted/30 rounded-lg space-y-3">
              <p className="text-sm font-medium">Settings</p>
              <label className="flex items-center justify-between gap-3 cursor-pointer" data-testid="toggle-companycam-auto-create">
                <div>
                  <p className="text-sm">Auto-create CompanyCam project on new proposal</p>
                  <p className="text-xs text-muted-foreground">Automatically creates a matching CompanyCam project when you create a proposal, using the job address and contact name.</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={!!settings?.companyCamAutoCreateProject}
                  className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors ${settings?.companyCamAutoCreateProject ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                  onClick={() => {
                    updateSettings({ companyCamAutoCreateProject: !settings?.companyCamAutoCreateProject } as any);
                  }}
                >
                  <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-lg transition-transform ${settings?.companyCamAutoCreateProject ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
              </label>
            </div>

            <div className="pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => setShowDisconnect(true)}
                data-testid="button-disconnect-companycam"
              >
                Disconnect CompanyCam
              </Button>
            </div>

            <Dialog open={showDisconnect} onOpenChange={setShowDisconnect}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Disconnect CompanyCam?</DialogTitle>
                  <DialogDescription>
                    You will no longer be able to view CompanyCam photos within Fuse Phone until you reconnect.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter className="gap-2 sm:gap-0">
                  <Button variant="outline" onClick={() => setShowDisconnect(false)}>Cancel</Button>
                  <Button
                    variant="destructive"
                    onClick={() => disconnectMutation.mutate()}
                    disabled={disconnectMutation.isPending}
                    data-testid="button-confirm-disconnect-companycam"
                  >
                    {disconnectMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Yes, Disconnect
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-muted/30 rounded-lg">
              <Info className="w-5 h-5 text-primary mt-0.5 shrink-0" />
              <div className="space-y-2">
                <p className="text-sm font-medium">Connect CompanyCam to view and link job site photos to your proposals and invoices.</p>
                <a
                  href="https://app.companycam.com/settings/integrations"
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="link-companycam-settings"
                >
                  <Button variant="outline" className="mt-1">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Open CompanyCam Settings
                  </Button>
                </a>
                <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1 mt-2">
                  <li>Log in to your CompanyCam account</li>
                  <li>Go to Settings, then Integrations, then API</li>
                  <li>Generate a new API token and copy it</li>
                  <li>Paste the token below and click Connect</li>
                </ol>
              </div>
            </div>
            <div className="flex items-start gap-4 p-4 bg-muted/30 rounded-lg">
              <div className="flex-1 space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>View and browse job site photos</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>Link CompanyCam projects to proposals and invoices</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>Show project photos in document detail view</span>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="companycam-token">API Token</Label>
              <Input
                id="companycam-token"
                type="password"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                placeholder="Your CompanyCam API token"
                data-testid="input-companycam-token"
              />
            </div>
            <Button
              onClick={() => connectMutation.mutate()}
              disabled={connectMutation.isPending || !apiToken.trim()}
              data-testid="button-connect-companycam"
            >
              {connectMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Connect CompanyCam
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

function ThumbtackIntegrationCard({ settings }: { settings: CompanySettings | null | undefined }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const hasBusinessId = !!settings?.thumbtackBusinessId;
  const hasGmail = !!settings?.googleConnectedAt;
  const setupEmailSent = !!(settings as any)?.thumbtackSetupEmailSentAt;
  const firstLeadReceived = !!(settings as any)?.thumbtackFirstLeadAt;
  const [profileUrlInput, setProfileUrlInput] = useState('');
  const [businessId, setBusinessId] = useState('');
  const [showDisconnect, setShowDisconnect] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [showEmailDetails, setShowEmailDetails] = useState(false);
  const [showBusinessIdHelp, setShowBusinessIdHelp] = useState(false);
  const [inputMode, setInputMode] = useState<'url' | 'manual'>('url');

  const { data: webhookData } = useQuery<{ webhookUrl: string; leadEndpointUrl: string }>({
    queryKey: ['/api/thumbtack/webhook-url'],
    enabled: hasBusinessId,
  });

  const extractBusinessId = (input: string): string | null => {
    const trimmed = input.trim();
    if (/^\d{10,}$/.test(trimmed)) return trimmed;
    const match = trimmed.match(/thumbtack\.com\/[^/]*?(\d{10,})/);
    if (match) return match[1];
    const pathMatch = trimmed.match(/\/(\d{10,})/);
    if (pathMatch) return pathMatch[1];
    return null;
  };

  const handleProfileUrlChange = (val: string) => {
    setProfileUrlInput(val);
    const extracted = extractBusinessId(val);
    if (extracted) {
      setBusinessId(extracted);
    } else {
      setBusinessId('');
    }
  };

  const connectMutation = useMutation({
    mutationFn: async () => {
      const idToUse = businessId || extractBusinessId(profileUrlInput);
      if (!idToUse) throw new Error('Could not find a valid Business ID');
      const res = await apiRequest('POST', '/api/thumbtack/connect', { businessId: idToUse });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to connect');
      }
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/settings/company'] });
      queryClient.invalidateQueries({ queryKey: ['/api/thumbtack/webhook-url'] });
      if (data.leadEndpointUrl) {
        setWebhookUrl(data.leadEndpointUrl);
      } else if (data.webhookUrl) {
        setWebhookUrl(data.webhookUrl);
      }
      toast({ title: "Business ID Saved", description: "Copy the Lead Endpoint URL and paste it in the Thumbtack integration form." });
      setBusinessId('');
      setProfileUrlInput('');
    },
    onError: (error: Error) => {
      toast({ title: "Connection Failed", description: error.message, variant: "destructive" });
    }
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/thumbtack/disconnect');
      if (!res.ok) throw new Error('Failed to disconnect');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/settings/company'] });
      toast({ title: "Disconnected", description: "Thumbtack has been disconnected" });
      setShowDisconnect(false);
      setWebhookUrl('');
    },
    onError: (error: Error) => {
      toast({ title: "Failed to disconnect", description: error.message, variant: "destructive" });
      setShowDisconnect(false);
    }
  });

  const sendSetupEmailMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/thumbtack/send-setup-email');
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to send email');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/settings/company'] });
      toast({ title: "Email Sent", description: "Setup request sent to Thumbtack. They typically respond within 1 business day with a link to their integration form." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to Send", description: error.message, variant: "destructive" });
    }
  });

  const displayLeadUrl = webhookUrl
    ? webhookUrl.replace('/webhook/', '/leads/')
    : webhookData?.leadEndpointUrl || webhookData?.webhookUrl || '';
  const companyName = settings?.companyName || 'Our Company';

  const setupEmailBody = `Hi Thumbtack Team,\n\nI would like to set up custom webhook integration for my business.\n\nHere are my details:\n\n- Thumbtack Business ID: ${settings?.thumbtackBusinessId || ''}\n- Lead Endpoint URL: ${displayLeadUrl}\n\nPlease configure my account to send lead notifications to the endpoint above.\n\nThank you,\n${companyName}`;

  const copyLeadUrl = async () => {
    if (displayLeadUrl) {
      const { copyToClipboard } = await import("@/lib/clipboard");
      const ok = await copyToClipboard(displayLeadUrl);
      toast({ title: ok ? "Copied" : "Could not copy", description: ok ? "Lead Endpoint URL copied to clipboard" : displayLeadUrl, variant: ok ? "default" : "destructive" });
    }
  };

  const copyEmailBody = async () => {
    const { copyToClipboard } = await import("@/lib/clipboard");
    const ok = await copyToClipboard(setupEmailBody);
    toast({ title: ok ? "Copied" : "Could not copy", description: ok ? "Email content copied to clipboard" : "Please copy the text manually", variant: ok ? "default" : "destructive" });
  };

  const copyEmailAddress = async () => {
    const { copyToClipboard } = await import("@/lib/clipboard");
    const ok = await copyToClipboard('teampartnerships@thumbtack.com');
    toast({ title: ok ? "Copied" : "Could not copy", description: ok ? "Email address copied to clipboard" : "teampartnerships@thumbtack.com", variant: ok ? "default" : "destructive" });
  };

  const getStatusBadge = () => {
    if (firstLeadReceived) {
      return <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" /> Connected</Badge>;
    }
    if (setupEmailSent) {
      return <Badge className="bg-amber-500"><Loader2 className="w-3 h-3 mr-1" /> Waiting for Thumbtack</Badge>;
    }
    if (hasBusinessId) {
      return <Badge className="bg-blue-500"><AlertTriangle className="w-3 h-3 mr-1" /> Setup Required</Badge>;
    }
    return <Badge variant="secondary">Not Connected</Badge>;
  };

  return (
    <>
      <div>
        {hasBusinessId ? (
          <div className="space-y-4">
            <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
              <div className="flex-1">
                <p className="font-medium">Business ID: {settings?.thumbtackBusinessId}</p>
                <p className="text-sm text-muted-foreground">
                  {firstLeadReceived
                    ? `Receiving leads since ${new Date((settings as any).thumbtackFirstLeadAt).toLocaleDateString()}`
                    : setupEmailSent
                      ? `Setup email sent ${new Date((settings as any).thumbtackSetupEmailSentAt).toLocaleDateString()}`
                      : `Added ${settings?.thumbtackConnectedAt ? new Date(settings.thumbtackConnectedAt).toLocaleDateString() : ''}`
                  }
                </p>
              </div>
            </div>

            {displayLeadUrl && (
              <div className="space-y-2">
                <Label className="text-muted-foreground text-xs">Lead Endpoint URL (paste this in the Thumbtack form)</Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={displayLeadUrl}
                    className="font-mono text-xs"
                    data-testid="input-thumbtack-lead-url"
                  />
                  <Button size="icon" variant="outline" onClick={copyLeadUrl} data-testid="button-copy-lead-url">
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}

            {!firstLeadReceived && (
              <div className="space-y-3 p-4 border rounded-lg">
                <p className="font-medium text-sm">How to connect Thumbtack leads</p>

                <div className="space-y-3">
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">1</div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">Email Thumbtack Partnerships</p>
                      <p className="text-xs text-muted-foreground">Email <a href="mailto:teampartnerships@thumbtack.com" className="underline text-foreground">teampartnerships@thumbtack.com</a> to request a custom integration. They typically respond within 1 business day with a link to their integration form.</p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">2</div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">Fill out their integration form</p>
                      <p className="text-xs text-muted-foreground">Copy the Lead Endpoint URL above and paste it in the "Lead Endpoint URL" field. Leave Messaging and Review fields blank. Select "Fuse Phone" as the app you're connecting with.</p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">3</div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">Wait for activation</p>
                      <p className="text-xs text-muted-foreground">After submitting the form, Thumbtack usually activates your endpoint within about 1 business day. Once the first lead comes in, this will automatically update to "Connected".</p>
                    </div>
                  </div>
                </div>

                {setupEmailSent && (
                  <div className="flex items-center gap-2 p-3 bg-amber-500/10 rounded-lg mt-2">
                    <Loader2 className="w-4 h-4 text-amber-500 shrink-0" />
                    <p className="text-sm">Integration request submitted. Thumbtack typically responds within 1 business day with a link to their integration form.</p>
                  </div>
                )}

                {!setupEmailSent && hasGmail && (
                  <div className="pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => sendSetupEmailMutation.mutate()}
                      disabled={sendSetupEmailMutation.isPending}
                      data-testid="button-send-thumbtack-email"
                    >
                      {sendSetupEmailMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      <Mail className="w-4 h-4 mr-2" />
                      Email Thumbtack Team
                    </Button>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-start gap-4 p-4 bg-muted/30 rounded-lg">
              <div className="flex-1 space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>New Thumbtack leads auto-created as contacts</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>Lead details, location, and category captured</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>Duplicate leads matched by phone number</span>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => setShowDisconnect(true)}
                data-testid="button-disconnect-thumbtack"
              >
                Disconnect Thumbtack
              </Button>
            </div>

            <Dialog open={showDisconnect} onOpenChange={setShowDisconnect}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Disconnect Thumbtack?</DialogTitle>
                  <DialogDescription>
                    New leads from Thumbtack will no longer be automatically imported. Existing contacts will not be affected.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter className="gap-2 sm:gap-0">
                  <Button variant="outline" onClick={() => setShowDisconnect(false)}>Cancel</Button>
                  <Button
                    variant="destructive"
                    onClick={() => disconnectMutation.mutate()}
                    disabled={disconnectMutation.isPending}
                    data-testid="button-confirm-disconnect-thumbtack"
                  >
                    {disconnectMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Yes, Disconnect
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Connect your Thumbtack Pro account to automatically import new leads. When someone contacts you on Thumbtack, they'll appear in your CRM instantly as a new contact and project.
            </p>
            <div className="flex items-start gap-4 p-4 bg-muted/30 rounded-lg">
              <div className="flex-1 space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>Auto-import leads with contact + project created</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>Lead details, location, and category captured</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>No duplicates - existing contacts matched by phone</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>Push notifications when new leads arrive</span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Button
                  variant={inputMode === 'url' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => { setInputMode('url'); setBusinessId(''); setProfileUrlInput(''); }}
                  data-testid="button-input-mode-url"
                >
                  Paste Profile URL
                </Button>
                <Button
                  variant={inputMode === 'manual' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => { setInputMode('manual'); setBusinessId(''); setProfileUrlInput(''); }}
                  data-testid="button-input-mode-manual"
                >
                  Enter ID Manually
                </Button>
              </div>

              {inputMode === 'url' ? (
                <div className="space-y-2">
                  <Label htmlFor="thumbtack-url">Thumbtack Profile URL</Label>
                  <Input
                    id="thumbtack-url"
                    value={profileUrlInput}
                    onChange={(e) => handleProfileUrlChange(e.target.value)}
                    placeholder="e.g. https://www.thumbtack.com/ca/san-jose/painters/tims-painting/service/286845156044809661"
                    data-testid="input-thumbtack-profile-url"
                  />
                  {profileUrlInput && businessId ? (
                    <p className="text-xs text-green-600 flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" /> Business ID found: {businessId}
                    </p>
                  ) : profileUrlInput ? (
                    <p className="text-xs text-destructive">Could not find a Business ID in this URL. Try the manual entry option.</p>
                  ) : null}

                  <Button
                    variant="link"
                    className="h-auto p-0 text-xs"
                    onClick={() => setShowBusinessIdHelp(!showBusinessIdHelp)}
                    data-testid="button-business-id-help"
                  >
                    {showBusinessIdHelp ? 'Hide instructions' : 'How do I find my profile URL?'}
                  </Button>
                  {showBusinessIdHelp && (
                    <div className="p-3 bg-muted/30 rounded-lg space-y-2 text-sm">
                      <p className="font-medium">How to find your Thumbtack profile URL:</p>
                      <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                        <li>Go to <a href="https://www.thumbtack.com" target="_blank" rel="noopener noreferrer" className="underline text-foreground">thumbtack.com</a> and search for your business</li>
                        <li>Click on your business listing</li>
                        <li>Copy the URL from your browser's address bar</li>
                      </ol>
                      <div className="mt-2 p-2 bg-muted/50 rounded text-xs font-mono break-all">
                        <span className="text-muted-foreground">https://www.thumbtack.com/ca/san-jose/painters/tims-painting/service/</span>
                        <span className="text-green-600 font-bold">286845156044809661</span>
                      </div>
                      <p className="text-xs text-muted-foreground">The long number at the end is your Business ID. We'll extract it automatically when you paste the URL.</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <Label htmlFor="thumbtack-id">Thumbtack Business ID</Label>
                    <Button
                      variant="link"
                      className="h-auto p-0 text-xs"
                      onClick={() => setShowBusinessIdHelp(!showBusinessIdHelp)}
                      data-testid="button-business-id-help-manual"
                    >
                      {showBusinessIdHelp ? 'Hide instructions' : 'How do I find my Business ID?'}
                    </Button>
                  </div>
                  {showBusinessIdHelp && (
                    <div className="p-3 bg-muted/30 rounded-lg space-y-2 text-sm">
                      <p className="font-medium">How to find your Thumbtack Business ID:</p>
                      <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                        <li>Go to <a href="https://www.thumbtack.com" target="_blank" rel="noopener noreferrer" className="underline text-foreground">thumbtack.com</a> and find your business profile</li>
                        <li>Look at the URL in your browser - the long number at the end is your Business ID</li>
                      </ol>
                      <div className="mt-2 p-2 bg-muted/50 rounded text-xs font-mono break-all">
                        <span className="text-muted-foreground">https://www.thumbtack.com/ca/san-jose/painters/tims-painting/service/</span>
                        <span className="text-green-600 font-bold">286845156044809661</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">You can also find it in your Thumbtack Pro dashboard under Settings.</p>
                    </div>
                  )}
                  <Input
                    id="thumbtack-id"
                    value={businessId}
                    onChange={(e) => setBusinessId(e.target.value)}
                    placeholder="e.g. 286845156044809661"
                    data-testid="input-thumbtack-business-id"
                  />
                </div>
              )}
            </div>

            <Button
              onClick={() => connectMutation.mutate()}
              disabled={connectMutation.isPending || !businessId.trim()}
              data-testid="button-connect-thumbtack"
            >
              {connectMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Connect Thumbtack
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

function FacebookLeadAdsCard({ settings, isAdmin }: { settings: CompanySettings | null | undefined; isAdmin?: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isConnected = !!settings?.facebookPageId;
  const hasTokenButNoPage = !!(settings as any)?.facebookUserToken && !settings?.facebookPageId;
  const firstLeadReceived = !!(settings as any)?.facebookFirstLeadAt;
  const [showDisconnect, setShowDisconnect] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [showPageSelector, setShowPageSelector] = useState(false);
  const [showChangePage, setShowChangePage] = useState(false);
  const [selectedPageId, setSelectedPageId] = useState('');
  const [pixelId, setPixelId] = useState(settings?.facebookPixelId || '');
  const [showCapiSection, setShowCapiSection] = useState(!!settings?.facebookPixelId);
  const [loadingPixels, setLoadingPixels] = useState(false);
  const [availablePixels, setAvailablePixels] = useState<{ id: string; name: string }[]>([])
  const [pixelsFetched, setPixelsFetched] = useState(false);

  const params = new URLSearchParams(window.location.search);
  const fbStatus = params.get('fb');

  useEffect(() => {
    if (fbStatus === 'select_page') {
      setShowPageSelector(true);
      window.history.replaceState({}, '', window.location.pathname);
    } else if (fbStatus === 'error') {
      const msg = params.get('message') || 'Failed to connect Facebook';
      toast({ title: "Facebook Connection Failed", description: decodeURIComponent(msg), variant: "destructive" });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [fbStatus]);

  useEffect(() => {
    if (hasTokenButNoPage && !isConnected) {
      setShowPageSelector(true);
    }
  }, [hasTokenButNoPage, isConnected]);

  const { data: webhookInfo } = useQuery<{
    connected: boolean;
    webhookUrl?: string;
    verifyToken?: string;
    pageId?: string;
    pageName?: string;
    connectedAt?: string;
    firstLeadAt?: string;
  }>({
    queryKey: ['/api/facebook-leads/webhook-info'],
    enabled: isConnected,
  });

  const { data: pagesData, isLoading: pagesLoading } = useQuery<{ pages: { id: string; name: string; hasToken: boolean }[] }>({
    queryKey: ['/api/facebook-leads/oauth/pages'],
    enabled: showPageSelector || showChangePage,
  });

  const isNative = useIsNativeApp();

  const startOAuth = async () => {
    setConnecting(true);
    try {
      const mobileParam = isNative ? '?mobile=1' : '';
      const res = await fetch(`/api/facebook-leads/oauth/start${mobileParam}`, { credentials: 'include' });
      const data = await res.json();
      if (data.authUrl) {
        if (isNative) {
          try {
            const { Browser } = await import('@capacitor/browser');
            await Browser.open({ url: data.authUrl, windowName: '_self' });
          } catch {
            window.location.href = data.authUrl;
          }
        } else {
          window.location.href = data.authUrl;
        }
      } else {
        toast({ title: "Error", description: data.error || "Could not start Facebook login", variant: "destructive" });
        setConnecting(false);
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
      setConnecting(false);
    }
  };

  const selectPageMutation = useMutation({
    mutationFn: async (pageId: string) => {
      const res = await apiRequest('POST', '/api/facebook-leads/oauth/select-page', { pageId });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to select page');
      }
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/settings/company'] });
      queryClient.invalidateQueries({ queryKey: ['/api/facebook-leads/webhook-info'] });
      toast({ title: "Connected!", description: `Facebook Lead Ads connected to ${data.pageName || 'your page'}. Leads will be imported automatically.` });
      setShowPageSelector(false);
      setSelectedPageId('');
    },
    onError: (error: Error) => {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    }
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/facebook-leads/disconnect');
      if (!res.ok) throw new Error('Failed to disconnect');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/settings/company'] });
      toast({ title: "Disconnected", description: "Facebook Lead Ads disconnected. Your existing contacts and projects are safe." });
      setShowDisconnect(false);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to disconnect", description: error.message, variant: "destructive" });
      setShowDisconnect(false);
    }
  });

  const testLeadMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/facebook-leads/test-lead');
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create test lead');
      }
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      toast({ title: "Test Lead Created!", description: data.message || 'Check your contacts and projects.' });
    },
    onError: (error: Error) => {
      toast({ title: "Test Failed", description: error.message, variant: "destructive" });
    },
  });

  const pullLeadsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/facebook-leads/pull-recent', { limit: 3 });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to pull leads');
      }
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      queryClient.invalidateQueries({ queryKey: ['/api/settings/company'] });
      toast({
        title: "Leads Pulled",
        description: `${data.imported} imported, ${data.duplicates} already existed, ${data.total} total found from Facebook.`,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Pull Failed", description: error.message, variant: "destructive" });
    },
  });

  const fetchPixels = async () => {
    setLoadingPixels(true);
    try {
      const res = await apiRequest("GET", "/api/facebook-leads/pixels");
      const data = await res.json();
      setAvailablePixels(data.pixels || []);
      setPixelsFetched(true);
      if (data.pixels?.length === 1 && !pixelId) {
        setPixelId(data.pixels[0].id);
      }
    } catch (e) {
      toast({ title: "Could not load pixels", description: "You may need to reconnect Facebook with updated permissions.", variant: "destructive" });
    } finally {
      setLoadingPixels(false);
    }
  };

  const saveCapiSettings = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", "/api/settings/company", {
        facebookPixelId: pixelId.trim() || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/company"] });
      toast({ title: "Conversions API enabled", description: "Events will be sent to your Facebook Pixel automatically." });
    },
    onError: () => toast({ title: "Failed to save settings", variant: "destructive" }),
  });

  const disableCapi = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", "/api/settings/company", {
        facebookPixelId: null,
      });
    },
    onSuccess: () => {
      setPixelId('');
      queryClient.invalidateQueries({ queryKey: ["/api/settings/company"] });
      toast({ title: "Conversions API disabled" });
    },
    onError: () => toast({ title: "Failed to update settings", variant: "destructive" }),
  });

  const capiConfigured = !!settings?.facebookPixelId;

  const getStatusBadge = () => {
    if (firstLeadReceived) {
      return <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" /> Receiving Leads</Badge>;
    }
    if (isConnected) {
      return <Badge className="bg-blue-500"><CheckCircle className="w-3 h-3 mr-1" /> Connected</Badge>;
    }
    return <Badge variant="secondary">Not Connected</Badge>;
  };

  const displayPageName = (settings as any)?.facebookPageName || webhookInfo?.pageName || settings?.facebookPageId;

  return (
    <>
      <div>
        {showPageSelector && !isConnected ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <CheckCircle className="w-4 h-4 text-blue-500" />
              <p className="text-sm font-medium">Facebook connected! Now select the page to pull leads from:</p>
            </div>

            {pagesLoading ? (
              <div className="flex items-center gap-2 p-4">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm text-muted-foreground">Loading your Facebook pages...</span>
              </div>
            ) : pagesData?.pages && pagesData.pages.length > 0 ? (
              <div className="space-y-3">
                <Label>Select a page</Label>
                <div className="space-y-2">
                  {pagesData.pages.map((page) => (
                    <div
                      key={page.id}
                      className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedPageId === page.id ? 'border-blue-500 bg-blue-500/5' : 'hover:bg-muted/50'
                      }`}
                      onClick={() => setSelectedPageId(page.id)}
                      data-testid={`facebook-page-${page.id}`}
                    >
                      <div>
                        <p className="font-medium text-sm">{page.name}</p>
                        <p className="text-xs text-muted-foreground">ID: {page.id}</p>
                      </div>
                      {selectedPageId === page.id && <CheckCircle className="w-5 h-5 text-blue-500" />}
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => selectPageMutation.mutate(selectedPageId)}
                    disabled={!selectedPageId || selectPageMutation.isPending}
                    data-testid="button-select-facebook-page"
                  >
                    {selectPageMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Connect This Page
                  </Button>
                  <Button variant="outline" onClick={() => setShowPageSelector(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-400">No Facebook pages found</p>
                  <p className="text-xs text-muted-foreground mt-1">Make sure your Facebook account manages at least one Business Page. Personal profiles cannot receive lead ads.</p>
                </div>
                <Button variant="outline" onClick={() => setShowPageSelector(false)}>
                  Go Back
                </Button>
              </div>
            )}
          </div>
        ) : isConnected ? (
          <div className="space-y-3">
            <div className="border rounded-md p-3 space-y-2 border-green-500/30 bg-green-500/5">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium">Connected to: {displayPageName}</span>
              </div>
              <p className="text-xs text-muted-foreground ml-6">
                {firstLeadReceived
                  ? `Receiving leads since ${new Date((settings as any).facebookFirstLeadAt).toLocaleDateString()}`
                  : `Connected ${settings?.facebookConnectedAt ? new Date(settings.facebookConnectedAt).toLocaleDateString() : ''}`
                }
              </p>
              <div className="flex gap-2 mt-2 flex-wrap">
                <Button size="sm" variant="outline" onClick={() => { setShowChangePage(true); }} data-testid="button-change-fb-page">
                  <RefreshCw className="h-4 w-4 mr-2" />Change Page
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowDisconnect(true)} data-testid="button-disconnect-facebook">
                  <Unlink className="h-4 w-4 mr-2" />Disconnect
                </Button>
              </div>

              <Dialog open={showChangePage} onOpenChange={setShowChangePage}>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Select Facebook Page</DialogTitle>
                    <DialogDescription>Choose which Facebook Page to receive leads from.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                    {pagesLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground p-4"><Loader2 className="h-4 w-4 animate-spin" /> Loading pages...</div>}
                    {pagesData?.pages?.map((page) => (
                      <div key={page.id} className={`flex items-center justify-between gap-2 p-3 border rounded-md ${page.id === settings?.facebookPageId ? 'border-green-500/50 bg-green-500/5' : 'hover:bg-muted/50 cursor-pointer'}`} data-testid={`fb-lead-page-${page.id}`}>
                        <div className="flex items-center gap-2 min-w-0">
                          {page.id === settings?.facebookPageId && <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />}
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{page.name}</p>
                            <p className="text-xs text-muted-foreground truncate">ID: {page.id}</p>
                          </div>
                        </div>
                        {page.id === settings?.facebookPageId ? (
                          <Badge variant="outline" className="text-green-600 border-green-500/30 shrink-0">Current</Badge>
                        ) : (
                          <Button size="sm" onClick={() => { selectPageMutation.mutate(page.id); setShowChangePage(false); }} disabled={selectPageMutation.isPending} data-testid={`button-switch-fb-page-${page.id}`}>Select</Button>
                        )}
                      </div>
                    ))}
                    {!pagesLoading && (!pagesData?.pages || pagesData.pages.length === 0) && (
                      <p className="text-sm text-muted-foreground p-4">No pages found. Try disconnecting and reconnecting with all permissions.</p>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {isAdmin && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => pullLeadsMutation.mutate()}
                    disabled={pullLeadsMutation.isPending}
                    data-testid="button-pull-fb-leads"
                  >
                    {pullLeadsMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                    Pull Recent Leads
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => testLeadMutation.mutate()}
                    disabled={testLeadMutation.isPending}
                    data-testid="button-test-fb-lead"
                  >
                    {testLeadMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
                    Send Test Lead
                  </Button>
                </>
              )}
            </div>
            {isAdmin && pullLeadsMutation.data && (
              <div className="p-3 border rounded-lg bg-muted/10 space-y-2">
                <p className="text-sm font-medium">
                  Pull Results: {pullLeadsMutation.data.imported} imported, {pullLeadsMutation.data.duplicates} already existed, {pullLeadsMutation.data.total} total found
                </p>
                {pullLeadsMutation.data.forms?.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium">Forms: </span>
                    {pullLeadsMutation.data.forms.map((f: any) => `${f.name} (${f.leadsCount || 0} leads)`).join(', ')}
                  </div>
                )}
                {pullLeadsMutation.data.leads?.length > 0 && (
                  <div className="space-y-1 mt-2">
                    {pullLeadsMutation.data.leads.map((lead: any, i: number) => (
                      <div key={lead.leadId || i} className="text-xs p-2 bg-muted/30 rounded flex flex-wrap gap-x-4 gap-y-1">
                        <span className="font-medium">{lead.name}</span>
                        {lead.phone && <span>{formatPhoneDisplay(lead.phone)}</span>}
                        {lead.email && <span>{lead.email}</span>}
                        {lead.city && <span>{lead.city}{lead.state ? `, ${lead.state}` : ''}</span>}
                        <span className="text-muted-foreground">{lead.createdTime ? new Date(lead.createdTime).toLocaleDateString() : ''}</span>
                        <span className="text-muted-foreground italic">{lead.formName}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-start gap-4 p-4 bg-muted/30 rounded-lg">
              <div className="flex-1 space-y-2 text-sm">
                <p className="font-medium text-xs text-muted-foreground uppercase tracking-wide">What this captures</p>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>Facebook Lead Ads (lead form ads on Facebook)</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>Instagram Lead Ads (lead form ads on Instagram)</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>Contact + project created automatically</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>Push notifications when new leads arrive</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>Duplicates matched by phone or email</span>
                </div>
              </div>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <button
                type="button"
                className="w-full flex items-center justify-between p-3 text-left"
                onClick={() => {
                  const opening = !showCapiSection;
                  setShowCapiSection(opening);
                  if (opening && !pixelsFetched && !loadingPixels) {
                    fetchPixels();
                  }
                }}
                data-testid="button-toggle-capi-section"
              >
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">Conversions API</span>
                  {capiConfigured && (
                    <Badge variant="outline" className="text-green-600 border-green-300 text-[10px] px-1.5 py-0">Active</Badge>
                  )}
                </div>
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${showCapiSection ? 'rotate-180' : ''}`} />
              </button>
              {showCapiSection && (
                <div className="p-3 pt-0 space-y-3 border-t">
                  <p className="text-xs text-muted-foreground">
                    Send conversion data back to Facebook so it can optimize your ads. When you send an estimate to a Facebook lead, we report a "Lead" event. When they accept your proposal, we report a "Purchase" event with the dollar amount.
                  </p>

                  {capiConfigured ? (
                    <div className="space-y-3">
                      <div className="flex items-start gap-2 p-2.5 bg-green-500/10 border border-green-500/20 rounded text-xs">
                        <CheckCircle className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" />
                        <div>
                          <p className="font-medium text-green-700 dark:text-green-400">Conversions API active</p>
                          <p className="text-muted-foreground mt-0.5">
                            Pixel: <span className="font-mono">{settings?.facebookPixelId}</span>
                          </p>
                          <p className="text-muted-foreground mt-0.5">"Lead" events sent when you send estimates to Facebook leads. "Purchase" events sent when they accept your proposal.</p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => disableCapi.mutate()}
                        disabled={disableCapi.isPending}
                        data-testid="button-disable-capi"
                      >
                        {disableCapi.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Unlink className="w-4 h-4 mr-1.5" />}
                        Disable Conversions API
                      </Button>
                    </div>
                  ) : loadingPixels ? (
                    <div className="flex items-center gap-2 py-4 justify-center">
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Loading your Facebook Pixels...</span>
                    </div>
                  ) : pixelsFetched && availablePixels.length === 0 ? (
                    <div className="space-y-2">
                      <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded text-xs">
                        <p className="font-medium text-amber-700 dark:text-amber-400">No Pixels found</p>
                        <p className="text-muted-foreground mt-1">
                          We couldn't find any Facebook Pixels in your ad account. This can happen if:
                        </p>
                        <ul className="text-muted-foreground mt-1 list-disc pl-4 space-y-0.5">
                          <li>You haven't created a Pixel yet in <a href="https://business.facebook.com/events_manager" target="_blank" rel="noopener noreferrer" className="underline">Meta Events Manager</a></li>
                          <li>You need to reconnect Facebook to grant ad account permissions</li>
                        </ul>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={fetchPixels} data-testid="button-retry-pixels">
                          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Retry
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <label className="text-xs font-medium">Select your Facebook Pixel</label>
                      <div className="space-y-1.5">
                        {availablePixels.map(px => (
                          <button
                            key={px.id}
                            type="button"
                            onClick={() => setPixelId(px.id)}
                            className={cn(
                              "w-full text-left rounded-md border p-2.5 text-sm transition-colors",
                              pixelId === px.id
                                ? "border-primary bg-primary/5 ring-1 ring-primary"
                                : "hover:bg-muted/50"
                            )}
                            data-testid={`pixel-option-${px.id}`}
                          >
                            <div className="font-medium">{px.name}</div>
                            <div className="text-[10px] text-muted-foreground font-mono mt-0.5">ID: {px.id}</div>
                          </button>
                        ))}
                      </div>
                      <Button
                        size="sm"
                        onClick={() => saveCapiSettings.mutate()}
                        disabled={saveCapiSettings.isPending || !pixelId.trim() || pixelId.trim() === (settings?.facebookPixelId || '')}
                        data-testid="button-save-capi-settings"
                      >
                        {saveCapiSettings.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-1.5" />}
                        Enable Conversions API
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg">
              <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Does NOT capture:</p>
              <p className="text-xs text-muted-foreground mt-1">Messenger conversations, page comments, Marketplace messages, or regular posts. Only Lead Ads forms.</p>
            </div>

          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Automatically capture leads from your <strong>Facebook and Instagram Lead Ads</strong>. When someone fills out a lead form on your ad, their info (name, phone, email, address) is imported into your CRM instantly as a new contact and project.
            </p>
            <div className="space-y-3">
              <div className="flex items-start gap-4 p-4 bg-muted/30 rounded-lg">
                <div className="flex-1 space-y-2 text-sm">
                  <p className="font-medium text-xs text-muted-foreground uppercase tracking-wide">What this captures</p>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span>Facebook Lead Ads (lead form ads on Facebook)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span>Instagram Lead Ads (lead form ads on Instagram)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span>Contact + project auto-created from form data</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span>Any custom form fields captured in notes</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span>Push notifications when new leads arrive</span>
                  </div>
                </div>
              </div>
              <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Does NOT capture:</p>
                <p className="text-xs text-muted-foreground mt-1">Facebook Messenger, page comments, Marketplace messages, or regular posts. This only works with Lead Ads (the forms people fill out from your ads).</p>
              </div>
            </div>

            <Button
              onClick={startOAuth}
              disabled={connecting}
              className="w-full"
              data-testid="button-connect-facebook"
            >
              {connecting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Connect with Facebook
            </Button>
            {hasTokenButNoPage && (
              <Button
                variant="outline"
                onClick={() => setShowDisconnect(true)}
                className="w-full"
                data-testid="button-disconnect-facebook-partial"
              >
                <Unlink className="w-4 h-4 mr-2" />
                Disconnect & Start Over
              </Button>
            )}
            <p className="text-xs text-muted-foreground text-center">
              {hasTokenButNoPage
                ? "Your Facebook account is linked but no page was selected. Connect again to choose a page, or disconnect to start fresh."
                : "You'll be asked to log in to Facebook and select the page you want to receive leads from."}
            </p>
          </div>
        )}
      </div>
      <Dialog open={showDisconnect} onOpenChange={setShowDisconnect}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect Facebook Lead Ads?</DialogTitle>
            <DialogDescription>
              {isConnected
                ? "New leads from Facebook & Instagram ads will no longer be imported. Your existing contacts and projects will NOT be deleted."
                : "This will clear your Facebook connection so you can start fresh. Your existing contacts and projects will NOT be deleted."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowDisconnect(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
              data-testid="button-confirm-disconnect-facebook"
            >
              {disconnectMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Yes, Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function WhiteLabelIntegrationCard({ settings }: { settings: CompanySettings | null | undefined }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasWhiteLabel, isElite } = useSubscription();
  const isNativeApp = useIsNativeApp();
  const extractBaseDomain = (d: string) => d ? d.replace(/^portal\./, '') : '';
  const [domainInput, setDomainInput] = useState(extractBaseDomain(settings?.customDomain || ''));
  const [showRemoveDomain, setShowRemoveDomain] = useState(false);
  const clipCopy = async (text: string) => {
    const { copyToClipboard } = await import("@/lib/clipboard");
    const ok = await copyToClipboard(text);
    toast({ title: ok ? "Copied!" : "Could not copy", description: ok ? undefined : text, variant: ok ? "default" : "destructive" });
  };

  useEffect(() => {
    setDomainInput(extractBaseDomain(settings?.customDomain || ''));
  }, [settings?.customDomain]);

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/stripe/white-label/checkout');
      if (!res.ok) { const data = await res.json(); throw new Error(data.message || 'Failed to start checkout'); }
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.url) { window.location.href = data.url; }
    },
    onError: (error: Error) => {
      toast({ title: "Checkout Failed", description: error.message, variant: "destructive" });
    }
  });

  const saveDomainMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/custom-domain', { domain: domainInput.trim().toLowerCase() });
      if (!res.ok) { const data = await res.json(); throw new Error(data.message || 'Failed to save domain'); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/settings/company'] });
      toast({ title: "Domain Saved", description: "Now add the CNAME record and verify." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save domain", description: error.message, variant: "destructive" });
    }
  });

  const verifyDomainMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('GET', '/api/custom-domain/verify');
      if (!res.ok) { const data = await res.json(); throw new Error(data.message || 'Verification failed'); }
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/settings/company'] });
      if (data.verified) {
        toast({ title: "Domain Verified!", description: "Your custom domain is now active." });
      } else {
        toast({ title: "Not Verified Yet", description: data.message || "CNAME record not found. DNS changes can take up to 48 hours to propagate.", variant: "destructive" });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Verification Failed", description: error.message, variant: "destructive" });
    }
  });

  const removeDomainMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('DELETE', '/api/custom-domain');
      if (!res.ok) { const data = await res.json(); throw new Error(data.message || 'Failed to remove domain'); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/settings/company'] });
      toast({ title: "Domain Removed", description: "Custom domain has been disconnected." });
      setShowRemoveDomain(false);
      setDomainInput('');
    },
    onError: (error: Error) => {
      toast({ title: "Failed to remove", description: error.message, variant: "destructive" });
      setShowRemoveDomain(false);
    }
  });

  if (!isElite) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-4 bg-muted/30 rounded-lg">
          <Lock className="w-5 h-5 text-primary mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="text-sm font-medium">Elite Plan Required</p>
            <p className="text-sm text-muted-foreground">
              {isNativeApp
                ? "Your own branded portal and branding removal is available for accounts with Elite access."
                : "Upgrade to Elite to unlock your branded portal and branding removal."}
            </p>
          </div>
        </div>
        {!isNativeApp && (
          <Link href="/billing">
            <Button data-testid="button-upgrade-white-label">Upgrade to Elite</Button>
          </Link>
        )}
      </div>
    );
  }

  if (!hasWhiteLabel) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-4 bg-muted/30 rounded-lg">
          <Info className="w-5 h-5 text-primary mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="text-sm font-medium">Your Brand, Your Way</p>
            <p className="text-sm text-muted-foreground">
              Get your own branded portal (portal.yourdomain.com) for proposals, estimates, invoices, and booking pages. Plus, remove all Fuse Phone branding from pages your customers see.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-4 p-4 bg-muted/30 rounded-lg">
          <div className="flex-1 space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span>Branded portal.yourdomain.com for all documents</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span>Remove all Fuse Phone branding from customer pages</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span>Professional appearance for your clients</span>
            </div>
          </div>
        </div>
        {!isNativeApp && (
          <Button
            onClick={() => checkoutMutation.mutate()}
            disabled={checkoutMutation.isPending}
            data-testid="button-subscribe-white-label"
          >
            {checkoutMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Subscribe — {PRICE_LABELS.makeItYourOwnMonthly}/mo
          </Button>
        )}
        <p className="text-xs text-muted-foreground">Limited time pricing. Cancel anytime.</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
          <span>Fuse Phone branding removed from all customer-facing pages</span>
        </div>

        {settings?.customDomain && settings?.customDomainVerified ? (
          <div className="space-y-4">
            <div className="flex items-center gap-4 p-4 bg-green-500/5 border border-green-500/30 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">Custom Domain Active</p>
                <p className="text-xs text-muted-foreground truncate">{settings.customDomain}</p>
                {settings.customDomainVerifiedAt && (
                  <p className="text-xs text-muted-foreground">Verified {new Date(settings.customDomainVerifiedAt).toLocaleDateString()}</p>
                )}
              </div>
            </div>
            <div className="pt-2 border-t">
              <Button variant="outline" onClick={() => setShowRemoveDomain(true)} data-testid="button-remove-domain">
                Remove Domain
              </Button>
            </div>
          </div>
        ) : settings?.customDomain ? (
          <div className="space-y-4">
            <div className="flex items-center gap-4 p-4 bg-yellow-500/5 border border-yellow-500/20 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">Domain Pending Verification</p>
                <p className="text-xs text-muted-foreground truncate">{settings.customDomain}</p>
              </div>
            </div>

            <Card className="overflow-hidden" data-testid="card-dns-cname-record">
              <CardContent className="p-0">
                <div className="flex items-center justify-between px-4 py-2.5 bg-muted/50 border-b">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs font-semibold uppercase tracking-wide">CNAME</Badge>
                    <span className="text-xs text-muted-foreground font-medium">1 record to add</span>
                  </div>
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Host / Name</p>
                      <div className="bg-muted/40 rounded-md px-3 py-2">
                        <p className="font-mono text-sm select-all" data-testid="text-cname-host">portal</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="shrink-0 h-8 px-2.5 mt-5" onClick={() => handleClipboardCopy("portal")} data-testid="button-copy-cname-host">
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Value / Points to</p>
                      <div className="bg-muted/40 rounded-md px-3 py-2">
                        <p className="font-mono text-sm select-all" data-testid="text-cname-value">app.fusephone.com</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="shrink-0 h-8 px-2.5 mt-5" onClick={() => handleClipboardCopy("app.fusephone.com")} data-testid="button-copy-cname-value">
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
            <p className="text-xs text-muted-foreground">DNS changes can take up to 48 hours to propagate.</p>

            <div className="flex items-center gap-2 flex-wrap">
              <Button
                onClick={() => verifyDomainMutation.mutate()}
                disabled={verifyDomainMutation.isPending}
                data-testid="button-verify-domain"
              >
                {verifyDomainMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Verify Domain
              </Button>
              <Button variant="outline" onClick={() => setShowRemoveDomain(true)} data-testid="button-remove-domain-pending">
                Remove Domain
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="custom-domain">Your Domain</Label>
              <Input
                id="custom-domain"
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value)}
                placeholder="yourbusiness.com"
                data-testid="input-custom-domain"
              />
              {domainInput.trim() && (
                <p className="text-xs text-primary font-medium">Your customer portal will be: portal.{domainInput.trim().toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/$/, '').replace(/^portal\./, '')}</p>
              )}
              <p className="text-xs text-muted-foreground">Enter your domain and we'll set up portal.yourdomain.com for your customer-facing pages.</p>
            </div>
            <Button
              onClick={() => saveDomainMutation.mutate()}
              disabled={saveDomainMutation.isPending || !domainInput.trim()}
              data-testid="button-save-domain"
            >
              {saveDomainMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Domain
            </Button>
          </div>
        )}
      </div>

      <Dialog open={showRemoveDomain} onOpenChange={setShowRemoveDomain}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Custom Domain?</DialogTitle>
            <DialogDescription>
              Your documents will revert to using the default Fuse Phone URLs. You can add a new domain anytime.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setShowRemoveDomain(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => removeDomainMutation.mutate()}
              disabled={removeDomainMutation.isPending}
              data-testid="button-confirm-remove-domain"
            >
              {removeDomainMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function FinancingIntegrationCard({ settings }: { settings: CompanySettings | null | undefined }) {
  const { toast } = useToast();
  const isNativeApp = useIsNativeApp();
  const updateSettings = useUpdateCompanySettings();
  const [provider, setProvider] = useState(settings?.financingProvider || 'Acorn Finance');
  const [link, setLink] = useState(settings?.financingLink || '');
  const isEnabled = !!settings?.financingEnabled;
  const isConnected = isEnabled && !!settings?.financingLink;

  useEffect(() => {
    setProvider(settings?.financingProvider || 'Acorn Finance');
    setLink(settings?.financingLink || '');
  }, [settings?.financingProvider, settings?.financingLink]);

  const handleSave = () => {
    if (!link.trim()) {
      toast({ title: "Link Required", description: "Enter your financing application URL", variant: "destructive" });
      return;
    }
    let url = link.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    updateSettings.mutate(
      { financingEnabled: true, financingProvider: provider, financingLink: url },
      {
        onSuccess: () => toast({ title: "Financing Enabled", description: "Your financing link will appear on proposals" }),
        onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
      }
    );
  };

  const handleDisable = () => {
    updateSettings.mutate(
      { financingEnabled: false },
      {
        onSuccess: () => toast({ title: "Financing Disabled", description: "Financing link removed from proposals" }),
        onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
      }
    );
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Let your customers pay over time. Enter your financing application link and it will appear on your proposals and estimates.
      </p>

      {isConnected ? (
        <div className="space-y-4">
          <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
            <div className="flex-1">
              <p className="font-medium">{settings?.financingProvider || 'Financing'} Connected</p>
              <p className="text-sm text-muted-foreground truncate">{settings?.financingLink}</p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs">Provider</Label>
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger data-testid="select-financing-provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Acorn Finance">Acorn Finance</SelectItem>
                  <SelectItem value="Wisetack">Wisetack</SelectItem>
                  <SelectItem value="Hearth">Hearth</SelectItem>
                  <SelectItem value="GreenSky">GreenSky</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs">Financing Application URL</Label>
              <Input
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://app.acornfinance.com/your-link"
                data-testid="input-financing-link"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={updateSettings.isPending} data-testid="button-save-financing">
                {updateSettings.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                <Save className="w-4 h-4 mr-2" />
                Update
              </Button>
              <Button variant="outline" onClick={handleDisable} disabled={updateSettings.isPending} data-testid="button-disable-financing">
                Disable
              </Button>
            </div>
          </div>
          <div className="flex items-start gap-4 p-4 bg-muted/30 rounded-lg">
            <div className="flex-1 space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span>"Financing Available" shown on proposals</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span>Customers can apply directly from your documents</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-3">
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs">Provider</Label>
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger data-testid="select-financing-provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Acorn Finance">Acorn Finance</SelectItem>
                  <SelectItem value="Wisetack">Wisetack</SelectItem>
                  <SelectItem value="Hearth">Hearth</SelectItem>
                  <SelectItem value="GreenSky">GreenSky</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs">Financing Application URL</Label>
              <Input
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://app.acornfinance.com/your-link"
                data-testid="input-financing-link"
              />
            </div>
          </div>
          <Button onClick={handleSave} disabled={updateSettings.isPending} data-testid="button-enable-financing">
            {updateSettings.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Enable Financing
          </Button>
          <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
            <p className="text-sm text-blue-800 dark:text-blue-300">
              <Info className="w-4 h-4 inline mr-1 -mt-0.5" />
              {isNativeApp
                ? "Enter your financing provider application link to enable financing options for your customers."
                : "You'll need an account with your financing provider. Sign up at their website, then paste your unique application link here."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function ZapierIntegrationCard({ settings }: { settings: CompanySettings | null | undefined }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isConnected = !!settings?.zapierWebhookSecret;
  const [showDisconnect, setShowDisconnect] = useState(false);
  const [apiKeyLocal, setApiKeyLocal] = useState('');

  const { data: apiKeyData } = useQuery<{ apiKey: string | null }>({
    queryKey: ['/api/zapier/api-key'],
    enabled: isConnected,
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/zapier/connect');
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to connect');
      }
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/settings/company'] });
      queryClient.invalidateQueries({ queryKey: ['/api/zapier/api-key'] });
      if (data.apiKey) {
        setApiKeyLocal(data.apiKey);
      }
      toast({ title: "Zapier Connected", description: "Copy your API key and paste it into Zapier" });
    },
    onError: (error: Error) => {
      toast({ title: "Connection Failed", description: error.message, variant: "destructive" });
    }
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/zapier/disconnect');
      if (!res.ok) throw new Error('Failed to disconnect');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/settings/company'] });
      toast({ title: "Disconnected", description: "Zapier has been disconnected" });
      setShowDisconnect(false);
      setApiKeyLocal('');
    },
    onError: (error: Error) => {
      toast({ title: "Failed to disconnect", description: error.message, variant: "destructive" });
      setShowDisconnect(false);
    }
  });

  const regenerateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/zapier/connect');
      if (!res.ok) throw new Error('Failed to regenerate');
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/settings/company'] });
      queryClient.invalidateQueries({ queryKey: ['/api/zapier/api-key'] });
      if (data.apiKey) {
        setApiKeyLocal(data.apiKey);
      }
      toast({ title: "API Key Regenerated", description: "Make sure to update your API key in Zapier" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    }
  });

  const displayApiKey = apiKeyLocal || apiKeyData?.apiKey || '';

  const copyApiKey = async () => {
    if (displayApiKey) {
      const { copyToClipboard } = await import("@/lib/clipboard");
      const ok = await copyToClipboard(displayApiKey);
      toast({ title: ok ? "Copied" : "Could not copy", description: ok ? "API key copied to clipboard" : displayApiKey, variant: ok ? "default" : "destructive" });
    }
  };

  return (
    <>
      <div>
        {isConnected ? (
          <div className="space-y-4">
            <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
              <div className="flex-1">
                <p className="font-medium">Zapier Connected</p>
                <p className="text-sm text-muted-foreground">
                  Connected {settings?.zapierConnectedAt ? new Date(settings.zapierConnectedAt).toLocaleDateString() : ''}
                </p>
              </div>
            </div>

            {displayApiKey && (
              <div className="space-y-2">
                <Label className="text-muted-foreground text-xs">API Key (paste in Zapier when connecting)</Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={displayApiKey}
                    className="font-mono text-sm"
                    data-testid="input-zapier-api-key"
                  />
                  <Button size="icon" variant="outline" onClick={copyApiKey} data-testid="button-copy-zapier-key">
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}

            <div className="flex items-start gap-4 p-4 bg-muted/30 rounded-lg">
              <div className="flex-1 space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>Incoming leads auto-created as contacts</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>Supports any lead source via Zapier</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>Duplicates matched by phone or email</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-4 border-t flex-wrap">
              <Button
                variant="outline"
                onClick={() => regenerateMutation.mutate()}
                disabled={regenerateMutation.isPending}
                data-testid="button-regenerate-zapier-url"
              >
                {regenerateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Regenerate API Key
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowDisconnect(true)}
                data-testid="button-disconnect-zapier"
              >
                Disconnect Zapier
              </Button>
            </div>

            <Dialog open={showDisconnect} onOpenChange={setShowDisconnect}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Disconnect Zapier?</DialogTitle>
                  <DialogDescription>
                    New leads from Zapier will no longer be imported. Existing contacts will not be affected.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter className="gap-2 sm:gap-0">
                  <Button variant="outline" onClick={() => setShowDisconnect(false)}>Cancel</Button>
                  <Button
                    variant="destructive"
                    onClick={() => disconnectMutation.mutate()}
                    disabled={disconnectMutation.isPending}
                    data-testid="button-confirm-disconnect-zapier"
                  >
                    {disconnectMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Yes, Disconnect
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Connect Zapier to automatically import leads from any source - Facebook Lead Ads, Google Forms, Typeform, your website, and 5,000+ other apps. Leads appear as contacts in your CRM instantly.
            </p>
            <div className="flex items-start gap-4 p-4 bg-muted/30 rounded-lg">
              <div className="flex-1 space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>Import leads from 5,000+ apps</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>Leads tagged with source for tracking</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>No duplicate contacts - matched by phone/email</span>
                </div>
              </div>
            </div>
            <Button
              onClick={() => connectMutation.mutate()}
              disabled={connectMutation.isPending}
              data-testid="button-connect-zapier"
            >
              {connectMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Connect Zapier
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

function OfficePhoneInput({ settings, updateSettings }: { 
  settings: CompanySettings | null | undefined;
  updateSettings: (data: Partial<CompanySettings>, options?: any) => void;
}) {
  const { toast } = useToast();
  const [officePhone, setOfficePhone] = useState(settings?.twilioOfficePhone || '');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setOfficePhone(settings?.twilioOfficePhone || '');
  }, [settings?.twilioOfficePhone]);

  const handleSave = () => {
    setIsSaving(true);
    updateSettings({ twilioOfficePhone: officePhone || null }, {
      onSuccess: () => {
        toast({ title: "Office phone saved", description: "Calls will now connect through your office number first" });
        setIsSaving(false);
      },
      onError: (error: Error) => {
        toast({ title: "Failed to save", description: error.message, variant: "destructive" });
        setIsSaving(false);
      }
    });
  };

  return (
    <div className="space-y-2 pt-4 border-t">
      <Label htmlFor="officePhone">Office Phone (for two-leg calling)</Label>
      <div className="flex gap-2">
        <Input 
          id="officePhone"
          type="tel"
          value={officePhone}
          onChange={(e) => setOfficePhone(e.target.value)}
          placeholder="+1 555 123-4567"
          data-testid="input-office-phone"
        />
        <Button onClick={handleSave} disabled={isSaving} data-testid="button-save-office-phone">
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        When making calls, your office phone will ring first. Once you answer, we'll connect you to the customer.
      </p>
    </div>
  );
}

function PhoneTextProviderCard({ settings }: { settings: CompanySettings | null | undefined }) {
  const { mutate: updateSettings, isPending: isSaving } = useUpdateCompanySettings();
  const { data: phoneNumbers, refetch: fetchNumbers, isFetching: isFetchingNumbers, error: numbersError } = useTwilioNumbers();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isNativeApp = useIsNativeApp();
  const currentProvider = settings?.phoneProvider || 'twilio';

  const twilioConnected = !!(settings?.twilioAccountSid && settings?.twilioPhoneNumber);
  const openphoneConnected = !!(settings?.openphoneApiKey && settings?.openphonePhoneNumber);

  const [twilioIsEditing, setTwilioIsEditing] = useState(false);
  const [showNumberPicker, setShowNumberPicker] = useState(false);
  const [showDisconnectTwilio, setShowDisconnectTwilio] = useState(false);
  const [twilioForm, setTwilioForm] = useState({
    accountSid: '',
    authToken: '',
  });
  const [businessType, setBusinessType] = useState<'sole_proprietor' | 'standard'>('sole_proprietor');
  const [ein, setEin] = useState('');

  const [openphoneIsEditing, setOpenphoneIsEditing] = useState(false);
  const [showDisconnectOpenphone, setShowDisconnectOpenphone] = useState(false);
  const [openphoneForm, setOpenphoneForm] = useState({
    apiKey: '',
    phoneNumber: '',
  });

  const twilioHasCredentials = settings?.twilioAccountSid && settings?.twilioAuthToken;
  const twilioHasPhoneNumber = settings?.twilioPhoneNumber;
  const twilioHasMessagingService = !!settings?.twilioMessagingServiceSid;
  const twilioHasA2pRegistration = !!settings?.twilioA2pBrandSid;
  const twilioIsFullyConfigured = twilioHasCredentials && twilioHasPhoneNumber;

  const openphoneHasCredentials = !!settings?.openphoneApiKey;
  const openphoneHasPhoneNumber = !!settings?.openphonePhoneNumber;
  const openphoneIsFullyConfigured = openphoneHasCredentials && openphoneHasPhoneNumber;

  const twilioCurrentStep = !twilioHasCredentials ? 1 : !twilioHasPhoneNumber ? 2 : !twilioHasMessagingService ? 3 : !twilioHasA2pRegistration ? 4 : 5;

  const getOverallStatus = () => {
    if (currentProvider === 'twilio') {
      if (twilioCurrentStep === 5) return 'connected';
      if (twilioHasCredentials) return 'in_progress';
      return 'not_connected';
    } else {
      if (openphoneIsFullyConfigured) return 'connected';
      if (openphoneHasCredentials) return 'in_progress';
      return 'not_connected';
    }
  };

  const overallStatus = getOverallStatus();

  const otherProviderConnected = (target: 'twilio' | 'openphone') => {
    if (target === 'twilio') return openphoneConnected;
    return twilioConnected;
  };

  const handleSwitchProvider = (provider: 'twilio' | 'openphone') => {
    if (provider === currentProvider) return;
    if (otherProviderConnected(provider)) {
      const connectedName = provider === 'twilio' ? 'OpenPhone' : 'Twilio';
      toast({
        title: `Disconnect ${connectedName} first`,
        description: `You need to disconnect ${connectedName} before switching to ${provider === 'twilio' ? 'Twilio' : 'OpenPhone'}.`,
        variant: "destructive",
      });
      return;
    }
    updateSettings({ phoneProvider: provider }, {
      onSuccess: () => {
        toast({ title: `Switched to ${provider === 'twilio' ? 'Twilio' : 'OpenPhone'}`, description: `Set up your ${provider === 'twilio' ? 'Twilio' : 'OpenPhone'} credentials below.` });
      }
    });
  };

  const disconnectTwilioMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/twilio/disconnect');
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to disconnect');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/settings/company'] });
      toast({ title: "Twilio Disconnected", description: "Your Twilio integration has been removed" });
      setShowDisconnectTwilio(false);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to disconnect", description: error.message, variant: "destructive" });
      setShowDisconnectTwilio(false);
    }
  });

  const { data: webhookStatus, refetch: refetchWebhookStatus } = useQuery<{
    configured: boolean;
    currentUrl?: string;
    expectedUrl?: string;
    isCorrect?: boolean;
    error?: string;
  }>({
    queryKey: ['/api/twilio/webhook-status'],
    enabled: !!twilioIsFullyConfigured,
    staleTime: 30000,
  });

  const { data: voiceWebhookStatus, refetch: refetchVoiceWebhookStatus } = useQuery<{
    configured: boolean;
    currentUrl?: string;
    expectedUrl?: string;
    isCorrect?: boolean;
    error?: string;
  }>({
    queryKey: ['/api/twilio/voice-webhook-status'],
    enabled: !!twilioIsFullyConfigured,
    staleTime: 30000,
  });

  const { data: a2pStatus } = useQuery<{
    brandStatus?: string;
    campaignStatus?: string;
    brandSid?: string;
    campaignSid?: string;
  }>({
    queryKey: ['/api/twilio/a2p-status'],
    enabled: !!twilioIsFullyConfigured,
    staleTime: 60000,
  });

  const fixWebhookMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/twilio/configure-webhooks');
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Webhook updated", description: "Incoming messages will now be received correctly" });
      refetchWebhookStatus();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update webhook", description: error.message, variant: "destructive" });
    }
  });

  const fixVoiceWebhookMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/twilio/configure-voice-webhook');
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Voice webhook updated", description: "Incoming calls will now be received and logged" });
      refetchVoiceWebhookStatus();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update voice webhook", description: error.message, variant: "destructive" });
    }
  });

  const createMessagingServiceMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/twilio/create-messaging-service');
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to create messaging service');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/settings/company'] });
      toast({ title: "Messaging Service Created", description: "Your messaging service is ready" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create messaging service", description: error.message, variant: "destructive" });
    }
  });

  const registerA2pMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/twilio/register-a2p-brand', { businessType, ein: businessType === 'standard' ? ein : undefined });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to register');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/settings/company'] });
      queryClient.invalidateQueries({ queryKey: ['/api/twilio/a2p-status'] });
      toast({ title: "Registration Submitted", description: "Your A2P registration has been submitted for review" });
    },
    onError: (error: Error) => {
      toast({ title: "Registration Failed", description: error.message, variant: "destructive" });
    }
  });

  const sendSetupEmailMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/twilio/send-setup-email');
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to send email');
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Email Sent", description: "Setup confirmation email has been sent" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to send email", description: error.message, variant: "destructive" });
    }
  });

  useEffect(() => {
    if (settings && twilioIsEditing) {
      setTwilioForm({
        accountSid: settings.twilioAccountSid || '',
        authToken: settings.twilioAuthToken || '',
      });
    }
  }, [settings, twilioIsEditing]);

  useEffect(() => {
    if (settings && openphoneIsEditing) {
      setOpenphoneForm({
        apiKey: '',
        phoneNumber: settings.openphonePhoneNumber || '',
      });
    }
  }, [settings, openphoneIsEditing]);

  const maskValue = (value: string | null | undefined) => {
    if (!value) return '';
    if (value.length <= 8) return '***';
    return value.slice(0, 4) + '...' + value.slice(-4);
  };

  const handleSaveTwilioCredentials = () => {
    if (!twilioForm.accountSid || !twilioForm.authToken) {
      toast({ title: "Error", description: "Please fill in both fields", variant: "destructive" });
      return;
    }

    updateSettings({
      twilioAccountSid: twilioForm.accountSid,
      twilioAuthToken: twilioForm.authToken,
      twilioPhoneNumber: null,
    }, {
      onSuccess: () => {
        toast({ title: "Twilio credentials saved", description: "Please select a phone number" });
        setTwilioIsEditing(false);
        setTwilioForm({ accountSid: '', authToken: '' });
      },
      onError: (error: any) => {
        toast({ title: "Failed to save", description: error.message, variant: "destructive" });
      }
    });
  };

  const handleChooseNumber = async () => {
    setShowNumberPicker(true);
    fetchNumbers();
  };

  const handleSelectNumber = (phoneNumber: string) => {
    updateSettings({ twilioPhoneNumber: phoneNumber }, {
      onSuccess: async () => {
        toast({ title: "Phone number selected", description: phoneNumber });
        setShowNumberPicker(false);
        try {
          await apiRequest('POST', '/api/twilio/configure-webhooks');
          toast({ title: "SMS webhook configured", description: "Incoming messages will now appear automatically" });
          refetchWebhookStatus();
        } catch (err: any) {
          console.warn('SMS webhook auto-config failed:', err);
          refetchWebhookStatus();
        }
        try {
          await apiRequest('POST', '/api/twilio/configure-voice-webhook');
          toast({ title: "Voice webhook configured", description: "Incoming calls will now be logged automatically" });
          refetchVoiceWebhookStatus();
        } catch (err: any) {
          console.warn('Voice webhook auto-config failed:', err);
          refetchVoiceWebhookStatus();
        }
      },
      onError: (error: any) => {
        toast({ title: "Failed to save phone number", description: error.message, variant: "destructive" });
      }
    });
  };

  const handleStartTwilioEdit = () => {
    setTwilioIsEditing(true);
    setTwilioForm({
      accountSid: '',
      authToken: '',
    });
  };

  const handleSaveOpenphone = () => {
    if (!openphoneForm.apiKey && !openphoneHasCredentials) {
      toast({ title: "Error", description: "Please enter your API key", variant: "destructive" });
      return;
    }
    if (!openphoneForm.phoneNumber) {
      toast({ title: "Error", description: "Please enter your OpenPhone number", variant: "destructive" });
      return;
    }

    const updates: Record<string, any> = {
      openphonePhoneNumber: openphoneForm.phoneNumber,
      phoneProvider: 'openphone',
    };
    if (openphoneForm.apiKey) {
      updates.openphoneApiKey = openphoneForm.apiKey;
    }

    updateSettings(updates, {
      onSuccess: () => {
        toast({ title: "OpenPhone connected", description: "SMS messages will now be sent through OpenPhone" });
        setOpenphoneIsEditing(false);
        setOpenphoneForm({ apiKey: '', phoneNumber: '' });
      },
      onError: (error: any) => {
        toast({ title: "Failed to save", description: error.message, variant: "destructive" });
      }
    });
  };

  const disconnectOpenphoneMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/openphone/disconnect');
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to disconnect');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/settings/company'] });
      toast({ title: "OpenPhone Disconnected", description: "Your OpenPhone integration has been removed" });
      setShowDisconnectOpenphone(false);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to disconnect", description: error.message, variant: "destructive" });
      setShowDisconnectOpenphone(false);
    }
  });

  const renderStepIndicator = (step: number, label: string) => {
    const isComplete = twilioCurrentStep > step;
    const isCurrent = twilioCurrentStep === step;
    return (
      <div className="flex items-center gap-2" data-testid={`step-indicator-${step}`}>
        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${isComplete ? 'bg-green-500 text-white' : isCurrent ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
          {isComplete ? <CheckCircle className="w-4 h-4" /> : step}
        </div>
        <span className={`text-sm ${isCurrent ? 'font-medium' : 'text-muted-foreground'}`}>{label}</span>
      </div>
    );
  };

  const renderTwilioContent = () => (
    <div className="space-y-6">
      {!twilioIsEditing && twilioHasCredentials && twilioCurrentStep < 5 && (
        <div className="flex flex-wrap items-center gap-4 pb-4 border-b">
          {renderStepIndicator(1, 'Credentials')}
          <ArrowRight className="w-4 h-4 text-muted-foreground" />
          {renderStepIndicator(2, 'Phone Number')}
          <ArrowRight className="w-4 h-4 text-muted-foreground" />
          {renderStepIndicator(3, 'Messaging Service')}
          <ArrowRight className="w-4 h-4 text-muted-foreground" />
          {renderStepIndicator(4, 'A2P Registration')}
        </div>
      )}

      {(!twilioHasCredentials || twilioIsEditing) && (
        <div className="space-y-4">
          {twilioIsEditing ? (
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-md p-3 mb-4">
              <p className="text-sm text-yellow-600">
                Updating credentials will reset your phone number selection.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {isNativeApp ? (
                <div className="flex items-start gap-3 p-4 bg-muted/30 rounded-lg">
                  <Info className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                  <p className="text-sm text-muted-foreground">
                    To enable SMS and calling features, enter your Twilio Account SID and Auth Token below.
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex items-start gap-3 p-4 bg-muted/30 rounded-lg">
                    <Info className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                    <div className="space-y-2">
                      <p className="text-sm font-medium">To use SMS and calling features, you'll need a Twilio account.</p>
                      <a
                        href="https://www.twilio.com/try-twilio"
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid="link-create-twilio-account"
                      >
                        <Button variant="outline" className="mt-1">
                          <ExternalLink className="w-4 h-4 mr-2" />
                          Create Free Twilio Account
                        </Button>
                      </a>
                      <p className="text-xs text-muted-foreground">New accounts get $15.50 in free trial credit - enough to test everything out.</p>
                    </div>
                  </div>

                  <div className="p-4 bg-muted/30 rounded-lg space-y-2">
                    <p className="text-sm font-medium">After creating your account:</p>
                    <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1">
                      <li>Buy a phone number (~$1.15/mo)</li>
                      <li>Copy your Account SID and Auth Token from the Twilio dashboard</li>
                      <li>Paste them below</li>
                    </ol>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="accountSid">Account SID</Label>
            <Input
              id="accountSid"
              value={twilioForm.accountSid}
              onChange={(e) => setTwilioForm({ ...twilioForm, accountSid: e.target.value })}
              placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              data-testid="input-twilio-sid"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="authToken">Auth Token</Label>
            <Input
              id="authToken"
              type="password"
              value={twilioForm.authToken}
              onChange={(e) => setTwilioForm({ ...twilioForm, authToken: e.target.value })}
              placeholder="Your Auth Token"
              data-testid="input-twilio-token"
            />
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button onClick={handleSaveTwilioCredentials} disabled={isSaving} data-testid="button-save-twilio">
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Credentials
            </Button>
            {twilioIsEditing && (
              <Button variant="outline" onClick={() => setTwilioIsEditing(false)} data-testid="button-cancel-twilio-edit">
                Cancel
              </Button>
            )}
          </div>
        </div>
      )}

      {!twilioIsEditing && twilioHasCredentials && !twilioHasPhoneNumber && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-muted-foreground text-xs">Account SID</Label>
              <p className="font-mono text-sm bg-muted px-3 py-2 rounded-md" data-testid="text-twilio-sid-masked">
                {maskValue(settings?.twilioAccountSid)}
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-muted-foreground text-xs">Auth Token</Label>
              <p className="font-mono text-sm bg-muted px-3 py-2 rounded-md" data-testid="text-twilio-token-masked">
                {maskValue(settings?.twilioAuthToken)}
              </p>
            </div>
          </div>
          <div className="p-4 bg-muted/30 rounded-lg">
            <p className="text-sm">Select a phone number from your Twilio account to use for SMS and calls.</p>
          </div>
          <Button onClick={handleChooseNumber} data-testid="button-choose-number">
            <Phone className="w-4 h-4 mr-2" /> Choose Phone Number
          </Button>
        </div>
      )}

      {!twilioIsEditing && twilioHasCredentials && twilioHasPhoneNumber && !twilioHasMessagingService && (
        <div className="space-y-4">
          <div className="space-y-1">
            <Label className="text-muted-foreground text-xs">Twilio Phone Number</Label>
            <p className="font-medium text-lg" data-testid="text-twilio-phone">{settings?.twilioPhoneNumber}</p>
          </div>
          <div className="p-4 bg-muted/30 rounded-lg space-y-2">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Create a Messaging Service</p>
                <p className="text-sm text-muted-foreground">A Messaging Service is required by phone carriers for sending business text messages. We'll create one for you automatically.</p>
              </div>
            </div>
          </div>
          <Button
            onClick={() => createMessagingServiceMutation.mutate()}
            disabled={createMessagingServiceMutation.isPending}
            data-testid="button-create-messaging-service"
          >
            {createMessagingServiceMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Create Messaging Service
          </Button>

          <OfficePhoneInput settings={settings} updateSettings={updateSettings} />
        </div>
      )}

      {!twilioIsEditing && twilioHasCredentials && twilioHasPhoneNumber && twilioHasMessagingService && !twilioHasA2pRegistration && (
        <div className="space-y-4">
          <div className="space-y-1">
            <Label className="text-muted-foreground text-xs">Twilio Phone Number</Label>
            <p className="font-medium text-lg" data-testid="text-twilio-phone-step4">{settings?.twilioPhoneNumber}</p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
            <span>Messaging Service created</span>
          </div>
          <div className="p-4 bg-muted/30 rounded-lg space-y-2">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">A2P Business Registration</p>
                <p className="text-sm text-muted-foreground">US phone carriers require businesses to register before sending text messages. This helps prevent spam and ensures your messages get delivered.</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={() => setBusinessType('sole_proprietor')}
              className={`p-4 border rounded-lg text-left space-y-2 transition-colors ${businessType === 'sole_proprietor' ? 'border-primary bg-primary/5' : ''}`}
              data-testid="button-select-sole-proprietor"
            >
              <div className="flex items-center gap-2">
                <User className="w-5 h-5 text-primary" />
                <p className="font-medium text-sm">Sole Proprietor</p>
              </div>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>Best for independent contractors and one-person operations</li>
                <li>Up to ~1,000 messages per day</li>
                <li>No tax ID needed</li>
                <li>Approval: 1-3 business days</li>
              </ul>
            </button>

            <button
              onClick={() => setBusinessType('standard')}
              className={`p-4 border rounded-lg text-left space-y-2 transition-colors ${businessType === 'standard' ? 'border-primary bg-primary/5' : ''}`}
              data-testid="button-select-standard-business"
            >
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-primary" />
                <p className="font-medium text-sm">Standard Business</p>
              </div>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>Best for LLCs, corporations, and larger companies</li>
                <li>Up to 2,000-10,000+ messages per day</li>
                <li>Requires EIN (Employer Identification Number)</li>
                <li>Approval: 5-10 business days</li>
              </ul>
            </button>
          </div>

          {businessType === 'standard' && (
            <div className="space-y-2">
              <Label htmlFor="ein">EIN (Employer Identification Number)</Label>
              <Input
                id="ein"
                value={ein}
                onChange={(e) => setEin(e.target.value)}
                placeholder="XX-XXXXXXX"
                data-testid="input-ein"
              />
            </div>
          )}

          <Button
            onClick={() => registerA2pMutation.mutate()}
            disabled={registerA2pMutation.isPending || (businessType === 'standard' && !ein.trim())}
            data-testid="button-submit-a2p-registration"
          >
            {registerA2pMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Submit Registration
          </Button>

          <OfficePhoneInput settings={settings} updateSettings={updateSettings} />
        </div>
      )}

      {!twilioIsEditing && twilioHasCredentials && twilioHasPhoneNumber && twilioHasMessagingService && twilioHasA2pRegistration && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-muted-foreground text-xs">Account SID</Label>
              <p className="font-mono text-sm bg-muted px-3 py-2 rounded-md" data-testid="text-twilio-sid-configured">
                {maskValue(settings?.twilioAccountSid)}
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-muted-foreground text-xs">Auth Token</Label>
              <p className="font-mono text-sm bg-muted px-3 py-2 rounded-md" data-testid="text-twilio-token-configured">
                {maskValue(settings?.twilioAuthToken)}
              </p>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-muted-foreground text-xs">Twilio Phone Number</Label>
            <p className="font-medium text-lg" data-testid="text-twilio-phone-configured">{settings?.twilioPhoneNumber}</p>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
            <span data-testid="text-messaging-service-status">Messaging Service: {settings?.twilioMessagingServiceSid ? maskValue(settings.twilioMessagingServiceSid) : 'Created'}</span>
          </div>

          <div className="flex items-center gap-2 text-sm">
            {(a2pStatus?.brandStatus === 'APPROVED' || settings?.twilioA2pBrandStatus === 'APPROVED') ? (
              <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
            ) : (
              <Loader2 className="w-4 h-4 text-yellow-500 shrink-0 animate-spin" />
            )}
            <span data-testid="text-a2p-status">
              A2P Registration: {a2pStatus?.brandStatus || settings?.twilioA2pBrandStatus || 'Pending Review'}
              {settings?.twilioBusinessType && ` (${settings.twilioBusinessType === 'sole_proprietor' ? 'Sole Proprietor' : 'Standard Business'})`}
            </span>
          </div>

          {a2pStatus?.campaignStatus && (
            <div className="flex items-center gap-2 text-sm">
              {a2pStatus.campaignStatus === 'VERIFIED' ? (
                <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
              ) : (
                <Loader2 className="w-4 h-4 text-yellow-500 shrink-0 animate-spin" />
              )}
              <span data-testid="text-campaign-status">Campaign: {a2pStatus.campaignStatus}</span>
            </div>
          )}

          <div className="pt-2">
            <Button
              variant="outline"
              onClick={() => sendSetupEmailMutation.mutate()}
              disabled={sendSetupEmailMutation.isPending}
              data-testid="button-send-setup-email"
            >
              {sendSetupEmailMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              <Mail className="w-4 h-4 mr-2" />
              Send Setup Confirmation Email
            </Button>
          </div>

          <OfficePhoneInput settings={settings} updateSettings={updateSettings} />

          {webhookStatus && (
            <div className="space-y-2 pt-2">
              <Label className="text-muted-foreground text-xs">Incoming Message Webhook</Label>
              {webhookStatus.isCorrect ? (
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                  <span className="text-muted-foreground truncate" data-testid="text-webhook-url">{webhookStatus.currentUrl}</span>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0" />
                    <span className="text-destructive">
                      {webhookStatus.currentUrl
                        ? "Webhook URL is outdated - incoming texts won't be received"
                        : "No webhook configured - incoming texts won't be received"}
                    </span>
                  </div>
                  {webhookStatus.currentUrl && (
                    <p className="text-xs text-muted-foreground truncate">Current: {webhookStatus.currentUrl}</p>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fixWebhookMutation.mutate()}
                    disabled={fixWebhookMutation.isPending}
                    data-testid="button-fix-webhook"
                  >
                    {fixWebhookMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Settings className="w-4 h-4 mr-2" />
                    )}
                    Fix Webhook
                  </Button>
                </div>
              )}
            </div>
          )}

          {voiceWebhookStatus && (
            <div className="space-y-2 pt-2">
              <Label className="text-muted-foreground text-xs">Incoming Call Webhook</Label>
              {voiceWebhookStatus.isCorrect ? (
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                  <span className="text-muted-foreground truncate" data-testid="text-voice-webhook-url">{voiceWebhookStatus.currentUrl}</span>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0" />
                    <span className="text-destructive">
                      {voiceWebhookStatus.currentUrl
                        ? "Voice webhook URL is outdated - incoming calls won't be logged"
                        : "No voice webhook configured - incoming calls won't be logged"}
                    </span>
                  </div>
                  {voiceWebhookStatus.currentUrl && (
                    <p className="text-xs text-muted-foreground truncate">Current: {voiceWebhookStatus.currentUrl}</p>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fixVoiceWebhookMutation.mutate()}
                    disabled={fixVoiceWebhookMutation.isPending}
                    data-testid="button-fix-voice-webhook"
                  >
                    {fixVoiceWebhookMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Settings className="w-4 h-4 mr-2" />
                    )}
                    Fix Voice Webhook
                  </Button>
                </div>
              )}
            </div>
          )}

          <div className="pt-4 border-t flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={handleStartTwilioEdit} data-testid="button-edit-twilio">
                <Pencil className="w-4 h-4 mr-2" /> Edit Credentials
              </Button>
              <Button variant="outline" className="text-destructive" onClick={() => setShowDisconnectTwilio(true)} data-testid="button-disconnect-twilio">
                Disconnect Twilio
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Warning: Changing credentials will require re-selecting your phone number.
            </p>
          </div>
        </div>
      )}

      {twilioHasCredentials && !(twilioHasPhoneNumber && twilioHasMessagingService && twilioHasA2pRegistration) && (
        <div className="pt-4 border-t">
          <Button variant="outline" className="text-destructive" onClick={() => setShowDisconnectTwilio(true)} data-testid="button-disconnect-twilio-partial">
            Disconnect Twilio
          </Button>
        </div>
      )}

      <Dialog open={showNumberPicker} onOpenChange={setShowNumberPicker}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Choose a Phone Number</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            {isFetchingNumbers ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : numbersError ? (
              <div className="text-center py-8 text-destructive">
                <p>Failed to load phone numbers</p>
                <p className="text-sm text-muted-foreground mt-1">{(numbersError as Error).message}</p>
              </div>
            ) : phoneNumbers && phoneNumbers.length > 0 ? (
              <div className="space-y-2">
                {phoneNumbers.map((num: any) => (
                  <div key={num.sid} className="space-y-1">
                    <button
                      onClick={() => handleSelectNumber(num.phoneNumber)}
                      className="w-full p-4 text-left border rounded-lg hover-elevate transition-colors"
                      data-testid={`phone-number-${num.sid}`}
                    >
                      <p className="font-medium">{formatPhoneDisplay(num.phoneNumber)}</p>
                      <p className="text-sm text-muted-foreground">{num.friendlyName}</p>
                      {num.inMessagingService && (
                        <div className="flex items-center gap-1.5 mt-2 text-yellow-600 dark:text-yellow-500">
                          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                          <p className="text-xs">This number is part of a shared Messaging Service. This may cause conflicts with other apps using the same service. For best results, remove it from the Messaging Service in your Twilio console.</p>
                        </div>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p>No phone numbers found in your Twilio account</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showDisconnectTwilio} onOpenChange={setShowDisconnectTwilio}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect Twilio?</DialogTitle>
            <DialogDescription>
              This will remove your Twilio credentials and phone number. You will no longer be able to send or receive SMS messages or make calls until you reconnect. Your message history will be preserved.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowDisconnectTwilio(false)} data-testid="button-cancel-disconnect-twilio">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => disconnectTwilioMutation.mutate()}
              disabled={disconnectTwilioMutation.isPending}
              data-testid="button-confirm-disconnect-twilio"
            >
              {disconnectTwilioMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Yes, Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  const renderOpenPhoneContent = () => (
    <div className="space-y-6">
      <div className="p-3 bg-muted/30 rounded-lg">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-sm text-muted-foreground">
            OpenPhone supports SMS messaging only. Browser calling, call recording, IVR, voicemail, and conferencing features require Twilio.
          </p>
        </div>
      </div>

      {(!openphoneHasCredentials || openphoneIsEditing) && (
        <div className="space-y-4">
          {!openphoneIsEditing && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-muted/30 rounded-lg">
                <Info className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                <div className="space-y-2">
                  <p className="text-sm font-medium">To use OpenPhone for SMS, you need an API key from your OpenPhone account.</p>
                  <a
                    href="https://app.openphone.com/settings/api"
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="link-openphone-api-settings"
                  >
                    <Button variant="outline" className="mt-1">
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Open API Settings
                    </Button>
                  </a>
                  <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1 mt-2">
                    <li>Go to Settings in OpenPhone</li>
                    <li>Navigate to API Keys</li>
                    <li>Create a new API key and copy it</li>
                    <li>Enter the phone number you want to send from</li>
                  </ol>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="openphoneApiKey">API Key</Label>
            <Input
              id="openphoneApiKey"
              type="password"
              value={openphoneForm.apiKey}
              onChange={(e) => setOpenphoneForm({ ...openphoneForm, apiKey: e.target.value })}
              placeholder={openphoneIsEditing && openphoneHasCredentials ? "Leave blank to keep existing key" : "Your OpenPhone API key"}
              data-testid="input-openphone-api-key"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="openphonePhoneNumber">OpenPhone Number</Label>
            <Input
              id="openphonePhoneNumber"
              value={openphoneForm.phoneNumber}
              onChange={(e) => setOpenphoneForm({ ...openphoneForm, phoneNumber: e.target.value })}
              placeholder="+1234567890"
              data-testid="input-openphone-phone-number"
            />
            <p className="text-xs text-muted-foreground">The phone number you use in OpenPhone (include country code)</p>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button onClick={handleSaveOpenphone} disabled={isSaving} data-testid="button-save-openphone">
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save & Connect
            </Button>
            {openphoneIsEditing && (
              <Button variant="outline" onClick={() => setOpenphoneIsEditing(false)} data-testid="button-cancel-openphone-edit">
                Cancel
              </Button>
            )}
          </div>
        </div>
      )}

      {!openphoneIsEditing && openphoneIsFullyConfigured && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-muted-foreground text-xs">API Key</Label>
              <p className="font-mono text-sm bg-muted px-3 py-2 rounded-md" data-testid="text-openphone-api-key-masked">
                {maskValue(settings?.openphoneApiKey)}
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-muted-foreground text-xs">Phone Number</Label>
              <p className="font-medium text-sm bg-muted px-3 py-2 rounded-md" data-testid="text-openphone-phone-number">
                {formatPhoneDisplay(settings?.openphonePhoneNumber)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
            <span>SMS messaging active via OpenPhone</span>
          </div>

          <div className="pt-4 border-t flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setOpenphoneIsEditing(true)} data-testid="button-edit-openphone">
                <Pencil className="w-4 h-4 mr-2" /> Edit Settings
              </Button>
              <Button variant="outline" className="text-destructive" onClick={() => setShowDisconnectOpenphone(true)} data-testid="button-disconnect-openphone">
                Disconnect OpenPhone
              </Button>
            </div>
          </div>
        </div>
      )}

      {openphoneHasCredentials && !openphoneIsFullyConfigured && (
        <div className="pt-4 border-t">
          <Button variant="outline" className="text-destructive" onClick={() => setShowDisconnectOpenphone(true)} data-testid="button-disconnect-openphone-partial">
            Disconnect OpenPhone
          </Button>
        </div>
      )}

      <Dialog open={showDisconnectOpenphone} onOpenChange={setShowDisconnectOpenphone}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect OpenPhone?</DialogTitle>
            <DialogDescription>
              This will remove your OpenPhone credentials. You will no longer be able to send SMS messages until you reconnect with a phone provider. Your message history will be preserved.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowDisconnectOpenphone(false)} data-testid="button-cancel-disconnect-openphone">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => disconnectOpenphoneMutation.mutate()}
              disabled={disconnectOpenphoneMutation.isPending}
              data-testid="button-confirm-disconnect-openphone"
            >
              {disconnectOpenphoneMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Yes, Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  return (
    <>
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={() => handleSwitchProvider('twilio')}
            className={`p-4 border rounded-md text-left space-y-3 transition-colors ${currentProvider === 'twilio' ? 'border-primary bg-primary/5' : openphoneConnected ? 'opacity-60 cursor-not-allowed' : ''}`}
            data-testid="button-select-twilio-provider"
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-red-500 flex items-center justify-center">
                  <Phone className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="font-medium text-sm">Twilio</p>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Recommended</Badge>
                </div>
              </div>
              {twilioConnected && (
                <Badge className="bg-green-500 text-[10px]">
                  <CheckCircle className="w-3 h-3 mr-0.5" /> Active
                </Badge>
              )}
              {openphoneConnected && currentProvider !== 'twilio' && (
                <Lock className="w-4 h-4 text-muted-foreground" />
              )}
            </div>
            <ul className="text-xs text-muted-foreground space-y-1.5">
              <li className="flex items-center gap-1.5"><MessageSquare className="w-3 h-3 shrink-0" /> SMS messaging</li>
              <li className="flex items-center gap-1.5"><PhoneCall className="w-3 h-3 shrink-0" /> Browser calling (VoIP)</li>
              <li className="flex items-center gap-1.5"><Radio className="w-3 h-3 shrink-0" /> 2-leg conference calls</li>
              <li className="flex items-center gap-1.5"><Mic className="w-3 h-3 shrink-0" /> Call recording & transcription</li>
              <li className="flex items-center gap-1.5"><Shield className="w-3 h-3 shrink-0" /> IVR & voicemail</li>
            </ul>
          </button>

          <button
            onClick={() => handleSwitchProvider('openphone')}
            className={`p-4 border rounded-md text-left space-y-3 transition-colors ${currentProvider === 'openphone' ? 'border-primary bg-primary/5' : twilioConnected ? 'opacity-60 cursor-not-allowed' : ''}`}
            data-testid="button-select-openphone-provider"
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center">
                  <MessageSquare className="w-4 h-4 text-white" />
                </div>
                <p className="font-medium text-sm">OpenPhone</p>
              </div>
              {openphoneConnected && currentProvider === 'openphone' && (
                <Badge className="bg-green-500 text-[10px]">
                  <CheckCircle className="w-3 h-3 mr-0.5" /> Active
                </Badge>
              )}
              {twilioConnected && currentProvider !== 'openphone' && (
                <Lock className="w-4 h-4 text-muted-foreground" />
              )}
            </div>
            <ul className="text-xs text-muted-foreground space-y-1.5">
              <li className="flex items-center gap-1.5"><MessageSquare className="w-3 h-3 shrink-0" /> SMS messaging</li>
              <li className="flex items-center gap-1.5"><PhoneOff className="w-3 h-3 shrink-0 opacity-40" /> <span className="opacity-60">No browser calling</span></li>
              <li className="flex items-center gap-1.5"><PhoneOff className="w-3 h-3 shrink-0 opacity-40" /> <span className="opacity-60">No conferencing</span></li>
              <li className="flex items-center gap-1.5"><PhoneOff className="w-3 h-3 shrink-0 opacity-40" /> <span className="opacity-60">No call recording</span></li>
              <li className="flex items-center gap-1.5"><PhoneOff className="w-3 h-3 shrink-0 opacity-40" /> <span className="opacity-60">No IVR / voicemail</span></li>
            </ul>
          </button>
        </div>

        <div className="border-t" />

        {currentProvider === 'twilio' ? renderTwilioContent() : renderOpenPhoneContent()}
      </div>
    </>
  );
}

function GoogleCalendarCard({ settings }: { settings: CompanySettings | null | undefined }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const googleConnected = !!settings?.googleEmail;
  const isNative = useIsNativeApp();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const googleStatus = params.get('google');
    if (googleStatus === 'connected') {
      toast({ title: "Google Connected", description: "Your Google Calendar is now linked" });
      queryClient.invalidateQueries({ queryKey: ['/api/settings/company'] });
      window.history.replaceState({}, '', window.location.pathname);
    } else if (googleStatus === 'error') {
      const message = params.get('message') || 'Connection failed';
      toast({ title: "Connection Failed", description: message, variant: "destructive" });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [toast, queryClient]);

  const connectMutation = useMutation({
    mutationFn: async () => {
      const mobileParam = isNative ? '?mobile=1' : '';
      const res = await apiRequest('GET', `/api/google/oauth/start${mobileParam}`);
      const data = await res.json();
      return data.authUrl;
    },
    onSuccess: async (authUrl: string) => {
      if (isNative) {
        try {
          const { Browser } = await import('@capacitor/browser');
          await Browser.open({ url: authUrl, windowName: '_self' });
        } catch {
          window.location.href = authUrl;
        }
      } else {
        window.location.href = authUrl;
      }
    },
    onError: (error: Error) => {
      toast({ title: "Failed to connect", description: error.message || "Could not start Google connection.", variant: "destructive" });
    }
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/google/disconnect');
      if (!res.ok) { const data = await res.json(); throw new Error(data.message || 'Failed to disconnect'); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/settings/company'] });
      toast({ title: "Disconnected", description: "Google account has been disconnected" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to disconnect", description: error.message, variant: "destructive" });
    }
  });

  const [showDisconnect, setShowDisconnect] = useState(false);

  return (
    <>
      <div>
        {googleConnected ? (
          <div className="space-y-4">
            <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
              <div className="flex-1">
                <p className="font-medium" data-testid="text-google-calendar-email">{settings?.googleEmail}</p>
                <p className="text-sm text-muted-foreground">
                  Connected {settings?.googleConnectedAt ? new Date(settings.googleConnectedAt).toLocaleDateString() : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 border rounded-lg">
              <Calendar className="w-5 h-5 text-green-500" />
              <div>
                <p className="font-medium text-sm">Calendar</p>
                <p className="text-xs text-muted-foreground">Appointments synced to Google Calendar</p>
              </div>
            </div>
            <div className="pt-4 border-t">
              <Button variant="outline" onClick={() => setShowDisconnect(true)} data-testid="button-disconnect-google-calendar">
                Disconnect Google Account
              </Button>
            </div>
            <Dialog open={showDisconnect} onOpenChange={setShowDisconnect}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Disconnect Google Account?</DialogTitle>
                  <DialogDescription>
                    Are you sure you want to disconnect your Google account? Your calendar will no longer sync until you reconnect.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter className="gap-2 sm:gap-0">
                  <Button variant="outline" onClick={() => setShowDisconnect(false)}>Cancel</Button>
                  <Button
                    variant="destructive"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); disconnectMutation.mutate(); setShowDisconnect(false); }}
                    disabled={disconnectMutation.isPending}
                    data-testid="button-confirm-disconnect-google-calendar"
                  >
                    {disconnectMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Yes, Disconnect
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Connect your Google account to sync your schedule with Google Calendar.
            </p>
            <div className="flex items-start gap-4 p-4 bg-muted/30 rounded-lg">
              <div className="flex-1 space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>Sync appointments to your Google Calendar</span>
                </div>
              </div>
            </div>
            <Button
              onClick={() => connectMutation.mutate()}
              disabled={connectMutation.isPending}
              data-testid="button-connect-google-calendar"
            >
              {connectMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Connect Google Account
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

export default function Integrations() {
  const { data: settings, isLoading } = useCompanySettings();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { canUseIntegrations, canUsePhone, canUseEmail, canUsePayments, canUseCompanyCam, canUseFinancing, isTrialing, trialDaysLeft, isLoading: subLoading, tier, isAdmin } = useSubscription();
  const isNativeApp = useIsNativeApp();
  const isStarter = tier === 'starter';
  const isCore = tier === 'core';
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const toggleCard = (id: string) => setExpandedCard(prev => prev === id ? null : id);

  const stripeConnected = !!(settings?.stripeAccountId || (settings?.stripePublishableKey && settings?.stripeSecretKey));
  const squareConnected = !!settings?.squareMerchantId;
  const paymentConnected = stripeConnected || squareConnected;
  const emailConnected = !!(settings?.googleEmail || settings?.sendgridConnectedAt);
  const phoneConnected = !!(settings?.twilioAccountSid && settings?.twilioPhoneNumber) || !!(settings?.openphoneApiKey && settings?.openphonePhoneNumber);
  const companyCamConnected = !!settings?.companyCamApiToken;
  const thumbtackConnected = !!settings?.thumbtackBusinessId;
  const facebookLeadsConnected = !!settings?.facebookPageId && !!settings?.facebookPageAccessToken;
  const facebookLeadsPartial = !!settings?.facebookUserToken && !settings?.facebookPageId;
  const zapierConnected = !!settings?.zapierWebhookSecret;
  const googleCalConnected = !!settings?.googleEmail;
  const financingConnected = !!settings?.financingEnabled && !!settings?.financingLink;
  const whiteLabelActive = !!settings?.whiteLabelEnabled;
  const customDomainVerified = !!settings?.customDomainVerified;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const googleStatus = params.get('google');
    const fbStatus = params.get('fb');
    if (googleStatus === 'connected') {
      toast({ title: "Google Connected", description: "Your Google account is now linked" });
      queryClient.invalidateQueries({ queryKey: ['/api/settings/company'] });
      window.history.replaceState({}, '', window.location.pathname);
      setExpandedCard('email');
    } else if (googleStatus === 'error') {
      const message = params.get('message') || 'Connection failed';
      toast({ title: "Connection Failed", description: message, variant: "destructive" });
      window.history.replaceState({}, '', window.location.pathname);
    }
    if (fbStatus === 'select_page' || fbStatus === 'error') {
      setExpandedCard('facebook-leads');
    }
    const stripeStatus = params.get('stripe');
    const squareStatus = params.get('square');
    if (stripeStatus === 'connected' || squareStatus === 'connected') {
      setExpandedCard('payments');
    }
  }, [toast, queryClient]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  if (isStarter) {
    return (
      <div className="max-w-3xl mx-auto p-6 pb-24 lg:p-8 lg:pb-24 space-y-8 animate-in fade-in duration-300">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
            <Settings className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display">Integrations</h1>
            <p className="text-muted-foreground">Connect services to enhance your workflow</p>
          </div>
        </div>

        <IntegrationAccordionItem
          id="email"
          icon={<SiGoogle className="w-4 h-4 text-[#4285F4]" />}
          iconBg="bg-[#4285F4]/10"
          title="Email"
          description={emailConnected ? (settings?.googleEmail ? `Google — ${settings.googleEmail}` : `Connected`) : 'Send emails via your Google account'}
          status={emailConnected ? 'connected' : 'not_connected'}
          isExpanded={expandedCard === 'email'}
          onToggle={toggleCard}
        >
          <EmailIntegrationCard settings={settings} />
        </IntegrationAccordionItem>

        <IntegrationAccordionItem
          id="google-calendar"
          icon={<SiGoogle className="w-4 h-4 text-[#34A853]" />}
          iconBg="bg-[#34A853]/10"
          title="Google Calendar"
          description="Sync appointments with Google Calendar"
          status={googleCalConnected ? 'connected' : 'not_connected'}
          isExpanded={expandedCard === 'google-calendar'}
          onToggle={toggleCard}
        >
          <GoogleCalendarCard settings={settings} />
        </IntegrationAccordionItem>

        <Card className="border-primary/30">
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Lock className="w-5 h-5 text-primary" />
                <div>
                  <p className="font-medium" data-testid="text-more-integrations-locked">
                    {isNativeApp ? "Additional integrations" : "More integrations available on higher plans"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {isNativeApp
                      ? "Additional integrations are available for accounts with expanded access."
                      : "Upgrade to Core for Custom Domain Email & Payments, or Elite for Phone, Text, CompanyCam, Financing, and all integrations."}
                  </p>
                </div>
              </div>
              {!isNativeApp && (
                <Link href="/billing">
                  <Button data-testid="button-upgrade-integrations">View Plans</Button>
                </Link>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6 pb-24 lg:p-8 lg:pb-24 space-y-8 animate-in fade-in duration-300">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
          <Settings className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold font-display">Integrations</h1>
          <p className="text-muted-foreground">Connect third-party services to enhance your CRM</p>
        </div>
      </div>

      {canUsePhone ? (
        <IntegrationAccordionItem
          id="phone"
          icon={<SiTwilio className="w-4 h-4 text-[#F22F46]" />}
          iconBg="bg-[#F22F46]/10"
          title="Phone & Text"
          description={phoneConnected ? (settings?.twilioPhoneNumber || settings?.openphonePhoneNumber || 'Connected') : 'Twilio calls, SMS, voicemail, and conferencing'}
          status={phoneConnected ? 'connected' : 'not_connected'}
          isExpanded={expandedCard === 'phone'}
          onToggle={toggleCard}
        >
          <PhoneTextProviderCard settings={settings} />
        </IntegrationAccordionItem>
      ) : (
        <Card className="border-primary/30">
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Lock className="w-5 h-5 text-primary" />
                <div>
                  <p className="font-medium" data-testid="text-phone-locked">
                    {isNativeApp ? "Phone & Text" : "Phone & Text requires Elite"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {isNativeApp
                      ? "Phone and text integrations are available for accounts with expanded access."
                      : "Upgrade to Elite to connect Twilio for calls, SMS, voicemail, and more."}
                  </p>
                </div>
              </div>
              {!isNativeApp && (
                <Link href="/billing">
                  <Button data-testid="button-upgrade-phone">Upgrade to Elite</Button>
                </Link>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {canUseEmail ? (
        <IntegrationAccordionItem
          id="email"
          icon={<SiGoogle className="w-4 h-4 text-[#4285F4]" />}
          iconBg="bg-[#4285F4]/10"
          title="Email"
          description={emailConnected ? (settings?.googleEmail ? `Google — ${settings.googleEmail}` : `Custom Domain — ${settings?.sendgridDomain || 'Connected'}`) : 'Send emails via Google or Custom Domain'}
          status={emailConnected ? 'connected' : 'not_connected'}
          isExpanded={expandedCard === 'email'}
          onToggle={toggleCard}
        >
          <EmailIntegrationCard settings={settings} />
        </IntegrationAccordionItem>
      ) : (
        <Card className="border-primary/30">
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Lock className="w-5 h-5 text-primary" />
                <div>
                  <p className="font-medium" data-testid="text-email-locked">
                    {isNativeApp ? "Email Integration" : "Email requires Core or higher"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {isNativeApp
                      ? "Email integration for sending proposals and invoices is available for accounts with expanded access."
                      : "Upgrade to connect Gmail or Custom Domain email for sending proposals and invoices."}
                  </p>
                </div>
              </div>
              {!isNativeApp && (
                <Link href="/billing">
                  <Button data-testid="button-upgrade-email">View Plans</Button>
                </Link>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {canUsePayments ? (
        <IntegrationAccordionItem
          id="payments"
          icon={<CreditCard className="w-4 h-4 text-primary" />}
          iconBg="bg-primary/10"
          title="Payment Processing"
          description={paymentConnected ? `via ${stripeConnected ? 'Stripe' : 'Square'}` : 'Stripe or Square'}
          status={paymentConnected ? 'connected' : 'not_connected'}
          isExpanded={expandedCard === 'payments'}
          onToggle={toggleCard}
        >
          <PaymentProcessingCard settings={settings} />
        </IntegrationAccordionItem>
      ) : (
        <Card className="border-primary/30">
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Lock className="w-5 h-5 text-primary" />
                <div>
                  <p className="font-medium" data-testid="text-payments-locked">
                    {isNativeApp ? "Payment Processing" : "Payment processing requires Core or higher"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {isNativeApp
                      ? "Payment processing for accepting customer payments is available for accounts with expanded access."
                      : "Upgrade to connect Stripe or Square for accepting customer payments."}
                  </p>
                </div>
              </div>
              {!isNativeApp && (
                <Link href="/billing">
                  <Button data-testid="button-upgrade-payments">View Plans</Button>
                </Link>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {canUseFinancing ? (
        <IntegrationAccordionItem
          id="financing"
          icon={<Banknote className="w-4 h-4 text-emerald-600" />}
          iconBg="bg-emerald-600/10"
          title="Customer Financing"
          description={financingConnected ? `${settings?.financingProvider || 'Financing'} enabled` : 'Offer payment plans to customers'}
          status={financingConnected ? 'connected' : 'not_connected'}
          isExpanded={expandedCard === 'financing'}
          onToggle={toggleCard}
        >
          <FinancingIntegrationCard settings={settings} />
        </IntegrationAccordionItem>
      ) : (
        <Card className="border-primary/30">
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Lock className="w-5 h-5 text-primary" />
                <div>
                  <p className="font-medium" data-testid="text-financing-locked">
                    {isNativeApp ? "Customer Financing" : "Customer Financing requires Elite"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {isNativeApp
                      ? "Customer financing is available for accounts with expanded access."
                      : "Upgrade to Elite to offer payment plans to your customers via your financing provider."}
                  </p>
                </div>
              </div>
              {!isNativeApp && (
                <Link href="/billing">
                  <Button data-testid="button-upgrade-financing">Upgrade to Elite</Button>
                </Link>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {canUseCompanyCam ? (
        <IntegrationAccordionItem
          id="companycam"
          icon={<svg viewBox="0 0 24 24" className="w-4 h-4" fill="none"><rect x="2" y="6" width="20" height="14" rx="3" fill="#F26522"/><circle cx="12" cy="13" r="4" fill="white"/><circle cx="12" cy="13" r="2.5" fill="#F26522"/><rect x="8" y="3" width="8" height="4" rx="1.5" fill="#F26522"/></svg>}
          iconBg="bg-orange-500/10"
          title="CompanyCam"
          description="Photo documentation for job sites"
          status={companyCamConnected ? 'connected' : 'not_connected'}
          isExpanded={expandedCard === 'companycam'}
          onToggle={toggleCard}
        >
          <CompanyCamIntegrationCard settings={settings} />
        </IntegrationAccordionItem>
      ) : (
        <Card className="border-primary/30">
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Lock className="w-5 h-5 text-primary" />
                <div>
                  <p className="font-medium" data-testid="text-companycam-locked">
                    {isNativeApp ? "CompanyCam" : "CompanyCam requires Elite"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {isNativeApp
                      ? "CompanyCam photo documentation is available for accounts with expanded access."
                      : "Upgrade to Elite to link CompanyCam projects and view job site photos in proposals & invoices."}
                  </p>
                </div>
              </div>
              {!isNativeApp && (
                <Link href="/billing">
                  <Button data-testid="button-upgrade-companycam">Upgrade to Elite</Button>
                </Link>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <IntegrationAccordionItem
        id="google-calendar"
        icon={<SiGoogle className="w-4 h-4 text-[#34A853]" />}
        iconBg="bg-[#34A853]/10"
        title="Google Calendar"
        description="Sync appointments with Google Calendar"
        status={googleCalConnected ? 'connected' : 'not_connected'}
        isExpanded={expandedCard === 'google-calendar'}
        onToggle={toggleCard}
      >
        <GoogleCalendarCard settings={settings} />
      </IntegrationAccordionItem>

      {(!isNativeApp || whiteLabelActive) && (
        <IntegrationAccordionItem
          id="white-label"
          icon={<Globe className="w-4 h-4 text-violet-500" />}
          iconBg="bg-violet-500/10"
          title="Make It Your Own"
          description={whiteLabelActive ? (customDomainVerified ? `Portal: ${settings?.customDomain}` : 'Your branded portal + remove branding') : `Your branded portal + remove branding — ${PRICE_LABELS.makeItYourOwnMonthly}/mo (Limited Time)`}
          status={whiteLabelActive ? (customDomainVerified ? 'connected' : 'partial') : 'not_connected'}
          isExpanded={expandedCard === 'white-label'}
          onToggle={toggleCard}
        >
          <WhiteLabelIntegrationCard settings={settings} />
        </IntegrationAccordionItem>
      )}

      {canUsePhone ? (
        <>
          <IntegrationAccordionItem
            id="thumbtack"
            icon={<SiThumbtack className="w-4 h-4 text-[#009FD9]" />}
            iconBg="bg-[#009FD9]/10"
            title="Thumbtack"
            description="Import leads from Thumbtack"
            status={thumbtackConnected ? 'connected' : 'not_connected'}
            isExpanded={expandedCard === 'thumbtack'}
            onToggle={toggleCard}
          >
            <ThumbtackIntegrationCard settings={settings} />
          </IntegrationAccordionItem>
          <IntegrationAccordionItem
            id="facebook-leads"
            icon={<SiFacebook className="w-4 h-4 text-[#1877F2]" />}
            iconBg="bg-[#1877F2]/10"
            title="Facebook Lead Ads"
            description={facebookLeadsConnected ? `Connected to ${settings?.facebookPageName || 'your page'}` : 'Auto-import leads from Facebook & Instagram'}
            status={facebookLeadsConnected ? 'receiving' : facebookLeadsPartial ? 'partial' : 'not_connected'}
            isExpanded={expandedCard === 'facebook-leads'}
            onToggle={toggleCard}
          >
            <FacebookLeadAdsCard settings={settings} isAdmin={isAdmin} />
          </IntegrationAccordionItem>
          <IntegrationAccordionItem
            id="zapier"
            icon={<SiZapier className="w-4 h-4 text-[#FF4A00]" />}
            iconBg="bg-[#FF4A00]/10"
            title="Zapier"
            description="Automate workflows with 5,000+ apps"
            status={zapierConnected ? 'connected' : 'not_connected'}
            isExpanded={expandedCard === 'zapier'}
            onToggle={toggleCard}
          >
            <ZapierIntegrationCard settings={settings} />
          </IntegrationAccordionItem>
        </>
      ) : (
        <Card className="border-primary/30">
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Lock className="w-5 h-5 text-primary" />
                <div>
                  <p className="font-medium" data-testid="text-more-integrations-elite">
                    {isNativeApp ? "Additional integrations" : "More integrations on Elite"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {isNativeApp
                      ? "Additional integrations including Thumbtack, Facebook Lead Ads, and Zapier are available for accounts with expanded access."
                      : "Upgrade to Elite for Thumbtack, Facebook Lead Ads, Zapier automation, and all integrations."}
                  </p>
                </div>
              </div>
              {!isNativeApp && (
                <Link href="/billing">
                  <Button data-testid="button-upgrade-more">Upgrade to Elite</Button>
                </Link>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
