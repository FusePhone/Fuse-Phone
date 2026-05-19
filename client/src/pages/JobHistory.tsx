import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "wouter";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  X,
  Search,
  Clock,
  User,
  MapPin,
  Loader2,
  FolderOpen,
} from "lucide-react";

const LOST_REASON_LABELS: Record<string, string> = {
  went_with_competitor: "Went with another contractor",
  price_too_high: "Price too high",
  not_responding: "Customer not responding",
  not_a_good_fit: "Not a good fit",
  other: "Other",
};

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export default function JobHistory() {
  const [activeTab, setActiveTab] = useState<"completed" | "lost">("completed");
  const [search, setSearch] = useState("");

  const { data: allProjects, isLoading } = useQuery<any[]>({
    queryKey: ["/api/projects"],
  });

  const filteredProjects = useMemo(() => {
    if (!allProjects) return [];
    let projects = allProjects.filter((p: any) => p.stage === activeTab);

    if (search.trim()) {
      const q = search.toLowerCase();
      projects = projects.filter(
        (p: any) =>
          p.title?.toLowerCase().includes(q) ||
          p.contact?.name?.toLowerCase().includes(q) ||
          p.contact?.company?.toLowerCase().includes(q) ||
          p.jobAddress?.toLowerCase().includes(q)
      );
    }

    projects.sort((a: any, b: any) => {
      const dateA = activeTab === "lost" ? a.lostAt : a.updatedAt;
      const dateB = activeTab === "lost" ? b.lostAt : b.updatedAt;
      return new Date(dateB || 0).getTime() - new Date(dateA || 0).getTime();
    });

    return projects;
  }, [allProjects, activeTab, search]);

  const completedCount = useMemo(() => {
    return (allProjects || []).filter((p: any) => p.stage === "completed").length;
  }, [allProjects]);

  const lostCount = useMemo(() => {
    return (allProjects || []).filter((p: any) => p.stage === "lost").length;
  }, [allProjects]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="page-job-history">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Job History</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Past projects that are completed or no longer active
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "completed" | "lost")} className="w-full sm:w-auto">
          <TabsList className="grid grid-cols-2 w-full sm:w-auto">
            <TabsTrigger value="completed" className="gap-1.5" data-testid="tab-completed">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Completed ({completedCount})
            </TabsTrigger>
            <TabsTrigger value="lost" className="gap-1.5" data-testid="tab-lost">
              <X className="w-3.5 h-3.5" />
              Lost ({lostCount})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative flex-1 w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, client, or address..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search"
          />
        </div>
      </div>

      {filteredProjects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <FolderOpen className="w-12 h-12 text-muted-foreground/40 mb-3" />
            <h3 className="font-semibold text-muted-foreground" data-testid="text-empty-state">
              {search
                ? `No ${activeTab} projects matching "${search}"`
                : `No ${activeTab} projects yet`}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {activeTab === "completed"
                ? "Projects will appear here once they're marked as completed."
                : "Projects marked as lost will appear here for future reference."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredProjects.map((project: any) => (
            <Link key={project.id} href={`/projects/${project.id}`}>
              <Card
                className="cursor-pointer hover-elevate"
                data-testid={`card-project-${project.id}`}
              >
                <CardContent className="py-3 px-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-sm truncate" data-testid={`text-project-title-${project.id}`}>
                          {project.title}
                        </h3>
                        {activeTab === "lost" && project.lostReason && (
                          <Badge variant="outline" className="text-[10px] shrink-0 text-destructive border-destructive/30" data-testid={`badge-lost-reason-${project.id}`}>
                            {LOST_REASON_LABELS[project.lostReason] || project.lostReason}
                          </Badge>
                        )}
                        {activeTab === "completed" && (
                          <Badge variant="outline" className="text-[10px] shrink-0 text-emerald-600 border-emerald-300 dark:text-emerald-400 dark:border-emerald-700">
                            Completed
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        {project.contact?.name && (
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {project.contact.name}
                          </span>
                        )}
                        {project.jobAddress && (
                          <span className="flex items-center gap-1 truncate max-w-[200px]">
                            <MapPin className="w-3 h-3 shrink-0" />
                            {project.jobAddress}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {activeTab === "lost" && project.lostAt
                            ? format(new Date(project.lostAt), "MMM d, yyyy")
                            : project.updatedAt
                              ? format(new Date(project.updatedAt), "MMM d, yyyy")
                              : project.createdAt
                                ? format(new Date(project.createdAt), "MMM d, yyyy")
                                : "—"}
                        </span>
                      </div>
                    </div>

                    {project.totalAmount && project.totalAmount > 0 && (
                      <div className="text-right shrink-0">
                        <span className={cn(
                          "font-semibold text-sm tabular-nums",
                          activeTab === "completed" ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                        )} data-testid={`text-project-amount-${project.id}`}>
                          {formatCurrency(project.totalAmount)}
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {filteredProjects.length > 0 && (
        <p className="text-xs text-muted-foreground text-center pt-2" data-testid="text-project-count">
          {filteredProjects.length} {activeTab} project{filteredProjects.length !== 1 ? "s" : ""}
          {(allProjects || []).filter((p: any) => p.stage === activeTab).reduce((sum: number, p: any) => sum + (p.totalAmount || 0), 0) > 0 && (
            <> &middot; {formatCurrency((allProjects || []).filter((p: any) => p.stage === activeTab).reduce((sum: number, p: any) => sum + (p.totalAmount || 0), 0))} total value</>
          )}
        </p>
      )}
    </div>
  );
}
