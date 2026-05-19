import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { GraduationCap, Search, Play, BookOpen, Settings, Plug, FileText, FolderKanban, Users, MessageSquare, CreditCard } from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type HelpTutorial = {
  id: number;
  title: string;
  description: string | null;
  category: string;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  recordingNotes: string | null;
  sortOrder: number;
  published: boolean;
  createdAt: string | null;
};

const CATEGORY_META: Record<string, { label: string; icon: any; description: string }> = {
  overview: { label: 'Getting Started', icon: BookOpen, description: 'Get up and running with Fuse Phone' },
  settings: { label: 'Settings', icon: Settings, description: 'Configure your account and preferences' },
  integrations: { label: 'Integrations', icon: Plug, description: 'Connect your tools and services' },
  documents: { label: 'Documents', icon: FileText, description: 'Estimates, proposals & invoices' },
  projects: { label: 'Projects', icon: FolderKanban, description: 'Manage your project pipeline' },
  contacts: { label: 'Contacts', icon: Users, description: 'Leads & client management' },
  communication: { label: 'Communication', icon: MessageSquare, description: 'Messages, calls & campaigns' },
  billing: { label: 'Billing', icon: CreditCard, description: 'Plans & payment management' },
};

function getLoomEmbedUrl(url: string) {
  const match = url.match(/loom\.com\/share\/([a-zA-Z0-9]+)/);
  if (match) return `https://www.loom.com/embed/${match[1]}`;
  if (url.includes('loom.com/embed/')) return url;
  return url;
}

function getLoomThumbnail(url: string) {
  const match = url.match(/loom\.com\/share\/([a-zA-Z0-9]+)/);
  if (match) return `https://cdn.loom.com/sessions/thumbnails/${match[1]}-with-play.gif`;
  return null;
}

function isNewTutorial(createdAt: string | null) {
  if (!createdAt) return false;
  const created = new Date(createdAt);
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  return created > sevenDaysAgo;
}

export default function HelpCenter() {
  const [search, setSearch] = useState('');
  const [selectedTutorial, setSelectedTutorial] = useState<HelpTutorial | null>(null);

  const { data: tutorials, isLoading } = useQuery<HelpTutorial[]>({
    queryKey: ["/api/help/tutorials"],
  });

  const withVideos = tutorials?.filter(t => !!t.videoUrl) || [];

  const filtered = withVideos.filter(t => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return t.title.toLowerCase().includes(q) ||
      (t.description && t.description.toLowerCase().includes(q)) ||
      t.category.toLowerCase().includes(q);
  });

  const categorized = Object.keys(CATEGORY_META).map(cat => ({
    ...CATEGORY_META[cat],
    key: cat,
    tutorials: filtered.filter(t => t.category === cat).sort((a, b) => a.sortOrder - b.sortOrder),
  })).filter(cat => cat.tutorials.length > 0);

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <GraduationCap className="w-7 h-7 text-primary" />
        <h1 className="text-2xl font-bold" data-testid="text-help-title">Fuse University</h1>
      </div>
      <p className="text-muted-foreground text-sm mb-6">
        Video tutorials to help you master Fuse Phone
      </p>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search tutorials..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          data-testid="input-search-tutorials"
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <Card key={i} className="animate-pulse">
              <CardContent className="pt-4">
                <div className="bg-muted rounded-lg h-32 mb-3" />
                <div className="bg-muted rounded h-4 w-3/4 mb-2" />
                <div className="bg-muted rounded h-3 w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : categorized.length === 0 ? (
        <div className="text-center py-16">
          <BookOpen className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">
            {search ? 'No tutorials match your search' : 'New videos are on the way'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {search ? 'Try a different search term' : 'We\'re building video guides to help you get the most out of Fuse Phone. Check back soon!'}
          </p>
        </div>
      ) : (
        categorized.map(cat => {
          const Icon = cat.icon;
          return (
            <div key={cat.key} className="mb-8">
              <div className="flex items-center gap-2 mb-1">
                <Icon className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-semibold">{cat.label}</h2>
                <Badge variant="secondary" className="text-[10px]">{cat.tutorials.length}</Badge>
              </div>
              <p className="text-xs text-muted-foreground mb-4 ml-7">{cat.description}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {cat.tutorials.map(t => {
                  const thumbnail = t.thumbnailUrl || (t.videoUrl ? getLoomThumbnail(t.videoUrl) : null);
                  const isNew = isNewTutorial(t.createdAt);
                  const hasVideo = !!t.videoUrl;
                  return (
                    <Card
                      key={t.id}
                      className={`transition-colors group ${hasVideo ? 'cursor-pointer hover:border-primary/40' : 'opacity-60'}`}
                      onClick={() => hasVideo && setSelectedTutorial(t)}
                      data-testid={`tutorial-card-${t.id}`}
                    >
                      <CardContent className="pt-4 pb-4">
                        <div className="relative bg-muted rounded-lg overflow-hidden mb-3 aspect-video flex items-center justify-center">
                          {thumbnail ? (
                            <img
                              src={thumbnail}
                              alt={t.title}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="flex flex-col items-center gap-1">
                              <Play className="w-8 h-8 text-muted-foreground/30" />
                              {!hasVideo && (
                                <span className="text-[10px] text-muted-foreground/50">Coming soon</span>
                              )}
                            </div>
                          )}
                          {hasVideo && (
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                              <div className="w-12 h-12 rounded-full bg-primary/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <Play className="w-5 h-5 text-primary-foreground ml-0.5" />
                              </div>
                            </div>
                          )}
                          {isNew && (
                            <div className="absolute top-2 right-2">
                              <Badge className="text-[10px] bg-green-500 text-white border-0">New</Badge>
                            </div>
                          )}
                        </div>
                        <p className="font-medium text-sm line-clamp-2" data-testid={`text-tutorial-title-${t.id}`}>{t.title}</p>
                        {t.description && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.description}</p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })
      )}

      <Dialog open={!!selectedTutorial} onOpenChange={(open) => !open && setSelectedTutorial(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle data-testid="text-video-dialog-title">{selectedTutorial?.title}</DialogTitle>
          </DialogHeader>
          {selectedTutorial?.videoUrl && (
            <div className="relative w-full rounded-lg overflow-hidden" style={{ paddingBottom: '56.25%' }}>
              <iframe
                src={getLoomEmbedUrl(selectedTutorial.videoUrl)}
                className="absolute inset-0 w-full h-full"
                frameBorder="0"
                allowFullScreen
              />
            </div>
          )}
          {selectedTutorial?.description && (
            <p className="text-sm text-muted-foreground mt-2">{selectedTutorial.description}</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
