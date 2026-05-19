import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useContacts } from "@/hooks/use-contacts";
import { useMakeCall, useCompanySettings, useUpdateCompanySettings } from "@/hooks/use-company-settings";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { 
  Phone, 
  Delete, 
  Loader2, 
  User, 
  Clock, 
  PhoneOutgoing, 
  PhoneIncoming,
  PhoneMissed,
  AlertCircle,
  AlertTriangle,
  Search,
  ChevronRight,
  ChevronDown,
  Info,
  X,
  Settings,
  MessageSquare,
  PhoneOff,
  Voicemail,
  Mic,
  Monitor,
  Wifi,
  WifiOff,
  PhoneCall,
  Activity,
  CheckCircle2,
  XCircle,
  Bot,
  Zap,
  FileText,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Link, useLocation } from "wouter";
import { format } from "date-fns";
import { cn, formatPhoneDisplay } from "@/lib/utils";
import { useTwilioDevice } from "@/hooks/use-twilio-device";
import { useNetworkTest } from "@/hooks/use-network-test";
import { useSubscription } from "@/hooks/use-subscription";
import { useIsNativeApp } from "@/hooks/use-ios-app";
import { Progress } from "@/components/ui/progress";
import type { Contact, Communication, CompanySettings } from "@shared/schema";

function decodeHtmlEntities(text: string): string {
  if (!text || (!text.includes('&') && !text.includes('&#'))) return text;
  const el = document.createElement('textarea');
  let decoded = text;
  for (let i = 0; i < 3; i++) {
    el.innerHTML = decoded;
    const next = el.value;
    if (next === decoded) break;
    decoded = next;
  }
  return decoded;
}

interface GroupedCall {
  contactId: number | null;
  contactName: string;
  phoneNumber: string;
  calls: Communication[];
  latestCall: Communication;
  totalCalls: number;
  unreadCount: number;
}

function getCallStatus(content: string | null | undefined) {
  if (!content) return { text: '', isNegative: false, hint: '' };
  const c = content.toLowerCase();
  if (c.includes('completed')) return { text: 'Completed', isNegative: false, hint: '' };
  if (c.includes('office answered')) return { text: 'Connected', isNegative: false, hint: '' };
  if (c.includes('call initiated') || c.includes('now calling')) return { text: 'Connected', isNegative: false, hint: '' };
  if (c.includes('office') && c.includes('busy')) return { text: 'Busy', isNegative: true, hint: 'Your office phone was busy or declined the call. Check if your carrier is blocking the Twilio number, or add it to your contacts.' };
  if (c.includes('customer') && c.includes('busy')) return { text: 'Busy', isNegative: true, hint: 'The customer\'s line was busy. Try calling again later.' };
  if (c.includes('busy')) return { text: 'Busy', isNegative: true, hint: 'The line was busy. Try calling again later.' };
  if (c.includes('office') && (c.includes('no-answer') || c.includes('no answer') || c.includes('did not answer'))) return { text: 'No Answer', isNegative: true, hint: 'Your office phone didn\'t answer in time. Make sure your phone is nearby when placing calls.' };
  if (c.includes('customer') && (c.includes('no-answer') || c.includes('no answer') || c.includes('did not answer'))) return { text: 'No Answer', isNegative: true, hint: 'The customer didn\'t pick up. Try calling again or send them a text first.' };
  if (c.includes('no-answer') || c.includes('missed') || c.includes('no answer')) return { text: 'No Answer', isNegative: true, hint: 'No answer. Try calling again later.' };
  if (c.includes('canceled')) return { text: 'Canceled', isNegative: true, hint: 'The call was canceled before connecting.' };
  if (c.includes('failed')) return { text: 'Failed', isNegative: true, hint: 'The call couldn\'t connect. Check your Twilio setup and phone number format.' };
  return { text: '', isNegative: false, hint: '' };
}

function CallEventItem({ call, contact }: { call: Communication; contact?: Contact }) {
  const isOutbound = call.direction === 'outbound';
  const { text: statusText, isNegative, hint } = getCallStatus(call.content);
  const [showFullTranscript, setShowFullTranscript] = useState(false);

  const hasTranscript = call.content?.includes('---FULL_TRANSCRIPT---');
  const contentParts = hasTranscript ? call.content!.split('---FULL_TRANSCRIPT---') : null;
  const summaryContent = hasTranscript ? contentParts![0].trim() : (call.content || '');
  const fullTranscript = hasTranscript ? contentParts![1].trim() : null;
  const hasSummary = summaryContent && summaryContent.length > 0;

  const durationMatch = call.content?.match(/\((\d+[ms]\s*\d*s?)\)/);
  const durationStr = durationMatch ? durationMatch[1] : null;
  const dirLabel = isOutbound ? 'Outgoing call' : isNegative ? 'Missed call' : 'Incoming call';
  const shortLabel = `${dirLabel}${durationStr ? ` (${durationStr})` : ''}`;

  return (
    <div className="py-3" data-testid={`call-event-${call.id}`}>
      <div className="flex items-center gap-3 mb-2">
        <div className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
          isNegative ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400" :
          isOutbound ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400" :
          "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
        )}>
          {isNegative ? (
            <PhoneMissed className="w-4 h-4" />
          ) : isOutbound ? (
            <PhoneOutgoing className="w-4 h-4" />
          ) : (
            <PhoneIncoming className="w-4 h-4" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{shortLabel}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-muted-foreground">
              {call.timestamp && format(new Date(call.timestamp), "MMM d, h:mm a")}
            </span>
            {statusText && (
              <Badge variant={isNegative ? "destructive" : "secondary"} className="text-[10px] px-1.5 py-0">
                {statusText}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {call.mediaUrl && (
        <div className="ml-11 mb-2">
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Recording</p>
          <audio controls preload="none" className="w-full h-8 [&::-webkit-media-controls-panel]:h-8" data-testid={`audio-recording-${call.id}`}>
            <source src={call.mediaUrl} type="audio/mpeg" />
          </audio>
        </div>
      )}

      {hasSummary && (
        <div className="ml-11 p-3 rounded-md bg-muted/50 border mb-2">
          <p className="text-xs font-medium text-muted-foreground mb-1">Summary</p>
          <p className="text-sm whitespace-pre-line leading-relaxed">{summaryContent}</p>
        </div>
      )}

      {hasTranscript && (
        <div className="ml-11 mb-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-7 px-2 text-blue-600 dark:text-blue-400"
            onClick={() => setShowFullTranscript(!showFullTranscript)}
            data-testid={`button-toggle-transcript-${call.id}`}
          >
            <FileText className="w-3 h-3 mr-1" />
            {showFullTranscript ? 'Hide Transcript' : 'View Full Transcript'}
          </Button>
        </div>
      )}
      {showFullTranscript && fullTranscript && (
        <div className="ml-11 p-3 rounded-md bg-muted/50 border text-xs whitespace-pre-line max-h-64 overflow-y-auto mb-2" data-testid={`text-full-transcript-${call.id}`}>
          {fullTranscript}
        </div>
      )}

      {hint && (
        <div className="ml-11 p-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
          <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
            {hint}
          </p>
        </div>
      )}
    </div>
  );
}

function CustomGreetingServiceNotice({ audioUrl }: { audioUrl: string | null | undefined }) {
  const isNative = useIsNativeApp();

  if (audioUrl) {
    return (
      <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
        <Mic className="w-4 h-4 text-green-500 shrink-0" />
        <span className="text-xs text-muted-foreground flex-1">Custom recording active</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5 p-3 rounded-lg border border-dashed border-primary/30 bg-primary/5" data-testid="notice-custom-greeting-service">
      <Mic className="w-4 h-4 text-primary shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium">Want a professional custom greeting?</p>
        <p className="text-xs text-muted-foreground">
          {isNative
            ? "We can record a professional greeting for your business. Reach out to us to get started."
            : "We'll record or set up your own message for a one-time fee of $99. Text or call us to get started."}
        </p>
      </div>
    </div>
  );
}

function AiAssistantSettingsSection() {
  const { hasAiAssistant, isElite } = useSubscription();
  const isNativeApp = useIsNativeApp();
  const { data: aiUsage } = useQuery<any>({
    queryKey: ["/api/ai-assistant/usage"],
    enabled: hasAiAssistant,
  });

  if (!isElite) return null;

  return (
    <div className="space-y-3 pb-4 border-b">
      <div className="flex items-center gap-2">
        <Bot className="w-4 h-4 text-blue-500" />
        <Label className="font-medium">AI Virtual Assistant</Label>
      </div>
      {hasAiAssistant ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm">AI is handling your missed calls</p>
                <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-green-300 text-green-700 dark:text-green-400">Active</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                When no one answers, AI answers the call, captures leads, and transcribes conversations.
              </p>
            </div>
          </div>
          {aiUsage && (
            <div className="rounded-md border p-3 space-y-2 bg-muted/30">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Minutes This Period</span>
                <span className="font-semibold tabular-nums">{Math.round(aiUsage.minutesUsed)} / {aiUsage.minutesIncluded || 500}</span>
              </div>
              <Progress value={Math.min(100, (aiUsage.minutesUsed / (aiUsage.minutesIncluded || 500)) * 100)} className="h-1.5" />
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{Math.max(0, Math.round((aiUsage.minutesIncluded || 500) - aiUsage.minutesUsed))} min remaining</span>
                {aiUsage.periodEnd && (
                  <span>Resets {new Date(aiUsage.periodEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                )}
              </div>
            </div>
          )}
          <Link href="/ai-assistant">
            <Button size="sm" variant="outline" className="w-full text-xs" data-testid="button-manage-ai-settings">
              <Settings className="w-3 h-3 mr-1.5" />
              Manage AI Assistant
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {isNativeApp
              ? "Never miss a lead — AI answers calls when you can't, captures customer info, and transcribes every conversation."
              : "Never miss a lead — AI answers calls when you can't, captures customer info, and transcribes every conversation. $39.99/mo includes 250 minutes, then $0.14/min."}
          </p>
          <Link href="/ai-assistant">
            <Button size="sm" variant="outline" className="w-full text-xs" data-testid="button-activate-ai-settings">
              <Zap className="w-3 h-3 mr-1.5" />
              {isNativeApp ? "Learn More" : "Learn More & Activate"}
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}

function CallSettingsModal({ open, onOpenChange, settings }: { open: boolean; onOpenChange: (open: boolean) => void; settings: CompanySettings | null | undefined }) {
  const { toast } = useToast();
  const updateSettings = useUpdateCompanySettings();
  const queryClient = useQueryClient();
  const networkTest = useNetworkTest();

  const [businessGreeting, setBusinessGreeting] = useState("");
  const [afterHoursGreeting, setAfterHoursGreeting] = useState("");
  const [voicemailGreeting, setVoicemailGreeting] = useState("");
  const [tryOfficeAfterHours, setTryOfficeAfterHours] = useState(false);
  const [businessAudio, setBusinessAudio] = useState<string | null>(null);
  const [afterHoursAudio, setAfterHoursAudio] = useState<string | null>(null);
  const [voicemailAudio, setVoicemailAudio] = useState<string | null>(null);
  const [isTogglingBrowserCalls, setIsTogglingBrowserCalls] = useState(false);
  const [pendingBrowserEnable, setPendingBrowserEnable] = useState(false);

  useEffect(() => {
    if (open && settings) {
      const companyName = settings.companyName || "our company";
      setBusinessGreeting(settings.businessHoursGreeting || `Thank you for calling ${companyName}. Please wait while we connect your call.`);
      setAfterHoursGreeting(settings.afterHoursGreeting || `Thank you for calling ${companyName}. We are currently closed. Please leave a message after the tone and we will get back to you as soon as possible.`);
      setVoicemailGreeting(settings.voicemailGreeting || `We're sorry we missed your call. If you would like to request a proposal, please press 1. If you would like to leave a voicemail, please press 2.`);
      setTryOfficeAfterHours(settings.tryOfficeAfterHours || false);
      setBusinessAudio((settings as any).businessHoursGreetingAudio || null);
      setAfterHoursAudio((settings as any).afterHoursGreetingAudio || null);
      setVoicemailAudio((settings as any).voicemailGreetingAudio || null);
      setPendingBrowserEnable(false);
    }
  }, [open, settings]);

  useEffect(() => {
    if (!open) {
      setPendingBrowserEnable(false);
      networkTest.cancelTest();
    }
  }, [open]);

  const handleToggleBrowserCalls = async (enabled: boolean) => {
    if (enabled) {
      setPendingBrowserEnable(true);
      networkTest.runTest();
    } else {
      setIsTogglingBrowserCalls(true);
      try {
        await apiRequest("POST", "/api/twilio/browser-calling/toggle", { enabled: false });
        queryClient.invalidateQueries({ queryKey: ['/api/settings/company'] });
        toast({ title: "Browser calling disabled" });
      } catch (err: any) {
        toast({ title: "Failed", description: err.message, variant: "destructive" });
      } finally {
        setIsTogglingBrowserCalls(false);
      }
    }
  };

  const confirmEnableBrowserCalls = async () => {
    setIsTogglingBrowserCalls(true);
    setPendingBrowserEnable(false);
    try {
      await apiRequest("POST", "/api/twilio/browser-calling/toggle", { enabled: true });
      queryClient.invalidateQueries({ queryKey: ['/api/settings/company'] });
      toast({ title: "Browser calling enabled" });
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setIsTogglingBrowserCalls(false);
    }
  };

  const cancelEnableBrowserCalls = () => {
    setPendingBrowserEnable(false);
    networkTest.cancelTest();
  };

  const handleSave = () => {
    updateSettings.mutate({
      businessHoursGreeting: businessGreeting,
      afterHoursGreeting: afterHoursGreeting,
      voicemailGreeting: voicemailGreeting,
      tryOfficeAfterHours: tryOfficeAfterHours,
    } as any, {
      onSuccess: () => {
        toast({ title: "Call settings saved" });
        onOpenChange(false);
      },
      onError: (error: Error) => {
        toast({ title: "Failed to save", description: error.message, variant: "destructive" });
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Call Settings
          </DialogTitle>
          <DialogDescription>
            Configure how incoming calls are handled during and outside business hours.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          <AiAssistantSettingsSection />

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-primary" />
              <Label className="font-medium">Business Hours Greeting</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Played when someone calls during your business hours, before connecting to your office.
            </p>
            <CustomGreetingServiceNotice audioUrl={businessAudio} />
            <Textarea
              value={businessGreeting}
              onChange={(e) => setBusinessGreeting(e.target.value)}
              rows={3}
              placeholder="Text fallback (used if no recording)"
              data-testid="input-business-greeting"
            />
          </div>

          <div className="border-t pt-4 space-y-3">
            <div className="flex items-center gap-2">
              <Monitor className="w-4 h-4 text-green-500" />
              <Label className="font-medium">Browser Calling (VoIP)</Label>
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm">Receive calls on this device</p>
                <p className="text-xs text-muted-foreground">
                  When enabled, incoming calls will ring on your browser. Great for remote secretaries or office managers who aren't at the physical office.
                </p>
              </div>
              <Switch
                checked={(settings as any)?.browserCallsEnabled || false}
                onCheckedChange={handleToggleBrowserCalls}
                disabled={isTogglingBrowserCalls || pendingBrowserEnable || !settings?.twilioAccountSid}
                data-testid="switch-browser-calls"
              />
            </div>
            {!settings?.twilioAccountSid && (
              <p className="text-xs text-muted-foreground">
                Connect your Twilio account first to enable browser calling.
              </p>
            )}

            {pendingBrowserEnable && (
              <div className="rounded-md border p-3 space-y-3" data-testid="section-network-check">
                {networkTest.status === "running" && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      <p className="text-sm font-medium">Checking your internet connection...</p>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-500"
                        style={{ width: `${networkTest.progress}%` }}
                      />
                    </div>
                  </div>
                )}

                {networkTest.status === "completed" && networkTest.result && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      {(networkTest.result.quality === "excellent" || networkTest.result.quality === "good") && (
                        <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                      )}
                      {networkTest.result.quality === "fair" && (
                        <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                      )}
                      {(networkTest.result.quality === "poor" || networkTest.result.quality === "bad") && (
                        <XCircle className="w-4 h-4 text-destructive" />
                      )}
                      <p className="text-sm font-medium">
                        {networkTest.result.quality === "excellent" && "Your connection is excellent for calls"}
                        {networkTest.result.quality === "good" && "Your connection is good for calls"}
                        {networkTest.result.quality === "fair" && "Your connection is okay, but calls may have some issues"}
                        {networkTest.result.quality === "poor" && "Your connection is weak - calls may drop or sound choppy"}
                        {networkTest.result.quality === "bad" && "Your connection is too weak for reliable calls"}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-md bg-muted/50 p-2" data-testid="stat-mos">
                        <p className="text-xs text-muted-foreground">Call Quality</p>
                        <p className={cn("text-sm font-semibold",
                          networkTest.result.mos >= 3.5 ? "text-green-600 dark:text-green-400" :
                          networkTest.result.mos >= 3.0 ? "text-yellow-600 dark:text-yellow-400" :
                          "text-destructive"
                        )}>
                          {networkTest.result.mos}/5
                        </p>
                      </div>
                      <div className="rounded-md bg-muted/50 p-2" data-testid="stat-latency">
                        <p className="text-xs text-muted-foreground">Latency</p>
                        <p className={cn("text-sm font-semibold",
                          networkTest.result.rtt <= 150 ? "text-green-600 dark:text-green-400" :
                          networkTest.result.rtt <= 300 ? "text-yellow-600 dark:text-yellow-400" :
                          "text-destructive"
                        )}>
                          {networkTest.result.rtt}ms
                        </p>
                      </div>
                      <div className="rounded-md bg-muted/50 p-2" data-testid="stat-jitter">
                        <p className="text-xs text-muted-foreground">Jitter</p>
                        <p className={cn("text-sm font-semibold",
                          networkTest.result.jitter <= 30 ? "text-green-600 dark:text-green-400" :
                          networkTest.result.jitter <= 50 ? "text-yellow-600 dark:text-yellow-400" :
                          "text-destructive"
                        )}>
                          {networkTest.result.jitter}ms
                        </p>
                      </div>
                      <div className="rounded-md bg-muted/50 p-2" data-testid="stat-packet-loss">
                        <p className="text-xs text-muted-foreground">Packet Loss</p>
                        <p className={cn("text-sm font-semibold",
                          networkTest.result.packetLossPercent <= 1 ? "text-green-600 dark:text-green-400" :
                          networkTest.result.packetLossPercent <= 3 ? "text-yellow-600 dark:text-yellow-400" :
                          "text-destructive"
                        )}>
                          {networkTest.result.packetLossPercent}%
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 justify-end flex-wrap">
                      <Button size="sm" variant="outline" onClick={cancelEnableBrowserCalls} data-testid="button-cancel-enable">
                        Cancel
                      </Button>
                      {(networkTest.result.quality === "poor" || networkTest.result.quality === "bad") ? (
                        <Button size="sm" variant="outline" onClick={() => networkTest.runTest()} data-testid="button-retest">
                          <Activity className="w-4 h-4 mr-1" />
                          Test Again
                        </Button>
                      ) : (
                        <Button size="sm" onClick={confirmEnableBrowserCalls} disabled={isTogglingBrowserCalls} data-testid="button-confirm-enable">
                          {isTogglingBrowserCalls && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                          Enable Browser Calling
                        </Button>
                      )}
                    </div>

                    {(networkTest.result.quality === "poor" || networkTest.result.quality === "bad") && (
                      <p className="text-xs text-muted-foreground">
                        We recommend improving your internet connection before enabling browser calling. Try moving closer to your Wi-Fi router or using a wired connection.
                      </p>
                    )}
                  </div>
                )}

                {networkTest.status === "failed" && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <XCircle className="w-4 h-4 text-destructive" />
                      <p className="text-sm font-medium">{networkTest.error || "Connection test failed"}</p>
                    </div>
                    <div className="flex items-center gap-2 justify-end flex-wrap">
                      <Button size="sm" variant="outline" onClick={cancelEnableBrowserCalls} data-testid="button-cancel-enable-failed">
                        Cancel
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => networkTest.runTest()} data-testid="button-retry-test">
                        <Activity className="w-4 h-4 mr-1" />
                        Try Again
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="border-t pt-4 space-y-3">
            <div className="flex items-center gap-2">
              <PhoneOff className="w-4 h-4 text-orange-500" />
              <Label className="font-medium">After Hours Behavior</Label>
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm">Try to reach office after hours</p>
                <p className="text-xs text-muted-foreground">
                  If enabled, we'll still ring your office phone after hours before going to voicemail.
                </p>
              </div>
              <Switch
                checked={tryOfficeAfterHours}
                onCheckedChange={setTryOfficeAfterHours}
                data-testid="switch-try-office-after-hours"
              />
            </div>
          </div>

          <div className="border-t pt-4 space-y-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-blue-500" />
              <Label className="font-medium">After Hours Greeting</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              {tryOfficeAfterHours
                ? "Played when someone calls after hours, before trying your office phone."
                : "Played when someone calls after hours, before going to voicemail."}
            </p>
            <CustomGreetingServiceNotice audioUrl={afterHoursAudio} />
            <Textarea
              value={afterHoursGreeting}
              onChange={(e) => setAfterHoursGreeting(e.target.value)}
              rows={3}
              placeholder="Text fallback (used if no recording)"
              data-testid="input-after-hours-greeting"
            />
          </div>

          <div className="border-t pt-4 space-y-3">
            <div className="flex items-center gap-2">
              <Voicemail className="w-4 h-4 text-red-500" />
              <Label className="font-medium">Voicemail Greeting</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              This is the main IVR message played when no one answers. Include your press 1 and press 2 options in this message. For example: "We're sorry we missed your call. Press 1 to request a proposal, press 2 to leave a voicemail."
            </p>
            <CustomGreetingServiceNotice audioUrl={voicemailAudio} />
            <Textarea
              value={voicemailGreeting}
              onChange={(e) => setVoicemailGreeting(e.target.value)}
              rows={3}
              placeholder="Text fallback (used if no recording)"
              data-testid="input-voicemail-greeting"
            />
          </div>

        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-call-settings">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={updateSettings.isPending} data-testid="button-save-call-settings">
            {updateSettings.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save Settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Calls() {
  const { data: contacts, isLoading: contactsLoading } = useContacts();
  const { data: settings, isLoading: settingsLoading } = useCompanySettings();
  const { mutate: makeCall, isPending: isCalling } = useMakeCall();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const [dialNumber, setDialNumber] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("keypad");
  const [showCallConfirm, setShowCallConfirm] = useState(false);
  const [showCallSettings, setShowCallSettings] = useState(false);
  const [showBlockedNumbers, setShowBlockedNumbers] = useState(false);
  const [pendingCall, setPendingCall] = useState<{ phone: string; contactId?: number; contactName?: string } | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<GroupedCall | null>(null);

  const { hasAiAssistant, isElite } = useSubscription();

  const { data: aiUsage } = useQuery<any>({
    queryKey: ["/api/ai-assistant/usage"],
    enabled: hasAiAssistant,
  });

  const browserCallsEnabled = !!(settings as any)?.browserCallsEnabled;
  const twilioDevice = useTwilioDevice(false);

  const { data: deviceStatus, refetch: refetchDeviceStatus } = useQuery<{
    browserCallsEnabled: boolean;
    activeDeviceId: string | null;
    activeDeviceName: string | null;
  }>({
    queryKey: ['/api/twilio/browser-calling/device-status'],
    enabled: browserCallsEnabled,
  });

  const isThisDeviceActive = deviceStatus?.activeDeviceId === twilioDevice.deviceId;
  const anotherDeviceActive = !!deviceStatus?.activeDeviceId && !isThisDeviceActive;

  useEffect(() => {
    if (twilioDevice.isConnected && deviceStatus && deviceStatus.activeDeviceId !== twilioDevice.deviceId) {
      twilioDevice.disconnect();
    }
  }, [deviceStatus, twilioDevice]);

  const handleConnectThisDevice = useCallback(async () => {
    twilioDevice.connect();
    setTimeout(() => refetchDeviceStatus(), 1000);
  }, [twilioDevice, refetchDeviceStatus]);

  const handleDisconnectThisDevice = useCallback(async () => {
    await twilioDevice.disconnect();
    refetchDeviceStatus();
  }, [twilioDevice, refetchDeviceStatus]);

  const [callInProgress, setCallInProgress] = useState(false);

  const { data: activeCall } = useQuery<{ status: string } | null>({
    queryKey: ['/api/calls/active'],
    refetchInterval: 15000,
    staleTime: 10000,
  });

  const { data: callHistory } = useQuery<Communication[]>({
    queryKey: ['/api/communications/calls'],
  });

  const prevActiveRef = useRef<boolean>(false);
  const refreshTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const isActive = !!activeCall?.status;

    if (prevActiveRef.current && !isActive) {
      setCallInProgress(false);

      refreshTimersRef.current.forEach(clearTimeout);
      refreshTimersRef.current = [];

      queryClient.invalidateQueries({ queryKey: ['/api/communications/calls'] });

      if (activeTab !== 'contacts') {
        setActiveTab('history');
      }
    }

    if (isActive && !prevActiveRef.current) {
      setCallInProgress(true);
    }

    prevActiveRef.current = isActive;
  }, [activeCall]);

  useEffect(() => {
    return () => {
      refreshTimersRef.current.forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    apiRequest('POST', '/api/communications/mark-all-read', { type: 'call' })
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['/api/notifications/unread'] });
      })
      .catch(() => {});
  }, []);

  const { mutate: markCallsAsReadByIds } = useMutation({
    mutationFn: async (ids: number[]) => {
      return apiRequest('POST', '/api/communications/mark-read', { ids, type: 'call' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/unread'] });
      queryClient.invalidateQueries({ queryKey: ['/api/communications/calls'] });
    }
  });

  const { data: blockedNumbersList } = useQuery<any[]>({
    queryKey: ['/api/blocked-numbers'],
  });

  const blockNumberMutation = useMutation({
    mutationFn: async ({ phoneNumber, label }: { phoneNumber: string; label?: string }) => {
      return apiRequest('POST', '/api/blocked-numbers', { phoneNumber, label });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/blocked-numbers'] });
      queryClient.invalidateQueries({ queryKey: ['/api/communications/calls'] });
      toast({ title: "Number blocked", description: "Calls from this number will be automatically rejected." });
    },
    onError: (err: any) => {
      if (err?.message?.includes('409') || err?.status === 409) {
        toast({ title: "Already blocked", description: "This number is already on your block list." });
      } else {
        toast({ title: "Failed to block number", variant: "destructive" });
      }
    },
  });

  const unblockNumberMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `/api/blocked-numbers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/blocked-numbers'] });
      queryClient.invalidateQueries({ queryKey: ['/api/communications/calls'] });
      toast({ title: "Number unblocked" });
    },
  });

  const isPhoneBlocked = useCallback((phone: string) => {
    if (!blockedNumbersList || !phone) return false;
    const normalized = phone.replace(/\D/g, '').slice(-10);
    return blockedNumbersList.some((b: any) => b.phoneNumber.replace(/\D/g, '').slice(-10) === normalized);
  }, [blockedNumbersList]);

  const markGroupAsRead = useCallback((group: GroupedCall) => {
    const unreadIds = group.calls
      .filter(c => c.direction === 'inbound' && !c.isRead)
      .map(c => c.id);
    if (unreadIds.length > 0) {
      markCallsAsReadByIds(unreadIds);
    }
  }, [markCallsAsReadByIds]);

  const groupedCalls = useMemo(() => {
    if (!callHistory || callHistory.length === 0) return [];

    const groups = new Map<string, GroupedCall>();

    for (const call of callHistory) {
      const key = call.contactId ? `contact-${call.contactId}` : `phone-${call.phoneNumber || `unknown-${call.id}`}`;

      if (!groups.has(key)) {
        const contact = contacts?.find(c => c.id === call.contactId);
        groups.set(key, {
          contactId: call.contactId,
          contactName: contact?.name || call.phoneNumber || 'Unknown',
          phoneNumber: contact?.phone || call.phoneNumber || '',
          calls: [],
          latestCall: call,
          totalCalls: 0,
          unreadCount: 0,
        });
      }

      const group = groups.get(key)!;
      group.calls.push(call);
      group.totalCalls++;
      if (!call.isRead && call.direction === 'inbound') {
        group.unreadCount++;
      }

      if (new Date(call.timestamp || 0).getTime() > new Date(group.latestCall.timestamp || 0).getTime()) {
        group.latestCall = call;
      }
    }

    return Array.from(groups.values()).sort((a, b) =>
      new Date(b.latestCall.timestamp || 0).getTime() - new Date(a.latestCall.timestamp || 0).getTime()
    );
  }, [callHistory, contacts]);

  const totalUnreadCalls = useMemo(() => {
    return groupedCalls.reduce((sum, g) => sum + g.unreadCount, 0);
  }, [groupedCalls]);

  const isOpenPhoneProvider = settings?.phoneProvider === 'openphone';
  const isTwilioConfigured = !isOpenPhoneProvider && settings?.twilioAccountSid && settings?.twilioAuthToken && settings?.twilioPhoneNumber;

  const handleDialPadPress = (digit: string) => {
    setDialNumber(prev => prev + digit);
  };

  const handleBackspace = () => {
    setDialNumber(prev => prev.slice(0, -1));
  };

  const handleCallClick = (phoneNumber: string, contactId?: number, contactName?: string) => {
    if (!phoneNumber.trim()) {
      toast({ title: "Enter a number", description: "Please enter a phone number to call", variant: "destructive" });
      return;
    }
    setPendingCall({ phone: phoneNumber, contactId, contactName });
    setShowCallConfirm(true);
  };

  const handleCallConfirm = (viaBrowser?: boolean) => {
    if (!pendingCall) return;
    setShowCallConfirm(false);

    if (viaBrowser && twilioDevice.isConnected) {
      twilioDevice.makeCall(pendingCall.phone);
      toast({
        title: "Calling via browser",
        description: `Connecting to ${pendingCall.contactName || formatPhoneDisplay(pendingCall.phone)}...`
      });
      setPendingCall(null);
      setCallInProgress(true);
      return;
    }
    
    makeCall({
      to: pendingCall.phone,
      contactId: pendingCall.contactId,
      contactName: pendingCall.contactName || pendingCall.phone
    }, {
      onSuccess: () => {
        toast({ 
          title: "Calling your office first", 
          description: `Answer your office phone to connect to ${pendingCall.contactName || formatPhoneDisplay(pendingCall.phone)}`
        });
        setPendingCall(null);
        setCallInProgress(true);
        queryClient.invalidateQueries({ queryKey: ['/api/calls/active'] });
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['/api/communications/calls'] });
        }, 3000);
      },
      onError: (err) => {
        const isOfficePhoneMissing = err.message?.toLowerCase().includes('office phone');
        toast({ 
          title: isOfficePhoneMissing ? "Office phone required" : "Failed to call", 
          description: isOfficePhoneMissing 
            ? "Set your office or cell phone number first so calls can connect to you." 
            : err.message, 
          variant: "destructive",
          action: isOfficePhoneMissing ? (
            <ToastAction altText="Go to integrations settings" onClick={() => navigate('/settings/integrations')} data-testid="button-go-to-integrations">
              Set up now
            </ToastAction>
          ) : undefined
        });
        setPendingCall(null);
      }
    });
  };

  const filteredContacts = contacts?.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.phone.includes(searchQuery)
  ) || [];

  const dialPadButtons = [
    { digit: "1", letters: "" },
    { digit: "2", letters: "ABC" },
    { digit: "3", letters: "DEF" },
    { digit: "4", letters: "GHI" },
    { digit: "5", letters: "JKL" },
    { digit: "6", letters: "MNO" },
    { digit: "7", letters: "PQRS" },
    { digit: "8", letters: "TUV" },
    { digit: "9", letters: "WXYZ" },
    { digit: "*", letters: "" },
    { digit: "0", letters: "+" },
    { digit: "#", letters: "" },
  ];

  if ((contactsLoading && !contacts) || (settingsLoading && !settings)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!isTwilioConfigured) {
    return (
      <div className="max-w-2xl mx-auto p-6 lg:p-8 space-y-8 animate-in fade-in duration-300">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
            <Phone className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display">Calls</h1>
            <p className="text-muted-foreground">Make calls to your customers</p>
          </div>
        </div>

        <Card className="border-yellow-500/50 bg-yellow-500/5">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <AlertCircle className="w-6 h-6 text-yellow-600 mt-0.5" />
              <div>
                {isOpenPhoneProvider ? (
                  <>
                    <h3 className="font-medium" data-testid="text-calls-openphone-notice">Calling Not Available with OpenPhone</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Browser calling, conference calls, call recording, and IVR features require Twilio. Switch to Twilio in your integrations settings to enable calling.
                    </p>
                    <Link href="/settings/integrations">
                      <Button className="mt-4" data-testid="link-switch-to-twilio">
                        Switch to Twilio
                      </Button>
                    </Link>
                  </>
                ) : (
                  <>
                    <h3 className="font-medium">Twilio Not Configured</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      To make calls, you need to set up your Twilio integration first.
                    </p>
                    <Link href="/settings/integrations">
                      <Button className="mt-4" data-testid="link-setup-twilio">
                        Set Up Twilio
                      </Button>
                    </Link>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto p-6 pb-24 lg:p-8 lg:pb-24 min-h-full animate-in fade-in duration-300">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
            <Phone className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display">Calls</h1>
            <p className="text-muted-foreground">
              {browserCallsEnabled
                ? twilioDevice.isConnected
                  ? "This device is receiving calls"
                  : twilioDevice.status === 'connecting'
                  ? "Connecting this device..."
                  : anotherDeviceActive
                  ? `Active on ${deviceStatus?.activeDeviceName || "another device"}`
                  : "Browser calling available"
                : settings?.twilioOfficePhone 
                ? "Calls ring your office first" 
                : "Direct calls via Twilio"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {browserCallsEnabled && (
            <div className="flex items-center gap-1.5" data-testid="status-browser-calling">
              {twilioDevice.status === 'ready' && (
                <Button size="sm" variant="outline" onClick={handleDisconnectThisDevice} data-testid="button-disconnect-device">
                  <Wifi className="w-3.5 h-3.5 mr-1 text-green-600" />
                  Connected
                </Button>
              )}
              {twilioDevice.status === 'connecting' && (
                <Button size="sm" variant="outline" disabled>
                  <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                  Connecting
                </Button>
              )}
              {twilioDevice.status === 'error' && (
                <Button size="sm" variant="outline" onClick={handleConnectThisDevice} data-testid="button-retry-connect">
                  <WifiOff className="w-3.5 h-3.5 mr-1 text-destructive" />
                  Retry
                </Button>
              )}
              {twilioDevice.status === 'on-call' && (
                <span className="flex items-center gap-1 text-xs text-primary font-medium">
                  <PhoneCall className="w-3.5 h-3.5" />
                  On Call
                </span>
              )}
              {twilioDevice.status === 'offline' && !anotherDeviceActive && (
                <Button size="sm" onClick={handleConnectThisDevice} data-testid="button-connect-device">
                  <Monitor className="w-3.5 h-3.5 mr-1" />
                  Use This Device
                </Button>
              )}
              {twilioDevice.status === 'offline' && anotherDeviceActive && (
                <Button size="sm" variant="outline" onClick={handleConnectThisDevice} data-testid="button-takeover-device">
                  <Monitor className="w-3.5 h-3.5 mr-1" />
                  Switch to This Device
                </Button>
              )}
            </div>
          )}
          {hasAiAssistant && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800" data-testid="badge-ai-active">
              <Bot className="w-3.5 h-3.5 text-blue-600" />
              <span className="text-[10px] font-semibold text-green-700 dark:text-green-400">ON</span>
            </div>
          )}
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setShowBlockedNumbers(true)}
            data-testid="button-blocked-numbers"
            className="relative"
          >
            <PhoneOff className="w-5 h-5" />
            {blockedNumbersList && blockedNumbersList.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold px-0.5">
                {blockedNumbersList.length}
              </span>
            )}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setShowCallSettings(true)}
            data-testid="button-call-settings"
          >
            <Settings className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Incoming Browser Call Banner */}
      {twilioDevice.status === 'incoming' && twilioDevice.incomingCall && (
        <Card className="mb-4 border-green-500 bg-green-50 dark:bg-green-950/30 animate-in slide-in-from-top duration-300" data-testid="card-incoming-call">
          <CardContent className="py-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center animate-pulse">
                  <PhoneIncoming className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="font-semibold text-sm" data-testid="text-incoming-caller">Incoming Call</p>
                  <p className="text-xs text-muted-foreground" data-testid="text-incoming-number">{twilioDevice.incomingCall.from}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={twilioDevice.rejectCall}
                  data-testid="button-reject-call"
                >
                  <PhoneOff className="w-4 h-4 mr-1" />
                  Decline
                </Button>
                <Button
                  size="sm"
                  className="bg-green-600 text-white"
                  onClick={twilioDevice.acceptCall}
                  data-testid="button-accept-call"
                >
                  <Phone className="w-4 h-4 mr-1" />
                  Answer
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active Browser Call Banner */}
      {twilioDevice.status === 'on-call' && (
        <Card className="mb-4 border-primary bg-primary/5" data-testid="card-active-browser-call">
          <CardContent className="py-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                  <PhoneCall className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-sm">Call in Progress</p>
                  <p className="text-xs text-muted-foreground">Connected via browser</p>
                </div>
              </div>
              <Button
                size="sm"
                variant="destructive"
                onClick={twilioDevice.hangup}
                data-testid="button-hangup-browser"
              >
                <PhoneOff className="w-4 h-4 mr-1" />
                Hang Up
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="keypad" data-testid="tab-keypad">
            <Phone className="w-4 h-4 mr-2" />
            Keypad
          </TabsTrigger>
          <TabsTrigger value="contacts" data-testid="tab-contacts">
            <User className="w-4 h-4 mr-2" />
            Contacts
          </TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history" className="relative">
            <Clock className="w-4 h-4 mr-2" />
            Recents
            {totalUnreadCalls > 0 && (
              <span 
                className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1"
                data-testid="badge-recents-unread"
              >
                {totalUnreadCalls}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="keypad" className="mt-6">
          <Card>
            <CardContent className="pt-6">
              <Input
                value={dialNumber}
                onChange={(e) => setDialNumber(e.target.value)}
                placeholder="Enter number"
                className="text-center text-2xl font-mono h-14 mb-6"
                data-testid="input-dial-number"
              />
              
              <div className="grid grid-cols-3 gap-3 mb-6">
                {dialPadButtons.map((btn) => (
                  <Button
                    key={btn.digit}
                    variant="outline"
                    className="h-16 flex flex-col items-center justify-center"
                    onClick={() => handleDialPadPress(btn.digit)}
                    data-testid={`dial-${btn.digit}`}
                  >
                    <span className="text-xl font-semibold">{btn.digit}</span>
                    {btn.letters && (
                      <span className="text-xs text-muted-foreground">{btn.letters}</span>
                    )}
                  </Button>
                ))}
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-14 w-14"
                  onClick={handleBackspace}
                  data-testid="button-backspace"
                >
                  <Delete className="w-5 h-5" />
                </Button>
                <Button
                  className="flex-1 h-14 bg-green-600 hover:bg-green-700"
                  onClick={() => handleCallClick(dialNumber)}
                  disabled={isCalling || !dialNumber.trim()}
                  data-testid="button-call"
                >
                  {isCalling ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Phone className="w-5 h-5" />
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contacts" className="mt-6">
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search contacts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search-contacts"
              />
            </div>
          </div>

          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {filteredContacts.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                {searchQuery ? "No contacts found" : "No contacts yet"}
              </p>
            ) : (
              filteredContacts.map(contact => (
                <Card 
                  key={contact.id} 
                  className="hover-elevate cursor-pointer"
                  onClick={() => handleCallClick(contact.phone, contact.id, contact.name)}
                  data-testid={`contact-call-${contact.id}`}
                >
                  <CardContent className="p-4 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-semibold flex-shrink-0">
                        {decodeHtmlEntities(contact.name)[0]}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium truncate max-w-[200px]">{decodeHtmlEntities(contact.name)}</p>
                        <p className="text-sm text-muted-foreground">{formatPhoneDisplay(contact.phone)}</p>
                      </div>
                    </div>
                    <Button 
                      size="icon" 
                      className="bg-green-600 hover:bg-green-700"
                      disabled={isCalling}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCallClick(contact.phone, contact.id, contact.name);
                      }}
                    >
                      {isCalling ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Phone className="w-4 h-4" />
                      )}
                    </Button>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {groupedCalls.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No call history yet
              </p>
            ) : (
              groupedCalls.map(group => {
                const isOutbound = group.latestCall.direction === 'outbound';
                const { text: statusText, isNegative } = getCallStatus(group.latestCall.content);
                const groupKey = group.contactId || group.phoneNumber;
                const latestContent = group.latestCall.content || '';
                const hasTranscript = latestContent.includes('---FULL_TRANSCRIPT---');
                const summaryText = hasTranscript ? latestContent.split('---FULL_TRANSCRIPT---')[0].trim() : latestContent;
                const hasSummary = summaryText.length > 0 && !['completed', 'busy', 'no-answer', 'failed', 'canceled'].some(s => summaryText.toLowerCase() === s);

                return (
                  <Card 
                    key={groupKey} 
                    className="hover-elevate cursor-pointer"
                    onClick={() => {
                      setSelectedGroup(group);
                      if (group.unreadCount > 0) {
                        markGroupAsRead(group);
                      }
                    }}
                    data-testid={`call-group-${groupKey}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="relative shrink-0">
                            <div className={cn(
                              "w-10 h-10 rounded-full flex items-center justify-center",
                              isNegative ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400" : 
                              isOutbound ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400" : "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                            )}>
                              {isNegative ? (
                                <PhoneMissed className="w-5 h-5" />
                              ) : isOutbound ? (
                                <PhoneOutgoing className="w-5 h-5" />
                              ) : (
                                <PhoneIncoming className="w-5 h-5" />
                              )}
                            </div>
                            {group.unreadCount > 0 && (
                              <span 
                                className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1"
                                data-testid={`badge-unread-calls-${groupKey}`}
                              >
                                {group.unreadCount}
                              </span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className={cn("font-medium truncate", group.unreadCount > 0 && "font-semibold")}>{decodeHtmlEntities(group.contactName)}</p>
                              {group.totalCalls > 1 && (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                  {group.totalCalls}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {group.latestCall.timestamp && format(new Date(group.latestCall.timestamp), "MMM d, h:mm a")}
                            </p>
                            {statusText && (
                              <p className={cn(
                                "text-xs mt-0.5",
                                isNegative ? "text-red-600 dark:text-red-400" : "text-muted-foreground"
                              )}>
                                {statusText}
                              </p>
                            )}
                            {hasSummary && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{summaryText.replace(/^Summary:\s*/i, '').substring(0, 80)}...</p>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Call Detail Dialog */}
      <Dialog open={!!selectedGroup} onOpenChange={(open) => { if (!open) setSelectedGroup(null); }}>
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-semibold shrink-0">
                {selectedGroup?.contactName ? decodeHtmlEntities(selectedGroup.contactName)[0] : '?'}
              </div>
              <div className="min-w-0">
                <p className="truncate">{selectedGroup?.contactName ? decodeHtmlEntities(selectedGroup.contactName) : ''}</p>
                {selectedGroup?.phoneNumber && (
                  <p className="text-sm font-normal text-muted-foreground">{formatPhoneDisplay(selectedGroup.phoneNumber)}</p>
                )}
              </div>
            </DialogTitle>
            <DialogDescription>
              {selectedGroup?.totalCalls} call{selectedGroup?.totalCalls !== 1 ? 's' : ''}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto -mx-6 px-6">
            <div className="divide-y">
              {selectedGroup?.calls
                .slice()
                .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime())
                .map(call => (
                  <CallEventItem key={call.id} call={call} />
                ))}
            </div>
          </div>

          <div className="flex gap-2 pt-4 border-t">
            {selectedGroup?.phoneNumber && (
              <>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setSelectedGroup(null);
                    const params = selectedGroup.contactId
                      ? `contactId=${selectedGroup.contactId}`
                      : `phone=${encodeURIComponent(selectedGroup.phoneNumber)}`;
                    navigate(`/messages?${params}`);
                  }}
                  data-testid="button-text-from-detail"
                >
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Text
                </Button>
                <Button 
                  className="flex-1"
                  onClick={() => {
                    setSelectedGroup(null);
                    handleCallClick(
                      selectedGroup.phoneNumber, 
                      selectedGroup.contactId || undefined, 
                      selectedGroup.contactName
                    );
                  }}
                  data-testid="button-call-from-detail"
                >
                  <Phone className="w-4 h-4 mr-2" />
                  Call Again
                </Button>
              </>
            )}
          </div>
          {selectedGroup?.phoneNumber && !selectedGroup.contactId && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 mt-1"
              onClick={() => {
                blockNumberMutation.mutate({ phoneNumber: selectedGroup.phoneNumber, label: selectedGroup.contactName !== selectedGroup.phoneNumber ? selectedGroup.contactName : undefined });
                setSelectedGroup(null);
              }}
              disabled={blockNumberMutation.isPending}
              data-testid="button-block-number"
            >
              <PhoneOff className="w-4 h-4 mr-2" />
              Block This Number
            </Button>
          )}
        </DialogContent>
      </Dialog>

      {/* Call Confirmation Dialog */}
      <Dialog open={showCallConfirm} onOpenChange={setShowCallConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
              Place a Call?
            </DialogTitle>
            <DialogDescription>
              You are about to place a call to {pendingCall?.contactName || formatPhoneDisplay(pendingCall?.phone) || 'this number'}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowCallConfirm(false)}>
              Cancel
            </Button>
            {twilioDevice.isConnected && (
              <Button variant="outline" onClick={() => handleCallConfirm(true)} data-testid="button-call-via-browser">
                <Monitor className="w-4 h-4 mr-2" />
                Call from Browser
              </Button>
            )}
            <Button onClick={() => handleCallConfirm(false)} data-testid="button-confirm-call">
              <Phone className="w-4 h-4 mr-2" />
              Call via Office Phone
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CallSettingsModal open={showCallSettings} onOpenChange={setShowCallSettings} settings={settings} />

      {/* Blocked Numbers Dialog */}
      <Dialog open={showBlockedNumbers} onOpenChange={setShowBlockedNumbers}>
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PhoneOff className="w-5 h-5 text-red-500" />
              Blocked Numbers
            </DialogTitle>
            <DialogDescription>
              Calls from these numbers will be automatically rejected and hidden from your call history.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto -mx-6 px-6">
            {!blockedNumbersList || blockedNumbersList.length === 0 ? (
              <p className="text-center text-muted-foreground py-8 text-sm">
                No blocked numbers yet. You can block a number from your call history.
              </p>
            ) : (
              <div className="space-y-2">
                {blockedNumbersList.map((blocked: any) => (
                  <div key={blocked.id} className="flex items-center justify-between p-3 rounded-lg border bg-card" data-testid={`blocked-number-${blocked.id}`}>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{blocked.label || formatPhoneDisplay(blocked.phoneNumber)}</p>
                      {blocked.label && (
                        <p className="text-xs text-muted-foreground">{formatPhoneDisplay(blocked.phoneNumber)}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Blocked {blocked.createdAt && format(new Date(blocked.createdAt), "MMM d, yyyy")}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs shrink-0"
                      onClick={() => unblockNumberMutation.mutate(blocked.id)}
                      disabled={unblockNumberMutation.isPending}
                      data-testid={`button-unblock-${blocked.id}`}
                    >
                      Unblock
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
