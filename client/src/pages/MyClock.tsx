import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Clock, Play, Square, Loader2, CheckCircle2, AlertCircle, MapPin, ArrowLeft, Navigation, MessageSquare } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { haversineDistance, geocodeAddress, getCurrentPosition, PROXIMITY_METERS } from "@/lib/geo-utils";

interface UserCapabilities {
  isOwner: boolean;
  role: string | null;
  capabilities: Record<string, boolean>;
  linkedTeamMemberId: number | null;
}

interface AssignedJob {
  id: number;
  title: string;
  address: string | null;
  city: string | null;
  state: string | null;
  scheduledDate: string | null;
  scheduledTime: string | null;
}

interface ProximityBlock {
  jobTitle: string;
  jobAddress: string;
  distanceFeet: number;
  projectId: number;
}

export default function MyClock() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackType, setFeedbackType] = useState<"success" | "error">("success");
  const [elapsedDisplay, setElapsedDisplay] = useState("");
  const [gpsStatus, setGpsStatus] = useState<"idle" | "fetching" | "success" | "denied">("idle");
  const [proximityBlock, setProximityBlock] = useState<ProximityBlock | null>(null);
  const [checkingProximity, setCheckingProximity] = useState(false);
  const [autoClockTriggered, setAutoClockTriggered] = useState(false);

  const preselectedProjectId = (() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const pid = params.get('projectId');
      return pid ? parseInt(pid) : null;
    } catch { return null; }
  })();

  const { data: userCaps, isLoading: capsLoading } = useQuery<UserCapabilities>({
    queryKey: ['/api/user/capabilities'],
    staleTime: 60000,
  });

  const linkedMemberId = userCaps?.linkedTeamMemberId;

  const { data: timeEntries = [], isLoading: entriesLoading } = useQuery<any[]>({
    queryKey: ['/api/time-entries', { teamMemberId: linkedMemberId }],
    queryFn: async () => {
      if (!linkedMemberId) return [];
      const res = await fetch(`/api/time-entries?teamMemberId=${linkedMemberId}`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!linkedMemberId,
    refetchInterval: 30000,
  });

  const { data: assignedJobs = [] } = useQuery<AssignedJob[]>({
    queryKey: ['/api/my-jobs'],
  });

  const activeEntry = timeEntries.find((e: any) => !e.clockOut);
  const isClockedIn = !!activeEntry;
  const isLoading = capsLoading || entriesLoading;

  const getLocation = useCallback((): Promise<{ lat: string; lng: string } | null> => {
    if (!navigator.geolocation) return Promise.resolve(null);
    setGpsStatus("fetching");
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setGpsStatus("success");
          resolve({ lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6) });
        },
        () => {
          setGpsStatus("denied");
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    });
  }, []);

  useEffect(() => {
    if (feedbackMessage) {
      const timer = setTimeout(() => setFeedbackMessage(""), 8000);
      return () => clearTimeout(timer);
    }
  }, [feedbackMessage]);

  useEffect(() => {
    if (isClockedIn && activeEntry?.clockIn) {
      const update = () => {
        const elapsed = Math.round((Date.now() - new Date(activeEntry.clockIn).getTime()) / 60000);
        const hrs = Math.floor(elapsed / 60);
        const mins = elapsed % 60;
        setElapsedDisplay(`${hrs}h ${mins}m`);
      };
      update();
      const interval = setInterval(update, 60000);
      return () => clearInterval(interval);
    }
  }, [isClockedIn, activeEntry?.clockIn]);

  const clockInMutation = useMutation({
    mutationFn: async (projectId?: number) => {
      const location = await getLocation();
      return apiRequest('POST', '/api/crew/clock-in', {
        teamMemberId: linkedMemberId,
        projectId: projectId || null,
        lat: location?.lat || null,
        lng: location?.lng || null,
      });
    },
    onMutate: async (projectId?: number) => {
      const qk = ['/api/time-entries', { teamMemberId: linkedMemberId }];
      await queryClient.cancelQueries({ queryKey: qk });
      const prev = queryClient.getQueryData<any[]>(qk);
      if (prev && linkedMemberId) {
        queryClient.setQueryData(qk, [
          ...prev,
          { id: Date.now(), teamMemberId: linkedMemberId, projectId: projectId || null, clockIn: new Date().toISOString(), clockOut: null, totalMinutes: null, notes: null, userId: '' },
        ]);
      }
      return { prev, qk };
    },
    onSuccess: () => {
      setFeedbackMessage("Clocked in!");
      setFeedbackType("success");
      setProximityBlock(null);
      queryClient.invalidateQueries({ queryKey: ['/api/time-entries'] });
    },
    onError: (err: any, _vars, context) => {
      if (context?.prev) queryClient.setQueryData(context.qk, context.prev);
      setFeedbackMessage(err?.message || "Clock in failed");
      setFeedbackType("error");
    },
  });

  const clockOutMutation = useMutation({
    mutationFn: async () => {
      const location = await getLocation();
      return apiRequest('POST', '/api/crew/clock-out', {
        teamMemberId: linkedMemberId,
        lat: location?.lat || null,
        lng: location?.lng || null,
      });
    },
    onMutate: async () => {
      const qk = ['/api/time-entries', { teamMemberId: linkedMemberId }];
      await queryClient.cancelQueries({ queryKey: qk });
      const prev = queryClient.getQueryData<any[]>(qk);
      if (prev && linkedMemberId) {
        queryClient.setQueryData(qk,
          prev.map((e: any) => e.teamMemberId === linkedMemberId && !e.clockOut
            ? { ...e, clockOut: new Date().toISOString(), totalMinutes: Math.round((Date.now() - new Date(e.clockIn).getTime()) / 60000) }
            : e
          )
        );
      }
      return { prev, qk };
    },
    onSuccess: () => {
      setFeedbackMessage("Clocked out!");
      setFeedbackType("success");
      queryClient.invalidateQueries({ queryKey: ['/api/time-entries'] });
    },
    onError: (err: any, _vars, context) => {
      if (context?.prev) queryClient.setQueryData(context.qk, context.prev);
      setFeedbackMessage(err?.message || "Clock out failed");
      setFeedbackType("error");
    },
  });

  const handleClockIn = useCallback(async (projectId?: number) => {
    setProximityBlock(null);

    if (!projectId) {
      clockInMutation.mutate(undefined);
      return;
    }

    const job = assignedJobs.find(j => j.id === projectId);
    const jobAddress = job ? [job.address, job.city, job.state].filter(Boolean).join(', ') : '';

    if (!jobAddress) {
      clockInMutation.mutate(projectId);
      return;
    }

    setCheckingProximity(true);
    try {
      const userPos = await getCurrentPosition();
      if (!userPos) {
        setFeedbackMessage("Location access is required to clock in. Please enable GPS and try again.");
        setFeedbackType("error");
        setCheckingProximity(false);
        return;
      }

      const jobCoords = await geocodeAddress(jobAddress);
      if (!jobCoords) {
        console.warn('[GPS] Could not geocode job address, allowing clock-in');
        clockInMutation.mutate(projectId);
        setCheckingProximity(false);
        return;
      }

      const distanceMeters = haversineDistance(userPos.lat, userPos.lng, jobCoords.lat, jobCoords.lng);
      const distanceFeet = Math.round(distanceMeters * 3.28084);

      if (distanceMeters <= PROXIMITY_METERS) {
        clockInMutation.mutate(projectId);
      } else {
        setProximityBlock({
          jobTitle: job?.title || 'Job Site',
          jobAddress,
          distanceFeet,
          projectId,
        });
      }
    } catch (err) {
      console.error('[GPS] Proximity check error:', err);
      clockInMutation.mutate(projectId);
    } finally {
      setCheckingProximity(false);
    }
  }, [assignedJobs, clockInMutation]);

  useEffect(() => {
    if (preselectedProjectId && !autoClockTriggered && !isClockedIn && !isLoading && linkedMemberId && assignedJobs.length > 0) {
      const job = assignedJobs.find(j => j.id === preselectedProjectId);
      if (job) {
        setAutoClockTriggered(true);
        handleClockIn(preselectedProjectId);
      }
    }
  }, [preselectedProjectId, autoClockTriggered, isClockedIn, isLoading, linkedMemberId, assignedJobs, handleClockIn]);

  const isClocking = clockInMutation.isPending || clockOutMutation.isPending || checkingProximity;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!linkedMemberId) {
    return (
      <div className="max-w-sm mx-auto pt-12 px-4 text-center">
        <Card>
          <CardContent className="py-12">
            <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">Account Not Linked</h2>
            <p className="text-sm text-muted-foreground">Your account is not linked to a team member profile. Ask your employer to link your account.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const todayDate = new Date();
  const todayStr = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, '0')}-${String(todayDate.getDate()).padStart(2, '0')}`;
  const todayJobs = assignedJobs.filter(j => j.scheduledDate === todayStr);
  const otherJobs = assignedJobs.filter(j => j.scheduledDate !== todayStr && (j.address || j.city));
  const activeJobName = activeEntry?.projectId ? assignedJobs.find(j => j.id === activeEntry.projectId)?.title : null;
  const activeJobAddress = activeEntry?.projectId ? (() => {
    const j = assignedJobs.find(j => j.id === activeEntry.projectId);
    return j ? [j.address, j.city, j.state].filter(Boolean).join(', ') : null;
  })() : null;

  return (
    <div className="max-w-sm mx-auto space-y-4 pb-28">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')} data-testid="button-back-home">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold" data-testid="text-my-clock-title">My Clock</h1>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Navigation className={`w-3 h-3 ${gpsStatus === "denied" ? "text-amber-500" : "text-green-500"}`} />
            <span className="text-xs text-muted-foreground">
              {gpsStatus === "fetching" ? "Getting location..." : gpsStatus === "denied" ? "Location unavailable" : "GPS tracking enabled"}
            </span>
          </div>
        </div>
      </div>

      {feedbackMessage && (
        <Card className={feedbackType === "success" ? "border-green-500/50 bg-green-50 dark:bg-green-950/20" : "border-red-500/50 bg-red-50 dark:bg-red-950/20"}>
          <CardContent className="flex items-center gap-3 p-4">
            {feedbackType === "success" ? (
              <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0" />
            )}
            <p className={`text-sm font-medium ${feedbackType === "success" ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"}`} data-testid="text-clock-feedback">
              {feedbackMessage}
            </p>
          </CardContent>
        </Card>
      )}

      {proximityBlock && (
        <Card className="border-amber-400/60 bg-amber-50 dark:bg-amber-950/20" data-testid="card-proximity-block">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-200" data-testid="text-proximity-title">
                  You're not near the job site
                </p>
                <p className="text-sm text-amber-700 dark:text-amber-300 mt-1" data-testid="text-proximity-message">
                  You need to be within 150 feet of <strong>{proximityBlock.jobAddress}</strong> to clock in. You appear to be about {proximityBlock.distanceFeet.toLocaleString()} feet away.
                </p>
                <p className="text-sm text-amber-700 dark:text-amber-300 mt-2">
                  If you're having trouble, send a message to the office or call your supervisor.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 border-amber-300 dark:border-amber-700"
                onClick={() => navigate('/messages')}
                data-testid="button-message-office"
              >
                <MessageSquare className="w-4 h-4 mr-2" />
                Message Office
              </Button>
              <Button
                variant="outline"
                className="flex-1 border-amber-300 dark:border-amber-700"
                onClick={() => {
                  setProximityBlock(null);
                  handleClockIn(proximityBlock.projectId);
                }}
                disabled={isClocking}
                data-testid="button-try-again"
              >
                {checkingProximity ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Navigation className="w-4 h-4 mr-2" />}
                Try Again
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card data-testid="card-clock-action">
        <CardContent className="pt-6">
          <div className="text-center mb-4">
            <p className="text-lg font-semibold" data-testid="text-user-name">{user?.firstName || 'Team Member'}</p>
          </div>

          {isClockedIn ? (
            <div className="space-y-4">
              <div className="text-center p-4 bg-green-50 dark:bg-green-950/20 rounded-md">
                <p className="text-sm text-muted-foreground">Currently working</p>
                <p className="text-2xl font-bold text-green-700 dark:text-green-400 mt-1" data-testid="text-elapsed-time">{elapsedDisplay}</p>
                {activeJobName && (
                  <p className="text-sm font-medium text-green-800 dark:text-green-300 mt-1">{activeJobName}</p>
                )}
                {activeJobAddress && (
                  <p className="text-xs text-muted-foreground flex items-center justify-center gap-1 mt-0.5">
                    <MapPin className="w-3 h-3" />{activeJobAddress}
                  </p>
                )}
              </div>
              <Button
                variant="destructive"
                className="w-full"
                size="lg"
                onClick={() => clockOutMutation.mutate()}
                disabled={isClocking}
                data-testid="button-clock-out"
              >
                {isClocking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Square className="w-4 h-4 mr-2" />}
                Clock Out
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {todayJobs.length === 1 ? (
                <>
                  <div className="p-3 rounded-md border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20">
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mb-1">Today's Job</p>
                    <p className="text-sm font-medium">{todayJobs[0].title}</p>
                    {(todayJobs[0].address || todayJobs[0].city) && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3" />{[todayJobs[0].address, todayJobs[0].city, todayJobs[0].state].filter(Boolean).join(', ')}
                      </p>
                    )}
                    {todayJobs[0].scheduledTime && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3" />{todayJobs[0].scheduledTime}
                      </p>
                    )}
                  </div>
                  <Button
                    className="w-full"
                    size="lg"
                    onClick={() => handleClockIn(todayJobs[0].id)}
                    disabled={isClocking}
                    data-testid="button-clock-in-today"
                  >
                    {isClocking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                    {checkingProximity ? "Checking location..." : "Clock In"}
                  </Button>
                </>
              ) : todayJobs.length > 1 ? (
                <>
                  <p className="text-sm text-muted-foreground text-center">Today's jobs — select one to clock in</p>
                  <div className="space-y-2">
                    {todayJobs.map((job) => (
                      <button
                        key={job.id}
                        className="w-full flex items-center gap-3 p-4 rounded-md border border-emerald-200 dark:border-emerald-800 bg-emerald-50/30 dark:bg-emerald-950/10 text-left hover:bg-emerald-100/50 dark:hover:bg-emerald-950/30 transition-colors"
                        onClick={() => handleClockIn(job.id)}
                        disabled={isClocking}
                        data-testid={`button-project-${job.id}`}
                      >
                        <MapPin className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{job.title}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {[job.address, job.city, job.state].filter(Boolean).join(', ')}
                          </p>
                          {job.scheduledTime && (
                            <p className="text-xs text-muted-foreground">{job.scheduledTime}</p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              ) : otherJobs.length > 0 ? (
                <>
                  <p className="text-sm text-muted-foreground text-center">Select a job to clock into</p>
                  <div className="space-y-2">
                    {otherJobs.map((job) => (
                      <button
                        key={job.id}
                        className="w-full flex items-center gap-3 p-4 rounded-md border text-left hover:bg-accent/50 transition-colors"
                        onClick={() => handleClockIn(job.id)}
                        disabled={isClocking}
                        data-testid={`button-project-${job.id}`}
                      >
                        <MapPin className="w-5 h-5 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{job.title}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {[job.address, job.city, job.state].filter(Boolean).join(', ')}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              ) : null}

              {(todayJobs.length > 1 || otherJobs.length > 0) && (
                <>
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t" /></div>
                    <div className="relative flex justify-center text-xs"><span className="bg-card px-2 text-muted-foreground">or</span></div>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => handleClockIn(undefined)}
                    disabled={isClocking}
                    data-testid="button-clock-in-no-project"
                  >
                    {isClocking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                    Clock In Without Project
                  </Button>
                </>
              )}

              {todayJobs.length === 0 && otherJobs.length === 0 && (
                <Button
                  className="w-full"
                  size="lg"
                  onClick={() => handleClockIn(undefined)}
                  disabled={isClocking}
                  data-testid="button-clock-in"
                >
                  {isClocking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                  Clock In
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {(() => {
        const completedEntries = timeEntries
          .filter((e: any) => e.clockOut)
          .sort((a: any, b: any) => new Date(b.clockIn).getTime() - new Date(a.clockIn).getTime())
          .slice(0, 10);
        if (completedEntries.length === 0) return null;
        return (
          <Card data-testid="card-recent-entries">
            <CardContent className="pt-4">
              <p className="text-sm font-semibold mb-3">Recent Entries</p>
              <div className="space-y-2">
                {completedEntries.map((entry: any) => {
                  const ci = new Date(entry.clockIn);
                  const co = new Date(entry.clockOut);
                  const hours = entry.totalMinutes ? (entry.totalMinutes / 60).toFixed(1) : ((co.getTime() - ci.getTime()) / 3600000).toFixed(1);
                  const dayStr = ci.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
                  const ciTime = ci.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
                  const coTime = co.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
                  return (
                    <div key={entry.id} className="p-2.5 rounded-md border text-sm" data-testid={`my-time-entry-${entry.id}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">{dayStr}</span>
                        <span className="text-xs font-medium">{hours}h</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{ciTime} — {coTime}</p>
                      {entry.editedAt && (
                        <div className="mt-1.5 p-2 rounded bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                          <div className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400 font-medium">
                            <AlertCircle className="w-3 h-3" />
                            Edited on {new Date(entry.editedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </div>
                          {entry.editReason && (
                            <p className="text-xs text-amber-600 dark:text-amber-300 mt-0.5">Reason: {entry.editReason}</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })()}
    </div>
  );
}
