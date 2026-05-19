import { useContacts } from "@/hooks/use-contacts";
import { formatPhoneDisplay } from "@/lib/utils";
import { CreateContactDialog } from "@/components/CreateContactDialog";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Search, Mail, Phone, ChevronRight, UserPlus, Filter } from "lucide-react";
import { AddressDisplay } from "@/components/AddressMapLink";
import { useState, useMemo } from "react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

export default function Leads() {
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState("all");
  
  const { data: leads, isLoading } = useContacts({ 
    type: "lead",
    search: search || undefined
  });

  const filteredLeads = useMemo(() => {
    if (!leads) return [];
    if (channelFilter === 'all') return leads;
    return leads.filter(lead => {
      const channel = (lead.metadata as any)?.leadTracking?.sourceChannel;
      if (channelFilter === 'none') return !channel;
      return channel === channelFilter;
    });
  }, [leads, channelFilter]);

  const channelOptions = useMemo(() => {
    if (!leads) return [];
    const channels = new Set<string>();
    let hasNoTracking = false;
    for (const lead of leads) {
      const channel = (lead.metadata as any)?.leadTracking?.sourceChannel;
      if (channel) {
        channels.add(channel);
      } else {
        hasNoTracking = true;
      }
    }
    const opts = Array.from(channels).sort();
    if (hasNoTracking) opts.push('none');
    return opts;
  }, [leads]);

  return (
    <div className="space-y-6 p-6 pb-24 lg:p-8 lg:pb-24 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Leads</h1>
          <p className="text-muted-foreground mt-1">
            {filteredLeads.length} new lead{filteredLeads.length !== 1 ? 's' : ''} waiting for follow-up
          </p>
        </div>
        <CreateContactDialog defaultType="lead" />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 max-w-2xl">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search leads..." 
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search-leads"
          />
        </div>
        {channelOptions.length > 0 && (
          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger className="w-[200px]" data-testid="select-channel-filter">
              <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="All Channels" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Channels</SelectItem>
              {channelOptions.map(ch => (
                <SelectItem key={ch} value={ch}>
                  {ch === 'none' ? 'No Tracking Data' : ch}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : filteredLeads.length === 0 ? (
        <div className="text-center py-16 bg-muted/30 rounded-lg border border-dashed">
          <UserPlus className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-semibold text-lg mb-2">No leads yet</h3>
          <p className="text-muted-foreground mb-4">
            Add your first lead to start tracking potential customers
          </p>
          <CreateContactDialog defaultType="lead" />
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredLeads.map((lead) => (
            <Link key={lead.id} href={`/contacts/${lead.id}`}>
              <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 cursor-pointer group overflow-hidden">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 text-white flex items-center justify-center text-lg font-bold shadow-md shrink-0">
                    {lead.name[0]}
                  </div>
                  
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-lg group-hover:text-primary transition-colors truncate">
                        {lead.name}
                      </h3>
                      {lead.leadSource && (
                        <Badge variant="outline" className="text-xs capitalize shrink-0">
                          {lead.leadSource.replace('_', ' ')}
                        </Badge>
                      )}
                      {(lead.metadata as any)?.leadTracking?.sourceChannel && (
                        <Badge variant="secondary" className="text-xs shrink-0" data-testid={`badge-channel-${lead.id}`}>
                          {(lead.metadata as any).leadTracking.sourceChannel}
                        </Badge>
                      )}
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground mt-1">
                      {lead.email && (
                        <div className="flex items-center gap-1">
                          <Mail className="w-3.5 h-3.5" />
                          <span className="truncate max-w-[180px]">{lead.email}</span>
                        </div>
                      )}
                      {lead.phone && (
                        <div className="flex items-center gap-1">
                          <Phone className="w-3.5 h-3.5" />
                          <span>{formatPhoneDisplay(lead.phone)}</span>
                        </div>
                      )}
                    </div>

                    {(lead.address || lead.city) && (
                      <div className="mt-1">
                        <AddressDisplay
                          address={lead.address}
                          city={lead.city}
                          state={lead.state}
                          zipCode={lead.zipCode}
                          className="text-xs"
                        />
                      </div>
                    )}
                  </div>

                  <div className="text-right shrink-0">
                    {lead.createdAt && (
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(lead.createdAt), "MMM d, yyyy")}
                      </p>
                    )}
                    <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors ml-auto mt-2" />
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
