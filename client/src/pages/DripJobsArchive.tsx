import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { formatPhoneDisplay } from "@/lib/utils";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Search, FileText, Download, CheckCircle2, Circle, Plus, Trash2, Loader2, Mail, KeyRound, LogOut, Settings, Send, Copy, Eye, EyeOff } from "lucide-react";

interface ArchiveEntry {
  csvLine: number;
  fullName: string;
  phone: string;
  email: string;
  jobName: string;
  proposalId: string;
  invoiceId: string;
  invoiceStatus: string;
  amount: string;
  contactId: number;
  projectId: number | null;
  projectTitle: string | null;
  hasProposalPdf: boolean;
  hasInvoicePdf: boolean;
  completed: boolean;
}

const ARCHIVE_TOKEN_KEY = 'dripjobs_archive_token';

function getStoredToken(): string | null {
  return localStorage.getItem(ARCHIVE_TOKEN_KEY);
}

function setStoredToken(token: string) {
  localStorage.setItem(ARCHIVE_TOKEN_KEY, token);
}

function clearStoredToken() {
  localStorage.removeItem(ARCHIVE_TOKEN_KEY);
}

async function archiveFetch(url: string, options: RequestInit = {}) {
  const token = getStoredToken();
  const headers: Record<string, string> = { ...(options.headers as Record<string, string> || {}) };
  if (token) headers['x-archive-token'] = token;
  return fetch(url, { ...options, headers, credentials: 'include' });
}

function ArchiveLogin({ onAuthenticated }: { onAuthenticated: () => void }) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [sending, setSending] = useState(false);

  async function handleSendOtp() {
    if (!email.trim()) return;
    setSending(true);
    try {
      const res = await fetch('/api/archive/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setStep("code");
        toast({ title: "Code sent!", description: "Check your email for the access code." });
      } else {
        toast({ title: "Error", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to send code.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  }

  async function handleVerifyOtp() {
    if (!code.trim()) return;
    setSending(true);
    try {
      const res = await fetch('/api/archive/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), code: code.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.token) {
        setStoredToken(data.token);
        onAuthenticated();
      } else {
        toast({ title: "Invalid code", description: data.error || "Try again.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Verification failed.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background" data-testid="archive-login">
      <Card className="w-full max-w-sm">
        <CardContent className="p-6 space-y-4">
          <div className="text-center mb-4">
            <h1 className="text-xl font-bold" data-testid="text-login-title">DripJobs Archive</h1>
            <p className="text-sm text-muted-foreground mt-1">Enter your email to access the archive portal.</p>
          </div>

          {step === "email" ? (
            <>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder="Your email address"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="pl-9"
                  onKeyDown={e => e.key === 'Enter' && handleSendOtp()}
                  data-testid="input-login-email"
                />
              </div>
              <Button className="w-full" onClick={handleSendOtp} disabled={sending || !email.trim()} data-testid="button-send-code">
                {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}
                Send Access Code
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-center text-muted-foreground">Code sent to <strong>{email}</strong></p>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Enter 6-character code"
                  value={code}
                  onChange={e => setCode(e.target.value.toUpperCase())}
                  className="pl-9 text-center tracking-widest font-mono text-lg"
                  maxLength={6}
                  onKeyDown={e => e.key === 'Enter' && handleVerifyOtp()}
                  data-testid="input-login-code"
                />
              </div>
              <Button className="w-full" onClick={handleVerifyOtp} disabled={sending || code.length < 6} data-testid="button-verify-code">
                {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <KeyRound className="w-4 h-4 mr-2" />}
                Verify & Access
              </Button>
              <Button variant="ghost" size="sm" className="w-full" onClick={() => { setStep("email"); setCode(""); }}>
                Back
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function OwnerSettings() {
  const { toast } = useToast();
  const [emails, setEmails] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [djEmail, setDjEmail] = useState("");
  const [djPassword, setDjPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [sendDialogEmail, setSendDialogEmail] = useState<string | null>(null);
  const [customMessage, setCustomMessage] = useState("");
  const [portalUrl, setPortalUrl] = useState(`${window.location.origin}/admin/dripjobs-archive`);

  const defaultMessage = `You've been granted access to the DripJobs Document Archive. Use the button below to log in with your email — you'll receive a one-time code to verify.\n\nOnce logged in, find a contact, open their DripJobs page, copy the proposal/invoice PDF URL, and paste it in the archive to download and store the document.`;

  useEffect(() => {
    fetch('/api/archive/get-emails', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        setEmails(d.emails || []);
        setDjEmail(d.dripjobsEmail || "");
        setDjPassword(d.dripjobsPassword || "");
        if (d.portalUrl) setPortalUrl(d.portalUrl);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const saveMutation = useMutation({
    mutationFn: async (updatedEmails: string[]) => {
      await apiRequest("POST", "/api/archive/set-emails", { emails: updatedEmails });
    },
    onSuccess: () => toast({ title: "Saved", description: "Freelancer access updated." }),
    onError: () => toast({ title: "Error", description: "Failed to save.", variant: "destructive" }),
  });

  const saveCredsMutation = useMutation({
    mutationFn: async (creds: { dripjobsEmail: string; dripjobsPassword: string }) => {
      await apiRequest("POST", "/api/archive/set-credentials", creds);
    },
    onSuccess: () => toast({ title: "Saved", description: "DripJobs credentials updated." }),
    onError: () => toast({ title: "Error", description: "Failed to save credentials.", variant: "destructive" }),
  });

  const sendEmailMutation = useMutation({
    mutationFn: async ({ toEmail, message }: { toEmail: string; message: string }) => {
      setSendingTo(toEmail);
      const res = await apiRequest("POST", "/api/archive/send-invite", {
        toEmail,
        customMessage: message.trim() || undefined,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setSendingTo(null);
      setSendDialogEmail(null);
      if (data.success) {
        toast({ title: "Email sent!", description: `Invite sent to ${data.toEmail}` });
      } else {
        toast({ title: "Failed", description: data.error || "Could not send email.", variant: "destructive" });
      }
    },
    onError: () => {
      setSendingTo(null);
      toast({ title: "Error", description: "Failed to send email.", variant: "destructive" });
    },
  });

  function handleAdd() {
    const trimmed = newEmail.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) return;
    if (emails.includes(trimmed)) {
      toast({ title: "Already added", description: "This email is already in the list.", variant: "destructive" });
      return;
    }
    const updated = [...emails, trimmed];
    setEmails(updated);
    setNewEmail("");
    saveMutation.mutate(updated);
  }

  function handleRemove(idx: number) {
    const updated = emails.filter((_, i) => i !== idx);
    setEmails(updated);
    saveMutation.mutate(updated);
  }

  function handleEditSave(idx: number) {
    const trimmed = editValue.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) return;
    const updated = [...emails];
    updated[idx] = trimmed;
    setEmails(updated);
    setEditingIdx(null);
    setEditValue("");
    saveMutation.mutate(updated);
  }

  function handleSaveCredentials() {
    saveCredsMutation.mutate({ dripjobsEmail: djEmail.trim(), dripjobsPassword: djPassword });
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      toast({ title: "Copied!", description: "URL copied to clipboard." });
    });
  }

  if (!loaded) return null;

  return (
    <Card className="mb-4 border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-800" data-testid="owner-settings">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-medium text-blue-800 dark:text-blue-300">Freelancer Access</span>
          <Badge variant="outline" className="text-[10px] ml-auto">{emails.length} authorized</Badge>
        </div>

        {emails.length > 0 && (
          <div className="space-y-2">
            {emails.map((em, idx) => (
              <div key={idx} className="flex items-center gap-2" data-testid={`freelancer-email-${idx}`}>
                {editingIdx === idx ? (
                  <>
                    <Input
                      type="email"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      className="text-sm flex-1"
                      onKeyDown={e => e.key === 'Enter' && handleEditSave(idx)}
                      autoFocus
                      data-testid={`input-edit-email-${idx}`}
                    />
                    <Button size="sm" variant="default" onClick={() => handleEditSave(idx)} data-testid={`button-save-edit-${idx}`}>
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setEditingIdx(null); setEditValue(""); }}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-sm flex-1 truncate">{em}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-blue-600 hover:text-blue-800"
                      onClick={() => { setSendDialogEmail(em); setCustomMessage(defaultMessage); }}
                      disabled={sendEmailMutation.isPending}
                      data-testid={`button-send-email-${idx}`}
                    >
                      {sendingTo === em ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => { setEditingIdx(idx); setEditValue(em); }} data-testid={`button-edit-email-${idx}`}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-red-500 hover:text-red-700" onClick={() => handleRemove(idx)} data-testid={`button-remove-email-${idx}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <Input
            type="email"
            placeholder="Add freelancer email..."
            value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
            className="text-sm"
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            data-testid="input-add-freelancer-email"
          />
          <Button size="sm" onClick={handleAdd} disabled={saveMutation.isPending || !newEmail.trim()} data-testid="button-add-email">
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-3.5 h-3.5 mr-1" /> Add</>}
          </Button>
        </div>

        <div className="border-t pt-3 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <KeyRound className="w-3.5 h-3.5 text-blue-600" />
            <span className="text-xs font-medium text-blue-800 dark:text-blue-300">DripJobs Login Credentials</span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Freelancers will see these credentials in the portal after logging in.
          </p>
          <Input
            type="email"
            placeholder="DripJobs email..."
            value={djEmail}
            onChange={e => setDjEmail(e.target.value)}
            className="text-sm"
            data-testid="input-dripjobs-email"
          />
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="DripJobs password..."
                value={djPassword}
                onChange={e => setDjPassword(e.target.value)}
                className="text-sm pr-9"
                data-testid="input-dripjobs-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                data-testid="button-toggle-password"
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            <Button size="sm" onClick={handleSaveCredentials} disabled={saveCredsMutation.isPending} data-testid="button-save-credentials">
              {saveCredsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
            </Button>
          </div>
        </div>

        <div className="border-t pt-3">
          <p className="text-xs text-muted-foreground mb-1.5">
            Portal URL — freelancers log in here with OTP.
          </p>
          <div className="flex items-center gap-2 bg-muted/50 rounded px-2.5 py-1.5">
            <code className="text-[11px] text-muted-foreground flex-1 truncate" data-testid="text-portal-url">
              {portalUrl}
            </code>
            <button
              type="button"
              onClick={() => copyToClipboard(portalUrl)}
              className="text-muted-foreground hover:text-foreground shrink-0"
              data-testid="button-copy-url"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </CardContent>

      <Dialog open={!!sendDialogEmail} onOpenChange={open => !open && setSendDialogEmail(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base" data-testid="text-send-dialog-title">
              Send Invite to {sendDialogEmail}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Message</label>
              <Textarea
                value={customMessage}
                onChange={e => setCustomMessage(e.target.value)}
                rows={6}
                className="text-sm"
                placeholder="Write your message to the freelancer..."
                data-testid="textarea-custom-message"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                The portal link, DripJobs credentials, and step-by-step instructions are included automatically.
              </p>
            </div>

            {(djEmail || djPassword) && (
              <div className="bg-muted/50 rounded-lg p-3 text-xs space-y-1">
                <p className="font-medium text-muted-foreground">Will include:</p>
                {djEmail && <p>DripJobs Email: <span className="font-medium text-foreground">{djEmail}</span></p>}
                {djPassword && <p>DripJobs Password: <span className="font-medium text-foreground">••••••</span></p>}
                <p>Portal URL: <span className="font-medium text-foreground truncate">{portalUrl}</span></p>
              </div>
            )}

            <Button
              className="w-full"
              onClick={() => sendDialogEmail && sendEmailMutation.mutate({ toEmail: sendDialogEmail, message: customMessage })}
              disabled={sendEmailMutation.isPending}
              data-testid="button-confirm-send"
            >
              {sendEmailMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending...</>
              ) : (
                <><Send className="w-4 h-4 mr-2" /> Send Email</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export function DripJobsArchiveOwner() {
  return <DripJobsArchive ownerMode />;
}

export default function DripJobsArchive({ ownerMode = false }: { ownerMode?: boolean }) {
  const { toast } = useToast();
  const [authState, setAuthState] = useState<{ checking: boolean; authenticated: boolean; isOwner: boolean }>(
    ownerMode
      ? { checking: false, authenticated: true, isOwner: true }
      : { checking: true, authenticated: false, isOwner: false }
  );
  const [search, setSearch] = useState("");
  const [selectedEntry, setSelectedEntry] = useState<ArchiveEntry | null>(null);
  const [proposalUrls, setProposalUrls] = useState<string[]>([""]);
  const [invoiceUrls, setInvoiceUrls] = useState<string[]>([""]);
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState<"all" | "pending" | "done">("pending");

  async function doFetch(url: string, options: RequestInit = {}) {
    if (ownerMode) {
      return fetch(url, { ...options, credentials: 'include' });
    }
    return archiveFetch(url, options);
  }

  useEffect(() => {
    if (!ownerMode) checkAuth();
  }, [ownerMode]);

  async function checkAuth() {
    try {
      const res = await archiveFetch('/api/archive/auth-status');
      const data = await res.json();
      setAuthState({ checking: false, authenticated: data.authenticated, isOwner: data.isOwner || false });
    } catch {
      setAuthState({ checking: false, authenticated: false, isOwner: false });
    }
  }

  async function handleLogout() {
    await archiveFetch('/api/archive/logout', { method: 'POST' });
    clearStoredToken();
    setAuthState({ checking: false, authenticated: false, isOwner: false });
  }

  const [showDjPassword, setShowDjPassword] = useState(false);

  const { data: djCreds } = useQuery<{ email: string; password: string }>({
    queryKey: ["/api/admin/dripjobs-archive/credentials"],
    enabled: authState.authenticated && !authState.isOwner,
    queryFn: async () => {
      const res = await doFetch('/api/admin/dripjobs-archive/credentials');
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    retry: false,
  });

  const { data, isLoading } = useQuery<{ entries: ArchiveEntry[]; totalDone: number; totalEntries: number }>({
    queryKey: ["/api/admin/dripjobs-archive/contacts"],
    enabled: authState.authenticated,
    queryFn: async () => {
      const res = await doFetch('/api/admin/dripjobs-archive/contacts');
      if (res.status === 401) {
        if (!ownerMode) {
          clearStoredToken();
          setAuthState({ checking: false, authenticated: false, isOwner: false });
        }
        throw new Error('Session expired');
      }
      if (!res.ok) throw new Error('Failed to load data');
      return res.json();
    },
    retry: false,
  });

  const entries = data?.entries || [];
  const filtered = entries.filter(e => {
    const matchesSearch = !search ||
      e.fullName.toLowerCase().includes(search.toLowerCase()) ||
      e.jobName.toLowerCase().includes(search.toLowerCase()) ||
      e.phone.includes(search);
    const matchesFilter = filter === "all" ||
      (filter === "pending" && !e.completed) ||
      (filter === "done" && e.completed);
    return matchesSearch && matchesFilter;
  });

  function openEntry(entry: ArchiveEntry) {
    setSelectedEntry(entry);
    setProposalUrls([""]);
    setInvoiceUrls([""]);
  }

  async function handleSubmit() {
    if (!selectedEntry?.projectId) {
      toast({ title: "No project linked", description: "This contact doesn't have a DripJobs project yet. Run the import first.", variant: "destructive" });
      return;
    }

    const validProposals = proposalUrls.filter(u => u.trim());
    const validInvoices = invoiceUrls.filter(u => u.trim());

    if (validProposals.length === 0 && validInvoices.length === 0) {
      toast({ title: "No URLs provided", description: "Add at least one proposal or invoice URL.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const res = await doFetch("/api/admin/dripjobs-archive/download", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedEntry.projectId,
          proposalUrls: validProposals,
          invoiceUrls: validInvoices,
        }),
      });
      if (res.status === 401) {
        if (!ownerMode) {
          clearStoredToken();
          setAuthState({ checking: false, authenticated: false, isOwner: false });
        }
        toast({ title: "Session expired", description: "Please log in again.", variant: "destructive" });
        return;
      }
      const result = await res.json();
      if (result.success) {
        toast({ title: "Documents saved!", description: `${result.downloaded} file(s) downloaded and stored.` });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/dripjobs-archive/contacts"] });
        setSelectedEntry(null);
      } else {
        toast({ title: "Error", description: result.error, variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  if (authState.checking) {
    return (
      <div className={`flex items-center justify-center ${ownerMode ? 'min-h-[50vh]' : 'min-h-screen'}`} data-testid="loading-auth">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!authState.authenticated) {
    return <ArchiveLogin onAuthenticated={() => checkAuth()} />;
  }

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center ${ownerMode ? 'min-h-[50vh]' : 'min-h-screen'}`} data-testid="loading-archive">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6" data-testid="dripjobs-archive-page">
      {authState.isOwner && <OwnerSettings />}

      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold mb-1" data-testid="text-page-title">DripJobs Document Archive</h1>
            <p className="text-muted-foreground text-sm">
              Download proposals and invoices from DripJobs and store them in FusePhone.
            </p>
          </div>
          {!authState.isOwner && (
            <Button variant="outline" size="sm" onClick={handleLogout} data-testid="button-logout">
              <LogOut className="w-4 h-4 mr-1" /> Log out
            </Button>
          )}
        </div>
        <div className="flex gap-3 mt-3">
          <Badge variant="outline" className="text-sm" data-testid="badge-progress">
            {data?.totalDone || 0} / {data?.totalEntries || 0} completed
          </Badge>
        </div>
      </div>

      {!authState.isOwner && djCreds && (djCreds.email || djCreds.password) && (
        <Card className="mb-4 border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-800" data-testid="card-dripjobs-credentials">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <KeyRound className="w-4 h-4 text-blue-600" />
              <span className="font-semibold text-sm text-blue-900 dark:text-blue-200">DripJobs Login Credentials</span>
            </div>
            <div className="space-y-1.5 text-sm">
              {djCreds.email && (
                <div className="flex items-center gap-2" data-testid="text-dj-email">
                  <span className="text-muted-foreground w-16">Email:</span>
                  <span className="font-medium">{djCreds.email}</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { navigator.clipboard.writeText(djCreds.email); }} data-testid="button-copy-dj-email">
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
              )}
              {djCreds.password && (
                <div className="flex items-center gap-2" data-testid="text-dj-password">
                  <span className="text-muted-foreground w-16">Password:</span>
                  <span className="font-medium font-mono">{showDjPassword ? djCreds.password : '••••••••'}</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowDjPassword(!showDjPassword)} data-testid="button-toggle-dj-password">
                    {showDjPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { navigator.clipboard.writeText(djCreds.password); }} data-testid="button-copy-dj-password">
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, job, or phone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search"
          />
        </div>
        <div className="flex gap-1">
          {(["pending", "done", "all"] as const).map(f => (
            <Button
              key={f}
              variant={filter === f ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(f)}
              data-testid={`button-filter-${f}`}
            >
              {f === "pending" ? "Pending" : f === "done" ? "Done" : "All"}
            </Button>
          ))}
        </div>
      </div>

      <div className="text-sm text-muted-foreground mb-2" data-testid="text-result-count">
        Showing {filtered.length} entries
      </div>

      <div className="space-y-2">
        {filtered.map((entry, idx) => (
          <Card
            key={`${entry.csvLine}-${idx}`}
            className={`cursor-pointer hover:shadow-md transition-shadow ${entry.completed ? "opacity-60" : ""}`}
            onClick={() => openEntry(entry)}
            data-testid={`card-entry-${entry.csvLine}`}
          >
            <CardContent className="p-4 flex items-center gap-3">
              {entry.completed ? (
                <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
              ) : (
                <Circle className="w-5 h-5 text-muted-foreground shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate" data-testid={`text-name-${entry.csvLine}`}>{entry.fullName}</div>
                <div className="text-sm text-muted-foreground truncate">{entry.jobName}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-medium text-sm" data-testid={`text-amount-${entry.csvLine}`}>{entry.amount}</div>
                <div className="flex gap-1 mt-1">
                  {entry.hasProposalPdf ? (
                    <Badge variant="default" className="text-[10px] px-1.5 py-0 bg-green-600">P</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">P</Badge>
                  )}
                  {entry.hasInvoicePdf ? (
                    <Badge variant="default" className="text-[10px] px-1.5 py-0 bg-green-600">I</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">I</Badge>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!selectedEntry} onOpenChange={open => !open && setSelectedEntry(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg" data-testid="text-modal-title">{selectedEntry?.fullName}</DialogTitle>
          </DialogHeader>
          {selectedEntry && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
                <div><span className="font-medium">Job:</span> {selectedEntry.jobName}</div>
                <div><span className="font-medium">Amount:</span> {selectedEntry.amount}</div>
                <div><span className="font-medium">Phone:</span> {formatPhoneDisplay(selectedEntry.phone)}</div>
                <div><span className="font-medium">DripJobs Proposal:</span> #{selectedEntry.proposalId}</div>
                <div><span className="font-medium">DripJobs Invoice:</span> #{selectedEntry.invoiceId}</div>
                {selectedEntry.projectId && (
                  <div><span className="font-medium">FusePhone Project:</span> #{selectedEntry.projectId}</div>
                )}
                {!selectedEntry.projectId && (
                  <div className="text-red-500 font-medium">No FusePhone project linked — run import first</div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium flex items-center gap-1.5">
                    <FileText className="w-4 h-4" /> Proposal URLs
                    {selectedEntry.hasProposalPdf && <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
                  </label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setProposalUrls([...proposalUrls, ""])}
                    data-testid="button-add-proposal-url"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add
                  </Button>
                </div>
                {proposalUrls.map((url, i) => (
                  <div key={i} className="flex gap-2 mb-2">
                    <Input
                      placeholder="Paste DripJobs proposal URL..."
                      value={url}
                      onChange={e => {
                        const updated = [...proposalUrls];
                        updated[i] = e.target.value;
                        setProposalUrls(updated);
                      }}
                      className="text-sm"
                      data-testid={`input-proposal-url-${i}`}
                    />
                    {proposalUrls.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setProposalUrls(proposalUrls.filter((_, idx) => idx !== i))}
                      >
                        <Trash2 className="w-4 h-4 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium flex items-center gap-1.5">
                    <FileText className="w-4 h-4" /> Invoice URLs
                    {selectedEntry.hasInvoicePdf && <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
                  </label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setInvoiceUrls([...invoiceUrls, ""])}
                    data-testid="button-add-invoice-url"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add
                  </Button>
                </div>
                {invoiceUrls.map((url, i) => (
                  <div key={i} className="flex gap-2 mb-2">
                    <Input
                      placeholder="Paste DripJobs invoice URL..."
                      value={url}
                      onChange={e => {
                        const updated = [...invoiceUrls];
                        updated[i] = e.target.value;
                        setInvoiceUrls(updated);
                      }}
                      className="text-sm"
                      data-testid={`input-invoice-url-${i}`}
                    />
                    {invoiceUrls.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setInvoiceUrls(invoiceUrls.filter((_, idx) => idx !== i))}
                      >
                        <Trash2 className="w-4 h-4 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              <div className="text-xs text-muted-foreground bg-muted/30 rounded p-2">
                <strong>Accepted URL formats:</strong>
                <ul className="list-disc ml-4 mt-1 space-y-0.5">
                  <li>Customer portal proposals tab: <code className="text-[10px]">app.dripjobs.com/customerportal/proposals?customerId=...</code></li>
                  <li>Direct proposal: <code className="text-[10px]">app.dripjobs.com/customerportal/proposals/proposal/...</code></li>
                  <li>Customer portal invoices tab: <code className="text-[10px]">app.dripjobs.com/customerportal/invoices?customerId=...</code></li>
                  <li>Direct invoice: <code className="text-[10px]">app.dripjobs.com/customerportal/paybill/invoice/...</code></li>
                  <li>Direct PDF: <code className="text-[10px]">app.dripjobs.com/pdf/quote/... or /pdf/invoice/...</code></li>
                </ul>
              </div>

              <Button
                className="w-full"
                onClick={handleSubmit}
                disabled={submitting || !selectedEntry.projectId}
                data-testid="button-submit-download"
              >
                {submitting ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Downloading & Storing...</>
                ) : (
                  <><Download className="w-4 h-4 mr-2" /> Download & Store Documents</>
                )}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
