import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

const isNative = () => {
  const Cap = (window as any).Capacitor;
  return Cap?.isNativePlatform?.() || Cap?.isNative || false;
};

export function useSwipeBack(onBack: () => void) {
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  useEffect(() => {
    if (!isNative()) return;

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (touch.clientX < 30) {
        touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!touchStartRef.current) return;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - touchStartRef.current.x;
      const dy = Math.abs(touch.clientY - touchStartRef.current.y);
      const dt = Date.now() - touchStartRef.current.time;
      touchStartRef.current = null;

      if (dx > 80 && dy < 100 && dt < 400) {
        onBack();
      }
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [onBack]);
}

export function usePullToRefresh(
  containerRef: React.RefObject<HTMLElement | null>,
  queryKeys: string[][],
  options?: { enabled?: boolean }
) {
  const queryClient = useQueryClient();
  const touchStartRef = useRef<{ y: number; scrollTop: number } | null>(null);
  const pullIndicatorRef = useRef<HTMLDivElement | null>(null);
  const isRefreshingRef = useRef(false);
  const enabled = options?.enabled !== false;

  const doRefresh = useCallback(async () => {
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    try {
      await Promise.all(queryKeys.map(key => queryClient.invalidateQueries({ queryKey: key })));
    } finally {
      setTimeout(() => {
        isRefreshingRef.current = false;
      }, 500);
    }
  }, [queryClient, queryKeys]);

  useEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    if (!container) return;

    let indicator = pullIndicatorRef.current;
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.className = 'pull-refresh-indicator';
      indicator.style.cssText = `
        position: absolute; top: 0; left: 0; right: 0; height: 0;
        display: flex; align-items: center; justify-content: center;
        overflow: hidden; transition: height 0.2s ease;
        z-index: 50; pointer-events: none;
      `;
      indicator.innerHTML = `<div style="width: 24px; height: 24px; border: 2px solid hsl(var(--primary)); border-top-color: transparent; border-radius: 50%; opacity: 0.7;"></div>`;
      container.style.position = 'relative';
      container.insertBefore(indicator, container.firstChild);
      pullIndicatorRef.current = indicator;
    }

    const handleTouchStart = (e: TouchEvent) => {
      if (isRefreshingRef.current) return;
      const scrollTop = container.scrollTop;
      if (scrollTop <= 0) {
        touchStartRef.current = { y: e.touches[0].clientY, scrollTop };
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!touchStartRef.current || isRefreshingRef.current) return;
      if (container.scrollTop > 0) {
        touchStartRef.current = null;
        if (indicator) indicator.style.height = '0px';
        return;
      }
      const dy = e.touches[0].clientY - touchStartRef.current.y;
      if (dy > 0 && dy < 120) {
        const height = Math.min(dy * 0.5, 50);
        if (indicator) {
          indicator.style.height = `${height}px`;
          indicator.style.transition = 'none';
          const spinner = indicator.firstElementChild as HTMLElement;
          if (spinner) {
            spinner.style.transform = `rotate(${dy * 3}deg)`;
            spinner.style.opacity = `${Math.min(dy / 60, 1)}`;
          }
        }
      }
    };

    const handleTouchEnd = () => {
      if (!touchStartRef.current) return;
      const pullDistance = indicator ? parseFloat(indicator.style.height) : 0;
      touchStartRef.current = null;

      if (indicator) {
        indicator.style.transition = 'height 0.2s ease';
      }

      if (pullDistance > 35) {
        if (indicator) {
          indicator.style.height = '40px';
          const spinner = indicator.firstElementChild as HTMLElement;
          if (spinner) {
            spinner.style.animation = 'spin 0.6s linear infinite';
          }
        }
        doRefresh().then(() => {
          if (indicator) {
            indicator.style.height = '0px';
            const spinner = indicator.firstElementChild as HTMLElement;
            if (spinner) spinner.style.animation = '';
          }
        });
      } else {
        if (indicator) indicator.style.height = '0px';
      }
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: true });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });
    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      if (indicator && indicator.parentNode) {
        indicator.parentNode.removeChild(indicator);
        pullIndicatorRef.current = null;
      }
    };
  }, [containerRef, enabled, doRefresh]);
}
