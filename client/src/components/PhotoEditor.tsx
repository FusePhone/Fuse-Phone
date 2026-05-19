import { useState, useRef, useCallback, useEffect, memo } from "react";
import { createPortal } from "react-dom";

type Tool = "select" | "rectangle" | "circle" | "arrow" | "freehand" | "text";
type ResizeHandle = "tl" | "tr" | "bl" | "br" | "move" | "rotate" | "arrow-start" | "arrow-end" | "text-left" | "text-right" | "text-edit" | "delete" | null;

interface Point { x: number; y: number; }

export interface Annotation {
  id: string;
  tool: Tool;
  color: string;
  strokeWidth: number;
  points?: Point[];
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  text?: string;
  fontSize?: number;
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
  rotation?: number;
  maxWidth?: number;
}

const COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#a855f7", "#ffffff", "#000000"];
const STROKE_WIDTHS = [2, 4, 6, 8];
const HANDLE_SIZE = 14;

function uid() { return Math.random().toString(36).slice(2, 10); }

const _measureCanvas = document.createElement("canvas");
const _measureCtx = _measureCanvas.getContext("2d")!;

const MIN_FONT_SIZE = 14;

function measureTextWidth(text: string, fontSize: number): number {
  _measureCtx.font = `bold ${fontSize}px system-ui, sans-serif`;
  const lines = text.split("\n");
  let maxW = 0;
  for (const line of lines) {
    const w = _measureCtx.measureText(line || " ").width;
    if (w > maxW) maxW = w;
  }
  return maxW;
}

function measureWrappedTextWidth(text: string, fontSize: number, wrapMaxWidth: number): number {
  _measureCtx.font = `bold ${fontSize}px system-ui, sans-serif`;
  const lines = wrapText(_measureCtx, text, wrapMaxWidth);
  let maxW = 0;
  for (const line of lines) {
    const w = _measureCtx.measureText(line || " ").width;
    if (w > maxW) maxW = w;
  }
  return maxW;
}

function getTextVisualEnd(ann: Annotation): { vx: number; vy: number } {
  if (!ann.maxWidth || !ann.text || ann.startX == null || ann.startY == null || ann.endX == null || ann.endY == null) {
    return { vx: ann.endX ?? 0, vy: ann.endY ?? 0 };
  }
  const { fontSize: fs } = textPropsFromEndpoints(ann.startX, ann.startY, ann.endX, ann.endY, ann.text);
  const tDist = Math.sqrt((ann.endX - ann.startX) ** 2 + (ann.endY - ann.startY) ** 2);
  const tWrapW = ann.maxWidth * (fs / 24);
  const wrappedW = measureWrappedTextWidth(ann.text, fs, tWrapW);
  const visDist = Math.min(wrappedW, tDist);
  const dirX = tDist > 0 ? (ann.endX - ann.startX) / tDist : 1;
  const dirY = tDist > 0 ? (ann.endY - ann.startY) / tDist : 0;
  return { vx: ann.startX + dirX * visDist, vy: ann.startY + dirY * visDist };
}

export function fontSizeForWidth(text: string, targetWidth: number): number {
  if (!text || targetWidth <= 0) return MIN_FONT_SIZE;
  const refFs = 100;
  const refW = measureTextWidth(text, refFs);
  if (refW <= 0) return MIN_FONT_SIZE;
  return Math.max(MIN_FONT_SIZE, (targetWidth / refW) * refFs);
}

function textPropsFromEndpoints(startX: number, startY: number, endX: number, endY: number, text: string): { rotation: number; fontSize: number } {
  const dist = Math.sqrt((endX - startX) ** 2 + (endY - startY) ** 2);
  return {
    rotation: Math.atan2(endY - startY, endX - startX),
    fontSize: fontSizeForWidth(text, dist),
  };
}

function minDistForText(text: string): number {
  if (!text) return 20;
  return measureTextWidth(text, MIN_FONT_SIZE);
}

export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const paragraphs = text.split("\n");
  const result: string[] = [];
  for (const para of paragraphs) {
    if (!para) { result.push(""); continue; }
    const words = para.split(" ");
    let line = "";
    for (const word of words) {
      const test = line ? line + " " + word : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        result.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) result.push(line);
  }
  return result;
}

export function renderAnnotation(ctx: CanvasRenderingContext2D, ann: Annotation) {
  try {
    if (!ann || !ann.tool) return;
    ctx.save();
    ctx.strokeStyle = ann.color || "#ef4444";
    ctx.lineWidth = ann.strokeWidth || 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    switch (ann.tool) {
      case "rectangle":
        if (ann.x != null && ann.y != null && ann.width != null && ann.height != null) {
          ctx.strokeRect(ann.x, ann.y, ann.width, ann.height);
        }
        break;
      case "circle":
        if (ann.x != null && ann.y != null && ann.width != null && ann.height != null) {
          const cx = ann.x + ann.width / 2, cy = ann.y + ann.height / 2;
          ctx.beginPath();
          ctx.ellipse(cx, cy, Math.abs(ann.width / 2), Math.abs(ann.height / 2), 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        break;
      case "arrow":
        if (ann.startX != null && ann.startY != null && ann.endX != null && ann.endY != null) {
          const dx = ann.endX - ann.startX, dy = ann.endY - ann.startY;
          const angle = Math.atan2(dy, dx);
          const headLen = Math.max(18, (ann.strokeWidth || 3) * 5);
          ctx.beginPath();
          ctx.moveTo(ann.startX, ann.startY);
          ctx.lineTo(ann.endX, ann.endY);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(ann.endX, ann.endY);
          ctx.lineTo(ann.endX - headLen * Math.cos(angle - Math.PI / 6), ann.endY - headLen * Math.sin(angle - Math.PI / 6));
          ctx.moveTo(ann.endX, ann.endY);
          ctx.lineTo(ann.endX - headLen * Math.cos(angle + Math.PI / 6), ann.endY - headLen * Math.sin(angle + Math.PI / 6));
          ctx.stroke();
        }
        break;
      case "freehand":
        if (ann.points && ann.points.length > 1) {
          ctx.beginPath();
          ctx.moveTo(ann.points[0].x, ann.points[0].y);
          for (let i = 1; i < ann.points.length; i++) ctx.lineTo(ann.points[i].x, ann.points[i].y);
          ctx.stroke();
        }
        break;
      case "text":
        if (ann.text && ann.startX != null && ann.startY != null && ann.endX != null && ann.endY != null) {
          const { rotation: rot, fontSize: fs } = textPropsFromEndpoints(ann.startX, ann.startY, ann.endX, ann.endY, ann.text);
          ctx.translate(ann.startX, ann.startY);
          ctx.rotate(rot);
          ctx.font = `bold ${fs}px system-ui, sans-serif`;
          ctx.fillStyle = ann.color || "#ef4444";
          const dist = Math.sqrt((ann.endX - ann.startX) ** 2 + (ann.endY - ann.startY) ** 2);
          const wrapWidth = ann.maxWidth ? ann.maxWidth * (fs / 24) : dist;
          const lines = wrapWidth > 0 ? wrapText(ctx, ann.text, wrapWidth) : ann.text.split("\n");
          const lineHeight = fs * 1.2;
          ctx.shadowColor = "rgba(0,0,0,0.9)";
          ctx.shadowBlur = fs * 0.3;
          ctx.shadowOffsetX = 2;
          ctx.shadowOffsetY = 2;
          for (let li = 0; li < lines.length; li++) {
            ctx.fillText(lines[li], 0, li * lineHeight);
          }
          ctx.shadowColor = "rgba(0,0,0,0.5)";
          ctx.shadowBlur = fs * 0.15;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
          for (let li = 0; li < lines.length; li++) {
            ctx.fillText(lines[li], 0, li * lineHeight);
          }
        }
        break;
    }
    ctx.restore();
  } catch (_e) {
    try { ctx.restore(); } catch (_e2) {}
  }
}

function getBounds(ann: Annotation): { x: number; y: number; w: number; h: number } | null {
  if ((ann.tool === "rectangle" || ann.tool === "circle") && ann.x != null && ann.y != null && ann.width != null && ann.height != null) {
    return { x: ann.x, y: ann.y, w: ann.width, h: ann.height };
  }
  if (ann.tool === "arrow" && ann.startX != null && ann.startY != null && ann.endX != null && ann.endY != null) {
    const x = Math.min(ann.startX, ann.endX), y = Math.min(ann.startY, ann.endY);
    return { x, y, w: Math.abs(ann.endX - ann.startX), h: Math.abs(ann.endY - ann.startY) };
  }
  if (ann.tool === "freehand" && ann.points && ann.points.length > 0) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of ann.points) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
  if (ann.tool === "text" && ann.startX != null && ann.startY != null && ann.endX != null && ann.endY != null && ann.text) {
    const { fontSize: fs } = textPropsFromEndpoints(ann.startX, ann.startY, ann.endX, ann.endY, ann.text);
    const dist = Math.sqrt((ann.endX - ann.startX) ** 2 + (ann.endY - ann.startY) ** 2);
    const wrapWidth = ann.maxWidth ? ann.maxWidth * (fs / 24) : dist;
    _measureCtx.font = `bold ${fs}px system-ui, sans-serif`;
    const wrappedLines = wrapText(_measureCtx, ann.text, wrapWidth);
    const lineCount = wrappedLines.length;
    const textH = fs * 1.2 * lineCount;
    const { vx } = getTextVisualEnd(ann);
    const visW = Math.abs(vx - ann.startX);
    const w = Math.max(visW, 10);
    return { x: ann.startX, y: ann.startY - fs, w, h: Math.max(textH + fs * 0.2, 10) };
  }
  return null;
}

interface EditorProps {
  initialSrc?: string;
  initialName?: string;
  initialAnnotations?: Annotation[];
  onSave?: (annotations: Annotation[], rotatedImageDataUrl?: string) => void | Promise<void>;
  onCancel?: () => void;
}

export const Editor = memo(function Editor({ initialSrc, initialName, initialAnnotations, onSave, onCancel }: EditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageName, setImageName] = useState("");
  const [tool, setTool] = useState<Tool>("select");
  const [color, setColor] = useState("#ef4444");
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [undoStack, setUndoStack] = useState<Annotation[][]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const drawingRef = useRef(false);
  const currentAnnotationRef = useRef<Annotation | null>(null);
  const startPointRef = useRef<Point | null>(null);
  const [renderTick, setRenderTick] = useState(0);
  const [textInput, setTextInput] = useState<{ x: number; y: number; screenX: number; screenY: number; visible: boolean }>({ x: 0, y: 0, screenX: 0, screenY: 0, visible: false });
  const [textValue, setTextValue] = useState("");
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showWidthPicker, setShowWidthPicker] = useState(false);
  const [showEditBar, setShowEditBar] = useState(false);
  const annotationsRef = useRef<Annotation[]>([]);
  annotationsRef.current = annotations;
  const wasRotatedRef = useRef(false);
  const dprRef = useRef(window.devicePixelRatio || 1);
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;
  const canvasSizeRef = useRef(canvasSize);
  canvasSizeRef.current = canvasSize;

  const resizingRef = useRef<{ handle: ResizeHandle; origAnn: Annotation; startPos: Point } | null>(null);
  const editingTextIdRef = useRef<string | null>(null);
  const commitTextRef = useRef<() => void>(() => {});
  const autoSelectedRef = useRef(false);
  const previousToolRef = useRef<Tool | null>(null);

  const rafRef = useRef<number>(0);

  const [theme] = useState<"dark" | "light">("light");
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState<Point>({ x: 0, y: 0 });
  const pinchRef = useRef<{ dist: number; zoom: number; midX: number; midY: number; panX: number; panY: number } | null>(null);
  const textPinchRef = useRef<{ dist: number; angle: number; origAnn: Annotation; origPanX: number; origPanY: number; origZoom: number } | null>(null);
  const isPinchingRef = useRef(false);
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const getPos = useCallback((clientX: number, clientY: number): Point => {
    const canvas = overlayRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * canvasSize.width,
      y: ((clientY - rect.top) / rect.height) * canvasSize.height,
    };
  }, [zoom, panOffset, canvasSize]);

  const loadImage = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        setImage(img);
        setImageName(file.name);
        setAnnotations([]);
        setUndoStack([]);
        setSelectedId(null);
        setShowEditBar(false);
        setZoom(1);
        setPanOffset({ x: 0, y: 0 });
        const pad = 16;
        const maxW = Math.min(window.innerWidth - pad * 2, 1200);
        const maxH = window.innerHeight - 180;
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        if (w > maxW) { h = (maxW / w) * h; w = maxW; }
        if (h > maxH) { w = (maxH / h) * w; h = maxH; }
        setCanvasSize({ width: Math.round(w), height: Math.round(h) });
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  }, []);

  const applyImage = useCallback((img: HTMLImageElement, name: string) => {
    setImage(img);
    setImageName(name);
    setAnnotations([]);
    setUndoStack([]);
    setSelectedId(null);
    setShowEditBar(false);
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
    const maxW = window.innerWidth;
    const maxH = window.innerHeight;
    let w = img.naturalWidth;
    let h = img.naturalHeight;
    if (w > maxW) { h = (maxW / w) * h; w = maxW; }
    if (h > maxH) { w = (maxH / h) * w; h = maxH; }
    setCanvasSize({ width: Math.round(w), height: Math.round(h) });
  }, []);

  const loadFromSrc = useCallback((src: string, name: string) => {
    const img = new Image();
    img.onload = () => applyImage(img, name);
    img.onerror = () => { if (onCancel) onCancel(); };
    img.src = src;
    if (img.complete && img.naturalWidth > 0) {
      applyImage(img, name);
    }
  }, [onCancel, applyImage]);

  const initialLoadDone = useRef(false);
  useEffect(() => {
    if (initialSrc && !initialLoadDone.current) {
      initialLoadDone.current = true;
      loadFromSrc(initialSrc, initialName || "photo");
    }
  }, [initialSrc, initialName, loadFromSrc]);

  function scaleAnnotation(ann: Annotation, sx: number, sy: number): Annotation {
    const scaled = { ...ann };
    if (scaled.x != null) scaled.x = scaled.x * sx;
    if (scaled.y != null) scaled.y = scaled.y * sy;
    if (scaled.width != null) scaled.width = scaled.width * sx;
    if (scaled.height != null) scaled.height = scaled.height * sy;
    if (scaled.startX != null) scaled.startX = scaled.startX * sx;
    if (scaled.startY != null) scaled.startY = scaled.startY * sy;
    if (scaled.endX != null) scaled.endX = scaled.endX * sx;
    if (scaled.endY != null) scaled.endY = scaled.endY * sy;
    if (scaled.strokeWidth != null) scaled.strokeWidth = scaled.strokeWidth * ((sx + sy) / 2);
    if (scaled.points) scaled.points = scaled.points.map(p => ({ x: p.x * sx, y: p.y * sy }));
    
    return scaled;
  }

  const initialAnnotationsLoaded = useRef(false);
  useEffect(() => {
    if (initialAnnotations && initialAnnotations.length > 0 && image && !initialAnnotationsLoaded.current) {
      initialAnnotationsLoaded.current = true;
      const cw = canvasSize.width;
      const ch = canvasSize.height;
      const sx = cw / image.naturalWidth;
      const sy = ch / image.naturalHeight;
      annotationsRef.current = initialAnnotations.map(a => {
        const scaled = scaleAnnotation(a, sx, sy);
        if (scaled.tool === "text" && !scaled.maxWidth && scaled.startX != null && scaled.endX != null && scaled.text) {
          const d = Math.sqrt((scaled.endX - scaled.startX) ** 2 + ((scaled.endY ?? 0) - (scaled.startY ?? 0)) ** 2);
          const fs = fontSizeForWidth(scaled.text, d);
          scaled.maxWidth = d / (fs / 24);
        }
        return scaled;
      });
      setAnnotations([...annotationsRef.current]);
    }
  }, [initialAnnotations, image, canvasSize]);

  const rotatedBlobRef = useRef<Blob | null>(null);

  const rotateImage90 = useCallback(() => {
    if (!image) return;
    const cw = canvasSize.width, ch = canvasSize.height;

    const natW = image.naturalWidth, natH = image.naturalHeight;
    const offscreen = document.createElement("canvas");
    offscreen.width = natH;
    offscreen.height = natW;
    const offCtx = offscreen.getContext("2d")!;
    offCtx.translate(natH, 0);
    offCtx.rotate(Math.PI / 2);
    offCtx.drawImage(image, 0, 0, natW, natH);

    const rotated = annotationsRef.current.map((ann) => {
      const r = { ...ann } as Annotation;
      if (r.x != null && r.y != null && r.width != null && r.height != null) {
        const nx = ch - r.y - r.height;
        const ny = r.x;
        r.x = nx; r.y = ny;
        const tmp = r.width; r.width = r.height; r.height = tmp;
      }
      if (r.startX != null && r.startY != null) {
        const ns = ch - r.startY;
        r.startY = r.startX;
        r.startX = ns;
      }
      if (r.endX != null && r.endY != null) {
        const ne = ch - r.endY;
        r.endY = r.endX;
        r.endX = ne;
      }
      if (r.points) {
        r.points = r.points.map(p => ({ x: ch - p.y, y: p.x }));
      }
      return r;
    });

    offscreen.toBlob((blob) => {
      if (!blob) return;
      rotatedBlobRef.current = blob;
      const blobUrl = URL.createObjectURL(blob);
      const newImg = new Image();
      newImg.onload = () => {
        URL.revokeObjectURL(blobUrl);
        setImage(newImg);
        const pad = 16;
        const maxW = Math.min(window.innerWidth - pad * 2, 1200);
        const maxH = window.innerHeight - 180;
        let w = newImg.naturalWidth, h = newImg.naturalHeight;
        if (w > maxW) { h = (maxW / w) * h; w = maxW; }
        if (h > maxH) { w = (maxH / h) * w; h = maxH; }
        const newCW = Math.round(w), newCH = Math.round(h);
        setCanvasSize({ width: newCW, height: newCH });

        const sx = newCW / ch;
        const sy = newCH / cw;
        const scaled = rotated.map(a => scaleAnnotation(a, sx, sy));
        annotationsRef.current = scaled;
        setAnnotations([...scaled]);
        setSelectedId(null);
        setZoom(1);
        setPanOffset({ x: 0, y: 0 });
      };
      newImg.src = blobUrl;
      wasRotatedRef.current = true;
    }, "image/jpeg", 0.92);
  }, [image, canvasSize]);

  const saveAnnotated = useCallback(async () => {
    if (!image || isSaving) return;
    setIsSaving(true);
    setSelectedId(null);
    setShowEditBar(false);
    setTool("select");
    try {
      const sx = image.naturalWidth / canvasSize.width;
      const sy = image.naturalHeight / canvasSize.height;
      const normalized = annotationsRef.current.map(a => scaleAnnotation(a, sx, sy));
      if (onSave) {
        if (wasRotatedRef.current && rotatedBlobRef.current) {
          const blobUrl = URL.createObjectURL(rotatedBlobRef.current);
          onSave(normalized, blobUrl);
        } else {
          onSave(normalized);
        }
      }
    } finally {
      setIsSaving(false);
    }
  }, [image, onSave, canvasSize, isSaving]);

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = dprRef.current;
    const w = canvasSize.width;
    const h = canvasSize.height;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (image) {
      ctx.drawImage(image, 0, 0, w, h);
    } else {
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "#475569";
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 4]);
      const inset = Math.min(40, w * 0.1);
      ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
      ctx.setLineDash([]);
      ctx.fillStyle = "#94a3b8";
      ctx.textAlign = "center";
      const fs = Math.min(18, w * 0.04);
      ctx.font = `${fs}px system-ui, sans-serif`;
      ctx.fillText("Tap 'Upload' to load a photo", w / 2, h / 2 - 10);
      ctx.font = `${fs * 0.75}px system-ui, sans-serif`;
      ctx.fillText("JPG, PNG, WebP", w / 2, h / 2 + 16);
    }
    const allAnns = [...annotationsRef.current];
    if (currentAnnotationRef.current) allAnns.push(currentAnnotationRef.current);
    allAnns.forEach((ann) => {
      drawAnnotation(ctx, ann, ann.id === selectedId);
    });

    const selAnn = selectedId ? annotationsRef.current.find((a) => a.id === selectedId) : null;
    if (selAnn && !drawingRef.current) {
      drawSelectionHandles(ctx, selAnn);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }, [image, annotations, selectedId, renderTick, canvasSize]);

  useEffect(() => { drawFrame(); }, [drawFrame]);

  function drawAnnotation(ctx: CanvasRenderingContext2D, ann: Annotation, selected: boolean) {
    ctx.save();
    ctx.strokeStyle = ann.color;
    ctx.lineWidth = ann.strokeWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    switch (ann.tool) {
      case "rectangle":
        if (ann.x != null && ann.y != null && ann.width != null && ann.height != null) {
          ctx.strokeRect(ann.x, ann.y, ann.width, ann.height);
        }
        break;
      case "circle":
        if (ann.x != null && ann.y != null && ann.width != null && ann.height != null) {
          const cx = ann.x + ann.width / 2, cy = ann.y + ann.height / 2;
          ctx.beginPath();
          ctx.ellipse(cx, cy, Math.abs(ann.width / 2), Math.abs(ann.height / 2), 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        break;
      case "arrow":
        if (ann.startX != null && ann.startY != null && ann.endX != null && ann.endY != null) {
          const dx = ann.endX - ann.startX, dy = ann.endY - ann.startY;
          const angle = Math.atan2(dy, dx);
          const headLen = Math.max(18, ann.strokeWidth * 5);
          ctx.beginPath();
          ctx.moveTo(ann.startX, ann.startY);
          ctx.lineTo(ann.endX, ann.endY);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(ann.endX, ann.endY);
          ctx.lineTo(ann.endX - headLen * Math.cos(angle - Math.PI / 6), ann.endY - headLen * Math.sin(angle - Math.PI / 6));
          ctx.moveTo(ann.endX, ann.endY);
          ctx.lineTo(ann.endX - headLen * Math.cos(angle + Math.PI / 6), ann.endY - headLen * Math.sin(angle + Math.PI / 6));
          ctx.stroke();
        }
        break;
      case "freehand":
        if (ann.points && ann.points.length > 1) {
          ctx.beginPath();
          ctx.moveTo(ann.points[0].x, ann.points[0].y);
          for (let i = 1; i < ann.points.length; i++) ctx.lineTo(ann.points[i].x, ann.points[i].y);
          ctx.stroke();
        }
        break;
      case "text":
        if (ann.text && ann.startX != null && ann.startY != null && ann.endX != null && ann.endY != null) {
          const { rotation: rot, fontSize: fs } = textPropsFromEndpoints(ann.startX, ann.startY, ann.endX, ann.endY, ann.text);
          ctx.translate(ann.startX, ann.startY);
          ctx.rotate(rot);
          ctx.font = `bold ${fs}px system-ui, sans-serif`;
          ctx.fillStyle = ann.color;
          const dist = Math.sqrt((ann.endX - ann.startX) ** 2 + (ann.endY - ann.startY) ** 2);
          const wrapWidth = ann.maxWidth ? ann.maxWidth * (fs / 24) : dist;
          const lines = wrapWidth > 0 ? wrapText(ctx, ann.text, wrapWidth) : ann.text.split("\n");
          const lineHeight = fs * 1.2;
          ctx.shadowColor = "rgba(0,0,0,0.9)";
          ctx.shadowBlur = fs * 0.3;
          ctx.shadowOffsetX = 2;
          ctx.shadowOffsetY = 2;
          for (let li = 0; li < lines.length; li++) {
            ctx.fillText(lines[li], 0, li * lineHeight);
          }
          ctx.shadowColor = "rgba(0,0,0,0.5)";
          ctx.shadowBlur = fs * 0.15;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
          for (let li = 0; li < lines.length; li++) {
            ctx.fillText(lines[li], 0, li * lineHeight);
          }
        }
        break;
    }
    ctx.restore();
  }

  function drawSelectionHandles(ctx: CanvasRenderingContext2D, ann: Annotation) {
    const bounds = getBounds(ann);
    if (!bounds) return;
    const { x, y, w, h } = bounds;
    const rot = ann.rotation || 0;
    const cx = x + w / 2, cy = y + h / 2;

    ctx.save();

    const hs = HANDLE_SIZE;

    const btnR = hs + 4;

    function drawDeleteBtn(bx: number, by: number) {
      ctx.fillStyle = "#ef4444";
      ctx.strokeStyle = "white";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(bx, by, btnR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      const s = btnR * 0.45;
      ctx.strokeStyle = "white";
      ctx.lineWidth = Math.max(2.5, s * 0.3);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(bx - s, by - s); ctx.lineTo(bx + s, by + s);
      ctx.moveTo(bx + s, by - s); ctx.lineTo(bx - s, by + s);
      ctx.stroke();
    }

    function drawEditBtn(bx: number, by: number) {
      ctx.fillStyle = "#3b82f6";
      ctx.strokeStyle = "white";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(bx, by, btnR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      const s = btnR * 0.45;
      ctx.strokeStyle = "white";
      ctx.lineWidth = Math.max(2, s * 0.25);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(bx - s * 0.7, by + s); ctx.lineTo(bx + s * 0.5, by - s * 0.2);
      ctx.lineTo(bx + s, by - s * 0.7); ctx.lineTo(bx - s * 0.2, by + s * 0.5);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(bx - s * 0.85, by + s * 1.05); ctx.lineTo(bx - s * 0.5, by + s * 0.7);
      ctx.stroke();
    }

    if (ann.tool === "arrow" && ann.startX != null && ann.startY != null && ann.endX != null && ann.endY != null) {
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 3]);
      ctx.beginPath();
      ctx.moveTo(ann.startX, ann.startY);
      ctx.lineTo(ann.endX, ann.endY);
      ctx.stroke();
      ctx.setLineDash([]);

      for (const ep of [{ px: ann.startX, py: ann.startY }, { px: ann.endX, py: ann.endY }]) {
        ctx.fillStyle = "white";
        ctx.strokeStyle = "#3b82f6";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ep.px, ep.py, hs / 2 + 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      const midX = (ann.startX + ann.endX) / 2, midY = (ann.startY + ann.endY) / 2;
      const adx = ann.endX - ann.startX, ady = ann.endY - ann.startY;
      const alen = Math.sqrt(adx * adx + ady * ady) || 1;
      const apx = -ady / alen, apy = adx / alen;
      drawDeleteBtn(midX + apx * (btnR + hs), midY + apy * (btnR + hs));

      ctx.restore();
      return;
    }

    if (ann.tool === "text" && ann.startX != null && ann.startY != null && ann.endX != null && ann.endY != null) {
      const { vx: visEndX, vy: visEndY } = getTextVisualEnd(ann);

      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 3]);
      ctx.beginPath();
      ctx.moveTo(ann.startX, ann.startY);
      ctx.lineTo(visEndX, visEndY);
      ctx.stroke();
      ctx.setLineDash([]);

      for (const ep of [{ px: ann.startX, py: ann.startY }, { px: visEndX, py: visEndY }]) {
        ctx.fillStyle = "white";
        ctx.strokeStyle = "#3b82f6";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ep.px, ep.py, hs / 2 + 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      const midX = (ann.startX + visEndX) / 2, midY = (ann.startY + visEndY) / 2;
      const tdx = visEndX - ann.startX, tdy = visEndY - ann.startY;
      const tlen = Math.sqrt(tdx * tdx + tdy * tdy) || 1;
      const tpx = tdy / tlen, tpy = -tdx / tlen;
      const offset = btnR + hs + 8;
      const gap = btnR + 4;
      drawDeleteBtn(midX + tpx * offset - tpy * gap, midY + tpy * offset + tpx * gap);
      drawEditBtn(midX + tpx * offset + tpy * gap, midY + tpy * offset - tpx * gap);

      ctx.restore();
      return;
    }

    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 3]);
    ctx.strokeRect(x - 4, y - 4, w + 8, h + 8);
    ctx.setLineDash([]);

    const corners = [
      { cx: x - 4, cy: y - 4 },
      { cx: x + w + 4, cy: y - 4 },
      { cx: x - 4, cy: y + h + 4 },
      { cx: x + w + 4, cy: y + h + 4 },
    ];
    for (const c of corners) {
      ctx.fillStyle = "white";
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(c.cx, c.cy, hs / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    drawDeleteBtn(x + w / 2, y - 4 - btnR - 6);

    ctx.restore();
  }

  function unrotatePoint(pos: Point, ann: Annotation): Point {
    const rot = ann.rotation || 0;
    if (rot === 0 || ann.tool !== "text" || ann.x == null || ann.y == null) return pos;
    const cos = Math.cos(-rot), sin = Math.sin(-rot);
    const dx = pos.x - ann.x, dy = pos.y - ann.y;
    return { x: ann.x + dx * cos - dy * sin, y: ann.y + dx * sin + dy * cos };
  }

  function hitTestHandle(ann: Annotation, pos: Point): ResizeHandle {
    const bounds = getBounds(ann);
    if (!bounds) return null;
    const { x, y, w, h } = bounds;
    const r = HANDLE_SIZE + 8;

    const btnR = HANDLE_SIZE + 4;
    const btnHit = HANDLE_SIZE + 8;

    if (ann.tool === "arrow" && ann.startX != null && ann.startY != null && ann.endX != null && ann.endY != null) {
      const midX = (ann.startX + ann.endX) / 2, midY = (ann.startY + ann.endY) / 2;
      const adx = ann.endX - ann.startX, ady = ann.endY - ann.startY;
      const alen = Math.sqrt(adx * adx + ady * ady) || 1;
      const apx = -ady / alen, apy = adx / alen;
      const delX = midX + apx * (btnR + HANDLE_SIZE), delY = midY + apy * (btnR + HANDLE_SIZE);
      if (Math.sqrt((pos.x - delX) ** 2 + (pos.y - delY) ** 2) < btnHit) return "delete";

      if (Math.sqrt((pos.x - ann.startX) ** 2 + (pos.y - ann.startY) ** 2) < r + 4) return "arrow-start";
      if (Math.sqrt((pos.x - ann.endX) ** 2 + (pos.y - ann.endY) ** 2) < r + 4) return "arrow-end";
      const dx = ann.endX - ann.startX, dy = ann.endY - ann.startY;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0) {
        const t = Math.max(0, Math.min(1, ((pos.x - ann.startX) * dx + (pos.y - ann.startY) * dy) / (len * len)));
        if (Math.sqrt((pos.x - (ann.startX + t * dx)) ** 2 + (pos.y - (ann.startY + t * dy)) ** 2) < 30) return "move";
      }
      return null;
    }

    if (ann.tool === "text" && ann.startX != null && ann.startY != null && ann.endX != null && ann.endY != null) {
      const { vx: visEndX, vy: visEndY } = getTextVisualEnd(ann);
      const midX = (ann.startX + visEndX) / 2, midY = (ann.startY + visEndY) / 2;
      const tdx = visEndX - ann.startX, tdy = visEndY - ann.startY;
      const tlen = Math.sqrt(tdx * tdx + tdy * tdy) || 1;
      const tpx = tdy / tlen, tpy = -tdx / tlen;
      const offset = btnR + HANDLE_SIZE + 8;
      const gap = btnR + 4;
      const delBX = midX + tpx * offset - tpy * gap, delBY = midY + tpy * offset + tpx * gap;
      const edBX = midX + tpx * offset + tpy * gap, edBY = midY + tpy * offset - tpx * gap;
      if (Math.sqrt((pos.x - delBX) ** 2 + (pos.y - delBY) ** 2) < btnHit) return "delete";
      if (Math.sqrt((pos.x - edBX) ** 2 + (pos.y - edBY) ** 2) < btnHit) return "text-edit";

      if (Math.sqrt((pos.x - ann.startX) ** 2 + (pos.y - ann.startY) ** 2) < r + 4) return "text-left";
      if (Math.sqrt((pos.x - visEndX) ** 2 + (pos.y - visEndY) ** 2) < r + 4) return "text-right";
      const dx2 = visEndX - ann.startX, dy2 = visEndY - ann.startY;
      const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
      if (len2 > 0) {
        const t = Math.max(0, Math.min(1, ((pos.x - ann.startX) * dx2 + (pos.y - ann.startY) * dy2) / (len2 * len2)));
        if (Math.sqrt((pos.x - (ann.startX + t * dx2)) ** 2 + (pos.y - (ann.startY + t * dy2)) ** 2) < 30) return "move";
      }
      if (pos.x >= x - 8 && pos.x <= x + w + 8 && pos.y >= y - 8 && pos.y <= y + h + 8) return "move";
      return null;
    }

    const delCX = x + w / 2, delCY = y - 4 - btnR - 6;
    if (Math.sqrt((pos.x - delCX) ** 2 + (pos.y - delCY) ** 2) < btnHit) return "delete";

    const testPos = pos;

    const corners: [number, number, ResizeHandle][] = [
      [x - 4, y - 4, "tl"],
      [x + w + 4, y - 4, "tr"],
      [x - 4, y + h + 4, "bl"],
      [x + w + 4, y + h + 4, "br"],
    ];
    for (const [cx, cy, handle] of corners) {
      if (Math.sqrt((testPos.x - cx) ** 2 + (testPos.y - cy) ** 2) < r) return handle;
    }
    if (testPos.x >= x - 8 && testPos.x <= x + w + 8 && testPos.y >= y - 8 && testPos.y <= y + h + 8) return "move";
    return null;
  }

  function hitTest(ann: Annotation, pos: Point): boolean {
    const m = 24;
    if ((ann.tool === "rectangle" || ann.tool === "circle") && ann.x != null && ann.y != null && ann.width != null && ann.height != null) {
      return pos.x >= ann.x - m && pos.x <= ann.x + ann.width + m && pos.y >= ann.y - m && pos.y <= ann.y + ann.height + m;
    }
    if (ann.tool === "arrow" && ann.startX != null && ann.startY != null && ann.endX != null && ann.endY != null) {
      const dx = ann.endX - ann.startX, dy = ann.endY - ann.startY;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len === 0) return false;
      const t = Math.max(0, Math.min(1, ((pos.x - ann.startX) * dx + (pos.y - ann.startY) * dy) / (len * len)));
      return Math.sqrt((pos.x - (ann.startX + t * dx)) ** 2 + (pos.y - (ann.startY + t * dy)) ** 2) < m * 2;
    }
    if (ann.tool === "freehand" && ann.points) {
      return ann.points.some((p) => Math.sqrt((pos.x - p.x) ** 2 + (pos.y - p.y) ** 2) < m * 2);
    }
    if (ann.tool === "text" && ann.startX != null && ann.startY != null && ann.endX != null && ann.endY != null) {
      const dx = ann.endX - ann.startX, dy = ann.endY - ann.startY;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len === 0) return false;
      const t = Math.max(0, Math.min(1, ((pos.x - ann.startX) * dx + (pos.y - ann.startY) * dy) / (len * len)));
      return Math.sqrt((pos.x - (ann.startX + t * dx)) ** 2 + (pos.y - (ann.startY + t * dy)) ** 2) < m * 2;
    }
    return false;
  }

  function applyResize(orig: Annotation, handle: ResizeHandle, dx: number, dy: number): Annotation {
    const updated = { ...orig };
    if ((orig.tool === "rectangle" || orig.tool === "circle") && orig.x != null && orig.y != null && orig.width != null && orig.height != null) {
      let nx = orig.x, ny = orig.y, nw = orig.width, nh = orig.height;
      if (handle === "move") { nx += dx; ny += dy; }
      else if (handle === "tl") { nx += dx; ny += dy; nw -= dx; nh -= dy; }
      else if (handle === "tr") { ny += dy; nw += dx; nh -= dy; }
      else if (handle === "bl") { nx += dx; nw -= dx; nh += dy; }
      else if (handle === "br") { nw += dx; nh += dy; }
      if (nw < 10) nw = 10;
      if (nh < 10) nh = 10;
      updated.x = nx; updated.y = ny; updated.width = nw; updated.height = nh;
    } else if (orig.tool === "arrow" && orig.startX != null && orig.startY != null && orig.endX != null && orig.endY != null) {
      if (handle === "move") {
        updated.startX = orig.startX + dx; updated.startY = orig.startY + dy;
        updated.endX = orig.endX + dx; updated.endY = orig.endY + dy;
      } else if (handle === "arrow-start") {
        updated.startX = orig.startX + dx; updated.startY = orig.startY + dy;
      } else if (handle === "arrow-end") {
        updated.endX = orig.endX + dx; updated.endY = orig.endY + dy;
      }
    } else if (orig.tool === "freehand" && orig.points) {
      if (handle === "move") {
        updated.points = orig.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
      } else {
        const bounds = getBounds(orig);
        if (bounds && bounds.w > 0 && bounds.h > 0) {
          let newW = bounds.w, newH = bounds.h, offX = 0, offY = 0;
          if (handle === "br") { newW += dx; newH += dy; }
          else if (handle === "tl") { offX = dx; offY = dy; newW -= dx; newH -= dy; }
          else if (handle === "tr") { offY = dy; newW += dx; newH -= dy; }
          else if (handle === "bl") { offX = dx; newW -= dx; newH += dy; }
          if (newW < 10) newW = 10;
          if (newH < 10) newH = 10;
          const sx = newW / bounds.w, sy = newH / bounds.h;
          updated.points = orig.points.map((p) => ({
            x: bounds.x + offX + (p.x - bounds.x) * sx,
            y: bounds.y + offY + (p.y - bounds.y) * sy,
          }));
        }
      }
    } else if (orig.tool === "text" && orig.startX != null && orig.startY != null && orig.endX != null && orig.endY != null) {
      if (handle === "move") {
        updated.startX = orig.startX + dx; updated.startY = orig.startY + dy;
        updated.endX = orig.endX + dx; updated.endY = orig.endY + dy;
      } else if (handle === "text-left") {
        let newSX = orig.startX + dx, newSY = orig.startY + dy;
        const distSq = (orig.endX - newSX) ** 2 + (orig.endY - newSY) ** 2;
        const minD = minDistForText(orig.text || "");
        if (distSq < minD * minD) {
          const dirX = newSX - orig.endX, dirY = newSY - orig.endY;
          const len = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
          newSX = orig.endX + (dirX / len) * minD;
          newSY = orig.endY + (dirY / len) * minD;
        }
        updated.startX = newSX; updated.startY = newSY;
      } else if (handle === "text-right") {
        let newEX = orig.endX + dx, newEY = orig.endY + dy;
        const distSq = (newEX - orig.startX) ** 2 + (newEY - orig.startY) ** 2;
        const minD = minDistForText(orig.text || "");
        if (distSq < minD * minD) {
          const dirX = newEX - orig.startX, dirY = newEY - orig.startY;
          const len = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
          newEX = orig.startX + (dirX / len) * minD;
          newEY = orig.startY + (dirY / len) * minD;
        }
        updated.endX = newEX; updated.endY = newEY;
      }
    }
    return updated;
  }

  const scheduleRedraw = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      setRenderTick((n) => n + 1);
    });
  }, []);

  const handleStart = useCallback((clientX: number, clientY: number) => {
    if (!image) return;
    const pos = getPos(clientX, clientY);

    if (textInput.visible) {
      if (textValue.trim()) {
        commitTextRef.current();
      } else {
        setTextInput((p) => ({ ...p, visible: false }));
        setTextValue("");
        editingTextIdRef.current = null;
      }
      return;
    }

    if (tool === "select") {
      if (selectedId) {
        const selAnn = annotationsRef.current.find((a) => a.id === selectedId);
        if (selAnn) {
          const handle = hitTestHandle(selAnn, pos);
          if (handle === "delete") {
            deleteSelected();
            return;
          }
          if (handle === "text-edit" && selAnn.tool === "text" && selAnn.text) {
            editingTextIdRef.current = selAnn.id;
            setTextValue(selAnn.text);
            setTextInput({ x: selAnn.startX ?? pos.x, y: selAnn.startY ?? pos.y, screenX: 0, screenY: 0, visible: true });
            setTimeout(() => textInputRef.current?.focus(), 100);
            return;
          }
          if (handle) {
            resizingRef.current = { handle, origAnn: { ...selAnn }, startPos: pos };
            drawingRef.current = true;
            return;
          }
        }
      }
      let found: Annotation | null = null;
      for (let i = annotationsRef.current.length - 1; i >= 0; i--) {
        if (hitTest(annotationsRef.current[i], pos)) { found = annotationsRef.current[i]; break; }
      }
      setSelectedId(found?.id || null);
      setShowEditBar(!!found);
      if (found) {
        resizingRef.current = { handle: "move", origAnn: { ...found }, startPos: pos };
        drawingRef.current = true;
      } else {
        if (autoSelectedRef.current && previousToolRef.current) {
          setTool(previousToolRef.current);
          autoSelectedRef.current = false;
          previousToolRef.current = null;
        }
        panStartRef.current = { x: clientX, y: clientY, panX: panOffset.x, panY: panOffset.y };
        drawingRef.current = true;
      }
      return;
    }

    if (tool !== "select") {
      let found: Annotation | null = null;
      for (let i = annotationsRef.current.length - 1; i >= 0; i--) {
        if (hitTest(annotationsRef.current[i], pos)) { found = annotationsRef.current[i]; break; }
      }
      if (found) {
        previousToolRef.current = tool;
        autoSelectedRef.current = true;
        setTool("select");
        setSelectedId(found.id);
        setShowEditBar(true);
        resizingRef.current = { handle: "move", origAnn: { ...found }, startPos: pos };
        drawingRef.current = true;
        return;
      }
    }

    if (tool === "text") {
      const canvas = overlayRef.current!;
      const rect = canvas.getBoundingClientRect();
      const centerScreenX = rect.width / 2;
      const centerScreenY = rect.height / 2;
      const centerPos = getPos(rect.left + centerScreenX, rect.top + centerScreenY);
      setTextInput({ x: centerPos.x, y: centerPos.y, screenX: centerScreenX, screenY: centerScreenY, visible: true });
      setTextValue("");
      setTimeout(() => textInputRef.current?.focus(), 100);
      return;
    }

    drawingRef.current = true;
    startPointRef.current = pos;

    if (tool === "freehand") {
      currentAnnotationRef.current = { id: uid(), tool, color, strokeWidth, points: [pos] };
    } else if (tool === "arrow") {
      currentAnnotationRef.current = { id: uid(), tool, color, strokeWidth, startX: pos.x, startY: pos.y, endX: pos.x, endY: pos.y };
    } else {
      currentAnnotationRef.current = { id: uid(), tool, color, strokeWidth, x: pos.x, y: pos.y, width: 0, height: 0 };
    }
    scheduleRedraw();
  }, [image, tool, color, strokeWidth, getPos, selectedId, scheduleRedraw, textInput.visible, textValue]);

  const handleMove = useCallback((clientX: number, clientY: number) => {
    if (!drawingRef.current) return;

    if (panStartRef.current) {
      const dx = clientX - panStartRef.current.x;
      const dy = clientY - panStartRef.current.y;
      const newX = panStartRef.current.panX + dx;
      const newY = panStartRef.current.panY + dy;
      const scaledW = canvasSize.width * zoom;
      const scaledH = canvasSize.height * zoom;
      const screenW = window.innerWidth;
      const screenH = window.innerHeight;
      const maxX = Math.max(0, (scaledW - screenW) / 2);
      const maxY = Math.max(0, (scaledH - screenH) / 2);
      setPanOffset({
        x: Math.max(-maxX, Math.min(maxX, newX)),
        y: Math.max(-maxY, Math.min(maxY, newY)),
      });
      return;
    }

    const pos = getPos(clientX, clientY);

    if (resizingRef.current) {
      const { handle, origAnn, startPos } = resizingRef.current;
      const dx = pos.x - startPos.x, dy = pos.y - startPos.y;
      const updated = applyResize(origAnn, handle, dx, dy);
      setAnnotations((prev) => prev.map((a) => a.id === origAnn.id ? updated : a));
      scheduleRedraw();
      return;
    }

    if (!currentAnnotationRef.current || !startPointRef.current) return;
    const cur = currentAnnotationRef.current;

    if (cur.tool === "freehand") {
      currentAnnotationRef.current = { ...cur, points: [...(cur.points || []), pos] };
    } else if (cur.tool === "arrow") {
      currentAnnotationRef.current = { ...cur, endX: pos.x, endY: pos.y };
    } else {
      const sp = startPointRef.current;
      const w = pos.x - sp.x, h = pos.y - sp.y;
      currentAnnotationRef.current = {
        ...cur,
        x: w < 0 ? sp.x + w : sp.x,
        y: h < 0 ? sp.y + h : sp.y,
        width: Math.abs(w),
        height: Math.abs(h),
      };
    }
    scheduleRedraw();
  }, [getPos, scheduleRedraw]);

  const handleEnd = useCallback(() => {
    if (!drawingRef.current) return;
    drawingRef.current = false;

    if (panStartRef.current) {
      panStartRef.current = null;
      return;
    }

    if (resizingRef.current) {
      const { origAnn } = resizingRef.current;
      setUndoStack((prev) => [...prev, annotationsRef.current.map((a) => a.id === origAnn.id ? origAnn : a)]);
      resizingRef.current = null;
      scheduleRedraw();
      return;
    }

    if (!currentAnnotationRef.current) return;
    const cur = currentAnnotationRef.current;

    const isValid = (() => {
      if (cur.tool === "freehand") return (cur.points?.length || 0) > 2;
      if (cur.tool === "arrow") {
        const dx = (cur.endX || 0) - (cur.startX || 0), dy = (cur.endY || 0) - (cur.startY || 0);
        return Math.sqrt(dx * dx + dy * dy) > 5;
      }
      return (cur.width || 0) > 3 || (cur.height || 0) > 3;
    })();

    if (isValid) {
      setUndoStack((prev) => [...prev, annotationsRef.current]);
      setAnnotations((prev) => [...prev, cur]);
    }
    currentAnnotationRef.current = null;
    startPointRef.current = null;
    scheduleRedraw();
  }, [scheduleRedraw]);

  const commitText = useCallback(() => {
    if (!textValue.trim()) {
      setTextInput((p) => ({ ...p, visible: false }));
      editingTextIdRef.current = null;
      return;
    }
    setUndoStack((prev) => [...prev, annotationsRef.current]);
    if (editingTextIdRef.current) {
      const editId = editingTextIdRef.current;
      setAnnotations((prev) => prev.map((a) => {
        if (a.id !== editId) return a;
        const newW = measureTextWidth(textValue, 24);
        const oldW = measureTextWidth(a.text || "", 24);
        const scale = oldW > 0 ? newW / oldW : 1;
        const dx = (a.endX ?? 0) - (a.startX ?? 0);
        const dy = (a.endY ?? 0) - (a.startY ?? 0);
        const dist = Math.sqrt(dx * dx + dy * dy);
        const newDist = dist > 0 ? dist * scale : newW;
        const dirX = dist > 0 ? dx / dist : 1;
        const dirY = dist > 0 ? dy / dist : 0;
        return { ...a, text: textValue, endX: (a.startX ?? 0) + dirX * newDist, endY: (a.startY ?? 0) + dirY * newDist };
      }));
      editingTextIdRef.current = null;
    } else {
      const defaultFs = 24;
      const wrapPx = canvasSize.width * 0.8;
      const textW = measureTextWidth(textValue, defaultFs);
      const endDist = Math.min(textW, wrapPx);
      const fs = fontSizeForWidth(textValue, endDist);
      const normalizedMaxW = wrapPx / (fs / 24);
      const ann: Annotation = {
        id: uid(), tool: "text", color, strokeWidth, text: textValue,
        startX: textInput.x, startY: textInput.y,
        endX: textInput.x + endDist, endY: textInput.y,
        maxWidth: normalizedMaxW,
      };
      setAnnotations((prev) => [...prev, ann]);
    }
    setTextInput((p) => ({ ...p, visible: false }));
    setTextValue("");
  }, [textValue, textInput, color, strokeWidth]);
  commitTextRef.current = commitText;

  const undo = useCallback(() => {
    if (undoStack.length === 0) return;
    setAnnotations(undoStack[undoStack.length - 1]);
    setUndoStack((s) => s.slice(0, -1));
    setSelectedId(null);
    setShowEditBar(false);
  }, [undoStack]);

  const clearAll = useCallback(() => {
    if (annotations.length === 0) return;
    setUndoStack((prev) => [...prev, annotations]);
    setAnnotations([]);
    setSelectedId(null);
    setShowEditBar(false);
  }, [annotations]);

  const restorePreviousTool = useCallback(() => {
    if (autoSelectedRef.current && previousToolRef.current) {
      setTool(previousToolRef.current);
      autoSelectedRef.current = false;
      previousToolRef.current = null;
    }
  }, []);

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    setUndoStack((prev) => [...prev, annotations]);
    setAnnotations((prev) => prev.filter((a) => a.id !== selectedId));
    setSelectedId(null);
    setShowEditBar(false);
    restorePreviousTool();
  }, [selectedId, annotations, restorePreviousTool]);

  const changeSelectedColor = useCallback((newColor: string) => {
    if (!selectedId) return;
    setUndoStack((prev) => [...prev, annotations]);
    setAnnotations((prev) => prev.map((a) => a.id === selectedId ? { ...a, color: newColor } : a));
  }, [selectedId, annotations]);

  const changeSelectedWidth = useCallback((newWidth: number) => {
    if (!selectedId) return;
    setUndoStack((prev) => [...prev, annotations]);
    setAnnotations((prev) => prev.map((a) => a.id === selectedId ? { ...a, strokeWidth: newWidth } : a));
  }, [selectedId, annotations]);

  const exportImage = useCallback(() => {
    if (!image) return;
    const prevSel = selectedId;
    setSelectedId(null);
    setTimeout(() => {
      const dlCanvas = document.createElement("canvas");
      dlCanvas.width = canvasSize.width;
      dlCanvas.height = canvasSize.height;
      const ctx = dlCanvas.getContext("2d")!;
      ctx.drawImage(image, 0, 0, canvasSize.width, canvasSize.height);
      annotationsRef.current.forEach((ann) => drawAnnotation(ctx, ann, false));
      const link = document.createElement("a");
      link.download = imageName ? `annotated_${imageName}` : "annotated_image.png";
      try {
        link.href = dlCanvas.toDataURL("image/png");
        link.click();
      } catch (_e) {
        return;
      }
      setSelectedId(prevSel);
    }, 50);
  }, [image, imageName, selectedId]);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    function pinchDist(e: TouchEvent) {
      const [a, b] = [e.touches[0], e.touches[1]];
      return Math.sqrt((a.clientX - b.clientX) ** 2 + (a.clientY - b.clientY) ** 2);
    }
    function pinchAngle(e: TouchEvent) {
      const [a, b] = [e.touches[0], e.touches[1]];
      return Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX);
    }
    function pinchMid(e: TouchEvent): Point {
      const [a, b] = [e.touches[0], e.touches[1]];
      return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
    }

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 2) {
        isPinchingRef.current = true;
        if (drawingRef.current) { handleEnd(); }

        const selAnn = selectedIdRef.current
          ? annotationsRef.current.find((a) => a.id === selectedIdRef.current)
          : null;
        if (selAnn && selAnn.tool === "text" && selAnn.startX != null && selAnn.endX != null) {
          const bounds = getBounds(selAnn);
          if (bounds) {
            const mid = pinchMid(e);
            const rect = overlay.getBoundingClientRect();
            const midPos = {
              x: ((mid.x - rect.left) / rect.width) * canvasSizeRef.current.width,
              y: ((mid.y - rect.top) / rect.height) * canvasSizeRef.current.height,
            };
            const pad = 60;
            const nearText = midPos.x >= bounds.x - pad && midPos.x <= bounds.x + bounds.w + pad &&
                             midPos.y >= bounds.y - pad && midPos.y <= bounds.y + bounds.h + pad;
            if (nearText) {
              const origCopy = { ...selAnn };
              if (!origCopy.maxWidth) {
                const d = Math.sqrt((origCopy.endX! - origCopy.startX!) ** 2 + (origCopy.endY! - origCopy.startY!) ** 2);
                const fs = textPropsFromEndpoints(origCopy.startX!, origCopy.startY!, origCopy.endX!, origCopy.endY!, origCopy.text || "").fontSize;
                origCopy.maxWidth = d / (fs / 24);
              }
              textPinchRef.current = {
                dist: pinchDist(e),
                angle: pinchAngle(e),
                origAnn: origCopy,
                origPanX: panOffset.x,
                origPanY: panOffset.y,
                origZoom: zoom,
              };
              pinchRef.current = null;
              return;
            }
          }
        }

        textPinchRef.current = null;
        pinchRef.current = {
          dist: pinchDist(e),
          zoom,
          midX: pinchMid(e).x,
          midY: pinchMid(e).y,
          panX: panOffset.x,
          panY: panOffset.y,
        };
        return;
      }
      if (e.touches.length !== 1 || isPinchingRef.current) return;
      const t = e.touches[0];
      handleStart(t.clientX, t.clientY);
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();

      if (e.touches.length === 2 && textPinchRef.current) {
        const { dist: origDist, angle: origAngle, origAnn, origPanX, origPanY, origZoom } = textPinchRef.current;
        const newDist = pinchDist(e);
        const newAngle = pinchAngle(e);
        const scale = newDist / origDist;
        let deltaAngle = newAngle - origAngle;
        if (deltaAngle > Math.PI) deltaAngle -= 2 * Math.PI;
        if (deltaAngle < -Math.PI) deltaAngle += 2 * Math.PI;

        const sx = origAnn.startX ?? 0, sy = origAnn.startY ?? 0;
        const ex = origAnn.endX ?? 0, ey = origAnn.endY ?? 0;
        const dx = ex - sx, dy = ey - sy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const origAngleAnn = Math.atan2(dy, dx);
        const newAnnAngle = origAngleAnn + deltaAngle;
        const minDist = minDistForText(origAnn.text || "");
        const newAnnDist = Math.max(dist * scale, minDist);

        const updated: Annotation = {
          ...origAnn,
          endX: sx + Math.cos(newAnnAngle) * newAnnDist,
          endY: sy + Math.sin(newAnnAngle) * newAnnDist,
        };

        const cs = canvasSizeRef.current;
        const targetPanX = -(sx - cs.width / 2) * origZoom;
        const targetPanY = -(sy - cs.height / 2) * origZoom;
        const scaledW = cs.width * origZoom;
        const scaledH = cs.height * origZoom;
        const maxPanX = Math.max(0, (scaledW - window.innerWidth) / 2);
        const maxPanY = Math.max(0, (scaledH - window.innerHeight) / 2);
        setPanOffset({
          x: Math.max(-maxPanX, Math.min(maxPanX, targetPanX)),
          y: Math.max(-maxPanY, Math.min(maxPanY, targetPanY)),
        });

        setAnnotations((prev) => prev.map((a) => a.id === origAnn.id ? updated : a));
        scheduleRedraw();
        return;
      }

      if (e.touches.length === 2 && pinchRef.current) {
        const newDist = pinchDist(e);
        const scale = newDist / pinchRef.current.dist;
        const newZoom = Math.max(1, Math.min(8, pinchRef.current.zoom * scale));
        const mid = pinchMid(e);
        const screenCx = window.innerWidth / 2;
        const screenCy = window.innerHeight / 2;
        const anchorX = pinchRef.current.midX;
        const anchorY = pinchRef.current.midY;
        const imgXAtAnchor = (anchorX - screenCx - pinchRef.current.panX) / pinchRef.current.zoom;
        const imgYAtAnchor = (anchorY - screenCy - pinchRef.current.panY) / pinchRef.current.zoom;
        let newPanX = anchorX - screenCx - imgXAtAnchor * newZoom + (mid.x - anchorX);
        let newPanY = anchorY - screenCy - imgYAtAnchor * newZoom + (mid.y - anchorY);
        if (newZoom <= 1) {
          newPanX = 0;
          newPanY = 0;
        } else {
          const scaledW = canvasSize.width * newZoom;
          const scaledH = canvasSize.height * newZoom;
          const maxX = Math.max(0, (scaledW - window.innerWidth) / 2);
          const maxY = Math.max(0, (scaledH - window.innerHeight) / 2);
          newPanX = Math.max(-maxX, Math.min(maxX, newPanX));
          newPanY = Math.max(-maxY, Math.min(maxY, newPanY));
        }
        setZoom(newZoom);
        setPanOffset({ x: newPanX, y: newPanY });
        return;
      }
      if (e.touches.length !== 1 || isPinchingRef.current) return;
      const t = e.touches[0];
      handleMove(t.clientX, t.clientY);
    };
    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 0) {
        if (isPinchingRef.current) {
          isPinchingRef.current = false;
          pinchRef.current = null;
          textPinchRef.current = null;
          return;
        }
        handleEnd();
      } else if (e.touches.length === 1 && isPinchingRef.current) {
        pinchRef.current = null;
        textPinchRef.current = null;
      }
    };

    overlay.addEventListener("touchstart", onTouchStart, { passive: false });
    overlay.addEventListener("touchmove", onTouchMove, { passive: false });
    overlay.addEventListener("touchend", onTouchEnd, { passive: false });
    return () => {
      overlay.removeEventListener("touchstart", onTouchStart);
      overlay.removeEventListener("touchmove", onTouchMove);
      overlay.removeEventListener("touchend", onTouchEnd);
    };
  }, [handleStart, handleMove, handleEnd, zoom, panOffset]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedId && !textInput.visible && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
          e.preventDefault();
          deleteSelected();
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "z") { e.preventDefault(); undo(); }
      if (e.key === "Escape") { setSelectedId(null); setShowEditBar(false); restorePreviousTool(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedId, deleteSelected, undo, textInput.visible]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handler = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.type === "drop" && e.dataTransfer?.files?.[0]) {
        const file = e.dataTransfer.files[0];
        if (file.type.startsWith("image/")) loadImage(file);
      }
    };
    container.addEventListener("dragover", handler);
    container.addEventListener("drop", handler);
    return () => { container.removeEventListener("dragover", handler); container.removeEventListener("drop", handler); };
  }, [loadImage]);

  const selectedAnn = selectedId ? annotations.find((a) => a.id === selectedId) : null;

  const tools_list: { key: Tool; label: string; icon: string }[] = [
    { key: "select", label: "Select", icon: "☝️" },
    { key: "rectangle", label: "Rect", icon: "▭" },
    { key: "circle", label: "Circle", icon: "◯" },
    { key: "arrow", label: "Arrow", icon: "➜" },
    { key: "freehand", label: "Draw", icon: "✏️" },
    { key: "text", label: "Text", icon: "T" },
  ];

  const dk = theme === "dark";
  const btnCls = "bg-black/40 text-white active:bg-black/60 backdrop-blur-sm";

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex flex-col overflow-hidden select-none text-white" style={{ backgroundColor: "black" }} ref={containerRef}>
      {!image && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black" />
      )}
      <div className="relative flex-1 overflow-hidden touch-none" style={{ opacity: image ? 1 : 0 }}>
        <div ref={toolbarRef} className="absolute top-0 left-0 right-0 z-20 flex items-center gap-1 px-2 overflow-x-auto" style={{ WebkitOverflowScrolling: "touch", paddingTop: "max(0.375rem, env(safe-area-inset-top, 0.375rem))", paddingBottom: "0.375rem", background: "linear-gradient(to bottom, rgba(0,0,0,0.5), transparent)" }}>
        <button
          onClick={onCancel}
          className="flex-shrink-0 px-3 py-2 rounded-lg text-xs font-semibold min-w-[44px] bg-black/40 text-white active:bg-black/60 backdrop-blur-sm"
          data-testid="button-cancel"
        >
          Cancel
        </button>
        <button
          onClick={saveAnnotated}
          disabled={!image || isSaving}
          className="flex-shrink-0 px-3 py-2 rounded-lg text-xs font-semibold bg-green-600/90 text-white active:bg-green-500 disabled:opacity-30 min-w-[44px] backdrop-blur-sm"
          data-testid="button-save"
        >
          {isSaving ? "Saving…" : "Save"}
        </button>

        <div className="w-px h-8 flex-shrink-0 mx-0.5 bg-white/20" />

        {tools_list.map((t) => (
          <button
            key={t.key}
            onClick={() => { setTool(t.key); if (t.key !== "select") { setSelectedId(null); setShowEditBar(false); } setShowColorPicker(false); setShowWidthPicker(false); setTimeout(() => toolbarRef.current?.scrollTo({ left: 0, behavior: "smooth" }), 50); }}
            className={`flex-shrink-0 px-2 py-2 rounded-lg text-xs font-medium transition-all flex flex-col items-center gap-0.5 min-w-[44px] ${tool === t.key ? "bg-blue-600/90 text-white backdrop-blur-sm" : btnCls}`}
          >
            <span className="text-base leading-none">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}

        <div className="w-px h-8 flex-shrink-0 mx-0.5 bg-white/20" />

        <button
          onClick={() => { setShowColorPicker(!showColorPicker); setShowWidthPicker(false); }}
          className="flex-shrink-0 w-10 h-10 rounded-lg border-2 border-white/30 active:border-white/60 flex items-center justify-center bg-black/40 backdrop-blur-sm"
        >
          <div className="w-6 h-6 rounded-full border border-white/30" style={{ backgroundColor: selectedAnn ? selectedAnn.color : color }} />
        </button>

        <button
          onClick={() => { setShowWidthPicker(!showWidthPicker); setShowColorPicker(false); }}
          className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${btnCls}`}
        >
          <div className="rounded-full bg-white" style={{ width: (selectedAnn ? selectedAnn.strokeWidth : strokeWidth) + 2, height: (selectedAnn ? selectedAnn.strokeWidth : strokeWidth) + 2 }} />
        </button>

        <div className="w-px h-8 flex-shrink-0 mx-0.5 bg-white/20" />

        <button onClick={undo} disabled={undoStack.length === 0} className="flex-shrink-0 w-10 h-10 rounded-lg text-lg disabled:opacity-25 bg-orange-600/90 text-white active:bg-orange-500 backdrop-blur-sm font-bold">↩</button>

        <div className="w-px h-8 flex-shrink-0 mx-0.5 bg-white/20" />

        <button
          onClick={rotateImage90}
          disabled={!image}
          className={`flex-shrink-0 px-2 py-2 rounded-lg text-xs font-medium flex flex-col items-center gap-0.5 min-w-[44px] disabled:opacity-25 ${btnCls}`}
          data-testid="button-rotate"
        >
          <span className="text-base leading-none">⟳</span>
          <span>Rotate</span>
        </button>
      </div>

      {showColorPicker && (
        <div className="absolute top-14 left-0 right-0 z-20 flex items-center gap-2 px-3 py-2.5 bg-black/60 backdrop-blur-md">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => {
                if (selectedAnn) { changeSelectedColor(c); } else { setColor(c); }
                setShowColorPicker(false);
              }}
              className={`w-9 h-9 rounded-full border-2 ${(selectedAnn ? selectedAnn.color : color) === c ? "border-blue-500 scale-110" : "border-white/30"}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      )}

      {showWidthPicker && (
        <div className="absolute top-14 left-0 right-0 z-20 flex items-center gap-2 px-3 py-2.5 bg-black/60 backdrop-blur-md">
          {STROKE_WIDTHS.map((sw) => (
            <button
              key={sw}
              onClick={() => {
                if (selectedAnn) { changeSelectedWidth(sw); } else { setStrokeWidth(sw); }
                setShowWidthPicker(false);
              }}
              className={`w-12 h-10 rounded flex items-center justify-center ${(selectedAnn ? selectedAnn.strokeWidth : strokeWidth) === sw ? "bg-blue-600/40 ring-1 ring-blue-500" : "bg-white/10"}`}
            >
              <div className="rounded-full bg-white" style={{ width: sw + 4, height: sw + 4 }} />
            </button>
          ))}
        </div>
      )}

      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative" style={{ width: canvasSize.width, height: canvasSize.height, maxWidth: "100vw", maxHeight: "100%", transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`, transformOrigin: "center center", willChange: "transform" }}>
          <canvas
            ref={canvasRef}
            width={Math.round(canvasSize.width * dprRef.current)}
            height={Math.round(canvasSize.height * dprRef.current)}
            className="absolute inset-0 w-full h-full"
            style={{ width: canvasSize.width, height: canvasSize.height }}
          />
          <canvas
            ref={overlayRef}
            width={Math.round(canvasSize.width * dprRef.current)}
            height={Math.round(canvasSize.height * dprRef.current)}
            className="absolute inset-0 w-full h-full"
            style={{ width: canvasSize.width, height: canvasSize.height, touchAction: "none", cursor: tool === "select" ? "default" : tool === "text" ? "text" : "crosshair" }}
            onMouseDown={(e) => handleStart(e.clientX, e.clientY)}
            onMouseMove={(e) => handleMove(e.clientX, e.clientY)}
            onMouseUp={handleEnd}
            onMouseLeave={handleEnd}
          />
        </div>
      </div>

      {textInput.visible && (
        <div
          className="fixed z-50 flex flex-col items-center justify-center"
          style={{
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: 280,
            maxWidth: "90vw",
          }}
        >
          <textarea
            ref={textInputRef}
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") { setTextInput((p) => ({ ...p, visible: false })); setTextValue(""); editingTextIdRef.current = null; } }}
            className="bg-black/80 text-white border-blue-500 outline-none resize-none w-full"
            style={{
              fontSize: 16,
              padding: "6px 8px",
              minHeight: 48,
              borderWidth: 2,
              borderStyle: "solid",
              borderColor: "#3b82f6",
              borderRadius: "6px 6px 0 0",
              lineHeight: 1.4,
              fontWeight: "bold",
              fontFamily: "system-ui, sans-serif",
              wordBreak: "break-word",
              overflowWrap: "break-word",
              whiteSpace: "pre-wrap",
            }}
            placeholder="Type here..."
            autoComplete="off"
            autoCorrect="off"
            rows={3}
          />
          <div className="flex w-full" style={{ gap: 1 }}>
            <button
              onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); commitText(); }}
              className="flex-1 bg-blue-600 text-white font-semibold active:bg-blue-500"
              style={{
                fontSize: 12,
                padding: "3px 0",
                borderRadius: "0 0 0 6px",
                border: "none",
              }}
            >
              Done
            </button>
            <button
              onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); setTextInput((p) => ({ ...p, visible: false })); setTextValue(""); editingTextIdRef.current = null; }}
              className="bg-gray-700 text-gray-300 font-semibold active:bg-gray-600"
              style={{
                fontSize: 12,
                padding: "3px 8px",
                borderRadius: "0 0 6px 0",
                border: "none",
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}
      </div>
    </div>,
    document.body
  );
});
