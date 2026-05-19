import { useState, useEffect, useCallback } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, Play, Square, Loader2, CheckCircle2, AlertCircle, MapPin, ArrowLeft, Navigation, MessageSquare } from "lucide-react";
import { haversineDistance, geocodeAddress, getCurrentPosition, PROXIMITY_METERS } from "@/lib/geo-utils";

interface VerifyResult {
  memberId: number;
  memberName: string;
  status: "clocked_in" | "clocked_out";
  clockedInSince?: string;
  elapsedMinutes?: number;
  activeEntryId?: number;
  activeProjectId?: number;
  projects?: { id: number; address: string }[];
}

export default function CrewClock() {
  const { token } = useParams<{ token: string }>();
  const { slug } = useParams<{ slug: string }>();

  const isSlugBased = !!slug;
  const apiBase = isSlugBased
    ? `/api/public/crew-clock/by-slug/${slug}`
    : `/api/public/crew-clock/${token}`;

  const [step, setStep] = useState<"pin" | "action">("pin");
  const [pin, setPin] = useState("");
  const [verifyData, setVerifyData] = useState<VerifyResult | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isClocking, setIsClocking] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackType, setFeedbackType] = useState<"success" | "error">("success");
  const [elapsedDisplay, setElapsedDisplay] = useState("");
  const [gpsStatus, setGpsStatus] = useState<"idle" | "fetching" | "success" | "denied">("idle");
  const [proximityBlock, setProximityBlock] = useState<{ address: string; distanceFeet: number; projectId?: number } | null>(null);
  const [checkingProximity, setCheckingProximity] = useState(false);

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

  const { data, isLoading, error } = useQuery<{ companyName: string }>({
    queryKey: [apiBase],
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (feedbackMessage) {
      const timer = setTimeout(() => setFeedbackMessage(""), 5000);
      return () => clearTimeout(timer);
    }
  }, [feedbackMessage]);

  useEffect(() => {
    if (verifyData?.status === "clocked_in" && verifyData.clockedInSince) {
      const update = () => {
        const elapsed = Math.round((Date.now() - new Date(verifyData.clockedInSince!).getTime()) / 60000);
        const hrs = Math.floor(elapsed / 60);
        const mins = elapsed % 60;
        setElapsedDisplay(`${hrs}h ${mins}m`);
      };
      update();
      const interval = setInterval(update, 60000);
      return () => clearInterval(interval);
    }
  }, [verifyData?.clockedInSince, verifyData?.status]);

  async function handleVerifyPin() {
    if (!pin || pin.length < 1) return;
    setIsVerifying(true);
    setErrorMessage("");
    try {
      const res = await fetch(`${apiBase}/verify-pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (!res.ok) {
        const data = await res.json();
        setErrorMessage(data.message || "Invalid PIN");
        setIsVerifying(false);
        return;
      }
      const result: VerifyResult = await res.json();
      setVerifyData(result);
      setStep("action");
    } catch {
      setErrorMessage("Something went wrong. Please try again.");
    }
    setIsVerifying(false);
  }

  async function doClockIn(projectId?: number) {
    if (!verifyData) return;
    setIsClocking(true);
    try {
      const location = await getLocation();
      const res = await fetch(`${apiBase}/clock-in`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamMemberId: verifyData.memberId,
          pin,
          projectId: projectId || null,
          lat: location?.lat || null,
          lng: location?.lng || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setFeedbackMessage(data.message || "Clock in failed");
        setFeedbackType("error");
        setIsClocking(false);
        return;
      }
      setFeedbackMessage("Clocked in!");
      setFeedbackType("success");
      setProximityBlock(null);
      handleReset();
    } catch {
      setFeedbackMessage("Something went wrong");
      setFeedbackType("error");
    }
    setIsClocking(false);
  }

  async function handleClockIn(projectId?: number) {
    setProximityBlock(null);

    if (!projectId || !verifyData?.projects) {
      doClockIn(projectId);
      return;
    }

    const proj = verifyData.projects.find(p => p.id === projectId);
    const projAddress = proj?.address;
    if (!projAddress) {
      doClockIn(projectId);
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

      const jobCoords = await geocodeAddress(projAddress);
      if (!jobCoords) {
        doClockIn(projectId);
        setCheckingProximity(false);
        return;
      }

      const distanceMeters = haversineDistance(userPos.lat, userPos.lng, jobCoords.lat, jobCoords.lng);
      const distanceFeet = Math.round(distanceMeters * 3.28084);

      if (distanceMeters <= PROXIMITY_METERS) {
        doClockIn(projectId);
      } else {
        setProximityBlock({ address: projAddress, distanceFeet, projectId });
      }
    } catch (err) {
      console.error('[GPS] Proximity check error:', err);
      doClockIn(projectId);
    } finally {
      setCheckingProximity(false);
    }
  }

  async function handleClockOut() {
    if (!verifyData) return;
    setIsClocking(true);
    try {
      const location = await getLocation();
      const res = await fetch(`${apiBase}/clock-out`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamMemberId: verifyData.memberId,
          pin,
          lat: location?.lat || null,
          lng: location?.lng || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setFeedbackMessage(data.message || "Clock out failed");
        setFeedbackType("error");
        setIsClocking(false);
        return;
      }
      setFeedbackMessage("Clocked out!");
      setFeedbackType("success");
      handleReset();
    } catch {
      setFeedbackMessage("Something went wrong");
      setFeedbackType("error");
    }
    setIsClocking(false);
  }

  function handleReset() {
    setStep("pin");
    setPin("");
    setVerifyData(null);
    setErrorMessage("");
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <AlertCircle className="w-12 h-12 text-destructive mb-4" />
            <h2 className="text-xl font-bold mb-2">Invalid Link</h2>
            <p className="text-muted-foreground">This crew clock link is invalid or has expired. Please ask your employer for a new link.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-sm mx-auto space-y-4 pt-8">
        <div className="text-center pb-2">
          <h1 className="text-2xl font-bold" data-testid="text-clock-company">{data.companyName}</h1>
          <p className="text-muted-foreground text-sm mt-1">Crew Time Clock</p>
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

        {step === "pin" && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Clock className="w-5 h-5" />
                Enter Your PIN
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Input
                  type="password"
                  inputMode="numeric"
                  value={pin}
                  onChange={(e) => { setPin(e.target.value); setErrorMessage(""); }}
                  placeholder="Enter your PIN"
                  maxLength={6}
                  autoFocus
                  data-testid="input-clock-pin"
                  onKeyDown={(e) => { if (e.key === "Enter") handleVerifyPin(); }}
                />
                {errorMessage && (
                  <p className="text-sm text-destructive" data-testid="text-pin-error">{errorMessage}</p>
                )}
                <Button
                  className="w-full"
                  onClick={handleVerifyPin}
                  disabled={isVerifying || !pin}
                  data-testid="button-verify-pin"
                >
                  {isVerifying && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Continue
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "action" && verifyData && proximityBlock && (
          <Card className="border-amber-400/60 bg-amber-50 dark:bg-amber-950/20" data-testid="card-proximity-block">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-200" data-testid="text-proximity-title">
                    You're not near the job site
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                    You need to be within 150 feet of <strong>{proximityBlock.address}</strong> to clock in. You appear to be about {proximityBlock.distanceFeet.toLocaleString()} feet away.
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mt-2">
                    If you're having trouble, call the office or let your supervisor know.
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                className="w-full border-amber-300 dark:border-amber-700"
                onClick={() => {
                  setProximityBlock(null);
                  if (proximityBlock.projectId) handleClockIn(proximityBlock.projectId);
                }}
                disabled={isClocking || checkingProximity}
                data-testid="button-try-again"
              >
                {checkingProximity ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Navigation className="w-4 h-4 mr-2" />}
                Try Again
              </Button>
            </CardContent>
          </Card>
        )}

        {step === "action" && verifyData && (
          <>
            <Card>
              <CardContent className="pt-6">
                <div className="text-center mb-4">
                  <p className="text-lg font-semibold" data-testid="text-member-name">{verifyData.memberName}</p>
                  <div className="flex items-center justify-center gap-1.5 mt-1">
                    <Navigation className={`w-3.5 h-3.5 ${gpsStatus === "denied" ? "text-amber-500" : "text-green-500"}`} />
                    <span className="text-xs text-muted-foreground">
                      {gpsStatus === "fetching" ? "Getting location..." : gpsStatus === "denied" ? "Location unavailable" : "GPS tracking enabled"}
                    </span>
                  </div>
                </div>

                {verifyData.status === "clocked_in" ? (
                  <div className="space-y-4">
                    <div className="text-center p-4 bg-green-50 dark:bg-green-950/20 rounded-md">
                      <p className="text-sm text-muted-foreground">Currently working</p>
                      <p className="text-2xl font-bold text-green-700 dark:text-green-400 mt-1" data-testid="text-elapsed-time">{elapsedDisplay}</p>
                    </div>
                    <Button
                      variant="destructive"
                      className="w-full"
                      size="lg"
                      onClick={handleClockOut}
                      disabled={isClocking || checkingProximity}
                      data-testid="button-clock-out"
                    >
                      {isClocking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Square className="w-4 h-4 mr-2" />}
                      Clock Out
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {verifyData.projects && verifyData.projects.length > 0 ? (
                      <>
                        <p className="text-sm text-muted-foreground text-center">Select your job site to clock in</p>
                        <div className="space-y-2">
                          {verifyData.projects.map((proj) => (
                            <button
                              key={proj.id}
                              className="w-full flex items-center gap-3 p-4 rounded-md border text-left hover-elevate"
                              onClick={() => handleClockIn(proj.id)}
                              disabled={isClocking || checkingProximity}
                              data-testid={`button-project-${proj.id}`}
                            >
                              <MapPin className="w-5 h-5 text-muted-foreground shrink-0" />
                              <span className="text-sm font-medium">{proj.address}</span>
                            </button>
                          ))}
                        </div>
                        <div className="mt-3 p-3 bg-muted/50 rounded-md">
                          <p className="text-xs text-muted-foreground text-center" data-testid="text-contact-office-hint">
                            <MessageSquare className="w-3.5 h-3.5 inline mr-1" />
                            Don't see your project? Contact the office.
                          </p>
                        </div>
                      </>
                    ) : (
                      <div className="text-center space-y-3">
                        <div className="p-4 bg-amber-50 dark:bg-amber-950/20 rounded-md">
                          <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                          <p className="text-sm font-medium" data-testid="text-no-projects-today">No projects scheduled for today</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Contact the office if you need to be assigned to a project.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Button
              variant="ghost"
              className="w-full"
              onClick={handleReset}
              data-testid="button-back"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
