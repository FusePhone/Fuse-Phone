import { useState } from "react";
import { X, MessageCircle } from "lucide-react";

const STORAGE_KEY = 'fuse_feature_banner_counts';
const MAX_DISMISSALS = 3;

function getDismissCount(id: string): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const counts: Record<string, number> = JSON.parse(stored);
      return counts[id] || 0;
    }
  } catch {}
  return 0;
}

function incrementDismiss(id: string): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const counts: Record<string, number> = stored ? JSON.parse(stored) : {};
    counts[id] = (counts[id] || 0) + 1;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(counts));
    return counts[id];
  } catch { return MAX_DISMISSALS; }
}

interface FeatureTipBannerProps {
  id: string;
  title: string;
  description: string;
}

export function FeatureTipBanner({ id, title, description }: FeatureTipBannerProps) {
  const [visible, setVisible] = useState(() => getDismissCount(id) < MAX_DISMISSALS);

  if (!visible) return null;

  const handleDismiss = () => {
    incrementDismiss(id);
    setVisible(false);
  };

  return (
    <div
      className="flex items-start gap-3 rounded-md border border-primary/15 bg-primary/5 px-4 py-3"
      data-testid={`feature-tip-banner-${id}`}
    >
      <div className="shrink-0 mt-0.5">
        <MessageCircle className="w-4 h-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-tight">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
          {description} Have questions? Tap the chat bubble to send us a message anytime.
        </p>
      </div>
      <button
        onClick={handleDismiss}
        className="shrink-0 text-muted-foreground mt-0.5"
        data-testid={`button-dismiss-feature-tip-${id}`}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
