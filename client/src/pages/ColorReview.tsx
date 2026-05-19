import { useState, useRef, useCallback, useEffect } from "react";
import { PoweredByFusePhone } from "@/components/PoweredByFusePhone";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Check, Paintbrush, Palette, Clock, CheckCircle2, Search, X, Camera, Send, Phone, AlertTriangle, Loader2, ToggleLeft, ToggleRight, Upload, PenLine, StickyNote, Droplets, Layers, MessageSquare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function formatPhoneDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (national.length === 10) {
    return `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
  }
  return phone;
}

function ColorSearchInline({
  onSelect,
  placeholder,
}: {
  onSelect: (color: { name: string; code: string; brand: string; hexColor: string; id: number }) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const doSearch = useCallback((q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      setShowResults(false);
      return;
    }
    setSearching(true);
    fetch(`/api/public/paint-colors/search?q=${encodeURIComponent(q)}`)
      .then(r => r.json())
      .then(data => {
        setResults(data || []);
        setShowResults(true);
        setSearching(false);
      })
      .catch(() => {
        setSearching(false);
        setShowResults(false);
      });
  }, []);

  const handleChange = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 300);
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
        <Input
          placeholder={placeholder || "Search color name or code..."}
          value={query}
          onChange={e => handleChange(e.target.value)}
          onFocus={() => { if (results.length > 0) setShowResults(true); }}
          className="pl-8 pr-8 text-sm h-9 bg-white"
          data-testid="input-customer-color-search"
        />
        {query && (
          <button
            type="button"
            className="absolute right-2.5 top-1/2 -translate-y-1/2"
            onClick={() => { setQuery(""); setResults([]); setShowResults(false); }}
          >
            <X className="w-3.5 h-3.5 text-gray-400" />
          </button>
        )}
      </div>
      {showResults && (
        <div className="absolute z-[99999] left-0 right-0 mt-1 bg-white border rounded-lg shadow-xl max-h-[260px] overflow-y-auto">
          {searching && (
            <div className="px-3 py-2 text-xs text-gray-400 flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" /> Searching...
            </div>
          )}
          {!searching && results.length === 0 && query.length >= 2 && (
            <div className="px-3 py-2 text-xs text-gray-400">No colors found</div>
          )}
          {results.map((c: any) => (
            <button
              key={c.id}
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-3 border-b last:border-b-0"
              onClick={() => {
                onSelect(c);
                setQuery("");
                setResults([]);
                setShowResults(false);
              }}
              data-testid={`search-result-${c.id}`}
            >
              <div
                className="w-8 h-8 rounded-lg shrink-0 shadow-sm border"
                style={{ backgroundColor: c.hexColor }}
              />
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                <p className="text-[11px] text-gray-500">{c.code} · {c.brand}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ColorReview({ token }: { token: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [noteDebounce, setNoteDebounce] = useState<NodeJS.Timeout | null>(null);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const [customerInputs, setCustomerInputs] = useState<Record<string, { colorName: string; brand: string; finish: string }>>({});
  const pendingBlobUrls = useRef<Record<string, string>>({});
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);
  const [surfaceNotes, setSurfaceNotes] = useState<Record<string, string>>({});
  const surfaceNoteTimers = useRef<Record<string, NodeJS.Timeout>>({});
  const [inputModes, setInputModes] = useState<Record<string, 'search' | 'manual'>>({});
  const [activeSurface, setActiveSurface] = useState<{ paintGroupKey: string; surfaceLabel: string; roomName: string; entry: any } | null>(null);
  const [modalMode, setModalMode] = useState<'search' | 'manual'>('search');
  const [modalManualName, setModalManualName] = useState('');
  const [modalManualBrand, setModalManualBrand] = useState('');
  const [modalSheen, setModalSheen] = useState('contractor-decide');
  const [modalSearchQuery, setModalSearchQuery] = useState('');
  const [modalSearchResults, setModalSearchResults] = useState<any[]>([]);
  const [modalSearching, setModalSearching] = useState(false);
  const modalSearchDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const [modalSearchSelection, setModalSearchSelection] = useState<{ id?: number; name: string; code: string; brand: string; hexColor: string } | null>(null);
  const [modalPhotoPreview, setModalPhotoPreview] = useState('');
  const [modalPhotoRemoved, setModalPhotoRemoved] = useState(false);
  const modalPhotoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (modalSearchDebounceRef.current) clearTimeout(modalSearchDebounceRef.current);
    const q = modalSearchQuery.trim();
    if (q.length < 2) {
      setModalSearchResults([]);
      setModalSearching(false);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setModalSearching(true);
    modalSearchDebounceRef.current = setTimeout(() => {
      fetch(`/api/public/paint-colors/search?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        .then(r => r.json())
        .then((data: any[]) => { if (!cancelled) setModalSearchResults(data || []); })
        .catch(() => { if (!cancelled) setModalSearchResults([]); })
        .finally(() => { if (!cancelled) setModalSearching(false); });
    }, 250);
    return () => {
      cancelled = true;
      controller.abort();
      if (modalSearchDebounceRef.current) clearTimeout(modalSearchDebounceRef.current);
    };
  }, [modalSearchQuery]);

  const { data, isLoading, isError } = useQuery<any>({
    queryKey: ["/api/color-review", token],
    queryFn: async () => {
      const res = await fetch(`/api/color-review/${token}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
  });

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/color-review?token=${encodeURIComponent(token)}`;
    let ws: WebSocket | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    let attempts = 0;
    let stopped = false;

    function connect() {
      if (stopped) return;
      ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        attempts = 0;
        pingTimer = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) ws.send("ping");
        }, 25000);
      };
      ws.onmessage = (ev) => {
        if (ev.data === "pong") return;
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "colors.updated") {
            queryClient.invalidateQueries({ queryKey: ["/api/color-review", token] });
          }
        } catch {}
      };
      ws.onclose = (ev) => {
        if (pingTimer) clearInterval(pingTimer);
        if (stopped) return;
        if (ev.code === 1008 || ev.code === 4001 || ev.code === 4004) return;
        attempts++;
        if (attempts > 10) return;
        const delay = Math.min(5000 * Math.pow(1.5, attempts - 1), 30000);
        reconnectTimer = setTimeout(connect, delay);
      };
      ws.onerror = () => {
        ws?.close();
      };
    }
    connect();

    return () => {
      if (pingTimer) clearInterval(pingTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      stopped = true;
      if (ws) { ws.onclose = null; ws.close(); }
    };
  }, [token, queryClient]);

  useEffect(() => {
    if (data?.submission?.customerNote) {
      setNote(data.submission.customerNote);
    }
  }, [data?.submission?.customerNote]);

  const serverEntries = data?.submission?.entries as any[] | undefined;

  const surfaceNotesInitRef = useRef(false);
  useEffect(() => {
    if (!serverEntries || surfaceNotesInitRef.current) return;
    const notes: Record<string, string> = {};
    for (const e of serverEntries) {
      if (e.surfaceNote) notes[e.paintGroupKey] = e.surfaceNote;
    }
    setSurfaceNotes(notes);
    surfaceNotesInitRef.current = true;
  }, [serverEntries]);

  useEffect(() => {
    if (!serverEntries) return;
    const serverNotes: Record<string, string> = {};
    for (const e of serverEntries) {
      if (e.surfaceNote) serverNotes[e.paintGroupKey] = e.surfaceNote;
    }
    setSurfaceNotes(prev => {
      const merged = { ...prev };
      for (const [key, val] of Object.entries(serverNotes)) {
        if (!(key in surfaceNoteTimers.current)) {
          merged[key] = val;
        }
      }
      for (const key of Object.keys(merged)) {
        if (!serverNotes[key] && !(key in surfaceNoteTimers.current)) {
          merged[key] = '';
        }
      }
      return merged;
    });
  }, [serverEntries]);

  const handleSurfaceNoteChange = useCallback((paintGroupKey: string, value: string) => {
    setSurfaceNotes(prev => ({ ...prev, [paintGroupKey]: value }));
    if (surfaceNoteTimers.current[paintGroupKey]) clearTimeout(surfaceNoteTimers.current[paintGroupKey]);
    surfaceNoteTimers.current[paintGroupKey] = setTimeout(() => {
      delete surfaceNoteTimers.current[paintGroupKey];
      fetch(`/api/color-review/${token}/surface-note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paintGroupKey, surfaceNote: value }),
      });
    }, 800);
  }, [token]);

  const themeColor = data?.company?.secondaryColor || '#1e293b';
  useEffect(() => {
    const metaLight = document.querySelector('meta[name="theme-color"][media="(prefers-color-scheme: light)"]');
    const metaDark = document.querySelector('meta[name="theme-color"][media="(prefers-color-scheme: dark)"]');
    const prevLight = metaLight?.getAttribute('content') || '#ffffff';
    const prevDark = metaDark?.getAttribute('content') || '#232d3b';
    const prevBodyBg = document.body.style.backgroundColor;

    if (metaLight) metaLight.setAttribute('content', themeColor);
    if (metaDark) metaDark.setAttribute('content', themeColor);
    document.body.style.backgroundColor = themeColor;

    return () => {
      if (metaLight) metaLight.setAttribute('content', prevLight);
      if (metaDark) metaDark.setAttribute('content', prevDark);
      document.body.style.backgroundColor = prevBodyBg;
    };
  }, [themeColor]);

  const saveNoteMutation = useMutation({
    mutationFn: async (noteText: string) => {
      await fetch(`/api/color-review/${token}/save-note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: noteText }),
      });
    },
  });

  const handleNoteChange = useCallback((val: string) => {
    setNote(val);
    if (noteDebounce) clearTimeout(noteDebounce);
    const t = setTimeout(() => {
      saveNoteMutation.mutate(val);
    }, 1500);
    setNoteDebounce(t);
  }, [noteDebounce]);

  const approveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/color-review/${token}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: note || undefined }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Colors approved!" });
      setShowApproveConfirm(false);
      queryClient.invalidateQueries({ queryKey: ["/api/color-review", token] });
    },
    onError: (err: any) => toast({ title: err.message || "Failed to approve", variant: "destructive" }),
  });

  const submitColorsMutation = useMutation({
    mutationFn: async (updatedEntries: any[]) => {
      const res = await fetch(`/api/color-review/${token}/submit-colors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: updatedEntries }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || "Failed"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/color-review", token] });
      toast({ title: "Color saved!" });
    },
    onError: (err: any) => toast({ title: err.message || "Failed to submit", variant: "destructive" }),
  });

  const uploadPhotoMutation = useMutation({
    mutationFn: async ({ paintGroupKey, imageData }: { paintGroupKey: string; imageData: string }) => {
      const res = await fetch(`/api/color-review/${token}/upload-photo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paintGroupKey, imageData }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || "Failed"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/color-review", token] });
      toast({ title: "Photo uploaded!" });
    },
    onError: (err: any) => toast({ title: err.message || "Failed to upload photo", variant: "destructive" }),
  });

  const handlePhotoUpload = (file: File, paintGroupKey: string) => {
    const blobUrl = URL.createObjectURL(file);
    pendingBlobUrls.current[paintGroupKey] = blobUrl;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      uploadPhotoMutation.mutate({ paintGroupKey, imageData: dataUrl });
    };
    reader.readAsDataURL(file);
  };

  const updateCustomerInput = (key: string, field: string, value: string) => {
    setCustomerInputs(prev => ({
      ...prev,
      [key]: { ...prev[key] || { colorName: '', brand: '', finish: '' }, [field]: value },
    }));
  };

  const [searchSelections, setSearchSelections] = useState<Record<string, { name: string; code: string; brand: string; hexColor: string }>>({});

  const handleColorSearchSelect = (key: string, color: { name: string; code: string; brand: string; hexColor: string }) => {
    setCustomerInputs(prev => ({
      ...prev,
      [key]: { colorName: `${color.name} (${color.code})`, brand: color.brand, finish: '' },
    }));
    setSearchSelections(prev => ({ ...prev, [key]: color }));
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="animate-pulse text-gray-400">Loading...</div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center p-4">
        <Card className="p-8 text-center max-w-md shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <Paintbrush className="w-8 h-8 text-slate-400" />
          </div>
          <p className="font-bold text-xl text-gray-900">Color Selection Unavailable</p>
          <p className="text-sm text-gray-500 mt-2">This link may have expired or the color selection is no longer available.</p>
          <div className="mt-6 p-4 bg-slate-50 rounded-xl border">
            <p className="text-xs text-gray-500 uppercase font-medium tracking-wider mb-1">Need Help?</p>
            <p className="text-sm text-gray-700">Please contact your contractor for an updated link.</p>
          </div>
          <PoweredByFusePhone className="mt-6" />
        </Card>
      </div>
    );
  }

  const { submission, project, contact, company, document: doc, colors } = data;
  const entries = submission.entries || [];
  const colorMap = new Map(colors.map((c: any) => [c.id, c]));
  const brandColor = company?.brandColor || '#3b82f6';
  const headerBgColor = company?.secondaryColor || '#1e293b';
  const isApproved = submission.customerApproved;
  const isContractorApproved = submission.contractorApproved;
  const companyCityStateZip = [company?.city, company?.state, company?.zipCode].filter(Boolean).join(', ');
  const contactAddress = contact?.address || '';
  const projectAddress = [project?.address, project?.city, project?.state].filter(Boolean).join(', ');

  const trustBadges = company?.trustBadges?.filter((b: any) => b.label?.trim()) || [];

  // Collapse by color group when present so one group renders as a single question.
  const seenKeys = new Set<string>();
  const dedupedEntries = entries.filter((entry: any) => {
    const key = entry.colorGroupId ? `group-${entry.colorGroupId}` : entry.paintGroupKey;
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });

  const roomGroups = new Map<string, any[]>();
  for (const entry of dedupedEntries) {
    // Grouped entries get their own "Color Group" section (cross-room) so one card represents many surfaces
    const room = entry.colorGroupId
      ? entry.colorGroupName || 'Color Group'
      : (entry.roomName || entry.groupLabel?.split(' - ')[0] || 'General');
    if (!roomGroups.has(room)) roomGroups.set(room, []);
    roomGroups.get(room)!.push(entry);
  }

  return (
    <div className="min-h-screen pb-8" style={{ backgroundColor: headerBgColor }} data-testid="color-review-page">
      <div className="max-w-2xl mx-auto">

        <Card className="shadow-lg overflow-hidden rounded-none border-x-0 border-t-0">
          <div className="relative overflow-hidden" style={{ backgroundColor: headerBgColor }}>
            <img
              src="/paint-cans-bg.png"
              alt=""
              className="absolute inset-0 w-full h-full object-contain object-bottom opacity-[0.85]"
              style={{ bottom: 0, top: 'auto' }}
            />
            <div className="relative px-4 sm:px-8 pt-6 sm:pt-8 pb-5 text-center">
              {company?.logo ? (
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-white shadow-lg flex items-center justify-center mx-auto mb-4 p-2">
                  <img src={company.logo} alt={company.name} className="h-full w-full object-contain" />
                </div>
              ) : (
                <div className="w-20 h-20 rounded-2xl bg-white shadow-lg flex items-center justify-center mx-auto mb-4" style={{ border: `3px solid ${brandColor}` }}>
                  <Paintbrush className="w-9 h-9" style={{ color: brandColor }} />
                </div>
              )}
              <div className="inline-block rounded-full px-6 py-2 shadow-md" style={{ backgroundColor: brandColor }} data-testid="text-company-name">
                <h1 className="text-lg sm:text-xl font-bold text-white">{company?.name || 'Color Selection'}</h1>
              </div>
              {company?.tagline && <p className="text-xs sm:text-sm text-white/80 mt-2 uppercase tracking-wider font-medium">{company.tagline}</p>}
              <div className="inline-flex items-center mt-3 bg-white/95 backdrop-blur rounded-full pl-3 pr-4 py-2 shadow-md">
                <Palette className="w-5 h-5 mr-1.5" style={{ color: '#B91C1C' }} />
                {'Color Selection'.split('').map((char, i) => {
                  const paintColors = ['#B91C1C', '#C2410C', '#A16207', '#15803D', '#1D4ED8'];
                  const c = paintColors[i % paintColors.length];
                  if (char === ' ') return <span key={i} style={{ width: '5px', display: 'inline-block' }} />;
                  return (
                    <span
                      key={i}
                      className="text-[15px] font-black"
                      style={{
                        color: c,
                        textShadow: `0px 1px 0px rgba(0,0,0,0.2)`,
                      }}
                    >
                      {char}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="px-4 sm:px-6 pt-5 pb-1 space-y-3 bg-white">
            {contact && (
              <div className="rounded-xl border border-gray-200 shadow-lg p-4">
                <span className="inline-block rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider text-white mb-2" style={{ backgroundColor: brandColor }}>Client</span>
                <p className="font-bold text-gray-900 text-base" data-testid="text-contact-name">{contact.name}</p>
                {contactAddress && <p className="text-sm text-gray-700">{contactAddress}</p>}
                {contact.phone && <p className="text-sm font-medium text-gray-800">{formatPhoneDisplay(contact.phone)}</p>}
                {contact.email && <p className="text-sm text-gray-700">{contact.email}</p>}
              </div>
            )}
            {project && (
              <div className="rounded-xl border border-gray-200 shadow-lg p-4">
                <span className="inline-block rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider text-white mb-2" style={{ backgroundColor: brandColor }}>Project</span>
                <p className="font-bold text-gray-900 text-base" data-testid="text-project-name">{project.name}</p>
                {projectAddress && <p className="text-sm text-gray-700">{projectAddress}</p>}
              </div>
            )}

            {submission.deadline && !isApproved && (() => {
              const dl = String(submission.deadline).split('T')[0];
              const deadlineDate = new Date(dl + 'T12:00:00');
              const today = new Date();
              today.setHours(12, 0, 0, 0);
              const daysLeft = Math.ceil((deadlineDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              const formatted = deadlineDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

              let borderColor: string;
              let bgGradient: string;
              let iconBg: string;
              let iconColor: string;
              let titleColor: string;
              let textColor: string;
              let urgencyLabel: string;

              if (daysLeft <= 0) {
                borderColor = 'border-red-400';
                bgGradient = 'bg-gradient-to-r from-red-50 to-red-100';
                iconBg = 'bg-red-100';
                iconColor = 'text-red-600';
                titleColor = 'text-red-900';
                textColor = 'text-red-700';
                urgencyLabel = daysLeft === 0 ? 'Due Today!' : 'Past Due';
              } else if (daysLeft <= 3) {
                borderColor = 'border-red-300';
                bgGradient = 'bg-gradient-to-r from-red-50 to-orange-50';
                iconBg = 'bg-red-100';
                iconColor = 'text-red-500';
                titleColor = 'text-red-900';
                textColor = 'text-red-700';
                urgencyLabel = `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`;
              } else if (daysLeft <= 7) {
                borderColor = 'border-orange-300';
                bgGradient = 'bg-gradient-to-r from-orange-50 to-amber-50';
                iconBg = 'bg-orange-100';
                iconColor = 'text-orange-600';
                titleColor = 'text-orange-900';
                textColor = 'text-orange-700';
                urgencyLabel = `${daysLeft} days left`;
              } else {
                borderColor = 'border-amber-300';
                bgGradient = 'bg-gradient-to-r from-amber-50 to-yellow-50';
                iconBg = 'bg-amber-100';
                iconColor = 'text-amber-600';
                titleColor = 'text-amber-900';
                textColor = 'text-amber-700';
                urgencyLabel = `${daysLeft} days left`;
              }

              return (
                <div className={`rounded-xl border-2 ${borderColor} ${bgGradient} p-4 shadow-md`} data-testid="deadline-banner">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full ${iconBg} flex items-center justify-center shrink-0`}>
                      {daysLeft <= 0 ? (
                        <AlertTriangle className={`w-5 h-5 ${iconColor}`} />
                      ) : (
                        <Clock className={`w-5 h-5 ${iconColor}`} />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-bold ${titleColor}`}>Color Selection Deadline</p>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white ${daysLeft <= 0 ? 'bg-red-500' : daysLeft <= 3 ? 'bg-red-400' : daysLeft <= 7 ? 'bg-orange-500' : 'bg-amber-500'}`}>
                          {urgencyLabel}
                        </span>
                      </div>
                      <p className={`text-xs ${textColor} mt-0.5`}>
                        Please submit your choices by <span className="font-bold">{formatted}</span> to keep your project on schedule.
                      </p>
                    </div>
                  </div>
                </div>
              );
            })()}


            {dedupedEntries.length > 0 && (
              <div className="rounded-xl border border-gray-200 shadow-lg p-4 bg-gradient-to-br from-white to-gray-50">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: `${brandColor}15` }}>
                    <Palette className="w-4 h-4" style={{ color: brandColor }} />
                  </div>
                  <h3 className="font-bold text-gray-900 text-sm">How to Choose Your Colors</h3>
                </div>
                <ul className="space-y-2.5 text-xs text-gray-600 leading-relaxed">
                  <li className="flex items-start gap-2">
                    <Search className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: brandColor }} />
                    <span><strong className="text-gray-800">Search & select</strong> from thousands of colors by name or code. Browse popular brands like Benjamin Moore, Sherwin-Williams, and more.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Paintbrush className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: brandColor }} />
                    <span><strong className="text-gray-800">Sheen & finish</strong> may already be recommended based on your proposal. We'll confirm the appropriate sheen for each surface before starting.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <PenLine className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: brandColor }} />
                    <span><strong className="text-gray-800">Have a specific color?</strong> If you can't find it in the search, type the color name and brand in the custom field — we'll match it or source that exact brand for you.</span>
                  </li>
                </ul>
              </div>
            )}

            {dedupedEntries.length === 0 && (
              <div className="text-center py-10" data-testid="empty-colors-state">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: `${brandColor}15` }}>
                  <Paintbrush className="w-8 h-8" style={{ color: brandColor }} />
                </div>
                <p className="text-gray-800 font-semibold text-lg">Colors Coming Soon</p>
                <p className="text-sm text-gray-500 mt-2 max-w-xs mx-auto">
                  {company?.name || 'Your contractor'} is preparing your color selections. You'll be notified when they're ready for review.
                </p>
                {company?.phone && (
                  <p className="text-xs text-gray-400 mt-4">
                    Questions? Contact {company.name || 'us'} at <a href={`tel:${company.phone}`} className="underline" style={{ color: brandColor }}>{formatPhoneDisplay(company.phone)}</a>
                  </p>
                )}
              </div>
            )}

            {!isApproved && isContractorApproved && (
              <div className="flex items-start gap-3 p-4 rounded-xl border border-blue-200 bg-blue-50 shadow-sm" data-testid="contractor-changes-banner">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-blue-900">{company?.name || 'Your contractor'} reviewed and made updates</p>
                  <p className="text-xs text-blue-700 mt-0.5">
                    Please review the updated color selections below. Once you're satisfied, approve them to finalize.
                  </p>
                </div>
              </div>
            )}

            {!isApproved && submission.status === 'sent' && (submission as any).activityLog?.some((l: any) => l.action === 'contractor_modified') && !isContractorApproved && (
              <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-200 bg-amber-50 shadow-sm" data-testid="contractor-editing-banner">
                <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                  <Clock className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-amber-900">{company?.name || 'Your contractor'} is making changes</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Your contractor has updated some selections. Please review the changes and re-approve when ready.
                  </p>
                </div>
              </div>
            )}

            {(() => {
              const submittedCount = dedupedEntries.filter((e: any) => e.customerSubmitted).length;
              const totalCount = dedupedEntries.length;
              const hasPartialSubmission = submittedCount > 0 && submittedCount < totalCount && !isApproved;
              if (!hasPartialSubmission) return null;
              const remaining = totalCount - submittedCount;
              return (
                <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-200 bg-amber-50 shadow-sm" data-testid="partial-submission-banner">
                  <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-amber-900">{remaining} color{remaining !== 1 ? 's' : ''} still needed</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      You've selected {submittedCount} of {totalCount} colors. Please choose the remaining colors and submit when ready. Your contractor has been notified of your selections so far.
                    </p>
                  </div>
                </div>
              );
            })()}

            {Array.from(roomGroups.entries()).map(([roomName, roomEntries]) => (
              <Card key={roomName} className="shadow-lg" data-testid={`review-room-${roomName}`}>
                <div className="px-4 py-3 border-b bg-gray-50">
                  <span className="text-base font-bold text-gray-900">{roomName}</span>
                </div>
                <div className="p-3 space-y-3">
                  {roomEntries.map((entry: any, idx: number) => {
                    const color = entry.paintColorId ? colorMap.get(entry.paintColorId) : null;
                    const hex = color?.hexColor || entry.hexColor || '#e5e7eb';
                    const name = color?.name || entry.colorName || 'TBD';
                    const code = color?.code || entry.colorCode || '';
                    const brand = color?.brand || entry.brand || '';
                    // For color groups: parse "Room - Surface" into separate room/surface comma lists (like admin card)
                    const groupSurfaceLabels: string[] = [];
                    const groupRoomNames: string[] = [];
                    if (entry.colorGroupId && Array.isArray(entry.colorGroupSurfaces)) {
                      for (const a of entry.colorGroupSurfaces as string[]) {
                        const sIdx = a.lastIndexOf(' - ');
                        const rm = sIdx >= 0 ? a.slice(0, sIdx) : a;
                        const sf = sIdx >= 0 ? a.slice(sIdx + 3) : '';
                        if (rm && !groupRoomNames.includes(rm)) groupRoomNames.push(rm);
                        if (sf && !groupSurfaceLabels.includes(sf)) groupSurfaceLabels.push(sf);
                      }
                    }
                    const isGroup = !!entry.colorGroupId;
                    const surface = isGroup
                      ? groupSurfaceLabels.join(', ')
                      : (entry.surfaceKey || entry.groupLabel?.split(' - ')[1] || '');
                    const r = parseInt(hex.slice(1, 3), 16) || 200;
                    const g = parseInt(hex.slice(3, 5), 16) || 200;
                    const b = parseInt(hex.slice(5, 7), 16) || 200;
                    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
                    const textOnSwatch = lum > 0.6 ? '#333' : '#fff';

                    const isColorMatch = !entry.paintColorId && !hex.match(/^#[0-9a-f]{6}$/i);
                    const needsInput = !isApproved;
                    const inputValues = customerInputs[entry.paintGroupKey] || { colorName: '', brand: '', finish: '' };
                    const hasCustomerSubmitted = entry.customerSubmitted;

                    return (
                      <div key={idx} className="rounded-xl border bg-white p-3 shadow-sm space-y-2" data-testid={`review-entry-${idx}`}>
                        {(isGroup ? groupSurfaceLabels.length > 0 : !!surface) && (
                          <div className="space-y-0.5">
                            <div className="flex items-start gap-1.5 text-[12px] text-gray-700">
                              <Layers className="w-3.5 h-3.5 shrink-0 mt-0.5 text-gray-500" />
                              <span className="font-medium break-words">
                                {isGroup ? groupSurfaceLabels.join(', ') : surface}
                              </span>
                            </div>
                            {isGroup && groupRoomNames.length > 0 && (
                              <p className="text-[11px] text-gray-500 break-words pl-5">{groupRoomNames.join(', ')}</p>
                            )}
                            {!isGroup && roomName && (
                              <p className="text-[11px] text-gray-500 break-words pl-5">{roomName}</p>
                            )}
                          </div>
                        )}
                        <div className="flex items-center gap-3">
                          {(() => {
                            const searchSel = searchSelections[entry.paintGroupKey];
                            const localManual = customerInputs[entry.paintGroupKey];
                            const isLocalManualOverride = localManual && localManual.colorName && !searchSel;
                            const swatchHex = isLocalManualOverride ? '#e5e7eb' : (searchSel?.hexColor || hex);
                            const swatchCode = isLocalManualOverride ? '' : (searchSel?.code || code);
                            const hasValidColor = swatchHex.match(/^#[0-9a-f]{6}$/i) && swatchHex !== '#e5e7eb';
                            if (hasValidColor) {
                              const sr2 = parseInt(swatchHex.slice(1, 3), 16) || 200;
                              const sg2 = parseInt(swatchHex.slice(3, 5), 16) || 200;
                              const sb2 = parseInt(swatchHex.slice(5, 7), 16) || 200;
                              const swatchLum = (0.299 * sr2 + 0.587 * sg2 + 0.114 * sb2) / 255;
                              const swatchTextColor = swatchLum > 0.6 ? '#333' : '#fff';
                              return (
                                <div
                                  className="w-12 h-12 rounded-md shadow-sm border border-black/10 shrink-0 flex flex-col items-center justify-center relative overflow-hidden"
                                  style={{ backgroundColor: swatchHex }}
                                >
                                  <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.2) 0%, transparent 50%)" }} />
                                  {swatchCode && <span className="relative text-[8px] font-medium" style={{ color: swatchTextColor }}>{swatchCode}</span>}
                                </div>
                              );
                            }
                            const entryImage = pendingBlobUrls.current[entry.paintGroupKey] || entry.customImage || '';
                            if (entryImage) {
                              return (
                                <div className="shrink-0 flex flex-col items-center gap-1">
                                  <img
                                    src={entryImage}
                                    alt="Color sample"
                                    loading="lazy"
                                    decoding="async"
                                    width={48}
                                    height={48}
                                    className="w-12 h-12 rounded-md shadow-sm object-cover cursor-pointer active:scale-95 transition-transform bg-gray-100 border border-black/10"
                                    onClick={() => setExpandedImage(entryImage)}
                                  />
                                </div>
                              );
                            }
                            return (
                              <div className="w-12 h-12 rounded-md shadow-sm shrink-0 flex items-center justify-center bg-gray-100 border-2 border-dashed border-gray-300">
                                <Paintbrush className="w-4 h-4 text-gray-400" />
                              </div>
                            );
                          })()}
                          <div className="flex-1 min-w-0">
                            {(() => {
                              const searchSel = searchSelections[entry.paintGroupKey];
                              const localInput = customerInputs[entry.paintGroupKey];
                              const displaySheen = localInput?.finish || entry.finish || '';
                              let displayName = '';
                              let displayMeta = '';
                              if (localInput?.colorName && !searchSel) {
                                displayName = localInput.colorName;
                                displayMeta = localInput.brand || '';
                              } else if (searchSel) {
                                displayName = searchSel.name;
                                displayMeta = [searchSel.code, searchSel.brand].filter(Boolean).join(' · ');
                              } else if (entry.needsCustomerInput && !hasCustomerSubmitted) {
                                displayName = '';
                              } else {
                                displayName = hasCustomerSubmitted ? (entry.colorName || 'Submitted') : name;
                                displayMeta = [code, hasCustomerSubmitted ? entry.brand : brand].filter(Boolean).join(' · ');
                              }
                              const showAmber = entry.needsCustomerInput && !hasCustomerSubmitted && !displayName;
                              return (
                                <>
                                  {showAmber ? (
                                    <p className="text-sm font-medium text-amber-600">Your choice needed</p>
                                  ) : (
                                    <>
                                      <div className="flex items-center gap-1.5">
                                        <p className="text-sm font-semibold text-gray-900 truncate">{displayName || 'TBD'}</p>
                                        {hasCustomerSubmitted && (
                                          <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                                        )}
                                      </div>
                                      {displayMeta && <p className="text-[11px] text-gray-500 truncate">{displayMeta}</p>}
                                      {displaySheen && (
                                        <p className="text-[11px] text-gray-500 capitalize flex items-center gap-1 mt-0.5">
                                          <Droplets className="w-3 h-3 shrink-0" />
                                          <span>{displaySheen}</span>
                                        </p>
                                      )}
                                    </>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                          {needsInput && (() => {
                            const localInput2 = customerInputs[entry.paintGroupKey];
                            const hasColorChosen = (localInput2?.colorName) || (hasCustomerSubmitted && entry.colorName) || searchSelections[entry.paintGroupKey];
                            const currentSheen = inputValues.finish || entry.finish || '';
                            const isFullyComplete = hasColorChosen && !!currentSheen;
                            return (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs font-medium text-emerald-700 hover:bg-emerald-100 shrink-0"
                                onClick={() => {
                                  const existingSearchSel = searchSelections[entry.paintGroupKey];
                                  const localManualInput = customerInputs[entry.paintGroupKey];
                                  const isLocalManual = localManualInput?.colorName && !existingSearchSel;
                                  const isExistingManual = !isLocalManual && hasCustomerSubmitted && entry.colorName && !entry.colorCode && !entry.hexColor && !existingSearchSel;
                                  setModalPhotoRemoved(false);
                                  if (isLocalManual) {
                                    setModalMode('manual');
                                    setModalManualName(localManualInput.colorName || '');
                                    setModalManualBrand(localManualInput.brand || '');
                                    setModalPhotoPreview(pendingBlobUrls.current[entry.paintGroupKey] || entry.customImage || '');
                                  } else if (isExistingManual) {
                                    setModalMode('manual');
                                    setModalManualName(entry.colorName || '');
                                    setModalManualBrand(entry.brand || '');
                                    setModalPhotoPreview(entry.customImage || '');
                                  } else {
                                    setModalMode('search');
                                    setModalManualName('');
                                    setModalManualBrand('');
                                    setModalPhotoPreview('');
                                  }
                                  // Pre-fill the sheen so the contractor's recommendation carries through.
                                  // Priority: customer's prior choice → contractor's recommended finish → "Let contractor decide".
                                  setModalSheen(currentSheen || entry.finish || 'contractor-decide');
                                  // Pre-fill the existing search selection (search mode) so the modal
                                  // matches the contractor side's "current color" UX.
                                  if (existingSearchSel) {
                                    setModalSearchSelection(existingSearchSel);
                                  } else if (!isLocalManual && !isExistingManual && (entry.hexColor || entry.colorCode || entry.paintColorId)) {
                                    // Strip the trailing "(CODE)" suffix that submitColorsMutation appends.
                                    const rawName = (entry.colorName || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
                                    setModalSearchSelection({
                                      id: entry.paintColorId || undefined,
                                      name: rawName || entry.colorName || '',
                                      code: entry.colorCode || '',
                                      brand: entry.brand || '',
                                      hexColor: entry.hexColor || '',
                                    });
                                  } else {
                                    setModalSearchSelection(null);
                                  }
                                  setModalSearchQuery('');
                                  setModalSearchResults([]);
                                  setActiveSurface({ paintGroupKey: entry.paintGroupKey, surfaceLabel: surface, roomName, entry });
                                }}
                                data-testid={`select-color-${idx}`}
                              >
                                <Paintbrush className="w-3.5 h-3.5 mr-1" />
                                {isFullyComplete ? 'Change' : (hasColorChosen ? 'Sheen' : 'Pick')}
                              </Button>
                            );
                          })()}
                        </div>
                        {entry.colorGroupCustomerNotes && (
                          <div className="mt-2 rounded-md border border-blue-200 bg-blue-50/60 px-2.5 py-1.5 flex items-start gap-1.5" data-testid={`group-customer-note-${idx}`}>
                            <MessageSquare className="w-3 h-3 shrink-0 mt-0.5 text-blue-600" />
                            <div className="min-w-0 flex-1">
                              <div className="text-[10px] font-semibold uppercase tracking-wide text-blue-700">Note from your contractor</div>
                              <div className="text-[11px] text-gray-700">{entry.colorGroupCustomerNotes}</div>
                            </div>
                          </div>
                        )}
                        <div className="mt-2 w-full" data-testid={`note-inline-${idx}`}>
                          <label className="text-[10px] font-medium text-gray-500 mb-1 block uppercase tracking-wide">Note</label>
                          {!isApproved ? (
                            <>
                              <Textarea
                                placeholder="Add a note for this surface..."
                                value={surfaceNotes[entry.paintGroupKey] || ''}
                                onChange={e => {
                                  if (e.target.value.length <= 150) handleSurfaceNoteChange(entry.paintGroupKey, e.target.value);
                                }}
                                rows={1}
                                maxLength={150}
                                className="text-xs min-h-[2.25rem] field-sizing-content"
                                style={{ fieldSizing: 'content' as any }}
                                data-testid={`textarea-surface-note-${idx}`}
                              />
                              <p className={`text-[10px] text-right mt-0.5 ${(surfaceNotes[entry.paintGroupKey]?.length || 0) >= 140 ? 'text-amber-500' : 'text-gray-400'}`}>{surfaceNotes[entry.paintGroupKey]?.length || 0}/150</p>
                            </>
                          ) : surfaceNotes[entry.paintGroupKey] ? (
                            <p className="text-[11px] text-gray-600">{surfaceNotes[entry.paintGroupKey]}</p>
                          ) : (
                            <p className="text-[11px] text-gray-400 italic">No note</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            ))}

            {!isApproved && dedupedEntries.length > 0 && (() => {
              const submittedSurfaceCount = dedupedEntries.filter((e: any) => e.customerSubmitted).length;
              const totalSurfaceCount = dedupedEntries.length;
              const hasUnsubmittedSurfaces = submittedSurfaceCount < totalSurfaceCount;
              const remainingSurfaces = totalSurfaceCount - submittedSurfaceCount;
              return (
              <Card className="overflow-hidden" data-testid="customer-approve-section">
                <div className="p-4 space-y-3">
                  {hasUnsubmittedSurfaces && submittedSurfaceCount > 0 && (
                    <div className="flex items-start gap-2.5 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <AlertTriangle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs text-blue-800 font-medium">{remainingSurfaces} surface{remainingSurfaces !== 1 ? 's' : ''} still need{remainingSurfaces === 1 ? 's' : ''} a color selection</p>
                        <p className="text-xs text-blue-700 mt-0.5">You can still approve now — your contractor will be notified that additional colors are needed.</p>
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1.5 block">Notes (optional)</label>
                    <Textarea
                      placeholder="Add any notes or special requests..."
                      value={note}
                      onChange={e => handleNoteChange(e.target.value)}
                      className="text-sm"
                      rows={2}
                      data-testid="textarea-customer-note"
                    />
                    {saveNoteMutation.isPending && (
                      <p className="text-[10px] text-gray-400 mt-1">Saving...</p>
                    )}
                  </div>

                  {!showApproveConfirm ? (
                    <Button
                      className="w-full h-11 text-white font-semibold"
                      style={{ backgroundColor: brandColor }}
                      onClick={() => setShowApproveConfirm(true)}
                      data-testid="button-customer-approve"
                    >
                      <Check className="w-4 h-4 mr-1.5" />
                      Approve Colors
                    </Button>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-start gap-2.5 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs text-amber-800 font-medium">Once you approve, your color selections will be locked.</p>
                          <p className="text-xs text-amber-700 mt-0.5">If you need any changes after approval, please contact {company?.name || 'your contractor'}{company?.phone ? ` at ${formatPhoneDisplay(company.phone)}` : ''}.</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          className="flex-1 h-10"
                          onClick={() => setShowApproveConfirm(false)}
                          data-testid="button-cancel-approve"
                        >
                          Cancel
                        </Button>
                        <Button
                          className="flex-1 h-10 text-white font-semibold"
                          style={{ backgroundColor: brandColor }}
                          onClick={() => approveMutation.mutate()}
                          disabled={approveMutation.isPending}
                          data-testid="button-confirm-approve"
                        >
                          {approveMutation.isPending ? (
                            <Clock className="w-4 h-4 mr-1.5 animate-spin" />
                          ) : (
                            <Check className="w-4 h-4 mr-1.5" />
                          )}
                          {approveMutation.isPending ? "Approving..." : "Yes, Approve"}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
              );
            })()}

            {isApproved && (
              <Card className="p-4" data-testid="approved-confirmation">
                <div className="flex items-center gap-2 text-green-700">
                  <CheckCircle2 className="w-5 h-5" />
                  <p className="font-medium text-sm">You approved these colors</p>
                </div>
                {!isContractorApproved && (
                  <div className="mt-3 pt-3 border-t">
                    <div className="flex items-center gap-2 text-amber-600">
                      <Clock className="w-4 h-4" />
                      <p className="text-sm font-medium">Waiting for {company?.name || 'your contractor'} to review and accept your color selections.</p>
                    </div>
                    <p className="text-xs text-gray-500 mt-1.5">You'll be notified once your contractor has reviewed the colors.</p>
                  </div>
                )}
                {isContractorApproved && (
                  <div className="mt-3 pt-3 border-t">
                    <div className="flex items-center gap-2 text-green-700">
                      <CheckCircle2 className="w-4 h-4" />
                      <p className="text-sm font-medium">Colors confirmed by both parties</p>
                    </div>
                  </div>
                )}
                {submission.customerNote && (
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">Your Note</p>
                    <p className="text-sm text-gray-700">{submission.customerNote}</p>
                  </div>
                )}
              </Card>
            )}
          </div>
        </Card>

        <div className="mt-6 text-center">
          <PoweredByFusePhone variant="dark" />
        </div>
      </div>


      <Dialog open={!!activeSurface} onOpenChange={(open) => {
        if (!open) {
          setActiveSurface(null);
          setModalMode('search');
          setModalManualName('');
          setModalManualBrand('');
          setModalSheen('');
          setModalSearchSelection(null);
          setModalSearchQuery('');
          setModalSearchResults([]);
          setModalPhotoPreview('');
          setModalPhotoRemoved(false);
        }
      }}>
        <DialogContent className="max-w-sm mx-auto max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{activeSurface ? `${activeSurface.roomName} — ${activeSurface.surfaceLabel}` : 'Select Color'}</DialogTitle>
            <DialogDescription>Search our paint color library or enter a color manually.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="flex items-center justify-center">
              <div className="inline-flex rounded-full bg-muted p-0.5 border" data-testid="customer-pill-toggle">
                <button
                  type="button"
                  className={`px-4 py-1.5 text-xs font-semibold rounded-full transition-all ${modalMode === 'search' ? 'bg-black text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                  onClick={() => setModalMode('search')}
                  data-testid="customer-pill-search"
                >
                  Search
                </button>
                <button
                  type="button"
                  className={`px-4 py-1.5 text-xs font-semibold rounded-full transition-all ${modalMode === 'manual' ? 'bg-black text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                  onClick={() => { setModalMode('manual'); setModalManualName(''); }}
                  data-testid="customer-pill-manual"
                >
                  Manual Entry
                </button>
              </div>
            </div>

            {modalMode === 'search' ? (
              <>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search paint color name or code..."
                      value={modalSearchQuery}
                      onChange={e => setModalSearchQuery(e.target.value)}
                      className="pl-9 pr-8 h-10 text-sm"
                      data-testid="customer-input-color-search"
                    />
                    {modalSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setModalSearchQuery("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1"
                      >
                        <X className="w-4 h-4 text-muted-foreground" />
                      </button>
                    )}
                  </div>
                </div>

                {modalSearching && modalSearchQuery.trim().length >= 2 && (
                  <div className="px-3 py-2 text-xs text-gray-400 flex items-center gap-1.5">
                    <Loader2 className="w-3 h-3 animate-spin" /> Searching...
                  </div>
                )}

                {!modalSearching && modalSearchQuery.trim().length >= 2 && modalSearchResults.length > 0 && (
                  <div className="max-h-56 overflow-y-auto rounded-lg border bg-background">
                    {modalSearchResults.map((color: any) => {
                      const isCurrentlySelected = modalSearchSelection?.id === color.id;
                      return (
                        <button
                          key={color.id}
                          type="button"
                          className={`w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 active:bg-muted transition-colors text-left border-b last:border-0 ${isCurrentlySelected ? 'bg-green-50 dark:bg-green-950/20' : ''}`}
                          onClick={() => {
                            setModalSearchSelection({ id: color.id, name: color.name, code: color.code, brand: color.brand, hexColor: color.hexColor });
                            setModalSearchQuery("");
                            setModalSearchResults([]);
                          }}
                          data-testid={`customer-color-result-${color.id}`}
                        >
                          <div
                            className="w-10 h-10 rounded-lg shadow-sm border shrink-0"
                            style={{ backgroundColor: color.hexColor || '#ccc' }}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{color.name}</p>
                            <p className="text-[10px] text-muted-foreground">{color.code} · {color.brand}</p>
                          </div>
                          {isCurrentlySelected && <Check className="w-4 h-4 text-green-600 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}

                {!modalSearching && modalSearchQuery.trim().length >= 2 && modalSearchResults.length === 0 && (
                  <div className="text-center py-2">
                    <p className="text-xs text-muted-foreground">No colors match "{modalSearchQuery}"</p>
                    <button
                      type="button"
                      className="mt-2 text-xs underline text-gray-600"
                      onClick={() => { setModalMode('manual'); setModalManualName(modalSearchQuery.trim()); setModalSearchQuery(''); }}
                    >
                      Enter manually instead
                    </button>
                  </div>
                )}

                {modalSearchSelection && (
                  <div className="flex items-center gap-3 p-2.5 bg-white border border-gray-200 rounded-lg" data-testid="customer-selected-color-card">
                    <div
                      className="w-10 h-10 rounded-lg shadow-sm shrink-0"
                      style={{ backgroundColor: modalSearchSelection.hexColor || '#ccc' }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{modalSearchSelection.name}</p>
                      <p className="text-[10px] text-gray-500">{modalSearchSelection.code} · {modalSearchSelection.brand}</p>
                    </div>
                    <button
                      type="button"
                      className="text-xs text-gray-400 hover:text-gray-600 shrink-0"
                      onClick={() => setModalSearchSelection(null)}
                      data-testid="customer-clear-selected-color"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-muted-foreground">Finish</label>
                  </div>
                  {activeSurface?.entry?.finish && (!modalSheen || modalSheen === 'contractor-decide') && (
                    <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded-lg">
                      <span className="text-[10px] text-blue-700 font-medium">Contractor suggestion:</span>
                      <span className="text-[10px] text-blue-900 font-semibold capitalize">{activeSurface.entry.finish}</span>
                    </div>
                  )}
                  <Select value={modalSheen || 'contractor-decide'} onValueChange={setModalSheen}>
                    <SelectTrigger
                      className="h-10 text-sm"
                      data-testid="customer-select-sheen"
                    >
                      <SelectValue placeholder="Select finish..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contractor-decide">Let contractor decide</SelectItem>
                      {['Flat', 'Matte', 'Eggshell', 'Satin', 'Semi-Gloss', 'High-Gloss'].map(s => (
                        <SelectItem key={s} value={s.toLowerCase()}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  className="w-full h-10 text-sm font-semibold"
                  style={{ backgroundColor: brandColor, color: '#fff' }}
                  disabled={submitColorsMutation.isPending}
                  onClick={() => {
                    if (!activeSurface) return;
                    const key = activeSurface.paintGroupKey;
                    if (modalSearchSelection) {
                      delete pendingBlobUrls.current[key];
                      setSearchSelections(prev => ({ ...prev, [key]: modalSearchSelection }));
                      const sheenVal = modalSheen === 'contractor-decide' ? '' : modalSheen;
                      updateCustomerInput(key, 'finish', sheenVal);
                      submitColorsMutation.mutate([{
                        paintGroupKey: key,
                        colorName: `${modalSearchSelection.name} (${modalSearchSelection.code})`,
                        brand: modalSearchSelection.brand,
                        finish: sheenVal,
                        hexColor: modalSearchSelection.hexColor,
                        colorCode: modalSearchSelection.code,
                        customImage: '',
                      }]);
                    }
                    setActiveSurface(null);
                  }}
                  data-testid="customer-modal-save-search"
                >
                  <Check className="w-4 h-4 mr-1.5" />
                  Save
                </Button>
              </>
            ) : (
              <div className="space-y-2.5">
                <Input
                  placeholder="Color name"
                  value={modalManualName}
                  onChange={e => setModalManualName(e.target.value)}
                  className="text-sm h-9 bg-white"
                  data-testid="customer-modal-manual-name"
                />
                <Input
                  placeholder="Brand (e.g. Benjamin Moore)"
                  value={modalManualBrand}
                  onChange={e => setModalManualBrand(e.target.value)}
                  className="text-sm h-9 bg-white"
                  data-testid="customer-modal-manual-brand"
                />
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1 block">Sheen</label>
                  {activeSurface?.entry?.finish && modalSheen === 'contractor-decide' && (
                    <div className="flex items-center gap-2 mb-1.5 p-2 bg-blue-50 border border-blue-200 rounded-lg">
                      <span className="text-[10px] text-blue-700 font-medium">Contractor suggestion:</span>
                      <span className="text-[10px] text-blue-900 font-semibold capitalize">{activeSurface.entry.finish}</span>
                    </div>
                  )}
                  <Select value={modalSheen || 'contractor-decide'} onValueChange={setModalSheen}>
                    <SelectTrigger className="h-9 text-sm bg-white">
                      <SelectValue placeholder="Select sheen..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contractor-decide">Let contractor decide</SelectItem>
                      {['Flat', 'Matte', 'Eggshell', 'Satin', 'Semi-Gloss', 'High-Gloss'].map(s => (
                        <SelectItem key={s} value={s.toLowerCase()}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {modalSheen === 'contractor-decide' && (
                    <p className="text-[9px] text-gray-400 mt-1">Your contractor will select the best finish for this surface.</p>
                  )}
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1 block">Photo (optional)</label>
                  <input
                    ref={modalPhotoRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const url = URL.createObjectURL(file);
                        setModalPhotoPreview(url);
                        setModalPhotoRemoved(false);
                      }
                      e.target.value = '';
                    }}
                    data-testid="customer-modal-photo-input"
                  />
                  {(modalPhotoPreview || (!modalPhotoRemoved && activeSurface?.entry?.customImage)) ? (
                    <div className="relative">
                      <img
                        src={modalPhotoPreview || activeSurface?.entry?.customImage || ''}
                        alt="Color sample"
                        className="w-full h-28 object-cover rounded-lg border"
                      />
                      <button
                        type="button"
                        className="absolute top-1.5 right-1.5 bg-black/60 text-white rounded-full p-1"
                        onClick={() => { setModalPhotoPreview(''); setModalPhotoRemoved(true); }}
                        data-testid="customer-modal-remove-photo"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="w-full flex items-center gap-2 px-3 py-3 rounded-lg border border-dashed border-muted-foreground/30 hover:border-primary/40 hover:bg-primary/5 transition-colors text-left"
                      onClick={() => modalPhotoRef.current?.click()}
                      data-testid="customer-modal-upload-photo"
                    >
                      <Camera className="w-4 h-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Upload a photo of the color</span>
                    </button>
                  )}
                </div>
                {modalManualName.trim() && modalSheen && (
                  <Button
                    size="sm"
                    className="w-full h-10 text-sm font-semibold"
                    style={{ backgroundColor: brandColor, color: '#fff' }}
                    disabled={submitColorsMutation.isPending}
                    onClick={() => {
                      if (!activeSurface) return;
                      const key = activeSurface.paintGroupKey;
                      delete pendingBlobUrls.current[key];
                      setSearchSelections(prev => { const n = { ...prev }; delete n[key]; return n; });
                      updateCustomerInput(key, 'colorName', modalManualName.trim());
                      updateCustomerInput(key, 'brand', modalManualBrand.trim());
                      const sheenVal = modalSheen === 'contractor-decide' ? '' : modalSheen;
                      updateCustomerInput(key, 'finish', sheenVal);
                      if (modalPhotoPreview && !modalPhotoRemoved) {
                        const blobUrl = modalPhotoPreview;
                        pendingBlobUrls.current[key] = blobUrl;
                        fetch(blobUrl)
                          .then(r => r.blob())
                          .then(blob => {
                            const reader = new FileReader();
                            reader.onload = () => {
                              uploadPhotoMutation.mutate({ paintGroupKey: key, imageData: reader.result as string });
                            };
                            reader.readAsDataURL(blob);
                          });
                      }
                      submitColorsMutation.mutate([{
                        paintGroupKey: key,
                        colorName: modalManualName.trim(),
                        brand: modalManualBrand.trim(),
                        finish: sheenVal,
                        hexColor: '',
                        colorCode: '',
                        customImage: modalPhotoRemoved ? '' : undefined,
                      }]);
                      setActiveSurface(null);
                    }}
                    data-testid="customer-modal-save-manual"
                  >
                    <Check className="w-3.5 h-3.5 mr-1" />
                    Save
                  </Button>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {expandedImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4"
          onClick={() => setExpandedImage(null)}
          data-testid="color-review-lightbox"
        >
          <img
            src={expandedImage}
            alt="Color sample"
            className="max-w-full max-h-[75vh] rounded-2xl shadow-2xl object-contain"
            onClick={e => e.stopPropagation()}
          />
          <Button
            variant="outline"
            className="mt-4 bg-white/10 border-white/20 text-white hover:bg-white/20"
            onClick={() => setExpandedImage(null)}
          >
            <X className="w-4 h-4 mr-2" />
            Close
          </Button>
        </div>
      )}

    </div>
  );
}
