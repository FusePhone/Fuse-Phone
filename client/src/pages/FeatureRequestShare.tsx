import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lightbulb } from "lucide-react";

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  submitted:   { label: "Submitted",   className: "bg-blue-100 text-blue-700" },
  reviewing:   { label: "Reviewing",   className: "bg-amber-100 text-amber-700" },
  planned:     { label: "Planned",     className: "bg-purple-100 text-purple-700" },
  in_progress: { label: "In Progress", className: "bg-indigo-100 text-indigo-700" },
  completed:   { label: "Completed",   className: "bg-emerald-100 text-emerald-700" },
  declined:    { label: "Declined",    className: "bg-zinc-100 text-zinc-700" },
};

export default function FeatureRequestShare() {
  const { token } = useParams<{ token: string }>();
  const { data, isLoading, error } = useQuery<any>({
    queryKey: ["/api/feature-requests/share", token],
    queryFn: async () => {
      const res = await fetch(`/api/feature-requests/share/${token}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
  });

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading…</div>;
  if (error || !data) return <div className="p-8 text-center text-muted-foreground">Request not found.</div>;

  const status = STATUS_LABELS[data.status] || STATUS_LABELS.submitted;
  const created = new Date(data.createdAt).toLocaleDateString();

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Lightbulb className="w-4 h-4 text-amber-500" />
          Feature Request
        </div>
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <CardTitle data-testid="text-share-title">{data.title}</CardTitle>
                {data.location && (
                  <p className="text-xs text-muted-foreground mt-1">In: <span className="font-medium">{data.location}</span></p>
                )}
              </div>
              <Badge className={status.className}>{status.label}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm whitespace-pre-wrap">{data.description}</p>
            {data.imageUrls && data.imageUrls.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {data.imageUrls.map((u: string, i: number) => (
                  <a key={i} href={u} target="_blank" rel="noreferrer" className="block aspect-square rounded-md overflow-hidden border bg-muted">
                    <img src={u} alt="" className="w-full h-full object-cover" />
                  </a>
                ))}
              </div>
            )}
            {data.videoUrl && (
              <video src={data.videoUrl} controls className="w-full rounded-md border" />
            )}
            <p className="text-xs text-muted-foreground pt-2 border-t">Submitted {created}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
