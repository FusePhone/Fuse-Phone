import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Send, Loader2, Plus, Timer, Sparkles, CheckCircle2, ImagePlus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LineItem } from "./LineItemEditorModal";
import type { ProposalDisplayDefaults, ItemDisplayOverrides, Material } from "@shared/schema";

const isDevEnv = typeof window !== 'undefined' && (window.location.hostname.includes('replit') || window.location.hostname === 'localhost');

const ESTIMATOR_PROGRESS_MESSAGES = [
  "Reading your description...",
  "Parsing room dimensions...",
  "Identifying surfaces and coats...",
  "Calculating square footage...",
  "Estimating labor hours...",
  "Selecting materials and coverage...",
  "Organizing material groups...",
];

const FLOOR_PLAN_PROGRESS_MESSAGES = [
  "Scanning floor plan...",
  "Identifying room boundaries...",
  "Measuring dimensions...",
  "Counting doors and windows...",
  "Extracting room details...",
  "Applying your directions...",
  "Calculating surfaces and coats...",
  "Estimating labor hours...",
  "Selecting materials and coverage...",
];

interface PatchOp {
  itemId?: string;
  op: string;
  value: any;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  items?: any[];
  patches?: PatchOp[];
  globalPatches?: PatchOp[];
}

export interface EstimatorRoom {
  name: string;
  length: number;
  width: number;
  height: number;
  scopeNotes: string;
  surfaceDescription?: string;
  substrate?: string;
  walls: boolean;
  ceiling: boolean;
  baseboard: boolean;
  crownMolding: boolean;
  shoeMolding: boolean;
  chairRail: boolean;
  doors: boolean;
  doorCasing: boolean;
  windowCasing: boolean;
  doorCount: number;
  windowCount: number;
  coats: Record<string, number>;
  primerOverride?: Record<string, { enabled: boolean; coats?: number }>;
}

export interface EstimatorMaterialGroup {
  id: string;
  name: string;
  surfaceKeys: string[];
  areaNames?: string[];
  paintRef?: {
    brand: string;
    product: string;
    sheen: string;
  } | null;
}

export interface EstimatorTimingReport {
  openAiMs: number;
  serverTotalMs: number;
  networkMs: number;
  buildMs: number;
  totalMs: number;
}

interface FuseAIChatProps {
  projectId: number | undefined;
  onAddItems?: (items: LineItem[]) => void;
  onApplyPatches?: (patches: PatchOp[], globalPatches: PatchOp[]) => void;
  onEstimatorRooms?: (rooms: EstimatorRoom[], blockName?: string, materialGroups?: EstimatorMaterialGroup[]) => void;
  onSuggestProjectName?: (name: string) => void;
  proposalDisplayDefaults?: ProposalDisplayDefaults;
  existingItems?: LineItem[];
  aiMode?: 'default' | 'simple_only' | 'estimator_fill';
  estimateType?: string;
  expanded: boolean;
  onToggle: () => void;
  onTimingReport?: (timing: EstimatorTimingReport) => void;
}

export function FuseAIChat({ projectId, onAddItems, onApplyPatches, onEstimatorRooms, onSuggestProjectName, proposalDisplayDefaults, existingItems, aiMode = 'default', estimateType, expanded, onToggle, onTimingReport }: FuseAIChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [requestStartTime, setRequestStartTime] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const [lastRequestMs, setLastRequestMs] = useState<number | null>(null);
  const [estimatorProgressIdx, setEstimatorProgressIdx] = useState(0);
  const [estimatorDone, setEstimatorDone] = useState(false);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [isFloorPlanMode, setIsFloorPlanMode] = useState(false);
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isEstimatorMode = aiMode === 'estimator_fill';

  const { data: userMaterials } = useQuery<Material[]>({
    queryKey: ['/api/materials'],
    enabled: aiMode !== 'estimator_fill',
  });

  useEffect(() => {
    if (!requestStartTime) return;
    const interval = setInterval(() => {
      setElapsedMs(Date.now() - requestStartTime);
    }, 100);
    return () => clearInterval(interval);
  }, [requestStartTime]);

  useEffect(() => {
    if (!loading || !isEstimatorMode) {
      setEstimatorProgressIdx(0);
      return;
    }
    const messages = isFloorPlanMode ? FLOOR_PLAN_PROGRESS_MESSAGES : ESTIMATOR_PROGRESS_MESSAGES;
    const stepDelay = isFloorPlanMode ? 3200 : 3500;
    let idx = 0;
    const interval = setInterval(() => {
      idx++;
      if (idx >= messages.length) {
        idx = 0;
      }
      setEstimatorProgressIdx(idx);
    }, stepDelay);
    return () => clearInterval(interval);
  }, [loading, isEstimatorMode, isFloorPlanMode]);

  useEffect(() => {
    if (expanded) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [expanded]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleImageAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: "Invalid file", description: "Please upload an image file (PNG, JPG, etc.)", variant: "destructive" });
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast({ title: "File too large", description: "Please upload an image smaller than 15MB", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAttachedImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  const sendMessage = async () => {
    const hasText = input.trim().length > 0;
    const hasImage = !!attachedImage;
    if ((!hasText && !hasImage) || loading) return;

    if (!projectId) {
      toast({
        title: "No project linked",
        description: "FuseAI needs a project to pull context from",
        variant: "destructive",
      });
      return;
    }

    const userMessage = hasText ? input.trim() : (hasImage ? "Analyze this floor plan and extract all rooms" : "");
    const imageToSend = attachedImage;
    setInput("");
    setAttachedImage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    const updatedMessages: ChatMessage[] = [...messages, { role: "user", content: hasImage ? `${userMessage} [Floor plan attached]` : userMessage }];
    setMessages(updatedMessages);
    setLoading(true);
    const useFloorPlanParallel = isEstimatorMode && !!imageToSend;
    setIsFloorPlanMode(useFloorPlanParallel);
    const timerStart = Date.now();
    if (isDevEnv) {
      setRequestStartTime(timerStart);
      setElapsedMs(0);
      setLastRequestMs(null);
    }

    try {
      const isEstimatorFill = aiMode === 'estimator_fill';

      if (useFloorPlanParallel) {
        const floorPlanPromise = fetch('/api/ai/analyze-floor-plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ image: imageToSend, directions: hasText ? userMessage : '' }),
        });

        const chatPromise = fetch("/api/ai/project-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            projectId,
            message: hasText ? userMessage : "Analyze this floor plan and extract all rooms",
            history: [],
            aiMode: 'estimator_fill',
            ...(estimateType ? { estimateType } : {}),
            image: imageToSend,
          }),
        });

        const [floorPlanRes, chatRes] = await Promise.all([floorPlanPromise, chatPromise]);

        let floorPlanRooms: any[] = [];
        let floorPlanOk = false;
        if (floorPlanRes.ok) {
          const fpData = await floorPlanRes.json();
          if (fpData.rooms && Array.isArray(fpData.rooms) && fpData.rooms.length > 0) {
            floorPlanRooms = fpData.rooms;
            floorPlanOk = true;
          }
        }

        let chatData: any = null;
        let chatOk = false;
        if (chatRes.ok) {
          chatData = await chatRes.json();
          chatOk = true;
        } else {
          const err = await chatRes.json().catch(() => ({ error: `Server error (${chatRes.status})` }));
          if (err.requiresFuseAi) {
            throw new Error("FuseAI is included with the Elite plan. Upgrade to Elite to access AI features.");
          }
        }

        const roundTripMs = Date.now() - timerStart;

        if (chatOk && chatData && Array.isArray(chatData.estimatorRooms) && chatData.estimatorRooms.length > 0 && onEstimatorRooms) {
          const buildStart = Date.now();
          const serverTiming = chatData._timing || {};
          const openAiMs = serverTiming.openAiMs || 0;
          const serverTotalMs = serverTiming.serverTotalMs || 0;
          const networkMs = Math.max(0, roundTripMs - serverTotalMs);
          const aiMaterialGroups = Array.isArray(chatData.estimatorMaterialGroups) ? chatData.estimatorMaterialGroups : undefined;
          onEstimatorRooms(chatData.estimatorRooms, chatData.estimatorBlockName, aiMaterialGroups);
          const buildMs = Date.now() - buildStart;
          const totalMs = Date.now() - timerStart;
          const mgCount = aiMaterialGroups?.length || 0;

          if (onTimingReport) {
            onTimingReport({ openAiMs, serverTotalMs, networkMs, buildMs, totalMs });
          }

          toast({
            title: `${chatData.estimatorRooms.length} area${chatData.estimatorRooms.length !== 1 ? "s" : ""} ready${mgCount > 0 ? ` with ${mgCount} material group${mgCount !== 1 ? "s" : ""}` : ""}`,
            description: floorPlanOk ? `Floor plan extracted ${floorPlanRooms.length} rooms (parallel)` : "Review and adjust before saving",
          });
          setEstimatorDone(true);
          setTimeout(() => {
            onToggle();
            setMessages([]);
            setInput("");
            setEstimatorDone(false);
            setIsFloorPlanMode(false);
          }, 2000);
          return;
        } else if (floorPlanOk && onEstimatorRooms) {
          const buildStart = Date.now();
          const convertedRooms: EstimatorRoom[] = floorPlanRooms.map((room: any) => ({
            name: room.name || "Room",
            length: room.length || 0,
            width: room.width || 0,
            height: room.ceilingHeight || 8,
            scopeNotes: '',
            walls: room.walls !== false,
            ceiling: room.ceiling === true,
            baseboard: room.baseboard !== false,
            crownMolding: room.crownMolding === true,
            shoeMolding: room.shoeMolding === true,
            chairRail: room.chairRail === true,
            doors: room.doors === true,
            doorCasing: room.doorCasing === true,
            windowCasing: room.windowCasing === true,
            doorCount: room.doorCount || 0,
            windowCount: room.windowCount || 0,
            coats: room.coatsOverride || {},
          }));
          onEstimatorRooms(convertedRooms, undefined, undefined);
          const buildMs = Date.now() - buildStart;
          const totalMs = Date.now() - timerStart;

          if (onTimingReport) {
            onTimingReport({ openAiMs: 0, serverTotalMs: roundTripMs, networkMs: 0, buildMs, totalMs });
          }

          toast({
            title: `${convertedRooms.length} rooms extracted from floor plan`,
            description: "Review and adjust before saving",
          });
          setEstimatorDone(true);
          setTimeout(() => {
            onToggle();
            setMessages([]);
            setInput("");
            setEstimatorDone(false);
            setIsFloorPlanMode(false);
          }, 2000);
          return;
        } else {
          throw new Error("Could not extract rooms from the floor plan. Try a clearer image or describe rooms manually.");
        }
      }

      const proposalContext = !isEstimatorFill && (proposalDisplayDefaults || existingItems) ? {
        proposalDisplayDefaults: proposalDisplayDefaults || undefined,
        items: existingItems?.map((item, i) => ({
          item_id: String(i),
          name: item.name,
          scopeNoteHtml: item.scopeNoteHtml,
          surfaces: item.surfaces?.map(s => ({ key: s.key, coats: s.coats })),
          displayOverrides: item.displayOverrides,
        })),
      } : undefined;

      const res = await fetch("/api/ai/project-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          projectId,
          message: userMessage,
          history: isEstimatorFill ? [] : updatedMessages.slice(existingItems?.length ? -5 : -30),
          ...(proposalContext ? { proposalContext } : {}),
          ...(aiMode !== 'default' ? { aiMode } : {}),
          ...(estimateType ? { estimateType } : {}),
          ...(imageToSend ? { image: imageToSend } : {}),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `Server error (${res.status})` }));
        console.error('[FuseAI] Request failed:', res.status, err);
        if (err.requiresFuseAi) {
          throw new Error("FuseAI is included with the Elite plan. Upgrade to Elite to access AI features.");
        }
        throw new Error(err.error || `Request failed (${res.status})`);
      }

      const roundTripMs = Date.now() - timerStart;

      const data = await res.json();
      const serverTiming = data._timing || {};
      const openAiMs = serverTiming.openAiMs || 0;
      const serverTotalMs = serverTiming.serverTotalMs || 0;
      const networkMs = Math.max(0, roundTripMs - serverTotalMs);

      const reply = data.reply || "I received your message but couldn't generate a detailed response. Please try again.";
      const items = Array.isArray(data.items) && data.items.length > 0 ? data.items : undefined;
      const patches = Array.isArray(data.patches) ? data.patches : undefined;
      const globalPatches = Array.isArray(data.globalPatches) ? data.globalPatches : undefined;

      if (data.suggestedProjectName && onSuggestProjectName) {
        onSuggestProjectName(data.suggestedProjectName);
      }

      if ((patches || globalPatches) && onApplyPatches) {
        onApplyPatches(patches || [], globalPatches || []);
      }

      if (Array.isArray(data.estimatorRooms) && data.estimatorRooms.length > 0 && onEstimatorRooms) {
        const buildStart = Date.now();
        const aiMaterialGroups = Array.isArray(data.estimatorMaterialGroups) ? data.estimatorMaterialGroups : undefined;
        onEstimatorRooms(data.estimatorRooms, data.estimatorBlockName, aiMaterialGroups);
        const buildMs = Date.now() - buildStart;
        const totalMs = Date.now() - timerStart;
        const mgCount = aiMaterialGroups?.length || 0;

        if (onTimingReport) {
          onTimingReport({ openAiMs, serverTotalMs, networkMs, buildMs, totalMs });
        }

        toast({
          title: `${data.estimatorRooms.length} area${data.estimatorRooms.length !== 1 ? "s" : ""} ready${mgCount > 0 ? ` with ${mgCount} material group${mgCount !== 1 ? "s" : ""}` : ""}`,
          description: "Review and adjust before saving",
        });
        if (isEstimatorMode) {
          setEstimatorDone(true);
          setTimeout(() => {
            onToggle();
            setMessages([]);
            setInput("");
            setEstimatorDone(false);
            setIsFloorPlanMode(false);
          }, 2000);
          return;
        }
      }

      setMessages(prev => [
        ...prev,
        { role: "assistant", content: reply, items, patches, globalPatches },
      ]);
    } catch (error: any) {
      toast({
        title: "FuseAI Error",
        description: error.message || "Please try again",
        variant: "destructive",
      });
      setMessages(prev => prev.slice(0, -1));
      setInput(userMessage);
    } finally {
      setLoading(false);
      setIsFloorPlanMode(false);
      if (isDevEnv) {
        const elapsed = Date.now() - timerStart;
        setLastRequestMs(elapsed);
        setRequestStartTime(null);
      }
    }
  };

  const matchMaterial = useCallback((prefs: { brand?: string; product?: string; finish?: string }) => {
    if (!userMaterials?.length) return undefined;
    if (!prefs.brand && !prefs.product) return undefined;
    const brandLower = prefs.brand?.toLowerCase();
    const productLower = prefs.product?.toLowerCase();
    let bestBrand: Material | undefined;
    let bestProduct: Material | undefined;
    for (const m of userMaterials) {
      if (!m.active) continue;
      const mBrand = m.brand?.toLowerCase() || '';
      const mName = m.materialName?.toLowerCase() || '';
      const brandMatch = brandLower && (mBrand.includes(brandLower) || brandLower.includes(mBrand));
      const productMatch = productLower && (mName.includes(productLower) || productLower.includes(mName));
      if (brandMatch && productMatch) return m;
      if (brandMatch && !bestBrand) bestBrand = m;
      if (productMatch && !bestProduct) bestProduct = m;
    }
    return bestBrand || bestProduct;
  }, [userMaterials]);

  const handleAddItems = (items: any[]) => {
    if (!onAddItems) return;
    const converted: LineItem[] = items.map((item: any) => {
      let materialId: number | undefined;
      let paintAssignment: LineItem['paintAssignment'] = undefined;
      if (item.paintPreferences) {
        const matched = matchMaterial(item.paintPreferences);
        materialId = matched?.id;
        paintAssignment = {
          brand: item.paintPreferences.brand || undefined,
          product: item.paintPreferences.product || (matched?.materialName) || undefined,
          finish: item.paintPreferences.finish || (matched?.finish) || undefined,
          colorText: item.paintPreferences.colorText || undefined,
          materialId,
        };
      }
      return {
        name: item.name || "",
        description: item.description || item.scopeNoteHtml || "",
        quantity: item.quantity || 1,
        unitPrice: (item.unitPrice || 0) / 100,
        total: (item.total || 0) / 100,
        isOverallPrep: item.isOverallPrep === true ? true : undefined,
        scopeNoteHtml: item.scopeNoteHtml || undefined,
        surfaces: item.surfaces || undefined,
        pricingDetails: item.pricingDetails || undefined,
        displayOverrides: item.displayOverrides || undefined,
        paintAssignment,
        debug: item.debug || undefined,
      };
    });
    onAddItems(converted);
    const matchedCount = converted.filter(c => c.paintAssignment?.materialId).length;
    toast({
      title: `${converted.length} item${converted.length !== 1 ? "s" : ""} added`,
      description: matchedCount > 0
        ? `${matchedCount} item${matchedCount !== 1 ? "s" : ""} matched to your materials`
        : "Review and adjust prices as needed",
    });
  };

  const handleKeyDown = (_e: React.KeyboardEvent) => {
  };

  if (!expanded) return null;

  if (isEstimatorMode) {
    return (
      <div className="space-y-2" data-testid="fuseai-chat-panel">
        {loading && (
          <div className="rounded-md border border-border bg-muted/30 p-4 space-y-3" data-testid="fuseai-estimator-progress">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="w-4 h-4 text-primary animate-pulse" />
              {isFloorPlanMode ? "Analyzing floor plan" : "Building your estimate"}
            </div>
            {isFloorPlanMode && (
              <div className="text-[10px] text-muted-foreground">
                Running parallel analysis for faster results
              </div>
            )}
            <div className="flex items-center gap-2 text-sm transition-all duration-500">
              <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
              <span className="text-foreground" key={estimatorProgressIdx}>
                {(isFloorPlanMode ? FLOOR_PLAN_PROGRESS_MESSAGES : ESTIMATOR_PROGRESS_MESSAGES)[estimatorProgressIdx]}
              </span>
            </div>
            {isDevEnv && requestStartTime && (
              <div className="flex items-center gap-1 text-[10px] font-mono text-amber-600 dark:text-amber-400 mt-1" data-testid="text-floor-plan-timer">
                <Timer className="w-3 h-3" />
                {(elapsedMs / 1000).toFixed(1)}s
              </div>
            )}
          </div>
        )}

        {estimatorDone && !loading && (
          <div className="rounded-md border border-green-500/30 bg-green-500/10 p-4" data-testid="fuseai-estimator-done">
            <div className="flex items-center gap-2 text-sm font-medium text-green-600 dark:text-green-400">
              <CheckCircle2 className="w-4 h-4" />
              Estimate built — review below
            </div>
          </div>
        )}

        {!loading && !estimatorDone && (
          <>
            <div className="text-xs text-muted-foreground space-y-1" data-testid="fuseai-chat-intro">
              <p className="font-medium">Describe areas to estimate:</p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>"Master bedroom 12x14x9, walls and ceiling"</li>
                <li>"Hallway 20x4x8, walls only, 3 coats"</li>
              </ul>
              <div className="flex items-start gap-1.5 mt-2 pt-2 border-t border-border/50">
                <Sparkles className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-[11px] leading-relaxed">
                  <span className="font-medium text-foreground">Floor Plan Analysis</span>
                  {" — "}Attach a floor plan image to auto-extract rooms, dimensions, and surfaces.
                  <span className="text-muted-foreground/70"> Included with your FuseAI subscription.</span>
                </p>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageAttach}
              className="hidden"
              data-testid="input-fuseai-floor-plan"
            />
            {attachedImage && (
              <div className="relative rounded-md overflow-hidden border border-border">
                <img src={attachedImage} alt="Floor plan" className="w-full max-h-36 object-contain bg-white" data-testid="img-floor-plan-preview" />
                <button
                  type="button"
                  onClick={() => { setAttachedImage(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                  className="absolute top-1 right-1 bg-background/80 rounded-full p-1"
                  data-testid="button-remove-floor-plan"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
            <div className="flex items-end gap-1">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                data-testid="button-attach-floor-plan"
              >
                <ImagePlus className="w-4 h-4" />
              </Button>
              <Textarea
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
                }}
                onKeyDown={handleKeyDown}
                placeholder={attachedImage ? "Add directions: coats, surfaces, colors..." : "Describe rooms/areas with dimensions..."}
                className="resize-none text-sm min-h-[40px] flex-1"
                style={{ maxHeight: "120px", overflowY: "auto" }}
                disabled={loading}
                data-testid="input-fuseai-chat"
              />
              <Button
                size="icon"
                onClick={sendMessage}
                disabled={(!input.trim() && !attachedImage) || loading}
                data-testid="button-fuseai-send"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="fuseai-chat-panel">
      {messages.length === 0 && (
        <div className="text-xs text-muted-foreground space-y-1" data-testid="fuseai-chat-intro">
          {aiMode === 'simple_only' ? (
            <>
              <p className="font-medium">Talk to FuseAI about this project <span className="text-amber-600 dark:text-amber-400">(Test Pilot)</span>:</p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>"Add pressure wash driveway $350"</li>
                <li>"What color did the customer mention?"</li>
                <li>"Summarize the messages so far"</li>
                <li>"Add a kitchen repaint line item"</li>
              </ul>
              <p className="text-[10px] text-amber-600/80 dark:text-amber-400/80 mt-1">Test Pilot — always check AI output for accuracy.</p>
            </>
          ) : (
            <>
              <p className="font-medium">Talk to FuseAI about this project:</p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>"Room is 12x14x9, walls and ceiling, 2 coats"</li>
                <li>"What color did the customer mention?"</li>
                <li>"Summarize the messages so far"</li>
                <li>"Generate items for a kitchen repaint"</li>
              </ul>
            </>
          )}
        </div>
      )}

      {messages.length > 0 && (
        <div
          ref={scrollRef}
          className="max-h-[250px] overflow-y-auto space-y-2 pr-1"
          data-testid="fuseai-chat-messages"
        >
          {messages.map((msg, idx) => (
            <div key={idx} className={cn("text-sm", msg.role === "user" ? "text-right" : "text-left")}>
              <div
                className={cn(
                  "inline-block rounded-md px-3 py-2 max-w-[90%] text-left",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                )}
                data-testid={`fuseai-chat-message-${msg.role}-${idx}`}
              >
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
                {msg.items && msg.items.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-border/50 space-y-1">
                    <p className="text-xs font-medium opacity-80">
                      {msg.items.length} line item{msg.items.length !== 1 ? "s" : ""} generated:
                    </p>
                    {msg.items.map((item: any, i: number) => (
                      <div key={i} className="text-xs opacity-70 flex items-center justify-between gap-2 flex-wrap">
                        <span>{item.name}</span>
                        <span className="font-mono">${((item.unitPrice || 0) / 100).toFixed(2)}</span>
                      </div>
                    ))}
                    {onAddItems && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-1 w-full"
                        onClick={() => handleAddItems(msg.items!)}
                        data-testid={`button-add-ai-items-${idx}`}
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        Add to Proposal
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="fuseai-chat-loading">
              <Loader2 className="w-3 h-3 animate-spin" />
              Thinking...
              {isDevEnv && requestStartTime && (
                <span className="ml-auto font-mono text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1" data-testid="text-ai-timer-live">
                  <Timer className="w-3 h-3" />
                  {(elapsedMs / 1000).toFixed(1)}s
                </span>
              )}
            </div>
          )}
          {isDevEnv && !loading && lastRequestMs !== null && (
            <div className="flex items-center justify-end gap-1 text-[10px] font-mono text-muted-foreground" data-testid="text-ai-timer-result">
              <Timer className="w-3 h-3" />
              {(lastRequestMs / 1000).toFixed(1)}s
            </div>
          )}
        </div>
      )}

      <div className="flex items-end gap-2">
        <Textarea
          ref={inputRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
          }}
          onKeyDown={handleKeyDown}
          placeholder={messages.length === 0
            ? "Describe work or ask about this project..."
            : "Ask a follow-up..."}
          className="resize-none text-sm min-h-[40px] flex-1"
          style={{ maxHeight: "120px", overflowY: "auto" }}
          disabled={loading}
          data-testid="input-fuseai-chat"
        />
        <Button
          size="icon"
          onClick={sendMessage}
          disabled={!input.trim() || loading}
          data-testid="button-fuseai-send"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </Button>
      </div>

      {messages.length > 0 && (
        <div className="flex items-center justify-end">
          <Button
            size="sm"
            variant="ghost"
            className="text-xs"
            onClick={() => setMessages([])}
            data-testid="button-fuseai-clear"
          >
            Clear chat
          </Button>
        </div>
      )}
    </div>
  );
}
