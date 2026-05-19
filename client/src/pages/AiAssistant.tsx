import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useSubscription } from "@/hooks/use-subscription";
import { useIsIOSApp } from "@/hooks/use-ios-app";
import {
  Loader2,
  Phone,
  PhoneIncoming,
  UserPlus,
  FileText,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Bot,
  Crown,
  Clock,
  TrendingUp,
  Shield,
  ShieldCheck,
  Mic,
  Bell,
  Save,
  User,
  Headphones,
  BookOpen,
  Volume2,
  Scale,
  Info,
  Play,
  Square,
  MessageSquare,
} from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { Switch } from "@/components/ui/switch";
import { useSearch } from "wouter";
import { FeatureTipBanner } from "@/components/FeatureTipBanner";
import { Progress } from "@/components/ui/progress";

const AI_ASSISTANT_FEATURES = [
  {
    icon: PhoneIncoming,
    title: "AI Call Answering",
    description: "Your AI receptionist answers every call professionally, greeting customers by your company name and understanding what they need.",
  },
  {
    icon: UserPlus,
    title: "Automatic Lead Capture",
    description: "When a caller wants an estimate, AI collects their name, phone, address, and job description — then creates the lead in your CRM automatically.",
  },
  {
    icon: Phone,
    title: "Smart Call Routing",
    description: "AI tries your office first. If you're busy on a ladder, it takes over seamlessly — no missed opportunities.",
  },
  {
    icon: FileText,
    title: "Call Transcripts",
    description: "Every call is recorded and transcribed. Get a quick summary or read the full transcript — searchable and saved to each project.",
  },
  {
    icon: Bell,
    title: "Instant Notifications",
    description: "Get push notifications the moment AI captures a new lead or takes a message, so you can follow up fast.",
  },
  {
    icon: Shield,
    title: "Never Miss a Lead",
    description: "Whether you're painting, driving, or in a meeting — every call gets answered, every opportunity gets captured.",
  },
];

const AI_ASSISTANT_PRICE_MONTHLY = 7999;

function UsageMeter({ usage, hideOveragePricing }: { usage: { minutesUsed: number; minutesIncluded: number; callCount: number; leadsCaptured: number; periodEnd: string }; hideOveragePricing?: boolean }) {
  const pct = Math.min(100, (usage.minutesUsed / usage.minutesIncluded) * 100);
  const remaining = Math.max(0, usage.minutesIncluded - usage.minutesUsed);

  return (
    <Card data-testid="card-ai-assistant-usage">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="w-5 h-5 text-blue-600" />
          Usage This Period
        </CardTitle>
        <CardDescription>
          Resets {new Date(usage.periodEnd).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Minutes Used</span>
            <span className="font-semibold tabular-nums">{Math.round(usage.minutesUsed)} / {usage.minutesIncluded}</span>
          </div>
          <Progress value={pct} className="h-2" data-testid="progress-minutes-used" />
          <p className="text-xs text-muted-foreground">{Math.round(remaining)} minutes remaining</p>
        </div>
        <div className="grid grid-cols-2 gap-4 pt-2">
          <div className="text-center p-3 rounded-md bg-muted/50">
            <p className="text-2xl font-bold tabular-nums" data-testid="text-call-count">{usage.callCount}</p>
            <p className="text-xs text-muted-foreground">Calls Handled</p>
          </div>
          <div className="text-center p-3 rounded-md bg-muted/50">
            <p className="text-2xl font-bold tabular-nums" data-testid="text-leads-captured">{usage.leadsCaptured}</p>
            <p className="text-xs text-muted-foreground">Leads Captured</p>
          </div>
        </div>
        {usage.minutesUsed >= usage.minutesIncluded && (
          <div className="flex items-center gap-2 p-3 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <p className="text-xs text-amber-800 dark:text-amber-300">
              {hideOveragePricing
                ? "You've used all included minutes for this period."
                : "You've used all included minutes. Additional minutes are $0.14 each."}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const RECOMMENDED_VOICES = [
  { value: "marin", label: "Marin", description: "Professional & polished", gender: "Female", liveOnly: true },
  { value: "sage", label: "Sage", description: "Calm & confident", gender: "Female", liveOnly: false },
  { value: "cedar", label: "Cedar", description: "Natural & conversational", gender: "Male", liveOnly: true },
  { value: "verse", label: "Verse", description: "Articulate & clear", gender: "Male", liveOnly: true },
];

const OTHER_VOICES = [
  { value: "shimmer", label: "Shimmer", description: "Warm & friendly", gender: "Female", liveOnly: false },
  { value: "echo", label: "Echo", description: "Warm & engaging", gender: "Male", liveOnly: false },
  { value: "alloy", label: "Alloy", description: "Balanced & versatile", gender: "Neutral", liveOnly: false },
];

function AiAssistantSettings() {
  const { toast } = useToast();
  const { data: settings, isLoading } = useQuery<any>({
    queryKey: ["/api/ai-assistant/settings"],
  });
  const [name, setName] = useState("");
  const [voice, setVoice] = useState("sage");
  const [mode, setMode] = useState("receptionist");
  const [disclosureEnabled, setDisclosureEnabled] = useState(true);
  const [followUpSmsEnabled, setFollowUpSmsEnabled] = useState(true);
  const [followUpSmsMessage, setFollowUpSmsMessage] = useState("");
  useEffect(() => {
    if (settings) {
      setName(settings.aiAssistantName || "");
      setVoice(settings.aiAssistantVoice || "sage");
      setMode(settings.aiAssistantMode || "receptionist");
      setDisclosureEnabled(settings.aiCallDisclosureEnabled !== false);
      setFollowUpSmsEnabled(settings.aiFollowUpSmsEnabled !== false);
      setFollowUpSmsMessage(settings.aiFollowUpSmsMessage || "");
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", "/api/ai-assistant/settings", {
        aiAssistantName: name || null,
        aiAssistantVoice: voice,
        aiAssistantMode: mode,
        aiCallDisclosureEnabled: disclosureEnabled,
        aiFollowUpSmsEnabled: followUpSmsEnabled,
        aiFollowUpSmsMessage: followUpSmsMessage || null,
      });
    },
    onSuccess: () => {
      toast({ title: "Settings saved", description: "Your AI assistant settings have been updated." });
      queryClient.invalidateQueries({ queryKey: ["/api/ai-assistant/settings"] });
    },
    onError: (error: any) => {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card data-testid="card-ai-assistant-mode">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-600" />
            Assistant Mode
          </CardTitle>
          <CardDescription>Choose how much your AI assistant can help callers</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <button
            type="button"
            onClick={() => setMode("receptionist")}
            className={`w-full flex items-start gap-4 p-4 rounded-lg border-2 transition-colors text-left ${
              mode === "receptionist"
                ? "border-blue-600 bg-blue-50 dark:bg-blue-950/30"
                : "border-border hover:border-blue-300 dark:hover:border-blue-700"
            }`}
            data-testid="button-mode-receptionist"
          >
            <Headphones className={`w-6 h-6 mt-0.5 flex-shrink-0 ${mode === "receptionist" ? "text-blue-600" : "text-muted-foreground"}`} />
            <div>
              <div className="font-medium text-sm">Basic Receptionist</div>
              <p className="text-xs text-muted-foreground mt-1">
                Takes messages and captures leads with a warm, human touch. Collects caller name, address, and what they need — then your team follows up. No call transfers, no account info shared.
              </p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setMode("full_context")}
            className={`w-full flex items-start gap-4 p-4 rounded-lg border-2 transition-colors text-left ${
              mode === "full_context"
                ? "border-blue-600 bg-blue-50 dark:bg-blue-950/30"
                : "border-border hover:border-blue-300 dark:hover:border-blue-700"
            }`}
            data-testid="button-mode-full-context"
          >
            <BookOpen className={`w-6 h-6 mt-0.5 flex-shrink-0 ${mode === "full_context" ? "text-blue-600" : "text-muted-foreground"}`} />
            <div>
              <div className="font-medium text-sm">Full AI Assistant</div>
              <p className="text-xs text-muted-foreground mt-1">
                Everything in Basic, plus can transfer calls to the office, answer questions about projects, proposals, invoices, and appointments. Verifies caller identity before sharing details.
              </p>
              <div className="flex items-center gap-1.5 mt-2">
                <ShieldCheck className="w-3.5 h-3.5 text-green-600" />
                <span className="text-xs text-green-700 dark:text-green-500">Caller must say their name to verify identity before any details are shared</span>
              </div>
            </div>
          </button>
        </CardContent>
      </Card>

      <Card data-testid="card-ai-assistant-settings">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <User className="w-5 h-5 text-blue-600" />
            Assistant Personality
          </CardTitle>
          <CardDescription>Customize how your AI assistant sounds and introduces itself on calls</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="assistant-name">Assistant Name</Label>
            <Input
              id="assistant-name"
              placeholder="e.g. Sarah, Jessica, Mike (leave blank for no name)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="input-assistant-name"
            />
            <p className="text-xs text-muted-foreground">
              {name ? `Will greet callers as: "Hey, thanks for calling [your company], this is ${name}!"` : `Will greet callers as: "Hey, thanks for calling [your company]! How can I help you?"`}
            </p>
          </div>
          <div className="space-y-4">
            <Label>Voice</Label>
            <div>
              <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-2 uppercase tracking-wide">Recommended</p>
              <div className="grid grid-cols-2 gap-3">
                {RECOMMENDED_VOICES.map((v) => (
                  <button
                    key={v.value}
                    type="button"
                    onClick={() => setVoice(v.value)}
                    className={`flex flex-col items-start p-3 rounded-md border-2 transition-colors text-left ${
                      voice === v.value
                        ? "border-blue-600 bg-blue-50 dark:bg-blue-950/30"
                        : "border-border hover:border-blue-300 dark:hover:border-blue-700"
                    }`}
                    data-testid={`button-voice-${v.value}`}
                  >
                    <div className="flex items-center gap-2 w-full">
                      <Mic className={`w-4 h-4 ${voice === v.value ? "text-blue-600" : "text-muted-foreground"}`} />
                      <span className="font-medium text-sm">{v.label}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{v.gender}</span>
                      {v.liveOnly && (
                        <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Live only</span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground mt-1">{v.description}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">More Voices</p>
              <div className="grid grid-cols-2 gap-3">
                {OTHER_VOICES.map((v) => (
                  <button
                    key={v.value}
                    type="button"
                    onClick={() => setVoice(v.value)}
                    className={`flex flex-col items-start p-3 rounded-md border-2 transition-colors text-left ${
                      voice === v.value
                        ? "border-blue-600 bg-blue-50 dark:bg-blue-950/30"
                        : "border-border hover:border-blue-300 dark:hover:border-blue-700"
                    }`}
                    data-testid={`button-voice-${v.value}`}
                  >
                    <div className="flex items-center gap-2 w-full">
                      <Mic className={`w-4 h-4 ${voice === v.value ? "text-blue-600" : "text-muted-foreground"}`} />
                      <span className="font-medium text-sm">{v.label}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{v.gender}</span>
                      {v.liveOnly && (
                        <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Live only</span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground mt-1">{v.description}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            data-testid="button-save-assistant-settings"
          >
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Save Settings
          </Button>
        </CardContent>
      </Card>

      <Card data-testid="card-call-disclosure">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Volume2 className="w-5 h-5 text-blue-600" />
            Call Recording Disclosure
          </CardTitle>
          <CardDescription>Plays to all callers at the start of every call</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="disclosure-toggle" className="text-sm font-medium">Enable Disclosure</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Recommended for legal compliance across all US states and Canada</p>
            </div>
            <Switch
              id="disclosure-toggle"
              checked={disclosureEnabled}
              onCheckedChange={setDisclosureEnabled}
              data-testid="switch-disclosure-enabled"
            />
          </div>
          {disclosureEnabled && (
            <div className="bg-muted/50 rounded-lg p-3 border">
              <p className="text-sm italic text-muted-foreground">"This call may be recorded for quality and training purposes."</p>
              <p className="text-xs text-muted-foreground mt-1.5">This message plays to the caller at the start of every call — both inbound and outbound.</p>
            </div>
          )}
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
            <div className="flex gap-2">
              <Scale className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-amber-800 dark:text-amber-300">
                <span className="font-medium">Why this matters:</span> Several US states (California, Florida, Illinois, Pennsylvania, and others) require all parties to consent to call recording. Playing this disclosure protects you and your business. We strongly recommend keeping this enabled.
              </div>
            </div>
          </div>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            data-testid="button-save-disclosure-settings"
          >
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Save Settings
          </Button>
        </CardContent>
      </Card>

      <Card data-testid="card-follow-up-sms">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-green-600" />
            Follow-Up Text Message
          </CardTitle>
          <CardDescription>Automatically text the caller after the AI handles their call</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="followup-sms-toggle" className="text-sm font-medium">Send Follow-Up SMS</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Only sends when the caller actually had a conversation with the AI</p>
            </div>
            <Switch
              id="followup-sms-toggle"
              checked={followUpSmsEnabled}
              onCheckedChange={setFollowUpSmsEnabled}
              data-testid="switch-followup-sms-enabled"
            />
          </div>
          {followUpSmsEnabled && (
            <div className="space-y-2">
              <Label htmlFor="followup-sms-message" className="text-sm font-medium">Custom Message (optional)</Label>
              <textarea
                id="followup-sms-message"
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                placeholder="Thanks for calling! We got your message and will get back to you shortly. Feel free to call us back or reply to this text if you need anything."
                value={followUpSmsMessage}
                onChange={(e) => setFollowUpSmsMessage(e.target.value)}
                data-testid="textarea-followup-sms-message"
              />
              <p className="text-xs text-muted-foreground">Leave blank to use the default message which includes your company name and phone number.</p>
            </div>
          )}
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            data-testid="button-save-followup-sms-settings"
          >
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Save Settings
          </Button>
        </CardContent>
      </Card>

      <Card data-testid="card-legal-disclaimer" className="border-muted">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Info className="w-5 h-5 text-muted-foreground" />
            Legal Notice
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-xs text-muted-foreground space-y-2">
            <p>
              By using the AI Virtual Assistant feature, you acknowledge and agree that:
            </p>
            <ul className="list-disc pl-4 space-y-1.5">
              <li>
                <span className="font-medium">Recording consent laws vary by jurisdiction.</span> In the United States, some states (including California, Connecticut, Florida, Illinois, Maryland, Massachusetts, Montana, New Hampshire, Oregon, Pennsylvania, and Washington) require all-party consent to record phone calls. Canada generally follows one-party consent federally, but provincial regulations may differ. It is your sole responsibility to understand and comply with the recording and consent laws applicable in your jurisdiction and the jurisdictions of your callers.
              </li>
              <li>
                <span className="font-medium">You are responsible for compliance.</span> Fuse Phone provides the call recording disclosure feature as a tool to help you meet legal requirements. However, enabling or customizing this disclosure does not constitute legal advice. You are solely responsible for ensuring your use of call recording, AI-assisted call handling, and data collection complies with all applicable federal, state, provincial, and local laws.
              </li>
              <li>
                <span className="font-medium">Data handling responsibility.</span> All call recordings, transcriptions, lead data, and conversation logs generated through the AI assistant are stored in your account. You are responsible for the appropriate handling, retention, and deletion of this data in accordance with applicable privacy laws and regulations.
              </li>
              <li>
                <span className="font-medium">AI-generated content disclaimer.</span> The AI assistant may generate responses, summaries, and transcriptions that contain errors or inaccuracies. You should verify critical information before acting on AI-generated content. Fuse Phone is not liable for any actions taken based on AI-generated responses.
              </li>
              <li>
                <span className="font-medium">No legal advice.</span> This information is provided for general awareness only and does not constitute legal advice. Consult a qualified attorney for guidance specific to your business and jurisdiction.
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function isCapacitorNative(): boolean {
  if ((window as any).__CAPACITOR_NATIVE) return true;
  if (document.documentElement.classList.contains('capacitor-native')) return true;
  const Cap = (window as any).Capacitor;
  return !!(Cap?.isNativePlatform?.() || Cap?.isNative);
}

export default function AiAssistant() {
  const isIOSApp = useIsIOSApp();
  const isNativeApp = isCapacitorNative();
  const { toast } = useToast();
  const { subscription, isLoading: subLoading, hasAiAssistant, aiAssistantStatus, isElite } = useSubscription();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const hasHandledReturn = useRef(false);

  const { data: usage } = useQuery<any>({
    queryKey: ["/api/ai-assistant/usage"],
    enabled: hasAiAssistant,
  });

  const { data: assistantSettings } = useQuery<any>({
    queryKey: ["/api/ai-assistant/settings"],
  });

  const [assistantName, setAssistantName] = useState("");
  const [assistantVoice, setAssistantVoice] = useState("sage");
  const [assistantMode, setAssistantMode] = useState("receptionist");
  const [disclosureOn, setDisclosureOn] = useState(true);
  const [followUpOn, setFollowUpOn] = useState(true);
  const [followUpMsg, setFollowUpMsg] = useState("");
  const [smsAutoReplyOn, setSmsAutoReplyOn] = useState(false);
  const [smsAutoReplyMsg, setSmsAutoReplyMsg] = useState("");
  useEffect(() => {
    if (assistantSettings) {
      setAssistantName(assistantSettings.aiAssistantName || "");
      setAssistantVoice(assistantSettings.aiAssistantVoice || "sage");
      setAssistantMode(assistantSettings.aiAssistantMode || "receptionist");
      setDisclosureOn(assistantSettings.aiCallDisclosureEnabled !== false);
      setFollowUpOn(assistantSettings.aiFollowUpSmsEnabled !== false);
      setFollowUpMsg(assistantSettings.aiFollowUpSmsMessage || "");
      setSmsAutoReplyOn(assistantSettings.newSmsAutoReplyEnabled === true);
      setSmsAutoReplyMsg(assistantSettings.newSmsAutoReplyMessage || "");
    }
  }, [assistantSettings]);

  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const playVoicePreview = useCallback(async (voiceId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (playingVoice === voiceId) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setPlayingVoice(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    setPlayingVoice(voiceId);
    try {
      const res = await fetch("/api/ai-assistant/voice-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ voice: voiceId }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        if (errorData.message === "preview_unavailable") {
          setPlayingVoice(null);
          toast({ title: "Preview not available", description: "This voice is a live-call-only voice and can't be previewed here." });
          return;
        }
        throw new Error("Failed to load preview");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        setPlayingVoice(null);
        audioRef.current = null;
        URL.revokeObjectURL(url);
      };
      audio.play();
    } catch {
      setPlayingVoice(null);
      toast({ title: "Preview failed", description: "Could not play voice preview.", variant: "destructive" });
    }
  }, [playingVoice, toast]);

  const saveAssistantMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", "/api/ai-assistant/settings", {
        aiAssistantName: assistantName || null,
        aiAssistantVoice: assistantVoice,
        aiAssistantMode: assistantMode,
        aiCallDisclosureEnabled: disclosureOn,
        aiFollowUpSmsEnabled: followUpOn,
        aiFollowUpSmsMessage: followUpMsg || null,
        newSmsAutoReplyEnabled: smsAutoReplyOn,
        newSmsAutoReplyMessage: smsAutoReplyMsg || null,
      });
    },
    onSuccess: () => {
      toast({ title: "Settings saved", description: "Your AI assistant settings have been updated." });
      queryClient.invalidateQueries({ queryKey: ["/api/ai-assistant/settings"] });
    },
    onError: (error: any) => {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (hasHandledReturn.current) return;
    if (params.get('success') === 'true') {
      hasHandledReturn.current = true;
      toast({ title: "AI Assistant activated!", description: "Your virtual receptionist is ready to handle calls." });
      queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
      window.history.replaceState({}, '', '/ai-assistant');
    }
    if (params.get('canceled') === 'true') {
      hasHandledReturn.current = true;
      toast({ title: "Checkout canceled", description: "No charges were made.", variant: "destructive" });
      window.history.replaceState({}, '', '/ai-assistant');
    }
  }, []);

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/stripe/ai-assistant/checkout", {});
      return await res.json();
    },
    onSuccess: (data: any) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (error: any) => {
      toast({ title: "Checkout failed", description: error.message, variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/stripe/ai-assistant/cancel");
      return await res.json();
    },
    onSuccess: () => {
      toast({ title: "Cancellation scheduled", description: "AI Assistant will remain active until the end of your billing period." });
      queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
      setCancelConfirm(false);
    },
    onError: (error: any) => {
      toast({ title: "Cancel failed", description: error.message, variant: "destructive" });
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/stripe/ai-assistant/reactivate");
      return await res.json();
    },
    onSuccess: () => {
      toast({ title: "Reactivated!", description: "Your AI Assistant subscription will continue." });
      queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
    },
    onError: (error: any) => {
      toast({ title: "Reactivation failed", description: error.message, variant: "destructive" });
    },
  });

  if (subLoading) {
    return (
      <div className="flex items-center justify-center h-full" data-testid="loading-ai-assistant">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isNativeApp && !hasAiAssistant) {
    return (
      <div className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-md">
              <Bot className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <h1 className="text-2xl font-bold" data-testid="text-ai-assistant-title">AI Virtual Assistant</h1>
          </div>
          <p className="text-muted-foreground" data-testid="text-ai-assistant-overview">
            Your AI receptionist answers every call, captures leads, and transcribes conversations so you never miss an opportunity.
          </p>
          <div>
            <h2 className="text-xl font-semibold mb-4">Capabilities</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {AI_ASSISTANT_FEATURES.map((feature) => (
                <Card key={feature.title} data-testid={`card-feature-${feature.title.toLowerCase().replace(/\s+/g, '-')}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-md bg-blue-100 dark:bg-blue-900/30">
                        <feature.icon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      </div>
                      <CardTitle className="text-sm">{feature.title}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{feature.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
          <p className="text-sm text-muted-foreground" data-testid="text-ai-assistant-access-note">
            This feature is available to accounts with AI access enabled.
          </p>
        </div>
      </div>
    );
  }

  if (isNativeApp && hasAiAssistant) {
    return (
      <div className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-md">
              <Bot className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <h1 className="text-2xl font-bold" data-testid="text-ai-assistant-title">AI Virtual Assistant</h1>
          </div>
          {usage && <UsageMeter usage={usage} hideOveragePricing />}
          <AiAssistantSettings />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        <FeatureTipBanner
          id="ai-assistant"
          title="AI Virtual Assistant"
          description="Your AI receptionist answers calls, captures leads, and transcribes conversations — so you never miss an opportunity."
        />

        <div className="relative overflow-visible rounded-md bg-gradient-to-br from-blue-600 via-cyan-600 to-teal-600 p-8 text-white">
          <div className="absolute inset-0 rounded-md bg-black/10" />
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-white/20 rounded-md">
                <Bot className="w-8 h-8" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight" data-testid="text-ai-assistant-title">AI Virtual Assistant</h1>
                <p className="text-white/80 text-sm">Never miss a lead again</p>
              </div>
            </div>
            <p className="text-lg text-white/90 max-w-2xl mb-2">
              Your AI receptionist answers every call, routes to your office, and captures leads when you can't pick up. Every conversation is transcribed and saved.
            </p>
            <p className="text-sm text-white/70 mb-6">
              You're not buying minutes — you're buying the opportunity to capture every lead and never waste a single call.
            </p>
            <div className="flex items-end gap-4 flex-wrap">
              {!isIOSApp && (
                <div>
                  <span className="text-4xl font-bold">$39.99</span>
                  <span className="text-white/70 text-lg">/month</span>
                  <p className="text-xs text-white/60 mt-1">Includes 250 minutes, then $0.14/min</p>
                </div>
              )}
              {!hasAiAssistant && isElite && !isIOSApp && (
                <Button
                  size="lg"
                  className="bg-white text-blue-700 hover-elevate font-semibold border-white"
                  onClick={() => checkoutMutation.mutate()}
                  disabled={checkoutMutation.isPending}
                  data-testid="button-subscribe-ai-assistant"
                >
                  {checkoutMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Zap className="w-4 h-4 mr-2" />
                  )}
                  Activate AI Assistant
                </Button>
              )}
              {!hasAiAssistant && !isElite && (
                <Badge className="bg-white/20 text-white border-white/30 text-sm py-1 px-3">
                  Elite Plan Required
                </Badge>
              )}
              {hasAiAssistant && (
                <Badge className="bg-white/20 text-white border-white/30 text-sm py-1 px-3">
                  <CheckCircle2 className="w-4 h-4 mr-1.5" />
                  Active
                </Badge>
              )}
            </div>
          </div>
        </div>

        {hasAiAssistant && usage && <UsageMeter usage={usage} />}

        <div data-testid="section-ai-settings" className="space-y-4">
          <h2 className="text-xl font-semibold">AI Assistant Settings</h2>

          <Card data-testid="card-ai-assistant-mode">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-blue-600" />
                Assistant Mode
              </CardTitle>
              <CardDescription>Choose how much your AI assistant can help callers</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <button
                type="button"
                onClick={() => setAssistantMode("receptionist")}
                className={`w-full flex items-start gap-4 p-4 rounded-lg border-2 transition-colors text-left ${
                  assistantMode === "receptionist"
                    ? "border-blue-600 bg-blue-50 dark:bg-blue-950/30"
                    : "border-border hover:border-blue-300 dark:hover:border-blue-700"
                }`}
                data-testid="button-mode-receptionist"
              >
                <Headphones className={`w-6 h-6 mt-0.5 flex-shrink-0 ${assistantMode === "receptionist" ? "text-blue-600" : "text-muted-foreground"}`} />
                <div>
                  <div className="font-medium text-sm">Basic Receptionist</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Takes messages and captures leads with a warm, human touch. Collects caller name, address, and what they need — then your team follows up. No call transfers, no account info shared.
                  </p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setAssistantMode("full_context")}
                className={`w-full flex items-start gap-4 p-4 rounded-lg border-2 transition-colors text-left ${
                  assistantMode === "full_context"
                    ? "border-blue-600 bg-blue-50 dark:bg-blue-950/30"
                    : "border-border hover:border-blue-300 dark:hover:border-blue-700"
                }`}
                data-testid="button-mode-full-context"
              >
                <BookOpen className={`w-6 h-6 mt-0.5 flex-shrink-0 ${assistantMode === "full_context" ? "text-blue-600" : "text-muted-foreground"}`} />
                <div>
                  <div className="font-medium text-sm">Full AI Assistant</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Everything in Basic, plus can transfer calls to the office, answer questions about projects, proposals, invoices, and appointments. Verifies caller identity before sharing details.
                  </p>
                  <div className="flex items-center gap-1.5 mt-2">
                    <ShieldCheck className="w-3.5 h-3.5 text-green-600" />
                    <span className="text-xs text-green-700 dark:text-green-500">Caller must say their name to verify identity before any details are shared</span>
                  </div>
                </div>
              </button>
            </CardContent>
          </Card>

          <Card data-testid="card-ai-assistant-settings">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <User className="w-5 h-5 text-blue-600" />
                Assistant Personality
              </CardTitle>
              <CardDescription>Customize how your AI assistant sounds and introduces itself on calls</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="assistant-name">Assistant Name</Label>
                <Input
                  id="assistant-name"
                  placeholder="e.g. Sarah, Jessica, Mike (leave blank for no name)"
                  value={assistantName}
                  onChange={(e) => setAssistantName(e.target.value)}
                  data-testid="input-assistant-name"
                />
                <p className="text-xs text-muted-foreground">
                  {assistantName ? `Will greet callers as: "Hey, thanks for calling [your company], this is ${assistantName}!"` : `Will greet callers as: "Hey, thanks for calling [your company]! How can I help you?"`}
                </p>
              </div>
              <div className="space-y-4">
                <Label>Voice</Label>
                <div>
                  <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-2 uppercase tracking-wide">Recommended</p>
                  <div className="grid grid-cols-2 gap-3">
                    {RECOMMENDED_VOICES.map((v) => (
                      <button
                        key={v.value}
                        type="button"
                        onClick={() => setAssistantVoice(v.value)}
                        className={`flex flex-col items-start p-3 rounded-md border-2 transition-colors text-left relative ${
                          assistantVoice === v.value
                            ? "border-blue-600 bg-blue-50 dark:bg-blue-950/30"
                            : "border-border hover:border-blue-300 dark:hover:border-blue-700"
                        }`}
                        data-testid={`button-voice-${v.value}`}
                      >
                        <div className="flex items-center gap-2 w-full">
                          <Mic className={`w-4 h-4 ${assistantVoice === v.value ? "text-blue-600" : "text-muted-foreground"}`} />
                          <span className="font-medium text-sm">{v.label}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{v.gender}</span>
                          {v.liveOnly ? (
                            <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Live only</span>
                          ) : (
                            <span
                              role="button"
                              onClick={(e) => playVoicePreview(v.value, e)}
                              className="ml-auto p-1 rounded-full hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                              data-testid={`button-play-voice-${v.value}`}
                            >
                              {playingVoice === v.value ? (
                                <Square className="w-3.5 h-3.5 text-blue-600 fill-blue-600" />
                              ) : (
                                <Play className="w-3.5 h-3.5 text-blue-600 fill-blue-600" />
                              )}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground mt-1">{v.description}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">More Voices</p>
                  <div className="grid grid-cols-2 gap-3">
                    {OTHER_VOICES.map((v) => (
                      <button
                        key={v.value}
                        type="button"
                        onClick={() => setAssistantVoice(v.value)}
                        className={`flex flex-col items-start p-3 rounded-md border-2 transition-colors text-left relative ${
                          assistantVoice === v.value
                            ? "border-blue-600 bg-blue-50 dark:bg-blue-950/30"
                            : "border-border hover:border-blue-300 dark:hover:border-blue-700"
                        }`}
                        data-testid={`button-voice-${v.value}`}
                      >
                        <div className="flex items-center gap-2 w-full">
                          <Mic className={`w-4 h-4 ${assistantVoice === v.value ? "text-blue-600" : "text-muted-foreground"}`} />
                          <span className="font-medium text-sm">{v.label}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{v.gender}</span>
                          {v.liveOnly ? (
                            <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Live only</span>
                          ) : (
                            <span
                              role="button"
                              onClick={(e) => playVoicePreview(v.value, e)}
                              className="ml-auto p-1 rounded-full hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                              data-testid={`button-play-voice-${v.value}`}
                            >
                              {playingVoice === v.value ? (
                                <Square className="w-3.5 h-3.5 text-blue-600 fill-blue-600" />
                              ) : (
                                <Play className="w-3.5 h-3.5 text-blue-600 fill-blue-600" />
                              )}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground mt-1">{v.description}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <Button
                onClick={() => saveAssistantMutation.mutate()}
                disabled={saveAssistantMutation.isPending}
                data-testid="button-save-assistant-settings"
              >
                {saveAssistantMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Save Settings
              </Button>
            </CardContent>
          </Card>

          <Card data-testid="card-call-disclosure">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Volume2 className="w-5 h-5 text-blue-600" />
                Call Recording Disclosure
              </CardTitle>
              <CardDescription>Plays to all callers at the start of every call</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="disclosure-toggle" className="text-sm font-medium">Enable Disclosure</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Recommended for legal compliance across all US states and Canada</p>
                </div>
                <Switch
                  id="disclosure-toggle"
                  checked={disclosureOn}
                  onCheckedChange={setDisclosureOn}
                  data-testid="switch-disclosure-enabled"
                />
              </div>
              {disclosureOn && (
                <div className="bg-muted/50 rounded-lg p-3 border">
                  <p className="text-sm italic text-muted-foreground">"This call may be recorded for quality and training purposes."</p>
                  <p className="text-xs text-muted-foreground mt-1.5">This message plays to the caller at the start of every call — both inbound and outbound.</p>
                </div>
              )}
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                <div className="flex gap-2">
                  <Scale className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-amber-800 dark:text-amber-300">
                    <span className="font-medium">Why this matters:</span> Several US states (California, Florida, Illinois, Pennsylvania, and others) require all parties to consent to call recording. Playing this disclosure protects you and your business. We strongly recommend keeping this enabled.
                  </div>
                </div>
              </div>
              <Button
                onClick={() => saveAssistantMutation.mutate()}
                disabled={saveAssistantMutation.isPending}
                data-testid="button-save-disclosure-settings"
              >
                {saveAssistantMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Save Settings
              </Button>
            </CardContent>
          </Card>

          <Card data-testid="card-follow-up-sms">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-green-600" />
                Follow-Up Text Message
              </CardTitle>
              <CardDescription>Automatically text the caller after the AI handles their call</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="followup-sms-toggle-2" className="text-sm font-medium">Send Follow-Up SMS</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Only sends when the caller actually had a conversation with the AI</p>
                </div>
                <Switch
                  id="followup-sms-toggle-2"
                  checked={followUpOn}
                  onCheckedChange={setFollowUpOn}
                  data-testid="switch-followup-sms-enabled-2"
                />
              </div>
              {followUpOn && (
                <div className="space-y-2">
                  <Label htmlFor="followup-sms-message-2" className="text-sm font-medium">Custom Message (optional)</Label>
                  <textarea
                    id="followup-sms-message-2"
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    placeholder="Hey {{first_name}}, sorry we missed your call! We'll get back to you soon.&#10;&#10;Need a quote? Fill out our form here: {{booking_link}}"
                    value={followUpMsg}
                    onChange={(e) => setFollowUpMsg(e.target.value)}
                    data-testid="textarea-followup-sms-message-2"
                  />
                  <p className="text-xs text-muted-foreground">Leave blank to use the smart default — it personalizes with the caller's name if they're a known contact, and includes your booking link automatically.</p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {['{{first_name}}', '{{company_name}}', '{{booking_link}}', '{{phone}}'].map(tag => (
                      <button
                        key={tag}
                        type="button"
                        className="px-2 py-0.5 rounded-md bg-muted text-[10px] font-mono text-muted-foreground hover:bg-muted/80 transition-colors"
                        onClick={() => setFollowUpMsg(prev => prev + tag)}
                        data-testid={`tag-followup-${tag.replace(/[{}]/g, '')}`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <Button
                onClick={() => saveAssistantMutation.mutate()}
                disabled={saveAssistantMutation.isPending}
                data-testid="button-save-followup-sms-settings-2"
              >
                {saveAssistantMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Save Settings
              </Button>
            </CardContent>
          </Card>

          <Card data-testid="card-sms-auto-reply">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-blue-500" />
                New Text Message Auto-Reply
              </CardTitle>
              <CardDescription>Automatically reply when someone texts your business number for the first time</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="sms-autoreply-toggle" className="text-sm font-medium">Enable Auto-Reply</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Only sends once per phone number — the very first time they text you</p>
                </div>
                <Switch
                  id="sms-autoreply-toggle"
                  checked={smsAutoReplyOn}
                  onCheckedChange={setSmsAutoReplyOn}
                  data-testid="switch-sms-auto-reply-enabled"
                />
              </div>
              {smsAutoReplyOn && (
                <div className="space-y-2">
                  <Label htmlFor="sms-autoreply-message" className="text-sm font-medium">Custom Message (optional)</Label>
                  <textarea
                    id="sms-autoreply-message"
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    placeholder="Hey {{first_name}}, thanks for reaching out! We'll get back to you as soon as possible.&#10;&#10;Need a quote? Fill out our form here: {{booking_link}}"
                    value={smsAutoReplyMsg}
                    onChange={(e) => setSmsAutoReplyMsg(e.target.value)}
                    data-testid="textarea-sms-auto-reply-message"
                  />
                  <p className="text-xs text-muted-foreground">Leave blank to use the smart default — it uses the contact's name if they're already in your contacts, and includes your booking link.</p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {['{{first_name}}', '{{company_name}}', '{{booking_link}}', '{{phone}}'].map(tag => (
                      <button
                        key={tag}
                        type="button"
                        className="px-2 py-0.5 rounded-md bg-muted text-[10px] font-mono text-muted-foreground hover:bg-muted/80 transition-colors"
                        onClick={() => setSmsAutoReplyMsg(prev => prev + tag)}
                        data-testid={`tag-sms-autoreply-${tag.replace(/[{}]/g, '')}`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <Button
                onClick={() => saveAssistantMutation.mutate()}
                disabled={saveAssistantMutation.isPending}
                data-testid="button-save-sms-auto-reply-settings"
              >
                {saveAssistantMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Save Settings
              </Button>
            </CardContent>
          </Card>

          <Card data-testid="card-legal-disclaimer" className="border-muted">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Info className="w-5 h-5 text-muted-foreground" />
                Legal Notice
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xs text-muted-foreground space-y-2">
                <p>
                  By using the AI Virtual Assistant feature, you acknowledge and agree that:
                </p>
                <ul className="list-disc pl-4 space-y-1.5">
                  <li>
                    <span className="font-medium">Recording consent laws vary by jurisdiction.</span> It is your sole responsibility to understand and comply with the recording and consent laws applicable in your jurisdiction and the jurisdictions of your callers.
                  </li>
                  <li>
                    <span className="font-medium">You are responsible for compliance.</span> Fuse Phone provides the call recording disclosure feature as a tool to help you meet legal requirements. However, enabling or customizing this disclosure does not constitute legal advice.
                  </li>
                  <li>
                    <span className="font-medium">AI-generated content disclaimer.</span> The AI assistant may generate responses, summaries, and transcriptions that contain errors or inaccuracies. You should verify critical information before acting on AI-generated content.
                  </li>
                  <li>
                    <span className="font-medium">No legal advice.</span> This information is provided for general awareness only and does not constitute legal advice.
                  </li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-4" data-testid="text-features-heading">How It Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {AI_ASSISTANT_FEATURES.map((feature) => (
              <Card key={feature.title} data-testid={`card-feature-${feature.title.toLowerCase().replace(/\s+/g, '-')}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-md bg-blue-100 dark:bg-blue-900/30">
                      <feature.icon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <CardTitle className="text-sm">{feature.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">How the Call Flow Works</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0 text-sm font-bold text-blue-600">1</div>
                <div>
                  <p className="font-medium text-sm">Customer calls your business number</p>
                  <p className="text-sm text-muted-foreground">If enabled, they hear the recording disclosure first, then your office phone and browser ring immediately</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0 text-sm font-bold text-blue-600">2</div>
                <div>
                  <p className="font-medium text-sm">You answer? You hear who's calling</p>
                  <p className="text-sm text-muted-foreground">When you pick up, you hear the caller's name and your company — then you're connected</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0 text-sm font-bold text-blue-600">3</div>
                <div>
                  <p className="font-medium text-sm">Can't answer? AI picks up seamlessly</p>
                  <p className="text-sm text-muted-foreground">AI greets them naturally using your company name, has a real conversation, captures their info, and creates the lead</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0 text-sm font-bold text-blue-600">4</div>
                <div>
                  <p className="font-medium text-sm">You get notified instantly</p>
                  <p className="text-sm text-muted-foreground">Full transcript + summary delivered to your phone. New lead appears in your pipeline ready to follow up.</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="py-6">
            <div className="flex items-start gap-3">
              <TrendingUp className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-sm mb-1">What This Really Means for Your Business</h3>
                <p className="text-sm text-muted-foreground">
                  Every missed call is a potential job worth thousands in lost revenue. With AI Assistant handling your calls, you're not paying for minutes — you're investing in capturing every opportunity. Even one extra lead per month pays for itself many times over.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {hasAiAssistant && (
          <Card data-testid="card-ai-assistant-status">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Bot className="w-5 h-5 text-blue-600" />
                Subscription Status
              </CardTitle>
              <CardDescription>Manage your AI Assistant add-on</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant="default" className="bg-green-600">Active</Badge>
                  {!isIOSApp && <span className="text-sm text-muted-foreground">$39.99/month — 250 minutes included, then $0.14/min</span>}
                </div>
              </div>

              {!cancelConfirm ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive"
                  onClick={() => setCancelConfirm(true)}
                  data-testid="button-cancel-ai-assistant"
                >
                  Cancel AI Assistant
                </Button>
              ) : (
                <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/20">
                  <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0" />
                  <span className="text-sm">Are you sure? Your AI receptionist will stop answering calls at the end of your billing period.</span>
                  <div className="flex gap-2 ml-auto flex-shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCancelConfirm(false)}
                      data-testid="button-keep-ai-assistant"
                    >
                      Keep
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => cancelMutation.mutate()}
                      disabled={cancelMutation.isPending}
                      data-testid="button-confirm-cancel-ai-assistant"
                    >
                      {cancelMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm Cancel"}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {!hasAiAssistant && (
          <Card className="border-dashed" data-testid="card-ai-assistant-cta">
            <CardContent className="flex flex-col items-center justify-center py-10 text-center">
              <Bot className="w-12 h-12 text-blue-400 mb-4" />
              <h3 className="text-lg font-semibold mb-2">
                {isElite ? "Ready to stop missing leads?" : "AI Assistant requires an Elite plan"}
              </h3>
              <p className="text-sm text-muted-foreground max-w-md mb-6">
                {isElite
                  ? "Activate AI Assistant and let your virtual receptionist handle calls, capture leads, and transcribe conversations 24/7."
                  : "AI Assistant is available to accounts on the Elite plan with AI access enabled."}
              </p>
              {isElite && !isIOSApp ? (
                <Button
                  size="lg"
                  onClick={() => checkoutMutation.mutate()}
                  disabled={checkoutMutation.isPending}
                  data-testid="button-subscribe-ai-assistant-bottom"
                >
                  {checkoutMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Zap className="w-4 h-4 mr-2" />
                  )}
                  Activate for $39.99/month
                </Button>
              ) : !isElite && !isIOSApp ? (
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => window.location.href = '/billing'}
                  data-testid="button-upgrade-to-elite"
                >
                  <Crown className="w-4 h-4 mr-2" />
                  Upgrade to Elite
                </Button>
              ) : null}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
