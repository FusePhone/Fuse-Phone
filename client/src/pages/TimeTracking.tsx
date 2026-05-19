import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { TeamMember, TimeEntryWithMember } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import ProjectPicker from "@/components/ProjectPicker";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Clock, Play, Square, Users, Loader2, Trash2, Plus, MapPin, Pencil, AlertCircle } from "lucide-react";
import { format } from "date-fns";

export default function TimeTracking() {
  const { toast } = useToast();
  const [showManualDialog, setShowManualDialog] = useState(false);
  const [manualMemberId, setManualMemberId] = useState("");
  const [manualDate, setManualDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [manualHours, setManualHours] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [editingEntry, setEditingEntry] = useState<TimeEntryWithMember | null>(null);
  const [editClockIn, setEditClockIn] = useState("");
  const [editClockOut, setEditClockOut] = useState("");
  const [editReason, setEditReason] = useState("");

  const { data: members = [], isLoading: membersLoading } = useQuery<TeamMember[]>({
    queryKey: ["/api/team-members"],
  });

  const { data: timeEntries = [], isLoading: entriesLoading } = useQuery<TimeEntryWithMember[]>({
    queryKey: ["/api/time-entries"],
  });

  const { data: projects = [] } = useQuery<any[]>({
    queryKey: ["/api/projects"],
    queryFn: async () => {
      const res = await fetch("/api/projects", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const clockInMutation = useMutation({
    mutationFn: (data: { teamMemberId: number; projectId?: number }) =>
      apiRequest("POST", "/api/crew/clock-in", data),
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: ["/api/time-entries"] });
      const prev = queryClient.getQueryData<TimeEntryWithMember[]>(["/api/time-entries"]);
      const member = members.find(m => m.id === data.teamMemberId);
      if (prev && member) {
        queryClient.setQueryData<TimeEntryWithMember[]>(["/api/time-entries"], [
          ...prev,
          { id: Date.now(), teamMemberId: data.teamMemberId, projectId: data.projectId || null, clockIn: new Date().toISOString(), clockOut: null, totalMinutes: null, notes: null, userId: '', memberName: member.name, memberRole: member.role, clockInLat: null, clockInLng: null, clockOutLat: null, clockOutLng: null, editedAt: null, editedBy: null, editReason: null, originalClockIn: null, originalClockOut: null } as any,
        ]);
      }
      return { prev };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      toast({ title: "Clocked in" });
    },
    onError: (err: any, _vars, context) => {
      if (context?.prev) queryClient.setQueryData(["/api/time-entries"], context.prev);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const clockOutMutation = useMutation({
    mutationFn: (data: { teamMemberId: number }) =>
      apiRequest("POST", "/api/crew/clock-out", data),
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: ["/api/time-entries"] });
      const prev = queryClient.getQueryData<TimeEntryWithMember[]>(["/api/time-entries"]);
      if (prev) {
        queryClient.setQueryData<TimeEntryWithMember[]>(["/api/time-entries"],
          prev.map(e => e.teamMemberId === data.teamMemberId && !e.clockOut
            ? { ...e, clockOut: new Date().toISOString(), totalMinutes: Math.round((Date.now() - new Date(e.clockIn).getTime()) / 60000) }
            : e
          )
        );
      }
      return { prev };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      toast({ title: "Clocked out" });
    },
    onError: (err: any, _vars, context) => {
      if (context?.prev) queryClient.setQueryData(["/api/time-entries"], context.prev);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const createEntryMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/time-entries", data),
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: ["/api/time-entries"] });
      const prev = queryClient.getQueryData<TimeEntryWithMember[]>(["/api/time-entries"]);
      const member = members.find(m => m.id === Number(data.teamMemberId));
      if (prev && member) {
        queryClient.setQueryData<TimeEntryWithMember[]>(["/api/time-entries"], [
          ...prev,
          { id: Date.now(), teamMemberId: Number(data.teamMemberId), projectId: data.projectId || null, clockIn: data.clockIn, clockOut: data.clockOut, totalMinutes: data.totalMinutes || 0, notes: data.notes || null, userId: '', memberName: member.name, memberRole: member.role, clockInLat: null, clockInLng: null, clockOutLat: null, clockOutLng: null, editedAt: null, editedBy: null, editReason: null, originalClockIn: null, originalClockOut: null } as any,
        ]);
      }
      return { prev };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      toast({ title: "Time entry added" });
      setShowManualDialog(false);
      setManualMemberId("");
      setManualHours("");
      setManualNotes("");
    },
    onError: (err: any, _vars, context) => {
      if (context?.prev) queryClient.setQueryData(["/api/time-entries"], context.prev);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteEntryMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/time-entries/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      toast({ title: "Time entry removed" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const editEntryMutation = useMutation({
    mutationFn: (data: { id: number; clockIn: string; clockOut: string; editReason: string }) =>
      apiRequest("PATCH", `/api/time-entries/${data.id}`, {
        clockIn: data.clockIn,
        clockOut: data.clockOut,
        editReason: data.editReason,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-jobs/weekly-summary"] });
      toast({ title: "Time entry updated" });
      setEditingEntry(null);
      setEditReason("");
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  function openEditDialog(entry: TimeEntryWithMember) {
    setEditingEntry(entry);
    setEditClockIn(format(new Date(entry.clockIn), "yyyy-MM-dd'T'HH:mm"));
    setEditClockOut(entry.clockOut ? format(new Date(entry.clockOut), "yyyy-MM-dd'T'HH:mm") : "");
    setEditReason("");
  }

  function handleEditSubmit() {
    if (!editingEntry || !editClockIn || !editClockOut) {
      toast({ title: "Clock in and clock out times are required", variant: "destructive" });
      return;
    }
    if (!editReason.trim()) {
      toast({ title: "Please provide a reason for this edit", variant: "destructive" });
      return;
    }
    const ciDate = new Date(editClockIn);
    const coDate = new Date(editClockOut);
    if (coDate <= ciDate) {
      toast({ title: "Clock out must be after clock in", variant: "destructive" });
      return;
    }
    editEntryMutation.mutate({
      id: editingEntry.id,
      clockIn: ciDate.toISOString(),
      clockOut: coDate.toISOString(),
      editReason: editReason.trim(),
    });
  }

  const crewMembers = members.filter(m => m.role === "crew" || m.role === "lead");
  const activeEntries = timeEntries.filter(e => !e.clockOut);

  function isClocked(memberId: number) {
    return activeEntries.some(e => e.teamMemberId === memberId);
  }

  function getActiveEntry(memberId: number) {
    return activeEntries.find(e => e.teamMemberId === memberId);
  }

  function handleManualSubmit() {
    if (!manualMemberId || !manualHours) {
      toast({ title: "Please fill in all required fields", variant: "destructive" });
      return;
    }
    const hours = parseFloat(manualHours);
    if (isNaN(hours) || hours <= 0) {
      toast({ title: "Invalid hours", variant: "destructive" });
      return;
    }
    const clockIn = new Date(`${manualDate}T08:00:00`);
    const clockOut = new Date(clockIn.getTime() + hours * 60 * 60 * 1000);
    createEntryMutation.mutate({
      teamMemberId: parseInt(manualMemberId),
      projectId: selectedProjectId ? parseInt(selectedProjectId) : null,
      clockIn: clockIn.toISOString(),
      clockOut: clockOut.toISOString(),
      totalMinutes: Math.round(hours * 60),
      notes: manualNotes || null,
    });
  }

  const isLoading = membersLoading || entriesLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const recentEntries = timeEntries.filter(e => e.clockOut).slice(0, 20);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-time-tracking-title">Time Tracking</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Clock in/out team members and track working hours by project.
          </p>
        </div>
        <Button onClick={() => setShowManualDialog(true)} data-testid="button-add-manual-entry">
          <Plus className="w-4 h-4 mr-2" />
          Manual Entry
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Clock className="w-5 h-5" />
            Clock In / Out
          </CardTitle>
          <CardDescription>Tap to clock team members in or out. Active members show in green.</CardDescription>
        </CardHeader>
        <CardContent>
          {crewMembers.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-2">No team members added yet. Add them in Team Members settings.</p>
          ) : (
            <div className="space-y-2">
              {crewMembers.map((member) => {
                const active = isClocked(member.id);
                const activeEntry = getActiveEntry(member.id);
                const elapsed = activeEntry ? Math.round((Date.now() - new Date(activeEntry.clockIn).getTime()) / 60000) : 0;
                const elapsedHrs = Math.floor(elapsed / 60);
                const elapsedMins = elapsed % 60;
                return (
                  <div
                    key={member.id}
                    className={`flex items-center justify-between gap-3 p-3 rounded-md border flex-wrap ${active ? "border-green-500/50 bg-green-50 dark:bg-green-950/20" : ""}`}
                    data-testid={`clock-member-${member.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{member.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="secondary" className="text-xs">
                          {member.role === "lead" ? "Lead" : "Crew"}
                        </Badge>
                        {member.hourlyRate != null && member.hourlyRate > 0 && (
                          <span className="text-xs text-muted-foreground">${(member.hourlyRate / 100).toFixed(2)}/hr</span>
                        )}
                        {active && (
                          <span className="text-xs font-medium text-green-700 dark:text-green-400">
                            Active: {elapsedHrs}h {elapsedMins}m
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant={active ? "destructive" : "default"}
                      size="sm"
                      onClick={() => {
                        if (active) {
                          clockOutMutation.mutate({ teamMemberId: member.id });
                        } else {
                          clockInMutation.mutate({ teamMemberId: member.id });
                        }
                      }}
                      disabled={clockInMutation.isPending || clockOutMutation.isPending}
                      data-testid={active ? `button-clock-out-${member.id}` : `button-clock-in-${member.id}`}
                    >
                      {active ? (
                        <>
                          <Square className="w-3.5 h-3.5 mr-1" />
                          Clock Out
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5 mr-1" />
                          Clock In
                        </>
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="w-5 h-5" />
            Recent Time Entries
          </CardTitle>
          <CardDescription>Completed time entries from your crew</CardDescription>
        </CardHeader>
        <CardContent>
          {recentEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-2">No completed time entries yet</p>
          ) : (
            <div className="space-y-2">
              {recentEntries.map((entry) => {
                const hours = entry.totalMinutes ? (entry.totalMinutes / 60).toFixed(1) : "-";
                const cost = entry.totalMinutes && entry.teamMember?.hourlyRate
                  ? ((entry.totalMinutes / 60) * entry.teamMember.hourlyRate / 100).toFixed(2)
                  : null;
                return (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-md border flex-wrap"
                    data-testid={`time-entry-${entry.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{entry.teamMember?.name || "Unknown"}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        <span>{format(new Date(entry.clockIn), "MMM d, yyyy")}</span>
                        <span>
                          {format(new Date(entry.clockIn), "h:mm a")} - {entry.clockOut ? format(new Date(entry.clockOut), "h:mm a") : "—"}
                        </span>
                        <span className="font-medium">{hours}h</span>
                        {cost && <span className="text-green-700 dark:text-green-400">${cost}</span>}
                      </div>
                      {entry.notes && <p className="text-xs text-muted-foreground mt-1">{entry.notes}</p>}
                      {(entry as any).editedAt && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="inline-flex items-center gap-1 mt-1.5 text-xs text-amber-600 dark:text-amber-400" data-testid={`badge-edited-${entry.id}`}>
                                <AlertCircle className="w-3 h-3" />
                                Edited {format(new Date((entry as any).editedAt), "MMM d 'at' h:mm a")}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-xs">
                              <p className="text-xs font-medium">Reason: {(entry as any).editReason || "No reason provided"}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      {(entry.clockInLat || entry.clockOutLat) && (
                        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                          {entry.clockInLat && entry.clockInLng && (
                            <a
                              href={`https://www.google.com/maps?q=${entry.clockInLat},${entry.clockInLng}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                              data-testid={`link-clockin-location-${entry.id}`}
                            >
                              <MapPin className="w-3 h-3" />
                              Clock In Location
                            </a>
                          )}
                          {entry.clockOutLat && entry.clockOutLng && (
                            <a
                              href={`https://www.google.com/maps?q=${entry.clockOutLat},${entry.clockOutLng}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                              data-testid={`link-clockout-location-${entry.id}`}
                            >
                              <MapPin className="w-3 h-3" />
                              Clock Out Location
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(entry)}
                        data-testid={`button-edit-entry-${entry.id}`}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteEntryMutation.mutate(entry.id)}
                        data-testid={`button-delete-entry-${entry.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showManualDialog} onOpenChange={setShowManualDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Manual Time Entry</DialogTitle>
            <DialogDescription>Record hours worked by a team member</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Team Member *</Label>
              <Select value={manualMemberId} onValueChange={setManualMemberId}>
                <SelectTrigger data-testid="select-manual-member">
                  <SelectValue placeholder="Select team member" />
                </SelectTrigger>
                <SelectContent>
                  {crewMembers.map(m => (
                    <SelectItem key={m.id} value={m.id.toString()}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Project (optional)</Label>
              <ProjectPicker
                projects={projects}
                value={selectedProjectId}
                onValueChange={setSelectedProjectId}
                placeholder="Select project"
                data-testid="select-manual-project"
              />
            </div>
            <div className="space-y-2">
              <Label>Date *</Label>
              <Input
                type="date"
                value={manualDate}
                onChange={(e) => setManualDate(e.target.value)}
                data-testid="input-manual-date"
              />
            </div>
            <div className="space-y-2">
              <Label>Hours Worked *</Label>
              <Input
                type="number"
                step="0.5"
                min="0.5"
                value={manualHours}
                onChange={(e) => setManualHours(e.target.value)}
                placeholder="8"
                data-testid="input-manual-hours"
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input
                value={manualNotes}
                onChange={(e) => setManualNotes(e.target.value)}
                placeholder="Optional notes"
                data-testid="input-manual-notes"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowManualDialog(false)}>Cancel</Button>
            <Button onClick={handleManualSubmit} disabled={createEntryMutation.isPending} data-testid="button-save-time-entry">
              {createEntryMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Add Entry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingEntry} onOpenChange={(open) => { if (!open) setEditingEntry(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Time Entry</DialogTitle>
            <DialogDescription>
              {editingEntry?.teamMember?.name ? `Editing hours for ${editingEntry.teamMember.name}` : "Adjust clock in/out times"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Clock In *</Label>
              <Input
                type="datetime-local"
                value={editClockIn}
                onChange={(e) => setEditClockIn(e.target.value)}
                data-testid="input-edit-clock-in"
              />
            </div>
            <div className="space-y-2">
              <Label>Clock Out *</Label>
              <Input
                type="datetime-local"
                value={editClockOut}
                onChange={(e) => setEditClockOut(e.target.value)}
                data-testid="input-edit-clock-out"
              />
            </div>
            {editClockIn && editClockOut && new Date(editClockOut) > new Date(editClockIn) && (
              <div className="text-sm text-muted-foreground bg-muted/50 rounded-md p-2">
                Total: {((new Date(editClockOut).getTime() - new Date(editClockIn).getTime()) / 3600000).toFixed(1)} hours
              </div>
            )}
            <div className="space-y-2">
              <Label>Reason for Edit *</Label>
              <Textarea
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                placeholder="Explain why this entry is being changed..."
                rows={3}
                data-testid="input-edit-reason"
              />
              <p className="text-xs text-muted-foreground">The team member will see this note on their time entry.</p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditingEntry(null)}>Cancel</Button>
            <Button onClick={handleEditSubmit} disabled={editEntryMutation.isPending} data-testid="button-save-edit-entry">
              {editEntryMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
