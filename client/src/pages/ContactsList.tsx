import { useContacts } from "@/hooks/use-contacts";
import { isCapacitorNative } from "@/lib/iap";
import { CreateContactDialog, type AiPrefillData } from "@/components/CreateContactDialog";
import { CSVImportDialog } from "@/components/CSVImportDialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Search, Phone, MessageSquare, Trash2, Download, UserCheck, ChevronRight, CheckSquare, Archive, ArchiveRestore } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { FeatureTipBanner } from "@/components/FeatureTipBanner";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useDemoMode } from "@/contexts/DemoModeContext";
import { useCompanySettings } from "@/hooks/use-company-settings";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function ContactsList() {
  const [filterType, setFilterType] = useState<"lead" | "contact" | "client" | "all">("all");
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const { maskName, maskPhone, maskEmail } = useDemoMode();
  const { data: companySettings } = useCompanySettings();

  const aiActionId = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('ai_action');
  }, [location]);

  const { data: aiActionData } = useQuery<any>({
    queryKey: [`/api/ai-actions/${aiActionId}`],
    enabled: !!aiActionId,
  });

  const [aiAutoOpenHandled, setAiAutoOpenHandled] = useState(false);
  const aiPrefill: AiPrefillData | null = aiActionData?.details ? aiActionData.details as AiPrefillData : null;

  const userTier = user?.subscriptionTier || 'starter';
  const isElite = userTier === 'elite';
  const isOpenPhoneProvider = companySettings?.phoneProvider === 'openphone';
  const isOpenPhoneConfigured = isOpenPhoneProvider && !!companySettings?.openphonePhoneNumber;
  const isTwilioConfigured = !isOpenPhoneProvider && !!companySettings?.twilioAccountSid && !!companySettings?.twilioAuthToken && !!companySettings?.twilioPhoneNumber;
  const hasInAppPhone = isElite && (isTwilioConfigured || isOpenPhoneConfigured);

  const { data: contacts, isLoading } = useContacts({
    type: filterType === "all" ? undefined : filterType,
    search: search || undefined,
    archived: showArchived,
  });

  const { data: archivedContacts } = useContacts({ archived: true });
  const archivedCount = archivedContacts?.length || 0;

  useEffect(() => {
    setSelectedIds(new Set());
  }, [filterType, search]);

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (!contacts) return;
    if (selectedIds.size === contacts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(contacts.map(c => c.id)));
    }
  };

  const exitBulkMode = () => {
    setBulkMode(false);
    setSelectedIds(new Set());
  };

  const bulkUpdateType = useMutation({
    mutationFn: async (type: string) => {
      await apiRequest('POST', '/api/contacts/bulk-update-type', {
        contactIds: Array.from(selectedIds),
        type,
      });
    },
    onSuccess: (_, type) => {
      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
      toast({ title: `Updated ${selectedIds.size} contact(s) to ${type}` });
      exitBulkMode();
    },
  });

  const bulkDelete = useMutation({
    mutationFn: async () => {
      await apiRequest('POST', '/api/contacts/bulk-delete', {
        contactIds: Array.from(selectedIds),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
      toast({ title: `Deleted ${selectedIds.size} contact(s)` });
      exitBulkMode();
    },
  });

  const handleExport = async () => {
    try {
      const res = await fetch('/api/contacts/export-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactIds: selectedIds.size > 0 ? Array.from(selectedIds) : [] }),
        credentials: 'include',
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'contacts.csv';
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'Contacts exported' });
    } catch {
      toast({ title: 'Export failed', variant: 'destructive' });
    }
  };

  const allSelected = contacts && contacts.length > 0 && selectedIds.size === contacts.length;

  return (
    <div className="space-y-6 p-4 pb-24 lg:p-8 lg:pb-24 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground" data-testid="text-contacts-title">Contacts</h1>
          <p className="text-muted-foreground mt-1">Manage your leads and clients</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <CSVImportDialog />
          <CreateContactDialog 
            aiPrefill={aiPrefill}
            autoOpen={!!aiActionId && !!aiPrefill && !aiAutoOpenHandled}
            onAutoOpenHandled={() => setAiAutoOpenHandled(true)}
            aiActionId={aiActionId}
          />
        </div>
      </div>

      <FeatureTipBanner
        id="contacts-getting-started"
        title="Build Your Contact List"
        description="Add contacts manually or import them from a CSV. When a lead converts, they automatically become a client."
      />

      <div className="flex gap-2 border-b">
        <Button
          variant={!showArchived ? "default" : "ghost"}
          size="sm"
          className="rounded-b-none"
          onClick={() => { setShowArchived(false); setSearch(""); setFilterType("all"); }}
          data-testid="tab-active-contacts"
        >
          Active
        </Button>
        <Button
          variant={showArchived ? "default" : "ghost"}
          size="sm"
          className="rounded-b-none"
          onClick={() => { setShowArchived(true); setSearch(""); setFilterType("all"); }}
          data-testid="tab-archived-contacts"
        >
          <Archive className="w-4 h-4 mr-1" />
          Archived {archivedCount > 0 ? `(${archivedCount})` : ''}
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, or phone..."
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search-contacts"
          />
        </div>
        <div className="flex gap-2">
          <Select
            value={filterType}
            onValueChange={(val) => setFilterType(val as any)}
          >
            <SelectTrigger className="w-[140px]" data-testid="select-filter-type">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="lead">Leads</SelectItem>
              <SelectItem value="contact">Contacts</SelectItem>
              <SelectItem value="client">Clients</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant={bulkMode ? "default" : "outline"}
            size="sm"
            onClick={() => bulkMode ? exitBulkMode() : setBulkMode(true)}
            data-testid="button-bulk-mode"
          >
            <CheckSquare className="w-4 h-4 mr-1" />
            {bulkMode ? "Cancel" : "Select"}
          </Button>
        </div>
      </div>

      {bulkMode && selectedIds.size > 0 && (
        <div className="flex items-center gap-2 flex-wrap bg-muted/50 border rounded-lg p-3" data-testid="bulk-actions-bar">
          <span className="text-sm font-medium mr-2" data-testid="text-selected-count">{selectedIds.size} selected</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" data-testid="button-bulk-change-type">
                <UserCheck className="w-4 h-4 mr-1" />
                Change Type
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => bulkUpdateType.mutate('lead')} data-testid="menu-set-lead">
                Set as Lead
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => bulkUpdateType.mutate('contact')} data-testid="menu-set-contact">
                Set as Contact
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => bulkUpdateType.mutate('client')} data-testid="menu-set-client">
                Set as Client
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="sm" onClick={handleExport} data-testid="button-bulk-export">
            <Download className="w-4 h-4 mr-1" />
            Export
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setShowDeleteConfirm(true)}
            data-testid="button-bulk-delete"
          >
            <Trash2 className="w-4 h-4 mr-1" />
            Delete
          </Button>
        </div>
      )}

      {isLoading && !contacts ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-2">
          {bulkMode && contacts && contacts.length > 0 && (
            <Button
              variant="link"
              size="sm"
              onClick={selectAll}
              className="px-0 h-auto text-sm"
              data-testid="button-select-all"
            >
              {allSelected ? "Deselect all" : "Select all"}
            </Button>
          )}

          {contacts?.map((contact) => (
            <div
              key={contact.id}
              className="flex items-center gap-3 bg-card border rounded-xl px-4 py-3 hover:shadow-md hover:border-primary/20 transition-all duration-200 group"
              data-testid={`card-contact-${contact.id}`}
            >
              {bulkMode && (
                <Checkbox
                  checked={selectedIds.has(contact.id)}
                  onCheckedChange={() => toggleSelect(contact.id)}
                  data-testid={`checkbox-contact-${contact.id}`}
                />
              )}

              <Link
                href={`/contacts/${contact.id}`}
                className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
              >
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/80 text-primary-foreground flex items-center justify-center text-sm font-bold shadow-sm flex-shrink-0">
                  {maskName(contact.name)?.[0]?.toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm truncate group-hover:text-primary transition-colors" data-testid={`text-contact-name-${contact.id}`}>
                      {maskName(contact.name)}
                    </span>
                    <Badge
                      variant={contact.type === 'lead' ? 'secondary' : contact.type === 'contact' ? 'outline' : 'default'}
                      className="text-[10px] px-1.5 py-0 h-4 flex-shrink-0"
                    >
                      {contact.type?.toUpperCase()}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {maskPhone(contact.phone) || maskEmail(contact.email) || 'No contact info'}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0 hidden sm:block" />
              </Link>

              {!bulkMode && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  {contact.phone && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (hasInAppPhone) {
                          setLocation(`/calls?dial=${encodeURIComponent(contact.phone)}&contactId=${contact.id}`);
                        } else {
                          window.location.href = `tel:${contact.phone}`;
                        }
                      }}
                      className="w-9 h-9 rounded-full bg-green-500 hover:bg-green-600 text-white flex items-center justify-center transition-colors"
                      data-testid={`button-call-${contact.id}`}
                      title="Call"
                    >
                      <Phone className="w-4 h-4" />
                    </button>
                  )}
                  {contact.phone && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (hasInAppPhone) {
                          setLocation(`/messages?contactId=${contact.id}`);
                        } else {
                          window.location.href = `sms:${contact.phone}`;
                        }
                      }}
                      className="w-9 h-9 rounded-full bg-blue-500 hover:bg-blue-600 text-white flex items-center justify-center transition-colors"
                      data-testid={`button-text-${contact.id}`}
                      title="Text"
                    >
                      <MessageSquare className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}

          {contacts?.length === 0 && (
            <div className="text-center py-12 text-muted-foreground bg-muted/30 rounded-lg border border-dashed" data-testid="text-no-contacts">
              No contacts found matching your filters.
            </div>
          )}
        </div>
      )}

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} contact(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the selected contacts along with their associated projects and documents. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => bulkDelete.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {bulkDelete.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
