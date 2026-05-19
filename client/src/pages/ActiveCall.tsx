import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import {
  Phone,
  PhoneOff,
  PhoneIncoming,
  PhoneOutgoing,
  UserPlus,
  PhoneForwarded,
  LogOut,
  Loader2,
  Users,
  X,
  Pause,
  Play,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn, formatPhoneDisplay } from "@/lib/utils";
import { useContacts } from "@/hooks/use-contacts";

interface ActiveCallParticipant {
  label: string;
  phone: string;
  callSid?: string;
  role: 'office' | 'customer' | 'added';
  onHold?: boolean;
}

interface ActiveCallData {
  conferenceName: string;
  direction: 'inbound' | 'outbound';
  contactId?: number;
  contactName?: string;
  customerPhone: string;
  status: 'ringing' | 'in-progress' | 'completed';
  participants: ActiveCallParticipant[];
  startedAt: number;
}

export default function ActiveCall() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: contacts } = useContacts();

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [labelInput, setLabelInput] = useState("");
  const [elapsed, setElapsed] = useState(0);

  const { data: activeCall, isLoading } = useQuery<ActiveCallData | null>({
    queryKey: ['/api/calls/active'],
    refetchInterval: 15000,
    staleTime: 10000,
  });

  useEffect(() => {
    if (!activeCall || activeCall.status === 'completed') {
      setElapsed(0);
      return;
    }
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - activeCall.startedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [activeCall?.startedAt, activeCall?.status]);

  const addParticipantMutation = useMutation({
    mutationFn: async ({ phoneNumber, label }: { phoneNumber: string; label?: string }) => {
      const res = await apiRequest('POST', '/api/calls/add-participant', { phoneNumber, label });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Adding participant", description: "Calling the number now..." });
      setShowAddDialog(false);
      setPhoneInput("");
      setLabelInput("");
      queryClient.invalidateQueries({ queryKey: ['/api/calls/active'] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to add participant", description: err.message, variant: "destructive" });
    },
  });

  const removeParticipantMutation = useMutation({
    mutationFn: async (callSid: string) => {
      const res = await apiRequest('POST', '/api/calls/remove-participant', { callSid });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Participant removed" });
      queryClient.invalidateQueries({ queryKey: ['/api/calls/active'] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to remove", description: err.message, variant: "destructive" });
    },
  });

  const transferMutation = useMutation({
    mutationFn: async ({ phoneNumber, label }: { phoneNumber: string; label?: string }) => {
      const res = await apiRequest('POST', '/api/calls/transfer', { phoneNumber, label });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Transferring call", description: "Connecting to the new number..." });
      setShowTransferDialog(false);
      setPhoneInput("");
      setLabelInput("");
      queryClient.invalidateQueries({ queryKey: ['/api/calls/active'] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to transfer", description: err.message, variant: "destructive" });
    },
  });

  const endCallMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/calls/end');
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Call ended" });
      queryClient.setQueryData(['/api/calls/active'], null);
      queryClient.invalidateQueries({ queryKey: ['/api/calls/active'] });
      queryClient.invalidateQueries({ queryKey: ['/api/communications/calls'] });
      navigate('/calls');
    },
    onError: (err: Error) => {
      if (err.message?.includes("No active call") || err.message?.includes("already ended")) {
        queryClient.setQueryData(['/api/calls/active'], null);
        queryClient.invalidateQueries({ queryKey: ['/api/calls/active'] });
        queryClient.invalidateQueries({ queryKey: ['/api/communications/calls'] });
        toast({ title: "Call ended" });
        navigate('/calls');
      } else {
        toast({ title: "Failed to end call", description: err.message, variant: "destructive" });
      }
    },
  });

  const leaveCallMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/calls/leave');
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "You left the call", description: "Other participants are still connected" });
      queryClient.setQueryData(['/api/calls/active'], null);
      queryClient.invalidateQueries({ queryKey: ['/api/calls/active'] });
      queryClient.invalidateQueries({ queryKey: ['/api/communications/calls'] });
      navigate('/calls');
    },
    onError: (err: Error) => {
      if (err.message?.includes("No active call") || err.message?.includes("already ended")) {
        queryClient.setQueryData(['/api/calls/active'], null);
        queryClient.invalidateQueries({ queryKey: ['/api/calls/active'] });
        queryClient.invalidateQueries({ queryKey: ['/api/communications/calls'] });
        toast({ title: "Call ended" });
        navigate('/calls');
      } else {
        toast({ title: "Failed to leave", description: err.message, variant: "destructive" });
      }
    },
  });

  const holdParticipantMutation = useMutation({
    mutationFn: async (callSid: string) => {
      const res = await apiRequest('POST', '/api/calls/hold-participant', { callSid });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Participant placed on hold" });
      queryClient.invalidateQueries({ queryKey: ['/api/calls/active'] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to hold", description: err.message, variant: "destructive" });
    },
  });

  const unholdParticipantMutation = useMutation({
    mutationFn: async (callSid: string) => {
      const res = await apiRequest('POST', '/api/calls/unhold-participant', { callSid });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Participant taken off hold" });
      queryClient.invalidateQueries({ queryKey: ['/api/calls/active'] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to unhold", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!activeCall || activeCall.status === 'completed') {
    return (
      <div className="max-w-lg mx-auto p-6 lg:p-8 animate-in fade-in duration-300">
        <div className="text-center py-16 space-y-4">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto">
            <Phone className="w-8 h-8 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold">No Active Call</h2>
          <p className="text-muted-foreground">There is no call in progress right now.</p>
          <Button variant="outline" onClick={() => navigate('/calls')} data-testid="button-go-to-calls">
            Go to Calls
          </Button>
        </div>
      </div>
    );
  }

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  const isRinging = activeCall.status === 'ringing';
  const isInbound = activeCall.direction === 'inbound';
  const hasMultipleParticipants = activeCall.participants.length > 1;

  const contactSuggestions = contacts?.filter(c =>
    c.phone &&
    (c.name.toLowerCase().includes(phoneInput.toLowerCase()) || c.phone.includes(phoneInput))
  )?.slice(0, 5) || [];

  return (
    <div className="max-w-lg mx-auto p-6 pb-24 lg:p-8 lg:pb-24 animate-in fade-in duration-300">
      <div className="text-center mb-8">
        <div className={cn(
          "w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4",
          isRinging ? "bg-yellow-500/20 animate-pulse" : "bg-green-500/20"
        )}>
          {isInbound ? (
            <PhoneIncoming className={cn("w-10 h-10", isRinging ? "text-yellow-600 dark:text-yellow-400" : "text-green-600 dark:text-green-400")} />
          ) : (
            <PhoneOutgoing className={cn("w-10 h-10", isRinging ? "text-yellow-600 dark:text-yellow-400" : "text-green-600 dark:text-green-400")} />
          )}
        </div>
        <h1 className="text-2xl font-bold" data-testid="text-call-name">
          {activeCall.contactName || activeCall.customerPhone}
        </h1>
        <p className="text-muted-foreground mt-1" data-testid="text-call-status">
          {isRinging ? (isInbound ? "Incoming Call..." : "Ringing...") : timeStr}
        </p>
        <p className="text-sm text-muted-foreground">
          {activeCall.customerPhone}
        </p>
      </div>

      <div className="space-y-4 mb-8">
        <div className="flex items-center gap-2 mb-2">
          <Users className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Participants ({activeCall.participants.length})</span>
        </div>
        {activeCall.participants.map((p, i) => (
          <Card key={i} className={cn(p.onHold && "opacity-70")}>
            <CardContent className="p-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm shrink-0",
                  p.onHold ? "bg-yellow-100 text-yellow-600 dark:bg-yellow-900 dark:text-yellow-300" :
                  p.role === 'office' ? "bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300" :
                  p.role === 'customer' ? "bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-300" :
                  "bg-purple-100 text-purple-600 dark:bg-purple-900 dark:text-purple-300"
                )}>
                  {p.onHold ? <Pause className="w-4 h-4" /> : (p.label[0]?.toUpperCase() || '?')}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{p.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.onHold ? "On Hold" : formatPhoneDisplay(p.phone)}
                  </p>
                </div>
              </div>
              {p.callSid && (
                <div className="flex items-center gap-1 shrink-0">
                  {p.onHold ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-green-600 dark:text-green-400"
                      onClick={() => unholdParticipantMutation.mutate(p.callSid!)}
                      disabled={unholdParticipantMutation.isPending}
                      data-testid={`button-unhold-participant-${i}`}
                    >
                      <Play className="w-4 h-4" />
                    </Button>
                  ) : (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => holdParticipantMutation.mutate(p.callSid!)}
                      disabled={holdParticipantMutation.isPending}
                      data-testid={`button-hold-participant-${i}`}
                    >
                      <Pause className="w-4 h-4" />
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => removeParticipantMutation.mutate(p.callSid!)}
                    disabled={removeParticipantMutation.isPending}
                    data-testid={`button-remove-participant-${i}`}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <Button
          variant="outline"
          className="h-16 flex flex-col items-center justify-center gap-1"
          onClick={() => { setPhoneInput(""); setLabelInput(""); setShowAddDialog(true); }}
          disabled={isRinging}
          data-testid="button-add-participant"
        >
          <UserPlus className="w-5 h-5" />
          <span className="text-xs">Add Person</span>
        </Button>
        <Button
          variant="outline"
          className="h-16 flex flex-col items-center justify-center gap-1"
          onClick={() => { setPhoneInput(""); setLabelInput(""); setShowTransferDialog(true); }}
          disabled={isRinging}
          data-testid="button-transfer-call"
        >
          <PhoneForwarded className="w-5 h-5" />
          <span className="text-xs">Transfer</span>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {hasMultipleParticipants && (
          <Button
            variant="outline"
            className="h-14"
            onClick={() => leaveCallMutation.mutate()}
            disabled={leaveCallMutation.isPending}
            data-testid="button-leave-call"
          >
            {leaveCallMutation.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
            ) : (
              <LogOut className="w-5 h-5 mr-2" />
            )}
            Leave Call
          </Button>
        )}
        <Button
          variant="destructive"
          className={cn("h-14", !hasMultipleParticipants && "col-span-2")}
          onClick={() => endCallMutation.mutate()}
          disabled={endCallMutation.isPending}
          data-testid="button-end-call"
        >
          {endCallMutation.isPending ? (
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
          ) : (
            <PhoneOff className="w-5 h-5 mr-2" />
          )}
          End Call
        </Button>
      </div>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5" />
              Add to Call
            </DialogTitle>
            <DialogDescription>
              Add another person to this conference call.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Phone number"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              data-testid="input-add-phone"
            />
            <Input
              placeholder="Name (optional)"
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              data-testid="input-add-label"
            />
            {phoneInput && contactSuggestions.length > 0 && (
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {contactSuggestions.map(c => (
                  <div
                    key={c.id}
                    className="p-2 text-sm rounded-md hover-elevate cursor-pointer flex justify-between"
                    onClick={() => { setPhoneInput(c.phone); setLabelInput(c.name); }}
                    data-testid={`suggest-contact-${c.id}`}
                  >
                    <span>{c.name}</span>
                    <span className="text-muted-foreground">{formatPhoneDisplay(c.phone)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button
              onClick={() => addParticipantMutation.mutate({ phoneNumber: phoneInput, label: labelInput || undefined })}
              disabled={!phoneInput.trim() || addParticipantMutation.isPending}
              data-testid="button-confirm-add"
            >
              {addParticipantMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <UserPlus className="w-4 h-4 mr-2" />}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showTransferDialog} onOpenChange={setShowTransferDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PhoneForwarded className="w-5 h-5" />
              Transfer Call
            </DialogTitle>
            <DialogDescription>
              Transfer this call to another number. You will be disconnected after the transfer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Phone number"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              data-testid="input-transfer-phone"
            />
            <Input
              placeholder="Name (optional)"
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              data-testid="input-transfer-label"
            />
            {phoneInput && contactSuggestions.length > 0 && (
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {contactSuggestions.map(c => (
                  <div
                    key={c.id}
                    className="p-2 text-sm rounded-md hover-elevate cursor-pointer flex justify-between"
                    onClick={() => { setPhoneInput(c.phone); setLabelInput(c.name); }}
                  >
                    <span>{c.name}</span>
                    <span className="text-muted-foreground">{formatPhoneDisplay(c.phone)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowTransferDialog(false)}>Cancel</Button>
            <Button
              onClick={() => transferMutation.mutate({ phoneNumber: phoneInput, label: labelInput || undefined })}
              disabled={!phoneInput.trim() || transferMutation.isPending}
              data-testid="button-confirm-transfer"
            >
              {transferMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <PhoneForwarded className="w-4 h-4 mr-2" />}
              Transfer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
