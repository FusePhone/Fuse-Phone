import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowLeft, Bug, ChevronDown, ChevronUp, Trash2, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { useLocation } from "wouter";
import { useSafeBack } from "@/hooks/use-safe-back";
import { useState, useEffect } from "react";

interface DebugNotification {
  id: number;
  type: string;
  title: string;
  message: string;
  metadata: {
    source: string;
    eventType: string;
    negotiationId: string;
    fullRaw: string;
  } | null;
  readAt: string | null;
  createdAt: string;
}

export default function DebugLeads() {
  const [, setLocation] = useLocation();
  const handleBack = useSafeBack("/settings/company");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const highlightId = params.get('id');
    if (highlightId) {
      setExpandedId(parseInt(highlightId));
      setTimeout(() => {
        const el = document.getElementById(`debug-lead-${highlightId}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    }
  }, []);

  const { data: debugNotifications, isLoading } = useQuery<DebugNotification[]>({
    queryKey: ['/api/notifications/debug-leads'],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/notifications/${id}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/debug-leads'] });
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
    },
  });

  const formatRawData = (raw: string) => {
    try {
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      return raw;
    }
  };

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleBack}
          data-testid="button-back-settings"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-2">
          <Bug className="w-6 h-6 text-amber-500" />
          <h1 className="text-2xl font-bold" data-testid="text-debug-leads-title">Debug Leads</h1>
        </div>
        <Badge variant="outline" className="ml-2">
          {debugNotifications?.length || 0} entries
        </Badge>
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        Raw webhook data from Thumbtack lead events. Click any entry to view the full payload.
      </p>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : !debugNotifications?.length ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No debug lead data yet. Thumbtack webhook events will appear here.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {debugNotifications.map((notif) => {
            const isExpanded = expandedId === notif.id;
            const eventType = notif.metadata?.eventType || 'unknown';
            const negotiationId = notif.metadata?.negotiationId || '';
            const fullRaw = notif.metadata?.fullRaw || notif.message;

            return (
              <Card
                key={notif.id}
                id={`debug-lead-${notif.id}`}
                className={`transition-all ${isExpanded ? 'ring-2 ring-amber-400/50' : ''} ${!notif.readAt ? 'border-amber-300 bg-amber-50/30 dark:bg-amber-950/10' : ''}`}
                data-testid={`card-debug-lead-${notif.id}`}
              >
                <CardHeader
                  className="cursor-pointer py-3 px-4"
                  onClick={() => setExpandedId(isExpanded ? null : notif.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Badge
                        variant={eventType.includes('Message') ? 'secondary' : 'default'}
                        className="text-[10px] shrink-0"
                        data-testid={`badge-event-type-${notif.id}`}
                      >
                        {eventType}
                      </Badge>
                      {!notif.readAt && (
                        <Badge variant="destructive" className="text-[10px] shrink-0">New</Badge>
                      )}
                      <span className="text-xs text-muted-foreground truncate">
                        {negotiationId ? `ID: ${negotiationId}` : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(notif.createdAt), 'MMM d, h:mm a')}
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                  <CardTitle className="text-sm font-medium mt-1 truncate" data-testid={`text-debug-title-${notif.id}`}>
                    {notif.title.replace('[Debug] ', '')}
                  </CardTitle>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="pt-0 px-4 pb-4">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>Notification ID: {notif.id}</span>
                        <span>|</span>
                        <span>Received: {format(new Date(notif.createdAt), 'PPpp')}</span>
                      </div>

                      <div>
                        <h4 className="text-xs font-semibold mb-1 text-muted-foreground uppercase tracking-wider">Raw Webhook Payload</h4>
                        <pre
                          className="bg-muted/50 dark:bg-muted/20 rounded-lg p-3 text-xs overflow-x-auto max-h-[500px] overflow-y-auto whitespace-pre-wrap break-all font-mono"
                          data-testid={`pre-raw-data-${notif.id}`}
                        >
                          {formatRawData(fullRaw)}
                        </pre>
                      </div>

                      <div className="flex items-center gap-2 pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(formatRawData(fullRaw));
                          }}
                          data-testid={`button-copy-raw-${notif.id}`}
                        >
                          Copy Raw Data
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteMutation.mutate(notif.id);
                          }}
                          data-testid={`button-dismiss-${notif.id}`}
                        >
                          <Trash2 className="w-3 h-3 mr-1" />
                          Mark Read
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
