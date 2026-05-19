import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useSafeBack } from "@/hooks/use-safe-back";
import { createPortal } from "react-dom";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ChevronLeft,
  Layers,
  FileText,
  Pencil,
  Trash2,
  Search,
  Wrench,
  Plus,
  Home,
  Fence,
  Building2,
  CookingPot,
  Grid3X3,
  X,
} from "lucide-react";
import type { ServiceTemplate } from "@shared/schema";
import { RoomBuilder } from "@/components/RoomBuilder";
import { LineItemEditorModal, type LineItem } from "@/components/LineItemEditorModal";

function formatMoney(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

const SERVICE_OPTIONS: { name: string; icon: typeof Home; color: string; bg: string; desc: string }[] = [
  { name: "Residential Interior", icon: Home, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800", desc: "Rooms & living spaces" },
  { name: "Residential Exterior", icon: Fence, color: "text-green-600 dark:text-green-400", bg: "bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-800", desc: "Siding, trim & decks" },
  { name: "Commercial Interior", icon: Building2, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800", desc: "Offices & retail" },
  { name: "Commercial Exterior", icon: Building2, color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-800", desc: "Building exteriors" },
  { name: "Kitchen Cabinets", icon: CookingPot, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800", desc: "Cabinet refinishing" },
  { name: "Flooring Installation", icon: Grid3X3, color: "text-teal-600 dark:text-teal-400", bg: "bg-teal-50 dark:bg-teal-950/40 border-teal-200 dark:border-teal-800", desc: "Floor surfaces" },
];

const EMPTY_LINE_ITEM: LineItem = {
  name: "",
  description: "",
  quantity: 1,
  unitPrice: 0,
  total: 0,
  taxable: false,
};

export default function ServiceTemplates() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "production_rate" | "line_item">("all");
  const [renameTarget, setRenameTarget] = useState<ServiceTemplate | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ServiceTemplate | null>(null);

  const [showAddChooser, setShowAddChooser] = useState(false);
  const [showServicePicker, setShowServicePicker] = useState(false);
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [showRoomBuilder, setShowRoomBuilder] = useState(false);
  const [showLineItemEditor, setShowLineItemEditor] = useState(false);

  const { data: items = [], isLoading } = useQuery<ServiceTemplate[]>({
    queryKey: ["/api/service-templates"],
  });
  const { data: taxProfilesList = [] } = useQuery<any[]>({ queryKey: ["/api/tax-profiles"] });

  const defaultTaxRate = useMemo(() => {
    const def = taxProfilesList.find((t: any) => t.isDefault) || taxProfilesList[0];
    return def ? parseFloat(def.rate) : 0;
  }, [taxProfilesList]);

  const createMut = useMutation({
    mutationFn: async (payload: any) => apiRequest("POST", "/api/service-templates", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-templates"] });
      toast({ title: "Saved to library" });
    },
    onError: (e: any) =>
      toast({ title: "Could not save", description: e?.message, variant: "destructive" }),
  });

  const renameMut = useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      return apiRequest("PATCH", `/api/service-templates/${id}`, { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-templates"] });
      toast({ title: "Renamed" });
      setRenameTarget(null);
    },
    onError: (e: any) => toast({ title: "Failed to rename", description: e?.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/service-templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-templates"] });
      toast({ title: "Deleted" });
      setDeleteTarget(null);
    },
    onError: (e: any) => toast({ title: "Failed to delete", description: e?.message, variant: "destructive" }),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (filter !== "all" && it.type !== filter) return false;
      if (!q) return true;
      return (it.name || "").toLowerCase().includes(q);
    });
  }, [items, search, filter]);

  const productionCount = items.filter((i) => i.type === "production_rate").length;
  const lineItemCount = items.filter((i) => i.type === "line_item").length;

  const handleBack = useSafeBack("/settings/templates");

  const handleOpenAddProduction = () => {
    setShowAddChooser(false);
    setShowServicePicker(true);
  };

  const handleOpenAddLineItem = () => {
    setShowAddChooser(false);
    setShowLineItemEditor(true);
  };

  const handleSelectServiceType = (type: string) => {
    setSelectedService(type);
    setShowServicePicker(false);
    setShowRoomBuilder(true);
  };

  const handleSaveProductionRate = (
    data: any,
    newItems: any[],
    bName: string,
    bTaxable: boolean,
    taxProfileInfo: any,
  ) => {
    const block = {
      id: `prb-${Date.now()}`,
      name: bName || "Untitled service",
      roomBuilderData: data,
      taxable: bTaxable,
      taxProfileId: taxProfileInfo?.taxProfileId,
      taxProfileName: taxProfileInfo?.taxProfileName,
      taxProfileRate: taxProfileInfo?.taxProfileRate,
      lineItems: newItems.map((li) => ({
        ...li,
        unitPrice: Math.round(li.unitPrice * 100),
        total: Math.round(li.total * 100),
      })),
    };
    createMut.mutate({
      name: bName || "Untitled service",
      type: "production_rate",
      productionRateBlock: block,
    });
    setShowRoomBuilder(false);
    setSelectedService(null);
  };

  const handleSaveLineItem = (item: LineItem) => {
    const name = (item.name || "").trim() || "Untitled item";
    createMut.mutate({
      name,
      type: "line_item",
      lineItem: {
        name,
        description: item.description,
        quantity: item.quantity,
        unitPrice: Math.round((item.unitPrice || 0) * 100),
        total: Math.round((item.total || 0) * 100),
      },
    });
    setShowLineItemEditor(false);
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-4">
        <Button variant="ghost" size="icon" onClick={handleBack} data-testid="button-back">
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Service Templates</h1>
          <p className="text-sm text-muted-foreground">
            Reusable services you can drop into any proposal
          </p>
        </div>
        <Button onClick={() => setShowAddChooser(true)} data-testid="button-add-service">
          <Plus className="w-4 h-4 mr-1" /> Add Service
        </Button>
      </div>

      <Card className="mb-4">
        <CardContent className="p-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Tap <strong>Add Service</strong> to build a new production rate or line item from scratch, or save one from the proposal Builder using the bookmark icon.
          </p>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="secondary" className="gap-1">
              <Layers className="w-3 h-3" /> Production: {productionCount}
            </Badge>
            <Badge variant="secondary" className="gap-1">
              <FileText className="w-3 h-3" /> Line item: {lineItemCount}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search service templates"
            className="pl-9"
            data-testid="input-search"
          />
        </div>
        <div className="flex gap-1">
          {(["all", "production_rate", "line_item"] as const).map((f) => (
            <Button
              key={f}
              variant={filter === f ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(f)}
              data-testid={`button-filter-${f}`}
            >
              {f === "all" ? "All" : f === "production_rate" ? "Production" : "Line items"}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-12">Loading…</p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Wrench className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium mb-1">No service templates yet</p>
            <p className="text-xs text-muted-foreground mb-4">
              Tap "Add Service" above to create your first reusable service.
            </p>
            <Button size="sm" onClick={() => setShowAddChooser(true)} data-testid="button-add-service-empty">
              <Plus className="w-4 h-4 mr-1" /> Add Service
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((it) => {
            const isBlock = it.type === "production_rate";
            const block = it.productionRateBlock;
            const item = it.lineItem;
            const total = isBlock
              ? Math.round((block?.roomBuilderData?.grandTotal || 0))
              : Math.round((item?.total || 0));
            const subtitle = isBlock
              ? `${block?.serviceType || "Production"} • ${block?.roomBuilderData?.rooms?.length || 0} room(s)`
              : item?.description?.replace(/<[^>]+>/g, "").slice(0, 80) || "Line item";
            return (
              <Card key={it.id} data-testid={`card-service-${it.id}`}>
                <CardContent className="p-3 flex items-start gap-3">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                      isBlock
                        ? "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400"
                        : "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400"
                    }`}
                  >
                    {isBlock ? <Layers className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" data-testid={`text-name-${it.id}`}>
                      {it.name}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
                    {total > 0 && (
                      <p className="text-xs font-medium mt-0.5">{formatMoney(total)}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => {
                        setRenameTarget(it);
                        setRenameValue(it.name);
                      }}
                      data-testid={`button-rename-${it.id}`}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setDeleteTarget(it)}
                      data-testid={`button-delete-${it.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={showAddChooser} onOpenChange={setShowAddChooser}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add a Service</DialogTitle>
            <DialogDescription>Pick the type of service you want to save to your library.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <button
              type="button"
              onClick={handleOpenAddProduction}
              className="flex flex-col items-center gap-2 p-5 rounded-xl border-2 bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 hover:scale-[1.02] active:scale-[0.98] transition-all"
              data-testid="button-add-production"
            >
              <div className="w-12 h-12 rounded-full bg-white dark:bg-background shadow-sm flex items-center justify-center text-blue-600 dark:text-blue-400">
                <Layers className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold">Production Rate</p>
              <p className="text-[11px] text-muted-foreground text-center leading-tight">
                Rooms, surfaces & rates (cabinets, walls, etc.)
              </p>
            </button>
            <button
              type="button"
              onClick={handleOpenAddLineItem}
              className="flex flex-col items-center gap-2 p-5 rounded-xl border-2 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 hover:scale-[1.02] active:scale-[0.98] transition-all"
              data-testid="button-add-line-item"
            >
              <div className="w-12 h-12 rounded-full bg-white dark:bg-background shadow-sm flex items-center justify-center text-amber-600 dark:text-amber-400">
                <FileText className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold">Regular Item</p>
              <p className="text-[11px] text-muted-foreground text-center leading-tight">
                Name, qty, price & details
              </p>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {showServicePicker && createPortal(
        <div
          className="fixed inset-0 z-[10000] bg-black/60 flex items-center justify-center p-4"
          onClick={() => setShowServicePicker(false)}
          data-testid="service-picker-overlay"
        >
          <div
            className="bg-background rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 pt-6 pb-4">
              <h3 className="text-xl font-bold">Select Service</h3>
              <p className="text-sm text-muted-foreground mt-1">What type of work is this for?</p>
            </div>
            <div className="px-4 pb-4 grid grid-cols-2 gap-3">
              {SERVICE_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.name}
                    type="button"
                    onClick={() => handleSelectServiceType(opt.name)}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 ${opt.bg} hover:scale-[1.03] active:scale-[0.98] transition-all`}
                    data-testid={`service-option-${opt.name}`}
                  >
                    <div className={`w-11 h-11 rounded-full flex items-center justify-center bg-white dark:bg-background shadow-sm ${opt.color}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-semibold leading-tight">{opt.name}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{opt.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="px-6 pb-5 pt-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-muted-foreground"
                onClick={() => setShowServicePicker(false)}
                data-testid="button-cancel-service-picker"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {showRoomBuilder && createPortal(
        <div className="fixed inset-0 z-[9999] bg-background flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
            <div>
              <h2 className="text-lg font-semibold">Build Production Rate</h2>
              <p className="text-xs text-muted-foreground">{selectedService}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => { setShowRoomBuilder(false); setSelectedService(null); }}
              data-testid="button-close-room-builder"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto px-1.5 py-3 lg:px-8 lg:py-6">
            <div className="max-w-3xl mx-auto">
              <RoomBuilder
                taxRate={defaultTaxRate}
                taxProfiles={taxProfilesList}
                initialService={selectedService || undefined}
                onGenerateLineItems={() => {
                  toast({ title: "Use Save to add to library", description: "Tap the save button inside the builder to save this as a service template." });
                }}
                onCancel={() => { setShowRoomBuilder(false); setSelectedService(null); }}
                onSaveRoomData={handleSaveProductionRate}
              />
            </div>
          </div>
        </div>,
        document.body,
      )}

      <LineItemEditorModal
        open={showLineItemEditor}
        onOpenChange={(o) => setShowLineItemEditor(o)}
        item={EMPTY_LINE_ITEM}
        itemIndex={-1}
        onSave={handleSaveLineItem}
        taxProfiles={taxProfilesList}
      />

      <Dialog open={!!renameTarget} onOpenChange={(o) => !o && setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename service template</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            placeholder="Template name"
            data-testid="input-rename"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>Cancel</Button>
            <Button
              onClick={() =>
                renameTarget && renameMut.mutate({ id: renameTarget.id, name: renameValue.trim() })
              }
              disabled={!renameValue.trim() || renameMut.isPending}
              data-testid="button-save-rename"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this service template?</AlertDialogTitle>
            <AlertDialogDescription>
              This won't affect any proposals you've already sent. You'll just lose this template from your library.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
