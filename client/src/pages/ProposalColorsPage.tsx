import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ChevronLeft, Loader2, Paintbrush } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ColorsTab } from "@/pages/ProjectDetail";

interface ProposalColorsPageProps {
  projectId: number;
  docId: number;
}

export default function ProposalColorsPage({ projectId, docId }: ProposalColorsPageProps) {
  const { data: doc, isLoading: docLoading } = useQuery<any>({
    queryKey: ["/api/documents", docId],
  });

  const { data: project } = useQuery<any>({
    queryKey: ["/api/projects", projectId],
  });

  if (docLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-4">
      <div className="space-y-2">
        <Link href={`/projects/${projectId}`}>
          <Button variant="ghost" size="sm" className="-ml-2" data-testid="button-back-to-project">
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back to Project
          </Button>
        </Link>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Paintbrush className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold truncate" data-testid="text-page-title">Colors</h1>
            <p className="text-sm text-muted-foreground truncate">
              {doc?.title || "Proposal"}
              {project?.title ? ` · ${project.title}` : ""}
            </p>
          </div>
        </div>
      </div>
      <ColorsTab projectId={projectId} />
    </div>
  );
}
