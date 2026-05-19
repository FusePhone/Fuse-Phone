import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Map, Plus, Trash2, RefreshCw, Check, X, Eye, FileText,
  Settings as SettingsIcon, History, Globe, Sparkles, BarChart3,
  ChevronDown, ChevronUp, MapPin, Loader2, Upload, Image, AlertTriangle, Shield,
  Link, Unlink, Facebook, Instagram, Pencil, Save, HelpCircle, Info, Zap,
  Monitor, Smartphone, Crown, Home, Wrench, MapPinned, Maximize2, Download, User, Users
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { GamePlanTargetCity, GamePlanQueueItem, GamePlanSettings, GamePlanHistoryEntry, GamePlanImageSlots, GamePlanCityProject } from "@shared/schema";

type TabId = 'dashboard' | 'service_areas' | 'cities' | 'queue' | 'generator' | 'settings' | 'history' | 'projects';

export default function GamePlan() {
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab && ['dashboard', 'queue', 'settings', 'history', 'projects'].includes(tab)) {
      return tab as TabId;
    }
    return 'dashboard';
  });

  const tabs: { id: TabId; label: string; icon: any }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { id: 'queue', label: 'Queue', icon: FileText },
    { id: 'projects', label: 'Projects', icon: Wrench },
    { id: 'settings', label: 'Settings', icon: SettingsIcon },
    { id: 'history', label: 'History', icon: History },
  ];

  return (
    <div className="flex flex-col h-full" data-testid="gameplan-page">
      <div className="border-b px-4 py-3 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Map className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">GamePlan</h1>
        </div>
        <Badge variant="outline" className="text-xs">SEO & Content</Badge>
      </div>
      <div className="border-b px-2 flex gap-1 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            data-testid={`tab-${tab.id}`}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-primary text-primary font-medium'
                : 'border-transparent text-muted-foreground hover-elevate'
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto p-4">
        {activeTab === 'dashboard' && <DashboardTab />}
        {activeTab === 'queue' && <QueueTab />}
        {activeTab === 'projects' && <ProjectsTab />}
        {activeTab === 'settings' && <SettingsTab />}
        {activeTab === 'history' && <HistoryTab />}
      </div>
    </div>
  );
}

function DashboardTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [siteData, setSiteData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [activeSection, setActiveSection] = useState<'location' | 'service' | 'blog' | 'other'>('location');
  const [searchTerm, setSearchTerm] = useState('');

  const fetchSiteOverview = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/gameplan/site-overview', { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load site overview');
      setSiteData(data);
    } catch (err: any) {
      toast({ title: "Could not load site data", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSiteOverview();
  }, []);

  const wpImportMutation = useMutation({
    mutationFn: async (wpPageId: number) => {
      const res = await fetch('/api/admin/gameplan/wp-import', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wpPageId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/gameplan/queue'] });
      toast({ title: "Page imported to Queue!", description: data.message });
      fetchSiteOverview();
    },
    onError: (err: any) => toast({ title: "Import failed", description: err.message, variant: "destructive" }),
  });

  const seoCheckMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/gameplan/queue/${id}/calculate-seo`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'SEO check failed');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/gameplan/queue'] });
      toast({ title: "SEO check completed" });
      fetchSiteOverview();
    },
    onError: (err: any) => toast({ title: "SEO check failed", description: err.message, variant: "destructive" }),
  });

  if (loading && !siteData) {
    return (
      <div className="flex items-center justify-center py-12" data-testid="dashboard-tab">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mr-2" />
        <span className="text-sm text-muted-foreground">Loading your website pages...</span>
      </div>
    );
  }

  if (siteData && !siteData.synced) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4" data-testid="dashboard-tab">
        <Globe className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Connect Your Website</h2>
        <p className="text-sm text-muted-foreground text-center max-w-md">
          Go to Settings and add your WordPress credentials to get started. Once connected, all your pages will show up here.
        </p>
      </div>
    );
  }

  const stats = siteData?.stats || {};
  const groups = siteData?.groups || {};
  const currentPages: any[] = groups[activeSection] || [];
  const filtered = searchTerm
    ? currentPages.filter((p: any) => p.title.toLowerCase().includes(searchTerm.toLowerCase()) || p.slug.toLowerCase().includes(searchTerm.toLowerCase()))
    : currentPages;

  const sectionTabs = [
    { id: 'location' as const, label: 'Location Pages', count: stats.locationCount || 0, icon: MapPin },
    { id: 'service' as const, label: 'Service & Main', count: stats.serviceCount || 0, icon: Wrench },
    { id: 'blog' as const, label: 'Blog Posts', count: stats.blogCount || 0, icon: FileText },
    { id: 'other' as const, label: 'Other', count: stats.otherCount || 0, icon: Globe },
  ];

  const scoreColor = (s: number | null) => {
    if (s === null) return 'text-muted-foreground';
    if (s >= 70) return 'text-green-600';
    if (s >= 40) return 'text-yellow-600';
    return 'text-red-600';
  };

  const scoreBg = (s: number | null) => {
    if (s === null) return 'bg-muted';
    if (s >= 70) return 'bg-green-500';
    if (s >= 40) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const avgScore = stats.avgSeoScore || 0;

  return (
    <div className="space-y-4 max-w-4xl" data-testid="dashboard-tab">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Your Website</h2>
          <p className="text-xs text-muted-foreground">{stats.totalPages || 0} pages on your site</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={fetchSiteOverview}
          disabled={loading}
          data-testid="button-refresh-site"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Total Pages</p>
            <p className="text-2xl font-bold">{stats.totalPages || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">In Queue</p>
            <p className="text-2xl font-bold">{stats.inQueueCount || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">SEO Scored</p>
            <p className="text-2xl font-bold">{stats.scoredCount || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Avg SEO Score</p>
            <p className={`text-2xl font-bold ${scoreColor(avgScore || null)}`}>{avgScore || '—'}</p>
            {avgScore > 0 && (
              <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden mt-1">
                <div className={`h-full rounded-full ${scoreBg(avgScore)}`} style={{ width: `${Math.min(avgScore, 100)}%` }} />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-1 border-b overflow-x-auto">
        {sectionTabs.map(tab => (
          <button
            key={tab.id}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap border-b-2 transition-colors ${
              activeSection === tab.id
                ? 'border-primary text-primary font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveSection(tab.id)}
            data-testid={`section-tab-${tab.id}`}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
            <span className="text-xs bg-muted px-1.5 py-0.5 rounded-full">{tab.count}</span>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Input
          placeholder="Search pages..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="max-w-xs h-8 text-sm"
          data-testid="input-search-pages"
        />
        <span className="text-xs text-muted-foreground">{filtered.length} pages</span>
      </div>

      <div className="space-y-2">
        {filtered.map((page: any) => (
          <Card key={`${page.wpType}-${page.wpId}`} className="hover:border-primary/30 transition-colors" data-testid={`page-card-${page.wpId}`}>
            <CardContent className="p-3">
              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                <span className="font-medium text-sm break-words" dangerouslySetInnerHTML={{ __html: page.title }} />
                <Badge variant={page.wpStatus === 'publish' ? 'default' : 'secondary'} className="text-[10px] shrink-0">
                  {page.wpStatus === 'publish' ? 'Live' : page.wpStatus}
                </Badge>
                {page.inQueue && (
                  <Badge variant="outline" className="text-[10px] shrink-0 border-blue-500/30 text-blue-600">
                    In Queue
                  </Badge>
                )}
                {page.seoScore !== null && (
                  <span className={`text-xs font-bold ${scoreColor(page.seoScore)}`} data-testid={`seo-score-${page.wpId}`}>
                    SEO: {page.seoScore}
                  </span>
                )}
                {page.inQueue && page.queueId && (
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {page.queueStatus}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-muted-foreground break-all">/{page.slug}</span>
                {page.modified && (
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    Updated {new Date(page.modified).toLocaleDateString()}
                  </span>
                )}
              </div>
              {page.excerpt && (
                <p className="text-xs text-muted-foreground mb-1 break-words line-clamp-2" dangerouslySetInnerHTML={{ __html: page.excerpt }} />
              )}
              {page.link && (
                <a href={page.link} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline mb-1.5 block break-all" data-testid={`link-page-${page.wpId}`}>
                  {page.link}
                </a>
              )}
              <div className="flex items-center gap-2 mt-2">
                {page.inQueue && page.queueId ? (
                  <>
                    {page.seoScore === null && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => seoCheckMutation.mutate(page.queueId)}
                        disabled={seoCheckMutation.isPending}
                        data-testid={`button-seo-${page.wpId}`}
                      >
                        {seoCheckMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Shield className="h-3 w-3 mr-1" />}
                        SEO Check
                      </Button>
                    )}
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => wpImportMutation.mutate(page.wpId)}
                    disabled={wpImportMutation.isPending}
                    data-testid={`button-import-${page.wpId}`}
                  >
                    {wpImportMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3 mr-1" />}
                    Import & Edit
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            {searchTerm ? 'No pages match your search.' : 'No pages in this category.'}
          </p>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold mt-1">{value}</p>
        <p className="text-xs text-muted-foreground mt-1">{sub}</p>
      </CardContent>
    </Card>
  );
}

function ServiceAreasTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [marketFilter, setMarketFilter] = useState<string>('all');
  const [expandedArea, setExpandedArea] = useState<number | null>(null);
  const [photoPickerCityId, setPhotoPickerCityId] = useState<number | null>(null);

  const { data, isLoading } = useQuery<any>({ queryKey: ['/api/admin/gameplan/service-areas'] });

  const { data: photosData, isLoading: photosLoading } = useQuery<any>({
    queryKey: ['/api/admin/gameplan/project-photos', photoPickerCityId],
    queryFn: async () => {
      const url = photoPickerCityId ? `/api/admin/gameplan/project-photos?cityId=${photoPickerCityId}` : '/api/admin/gameplan/project-photos';
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load photos');
      return res.json();
    },
    enabled: photoPickerCityId !== null,
  });

  const wpSyncMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/admin/gameplan/wp-sync', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sync failed');
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/gameplan/service-areas'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/gameplan/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/gameplan/cities'] });
      toast({ title: `WordPress synced`, description: `${data.synced} page(s) updated` });
    },
    onError: (err: any) => toast({ title: "Sync failed", description: err.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const areas = data?.areas || [];
  const notifications = data?.notifications || [];
  const summary = data?.summary || {};

  const filtered = marketFilter === 'all' ? areas : areas.filter((a: any) => a.market === marketFilter);

  const freshnessColor = (f: string) => {
    if (f === 'missing') return 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20';
    if (f === 'stale') return 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20';
    return 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20';
  };

  const freshnessLabel = (f: string) => {
    if (f === 'missing') return 'No Page';
    if (f === 'stale') return 'Needs Update';
    return 'Fresh';
  };

  const severityIcon = (s: string) => {
    if (s === 'action') return <Zap className="h-4 w-4 text-primary shrink-0" />;
    if (s === 'warning') return <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />;
    return <Info className="h-4 w-4 text-muted-foreground shrink-0" />;
  };

  return (
    <div className="space-y-4 max-w-5xl" data-testid="service-areas-tab">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border">
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold" data-testid="text-total-areas">{summary.total || 0}</div>
            <div className="text-xs text-muted-foreground">Total Areas</div>
          </CardContent>
        </Card>
        <Card className="border border-green-500/20">
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold text-green-700 dark:text-green-400" data-testid="text-fresh-count">{summary.fresh || 0}</div>
            <div className="text-xs text-muted-foreground">Fresh Pages</div>
          </CardContent>
        </Card>
        <Card className="border border-amber-500/20">
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold text-amber-700 dark:text-amber-400" data-testid="text-stale-count">{summary.stale || 0}</div>
            <div className="text-xs text-muted-foreground">Need Update</div>
          </CardContent>
        </Card>
        <Card className="border border-red-500/20">
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold text-red-700 dark:text-red-400" data-testid="text-missing-count">{summary.missing || 0}</div>
            <div className="text-xs text-muted-foreground">Missing Pages</div>
          </CardContent>
        </Card>
      </div>

      {notifications.length > 0 && (
        <Card className="border" data-testid="service-area-notifications">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Action Items ({notifications.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 space-y-2">
            {notifications.slice(0, 8).map((n: any, i: number) => (
              <div key={i} className="flex items-start gap-2 text-sm py-1.5 border-b last:border-0" data-testid={`notification-${i}`}>
                {severityIcon(n.severity)}
                <span className="flex-1">{n.message}</span>
                <Badge variant="outline" className="text-[10px] shrink-0">{n.city}</Badge>
              </div>
            ))}
            {notifications.length > 8 && (
              <div className="text-xs text-muted-foreground text-center pt-1">+{notifications.length - 8} more</div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <Select value={marketFilter} onValueChange={setMarketFilter}>
          <SelectTrigger className="w-40" data-testid="select-market-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Markets</SelectItem>
            <SelectItem value="NASSAU">Nassau</SelectItem>
            <SelectItem value="BROOKLYN">Brooklyn</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{filtered.length} service area(s)</span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => wpSyncMutation.mutate()}
          disabled={wpSyncMutation.isPending}
          data-testid="button-service-areas-wp-sync"
        >
          {wpSyncMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
          Sync WordPress
        </Button>
        <span className="text-xs text-muted-foreground ml-auto">Pages older than {summary.staleDays || 21} days are flagged for refresh</span>
      </div>

      <div className="space-y-2">
        {filtered.map((area: any) => (
          <Card key={area.id} className={`border transition-colors ${area.freshness === 'missing' ? 'border-red-500/20' : area.freshness === 'stale' ? 'border-amber-500/20' : ''}`} data-testid={`service-area-card-${area.id}`}>
            <CardContent className="p-3">
              <div
                className="flex items-center gap-3 cursor-pointer"
                onClick={() => setExpandedArea(expandedArea === area.id ? null : area.id)}
                data-testid={`button-expand-area-${area.id}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{area.city}, {area.state}</span>
                    <Badge variant="outline" className="text-[10px]">{area.market}</Badge>
                    <Badge className={`text-[10px] border ${freshnessColor(area.freshness)}`}>{freshnessLabel(area.freshness)}</Badge>
                    {area.hasNewProjects && area.freshness !== 'missing' && (
                      <Badge className="text-[10px] bg-primary/10 text-primary border-primary/20">New Projects</Badge>
                    )}
                    {area.needsUpdate && (
                      <Badge className="text-[10px] bg-orange-500/10 text-orange-600 border-orange-500/20">Needs Update</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                    <span>{area.completedProjects} completed project{area.completedProjects !== 1 ? 's' : ''}</span>
                    {area.lastPublishedAt && (
                      <span>Updated {area.daysSinceUpdate === 0 ? 'today' : `${area.daysSinceUpdate}d ago`}</span>
                    )}
                    {area.wpPageUrl && (
                      <a href={area.wpPageUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline" onClick={e => e.stopPropagation()}>
                        <Globe className="h-3 w-3" />
                        View Page
                      </a>
                    )}
                  </div>
                </div>
                {expandedArea === area.id ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
              </div>

              {expandedArea === area.id && (
                <div className="mt-3 pt-3 border-t space-y-3" data-testid={`area-details-${area.id}`}>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div>
                      <span className="text-muted-foreground">ZIP Codes</span>
                      <div className="font-medium mt-0.5">{area.zipCodes?.join(', ') || '—'}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Services</span>
                      <div className="font-medium mt-0.5">{area.serviceTypes?.join(', ') || '—'}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Page Status</span>
                      <div className="font-medium mt-0.5 capitalize">{area.pageStatus?.replace(/_/g, ' ') || 'Not created'}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Last Published</span>
                      <div className="font-medium mt-0.5">{area.lastPublishedAt ? new Date(area.lastPublishedAt).toLocaleDateString() : 'Never'}</div>
                    </div>
                  </div>

                  {area.needsUpdate && area.updateNotes && (
                    <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-md px-3 py-2 text-xs">
                      <span className="font-medium text-orange-700 dark:text-orange-400">Update needed:</span>
                      <span className="ml-1 text-orange-600 dark:text-orange-300">{area.updateNotes}</span>
                    </div>
                  )}

                  {area.recentProjects?.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-1.5">Recent Completed Projects</div>
                      <div className="space-y-1.5">
                        {area.recentProjects.map((p: any) => (
                          <div key={p.id} className="flex items-center gap-2 text-xs bg-muted/30 rounded-md px-2.5 py-1.5" data-testid={`project-row-${p.id}`}>
                            <Check className="h-3 w-3 text-green-600 shrink-0" />
                            <span className="font-medium truncate flex-1">{p.title}</span>
                            {p.contactName && <span className="text-muted-foreground truncate">{p.contactName}</span>}
                            {p.totalAmount && <span className="text-muted-foreground">${(p.totalAmount / 100).toLocaleString()}</span>}
                            {p.completedAt && <span className="text-muted-foreground">{new Date(p.completedAt).toLocaleDateString()}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {area.freshness === 'missing' && area.completedProjects > 0 && (
                    <div className="flex items-center gap-2 p-2 bg-primary/5 border border-primary/20 rounded-md text-xs">
                      <Zap className="h-4 w-4 text-primary shrink-0" />
                      <span className="flex-1">You have {area.completedProjects} completed project(s) in {area.city} — create a service area page to showcase this work and boost local SEO.</span>
                    </div>
                  )}

                  {area.isStale && area.hasNewProjects && (
                    <div className="flex items-center gap-2 p-2 bg-amber-500/5 border border-amber-500/20 rounded-md text-xs">
                      <RefreshCw className="h-4 w-4 text-amber-600 shrink-0" />
                      <span className="flex-1">This page is {area.daysSinceUpdate} days old and you have new project(s) to feature. Regenerate with a project showcase to keep content fresh.</span>
                    </div>
                  )}

                  <div className="pt-2 border-t">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setPhotoPickerCityId(photoPickerCityId === area.id ? null : area.id)}
                      data-testid={`button-photos-${area.id}`}
                    >
                      <Image className="h-4 w-4 mr-1" />
                      {photoPickerCityId === area.id ? 'Hide' : 'Browse'} Project Photos
                    </Button>

                    {photoPickerCityId === area.id && (
                      <div className="mt-3 space-y-3" data-testid={`photos-panel-${area.id}`}>
                        {photosLoading ? (
                          <div className="flex items-center justify-center py-4">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                          </div>
                        ) : !photosData?.projectPhotos?.length ? (
                          <p className="text-xs text-muted-foreground py-2">No project photos found for {area.city}. Complete a project in this area and upload photos to use them here.</p>
                        ) : (
                          photosData.projectPhotos.map((proj: any) => (
                            <div key={proj.projectId} className="border rounded-md p-2 space-y-2">
                              <div className="flex items-center gap-2 text-xs">
                                <Check className="h-3 w-3 text-green-600 shrink-0" />
                                <span className="font-medium">{proj.projectTitle}</span>
                                <span className="text-muted-foreground">{proj.jobCity}</span>
                                <span className="text-muted-foreground ml-auto">{proj.photos.length} photo(s)</span>
                              </div>
                              <div className="flex gap-2 overflow-x-auto pb-1">
                                {proj.photos.slice(0, 8).map((photo: any) => (
                                  <div key={photo.id} className="shrink-0 group relative" data-testid={`photo-${photo.id}`}>
                                    <img
                                      src={photo.url}
                                      alt={photo.caption || photo.fileName}
                                      className="w-20 h-20 object-cover rounded-md border cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                                      onClick={async () => {
                                        const fullUrl = window.location.origin + photo.url;
                                        const { copyToClipboard } = await import("@/lib/clipboard");
                                        await copyToClipboard(fullUrl);
                                        toast({ title: "Photo URL copied", description: "Paste this URL in the image slot when creating a page for this area." });
                                      }}
                                    />
                                    {photo.caption && (
                                      <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] px-1 py-0.5 truncate rounded-b-md">{photo.caption}</span>
                                    )}
                                  </div>
                                ))}
                                {proj.photos.length > 8 && (
                                  <div className="shrink-0 w-20 h-20 flex items-center justify-center bg-muted rounded-md border text-xs text-muted-foreground">
                                    +{proj.photos.length - 8}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}

        {filtered.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm" data-testid="text-no-areas">
            No service areas found. Add cities in the Cities tab first.
          </div>
        )}
      </div>
    </div>
  );
}

function CitiesTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [marketFilter, setMarketFilter] = useState<string>('all');
  const [showAdd, setShowAdd] = useState(false);
  const [newCity, setNewCity] = useState({ city: '', market: 'NASSAU', state: 'NY', zipCodes: '', serviceTypes: 'Interior Painting,Cabinet Painting,Color Consultation' });
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: cities = [], isLoading } = useQuery<GamePlanTargetCity[]>({
    queryKey: ['/api/admin/gameplan/cities', marketFilter],
    queryFn: async () => {
      const url = marketFilter !== 'all' ? `/api/admin/gameplan/cities?market=${marketFilter}` : '/api/admin/gameplan/cities';
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch cities');
      return res.json();
    },
  });

  const seedMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/admin/gameplan/seed-cities'),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/admin/gameplan/cities'] }); queryClient.invalidateQueries({ queryKey: ['/api/admin/gameplan/stats'] }); toast({ title: "Cities seeded" }); },
  });

  const addMutation = useMutation({
    mutationFn: (data: any) => apiRequest('POST', '/api/admin/gameplan/cities', data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/admin/gameplan/cities'] }); setShowAdd(false); setNewCity({ city: '', market: 'NASSAU', state: 'NY', zipCodes: '', serviceTypes: 'Interior Painting,Cabinet Painting,Color Consultation' }); toast({ title: "City added" }); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/admin/gameplan/cities/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/admin/gameplan/cities'] }); toast({ title: "City removed" }); },
  });

  const generateMutation = useMutation({
    mutationFn: (cityId: number) => apiRequest('POST', '/api/admin/gameplan/generate/city-page', { cityId }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/admin/gameplan/cities'] }); queryClient.invalidateQueries({ queryKey: ['/api/admin/gameplan/queue'] }); toast({ title: "City page generated and added to queue" }); },
    onError: (err: any) => toast({ title: "Generation failed", description: err.message, variant: "destructive" }),
  });

  const handleAdd = () => {
    addMutation.mutate({
      ...newCity,
      zipCodes: newCity.zipCodes.split(',').map(z => z.trim()).filter(Boolean),
      serviceTypes: newCity.serviceTypes.split(',').map(s => s.trim()).filter(Boolean),
    });
  };

  return (
    <div className="space-y-4 max-w-4xl" data-testid="cities-tab">
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={marketFilter} onValueChange={setMarketFilter}>
          <SelectTrigger className="w-[140px]" data-testid="select-market-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Markets</SelectItem>
            <SelectItem value="NASSAU">Nassau</SelectItem>
            <SelectItem value="BROOKLYN">Brooklyn</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={() => setShowAdd(!showAdd)} data-testid="button-add-city">
          <Plus className="h-4 w-4 mr-1" /> Add City
        </Button>
        <Button size="sm" variant="outline" onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending} data-testid="button-seed-cities">
          {seedMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
          Seed Default Cities
        </Button>
      </div>

      {showAdd && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>City Name</Label>
                <Input value={newCity.city} onChange={e => setNewCity({ ...newCity, city: e.target.value })} placeholder="e.g. Roslyn" data-testid="input-city-name" />
              </div>
              <div>
                <Label>Market</Label>
                <Select value={newCity.market} onValueChange={v => setNewCity({ ...newCity, market: v })}>
                  <SelectTrigger data-testid="select-city-market"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NASSAU">Nassau</SelectItem>
                    <SelectItem value="BROOKLYN">Brooklyn</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>ZIP Codes (comma separated)</Label>
              <Input value={newCity.zipCodes} onChange={e => setNewCity({ ...newCity, zipCodes: e.target.value })} placeholder="11576, 11577" data-testid="input-zip-codes" />
            </div>
            <div>
              <Label>Service Types (comma separated)</Label>
              <Input value={newCity.serviceTypes} onChange={e => setNewCity({ ...newCity, serviceTypes: e.target.value })} data-testid="input-service-types" />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleAdd} disabled={!newCity.city || addMutation.isPending} data-testid="button-save-city">
                {addMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)} data-testid="button-cancel-city">Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : cities.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">No target cities yet. Click "Seed Default Cities" to get started.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {cities.map(city => (
            <Card key={city.id} className="overflow-visible" data-testid={`card-city-${city.id}`}>
              <div
                className="flex items-center gap-3 p-3 cursor-pointer hover-elevate"
                onClick={() => setExpandedId(expandedId === city.id ? null : city.id)}
              >
                <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium truncate">{city.city}, {city.state}</p>
                    {(city as any).isPremium && (
                      <Crown className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{city.market} | {city.zipCodes.join(', ')}</p>
                </div>
                <Badge variant="outline" className="text-xs shrink-0">
                  {city.pageStatus === 'published' ? 'Published' : city.pageStatus === 'generated' ? 'Generated' : 'Not Created'}
                </Badge>
                {expandedId === city.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
              {expandedId === city.id && (
                <div className="border-t px-3 pb-3 pt-2 space-y-2">
                  <p className="text-xs text-muted-foreground">Services: {city.serviceTypes.join(', ')}</p>
                  {city.wpSlug && <p className="text-xs text-muted-foreground">Slug: {city.wpSlug}</p>}

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
                    <div>
                      <Label className="text-[10px] text-muted-foreground">City Profile</Label>
                      <Select
                        value={(city as any).cityProfile || (city as any).toneType || ''}
                        onValueChange={async (v) => {
                          try {
                            await apiRequest('PATCH', `/api/admin/gameplan/cities/${city.id}`, { cityProfile: v, toneType: v });
                            queryClient.invalidateQueries({ queryKey: ['/api/admin/gameplan/cities'] });
                            toast({ title: 'City profile updated' });
                          } catch (err: any) {
                            toast({ title: 'Failed to update city profile', description: err.message, variant: 'destructive' });
                          }
                        }}
                      >
                        <SelectTrigger className="h-7 text-xs" data-testid={`select-city-profile-${city.id}`}><SelectValue placeholder="Select..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="premium">Premium</SelectItem>
                          <SelectItem value="standard">Standard</SelectItem>
                          <SelectItem value="practical">Practical</SelectItem>
                          <SelectItem value="rental_fast_turn">Rental / Fast Turn</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {(city as any).cityProfile && (
                      <div className="col-span-2">
                        <p className="text-[10px] text-muted-foreground">
                          {(city as any).cityProfile === 'premium' && 'Elevated language: precision, high-end finish, curated'}
                          {(city as any).cityProfile === 'standard' && 'Professional, warm: trusted, reliable, quality workmanship'}
                          {(city as any).cityProfile === 'practical' && 'Direct: proper prep, clean work, efficient process'}
                          {(city as any).cityProfile === 'rental_fast_turn' && 'Efficiency: quick turnaround, durable finish, move-in ready'}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => { e.stopPropagation(); generateMutation.mutate(city.id); }}
                      disabled={generateMutation.isPending}
                      data-testid={`button-generate-city-${city.id}`}
                    >
                      {generateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
                      Generate Page
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(city.id); }}
                      data-testid={`button-delete-city-${city.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  {city.lastGeneratedContent && (
                    <details className="mt-2">
                      <summary className="text-xs text-muted-foreground cursor-pointer">View generated content</summary>
                      <div className="mt-2 border rounded-md p-3 text-sm prose prose-sm dark:prose-invert max-w-none max-h-[300px] overflow-auto" dangerouslySetInnerHTML={{ __html: city.lastGeneratedContent }} />
                    </details>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function SeoScoreBreakdown({ seoDetails, score, publishBlocked, publishBlockReasons }: {
  seoDetails: any;
  score: number;
  publishBlocked?: boolean;
  publishBlockReasons?: string[];
}) {
  if (!seoDetails) return null;

  const sectionLabels: Record<string, string> = {
    title: 'Title Tag',
    metaDescription: 'Meta Description',
    h1: 'H1 Heading',
    hero: 'Hero Section',
    localContent: 'Local Content Depth',
    projectShowcase: 'Project Showcase',
    services: 'Services Section',
    internalLinking: 'Internal Linking',
    faq: 'FAQ Section',
    imageSeo: 'Image SEO',
    cta: 'CTA',
    duplicateContent: 'Duplicate Check',
  };

  const statusIcon = (status: string) => {
    if (status === 'pass') return <Check className="h-3 w-3 text-green-600" />;
    if (status === 'warning') return <AlertTriangle className="h-3 w-3 text-yellow-600" />;
    return <X className="h-3 w-3 text-red-600" />;
  };

  const scoreColor = score >= 90 ? 'text-green-600' : score >= 75 ? 'text-blue-600' : score >= 60 ? 'text-yellow-600' : 'text-red-600';
  const scoreLabel = score >= 90 ? 'Excellent' : score >= 75 ? 'Publishable' : score >= 60 ? 'Needs Improvement' : 'Blocked';

  return (
    <div className="mt-2 space-y-2 border rounded-lg p-3 bg-muted/30" data-testid="seo-breakdown">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">SEO Score</span>
          <span className={`text-lg font-bold ${scoreColor}`}>{score}/100</span>
          <Badge variant={score >= 75 ? 'default' : 'destructive'} className="text-[10px]">{scoreLabel}</Badge>
        </div>
      </div>

      {publishBlocked && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-md p-2 space-y-1" data-testid="publish-blocked-warning">
          <div className="flex items-center gap-1 text-xs font-medium text-red-700">
            <X className="h-3 w-3" /> Publishing Blocked
          </div>
          {publishBlockReasons?.map((reason, i) => (
            <p key={i} className="text-[11px] text-red-600 pl-4">• {reason}</p>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
        {Object.entries(sectionLabels).map(([key, label]) => {
          const sec = seoDetails[key];
          if (!sec) return null;
          return (
            <div key={key} className="flex items-center gap-1.5 text-[11px] py-0.5" data-testid={`seo-section-${key}`}>
              {statusIcon(sec.status)}
              <span className="truncate">{label}</span>
              <span className="text-muted-foreground ml-auto shrink-0">{sec.score}/{sec.maxScore}</span>
            </div>
          );
        })}
      </div>

      {Object.entries(seoDetails).some(([, sec]: [string, any]) => sec.details?.length > 0 && sec.status !== 'pass') && (
        <details className="text-[11px]">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Show details</summary>
          <div className="mt-1 space-y-0.5 pl-2 border-l-2 border-muted">
            {Object.entries(sectionLabels).map(([key, label]) => {
              const sec = seoDetails[key];
              if (!sec || sec.status === 'pass' || !sec.details?.length) return null;
              return sec.details.map((d: string, i: number) => (
                <p key={`${key}-${i}`} className={sec.status === 'fail' ? 'text-red-600' : 'text-yellow-600'}>
                  [{label}] {d}
                </p>
              ));
            })}
          </div>
        </details>
      )}
    </div>
  );
}

function QueueTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [fullPreviewItem, setFullPreviewItem] = useState<GamePlanQueueItem | null>(null);
  const [fullPreviewViewport, setFullPreviewViewport] = useState<'desktop' | 'mobile'>('desktop');
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [validationResults, setValidationResults] = useState<Record<number, any>>({});
  const [diffViewId, setDiffViewId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<{ title: string; generatedContent: string; socialCaptions: { gbp?: string; facebook?: string; instagram?: string } }>({ title: '', generatedContent: '', socialCaptions: {} });
  const [aiEditId, setAiEditId] = useState<number | null>(null);
  const [aiEditInstructions, setAiEditInstructions] = useState('');
  const [photoPickerItemId, setPhotoPickerItemId] = useState<number | null>(null);

  const { data: queue = [], isLoading } = useQuery<GamePlanQueueItem[]>({
    queryKey: ['/api/admin/gameplan/queue'],
  });

  const photoPickerItem = photoPickerItemId ? queue.find(q => q.id === photoPickerItemId) : null;
  const photoPickerCityId = photoPickerItem?.targetCityId;

  const { data: queuePhotosData, isLoading: queuePhotosLoading } = useQuery<any>({
    queryKey: ['/api/admin/gameplan/project-photos', photoPickerCityId || 'all'],
    queryFn: async () => {
      const url = photoPickerCityId ? `/api/admin/gameplan/project-photos?cityId=${photoPickerCityId}` : '/api/admin/gameplan/project-photos';
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load photos');
      return res.json();
    },
    enabled: photoPickerItemId !== null,
  });

  const [publishResult, setPublishResult] = useState<{ itemId: number; result: any; platform: string } | null>(null);

  const uploadMediaMutation = useMutation({
    mutationFn: async ({ id, imageUrl, slot, alt }: { id: number; imageUrl: string; slot: 'featured' | 'mid' | 'supporting'; alt: string }) => {
      const res = await fetch(`/api/admin/gameplan/queue/${id}/upload-media`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageUrl, slot, alt }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/gameplan/queue'] });
      setImageUrls(prev => { const next = { ...prev }; delete next[`${variables.id}-${variables.slot}`]; return next; });
      toast({ title: `${variables.slot} image uploaded` });
    },
    onError: (err: any) => toast({ title: "Upload failed", description: err.message, variant: "destructive" }),
  });

  const uploadFileMutation = useMutation({
    mutationFn: async ({ id, file, slot, alt }: { id: number; file: File; slot: 'featured' | 'mid' | 'supporting'; alt: string }) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('slot', slot);
      formData.append('alt', alt || '');
      const res = await fetch(`/api/admin/gameplan/queue/${id}/upload-file`, { method: 'POST', credentials: 'include', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/gameplan/queue'] });
      toast({ title: `${variables.slot} image uploaded from file` });
    },
    onError: (err: any) => toast({ title: "File upload failed", description: err.message, variant: "destructive" }),
  });

  const validateMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/gameplan/queue/${id}/validate`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Validation failed');
      return { ...data, _itemId: id };
    },
    onSuccess: (data) => {
      setValidationResults(prev => ({ ...prev, [data._itemId]: data }));
    },
    onError: (err: any, id) => {
      setValidationResults(prev => ({ ...prev, [id]: { ready: false, missing: [err.message] } }));
    },
  });

  const socialPublishMutation = useMutation({
    mutationFn: async ({ id, platform }: { id: number; platform: 'gbp' | 'facebook' | 'instagram' }) => {
      const res = await fetch(`/api/admin/gameplan/queue/${id}/publish-${platform}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' } });
      const data = await res.json();
      if (!res.ok && !data.success) throw new Error(data.error ? (typeof data.error === 'string' ? data.error : JSON.stringify(data.error)) : 'Publish failed');
      return { ...data, _platform: platform, _itemId: id };
    },
    onSuccess: (data) => {
      setPublishResult({ itemId: data._itemId, result: data, platform: data._platform });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/gameplan/queue'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/gameplan/history'] });
      toast({ title: `Published to ${data._platform}` });
    },
    onError: (err: any, variables) => {
      setPublishResult({ itemId: variables.id, result: { success: false, error: err.message }, platform: variables.platform });
      toast({ title: `${variables.platform} publish failed`, description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await fetch(`/api/admin/gameplan/queue/${id}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Update failed');
      return { ...json, _itemId: id };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/gameplan/queue'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/gameplan/stats'] });
      if (data?.wpResult) {
        setPublishResult({ itemId: data._itemId, result: data.wpResult, platform: 'wp' });
      }
    },
  });

  const [seoResults, setSeoResults] = useState<Record<number, any>>({});
  const queueSeoCheckMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/gameplan/queue/${id}/calculate-seo`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'SEO check failed');
      return { ...data, _itemId: id };
    },
    onSuccess: (data) => {
      setSeoResults(prev => ({ ...prev, [data._itemId]: data }));
      queryClient.invalidateQueries({ queryKey: ['/api/admin/gameplan/queue'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/gameplan/stats'] });
      toast({ title: `SEO Score: ${data.score}/100`, description: data.publishBlocked ? 'Publishing blocked — fix issues first' : data.interpretation });
    },
    onError: (err: any) => toast({ title: "SEO check failed", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/admin/gameplan/queue/${id}`),
    onMutate: async (id: number) => {
      await queryClient.cancelQueries({ queryKey: ['/api/admin/gameplan/queue'] });
      const previous = queryClient.getQueryData<any[]>(['/api/admin/gameplan/queue']);
      queryClient.setQueryData(['/api/admin/gameplan/queue'], (old: any[] | undefined) =>
        old ? old.filter((item: any) => item.id !== id) : []
      );
      return { previous };
    },
    onError: (_err: any, _id: number, context: any) => {
      if (context?.previous) queryClient.setQueryData(['/api/admin/gameplan/queue'], context.previous);
      toast({ title: "Failed to remove item", variant: "destructive" });
    },
    onSettled: () => { queryClient.invalidateQueries({ queryKey: ['/api/admin/gameplan/queue'] }); },
    onSuccess: () => { toast({ title: "Item removed" }); },
  });

  const aiEditMutation = useMutation({
    mutationFn: async ({ id, instructions }: { id: number; instructions: string }) => {
      const res = await fetch(`/api/admin/gameplan/queue/${id}/ai-edit`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instructions }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI edit failed');
      return data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/gameplan/queue'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/gameplan/history'] });
      toast({ title: "AI edit applied" });
      setAiEditId(null);
      setAiEditInstructions('');
      const updatedItem = queue.find(q => q.id === variables.id);
      if (updatedItem && data.content) {
        setFullPreviewItem({ ...updatedItem, previewHtml: data.content, generatedContent: data.content } as GamePlanQueueItem);
      }
    },
    onError: (err: any) => toast({ title: "AI edit failed", description: err.message, variant: "destructive" }),
  });

  const pendingStatuses = ['draft', 'needs_review', 'approved'];
  const filtered = statusFilter === 'all' 
    ? queue.filter(q => pendingStatuses.includes(q.status))
    : statusFilter === 'all_including_published'
    ? queue
    : queue.filter(q => q.status === statusFilter);

  const statusColor = (s: string) => {
    switch (s) {
      case 'draft': return 'secondary';
      case 'needs_review': return 'default';
      case 'approved': return 'default';
      case 'rejected': return 'destructive';
      case 'published': return 'default';
      default: return 'secondary';
    }
  };

  return (
    <div className="space-y-4 max-w-4xl" data-testid="queue-tab">
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]" data-testid="select-queue-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Pending</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="needs_review">Needs Review</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="all_including_published">All</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{filtered.length} items</span>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">No queue items. Import pages from the Dashboard or generate new content.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(item => (
            <Card key={item.id} data-testid={`card-queue-${item.id}`}>
              <div className="p-3 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-xs">{item.type.replace('_', ' ')}</Badge>
                  {(item as any).pageType && (
                    <Badge variant="secondary" className="text-xs">
                      {(item as any).pageType === 'home_page' || (item as any).pageType === 'home' ? 'Home' : (item as any).pageType === 'service_page' ? 'Service' : (item as any).pageType === 'service_location_page' ? 'Service + Location' : 'Location'}
                    </Badge>
                  )}
                  <Badge variant={statusColor(item.status)} className="text-xs">{item.status.replace('_', ' ')}</Badge>
                  {(item as any).automationTrigger && (
                    <Badge variant="secondary" className="text-xs">
                      <Zap className="h-3 w-3 mr-1" />
                      Auto
                    </Badge>
                  )}
                  <span className="flex-1 text-sm font-medium truncate">{item.title}</span>
                  {item.wpPostId && (
                    <Badge variant="outline" className="text-xs shrink-0" data-testid={`badge-wp-linked-${item.id}`}>
                      <Globe className="h-3 w-3 mr-1" /> WP #{item.wpPostId}
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground shrink-0">
                    {item.publishedAt
                      ? `Published ${new Date(item.publishedAt).toLocaleDateString()}`
                      : item.createdAt
                        ? `Created ${new Date(item.createdAt).toLocaleDateString()}`
                        : ''}
                  </span>
                </div>

                {item.generatedContent && (
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground px-1">
                    {item.publishedAt && item.createdAt && (
                      <span>Created {new Date(item.createdAt).toLocaleDateString()}</span>
                    )}
                    <span>{Math.round((item.generatedContent?.length || 0) / 1024)} KB content</span>
                    {(() => {
                      const imgCount = (item.generatedContent?.match(/<img /gi) || []).length;
                      return imgCount > 0 ? <span>{imgCount} images</span> : null;
                    })()}
                    {(() => {
                      const linkCount = (item.generatedContent?.match(/<a [^>]*href/gi) || []).length;
                      return <span>{linkCount} links</span>;
                    })()}
                  </div>
                )}

                <div className="flex items-center gap-2 flex-wrap">
                  {(item.type === 'website_page' || (item as any).pageType) && item.previewHtml ? (
                    <Button size="sm" variant="outline" onClick={() => setFullPreviewItem(item)} data-testid={`button-fullpreview-${item.id}`}>
                      <Maximize2 className="h-4 w-4 mr-1" /> Full Preview
                    </Button>
                  ) : null}
                  <Button size="sm" variant="outline" onClick={() => setPreviewId(previewId === item.id ? null : item.id)} data-testid={`button-preview-${item.id}`}>
                    <Eye className="h-4 w-4 mr-1" /> Preview
                  </Button>
                  {item.generatedContent && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        const { copyToClipboard } = await import("@/lib/clipboard");
                        const ok = await copyToClipboard(item.generatedContent || '');
                        toast({ title: ok ? "HTML copied to clipboard" : "Could not copy", description: ok ? "Paste this into a WordPress Custom HTML block or page builder." : "Please try again", variant: ok ? "default" : "destructive" });
                      }}
                      data-testid={`button-copy-html-${item.id}`}
                    >
                      <FileText className="h-4 w-4 mr-1" /> Copy HTML
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (aiEditId === item.id) {
                        setAiEditId(null);
                        setAiEditInstructions('');
                      } else {
                        setAiEditId(item.id);
                        setAiEditInstructions('');
                        setEditingId(null);
                      }
                    }}
                    data-testid={`button-ai-edit-${item.id}`}
                  >
                    <Sparkles className="h-4 w-4 mr-1" /> {aiEditId === item.id ? 'Cancel AI Edit' : 'AI Edit'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (editingId === item.id) {
                        setEditingId(null);
                      } else {
                        setEditingId(item.id);
                        setEditForm({
                          title: item.title || '',
                          generatedContent: item.generatedContent || '',
                          socialCaptions: item.socialCaptions || {},
                        });
                        setAiEditId(null);
                      }
                    }}
                    data-testid={`button-edit-${item.id}`}
                  >
                    <Pencil className="h-4 w-4 mr-1" /> {editingId === item.id ? 'Cancel Edit' : 'Edit'}
                  </Button>
                  {item.generatedContent && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => queueSeoCheckMutation.mutate(item.id)}
                      disabled={queueSeoCheckMutation.isPending}
                      data-testid={`button-seo-check-queue-${item.id}`}
                    >
                      {queueSeoCheckMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Shield className="h-4 w-4 mr-1" />}
                      SEO Check
                    </Button>
                  )}
                  {item.seoScore != null && (
                    <Badge
                      variant={item.seoScore >= 75 ? 'default' : item.seoScore >= 60 ? 'secondary' : 'destructive'}
                      className="text-xs"
                      data-testid={`badge-seo-score-${item.id}`}
                    >
                      SEO: {item.seoScore}
                    </Badge>
                  )}
                  {(item as any).publishBlocked && (
                    <Badge variant="destructive" className="text-xs" data-testid={`badge-publish-blocked-${item.id}`}>
                      Publish Blocked
                    </Badge>
                  )}
                  {item.previousContent && item.generatedContent && (
                    <Button size="sm" variant="outline" onClick={() => setDiffViewId(diffViewId === item.id ? null : item.id)} data-testid={`button-diff-${item.id}`}>
                      <FileText className="h-4 w-4 mr-1" /> View Changes
                    </Button>
                  )}
                  {(item.status === 'draft' || item.status === 'needs_review') && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setPublishResult(null);
                          const publishAs = confirm('Publish as LIVE on WordPress?\n\nOK = Live (visitors will see it)\nCancel = Draft (only visible in WP Admin)');
                          const wpPublishAs = publishAs ? 'publish' : 'draft';
                          validateMutation.mutate(item.id, {
                            onSuccess: (data) => {
                              if (data.duplicateWarnings?.length > 0) {
                                toast({ title: "Duplicate content detected", description: `${data.duplicateWarnings.length} section(s) too similar to existing pages. Regenerate unique content first.`, variant: "destructive" });
                                return;
                              }
                              if (data.ready) {
                                updateMutation.mutate({ id: item.id, data: { status: 'published', wpPublishAs } });
                              } else if (data.missing?.length === 0 && data.warnings?.length > 0) {
                                if (confirm(`Warning: ${data.warnings.join(', ')}. Publish anyway?`)) {
                                  updateMutation.mutate({ id: item.id, data: { status: 'published', wpPublishAs } });
                                }
                              }
                            },
                          });
                        }}
                        disabled={updateMutation.isPending || validateMutation.isPending}
                        data-testid={`button-publish-${item.id}`}
                      >
                        {(updateMutation.isPending || validateMutation.isPending) ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Globe className="h-4 w-4 mr-1" />}
                        Publish to WP
                      </Button>
                    </>
                  )}
                  {item.status === 'published' && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          updateMutation.mutate({ id: item.id, data: { status: 'draft' } });
                          toast({ title: "Moved back to Draft for editing" });
                        }}
                        disabled={updateMutation.isPending}
                        data-testid={`button-back-to-draft-${item.id}`}
                      >
                        <FileText className="h-4 w-4 mr-1" /> Edit as Draft
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setPublishResult(null);
                          const publishAs = confirm('Re-publish as LIVE on WordPress?\n\nOK = Live (visitors will see it)\nCancel = Draft (only visible in WP Admin)');
                          const wpPublishAs = publishAs ? 'publish' : 'draft';
                          updateMutation.mutate({ id: item.id, data: { status: 'published', wpPublishAs } });
                        }}
                        disabled={updateMutation.isPending}
                        data-testid={`button-republish-${item.id}`}
                      >
                        <Globe className="h-4 w-4 mr-1" /> Re-publish
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setPublishResult(null); socialPublishMutation.mutate({ id: item.id, platform: 'gbp' }); }}
                        disabled={socialPublishMutation.isPending}
                        data-testid={`button-publish-gbp-${item.id}`}
                      >
                        {socialPublishMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <MapPin className="h-4 w-4 mr-1" />}
                        GBP
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setPublishResult(null); socialPublishMutation.mutate({ id: item.id, platform: 'facebook' }); }}
                        disabled={socialPublishMutation.isPending}
                        data-testid={`button-publish-fb-${item.id}`}
                      >
                        {socialPublishMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Globe className="h-4 w-4 mr-1" />}
                        Facebook
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setPublishResult(null); socialPublishMutation.mutate({ id: item.id, platform: 'instagram' }); }}
                        disabled={socialPublishMutation.isPending}
                        data-testid={`button-publish-ig-${item.id}`}
                      >
                        {socialPublishMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Globe className="h-4 w-4 mr-1" />}
                        Instagram
                      </Button>
                    </>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => deleteMutation.mutate(item.id)}
                    data-testid={`button-delete-queue-${item.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                {(seoResults[item.id] || (item as any).seoDetails) && (
                  <SeoScoreBreakdown
                    seoDetails={seoResults[item.id]?.sections || (item as any).seoDetails}
                    score={seoResults[item.id]?.score ?? item.seoScore ?? 0}
                    publishBlocked={seoResults[item.id]?.publishBlocked ?? (item as any).publishBlocked}
                    publishBlockReasons={seoResults[item.id]?.publishBlockReasons ?? (item as any).publishBlockReasons}
                  />
                )}

                {validationResults[item.id] && (
                  <div className={`border rounded-md p-3 mt-2 text-sm ${validationResults[item.id].ready ? 'border-green-500/30 bg-green-500/5' : validationResults[item.id].missing?.length > 0 ? 'border-red-500/30 bg-red-500/5' : 'border-amber-500/30 bg-amber-500/5'}`} data-testid={`validation-result-${item.id}`}>
                    <div className="flex items-center gap-2">
                      {validationResults[item.id].ready ? (
                        <>
                          <Check className="h-4 w-4 text-green-600" />
                          <span className="font-medium text-xs text-green-700 dark:text-green-400">Ready to publish</span>
                        </>
                      ) : validationResults[item.id].missing?.length > 0 ? (
                        <>
                          <AlertTriangle className="h-4 w-4 text-red-600" />
                          <span className="font-medium text-xs text-red-700 dark:text-red-400">Cannot publish - fix these first:</span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="h-4 w-4 text-amber-600" />
                          <span className="font-medium text-xs text-amber-700 dark:text-amber-400">Can publish with warnings:</span>
                        </>
                      )}
                    </div>
                    {validationResults[item.id].missing?.length > 0 && (
                      <ul className="mt-1 space-y-0.5 ml-6">
                        {validationResults[item.id].missing.map((m: string, i: number) => (
                          <li key={i} className="text-xs text-red-700 dark:text-red-400 list-disc">{m}</li>
                        ))}
                      </ul>
                    )}
                    {validationResults[item.id].warnings?.length > 0 && (
                      <ul className="mt-1 space-y-0.5 ml-6">
                        {validationResults[item.id].warnings.map((w: string, i: number) => (
                          <li key={i} className="text-xs text-amber-700 dark:text-amber-400 list-disc">{w}</li>
                        ))}
                      </ul>
                    )}
                    {validationResults[item.id].duplicateWarnings?.length > 0 && (
                      <div className="mt-2 border-t border-red-500/20 pt-2">
                        <div className="flex items-center gap-1 mb-1">
                          <AlertTriangle className="h-3 w-3 text-red-600" />
                          <span className="text-xs font-medium text-red-700 dark:text-red-400">Duplicate content detected — regenerate before publishing:</span>
                        </div>
                        <ul className="space-y-0.5 ml-6">
                          {validationResults[item.id].duplicateWarnings.map((d: any, i: number) => (
                            <li key={i} className="text-xs text-red-600 dark:text-red-400 list-disc">
                              {d.section} is {d.similarity}% similar to {d.similarTo}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {editingId === item.id && (
                  <div className="border rounded-md p-3 mt-2 space-y-3 bg-muted/30" data-testid={`edit-form-${item.id}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">Edit Content</span>
                      <Button
                        size="sm"
                        onClick={() => {
                          updateMutation.mutate({ id: item.id, data: {
                            title: editForm.title,
                            generatedContent: editForm.generatedContent,
                            previewHtml: editForm.generatedContent,
                            socialCaptions: editForm.socialCaptions,
                          }}, {
                            onSuccess: () => {
                              setEditingId(null);
                              toast({ title: "Changes saved" });
                            },
                          });
                        }}
                        disabled={updateMutation.isPending}
                        data-testid={`button-save-edit-${item.id}`}
                      >
                        {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                        Save Changes
                      </Button>
                    </div>
                    <div>
                      <Label className="text-xs">Title</Label>
                      <Input
                        value={editForm.title}
                        onChange={e => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                        data-testid={`input-edit-title-${item.id}`}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">WordPress Content (HTML)</Label>
                      <Textarea
                        className="min-h-[200px] font-mono text-xs"
                        value={editForm.generatedContent}
                        onChange={e => setEditForm(prev => ({ ...prev, generatedContent: e.target.value }))}
                        data-testid={`textarea-edit-content-${item.id}`}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Social Captions (per-platform)</Label>
                      <div>
                        <Label className="text-xs text-muted-foreground">Google Business Profile</Label>
                        <Textarea
                          className="min-h-[60px] text-xs"
                          value={editForm.socialCaptions.gbp || ''}
                          onChange={e => setEditForm(prev => ({ ...prev, socialCaptions: { ...prev.socialCaptions, gbp: e.target.value } }))}
                          placeholder="Short, local SEO focused with CTA. No hashtags."
                          data-testid={`textarea-edit-gbp-${item.id}`}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Facebook</Label>
                        <Textarea
                          className="min-h-[60px] text-xs"
                          value={editForm.socialCaptions.facebook || ''}
                          onChange={e => setEditForm(prev => ({ ...prev, socialCaptions: { ...prev.socialCaptions, facebook: e.target.value } }))}
                          placeholder="Engaging hook, conversational tone, 2-3 hashtags."
                          data-testid={`textarea-edit-facebook-${item.id}`}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Instagram</Label>
                        <Textarea
                          className="min-h-[80px] text-xs"
                          value={editForm.socialCaptions.instagram || ''}
                          onChange={e => setEditForm(prev => ({ ...prev, socialCaptions: { ...prev.socialCaptions, instagram: e.target.value } }))}
                          placeholder="Visual-focused, transformation language, 8-12 hashtags."
                          data-testid={`textarea-edit-instagram-${item.id}`}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {editingId !== item.id && item.socialCaptions && Object.keys(item.socialCaptions).length > 0 && (
                  <details className="mt-1">
                    <summary className="text-xs text-muted-foreground cursor-pointer">Social Captions</summary>
                    <div className="mt-2 space-y-2">
                      {item.socialCaptions.gbp && (
                        <div className="text-xs"><span className="font-medium">GBP:</span> <span className="text-muted-foreground whitespace-pre-wrap">{item.socialCaptions.gbp}</span></div>
                      )}
                      {item.socialCaptions.facebook && (
                        <div className="text-xs"><span className="font-medium">Facebook:</span> <span className="text-muted-foreground whitespace-pre-wrap">{item.socialCaptions.facebook}</span></div>
                      )}
                      {item.socialCaptions.instagram && (
                        <div className="text-xs"><span className="font-medium">Instagram:</span> <span className="text-muted-foreground whitespace-pre-wrap">{item.socialCaptions.instagram}</span></div>
                      )}
                    </div>
                  </details>
                )}

                <details className="mt-1" open={!!(item.type === 'website_page' || (item as any).pageType)} data-testid={`images-section-${item.id}`}>
                  <summary className="text-xs text-muted-foreground cursor-pointer flex items-center gap-1">
                    <Image className="h-3 w-3" /> Images {(item.type === 'website_page' || (item as any).pageType) ? '— paste URLs or upload files for your page' : ''}
                  </summary>
                  <div className="mt-2 space-y-3">
                    {(item.type === 'website_page' || (item as any).pageType) && (
                      <div className="bg-muted/50 rounded-md p-3 text-xs text-muted-foreground space-y-2" data-testid={`images-tip-${item.id}`}>
                        <p className="font-medium text-foreground">Add images from your completed projects or upload:</p>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setPhotoPickerItemId(photoPickerItemId === item.id ? null : item.id)}
                          data-testid={`button-pick-project-photos-${item.id}`}
                        >
                          <Image className="h-4 w-4 mr-1" />
                          {photoPickerItemId === item.id ? 'Hide' : 'Pick from'} Project Photos
                        </Button>
                        {photoPickerItemId === item.id && (
                          <div className="mt-2 space-y-2 max-h-[300px] overflow-auto">
                            <p className="text-[10px] text-muted-foreground">Click a photo to place its URL in an image slot, then click "URL" to upload it to WordPress.</p>
                            {queuePhotosLoading ? (
                              <div className="flex items-center justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                            ) : !queuePhotosData?.projectPhotos?.length ? (
                              <p className="text-xs text-muted-foreground">No project photos found. Upload photos to your projects first.</p>
                            ) : (
                              queuePhotosData.projectPhotos.map((proj: any) => (
                                <div key={proj.projectId} className="border rounded-md p-2 space-y-1.5">
                                  <div className="flex items-center gap-2 text-xs">
                                    <Check className="h-3 w-3 text-green-600 shrink-0" />
                                    <span className="font-medium text-foreground">{proj.projectTitle}</span>
                                    <span>{proj.jobCity}</span>
                                  </div>
                                  <div className="flex gap-2 overflow-x-auto pb-1">
                                    {proj.photos.slice(0, 10).map((photo: any) => (
                                      <div key={photo.id} className="shrink-0 relative group">
                                        <img
                                          src={photo.url}
                                          alt={photo.caption || photo.fileName}
                                          className="w-16 h-16 object-cover rounded-md border"
                                          data-testid={`queue-photo-pick-${photo.id}`}
                                        />
                                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-md flex flex-col items-center justify-center gap-0.5">
                                          {(['featured', 'mid', 'supporting'] as const).map(slot => (
                                            <button
                                              key={slot}
                                              className="text-[9px] text-white bg-primary/80 hover:bg-primary px-1.5 py-0.5 rounded"
                                              onClick={() => {
                                                const fullUrl = window.location.origin + photo.url;
                                                setImageUrls(prev => ({ ...prev, [`${item.id}-${slot}`]: fullUrl }));
                                                toast({ title: `Photo → ${slot === 'featured' ? 'Hero' : slot === 'mid' ? 'Gallery' : 'Supporting'}`, description: "Click URL button to upload." });
                                              }}
                                              data-testid={`queue-photo-slot-${slot}-${photo.id}`}
                                            >
                                              {slot === 'featured' ? 'Hero' : slot === 'mid' ? 'Gallery' : 'Support'}
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    {(['featured', 'mid', 'supporting'] as const).map(slot => {
                      const slotLabel = slot === 'featured' ? 'Hero / Featured' : slot === 'mid' ? 'Gallery / Mid-page' : 'Supporting';
                      const slotData = (item.imageSlots as GamePlanImageSlots)?.[slot];
                      const inputKey = `${item.id}-${slot}`;
                      return (
                        <div key={slot} className="border rounded-md p-2 space-y-2" data-testid={`image-slot-${slot}-${item.id}`}>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-medium">{slotLabel}</span>
                            {slotData?.wpMediaId && (
                              <Badge variant="outline" className="text-xs" data-testid={`badge-media-id-${slot}-${item.id}`}>
                                WP Media #{slotData.wpMediaId}
                              </Badge>
                            )}
                          </div>
                          {slotData?.url && (
                            <img src={slotData.url} alt={slotData.alt || slotLabel} className="w-24 h-16 object-cover rounded-md border" data-testid={`img-thumbnail-${slot}-${item.id}`} />
                          )}
                          <div className="flex items-center gap-2 flex-wrap">
                            <Input
                              className="flex-1 text-xs"
                              placeholder={`Image URL for ${slotLabel}`}
                              value={imageUrls[inputKey] || ''}
                              onChange={e => setImageUrls(prev => ({ ...prev, [inputKey]: e.target.value }))}
                              data-testid={`input-image-url-${slot}-${item.id}`}
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!imageUrls[inputKey] || uploadMediaMutation.isPending}
                              onClick={() => uploadMediaMutation.mutate({ id: item.id, imageUrl: imageUrls[inputKey], slot, alt: '' })}
                              data-testid={`button-upload-url-${slot}-${item.id}`}
                            >
                              {uploadMediaMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
                              URL
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={uploadFileMutation.isPending}
                              onClick={() => {
                                const input = document.createElement('input');
                                input.type = 'file';
                                input.accept = 'image/*';
                                input.onchange = (e) => {
                                  const file = (e.target as HTMLInputElement).files?.[0];
                                  if (file) uploadFileMutation.mutate({ id: item.id, file, slot, alt: '' });
                                };
                                input.click();
                              }}
                              data-testid={`button-upload-file-${slot}-${item.id}`}
                            >
                              {uploadFileMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Image className="h-4 w-4 mr-1" />}
                              File
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </details>

                {publishResult && publishResult.itemId === item.id && (
                  <div className={`border rounded-md p-3 mt-2 text-sm ${publishResult.result.success ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'}`} data-testid={`publish-result-${item.id}`}>
                    <div className="flex items-center gap-2">
                      {publishResult.result.success ? <Check className="h-4 w-4 text-green-600" /> : <X className="h-4 w-4 text-red-600" />}
                      <span className="font-medium text-xs">
                        {publishResult.platform === 'wp' && (publishResult.result.success ? `Published to WP (ID: ${publishResult.result.wpPostId}, Status: ${publishResult.result.wpStatus})` : 'WP Publish Failed')}
                        {publishResult.platform === 'gbp' && (publishResult.result.success ? `Published to GBP` : 'GBP Publish Failed')}
                        {publishResult.platform === 'facebook' && (publishResult.result.success ? `Published to Facebook (Post ID: ${publishResult.result.postId})` : 'Facebook Publish Failed')}
                        {publishResult.platform === 'instagram' && (publishResult.result.success ? `Published to Instagram (Media ID: ${publishResult.result.mediaId})` : 'Instagram Publish Failed')}
                      </span>
                    </div>
                    {publishResult.result.editLink && (
                      <a href={publishResult.result.editLink} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline mt-1 inline-block" data-testid={`link-edit-${item.id}`}>
                        Open in WP Admin
                      </a>
                    )}
                    {publishResult.result.error && (
                      <pre className="text-xs text-red-600 dark:text-red-400 mt-1 whitespace-pre-wrap max-h-[200px] overflow-auto">
                        {typeof publishResult.result.error === 'string' ? publishResult.result.error : JSON.stringify(publishResult.result.error, null, 2)}
                      </pre>
                    )}
                  </div>
                )}

                {item.wpPostId && !publishResult?.result?.wpPostId && (
                  <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                    WP ID: {item.wpPostId}
                    <button className="text-red-500 hover:underline" onClick={() => {
                      if (confirm('Remove WP page link? This will create a new page on next publish instead of updating the existing one.')) {
                        updateMutation.mutate({ id: item.id, data: { wpPostId: null } as any });
                      }
                    }} data-testid={`button-unlink-wp-${item.id}`}>unlink</button>
                  </div>
                )}
                {!item.wpPostId && item.type === 'website_page' && (
                  <div className="mt-1">
                    <button
                      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground border rounded px-2 py-0.5 transition-colors"
                      onClick={() => {
                        const wpId = prompt('Enter the WordPress Page ID number to replace when publishing.\n\nHow to find it:\n1. Go to WP Admin → Pages\n2. Click Edit on the page\n3. Look at the URL — it will say post=123\n4. Enter just the number (e.g. 123)');
                        if (wpId && /^\d+$/.test(wpId.trim())) {
                          updateMutation.mutate({ id: item.id, data: { wpPostId: parseInt(wpId.trim()) } as any });
                        } else if (wpId) {
                          alert('Please enter a valid numeric WordPress page ID.');
                        }
                      }}
                      data-testid={`button-link-wp-${item.id}`}
                    >
                      <Link className="w-3 h-3" />
                      Link to existing WP page
                    </button>
                  </div>
                )}

                {previewId === item.id && item.previewHtml && (
                  <div className="border rounded-md p-4 mt-2 prose prose-sm dark:prose-invert max-w-none max-h-[400px] overflow-auto" dangerouslySetInnerHTML={{ __html: item.previewHtml }} />
                )}

                {fullPreviewItem?.id === item.id && fullPreviewItem.previewHtml && (
                  <PagePreviewDialog
                    html={fullPreviewItem.previewHtml}
                    title={fullPreviewItem.title || 'Page Preview'}
                    onClose={() => setFullPreviewItem(null)}
                    viewport={fullPreviewViewport}
                    onViewportChange={setFullPreviewViewport}
                  />
                )}

                {aiEditId === item.id && (
                  <div className="border rounded-md p-3 mt-2 space-y-3 bg-primary/5 border-primary/20" data-testid={`ai-edit-form-${item.id}`}>
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">AI Edit</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Describe what you want to change — the AI will update the page while keeping the design intact.
                    </p>
                    <Textarea
                      value={aiEditInstructions}
                      onChange={e => setAiEditInstructions(e.target.value)}
                      placeholder="e.g. Change the hero headline to 'New York's Premier Painting Team', add a section about eco-friendly paints, make the FAQ section shorter..."
                      rows={3}
                      className="text-sm"
                      data-testid={`textarea-ai-edit-${item.id}`}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => aiEditMutation.mutate({ id: item.id, instructions: aiEditInstructions })}
                        disabled={!aiEditInstructions.trim() || aiEditMutation.isPending}
                        data-testid={`button-apply-ai-edit-${item.id}`}
                      >
                        {aiEditMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
                        Apply Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setAiEditId(null); setAiEditInstructions(''); }}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {diffViewId === item.id && item.previousContent && item.generatedContent && (
                  <div className="border rounded-md mt-2 overflow-hidden" data-testid={`diff-view-${item.id}`}>
                    <div className="grid grid-cols-2 divide-x">
                      <div className="p-3">
                        <p className="text-xs font-medium text-muted-foreground mb-2">Previous</p>
                        <div className="max-h-[400px] overflow-auto text-xs whitespace-pre-wrap text-muted-foreground" data-testid={`diff-previous-${item.id}`}>
                          {item.previousContent}
                        </div>
                      </div>
                      <div className="p-3">
                        <p className="text-xs font-medium text-muted-foreground mb-2">Updated</p>
                        <div className="max-h-[400px] overflow-auto text-xs whitespace-pre-wrap" data-testid={`diff-updated-${item.id}`}>
                          {item.generatedContent}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function TipLabel({ label, tip }: { label: string; tip: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <Label>{label}</Label>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help shrink-0" />
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-[280px] text-xs">
          <p>{tip}</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

function PagePreviewDialog({ html, title, onClose, viewport, onViewportChange }: {
  html: string;
  title: string;
  onClose: () => void;
  viewport: 'desktop' | 'mobile';
  onViewportChange: (v: 'desktop' | 'mobile') => void;
}) {
  const isMobileDevice = typeof window !== 'undefined' && window.innerWidth < 768;

  useEffect(() => {
    if (isMobileDevice) {
      onViewportChange('mobile');
    }
  }, []);

  const iframeContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>body { margin: 0; padding: 0; background: #fff; }</style>
</head>
<body>${html}</body>
</html>`;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-[95vw] w-[95vw] h-[90vh] flex flex-col p-0" data-testid="page-preview-dialog">
        <DialogHeader className="px-4 py-3 border-b flex-row items-center justify-between gap-2 space-y-0">
          <div className="flex items-center gap-2 min-w-0">
            <Eye className="h-4 w-4 shrink-0" />
            <DialogTitle className="text-sm truncate">{title}</DialogTitle>
          </div>
          <DialogDescription className="sr-only">Preview of the generated page</DialogDescription>
          <div className="flex items-center gap-1 shrink-0">
            {!isMobileDevice && (
              <>
                <Button
                  size="sm"
                  variant={viewport === 'desktop' ? 'default' : 'ghost'}
                  onClick={() => onViewportChange('desktop')}
                  data-testid="button-viewport-desktop"
                >
                  <Monitor className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant={viewport === 'mobile' ? 'default' : 'ghost'}
                  onClick={() => onViewportChange('mobile')}
                  data-testid="button-viewport-mobile"
                >
                  <Smartphone className="h-4 w-4" />
                </Button>
              </>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={onClose}
              data-testid="button-close-preview"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>
        <div className="flex-1 flex items-start justify-center overflow-auto bg-muted/30 p-4">
          <iframe
            srcDoc={iframeContent}
            className="border rounded-lg shadow-lg bg-white transition-all duration-300"
            style={{
              width: isMobileDevice ? '100%' : (viewport === 'mobile' ? '375px' : '100%'),
              maxWidth: isMobileDevice ? '100%' : (viewport === 'mobile' ? '375px' : '1200px'),
              height: '100%',
              minHeight: '500px',
            }}
            title={title}
            sandbox="allow-same-origin"
            data-testid="iframe-page-preview"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function GeneratorTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [generatorMode, setGeneratorMode] = useState<'job_post' | 'website_page' | 'location_page_builder'>('location_page_builder');
  const [title, setTitle] = useState('');
  const [city, setCity] = useState('');
  const [serviceTypes, setServiceTypes] = useState('Interior Painting');
  const [imageUrl, setImageUrl] = useState('');
  const [notesForAi, setNotesForAi] = useState('');
  const [referenceUrls, setReferenceUrls] = useState('');
  const [pageType, setPageType] = useState<'home_page' | 'service_page' | 'location_page' | 'service_location_page'>('home_page');
  const [selectedCityId, setSelectedCityId] = useState<string>('');
  const [serviceType, setServiceType] = useState('Interior Painting');
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewViewport, setPreviewViewport] = useState<'desktop' | 'mobile'>('desktop');

  const [heroIntro, setHeroIntro] = useState('');
  const [localHousingNotes, setLocalHousingNotes] = useState('');
  const [localCommonProblems, setLocalCommonProblems] = useState('');
  const [nearbyAreasInput, setNearbyAreasInput] = useState('');
  const [metaDescription, setMetaDescription] = useState('');
  const [projectTitle, setProjectTitle] = useState('');
  const [projectSummary, setProjectSummary] = useState('');
  const [projectScope, setProjectScope] = useState('');
  const [projectImages, setProjectImages] = useState('');
  const [faqEntries, setFaqEntries] = useState<Array<{question: string; answer: string}>>([
    { question: '', answer: '' },
    { question: '', answer: '' },
    { question: '', answer: '' },
    { question: '', answer: '' },
  ]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const { data: cities = [] } = useQuery<GamePlanTargetCity[]>({
    queryKey: ['/api/admin/gameplan/cities'],
  });

  const generateJobMutation = useMutation({
    mutationFn: (data: any) => apiRequest('POST', '/api/admin/gameplan/generate/job-post', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/gameplan/queue'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/gameplan/stats'] });
      toast({ title: "Job post generated and added to queue" });
      setTitle(''); setCity(''); setServiceTypes('Interior Painting'); setImageUrl(''); setNotesForAi('');
    },
    onError: (err: any) => toast({ title: "Generation failed", description: err.message, variant: "destructive" }),
  });

  const generatePageMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch('/api/admin/gameplan/generate/website-page', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Generation failed');
      return json;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/gameplan/queue'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/gameplan/stats'] });
      toast({ title: `${pageType.replace('_', ' ')} generated and added to queue` });
      if (data.content) setPreviewHtml(data.content);
      setNotesForAi('');
    },
    onError: (err: any) => toast({ title: "Generation failed", description: err.message, variant: "destructive" }),
  });

  const generateCityPageMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch('/api/admin/gameplan/generate/city-page', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Generation failed');
      return json;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/gameplan/queue'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/gameplan/stats'] });
      toast({ title: "Location page generated and added to queue!" });
      if (data.content) setPreviewHtml(data.content);
    },
    onError: (err: any) => toast({ title: "Generation failed", description: err.message, variant: "destructive" }),
  });

  const handleGenerateJob = () => {
    generateJobMutation.mutate({
      title: title || undefined,
      city,
      serviceTypes: serviceTypes.split(',').map(s => s.trim()).filter(Boolean),
      imageUrl: imageUrl || undefined,
      notesForAi: notesForAi || undefined,
    });
  };

  const handleGeneratePage = () => {
    const payload: any = { pageType, notesForAi: notesForAi || undefined };
    if ((pageType === 'location_page' || pageType === 'service_location_page') && selectedCityId) payload.cityId = parseInt(selectedCityId);
    if (pageType === 'service_page' || pageType === 'service_location_page') payload.serviceType = serviceType;
    if (referenceUrls.trim()) payload.referenceUrls = referenceUrls.split('\n').map(u => u.trim()).filter(Boolean);
    generatePageMutation.mutate(payload);
  };

  const handleGenerateCityPage = () => {
    if (!selectedCityId) return;
    const payload: any = { cityId: parseInt(selectedCityId) };
    if (heroIntro.trim()) payload.heroIntro = heroIntro;
    if (localHousingNotes.trim()) payload.localHousingNotes = localHousingNotes;
    if (localCommonProblems.trim()) payload.localCommonProblems = localCommonProblems.split(',').map(s => s.trim()).filter(Boolean);
    if (nearbyAreasInput.trim()) payload.nearbyAreas = nearbyAreasInput.split(',').map(s => s.trim()).filter(Boolean);
    if (metaDescription.trim()) payload.metaDescription = metaDescription;
    if (notesForAi.trim()) payload.notesForAi = notesForAi;
    const filledFaqs = faqEntries.filter(f => f.question.trim() && f.answer.trim());
    if (filledFaqs.length) payload.faqs = filledFaqs;
    if (projectTitle.trim() || projectSummary.trim()) {
      payload.featuredProject = {
        title: projectTitle || undefined,
        summary: projectSummary || undefined,
        scope: projectScope ? projectScope.split(',').map(s => s.trim()).filter(Boolean) : undefined,
        images: projectImages ? projectImages.split('\n').map(s => s.trim()).filter(Boolean) : undefined,
      };
    }
    generateCityPageMutation.mutate(payload);
  };

  const pageTypeLabel = (pt: string) => {
    switch (pt) {
      case 'home_page': return 'Home Page';
      case 'service_page': return 'Service Page';
      case 'location_page': return 'Location Page';
      case 'service_location_page': return 'Service + Location Landing Page';
      default: return pt;
    }
  };

  const pageTypeIcon = (pt: string) => {
    switch (pt) {
      case 'home_page': return <Home className="h-5 w-5" />;
      case 'service_page': return <Wrench className="h-5 w-5" />;
      case 'location_page': return <MapPinned className="h-5 w-5" />;
      case 'service_location_page': return <Zap className="h-5 w-5" />;
      default: return <Globe className="h-5 w-5" />;
    }
  };

  const isGenerating = generateJobMutation.isPending || generatePageMutation.isPending || generateCityPageMutation.isPending;

  return (
    <div className="max-w-2xl space-y-4" data-testid="generator-tab">
      <div className="flex gap-2 flex-wrap">
        <Button
          variant={generatorMode === 'location_page_builder' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setGeneratorMode('location_page_builder')}
          data-testid="button-mode-location"
        >
          <MapPinned className="h-4 w-4 mr-1" /> Location Page Builder
        </Button>
        <Button
          variant={generatorMode === 'website_page' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setGeneratorMode('website_page')}
          data-testid="button-mode-website"
        >
          <Globe className="h-4 w-4 mr-1" /> Website Pages
        </Button>
        <Button
          variant={generatorMode === 'job_post' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setGeneratorMode('job_post')}
          data-testid="button-mode-jobpost"
        >
          <FileText className="h-4 w-4 mr-1" /> Job Posts
        </Button>
      </div>

      {generatorMode === 'location_page_builder' ? (
        <Card>
          <CardHeader className="pb-2 px-4 pt-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <MapPinned className="h-4 w-4" />
              SEO Location Page Builder
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Generate a complete, SEO-optimized service area page with cross-linking, local content, and FAQ schema.</p>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-4">
            <div>
              <TipLabel label="Target City *" tip="Select the city for this location page. The AI will generate locally-specific content with neighborhood references, architecture details, and ZIP codes." />
              <Select value={selectedCityId} onValueChange={setSelectedCityId}>
                <SelectTrigger data-testid="select-location-city"><SelectValue placeholder="Select a city..." /></SelectTrigger>
                <SelectContent>
                  {cities.map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      <span className="flex items-center gap-2">
                        {(c as any).isPremium && <Crown className="h-3 w-3 text-amber-500" />}
                        {c.city}, {c.state} — {c.market}
                        {c.wpPageUrl && <Badge variant="outline" className="text-[10px] ml-1">Published</Badge>}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <TipLabel label="Hero Intro (optional)" tip="A unique intro paragraph for the hero section. If left blank, the AI will write one. Make it specific to this city — reference local landmarks, neighborhoods, or architectural character." />
              <Textarea
                value={heroIntro}
                onChange={e => setHeroIntro(e.target.value)}
                placeholder="e.g. From the Tudor homes along Stewart Avenue to the center-hall Colonials near the Country Club — Garden City homeowners demand a higher standard..."
                rows={3}
                className="text-sm"
                data-testid="input-hero-intro"
              />
            </div>

            <div>
              <TipLabel label="Local Housing Notes (optional)" tip="Describe the types of homes in this city and common painting challenges. This creates the unique 'Local Homeowner Insight' section." />
              <Textarea
                value={localHousingNotes}
                onChange={e => setLocalHousingNotes(e.target.value)}
                placeholder="e.g. Garden City is known for Tudor, Colonial, and Cape Cod homes built in the 1920s-1960s. Many have original plaster walls, wood paneling, and outdated wallpaper..."
                rows={3}
                className="text-sm"
                data-testid="input-local-notes"
              />
            </div>

            <div>
              <TipLabel label="Common Problems (optional)" tip="Comma-separated list of common painting problems in this area. These become talking points in the local insight section." />
              <Input
                value={localCommonProblems}
                onChange={e => setLocalCommonProblems(e.target.value)}
                placeholder="e.g. wallpaper removal, plaster cracks, outdated paneling, lead paint"
                data-testid="input-common-problems"
              />
            </div>

            <div>
              <TipLabel label="Nearby Areas (optional)" tip="Comma-separated list of 4-8 nearby towns. These become cross-linked in the 'Nearby Areas' section. If a town has an existing page, it auto-links. Leave blank and the AI will use other cities from your target list." />
              <Input
                value={nearbyAreasInput}
                onChange={e => setNearbyAreasInput(e.target.value)}
                placeholder="e.g. Floral Park, Mineola, New Hyde Park, Bellerose, Manhasset"
                data-testid="input-nearby-areas"
              />
            </div>

            <div>
              <TipLabel label="Meta Description (optional)" tip="140-160 characters. Must include city name, 1-2 services, and a CTA. Leave blank for AI to generate one." />
              <Input
                value={metaDescription}
                onChange={e => setMetaDescription(e.target.value)}
                placeholder="e.g. Premium interior painting in Garden City, NY. Licensed & insured. Free estimates. Call (888) 971-6033."
                maxLength={160}
                data-testid="input-meta-desc"
              />
              {metaDescription && <p className="text-[10px] text-muted-foreground mt-1">{metaDescription.length}/160 characters</p>}
            </div>

            <button
              type="button"
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-full"
              onClick={() => setShowAdvanced(!showAdvanced)}
              data-testid="button-toggle-advanced"
            >
              {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {showAdvanced ? 'Hide' : 'Show'} Advanced Options (Project, FAQs, Notes)
            </button>

            {showAdvanced && (
              <div className="space-y-4 border-t pt-4">
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5">
                    <Image className="h-3.5 w-3.5" /> Featured Project (optional)
                  </h4>
                  <Input
                    value={projectTitle}
                    onChange={e => setProjectTitle(e.target.value)}
                    placeholder="Project title, e.g. Full Home Repaint — Stewart Avenue Colonial"
                    data-testid="input-project-title"
                  />
                  <Textarea
                    value={projectSummary}
                    onChange={e => setProjectSummary(e.target.value)}
                    placeholder="Brief summary of the project..."
                    rows={2}
                    className="text-sm"
                    data-testid="input-project-summary"
                  />
                  <Input
                    value={projectScope}
                    onChange={e => setProjectScope(e.target.value)}
                    placeholder="Scope of work (comma-separated): wallpaper removal, skim coat, 2 coats Benjamin Moore Regal"
                    data-testid="input-project-scope"
                  />
                  <Textarea
                    value={projectImages}
                    onChange={e => setProjectImages(e.target.value)}
                    placeholder={"Project image URLs (one per line):\nhttps://example.com/before.jpg\nhttps://example.com/after.jpg"}
                    rows={3}
                    className="text-sm font-mono"
                    data-testid="input-project-images"
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5">
                      <HelpCircle className="h-3.5 w-3.5" /> Custom FAQs (optional)
                    </h4>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => setFaqEntries(prev => [...prev, { question: '', answer: '' }])}
                      data-testid="button-add-faq"
                    >
                      <Plus className="h-3 w-3 mr-1" /> Add FAQ
                    </Button>
                  </div>
                  {faqEntries.map((faq, i) => (
                    <div key={i} className="border rounded-md p-2.5 space-y-2 bg-muted/20">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground">Q{i+1}</span>
                        <Input
                          value={faq.question}
                          onChange={e => {
                            const updated = [...faqEntries];
                            updated[i] = { ...updated[i], question: e.target.value };
                            setFaqEntries(updated);
                          }}
                          placeholder="Question..."
                          className="text-sm h-8"
                          data-testid={`input-faq-q-${i}`}
                        />
                        {faqEntries.length > 1 && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 shrink-0"
                            onClick={() => setFaqEntries(prev => prev.filter((_, idx) => idx !== i))}
                            data-testid={`button-remove-faq-${i}`}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                      <Textarea
                        value={faq.answer}
                        onChange={e => {
                          const updated = [...faqEntries];
                          updated[i] = { ...updated[i], answer: e.target.value };
                          setFaqEntries(updated);
                        }}
                        placeholder="Answer..."
                        rows={2}
                        className="text-sm"
                        data-testid={`input-faq-a-${i}`}
                      />
                    </div>
                  ))}
                </div>

                <div>
                  <TipLabel label="Notes for AI (optional)" tip="Any special details, instructions, or content to include in the page." />
                  <Textarea value={notesForAi} onChange={e => setNotesForAi(e.target.value)} placeholder="Any special details..." rows={3} data-testid="input-location-notes" />
                </div>
              </div>
            )}

            <Button
              onClick={handleGenerateCityPage}
              disabled={isGenerating || !selectedCityId}
              className="w-full"
              data-testid="button-generate-location-page"
            >
              {generateCityPageMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
              Generate Location Page
            </Button>
          </CardContent>
        </Card>
      ) : generatorMode === 'website_page' ? (
        <Card>
          <CardHeader className="pb-2 px-4 pt-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Generate Website Page
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-4">
            <div>
              <TipLabel label="Page Type" tip="Choose the type of page to generate. Home Page is your main landing page. Service Pages target specific services. Location Pages target specific cities. Service + Location is the most powerful — targeting a specific service in a specific city." />
              <div className="grid grid-cols-2 gap-2 mt-1.5">
                {(['home_page', 'service_page', 'location_page', 'service_location_page'] as const).map(pt => (
                  <button
                    key={pt}
                    type="button"
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all ${
                      pageType === pt
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border hover:border-primary/40 text-muted-foreground'
                    }`}
                    onClick={() => setPageType(pt)}
                    data-testid={`button-pagetype-${pt}`}
                  >
                    {pageTypeIcon(pt)}
                    <span className="text-xs font-medium">{pageTypeLabel(pt)}</span>
                  </button>
                ))}
              </div>
            </div>

            {(pageType === 'service_page' || pageType === 'service_location_page') && (
              <div>
                <TipLabel label="Service Type" tip="The specific service this page will focus on. The AI will generate detailed, conversion-focused content around this service." />
                <Select value={serviceType} onValueChange={setServiceType}>
                  <SelectTrigger data-testid="select-service-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Interior Painting">Interior Painting</SelectItem>
                    <SelectItem value="Exterior Painting">Exterior Painting</SelectItem>
                    <SelectItem value="Cabinet Refinishing">Cabinet Refinishing</SelectItem>
                    <SelectItem value="Commercial Painting">Commercial Painting</SelectItem>
                    <SelectItem value="Deck & Fence Staining">Deck & Fence Staining</SelectItem>
                    <SelectItem value="Color Consultation">Color Consultation</SelectItem>
                    <SelectItem value="Wallpaper Installation">Wallpaper Installation</SelectItem>
                    <SelectItem value="Drywall Repair">Drywall Repair</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {(pageType === 'location_page' || pageType === 'service_location_page') && (
              <div>
                <TipLabel label="Target City" tip="Select a city from your target cities list. The AI will generate location-specific content with local references, ZIP codes, and neighborhood details." />
                <Select value={selectedCityId} onValueChange={setSelectedCityId}>
                  <SelectTrigger data-testid="select-target-city"><SelectValue placeholder="Select a city..." /></SelectTrigger>
                  <SelectContent>
                    {cities.map(c => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        <span className="flex items-center gap-2">
                          {(c as any).isPremium && <Crown className="h-3 w-3 text-amber-500" />}
                          {c.city}, {c.state} — {c.market}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <TipLabel label="Reference URLs (optional)" tip="Paste URLs of websites you like — the AI will analyze their content, layout, and style to inspire your page. It takes the best elements and combines them with your brand." />
              <Textarea
                value={referenceUrls}
                onChange={e => setReferenceUrls(e.target.value)}
                placeholder={"Paste website URLs for inspiration (one per line):\nhttps://example-painter.com\nhttps://another-great-site.com"}
                rows={3}
                className="text-sm"
                data-testid="input-reference-urls"
              />
            </div>

            <div>
              <TipLabel label="Notes for AI (optional)" tip="Add specific details you want included: unique selling points, awards, specialties, target audience, or any content focus areas." />
              <Textarea value={notesForAi} onChange={e => setNotesForAi(e.target.value)} placeholder="Any special details to include..." rows={3} data-testid="input-page-notes" />
            </div>

            <Button
              onClick={handleGeneratePage}
              disabled={isGenerating || ((pageType === 'location_page' || pageType === 'service_location_page') && !selectedCityId)}
              className="w-full"
              data-testid="button-generate-page"
            >
              {generatePageMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
              Generate {pageTypeLabel(pageType)}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2 px-4 pt-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Generate Job Post
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <div>
              <TipLabel label="Title (optional)" tip="The blog post title. Leave blank and AI will create one based on the city and services. You can always edit it later in the queue." />
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Kitchen Cabinet Painting in Roslyn" data-testid="input-post-title" />
            </div>
            <div>
              <TipLabel label="City *" tip="The city or neighborhood where the job was completed. This is used for local SEO targeting and is included in the content." />
              <Input value={city} onChange={e => setCity(e.target.value)} placeholder="e.g. Roslyn" data-testid="input-post-city" />
            </div>
            <div>
              <TipLabel label="Service Types" tip="Comma-separated list of services performed. Example: Interior Painting, Cabinet Painting, Color Consultation. These become keywords in the generated content." />
              <Input value={serviceTypes} onChange={e => setServiceTypes(e.target.value)} data-testid="input-post-services" />
            </div>
            <div>
              <TipLabel label="Featured Image URL (optional)" tip="URL of a photo from the job. You can also upload images directly in the queue after generation." />
              <Input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://..." data-testid="input-post-image" />
            </div>
            <div>
              <TipLabel label="Notes for AI (optional)" tip="Any details about the job that should be included: color choices, special techniques used, customer preferences, room dimensions, etc. The more detail you provide, the better the content." />
              <Textarea value={notesForAi} onChange={e => setNotesForAi(e.target.value)} placeholder="Any special details about this job..." rows={3} data-testid="input-post-notes" />
            </div>
            <Button onClick={handleGenerateJob} disabled={!city || generateJobMutation.isPending} data-testid="button-generate-post">
              {generateJobMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
              Generate Job Post
            </Button>
          </CardContent>
        </Card>
      )}

      {previewHtml && (
        <PagePreviewDialog
          html={previewHtml}
          title={`${pageTypeLabel(pageType)} Preview`}
          onClose={() => setPreviewHtml(null)}
          viewport={previewViewport}
          onViewportChange={setPreviewViewport}
        />
      )}
    </div>
  );
}

function ProjectsTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedCityId, setSelectedCityId] = useState<number | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [appending, setAppending] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  const { data: cities = [] } = useQuery<GamePlanTargetCity[]>({
    queryKey: ['/api/admin/gameplan/target-cities'],
  });

  const publishedCities = cities.filter(c => c.pageStatus === 'published' || c.wpPageId);

  const { data: cityProjects = [], isLoading: loadingProjects } = useQuery<GamePlanCityProject[]>({
    queryKey: ['/api/admin/gameplan/city-projects', selectedCityId],
    enabled: !!selectedCityId,
  });

  const selectedCity = cities.find(c => c.id === selectedCityId);

  const [form, setForm] = useState({
    projectTitle: '',
    projectCity: '',
    completionDate: '',
    projectSummary: '',
    projectImages: '',
    scopeOfWork: '',
    productsUsed: '',
    projectTimeline: '',
    projectResult: '',
    testimonial: '',
    propertyType: '',
    roomsOrAreas: '',
  });

  const resetForm = () => setForm({
    projectTitle: '', projectCity: selectedCity?.city || '', completionDate: '',
    projectSummary: '', projectImages: '', scopeOfWork: '', productsUsed: '',
    projectTimeline: '', projectResult: '', testimonial: '', propertyType: '', roomsOrAreas: '',
  });

  useEffect(() => {
    if (selectedCity) setForm(prev => ({ ...prev, projectCity: selectedCity.city }));
  }, [selectedCity]);

  const createProject = useMutation({
    mutationFn: async () => {
      const body = {
        targetCityId: selectedCityId,
        projectTitle: form.projectTitle,
        projectCity: form.projectCity || selectedCity?.city,
        completionDate: form.completionDate || undefined,
        projectSummary: form.projectSummary || undefined,
        projectImages: form.projectImages ? form.projectImages.split('\n').map(s => s.trim()).filter(Boolean) : [],
        scopeOfWork: form.scopeOfWork ? form.scopeOfWork.split(',').map(s => s.trim()).filter(Boolean) : [],
        productsUsed: form.productsUsed ? form.productsUsed.split(',').map(s => s.trim()).filter(Boolean) : undefined,
        projectTimeline: form.projectTimeline || undefined,
        projectResult: form.projectResult || undefined,
        testimonial: form.testimonial || undefined,
        propertyType: form.propertyType || undefined,
        roomsOrAreas: form.roomsOrAreas || undefined,
      };
      return apiRequest('POST', '/api/admin/gameplan/city-projects', body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/gameplan/city-projects', selectedCityId] });
      toast({ title: "Project added", description: `Added to ${selectedCity?.city}` });
      setShowAddDialog(false);
      resetForm();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteProject = useMutation({
    mutationFn: async (id: number) => apiRequest('DELETE', `/api/admin/gameplan/city-projects/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/gameplan/city-projects', selectedCityId] });
      toast({ title: "Project removed" });
    },
  });

  const handleGenerate = async () => {
    if (!selectedCityId) return;
    setGenerating(true);
    try {
      const resp = await apiRequest('POST', `/api/admin/gameplan/city-projects/${selectedCityId}/generate-section`);
      const data = await resp.json();
      setPreviewHtml(data.html);
      toast({ title: "Section generated", description: `${data.projectCount} project(s) included` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setGenerating(false);
  };

  const handleAppend = async () => {
    if (!selectedCityId || !previewHtml) return;
    setAppending(true);
    try {
      const resp = await apiRequest('POST', `/api/admin/gameplan/city-projects/${selectedCityId}/append-to-page`, {
        projectSectionHtml: previewHtml,
      });
      const data = await resp.json();
      queryClient.invalidateQueries({ queryKey: ['/api/admin/gameplan/city-projects', selectedCityId] });
      toast({ title: "Page updated", description: data.message });
      setPreviewHtml(null);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setAppending(false);
  };

  return (
    <div className="space-y-4 max-w-4xl" data-testid="projects-tab">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold" data-testid="text-projects-title">Completed Projects</h2>
          <p className="text-sm text-muted-foreground">Add completed jobs to strengthen location pages over time</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4 space-y-4">
          <div className="space-y-1.5">
            <Label>Select City</Label>
            <Select
              value={selectedCityId?.toString() || ''}
              onValueChange={(v) => {
                setSelectedCityId(Number(v));
                setPreviewHtml(null);
              }}
            >
              <SelectTrigger data-testid="select-project-city">
                <SelectValue placeholder="Choose a city..." />
              </SelectTrigger>
              <SelectContent>
                {cities.map(c => (
                  <SelectItem key={c.id} value={c.id.toString()}>
                    {c.city}, {c.state} {c.pageStatus === 'published' ? '(Published)' : c.pageStatus === 'generated' ? '(Draft)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedCityId && (
            <>
              <div className="flex items-center justify-between">
                <h3 className="font-medium" data-testid="text-city-projects-count">
                  {cityProjects.length} project{cityProjects.length !== 1 ? 's' : ''} in {selectedCity?.city}
                </h3>
                <Button
                  size="sm"
                  onClick={() => { resetForm(); setShowAddDialog(true); }}
                  data-testid="button-add-project"
                >
                  <Plus className="h-4 w-4 mr-1" /> Add Project
                </Button>
              </div>

              {loadingProjects && <div className="text-center py-4"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>}

              {!loadingProjects && cityProjects.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No completed projects yet. Add your first project for {selectedCity?.city}.
                </p>
              )}

              <div className="space-y-3">
                {cityProjects.map(p => (
                  <Card key={p.id} data-testid={`card-project-${p.id}`}>
                    <CardContent className="pt-3 pb-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-sm" data-testid={`text-project-title-${p.id}`}>{p.projectTitle}</h4>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <Badge variant="outline" className="text-xs">{p.projectCity}</Badge>
                            {p.completionDate && <span className="text-xs text-muted-foreground">{p.completionDate}</span>}
                            {p.propertyType && <span className="text-xs text-muted-foreground">{p.propertyType}</span>}
                            {p.publishedToPage && <Badge className="text-xs bg-green-100 text-green-800">On Page</Badge>}
                          </div>
                          {p.projectSummary && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{p.projectSummary}</p>}
                          {(p.scopeOfWork || []).length > 0 && (
                            <div className="flex gap-1 mt-1 flex-wrap">
                              {p.scopeOfWork!.slice(0, 4).map((s, i) => (
                                <Badge key={i} variant="secondary" className="text-xs">{s}</Badge>
                              ))}
                              {(p.scopeOfWork || []).length > 4 && (
                                <Badge variant="secondary" className="text-xs">+{p.scopeOfWork!.length - 4}</Badge>
                              )}
                            </div>
                          )}
                          {(p.projectImages || []).length > 0 && (
                            <div className="flex items-center gap-1 mt-1">
                              <Image className="h-3 w-3 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">{p.projectImages!.length} image(s)</span>
                            </div>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => deleteProject.mutate(p.id)}
                          data-testid={`button-delete-project-${p.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {cityProjects.length > 0 && (
                <div className="border-t pt-4 space-y-3">
                  <h3 className="font-medium text-sm">Update Location Page</h3>
                  <p className="text-xs text-muted-foreground">
                    Generate a "Recent Projects" section from the completed projects above and append it to the existing {selectedCity?.city} location page.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      onClick={handleGenerate}
                      disabled={generating}
                      variant="outline"
                      data-testid="button-generate-projects-section"
                    >
                      {generating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
                      Generate Section
                    </Button>
                    {previewHtml && (
                      <Button
                        onClick={handleAppend}
                        disabled={appending || !publishedCities.some(c => c.id === selectedCityId)}
                        data-testid="button-append-to-page"
                      >
                        {appending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
                        Append to Page
                      </Button>
                    )}
                  </div>
                  {previewHtml && !publishedCities.some(c => c.id === selectedCityId) && (
                    <p className="text-xs text-orange-600">
                      <AlertTriangle className="h-3 w-3 inline mr-1" />
                      No published page exists for {selectedCity?.city}. Generate a location page first from the Queue tab.
                    </p>
                  )}
                  {previewHtml && (
                    <Card>
                      <CardHeader className="py-2 px-3">
                        <CardTitle className="text-sm">Preview</CardTitle>
                      </CardHeader>
                      <CardContent className="px-3 pb-3">
                        <div
                          className="prose prose-sm max-w-none text-xs overflow-auto max-h-[400px] border rounded p-3"
                          dangerouslySetInnerHTML={{ __html: previewHtml }}
                          data-testid="projects-section-preview"
                        />
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Completed Project</DialogTitle>
            <DialogDescription>Add a completed job to strengthen the {selectedCity?.city} location page.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Project Title *</Label>
              <Input
                placeholder="e.g. Full Home Repaint — Oak Street Colonial"
                value={form.projectTitle}
                onChange={e => setForm(f => ({ ...f, projectTitle: e.target.value }))}
                data-testid="input-project-title"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>City</Label>
                <Input value={form.projectCity} onChange={e => setForm(f => ({ ...f, projectCity: e.target.value }))} data-testid="input-project-city" />
              </div>
              <div className="space-y-1.5">
                <Label>Completion Date</Label>
                <Input type="date" value={form.completionDate} onChange={e => setForm(f => ({ ...f, completionDate: e.target.value }))} data-testid="input-completion-date" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Property Type</Label>
              <Input placeholder="e.g. Colonial, Ranch, Co-op, Townhouse" value={form.propertyType} onChange={e => setForm(f => ({ ...f, propertyType: e.target.value }))} data-testid="input-property-type" />
            </div>
            <div className="space-y-1.5">
              <Label>Rooms / Areas</Label>
              <Input placeholder="e.g. Living room, kitchen, hallway, 3 bedrooms" value={form.roomsOrAreas} onChange={e => setForm(f => ({ ...f, roomsOrAreas: e.target.value }))} data-testid="input-rooms" />
            </div>
            <div className="space-y-1.5">
              <Label>Summary</Label>
              <Textarea
                placeholder="Brief overview of the project..."
                rows={3}
                value={form.projectSummary}
                onChange={e => setForm(f => ({ ...f, projectSummary: e.target.value }))}
                data-testid="input-project-summary"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Scope of Work (comma-separated)</Label>
              <Input
                placeholder="interior painting, drywall repair, skim coating, trim painting"
                value={form.scopeOfWork}
                onChange={e => setForm(f => ({ ...f, scopeOfWork: e.target.value }))}
                data-testid="input-scope"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Products Used (comma-separated, optional)</Label>
              <Input
                placeholder="Benjamin Moore Regal Select, Sherwin-Williams ProMar"
                value={form.productsUsed}
                onChange={e => setForm(f => ({ ...f, productsUsed: e.target.value }))}
                data-testid="input-products"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Timeline</Label>
              <Input placeholder="e.g. 5 days" value={form.projectTimeline} onChange={e => setForm(f => ({ ...f, projectTimeline: e.target.value }))} data-testid="input-timeline" />
            </div>
            <div className="space-y-1.5">
              <Label>Result</Label>
              <Textarea
                placeholder="How the project turned out..."
                rows={2}
                value={form.projectResult}
                onChange={e => setForm(f => ({ ...f, projectResult: e.target.value }))}
                data-testid="input-result"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Testimonial / Review (optional)</Label>
              <Textarea
                placeholder="Customer quote about the project..."
                rows={2}
                value={form.testimonial}
                onChange={e => setForm(f => ({ ...f, testimonial: e.target.value }))}
                data-testid="input-testimonial"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Project Images (one URL per line)</Label>
              <Textarea
                placeholder="https://example.com/image1.jpg&#10;https://example.com/image2.jpg"
                rows={3}
                value={form.projectImages}
                onChange={e => setForm(f => ({ ...f, projectImages: e.target.value }))}
                data-testid="input-images"
              />
            </div>
            <Button
              className="w-full"
              onClick={() => createProject.mutate()}
              disabled={!form.projectTitle || createProject.isPending}
              data-testid="button-submit-project"
            >
              {createProject.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
              Add Project
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SettingsTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [wpTestResult, setWpTestResult] = useState<any>(null);
  const [gbpTestResult, setGbpTestResult] = useState<any>(null);
  const [metaTestResult, setMetaTestResult] = useState<any>(null);
  const [metaPages, setMetaPages] = useState<any[]>([]);
  const [metaTokenPerms, setMetaTokenPerms] = useState<any[]>([]);
  const [metaNoPagesMessage, setMetaNoPagesMessage] = useState<string>('');
  const [metaPagesFetched, setMetaPagesFetched] = useState(false);
  const [showChangePage, setShowChangePage] = useState(false);
  const [gbpLocations, setGbpLocations] = useState<any[]>([]);
  const [gbpAccounts, setGbpAccounts] = useState<any[]>([]);
  const [loadingMetaPages, setLoadingMetaPages] = useState(false);
  const [loadingGbpLocations, setLoadingGbpLocations] = useState(false);
  const [selectedNassauLoc, setSelectedNassauLoc] = useState('');
  const [selectedBrooklynLoc, setSelectedBrooklynLoc] = useState('');

  const { data: settings, isLoading } = useQuery<GamePlanSettings | null>({ queryKey: ['/api/admin/gameplan/settings'] });

  const [form, setForm] = useState<Partial<GamePlanSettings>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (settings && !loaded) {
      setForm({
        wpBaseUrl: settings.wpBaseUrl || '',
        wpUsername: settings.wpUsername || '',
        wpAppPassword: settings.wpAppPassword || '',
        wpLocationsParentId: (settings as any).wpLocationsParentId || '',
        wpHomepageId: (settings as any).wpHomepageId || '',
        wpNassauParentId: (settings as any).wpNassauParentId || '',
        wpBrooklynParentId: (settings as any).wpBrooklynParentId || '',
        wpPublishMode: settings.wpPublishMode || 'draft_only',
        googleReviewLinkNassau: settings.googleReviewLinkNassau || '',
        googleReviewLinkBrooklyn: settings.googleReviewLinkBrooklyn || '',
        reviewsWidgetCode: (settings as any).reviewsWidgetCode || '',
        gbpPublishMode: settings.gbpPublishMode || 'draft_only',
        metaPublishMode: settings.metaPublishMode || 'draft_only',
        brandVoiceNotes: settings.brandVoiceNotes || '',
        defaultCta: settings.defaultCta || '',
        autoTriggerEstimate: (settings as any).autoTriggerEstimate || false,
        autoTriggerProjectStarted: (settings as any).autoTriggerProjectStarted || false,
        autoTriggerProjectCompleted: (settings as any).autoTriggerProjectCompleted || false,
        autoTriggerPlatforms: (settings as any).autoTriggerPlatforms || { wp: false, gbp: false, facebook: false, instagram: false },
        customerVisits: (settings as any).customerVisits || false,
      });
      setSelectedNassauLoc((settings as any).gbpLocationIdNassau || '');
      setSelectedBrooklynLoc((settings as any).gbpLocationIdBrooklyn || '');
      setLoaded(true);
    }
  }, [settings, loaded]);

  // Check URL params for OAuth callbacks
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('meta') === 'connected') {
      if (params.get('nopages') === 'true') {
        setMetaPagesFetched(true);
        setMetaNoPagesMessage('No Facebook Pages found. Make sure your Facebook account manages at least one Facebook Business Page, and that you granted all permissions during connection.');
        toast({ title: "Meta connected", description: "No Facebook Pages found. See details below.", variant: "destructive" });
      } else {
        const pageCount = params.get('pagecount') || '';
        toast({ title: "Meta connected", description: pageCount ? `Found ${pageCount} Facebook Page(s). Select one below.` : "Loading your Facebook Pages..." });
        fetchMetaPages();
      }
    } else if (params.get('meta') === 'error') {
      toast({ title: "Meta connection failed", description: params.get('message') || 'Unknown error', variant: "destructive" });
    }
    if (params.get('gbp') === 'connected') {
      toast({ title: "Google Business connected", description: "Loading your business locations..." });
      setTimeout(() => fetchGbpLocations(0), 2000);
    } else if (params.get('gbp') === 'error') {
      toast({ title: "GBP connection failed", description: params.get('message') || 'Unknown error', variant: "destructive" });
    }
    if (params.get('meta') || params.get('gbp')) {
      window.history.replaceState({}, '', '/admin/gameplan?tab=settings');
    }
  }, []);

  // Auto-fetch pages when token exists but no page selected yet (one-shot)
  useEffect(() => {
    if (settings && (settings as any)?.metaLongLivedToken && !(settings as any)?.metaPageId && !metaPagesFetched && !loadingMetaPages) {
      fetchMetaPages();
    }
  }, [settings, metaPagesFetched, loadingMetaPages]);

  const saveMutation = useMutation({
    mutationFn: (data: any) => apiRequest('PUT', '/api/admin/gameplan/settings', data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/admin/gameplan/settings'] }); toast({ title: "Settings saved" }); },
    onError: (err: any) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  const wpTestMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/admin/gameplan/test-wp-connection', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Test failed');
      return data;
    },
    onSuccess: (data) => { setWpTestResult(data); queryClient.invalidateQueries({ queryKey: ['/api/admin/gameplan/history'] }); },
    onError: (err: any) => { setWpTestResult({ success: false, error: err.message }); },
  });

  const gbpTestMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/admin/gameplan/test-gbp-connection', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Test failed');
      return data;
    },
    onSuccess: (data) => { setGbpTestResult(data); queryClient.invalidateQueries({ queryKey: ['/api/admin/gameplan/history'] }); },
    onError: (err: any) => { setGbpTestResult({ success: false, error: err.message }); },
  });

  const metaTestMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/admin/gameplan/test-meta-connection', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Test failed');
      return data;
    },
    onSuccess: (data) => { setMetaTestResult(data); queryClient.invalidateQueries({ queryKey: ['/api/admin/gameplan/history'] }); },
    onError: (err: any) => { setMetaTestResult({ success: false, error: err.message }); },
  });

  const fetchMetaPages = async () => {
    setLoadingMetaPages(true);
    setMetaNoPagesMessage('');
    setMetaPagesFetched(true);
    try {
      const res = await fetch('/api/admin/gameplan/meta/pages', { credentials: 'include' });
      const data = await res.json();
      if (data.pages) {
        setMetaPages(data.pages);
        if (data.permissions) setMetaTokenPerms(data.permissions);
        if (data.pages.length === 0) {
          const grantedPerms = (data.permissions || []).filter((p: any) => p.status === 'granted').map((p: any) => p.permission);
          const hasPagesPerm = grantedPerms.includes('pages_show_list');
          const userInfo = data.user?.name ? ` Connected as: ${data.user.name} (ID: ${data.user.id}).` : '';
          if (!hasPagesPerm) {
            setMetaNoPagesMessage(`The "pages_show_list" permission was not granted. Please disconnect and reconnect Facebook, making sure to approve all permissions.${userInfo}`);
          } else {
            setMetaNoPagesMessage(`No Facebook Pages found.${userInfo} Please disconnect and reconnect, and when Facebook asks, click "Continue as [Your Name]" instead of "Edit Settings".`);
          }
        }
      }
      else toast({ title: "Error", description: data.error || "Failed to fetch pages", variant: "destructive" });
    } catch { toast({ title: "Error", description: "Failed to fetch Facebook pages", variant: "destructive" }); }
    setLoadingMetaPages(false);
  };

  const fetchGbpLocations = async (retryCount = 0) => {
    setLoadingGbpLocations(true);
    try {
      const res = await fetch('/api/admin/gameplan/gbp/locations', { credentials: 'include' });
      const data = await res.json();
      if (data.locations) {
        setGbpLocations(data.locations);
        setGbpAccounts(data.accounts || []);
        if (data.locations.length === 0) {
          toast({ title: "No locations found", description: data.message || "No Google Business locations found for this account.", variant: "destructive" });
        } else {
          toast({ title: "Locations loaded", description: `Found ${data.locations.length} location(s). Select your Nassau and Brooklyn locations below.` });
        }
      } else if (data.error && (data.error.includes('Quota exceeded') || data.error.includes('quota') || res.status === 429)) {
        const waitSeconds = Math.min((retryCount + 1) * 15, 60);
        if (retryCount < 4) {
          toast({ title: "Google rate limit hit", description: `Google limits how often we can check. Auto-retrying in ${waitSeconds} seconds...` });
          setTimeout(() => fetchGbpLocations(retryCount + 1), waitSeconds * 1000);
          return;
        } else {
          toast({ title: "Google rate limit", description: "Still rate-limited by Google. Please wait about a minute and try again.", variant: "destructive" });
        }
      } else {
        toast({ title: "Error", description: data.error || "Failed to fetch locations", variant: "destructive" });
      }
    } catch { toast({ title: "Error", description: "Failed to fetch GBP locations", variant: "destructive" }); }
    setLoadingGbpLocations(false);
  };

  const [metaDebugInfo, setMetaDebugInfo] = useState<any>(null);

  const connectMeta = async () => {
    try {
      const res = await fetch('/api/admin/gameplan/meta/oauth/start', { credentials: 'include' });
      const data = await res.json();
      if (data.authUrl) window.location.href = data.authUrl;
      else toast({ title: "Error", description: data.error || "Failed to start Meta OAuth", variant: "destructive" });
    } catch { toast({ title: "Error", description: "Failed to start Meta connection", variant: "destructive" }); }
  };

  const debugMeta = async () => {
    try {
      const res = await fetch('/api/admin/gameplan/meta/oauth/debug', { credentials: 'include' });
      const data = await res.json();
      setMetaDebugInfo(data);
    } catch { toast({ title: "Error", description: "Failed to fetch debug info", variant: "destructive" }); }
  };

  const [metaDiagnostics, setMetaDiagnostics] = useState<any>(null);
  const [loadingDiagnostics, setLoadingDiagnostics] = useState(false);
  const runMetaDiagnostics = async () => {
    setLoadingDiagnostics(true);
    setMetaDiagnostics(null);
    try {
      const res = await fetch('/api/admin/gameplan/meta/token-debug', { credentials: 'include' });
      const data = await res.json();
      setMetaDiagnostics(data);
    } catch { toast({ title: "Error", description: "Failed to run diagnostics", variant: "destructive" }); }
    setLoadingDiagnostics(false);
  };

  const connectGbp = async () => {
    try {
      const res = await fetch('/api/admin/gameplan/gbp/oauth/start', { credentials: 'include' });
      const data = await res.json();
      if (data.authUrl) window.location.href = data.authUrl;
      else toast({ title: "Error", description: data.error || "Failed to start GBP OAuth", variant: "destructive" });
    } catch { toast({ title: "Error", description: "Failed to start GBP connection", variant: "destructive" }); }
  };

  const selectMetaPage = async (page: any) => {
    try {
      const res = await fetch('/api/admin/gameplan/meta/select-page', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId: page.id, pageName: page.name, pageAccessToken: page.pageAccessToken, igAccountId: page.igAccountId }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: "Page selected", description: `Connected to ${page.name}${data.igUsername ? ` + @${data.igUsername}` : ''}` });
        queryClient.invalidateQueries({ queryKey: ['/api/admin/gameplan/settings'] });
        setMetaPages([]);
        setMetaNoPagesMessage('');
        setMetaTokenPerms([]);
      } else toast({ title: "Error", description: data.error, variant: "destructive" });
    } catch { toast({ title: "Error", description: "Failed to select page", variant: "destructive" }); }
  };

  const saveGbpLocations = async () => {
    const nassauLoc = gbpLocations.find(l => l.name === selectedNassauLoc);
    const brooklynLoc = gbpLocations.find(l => l.name === selectedBrooklynLoc);
    const accountId = nassauLoc?.accountName || brooklynLoc?.accountName || gbpAccounts[0]?.name || '';
    try {
      const res = await fetch('/api/admin/gameplan/gbp/select-locations', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          nassauLocationId: selectedNassauLoc,
          nassauLocationName: nassauLoc?.title || '',
          brooklynLocationId: selectedBrooklynLoc,
          brooklynLocationName: brooklynLoc?.title || '',
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: "Locations saved" });
        queryClient.invalidateQueries({ queryKey: ['/api/admin/gameplan/settings'] });
      } else toast({ title: "Error", description: data.error, variant: "destructive" });
    } catch { toast({ title: "Error", description: "Failed to save locations", variant: "destructive" }); }
  };

  const disconnectMeta = async () => {
    try {
      const res = await fetch('/api/admin/gameplan/meta/disconnect', { method: 'POST', credentials: 'include' });
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ['/api/admin/gameplan/settings'] });
      setMetaPages([]);
      setMetaTokenPerms([]);
      setMetaNoPagesMessage('');
      setMetaPagesFetched(false);
      setMetaTestResult(null);
      setMetaDebugInfo(null);
      setShowChangePage(false);
      setMetaDiagnostics(null);
      if (data.revokedOnFacebook) {
        toast({ title: "Meta disconnected", description: "Facebook connection fully revoked. You'll get a fresh start when reconnecting." });
      } else {
        toast({ title: "Meta disconnected", description: "Settings cleared. When reconnecting, Facebook may remember your previous login - just approve all permissions again." });
      }
    } catch { toast({ title: "Error", description: "Failed to disconnect", variant: "destructive" }); }
  };

  const disconnectGbp = async () => {
    try {
      await fetch('/api/admin/gameplan/gbp/disconnect', { method: 'POST', credentials: 'include' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/gameplan/settings'] });
      toast({ title: "GBP disconnected" });
    } catch { toast({ title: "Error", description: "Failed to disconnect", variant: "destructive" }); }
  };

  if (isLoading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const updateField = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }));
  const s = settings as any;
  const isMetaConnected = s?.metaConnected && s?.metaPageId;
  const isGbpConnected = s?.gbpConnected && (s?.gbpLocationIdNassau || s?.gbpLocationIdBrooklyn);

  const FieldTip = TipLabel;

  return (
    <div className="max-w-2xl space-y-4" data-testid="settings-tab">
      <Card>
        <CardHeader className="pb-2 px-4 pt-4">
          <CardTitle className="text-sm">WordPress Configuration</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <div>
            <FieldTip label="WP Site URL" tip="Your WordPress website address. Example: https://gamapaint.com" />
            <Input value={form.wpBaseUrl || ''} onChange={e => updateField('wpBaseUrl', e.target.value)} placeholder="https://yourdomain.com" data-testid="input-wp-url" />
          </div>
          <div>
            <FieldTip label="WP Username" tip="Your WordPress admin username used for API access." />
            <Input value={form.wpUsername || ''} onChange={e => updateField('wpUsername', e.target.value)} data-testid="input-wp-username" />
          </div>
          <div>
            <FieldTip label="WP App Password" tip="A special password generated in WordPress under Users > Profile > Application Passwords. This is NOT your regular login password." />
            <Input type="password" value={form.wpAppPassword || ''} onChange={e => updateField('wpAppPassword', e.target.value)} data-testid="input-wp-password" />
          </div>
          <div>
            <FieldTip label="Locations Parent Page ID" tip="The WordPress page ID for your main 'Locations' page. City pages will be created as children under this page. Find it in WordPress by editing the page and checking the URL for ?post=123." />
            <Input type="number" value={(form as any).wpLocationsParentId || ''} onChange={e => setForm(prev => ({ ...prev, wpLocationsParentId: e.target.value ? parseInt(e.target.value) : null }))} placeholder="e.g. 123" data-testid="input-wp-locations-parent-id" />
          </div>
          <div>
            <FieldTip label="Homepage Page ID" tip="The WordPress page ID for your homepage. When new city pages are published, the homepage's service area section will be automatically updated to link to them." />
            <Input type="number" value={(form as any).wpHomepageId || ''} onChange={e => setForm(prev => ({ ...prev, wpHomepageId: e.target.value ? parseInt(e.target.value) : null }))} placeholder="e.g. 123" data-testid="input-wp-homepage-id" />
          </div>
          <div>
            <FieldTip label="Nassau Parent Page ID" tip="The WordPress page ID for your Nassau County parent page. Generated city pages for Nassau towns will nest under this page. One-time setup." />
            <Input type="number" value={(form as any).wpNassauParentId || ''} onChange={e => setForm(prev => ({ ...prev, wpNassauParentId: e.target.value ? parseInt(e.target.value) : null }))} placeholder="e.g. 456" data-testid="input-wp-nassau-parent-id" />
          </div>
          <div>
            <FieldTip label="Brooklyn Parent Page ID" tip="The WordPress page ID for your Brooklyn parent page. Generated city pages for Brooklyn neighborhoods will nest under this page. One-time setup." />
            <Input type="number" value={(form as any).wpBrooklynParentId || ''} onChange={e => setForm(prev => ({ ...prev, wpBrooklynParentId: e.target.value ? parseInt(e.target.value) : null }))} placeholder="e.g. 789" data-testid="input-wp-brooklyn-parent-id" />
          </div>
          <div>
            <FieldTip label="Publish Mode" tip="Controls how content is published to WordPress. 'Draft Only' saves as a draft for you to review. 'Publish with Approval' publishes only after you approve in the queue. 'Auto Publish' publishes immediately when generated." />
            <Select value={form.wpPublishMode || 'draft_only'} onValueChange={v => updateField('wpPublishMode', v)}>
              <SelectTrigger data-testid="select-wp-mode"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="off">Off</SelectItem>
                <SelectItem value="draft_only">Draft Only</SelectItem>
                <SelectItem value="publish_with_approval">Publish with Approval</SelectItem>
                <SelectItem value="auto_publish">Auto Publish</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="border-t pt-3">
            <Button size="sm" variant="outline" onClick={() => { setWpTestResult(null); wpTestMutation.mutate(); }} disabled={wpTestMutation.isPending} data-testid="button-test-wp">
              {wpTestMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Globe className="h-4 w-4 mr-2" />}
              Test WP Connection
            </Button>
          </div>
          {wpTestResult && <TestResultDisplay result={wpTestResult} testId="wp-test-result" />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 px-4 pt-4">
          <CardTitle className="text-sm">Google Review Links</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <div>
            <FieldTip label="Nassau County Review Link" tip="Direct link to leave a Google review for your Nassau location. Find it in Google Maps by searching your business and clicking 'Write a review' - copy that URL." />
            <Input value={form.googleReviewLinkNassau || ''} onChange={e => updateField('googleReviewLinkNassau', e.target.value)} placeholder="https://g.page/..." data-testid="input-review-nassau" />
          </div>
          <div>
            <FieldTip label="Brooklyn Review Link" tip="Direct link to leave a Google review for your Brooklyn location. Used in generated content CTAs." />
            <Input value={form.googleReviewLinkBrooklyn || ''} onChange={e => updateField('googleReviewLinkBrooklyn', e.target.value)} placeholder="https://g.page/..." data-testid="input-review-brooklyn" />
          </div>
          <div>
            <FieldTip label="Reviews Widget Code" tip="Paste your reviews embed code here (from Birdeye, EmbedSocial, Elfsight, Google Reviews widget, etc.). This code gets inserted into the testimonials section of every page when you publish." />
            <Textarea
              value={form.reviewsWidgetCode || ''}
              onChange={e => updateField('reviewsWidgetCode', e.target.value)}
              placeholder='Paste your reviews widget embed code here, e.g. <script src="..."></script> or <div class="elfsight-app-..." data-elfsight-app-lazy></div>'
              rows={4}
              className="text-xs font-mono"
              data-testid="input-reviews-widget"
            />
            <p className="text-xs text-muted-foreground mt-1">This replaces the testimonials placeholder on every page when publishing to WordPress.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 px-4 pt-4">
          <CardTitle className="text-sm">Facebook & Instagram (Meta)</CardTitle>
          {isMetaConnected && <Badge variant="outline" className="text-green-600 border-green-500/30">Connected</Badge>}
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          {isMetaConnected ? (
            <div className="border rounded-md p-3 space-y-2 border-green-500/30 bg-green-500/5">
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium">Connected to: {s.metaPageName || s.metaPageId}</span>
              </div>
              {s.igUsername && (
                <div className="flex items-center gap-2 ml-6">
                  <Instagram className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Instagram: @{s.igUsername}</span>
                </div>
              )}
              {!s.igBusinessAccountId && (
                <p className="text-xs text-muted-foreground ml-6">No Instagram Business account linked to this page.</p>
              )}
              <div className="flex gap-2 mt-2 flex-wrap">
                <Button size="sm" variant="outline" onClick={() => { setShowChangePage(true); fetchMetaPages(); }} data-testid="button-change-page">
                  <RefreshCw className="h-4 w-4 mr-2" />Change Page
                </Button>
                <Button size="sm" variant="outline" onClick={disconnectMeta} data-testid="button-disconnect-meta">
                  <Unlink className="h-4 w-4 mr-2" />Disconnect
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setMetaTestResult(null); metaTestMutation.mutate(); }} disabled={metaTestMutation.isPending} data-testid="button-test-meta">
                  {metaTestMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Shield className="h-4 w-4 mr-2" />}
                  Test Connection
                </Button>
              </div>

              <Dialog open={showChangePage} onOpenChange={setShowChangePage}>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Select Facebook Page</DialogTitle>
                    <DialogDescription>Choose which Facebook Page to use for publishing.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                    {loadingMetaPages && <div className="flex items-center gap-2 text-sm text-muted-foreground p-4"><Loader2 className="h-4 w-4 animate-spin" /> Loading pages...</div>}
                    {metaPages.map((page: any) => (
                      <div key={page.id} className={`flex items-center justify-between gap-2 p-3 border rounded-md ${page.id === s.metaPageId ? 'border-green-500/50 bg-green-500/5' : 'hover:bg-muted/50 cursor-pointer'}`} data-testid={`meta-page-change-${page.id}`}>
                        <div className="flex items-center gap-2 min-w-0">
                          {page.id === s.metaPageId && <Check className="h-4 w-4 text-green-600 shrink-0" />}
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{page.name}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              ID: {page.id}
                              {page.hasInstagram && <span className="ml-2 text-green-600">+ Instagram @{page.igUsername || ''}</span>}
                              {!page.hasInstagram && <span className="ml-2 text-muted-foreground">(no Instagram)</span>}
                            </p>
                          </div>
                        </div>
                        {page.id === s.metaPageId ? (
                          <Badge variant="outline" className="text-green-600 border-green-500/30 shrink-0">Current</Badge>
                        ) : (
                          <Button size="sm" onClick={() => { selectMetaPage(page); setShowChangePage(false); }} data-testid={`button-switch-page-${page.id}`}>Select</Button>
                        )}
                      </div>
                    ))}
                    {!loadingMetaPages && metaPages.length === 0 && (
                      <p className="text-sm text-muted-foreground p-4">No other pages found. If pages are missing, try disconnecting and reconnecting with all permissions.</p>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
              {metaTestResult && <TestResultDisplay result={metaTestResult} testId="meta-test-result" />}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Button size="sm" onClick={connectMeta} data-testid="button-connect-meta">
                  <Facebook className="h-4 w-4 mr-2" />Connect Facebook
                </Button>
                <Button size="sm" variant="outline" onClick={debugMeta} data-testid="button-debug-meta">
                  Troubleshoot
                </Button>
              </div>
              {metaDebugInfo && (
                <div className="border rounded-md p-3 space-y-2 bg-muted/50">
                  <p className="text-sm font-medium">Connection Debug Info:</p>
                  <div className="text-xs space-y-1">
                    <p>App ID configured: {metaDebugInfo.appIdConfigured ? 'Yes' : 'No'}</p>
                    <p>App Secret configured: {metaDebugInfo.appSecretConfigured ? 'Yes' : 'No'}</p>
                    <p>Protocol: {metaDebugInfo.detectedProtocol}</p>
                    <p>Host: {metaDebugInfo.detectedHost}</p>
                    <p className="font-medium">Redirect URI: <span className="font-mono text-primary break-all">{metaDebugInfo.redirectUri}</span></p>
                    {metaDebugInfo.appCheck && (
                      <p>App check: {metaDebugInfo.appCheck.body || metaDebugInfo.appCheck.error}</p>
                    )}
                  </div>
                  <div className="text-xs space-y-1 border-t pt-2 mt-2">
                    <p className="font-medium">Required Facebook Developer Setup:</p>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Go to <strong>developers.facebook.com</strong> {'>'} Your App {'>'} <strong>Products</strong> (left sidebar)</li>
                      <li>Click <strong>"Add Product"</strong> and add <strong>"Facebook Login"</strong> (not "Facebook Login for Business")</li>
                      <li>Go to <strong>Facebook Login {'>'} Settings</strong> in the sidebar</li>
                      <li>Add this exact URL to <strong>"Valid OAuth Redirect URIs"</strong>: <code className="bg-background px-1 py-0.5 rounded break-all">{metaDebugInfo.redirectUri}</code></li>
                      <li>In <strong>App Settings {'>'} Basic</strong>, ensure <strong>App Domains</strong> includes: <code className="bg-background px-1 py-0.5 rounded">{metaDebugInfo.detectedHost}</code></li>
                    </ol>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setMetaDebugInfo(null)}>Dismiss</Button>
                </div>
              )}
              <p className="text-xs text-muted-foreground">Connect with Facebook to select your Page for publishing. Instagram will be auto-detected if linked.</p>
              <p className="text-xs text-muted-foreground">All posts publish to the same Facebook Page (and Instagram if linked).</p>

              {metaPages.length > 0 && (
                <div className="border rounded-md p-3 space-y-2">
                  <p className="text-sm font-medium">Select your Facebook Page ({metaPages.length} found):</p>
                  {metaPages.map((page: any) => (
                    <div key={page.id} className="flex items-center justify-between gap-2 p-2 border rounded-md hover-elevate" data-testid={`meta-page-${page.id}`}>
                      <div>
                        <p className="text-sm font-medium">{page.name}</p>
                        <p className="text-xs text-muted-foreground">
                          ID: {page.id}
                          {page.hasInstagram && <span className="ml-2 text-green-600">+ Instagram @{page.igUsername || ''}</span>}
                          {!page.hasInstagram && <span className="ml-2 text-muted-foreground">(no Instagram)</span>}
                        </p>
                      </div>
                      <Button size="sm" onClick={() => selectMetaPage(page)} data-testid={`button-select-page-${page.id}`}>Select</Button>
                    </div>
                  ))}
                </div>
              )}
              {loadingMetaPages && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading pages...</div>}

              {(s?.metaLongLivedToken && !isMetaConnected && metaPages.length === 0 && !loadingMetaPages) && (
                <div className="space-y-2">
                  {metaNoPagesMessage && (
                    <div className="border border-amber-300 dark:border-amber-700 rounded-md p-3 bg-amber-50 dark:bg-amber-950/30">
                      <p className="text-sm text-amber-800 dark:text-amber-200">{metaNoPagesMessage}</p>
                      {metaTokenPerms.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs text-muted-foreground">Granted permissions: {metaTokenPerms.filter((p: any) => p.status === 'granted').map((p: any) => p.permission).join(', ') || 'none'}</p>
                          <p className="text-xs text-muted-foreground">Declined permissions: {metaTokenPerms.filter((p: any) => p.status === 'declined').map((p: any) => p.permission).join(', ') || 'none'}</p>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" variant="outline" onClick={fetchMetaPages} data-testid="button-fetch-pages">
                      <RefreshCw className="h-4 w-4 mr-2" />Retry Loading Pages
                    </Button>
                    <Button size="sm" variant="outline" onClick={runMetaDiagnostics} disabled={loadingDiagnostics} data-testid="button-run-diagnostics">
                      {loadingDiagnostics ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Shield className="h-4 w-4 mr-2" />}
                      Run Diagnostics
                    </Button>
                    <Button size="sm" variant="outline" onClick={disconnectMeta} data-testid="button-disconnect-meta-pending">
                      <Unlink className="h-4 w-4 mr-2" />Disconnect & Reconnect
                    </Button>
                  </div>
                  {metaDiagnostics && (
                    <div className="border rounded-md p-3 space-y-3 bg-muted/30">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">Connection Diagnostics</p>
                        <Button size="sm" variant="ghost" onClick={() => setMetaDiagnostics(null)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      {metaDiagnostics.steps?.map((step: any, i: number) => (
                        <div key={i} className="flex items-start gap-2">
                          <div className="mt-0.5 shrink-0">
                            {step.status === 'ok' && <Check className="h-4 w-4 text-green-600" />}
                            {step.status === 'error' && <X className="h-4 w-4 text-red-500" />}
                            {step.status === 'warning' && <AlertTriangle className="h-4 w-4 text-amber-500" />}
                            {step.status === 'skipped' && <span className="h-4 w-4 inline-block text-center text-muted-foreground">-</span>}
                          </div>
                          <div>
                            <p className="text-xs font-medium">{step.step}</p>
                            <p className="text-xs text-muted-foreground break-all">{step.detail}</p>
                          </div>
                        </div>
                      ))}
                      {metaDiagnostics.pages && metaDiagnostics.pages.length > 0 && (
                        <div className="border-t pt-2">
                          <p className="text-xs font-medium mb-1">Pages found ({metaDiagnostics.pages.length}):</p>
                          {metaDiagnostics.pages.map((p: any) => (
                            <div key={p.id} className="text-xs text-muted-foreground ml-2">
                              {p.name} (ID: {p.id}) {p.ig ? `+ IG @${p.ig.username}` : ''} {p.tasks?.length ? `[roles: ${p.tasks.join(', ')}]` : ''} {p.source ? `[${p.source}]` : ''}
                            </div>
                          ))}
                        </div>
                      )}
                      {metaDiagnostics.businesses && metaDiagnostics.businesses.length > 0 && (
                        <div className="border-t pt-2">
                          <p className="text-xs font-medium mb-1">Business Portfolios ({metaDiagnostics.businesses.length}):</p>
                          {metaDiagnostics.businesses.map((biz: any) => (
                            <div key={biz.id} className="ml-2 mb-1">
                              <p className="text-xs font-medium">{biz.name} (ID: {biz.id})</p>
                              {biz.error && <p className="text-xs text-red-500 ml-2">Error: {biz.error}</p>}
                              {biz.pages?.map((p: any) => (
                                <div key={p.id} className="text-xs text-muted-foreground ml-2">
                                  {p.name} (ID: {p.id}) {p.ig ? `+ IG @${p.ig.username}` : '(no Instagram)'}
                                </div>
                              ))}
                              {biz.pages?.length === 0 && !biz.error && <p className="text-xs text-muted-foreground ml-2">No pages in this portfolio</p>}
                            </div>
                          ))}
                        </div>
                      )}
                      {metaDiagnostics.summary?.recommendations?.length > 0 && (
                        <div className="border-t pt-2">
                          <p className="text-xs font-medium mb-1">Recommendations:</p>
                          {metaDiagnostics.summary.recommendations.map((r: string, i: number) => (
                            <p key={i} className="text-xs text-amber-700 dark:text-amber-300 ml-2">
                              {i + 1}. {r}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div>
            <FieldTip label="Meta Publish Mode" tip="Controls how posts are published to Facebook and Instagram. All posts go to your selected Facebook Page (and linked Instagram if available)." />
            <Select value={form.metaPublishMode || 'draft_only'} onValueChange={v => updateField('metaPublishMode', v)}>
              <SelectTrigger data-testid="select-meta-mode"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft_only">Draft Only</SelectItem>
                <SelectItem value="publish_with_approval">Publish with Approval</SelectItem>
                <SelectItem value="auto_publish">Auto Publish</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 px-4 pt-4">
          <CardTitle className="text-sm">Google Business Profile (GBP)</CardTitle>
          {isGbpConnected && <Badge variant="outline" className="text-green-600 border-green-500/30">Connected</Badge>}
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          {isGbpConnected ? (
            <div className="border rounded-md p-3 space-y-2 border-green-500/30 bg-green-500/5">
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium">Google Business Profile Connected</span>
              </div>
              {s.gbpLocationNameNassau && (
                <div className="flex items-center gap-2 ml-6">
                  <MapPin className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Nassau: {s.gbpLocationNameNassau}</span>
                </div>
              )}
              {s.gbpLocationNameBrooklyn && (
                <div className="flex items-center gap-2 ml-6">
                  <MapPin className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Brooklyn: {s.gbpLocationNameBrooklyn}</span>
                </div>
              )}
              <div className="flex gap-2 mt-2">
                <Button size="sm" variant="outline" onClick={disconnectGbp} data-testid="button-disconnect-gbp">
                  <Unlink className="h-4 w-4 mr-2" />Disconnect
                </Button>
                <Button size="sm" variant="outline" onClick={() => { fetchGbpLocations(); }} disabled={loadingGbpLocations} data-testid="button-change-locations">
                  {loadingGbpLocations ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                  Change Locations
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setGbpTestResult(null); gbpTestMutation.mutate(); }} disabled={gbpTestMutation.isPending} data-testid="button-test-gbp">
                  {gbpTestMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Shield className="h-4 w-4 mr-2" />}
                  Test Connection
                </Button>
              </div>
              {gbpTestResult && <TestResultDisplay result={gbpTestResult} testId="gbp-test-result" />}
            </div>
          ) : (
            <div className="space-y-3">
              <Button size="sm" onClick={connectGbp} data-testid="button-connect-gbp">
                <Globe className="h-4 w-4 mr-2" />Connect Google Business
              </Button>
              <p className="text-xs text-muted-foreground">Connect with Google to select your business locations for Nassau and Brooklyn.</p>
            </div>
          )}

          {gbpLocations.length > 0 && (
            <div className="border rounded-md p-3 space-y-3">
              <p className="text-sm font-medium">Select your GBP locations:</p>
              <div>
                <Label>Nassau Location</Label>
                <Select value={selectedNassauLoc} onValueChange={setSelectedNassauLoc}>
                  <SelectTrigger data-testid="select-gbp-nassau"><SelectValue placeholder="Select Nassau location" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {gbpLocations.map((loc: any) => (
                      <SelectItem key={loc.name} value={loc.name}>{loc.title} - {loc.address}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Brooklyn Location</Label>
                <Select value={selectedBrooklynLoc} onValueChange={setSelectedBrooklynLoc}>
                  <SelectTrigger data-testid="select-gbp-brooklyn"><SelectValue placeholder="Select Brooklyn location" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {gbpLocations.map((loc: any) => (
                      <SelectItem key={loc.name} value={loc.name}>{loc.title} - {loc.address}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button size="sm" onClick={saveGbpLocations} data-testid="button-save-gbp-locations">
                Save Locations
              </Button>
            </div>
          )}
          {loadingGbpLocations && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading locations...</div>}

          {(s?.gbpConnected && !isGbpConnected && gbpLocations.length === 0 && !loadingGbpLocations) && (
            <Button size="sm" variant="outline" onClick={fetchGbpLocations} data-testid="button-fetch-locations">
              <RefreshCw className="h-4 w-4 mr-2" />Load Locations
            </Button>
          )}

          <div>
            <FieldTip label="GBP Publish Mode" tip="Controls how posts are published to Google Business Profile. Posts are automatically routed to the correct location based on market (Nassau or Brooklyn)." />
            <Select value={form.gbpPublishMode || 'draft_only'} onValueChange={v => updateField('gbpPublishMode', v)}>
              <SelectTrigger data-testid="select-gbp-mode"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft_only">Draft Only</SelectItem>
                <SelectItem value="publish_with_approval">Publish with Approval</SelectItem>
                <SelectItem value="auto_publish">Auto Publish</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 px-4 pt-4">
          <CardTitle className="text-sm">AI & Brand Settings</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <div>
            <FieldTip label="Brand Voice Notes" tip="Describe your company's personality and style. AI uses this to match your tone when writing content. Include key selling points, values, and how you want to come across to customers." />
            <Textarea value={form.brandVoiceNotes || ''} onChange={e => updateField('brandVoiceNotes', e.target.value)} placeholder="Professional yet approachable. Premium quality craftsmanship with attention to detail. Family-owned, serving the community for 10+ years. Known for clean work, on-time delivery, and transparent pricing." rows={3} data-testid="input-brand-notes" />
          </div>
          <div>
            <FieldTip label="Default CTA" tip="The call-to-action included at the end of generated content. This tells potential customers what to do next (call, visit website, request a quote, etc.)." />
            <Input value={form.defaultCta || ''} onChange={e => updateField('defaultCta', e.target.value)} placeholder="Call today for a free estimate! (516) 555-1234" data-testid="input-default-cta" />
          </div>
          <div className="flex items-center justify-between gap-2 pt-2 border-t">
            <div>
              <FieldTip label="Do customers visit your office?" tip="Turn this ON if you have a physical office or showroom that customers can visit. Turn it OFF if you work from a home address or operate remotely — the AI will still show your address for SEO but won't invite customers to visit." />
            </div>
            <Switch checked={!!(form as any).customerVisits} onCheckedChange={v => updateField('customerVisits', v)} data-testid="switch-customer-visits" />
          </div>
        </CardContent>
      </Card>

      <OwnerTeamPhotosCard settings={settings} />
      <ServiceThumbnailsCard settings={settings} />
      <TrustBadgesCard settings={settings} />

      <Card>
        <CardHeader className="pb-2 px-4 pt-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Automated Post Triggers
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-4">
          <p className="text-xs text-muted-foreground">
            When enabled, AI-generated posts are automatically created and added to your Queue for review when these business events occur. Nothing publishes without your approval.
          </p>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <FieldTip label="Estimate Created" tip="When you create a new estimate, an 'in your neighborhood' post is generated to let nearby prospects know you're working in the area." />
              </div>
              <Switch checked={!!(form as any).autoTriggerEstimate} onCheckedChange={v => updateField('autoTriggerEstimate', v)} data-testid="switch-auto-estimate" />
            </div>
            <div className="flex items-center justify-between gap-2">
              <div>
                <FieldTip label="Project Started" tip="When a project moves to 'In Progress', an engagement post is generated to build anticipation about the transformation underway." />
              </div>
              <Switch checked={!!(form as any).autoTriggerProjectStarted} onCheckedChange={v => updateField('autoTriggerProjectStarted', v)} data-testid="switch-auto-started" />
            </div>
            <div className="flex items-center justify-between gap-2">
              <div>
                <FieldTip label="Project Completed" tip="When a project is marked complete, a showcase post is generated highlighting the finished work and inviting new customers." />
              </div>
              <Switch checked={!!(form as any).autoTriggerProjectCompleted} onCheckedChange={v => updateField('autoTriggerProjectCompleted', v)} data-testid="switch-auto-completed" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending} data-testid="button-save-settings">
        {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        Save Settings
      </Button>
    </div>
  );
}

function OwnerTeamPhotosCard({ settings }: { settings: GamePlanSettings | null | undefined }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [owner, setOwner] = useState<{ imageUrl: string; name: string; title: string } | null>(null);
  const [team, setTeam] = useState<Array<{ imageUrl: string; name: string; role: string }>>([]);
  const [groupPhotos, setGroupPhotos] = useState<Array<{ imageUrl: string; caption?: string }>>([]);
  const [loaded, setLoaded] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('');

  useEffect(() => {
    if (settings && !loaded) {
      setOwner((settings as any).ownerPhoto || null);
      setTeam((settings as any).teamPhotos || []);
      const gp = (settings as any).teamGroupPhoto;
      setGroupPhotos(Array.isArray(gp) ? gp : gp ? [gp] : []);
      setLoaded(true);
    }
  }, [settings, loaded]);

  const saveMutation = useMutation({
    mutationFn: (data: any) => apiRequest('PUT', '/api/admin/gameplan/settings', data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/admin/gameplan/settings'] }); toast({ title: "Photos saved" }); },
    onError: (err: any) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  const handleOwnerUpload = async (file: File) => {
    const formData = new FormData();
    formData.append('image', file);
    formData.append('slug', 'owner-photo');
    try {
      const res = await fetch('/api/admin/gameplan/owner-photo/upload', { method: 'POST', credentials: 'include', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setOwner(prev => ({ name: prev?.name || '', title: prev?.title || '', imageUrl: data.imageUrl + '?v=' + Date.now() }));
      toast({ title: "Owner photo uploaded" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    }
  };

  const handleTeamUpload = async (index: number, file: File) => {
    const formData = new FormData();
    formData.append('image', file);
    formData.append('slug', `team-${index}`);
    try {
      const res = await fetch('/api/admin/gameplan/team-photo/upload', { method: 'POST', credentials: 'include', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setTeam(prev => prev.map((t, i) => i === index ? { ...t, imageUrl: data.imageUrl + '?v=' + Date.now() } : t));
      toast({ title: "Team photo uploaded" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    }
  };

  const handleGroupPhotoUpload = async (index: number, file: File) => {
    const formData = new FormData();
    formData.append('image', file);
    formData.append('slug', `team-group-${index}`);
    try {
      const res = await fetch('/api/admin/gameplan/team-photo/upload', { method: 'POST', credentials: 'include', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setGroupPhotos(prev => prev.map((g, i) => i === index ? { ...g, imageUrl: data.imageUrl + '?v=' + Date.now() } : g));
      toast({ title: "Group photo uploaded" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    }
  };

  const addTeamMember = () => {
    if (!newName.trim()) return;
    setTeam(prev => [...prev, { name: newName.trim(), role: newRole.trim() || 'Team Member', imageUrl: '' }]);
    setNewName('');
    setNewRole('');
  };

  return (
    <Card>
      <CardHeader className="pb-2 px-4 pt-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <User className="h-4 w-4" />
          Owner & Team Photos
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-4">
        <p className="text-xs text-muted-foreground">
          Upload a photo of the owner and optional team members. The owner photo appears in the "Meet the Owner" section on every generated page. Team photos create a "Meet the Team" section.
        </p>

        <div className="border rounded-md p-3 space-y-3">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Owner</div>
          <div className="flex items-start gap-3">
            {owner?.imageUrl ? (
              <img src={owner.imageUrl} alt={owner.name} className="h-20 w-20 rounded-full object-cover shrink-0 border-2 border-primary/20" />
            ) : (
              <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center shrink-0">
                <User className="h-8 w-8 text-muted-foreground" />
              </div>
            )}
            <div className="flex-1 space-y-2 min-w-0">
              <Input value={owner?.name || ''} onChange={e => setOwner(prev => ({ imageUrl: prev?.imageUrl || '', title: prev?.title || '', name: e.target.value }))} placeholder="Owner name" className="h-8 text-sm" data-testid="input-owner-name" />
              <Input value={owner?.title || ''} onChange={e => setOwner(prev => ({ imageUrl: prev?.imageUrl || '', name: prev?.name || '', title: e.target.value }))} placeholder="Title (e.g. Owner & Lead Painter)" className="h-8 text-sm" data-testid="input-owner-title" />
              <label>
                <input type="file" accept="image/*" className="hidden" onChange={e => { if (e.target.files?.[0]) handleOwnerUpload(e.target.files[0]); }} data-testid="input-owner-upload" />
                <Button size="sm" variant="outline" className="h-7" asChild><span><Upload className="h-3.5 w-3.5 mr-1" /> Upload Photo</span></Button>
              </label>
            </div>
          </div>
        </div>

        <div className="border rounded-md p-3 space-y-3">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <Users className="h-3.5 w-3.5" /> Team Members
          </div>
          {team.length === 0 && (
            <div className="text-xs text-muted-foreground italic">No team members added. Only the owner section will appear on pages.</div>
          )}
          {team.map((member, i) => (
            <div key={i} className="flex items-center gap-2 border rounded-md p-2" data-testid={`team-member-${i}`}>
              {member.imageUrl ? (
                <img src={member.imageUrl} alt={member.name} className="h-12 w-12 rounded-full object-cover shrink-0" />
              ) : (
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <User className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0 space-y-1">
                <Input value={member.name} onChange={e => setTeam(prev => prev.map((t, idx) => idx === i ? { ...t, name: e.target.value } : t))} className="h-7 text-sm border-0 p-0 focus-visible:ring-0 font-medium" data-testid={`input-team-name-${i}`} />
                <Input value={member.role} onChange={e => setTeam(prev => prev.map((t, idx) => idx === i ? { ...t, role: e.target.value } : t))} className="h-6 text-xs border-0 p-0 focus-visible:ring-0 text-muted-foreground" data-testid={`input-team-role-${i}`} />
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <label>
                  <input type="file" accept="image/*" className="hidden" onChange={e => { if (e.target.files?.[0]) handleTeamUpload(i, e.target.files[0]); }} data-testid={`input-team-upload-${i}`} />
                  <Button size="sm" variant="outline" className="h-7 px-2" asChild><span><Upload className="h-3.5 w-3.5" /></span></Button>
                </label>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600" onClick={() => setTeam(prev => prev.filter((_, idx) => idx !== i))} data-testid={`button-remove-team-${i}`}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
          <div className="flex gap-2">
            <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Name" className="h-8 text-sm" data-testid="input-new-team-name" />
            <Input value={newRole} onChange={e => setNewRole(e.target.value)} placeholder="Role" className="h-8 text-sm w-32" data-testid="input-new-team-role" />
            <Button size="sm" variant="outline" onClick={addTeamMember} disabled={!newName.trim()} data-testid="button-add-team"><Plus className="h-4 w-4" /></Button>
          </div>
        </div>

        <div className="border rounded-md p-3 space-y-3">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <Users className="h-3.5 w-3.5" /> Team Group Photos
          </div>
          <p className="text-xs text-muted-foreground">
            Add group photos of the whole team or parts of the crew. Each photo appears in the "Meet the Team" section on generated pages. Add as many as you need — full team, job site crews, etc.
          </p>
          {groupPhotos.length === 0 && (
            <div className="text-xs text-muted-foreground italic">No group photos added yet. Click the button below to add one.</div>
          )}
          {groupPhotos.map((gp, i) => (
            <div key={i} className="flex items-start gap-3 border rounded-md p-2" data-testid={`group-photo-${i}`}>
              {gp.imageUrl ? (
                <img src={gp.imageUrl} alt={gp.caption || 'Team group photo'} className="h-20 w-32 rounded-lg object-cover shrink-0 border" />
              ) : (
                <div className="h-20 w-32 rounded-lg bg-muted flex items-center justify-center shrink-0 border border-dashed">
                  <Users className="h-6 w-6 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 space-y-2 min-w-0">
                <Input value={gp.caption || ''} onChange={e => setGroupPhotos(prev => prev.map((g, idx) => idx === i ? { ...g, caption: e.target.value } : g))} placeholder="Caption (e.g. Our crew on-site in Elmont)" className="h-8 text-sm" data-testid={`input-group-caption-${i}`} />
                <div className="flex items-center gap-1">
                  <label>
                    <input type="file" accept="image/*" className="hidden" onChange={e => { if (e.target.files?.[0]) handleGroupPhotoUpload(i, e.target.files[0]); }} data-testid={`input-group-upload-${i}`} />
                    <Button size="sm" variant="outline" className="h-7 px-2" asChild><span><Upload className="h-3.5 w-3.5" /></span></Button>
                  </label>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600" onClick={() => setGroupPhotos(prev => prev.filter((_, idx) => idx !== i))} data-testid={`button-remove-group-${i}`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={() => setGroupPhotos(prev => [...prev, { imageUrl: '', caption: '' }])} data-testid="button-add-group-photo">
            <Plus className="h-4 w-4 mr-1" /> Add Group Photo
          </Button>
        </div>

        <Button size="sm" onClick={() => saveMutation.mutate({ ownerPhoto: owner, teamPhotos: team, teamGroupPhoto: groupPhotos })} disabled={saveMutation.isPending} data-testid="button-save-owner-team">
          {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
          Save Photos
        </Button>
      </CardContent>
    </Card>
  );
}

function ServiceThumbnailsCard({ settings }: { settings: GamePlanSettings | null | undefined }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [thumbnails, setThumbnails] = useState<Array<{ slug: string; label: string; imageUrl: string }>>([]);
  const [loaded, setLoaded] = useState(false);
  const [newLabel, setNewLabel] = useState('');

  useEffect(() => {
    if (settings && !loaded) {
      setThumbnails((settings as any).serviceThumbnails || []);
      setLoaded(true);
    }
  }, [settings, loaded]);

  const saveMutation = useMutation({
    mutationFn: (data: any) => apiRequest('PUT', '/api/admin/gameplan/settings', data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/admin/gameplan/settings'] }); toast({ title: "Service thumbnails saved" }); },
    onError: (err: any) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  const handleUpload = async (index: number, file: File) => {
    const slug = thumbnails[index].slug;
    const formData = new FormData();
    formData.append('image', file);
    formData.append('slug', slug);
    try {
      const res = await fetch('/api/admin/gameplan/service-thumbnails/upload', {
        method: 'POST', credentials: 'include', body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setThumbnails(prev => prev.map((t, i) => i === index ? { ...t, imageUrl: data.imageUrl + '?v=' + Date.now() } : t));
      toast({ title: "Photo uploaded" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    }
  };

  const addService = () => {
    if (!newLabel.trim()) return;
    const slug = newLabel.trim().toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');
    if (thumbnails.some(t => t.slug === slug)) {
      toast({ title: "Service already exists", variant: "destructive" });
      return;
    }
    setThumbnails(prev => [...prev, { slug, label: newLabel.trim(), imageUrl: '' }]);
    setNewLabel('');
  };

  const removeService = (index: number) => {
    setThumbnails(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <Card>
      <CardHeader className="pb-2 px-4 pt-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <Image className="h-4 w-4" />
          Service Thumbnails
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        <p className="text-xs text-muted-foreground">
          Upload photos for each service. These images are used on all generated website pages as service card thumbnails. Use real photos of your work for best results.
        </p>
        {thumbnails.length === 0 && (
          <div className="border border-dashed rounded-md p-6 text-center text-muted-foreground text-sm">
            No services added yet.
          </div>
        )}
        <div className="space-y-3">
          {thumbnails.map((thumb, i) => (
            <div key={thumb.slug} className="border rounded-md p-3 space-y-2" data-testid={`service-thumb-${i}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {thumb.imageUrl ? (
                    <img src={thumb.imageUrl} alt={thumb.label} className="h-12 w-16 rounded object-cover shrink-0" />
                  ) : (
                    <div className="h-12 w-16 rounded bg-muted flex items-center justify-center shrink-0">
                      <Image className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <Input
                      value={thumb.label}
                      onChange={e => setThumbnails(prev => prev.map((t, idx) => idx === i ? { ...t, label: e.target.value } : t))}
                      className="h-7 text-sm font-medium border-0 p-0 focus-visible:ring-0"
                      data-testid={`input-thumb-label-${i}`}
                    />
                    <span className="text-[10px] text-muted-foreground">{thumb.imageUrl || 'No photo yet'}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <label>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={e => { if (e.target.files?.[0]) handleUpload(i, e.target.files[0]); }}
                      data-testid={`input-thumb-upload-${i}`}
                    />
                    <Button size="sm" variant="outline" className="h-7 px-2" asChild>
                      <span><Upload className="h-3.5 w-3.5" /></span>
                    </Button>
                  </label>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600" onClick={() => removeService(i)} data-testid={`button-remove-thumb-${i}`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            placeholder="Service name (e.g. Kitchen Painting)"
            className="h-8 text-sm"
            onKeyDown={e => { if (e.key === 'Enter') addService(); }}
            data-testid="input-new-service-name"
          />
          <Button size="sm" variant="outline" onClick={addService} disabled={!newLabel.trim()} data-testid="button-add-service">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {thumbnails.length > 0 && (
          <Button size="sm" onClick={() => saveMutation.mutate({ serviceThumbnails: thumbnails })} disabled={saveMutation.isPending} data-testid="button-save-thumbnails">
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
            Save Services
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function TrustBadgesCard({ settings }: { settings: GamePlanSettings | null | undefined }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [badges, setBadges] = useState<Array<{ id: string; label: string; imageUrl: string }>>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (settings && !loaded) {
      setBadges((settings as any).trustBadges || []);
      setLoaded(true);
    }
  }, [settings, loaded]);

  const saveBadgesMutation = useMutation({
    mutationFn: (data: any) => apiRequest('PUT', '/api/admin/gameplan/settings', data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/admin/gameplan/settings'] }); toast({ title: "Trust badges saved" }); },
    onError: (err: any) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  const addBadge = () => {
    setBadges(prev => [...prev, { id: `badge-${Date.now()}`, label: '', imageUrl: '' }]);
  };

  const updateBadge = (index: number, field: 'label' | 'imageUrl', value: string) => {
    setBadges(prev => prev.map((b, i) => i === index ? { ...b, [field]: value } : b));
  };

  const removeBadge = (index: number) => {
    setBadges(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <Card>
      <CardHeader className="pb-2 px-4 pt-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Trust Badges & Certifications
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        <p className="text-xs text-muted-foreground">
          Upload your certification badges (PCA, EPA Lead-Safe, Google Guaranteed, etc.). These appear on generated website pages to build trust with visitors.
        </p>
        {badges.length === 0 && (
          <div className="border border-dashed rounded-md p-6 text-center text-muted-foreground text-sm">
            No trust badges added yet. Click below to add your first certification badge.
          </div>
        )}
        <div className="space-y-3">
          {badges.map((badge, i) => (
            <div key={badge.id} className="border rounded-md p-3 space-y-2" data-testid={`trust-badge-${i}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">Badge #{i + 1}</span>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600" onClick={() => removeBadge(i)} data-testid={`button-remove-badge-${i}`}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div>
                <Label className="text-xs">Label</Label>
                <Input value={badge.label} onChange={e => updateBadge(i, 'label', e.target.value)} placeholder="e.g. EPA Lead-Safe Certified" className="h-8 text-sm" data-testid={`input-badge-label-${i}`} />
              </div>
              <div>
                <Label className="text-xs">Image URL</Label>
                <Input value={badge.imageUrl} onChange={e => updateBadge(i, 'imageUrl', e.target.value)} placeholder="https://example.com/badge.png" className="h-8 text-sm" data-testid={`input-badge-url-${i}`} />
              </div>
              {badge.imageUrl && (
                <div className="flex items-center gap-3 p-2 bg-muted/50 rounded">
                  <img src={badge.imageUrl} alt={badge.label || 'Badge preview'} className="h-10 w-auto max-w-[120px] object-contain" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  <span className="text-xs text-muted-foreground truncate">{badge.label || 'Untitled badge'}</span>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={addBadge} data-testid="button-add-badge">
            <Plus className="h-4 w-4 mr-1" /> Add Badge
          </Button>
          {badges.length > 0 && (
            <Button size="sm" onClick={() => saveBadgesMutation.mutate({ trustBadges: badges })} disabled={saveBadgesMutation.isPending} data-testid="button-save-badges">
              {saveBadgesMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
              Save Badges
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function TestResultDisplay({ result, testId }: { result: any; testId: string }) {
  return (
    <div className={`border rounded-md p-3 text-sm space-y-2 ${result.success ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'}`} data-testid={testId}>
      <div className="flex items-center gap-2">
        {result.success ? <Check className="h-4 w-4 text-green-600" /> : <X className="h-4 w-4 text-red-600" />}
        <span className="font-medium">{result.success ? 'Connection Successful' : 'Connection Failed'}</span>
      </div>
      {result.error && (
        <p className="text-xs text-red-600 dark:text-red-400">{typeof result.error === 'string' ? result.error : JSON.stringify(result.error)}</p>
      )}
      {result.steps?.map((step: any, i: number) => (
        <div key={i} className="border-t pt-2">
          <div className="flex items-center gap-2">
            {step.success ? <Check className="h-3 w-3 text-green-600" /> : <X className="h-3 w-3 text-red-600" />}
            <span className="text-xs font-medium">{step.step}</span>
            {step.status && <Badge variant="outline" className="text-xs">{step.status}</Badge>}
          </div>
          {step.success && step.data && (
            <pre className="mt-1 ml-5 text-xs text-muted-foreground whitespace-pre-wrap max-h-[200px] overflow-auto">{JSON.stringify(step.data, null, 2)}</pre>
          )}
          {!step.success && step.data && (
            <pre className="mt-1 ml-5 text-xs text-red-600 dark:text-red-400 whitespace-pre-wrap max-h-[200px] overflow-auto">{typeof step.data === 'string' ? step.data : JSON.stringify(step.data, null, 2)}</pre>
          )}
          {step.error && (
            <p className="mt-1 ml-5 text-xs text-red-600 dark:text-red-400">{step.error}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function HistoryTab() {
  const { data: history = [], isLoading } = useQuery<GamePlanHistoryEntry[]>({
    queryKey: ['/api/admin/gameplan/history'],
  });

  if (isLoading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="max-w-3xl space-y-2" data-testid="history-tab">
      {history.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">No history yet.</CardContent></Card>
      ) : (
        history.map(entry => (
          <div key={entry.id} className="flex items-center gap-3 p-2 border-b last:border-0" data-testid={`history-entry-${entry.id}`}>
            <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
              {entry.action === 'generated' && <Sparkles className="h-4 w-4" />}
              {entry.action === 'approved' && <Check className="h-4 w-4 text-green-600" />}
              {entry.action === 'rejected' && <X className="h-4 w-4 text-red-600" />}
              {entry.action === 'published' && <Globe className="h-4 w-4 text-blue-600" />}
              {entry.action === 'triggered' && <Zap className="h-4 w-4 text-amber-500" />}
              {entry.action === 'created' && <Plus className="h-4 w-4" />}
              {entry.action === 'updated' && <SettingsIcon className="h-4 w-4" />}
              {entry.action === 'seed' && <RefreshCw className="h-4 w-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate">{entry.summary}</p>
              <p className="text-xs text-muted-foreground">
                {entry.entityType} {entry.action} {entry.createdAt ? `- ${new Date(entry.createdAt).toLocaleString()}` : ''}
              </p>
            </div>
          </div>
        ))
      )}
    </div>
  );
}