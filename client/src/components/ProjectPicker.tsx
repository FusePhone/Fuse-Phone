import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ChevronDown, Search, Check, X } from "lucide-react";

interface ProjectOption {
  id: number;
  title?: string;
  projectNumber?: number;
  contactName?: string;
  stage?: string;
}

interface ProjectPickerProps {
  projects: ProjectOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  allowNone?: boolean;
  noneLabel?: string;
  "data-testid"?: string;
}

export default function ProjectPicker({
  projects,
  value,
  onValueChange,
  placeholder = "Select project",
  allowNone = true,
  noneLabel = "No specific project",
  "data-testid": testId,
}: ProjectPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selectedProject = projects.find(p => p.id.toString() === value);
  const displayText = value === "none"
    ? noneLabel
    : selectedProject
      ? (selectedProject.title || `Project #${selectedProject.projectNumber}`)
      : null;

  const filtered = useMemo(() => {
    if (!search.trim()) return projects;
    const q = search.toLowerCase();
    return projects.filter(p => {
      const title = (p.title || `Project #${p.projectNumber}`).toLowerCase();
      const contact = (p.contactName || "").toLowerCase();
      return title.includes(q) || contact.includes(q) || String(p.projectNumber || "").includes(q);
    });
  }, [projects, search]);

  const handleSelect = (val: string) => {
    onValueChange(val);
    setOpen(false);
    setSearch("");
  };

  return (
    <>
      <button
        type="button"
        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        onClick={() => setOpen(true)}
        data-testid={testId}
      >
        <span className={displayText ? "truncate" : "text-muted-foreground truncate"}>
          {displayText || placeholder}
        </span>
        <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
      </button>

      <Dialog open={open} onOpenChange={(v) => { if (!v) { setOpen(false); setSearch(""); } }}>
        <DialogContent className="sm:max-w-sm max-h-[80vh] flex flex-col p-0 z-[60]" style={{ zIndex: 60 }}>
          <DialogHeader className="px-4 pt-4 pb-2">
            <DialogTitle className="text-base">{placeholder}</DialogTitle>
          </DialogHeader>
          <div className="px-4 pb-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search projects..."
                className="pl-9 pr-8"
                autoFocus
                data-testid="input-project-search"
              />
              {search && (
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-accent"
                  onClick={() => setSearch("")}
                >
                  <X className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              )}
            </div>
          </div>
          <div className="overflow-y-auto flex-1 px-2 pb-4 max-h-[50vh]" data-testid="project-picker-list">
            {allowNone && !search && (
              <button
                type="button"
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-left transition-colors ${value === "none" ? "bg-accent" : "hover:bg-accent/50"}`}
                onClick={() => handleSelect("none")}
                data-testid="project-option-none"
              >
                <div className="w-4 h-4 shrink-0 flex items-center justify-center">
                  {value === "none" && <Check className="w-4 h-4 text-primary" />}
                </div>
                <span className="text-muted-foreground">{noneLabel}</span>
              </button>
            )}
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6" data-testid="text-no-projects">
                {search ? "No projects match your search" : "No projects available"}
              </p>
            ) : (
              filtered.map(p => {
                const label = p.title || `Project #${p.projectNumber}`;
                const isSelected = p.id.toString() === value;
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-left transition-colors ${isSelected ? "bg-accent" : "hover:bg-accent/50"}`}
                    onClick={() => handleSelect(p.id.toString())}
                    data-testid={`project-option-${p.id}`}
                  >
                    <div className="w-4 h-4 shrink-0 flex items-center justify-center">
                      {isSelected && <Check className="w-4 h-4 text-primary" />}
                    </div>
                    <span className="truncate">{label}</span>
                  </button>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
