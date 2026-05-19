import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Layers, FileText, Search, X, Wrench } from "lucide-react";
import type { ServiceTemplate, ProductionRateBlock } from "@shared/schema";

type LineItemPayload = {
  name?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

interface Props {
  open: boolean;
  onClose: () => void;
  onPickBlock: (block: ProductionRateBlock) => void;
  onPickLineItem: (item: LineItemPayload) => void;
  defaultFilter?: "all" | "production_rate" | "line_item";
}

export function ServiceLibraryPicker({ open, onClose, onPickBlock, onPickLineItem, defaultFilter = "all" }: Props) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "production_rate" | "line_item">(defaultFilter);

  useEffect(() => { if (open) setFilter(defaultFilter); }, [open, defaultFilter]);

  const { data: items = [], isLoading } = useQuery<ServiceTemplate[]>({
    queryKey: ["/api/service-templates"],
    enabled: open,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (filter !== "all" && it.type !== filter) return false;
      if (q && !(it.name || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, search, filter]);

  const handlePick = (it: ServiceTemplate) => {
    if (it.type === "production_rate" && it.productionRateBlock) {
      const cloned = JSON.parse(JSON.stringify(it.productionRateBlock)) as ProductionRateBlock;
      cloned.id = `block-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      onPickBlock(cloned);
    } else if (it.type === "line_item" && it.lineItem) {
      onPickLineItem({ ...it.lineItem });
    }
    onClose();
  };

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] bg-black/60 flex items-center justify-center p-4 touch-none"
      onClick={onClose}
      data-testid="service-library-overlay"
    >
      <div
        className="bg-background rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        data-testid="service-library-modal"
      >
        <div className="px-5 pt-5 pb-3 flex items-center justify-between gap-3 border-b">
          <div>
            <h3 className="text-lg font-bold">Service Library</h3>
            <p className="text-xs text-muted-foreground">
              Tap a service to open its editor and add it to this proposal
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} data-testid="button-close-library">
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="px-4 py-3 border-b space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search services"
              className="pl-9"
              data-testid="input-search-library"
            />
          </div>
          <div className="flex items-center gap-1.5">
            {(["all", "production_rate", "line_item"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                className={`px-3 py-1 rounded-full text-xs font-medium border ${
                  filter === k
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:bg-muted"
                }`}
                data-testid={`filter-${k}`}
              >
                {k === "all" ? "All" : k === "production_rate" ? "Production" : "Line items"}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-12">Loading…</p>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <Wrench className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-medium">
                {items.length === 0 ? "Your library is empty" : "No matches"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {items.length === 0
                  ? "Save services from a proposal using the bookmark icon."
                  : "Try a different search."}
              </p>
            </div>
          ) : (
            filtered.map((it) => {
              const isBlock = it.type === "production_rate";
              const block = it.productionRateBlock;
              const item = it.lineItem;
              const total = isBlock
                ? Math.round(block?.roomBuilderData?.grandTotal || 0)
                : Math.round(item?.total || 0);
              const subtitle = isBlock
                ? `${block?.serviceType || "Production"} • ${
                    block?.roomBuilderData?.rooms?.length || 0
                  } room(s)`
                : item?.description?.replace(/<[^>]+>/g, "").slice(0, 60) || "Line item";
              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => handlePick(it)}
                  className="w-full text-left p-3 rounded-xl border-2 border-border bg-card hover:border-primary/40 transition-colors"
                  data-testid={`library-item-${it.id}`}
                >
                  <div className="flex items-start gap-3">
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
                      <p className="text-sm font-semibold truncate">{it.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
                      {total > 0 && (
                        <p className="text-xs font-medium mt-0.5">${(total / 100).toFixed(2)}</p>
                      )}
                    </div>
                    <Badge variant="secondary" className="text-[10px] shrink-0">
                      {isBlock ? "Production" : "Line item"}
                    </Badge>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="px-4 py-3 border-t flex items-center justify-end">
          <Button variant="ghost" size="sm" onClick={onClose} data-testid="button-cancel-library">
            Cancel
          </Button>
        </div>
      </div>
    </div>,
    window.document.body
  );
}
