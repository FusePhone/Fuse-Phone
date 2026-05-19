import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X, ChevronLeft, Droplets } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { PaintColor } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const AREA_OPTIONS = ["Walls", "Trim", "Ceiling", "Accent", "Door", "Custom"] as const;

const COLOR_FAMILIES = [
  "All", "White", "Gray", "Greige", "Beige", "Brown", "Yellow", "Orange", "Red", "Pink", "Purple", "Blue", "Green", "Black"
];

const BRAND_TABS = ["All", "Benjamin Moore", "Sherwin-Williams"] as const;

function getContrastColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#1a1a1a" : "#ffffff";
}

function darkenHex(hex: string, amount: number): string {
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - amount);
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - amount);
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - amount);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function lightenHex(hex: string, amount: number): string {
  const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + amount);
  const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + amount);
  const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + amount);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function PaintBlobSwatch({
  color,
  size = "sm",
  onClick,
  selected,
}: {
  color: PaintColor;
  size?: "sm" | "lg";
  onClick?: () => void;
  selected?: boolean;
}) {
  const isLarge = size === "lg";
  const dim = isLarge ? 96 : 56;
  const highlight = lightenHex(color.hexColor, 40);
  const shadow = darkenHex(color.hexColor, 30);

  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`swatch-color-${color.id}`}
      className={`group flex flex-col items-center gap-1.5 cursor-pointer transition-transform ${
        isLarge ? "w-32" : "w-[72px]"
      } ${selected ? "scale-105" : "hover:scale-105"}`}
    >
      <div
        className="relative flex-shrink-0"
        style={{ width: dim, height: dim }}
      >
        <svg
          viewBox="0 0 100 100"
          width={dim}
          height={dim}
          className="drop-shadow-md group-hover:drop-shadow-lg transition-all"
        >
          <defs>
            <radialGradient id={`grad-${color.id}`} cx="35%" cy="30%" r="65%">
              <stop offset="0%" stopColor={highlight} />
              <stop offset="60%" stopColor={color.hexColor} />
              <stop offset="100%" stopColor={shadow} />
            </radialGradient>
            <filter id={`shadow-${color.id}`}>
              <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.15" />
            </filter>
          </defs>
          <path
            d="M50 8 C70 6, 92 20, 94 45 C96 65, 82 90, 58 94 C35 97, 8 82, 6 55 C4 30, 25 10, 50 8Z"
            fill={`url(#grad-${color.id})`}
            filter={`url(#shadow-${color.id})`}
          />
          <ellipse
            cx="38"
            cy="28"
            rx={isLarge ? 14 : 12}
            ry={isLarge ? 8 : 6}
            fill="white"
            opacity="0.18"
            transform="rotate(-15, 38, 28)"
          />
        </svg>
        {selected && (
          <div className="absolute inset-0 rounded-full ring-2 ring-primary ring-offset-2" />
        )}
      </div>
      <div className={`text-center w-full ${isLarge ? "px-1" : "px-0.5"}`}>
        <p
          className={`font-medium leading-tight truncate ${
            isLarge ? "text-xs" : "text-[10px]"
          } text-foreground`}
        >
          {color.name}
        </p>
        <p
          className={`leading-tight truncate ${
            isLarge ? "text-[11px]" : "text-[9px]"
          } text-muted-foreground`}
        >
          {color.code}
        </p>
      </div>
    </button>
  );
}

function ColorDetailView({
  color,
  projectId,
  onBack,
  onAssigned,
}: {
  color: PaintColor;
  projectId: number;
  onBack: () => void;
  onAssigned: () => void;
}) {
  const [area, setArea] = useState<string>("");
  const [sheen, setSheen] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const contrastText = getContrastColor(color.hexColor);

  const handleAssign = async () => {
    if (!area) {
      toast({ title: "Please select an area", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await apiRequest("POST", `/api/projects/${projectId}/colors`, {
        paintColorId: color.id,
        area,
        sheen: sheen && sheen !== "none" ? sheen : undefined,
        notes: notes || undefined,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "colors"] });
      toast({ title: `${color.name} assigned to ${area}` });
      onAssigned();
    } catch (e: any) {
      toast({ title: "Failed to assign color", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const highlight = lightenHex(color.hexColor, 40);
  const shadow = darkenHex(color.hexColor, 30);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 p-4 border-b">
        <Button size="icon" variant="ghost" onClick={onBack} data-testid="button-back-to-browse">
          <ChevronLeft />
        </Button>
        <span className="font-semibold text-sm">Color Detail</span>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6 flex flex-col items-center gap-6">
          <div className="relative" style={{ width: 160, height: 160 }}>
            <svg viewBox="0 0 100 100" width={160} height={160} className="drop-shadow-lg">
              <defs>
                <radialGradient id="detail-grad" cx="35%" cy="30%" r="65%">
                  <stop offset="0%" stopColor={highlight} />
                  <stop offset="60%" stopColor={color.hexColor} />
                  <stop offset="100%" stopColor={shadow} />
                </radialGradient>
              </defs>
              <path
                d="M50 8 C70 6, 92 20, 94 45 C96 65, 82 90, 58 94 C35 97, 8 82, 6 55 C4 30, 25 10, 50 8Z"
                fill="url(#detail-grad)"
              />
              <ellipse
                cx="38"
                cy="28"
                rx="16"
                ry="9"
                fill="white"
                opacity="0.2"
                transform="rotate(-15, 38, 28)"
              />
            </svg>
          </div>

          <div className="text-center space-y-1">
            <h3 className="text-lg font-bold" data-testid="text-color-name">{color.name}</h3>
            <p className="text-sm text-muted-foreground" data-testid="text-color-code">{color.code}</p>
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <Badge variant="secondary" className="no-default-active-elevate" data-testid="text-color-brand">
                {color.brand}
              </Badge>
              {color.collection && (
                <Badge variant="outline" className="no-default-active-elevate text-[11px]">
                  {color.collection}
                </Badge>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-md border shadow-sm"
              style={{ backgroundColor: color.hexColor }}
            />
            <span className="text-sm font-mono text-muted-foreground" data-testid="text-hex-value">
              {color.hexColor}
            </span>
            <Badge variant="outline" className="no-default-active-elevate">
              {color.family}
            </Badge>
          </div>

          <Card className="w-full p-4 space-y-4">
            <h4 className="text-sm font-semibold">Assign to Area</h4>
            <Select value={area} onValueChange={setArea}>
              <SelectTrigger data-testid="select-area">
                <SelectValue placeholder="Select area..." />
              </SelectTrigger>
              <SelectContent>
                {AREA_OPTIONS.map((a) => (
                  <SelectItem key={a} value={a} data-testid={`option-area-${a.toLowerCase()}`}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={sheen} onValueChange={setSheen}>
              <SelectTrigger data-testid="select-sheen">
                <SelectValue placeholder="Select sheen (optional)..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No Sheen</SelectItem>
                <SelectItem value="flat">Flat</SelectItem>
                <SelectItem value="matte">Matte</SelectItem>
                <SelectItem value="eggshell">Eggshell</SelectItem>
                <SelectItem value="satin">Satin</SelectItem>
                <SelectItem value="semi-gloss">Semi-Gloss</SelectItem>
                <SelectItem value="high-gloss">High-Gloss</SelectItem>
              </SelectContent>
            </Select>

            <Textarea
              placeholder="Optional notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="resize-none"
              data-testid="input-notes"
            />

            <Button
              className="w-full"
              onClick={handleAssign}
              disabled={!area || submitting}
              data-testid="button-assign-color"
            >
              {submitting ? "Assigning..." : "Assign to Project"}
            </Button>
          </Card>
        </div>
      </ScrollArea>
    </div>
  );
}

interface PaintColorPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: number;
}

export function PaintColorPicker({ open, onOpenChange, projectId }: PaintColorPickerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeBrand, setActiveBrand] = useState<string>("All");
  const [activeFamily, setActiveFamily] = useState<string>("All");
  const [activeCollection, setActiveCollection] = useState<string>("All");
  const [selectedColor, setSelectedColor] = useState<PaintColor | null>(null);

  const { data: colors = [], isLoading, isError } = useQuery<PaintColor[]>({
    queryKey: ["/api/paint-colors"],
    enabled: open,
  });

  const collections = useMemo(() => {
    const brandFiltered = activeBrand !== "All"
      ? colors.filter(c => c.brand === activeBrand)
      : colors;
    const colls = new Set<string>();
    brandFiltered.forEach(c => { if (c.collection) colls.add(c.collection); });
    return ["All", ...Array.from(colls).sort()];
  }, [colors, activeBrand]);

  const filteredColors = useMemo(() => {
    let result = colors;
    if (activeBrand !== "All") {
      result = result.filter((c) => c.brand === activeBrand);
    }
    if (activeCollection !== "All") {
      result = result.filter((c) => c.collection === activeCollection);
    }
    if (activeFamily !== "All") {
      result = result.filter((c) => c.family === activeFamily);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.code.toLowerCase().includes(q) ||
          c.brand.toLowerCase().includes(q) ||
          (c.collection && c.collection.toLowerCase().includes(q))
      );
    }
    return result;
  }, [colors, activeBrand, activeFamily, activeCollection, searchQuery]);

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setSelectedColor(null);
      setSearchQuery("");
      setActiveBrand("All");
      setActiveFamily("All");
      setActiveCollection("All");
    }, 300);
  };

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="right" className="w-full sm:max-w-xl p-0 flex flex-col">
        {selectedColor ? (
          <ColorDetailView
            color={selectedColor}
            projectId={projectId}
            onBack={() => setSelectedColor(null)}
            onAssigned={handleClose}
          />
        ) : (
          <>
            <SheetHeader className="p-4 pb-0 space-y-0">
              <SheetTitle className="flex items-center gap-2">
                <Droplets className="w-5 h-5 text-primary" />
                Paint Color Library
              </SheetTitle>
            </SheetHeader>

            <div className="px-4 pt-3 pb-2 space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search color name, code, or collection..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-8"
                  data-testid="input-search-colors"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    data-testid="button-clear-search"
                  >
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                )}
              </div>

              <div className="flex gap-1.5 flex-wrap">
                {BRAND_TABS.map((brand) => (
                  <Badge
                    key={brand}
                    variant={activeBrand === brand ? "default" : "outline"}
                    className="cursor-pointer toggle-elevate"
                    onClick={() => {
                      setActiveBrand(brand);
                      setActiveCollection("All");
                    }}
                    data-testid={`filter-brand-${brand.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    {brand}
                  </Badge>
                ))}
              </div>

              {collections.length > 2 && (
                <div className="flex gap-1 flex-wrap">
                  {collections.map((coll) => (
                    <Badge
                      key={coll}
                      variant={activeCollection === coll ? "default" : "outline"}
                      className="cursor-pointer text-[11px] toggle-elevate"
                      onClick={() => setActiveCollection(coll)}
                      data-testid={`filter-collection-${coll.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      {coll}
                    </Badge>
                  ))}
                </div>
              )}

              <div className="flex gap-1 flex-wrap">
                {COLOR_FAMILIES.map((family) => {
                  const isActive = activeFamily === family;
                  return (
                    <Badge
                      key={family}
                      variant={isActive ? "default" : "outline"}
                      className="cursor-pointer text-[11px] toggle-elevate"
                      onClick={() => setActiveFamily(family)}
                      data-testid={`filter-family-${family.toLowerCase()}`}
                    >
                      {family !== "All" && (
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full mr-1 border border-black/10"
                          style={{
                            backgroundColor:
                              family === "White" ? "#f5f5f0" :
                              family === "Gray" ? "#9e9e9e" :
                              family === "Greige" ? "#b5a98e" :
                              family === "Beige" ? "#d4c5a9" :
                              family === "Brown" ? "#8b6914" :
                              family === "Yellow" ? "#f5d442" :
                              family === "Orange" ? "#f5a623" :
                              family === "Red" ? "#e74c3c" :
                              family === "Pink" ? "#e91e8c" :
                              family === "Purple" ? "#9b59b6" :
                              family === "Blue" ? "#3498db" :
                              family === "Green" ? "#27ae60" :
                              family === "Black" ? "#2c2c2c" : "#ccc"
                          }}
                        />
                      )}
                      {family}
                    </Badge>
                  );
                })}
              </div>
            </div>

            <ScrollArea className="flex-1 px-4 pb-4">
              {isLoading ? (
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-4 pt-2">
                  {Array.from({ length: 20 }).map((_, i) => (
                    <div key={i} className="flex flex-col items-center gap-1.5">
                      <Skeleton className="w-14 h-14 rounded-full" />
                      <Skeleton className="w-12 h-3" />
                      <Skeleton className="w-10 h-2" />
                    </div>
                  ))}
                </div>
              ) : isError ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Droplets className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm font-medium text-destructive">Failed to load colors</p>
                  <Button size="sm" variant="outline" className="mt-2" onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/paint-colors"] })} data-testid="button-retry-paint-colors">
                    Retry
                  </Button>
                </div>
              ) : filteredColors.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Droplets className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm font-medium">No colors found</p>
                  <p className="text-xs mt-1">Try adjusting your filters or search</p>
                </div>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground mb-3" data-testid="text-color-count">
                    {filteredColors.length} color{filteredColors.length !== 1 ? "s" : ""}
                  </p>
                  <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
                    {filteredColors.map((color) => (
                      <PaintBlobSwatch
                        key={color.id}
                        color={color}
                        onClick={() => setSelectedColor(color)}
                      />
                    ))}
                  </div>
                </>
              )}
            </ScrollArea>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
