import { useDocuments, useDeleteDocument } from "@/hooks/use-documents";
import { CreateDocumentWithContactDialog } from "@/components/CreateDocumentWithContactDialog";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, FileText, Search, Trash2, Archive, ArchiveRestore } from "lucide-react";
import { Link, useLocation, useSearch } from "wouter";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState, useMemo, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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

type StatusFilter = 'all' | 'draft' | 'created' | 'sent' | 'viewed' | 'accepted' | 'rejected' | 'paid';

const STATUS_FILTERS_BY_TYPE: Record<string, { value: StatusFilter; label: string }[]> = {
  all: [],
  proposal: [
    { value: 'draft', label: 'Draft' },
    { value: 'sent', label: 'Sent' },
    { value: 'viewed', label: 'Viewed' },
    { value: 'accepted', label: 'Accepted' },
  ],
  estimate: [
    { value: 'draft', label: 'Draft' },
    { value: 'sent', label: 'Sent' },
    { value: 'viewed', label: 'Viewed' },
    { value: 'accepted', label: 'Accepted' },
  ],
  invoice: [
    { value: 'created', label: 'Created' },
    { value: 'draft', label: 'Draft' },
    { value: 'sent', label: 'Sent' },
    { value: 'viewed', label: 'Viewed' },
    { value: 'paid', label: 'Paid' },
  ],
  change_order: [
    { value: 'draft', label: 'Draft' },
    { value: 'sent', label: 'Sent' },
    { value: 'accepted', label: 'Accepted' },
    { value: 'rejected', label: 'Rejected' },
  ],
};

const DOC_TYPE_LABELS: Record<string, string> = {
  all: 'All Documents',
  proposal: 'Proposals',
  estimate: 'Proposals',
  invoice: 'Invoices',
  change_order: 'Change Orders',
};

export default function DocumentsList() {
  const searchString = useSearch();
  const urlParams = new URLSearchParams(searchString);
  const urlType = urlParams.get('type');
  const urlStatus = urlParams.get('status');
  
  const [search, setSearch] = useState("");
  const [deleteDocId, setDeleteDocId] = useState<number | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [docTypeFilter, setDocTypeFilter] = useState<string>(urlType || "all");
  const urlStatusParts = urlStatus?.split(',') || [];
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    urlStatusParts.length > 1 ? "all" : (urlStatusParts[0] as StatusFilter) || "all"
  );
  const { data: documents, isLoading } = useDocuments();
  const { mutate: deleteDocument, isPending: isDeleting } = useDeleteDocument();
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();

  // Sync URL params to state on mount/change
  useEffect(() => {
    if (urlType && urlType !== docTypeFilter) {
      setDocTypeFilter(urlType);
    }
    if (urlStatus) {
      const statuses = urlStatus.split(',');
      if (statuses.length > 1) {
        setStatusFilter('all');
      } else if (statuses.length === 1 && statuses[0] !== statusFilter) {
        setStatusFilter(statuses[0] as StatusFilter);
      }
    }
  }, [searchString]);

  const archiveMutation = useMutation({
    mutationFn: async ({ id, archived }: { id: number; archived: boolean }) => {
      const res = await fetch(`/api/documents/${id}/archive`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ archived }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to archive');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
      toast({ title: showArchived ? "Document restored" : "Document archived" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleTypeChange = (newType: string) => {
    setDocTypeFilter(newType);
    setStatusFilter('all');
  };

  const filteredDocs = useMemo(() => {
    // Check if URL has multi-status filter
    const urlStatuses = urlStatus?.split(',') || [];
    
    return documents?.filter(doc => {
      const matchesSearch = String(doc.id).includes(search) ||
        doc.contact.name.toLowerCase().includes(search.toLowerCase());
      const matchesArchive = showArchived ? doc.archived : !doc.archived;
      const matchesType = docTypeFilter === 'all' || doc.type === docTypeFilter;
      
      let matchesStatus = true;
      if (!showArchived) {
        // If URL has multiple statuses, check against all of them
        if (urlStatuses.length > 1) {
          matchesStatus = urlStatuses.includes(doc.status);
        } else if (statusFilter !== 'all') {
          matchesStatus = doc.status === statusFilter;
        }
      }
      
      return matchesSearch && matchesArchive && matchesType && matchesStatus;
    });
  }, [documents, search, showArchived, docTypeFilter, statusFilter, urlStatus]);

  const docCounts = useMemo(() => {
    return documents?.reduce((acc, doc) => {
      if (!doc.archived) {
        acc[doc.type] = (acc[doc.type] || 0) + 1;
        acc.all = (acc.all || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>) || {};
  }, [documents]);

  const archivedCount = useMemo(() => {
    return documents?.filter(doc => doc.archived).length || 0;
  }, [documents]);

  const statusCounts = useMemo(() => {
    const typeFiltered = documents?.filter(doc => 
      !doc.archived && (docTypeFilter === 'all' || doc.type === docTypeFilter)
    ) || [];
    
    return typeFiltered.reduce((acc, doc) => {
      const status = doc.status;
      acc[status] = (acc[status] || 0) + 1;
      acc.all = (acc.all || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [documents, docTypeFilter]);

  const statusFilters = STATUS_FILTERS_BY_TYPE[docTypeFilter] || [];

  const getStatusBadgeStyle = (status: string) => {
    switch (status) {
      case 'paid':
        return "bg-green-100 text-green-800 border-green-200 dark:bg-green-950 dark:text-green-400 dark:border-green-800";
      case 'accepted':
        return "bg-green-100 text-green-800 border-green-200 dark:bg-green-950 dark:text-green-400 dark:border-green-800";
      case 'sent':
        return "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950 dark:text-orange-400 dark:border-orange-800";
      case 'viewed':
        return "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950 dark:text-purple-400 dark:border-purple-800";
      case 'created':
        return "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-800";
      case 'draft':
        return "bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700";
      case 'rejected':
        return "bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-400 dark:border-red-800";
      default:
        return "";
    }
  };

  const getStatusLabel = (status: string) => {
    return status.toUpperCase();
  };

  return (
    <div className="space-y-4 p-4 pb-24 lg:p-6 lg:pb-24 animate-in fade-in duration-500">
      {/* Compact Header with + button */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-display font-bold text-foreground">Documents</h1>
          <CreateDocumentWithContactDialog onDocumentCreated={(docId) => setLocation(`/documents/${docId}`)} />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={!showArchived ? "default" : "ghost"}
            size="sm"
            onClick={() => { setShowArchived(false); setStatusFilter('all'); }}
            data-testid="tab-active-documents"
          >
            Active {docCounts.all ? `(${docCounts.all})` : ''}
          </Button>
          <Button
            variant={showArchived ? "default" : "ghost"}
            size="sm"
            onClick={() => { setShowArchived(true); setStatusFilter('all'); }}
            data-testid="tab-archived-documents"
          >
            Archived {archivedCount ? `(${archivedCount})` : ''}
          </Button>
        </div>
      </div>

      {/* Two-section filter card */}
      <Card className="p-3">
        <div className="space-y-3">
          {/* Document Type Section */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-primary uppercase tracking-wide min-w-[80px]">Type</span>
            <div className="flex flex-wrap gap-1">
              {['all', 'proposal', 'invoice', 'change_order'].map(type => (
                <Button
                  key={type}
                  variant={docTypeFilter === type ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleTypeChange(type)}
                  data-testid={`tab-${type === 'all' ? 'all-docs' : type === 'change_order' ? 'change-orders' : type + 's'}`}
                >
                  {DOC_TYPE_LABELS[type]} {!showArchived && docCounts[type] ? `(${docCounts[type]})` : ''}
                </Button>
              ))}
            </div>
          </div>

          {/* Stage/Status Section - Only show for active + specific type */}
          {!showArchived && docTypeFilter !== 'all' && statusFilters.length > 0 && (
            <>
              <div className="border-t" />
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-orange-600 dark:text-orange-400 uppercase tracking-wide min-w-[80px]">Stage</span>
                <div className="flex flex-wrap gap-1">
                  <Button
                    variant={statusFilter === 'all' ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setStatusFilter('all')}
                    data-testid="tab-status-all"
                  >
                    All ({statusCounts.all || 0})
                  </Button>
                  {statusFilters.map(filter => (
                    <Button
                      key={filter.value}
                      variant={statusFilter === filter.value ? "secondary" : "ghost"}
                      size="sm"
                      onClick={() => setStatusFilter(filter.value)}
                      data-testid={`tab-status-${filter.value}`}
                    >
                      {filter.label} ({statusCounts[filter.value] || 0})
                    </Button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </Card>

      {/* Search - inline and compact */}
      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input 
          placeholder="Search..." 
          className="pl-9 h-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          data-testid="input-search-documents"
        />
      </div>

      {isLoading && !documents ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : (
        <div className="grid gap-4">
          {filteredDocs?.map((doc) => {
            const canDelete = !['accepted', 'paid'].includes(doc.status);
            return (
              <Card key={doc.id} className="hover:shadow-md transition-shadow overflow-hidden">
                <CardContent className="px-3 py-1 flex items-center justify-between gap-3">
                  <Link href={`/documents/${doc.id}`} className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer">
                    <div className={cn("p-2.5 rounded-lg shrink-0", 
                      doc.type === 'invoice' ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400' : 
                      doc.type === 'proposal' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400' : 
                      doc.type === 'change_order' ? 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400' :
                      'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400'
                    )}>
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="font-bold text-lg truncate">{doc.contact.name}</h4>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className="shrink-0">#{doc.id}</span>
                        {docTypeFilter === 'all' && (
                          <>
                            <span className="shrink-0">•</span>
                            <span className="shrink-0 capitalize">{doc.type.replace('_', ' ')}</span>
                          </>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{doc.createdAt ? format(new Date(doc.createdAt), "MMM d, yyyy") : 'N/A'}</p>
                    </div>
                  </Link>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <p className="font-bold text-base">${(doc.totalAmount / 100).toFixed(2)}</p>
                    <Badge variant="outline" className={cn("text-xs", getStatusBadgeStyle(doc.status))}>
                      {getStatusLabel(doc.status)}
                    </Badge>
                    <div className="flex items-center gap-1 mt-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          archiveMutation.mutate({ id: doc.id, archived: !doc.archived });
                        }}
                        disabled={archiveMutation.isPending}
                        title={doc.archived ? "Restore" : "Archive"}
                        data-testid={`button-archive-doc-${doc.id}`}
                      >
                        {doc.archived ? (
                          <ArchiveRestore className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <Archive className="w-4 h-4 text-muted-foreground" />
                        )}
                      </Button>
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setDeleteDocId(doc.id);
                          }}
                          data-testid={`button-delete-doc-${doc.id}`}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {filteredDocs?.length === 0 && (
            <div className="text-center py-12 text-muted-foreground bg-muted/30 rounded-lg">
              {showArchived 
                ? "No archived documents." 
                : statusFilter !== 'all'
                  ? `No ${statusFilter} ${docTypeFilter !== 'all' ? docTypeFilter.replace('_', ' ') + 's' : 'documents'} found.`
                  : docTypeFilter !== 'all' 
                    ? `No ${docTypeFilter.replace('_', ' ')}s found.`
                    : "No documents found. Create one using the button above."}
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDocId !== null} onOpenChange={(open) => !open && setDeleteDocId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this document? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteDocId) {
                  deleteDocument(deleteDocId, {
                    onSuccess: () => {
                      toast({ title: "Document deleted successfully" });
                      setDeleteDocId(null);
                    },
                    onError: (error) => {
                      toast({ 
                        title: "Failed to delete document", 
                        description: error.message,
                        variant: "destructive" 
                      });
                      setDeleteDocId(null);
                    }
                  });
                }
              }}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete"
            >
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
