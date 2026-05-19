import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Search, MapPin, Calendar, FileText, Briefcase, Play, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useState, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { ProjectWithContact } from "@shared/schema";

type StageFilter = 'all' | 'accepted' | 'scheduled' | 'in_progress' | 'invoiced' | 'paid' | 'completed';

const JOB_STAGES = ['accepted', 'scheduled', 'in_progress', 'invoiced', 'paid', 'completed'] as const;

const STAGE_LABELS: Record<string, string> = {
  accepted: 'Pending Schedule',
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  invoiced: 'Invoiced',
  paid: 'Paid',
  completed: 'Completed',
};

const STAGE_COLORS: Record<string, string> = {
  accepted: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  scheduled: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  in_progress: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300',
  invoiced: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
  paid: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  completed: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-300',
};

export default function Jobs() {
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<StageFilter>("all");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: allProjects, isLoading } = useQuery<ProjectWithContact[]>({
    queryKey: ['/api/projects'],
  });

  const updateStageMutation = useMutation({
    mutationFn: async ({ id, stage }: { id: number; stage: string }) => {
      return apiRequest('PUT', `/api/projects/${id}`, { stage });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      toast({ title: "Project updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const jobProjects = useMemo(() => {
    return (allProjects || []).filter(p => JOB_STAGES.includes(p.stage as any));
  }, [allProjects]);

  const filteredJobs = useMemo(() => {
    return jobProjects.filter(project => {
      const matchesSearch =
        project.title.toLowerCase().includes(search.toLowerCase()) ||
        project.contact.name.toLowerCase().includes(search.toLowerCase());
      const matchesStage = stageFilter === 'all' || project.stage === stageFilter;
      return matchesSearch && matchesStage;
    });
  }, [jobProjects, search, stageFilter]);

  const stageCounts = useMemo(() => {
    return jobProjects.reduce((acc, p) => {
      acc[p.stage] = (acc[p.stage] || 0) + 1;
      acc.all = (acc.all || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [jobProjects]);

  const formatAddress = (project: ProjectWithContact) => {
    const parts = [project.jobAddress, project.jobCity, project.jobState, project.jobZipCode].filter(Boolean);
    if (parts.length === 0) return null;
    return `${project.jobAddress || ''}${project.jobCity ? `, ${project.jobCity}` : ''}${project.jobState ? ` ${project.jobState}` : ''} ${project.jobZipCode || ''}`.trim();
  };

  if (isLoading && !allProjects) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 pb-24">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Briefcase className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold" data-testid="text-jobs-title">Jobs</h1>
        </div>
        <div className="relative w-48">
          <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
            data-testid="input-search-jobs"
          />
        </div>
      </div>

      <Card>
        <CardContent className="p-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-green-600 dark:text-green-400 uppercase tracking-wide">Stage</span>
            <div className="flex gap-1 flex-wrap">
              <Button
                variant={stageFilter === 'all' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setStageFilter('all')}
                data-testid="filter-stage-all"
              >
                All ({stageCounts.all || 0})
              </Button>
              {JOB_STAGES.map(stage => (
                <Button
                  key={stage}
                  variant={stageFilter === stage ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setStageFilter(stage)}
                  data-testid={`filter-stage-${stage}`}
                >
                  {STAGE_LABELS[stage]} ({stageCounts[stage] || 0})
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {filteredJobs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Briefcase className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium" data-testid="text-no-jobs">No jobs found</h3>
            <p className="text-muted-foreground">
              {stageFilter !== 'all'
                ? `No ${STAGE_LABELS[stageFilter].toLowerCase()} jobs`
                : "Jobs appear here once a proposal is accepted"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filteredJobs.map(project => (
            <Link key={project.id} href={`/projects/${project.id}`}>
              <Card className="hover-elevate h-full" data-testid={`card-job-${project.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold truncate" data-testid={`text-job-title-${project.id}`}>{project.title}</h3>
                      <p className="text-sm text-muted-foreground truncate" data-testid={`text-job-contact-${project.id}`}>{project.contact.name}</p>
                    </div>
                    <Badge className={cn("shrink-0", STAGE_COLORS[project.stage])} data-testid={`badge-job-stage-${project.id}`}>
                      {STAGE_LABELS[project.stage]}
                    </Badge>
                  </div>

                  {formatAddress(project) && (
                    <div
                      className="flex items-start gap-1.5 text-sm text-muted-foreground mb-2"
                      data-testid={`text-job-address-${project.id}`}
                    >
                      <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span className="line-clamp-2">{formatAddress(project)}</span>
                    </div>
                  )}

                  {project.scheduledDate && (
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-2" data-testid={`text-job-dates-${project.id}`}>
                      <Calendar className="h-3.5 w-3.5" />
                      <span>
                        {format(new Date(project.scheduledDate + 'T00:00:00'), 'MMM d')}
                        {project.scheduledTime && ` ${project.scheduledTime}`}
                        {project.scheduledEndDate && (
                          <> - {format(new Date(project.scheduledEndDate + 'T00:00:00'), 'MMM d')}
                          {project.scheduledEndTime && ` ${project.scheduledEndTime}`}</>
                        )}
                      </span>
                    </div>
                  )}

                  {project.totalAmount != null && project.totalAmount > 0 && (
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-2" data-testid={`text-job-amount-${project.id}`}>
                      <FileText className="h-3.5 w-3.5" />
                      <span>${(project.totalAmount / 100).toLocaleString()}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-2 border-t flex-wrap">
                    {project.stage === 'accepted' && (
                      <Link href={`/projects/${project.id}`}>
                        <Button
                          size="sm"
                          variant="outline"
                          data-testid={`button-schedule-job-${project.id}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Calendar className="h-3 w-3 mr-1" />
                          Schedule
                        </Button>
                      </Link>
                    )}
                    {project.stage === 'scheduled' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          updateStageMutation.mutate({ id: project.id, stage: 'in_progress' });
                        }}
                        disabled={updateStageMutation.isPending}
                        data-testid={`button-start-job-${project.id}`}
                      >
                        <Play className="h-3 w-3 mr-1" />
                        Start
                      </Button>
                    )}
                    {project.stage === 'in_progress' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          updateStageMutation.mutate({ id: project.id, stage: 'invoiced' });
                        }}
                        disabled={updateStageMutation.isPending}
                        data-testid={`button-invoice-job-${project.id}`}
                      >
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Invoice
                      </Button>
                    )}
                    <Link href={`/projects/${project.id}`}>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => e.stopPropagation()}
                        data-testid={`button-view-project-${project.id}`}
                      >
                        View Project
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
