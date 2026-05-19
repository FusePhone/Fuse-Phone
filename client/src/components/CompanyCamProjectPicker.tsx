import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Camera, Search, Loader2, Sparkles, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface ContactHint {
  name?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
}

interface CompanyCamProjectPickerProps {
  selectedProjectId?: string | null;
  selectedProjectName?: string | null;
  onSelect: (projectId: string | null, projectName: string | null) => void;
  companyCamConnected: boolean;
  contactHint?: ContactHint;
}

interface CompanyCamProject {
  id: string;
  name: string;
  address?: {
    street_address_1?: string;
    city?: string;
    state?: string;
    postal_code?: string;
  };
}

type MatchStrength = "strong" | "partial" | "none";

function normalizeStr(s?: string | null): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function scoreProject(project: CompanyCamProject, hint: ContactHint): { strength: MatchStrength; nameMatch: boolean; addressMatch: boolean } {
  if (!hint.name && !hint.address && !hint.city) {
    return { strength: "none", nameMatch: false, addressMatch: false };
  }

  const projName = normalizeStr(project.name);
  const projAddr = normalizeStr(project.address?.street_address_1);
  const projCity = normalizeStr(project.address?.city);

  let nameMatch = false;
  if (hint.name) {
    const hintName = normalizeStr(hint.name);
    if (hintName.length >= 3 && projName.length >= 3) {
      nameMatch = projName.includes(hintName) || hintName.includes(projName);
    }
  }

  let addressMatch = false;
  if (hint.address && projAddr) {
    const hintAddr = normalizeStr(hint.address);
    if (hintAddr.length >= 3 && projAddr.length >= 3) {
      addressMatch = projAddr.includes(hintAddr) || hintAddr.includes(projAddr);
    }
  }
  if (!addressMatch && hint.city && projCity) {
    const hintCity = normalizeStr(hint.city);
    if (hintCity.length >= 2 && projCity.length >= 2) {
      addressMatch = projCity === hintCity;
    }
  }

  const strength: MatchStrength =
    nameMatch && addressMatch ? "strong" :
    nameMatch || addressMatch ? "partial" : "none";

  return { strength, nameMatch, addressMatch };
}

export function CompanyCamProjectPicker({
  selectedProjectId,
  selectedProjectName,
  onSelect,
  companyCamConnected,
  contactHint,
}: CompanyCamProjectPickerProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const { data: projects, isLoading } = useQuery<CompanyCamProject[]>({
    queryKey: ['/api/companycam/projects'],
    enabled: companyCamConnected && dialogOpen,
  });

  const scoredProjects = useMemo(() => {
    if (!projects || !Array.isArray(projects)) return [];

    let list = projects.map((p) => ({
      project: p,
      ...scoreProject(p, contactHint || {}),
    }));

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter(({ project: p }) => {
        const name = (p.name || "").toLowerCase();
        const addr = p.address || {};
        const addrStr = [addr.street_address_1, addr.city, addr.state, addr.postal_code]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return name.includes(term) || addrStr.includes(term);
      });
    }

    list.sort((a, b) => {
      const order: Record<MatchStrength, number> = { strong: 0, partial: 1, none: 2 };
      return order[a.strength] - order[b.strength];
    });

    return list;
  }, [projects, searchTerm, contactHint]);

  const hasSuggestions = scoredProjects.some((s) => s.strength !== "none");

  const formatAddress = (addr?: CompanyCamProject["address"]) => {
    if (!addr) return null;
    const parts = [addr.street_address_1, addr.city, addr.state, addr.postal_code].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : null;
  };

  if (!companyCamConnected) return null;

  return (
    <>
      {selectedProjectId && selectedProjectName ? (
        <div className="flex items-center gap-2 py-1.5 mb-2" data-testid="companycam-selected-project">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-orange-500/10 border border-orange-500/20">
            <Camera className="w-3.5 h-3.5 text-orange-600" />
            <span className="text-xs font-medium text-orange-700 dark:text-orange-400 truncate max-w-[180px]">
              {selectedProjectName}
            </span>
          </div>
          <button
            type="button"
            className="text-[11px] text-muted-foreground hover:text-foreground underline"
            onClick={() => {
              console.log('[CompanyCam] picker opened (Change)', { currentId: selectedProjectId, currentName: selectedProjectName });
              setSearchTerm("");
              setDialogOpen(true);
            }}
            data-testid="button-change-companycam"
          >
            Change
          </button>
          <button
            type="button"
            className="text-[11px] text-red-500 hover:text-red-600 underline"
            onClick={() => {
              console.log('[CompanyCam] picker Unlink clicked', { previousId: selectedProjectId, previousName: selectedProjectName });
              onSelect(null, null);
            }}
            data-testid="button-unlink-companycam"
          >
            Unlink
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-orange-500/10 text-orange-700 dark:text-orange-400 hover:bg-orange-500/20 transition-colors mb-2"
          onClick={() => {
            console.log('[CompanyCam] picker opened (Link)', { currentId: null });
            setSearchTerm("");
            setDialogOpen(true);
          }}
          data-testid="button-link-companycam"
        >
          <Camera className="w-3.5 h-3.5" />
          Link CompanyCam Project
        </button>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="z-[10001] max-h-[80vh] flex flex-col" data-testid="dialog-companycam-picker">
          <DialogHeader>
            <DialogTitle>Select CompanyCam Project</DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search projects..."
              className="pl-9"
              data-testid="input-companycam-search"
            />
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 max-h-[50vh] space-y-1">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : scoredProjects.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground" data-testid="text-no-projects">
                {searchTerm ? "No projects match your search" : "No projects found"}
              </div>
            ) : (
              <>
                {hasSuggestions && !searchTerm.trim() && (
                  <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground" data-testid="text-suggestions-header">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Suggested matches based on contact info</span>
                  </div>
                )}
                {scoredProjects.map(({ project, strength, nameMatch, addressMatch }, idx) => {
                  const address = formatAddress(project.address);
                  const showDivider = hasSuggestions && !searchTerm.trim() && idx > 0 &&
                    scoredProjects[idx - 1].strength !== "none" && strength === "none";
                  return (
                    <div key={project.id}>
                      {showDivider && (
                        <div className="border-t my-2" />
                      )}
                      <button
                        type="button"
                        className={cn(
                          "w-full text-left px-3 py-2.5 rounded-md hover-elevate transition-colors",
                          strength === "strong" && "bg-primary/5 border border-primary/20",
                          strength === "partial" && "bg-muted/50"
                        )}
                        onClick={() => {
                          console.log('[CompanyCam] picker onSelect', { pickedId: String(project.id), pickedName: project.name });
                          onSelect(String(project.id), project.name);
                          setDialogOpen(false);
                        }}
                        data-testid={`companycam-project-${project.id}`}
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium truncate">{project.name}</p>
                          {strength === "strong" && (
                            <Badge variant="default" className="text-[10px] px-1.5 py-0" data-testid={`badge-match-strong-${project.id}`}>
                              Best Match
                            </Badge>
                          )}
                          {strength === "partial" && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0" data-testid={`badge-match-partial-${project.id}`}>
                              {nameMatch ? "Name Match" : "Address Match"}
                            </Badge>
                          )}
                        </div>
                        {address && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{address}</p>
                        )}
                      </button>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
