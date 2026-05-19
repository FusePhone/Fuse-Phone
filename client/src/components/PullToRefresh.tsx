import { useRef, useEffect, useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const isNative = () => {
  const Cap = (window as any).Capacitor;
  return Cap?.isNativePlatform?.() || Cap?.isNative || false;
};

interface PullToRefreshProps {
  children: React.ReactNode;
  queryKeys: string[][];
  className?: string;
}

export function PullToRefresh({ children, queryKeys, className }: PullToRefreshProps) {
  const queryClient = useQueryClient();
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ y: number } | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const native = isNative();

  const doRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await Promise.all(queryKeys.map(key => queryClient.invalidateQueries({ queryKey: key })));
      await new Promise(r => setTimeout(r, 600));
    } finally {
      setIsRefreshing(false);
      setPullDistance(0);
    }
  }, [queryClient, queryKeys, isRefreshing]);

  useEffect(() => {
    if (!native) return;
    const container = containerRef.current;
    if (!container) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (isRefreshing) return;
      if (container.scrollTop <= 0) {
        touchStartRef.current = { y: e.touches[0].clientY };
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!touchStartRef.current || isRefreshing) return;
      if (container.scrollTop > 0) {
        touchStartRef.current = null;
        setPullDistance(0);
        return;
      }
      const dy = e.touches[0].clientY - touchStartRef.current.y;
      if (dy > 0) {
        const dampened = Math.min(dy * 0.4, 80);
        setPullDistance(dampened);
      }
    };

    const handleTouchEnd = () => {
      if (!touchStartRef.current) return;
      touchStartRef.current = null;
      if (pullDistance > 45) {
        doRefresh();
      } else {
        setPullDistance(0);
      }
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: true });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });
    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [native, isRefreshing, pullDistance, doRefresh]);

  if (!native) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div ref={containerRef} className={cn("relative", className)} style={{ overscrollBehavior: 'none' }}>
      <div
        className="flex items-center justify-center overflow-hidden transition-all duration-200 ease-out"
        style={{ height: isRefreshing ? 40 : pullDistance > 0 ? pullDistance : 0 }}
      >
        <Loader2
          className={cn(
            "w-5 h-5 text-primary transition-opacity",
            isRefreshing ? "animate-spin opacity-70" : pullDistance > 30 ? "opacity-70" : "opacity-30"
          )}
          style={!isRefreshing ? { transform: `rotate(${pullDistance * 4}deg)` } : undefined}
        />
      </div>
      {children}
    </div>
  );
}
