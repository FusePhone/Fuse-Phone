import { useRef, useState, useEffect } from "react";
import { Check, X, ChevronLeft, ChevronRight, Crown } from "lucide-react";
import type { PackageSnapshot } from "@shared/schema";

function buildGlobalFeatureOrder(packages: PackageSnapshot[]): string[] {
  const order: string[] = [];
  const seen = new Set<string>();
  for (const pkg of packages) {
    for (const f of (pkg.features || [])) {
      if (f.included && !seen.has(f.name)) {
        order.push(f.name);
        seen.add(f.name);
      }
    }
  }
  for (const pkg of packages) {
    for (const f of (pkg.features || [])) {
      if (!seen.has(f.name)) {
        order.push(f.name);
        seen.add(f.name);
      }
    }
  }
  return order;
}

interface PackageCardProps {
  pkg: PackageSnapshot;
  price: number;
  selected: boolean;
  onSelect: () => void;
  globalFeatureOrder: string[];
  brandColor?: string;
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function PackageCard({ pkg, price, selected, onSelect, globalFeatureOrder, brandColor }: PackageCardProps) {
  const activeFeatures = (pkg.features || []).filter(f => f.active !== false);
  const featureMap = new Map(activeFeatures.map(f => [f.name, f]));
  const sortedFeatures = globalFeatureOrder
    .filter(name => featureMap.has(name))
    .map(name => featureMap.get(name)!);

  const accent = brandColor || '#22C55E';

  return (
    <div
      onClick={onSelect}
      className="flex-shrink-0 w-[280px] rounded-[14px] p-5 snap-center cursor-pointer flex flex-col"
      style={{
        backgroundColor: '#1a1f2e',
        border: selected ? `2px solid ${accent}` : '2px solid rgba(255,255,255,0.08)',
        boxShadow: selected
          ? `0 10px 25px rgba(0,0,0,0.18), 0 0 0 1px ${hexToRgba(accent, 0.3)}`
          : '0 4px 16px rgba(0,0,0,0.12)',
        transform: selected ? 'scale(1.02)' : 'scale(1)',
        transition: 'border-color 0.08s, box-shadow 0.08s, transform 0.08s',
      }}
      data-testid={`package-card-${pkg.id}`}
    >
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <h3 className="text-lg font-extrabold text-white">{pkg.name}</h3>
        {pkg.recommended && (
          <span className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: 'rgba(245,158,11,0.18)', color: '#D97706' }}>
            <Crown className="w-3 h-3" />
            Most Popular
          </span>
        )}
      </div>

      <div className="text-2xl font-extrabold text-white mb-4">
        ${(price / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>

      {pkg.description && (
        <p className="text-sm text-gray-400 mb-3 leading-relaxed">{pkg.description}</p>
      )}

      <div className="space-y-2.5 mb-5 flex-1">
        {sortedFeatures.map((f, i) => (
          <div key={i} className="flex items-center gap-2.5 text-sm">
            {f.included ? (
              <div className="w-[18px] h-[18px] rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(34,197,94,0.15)' }}>
                <Check className="w-3 h-3 text-emerald-400" />
              </div>
            ) : (
              <div className="w-[18px] h-[18px] rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
                <X className="w-3 h-3 text-gray-600" />
              </div>
            )}
            <span className={f.included ? 'text-gray-200' : 'text-gray-600 line-through'}>
              {f.name}
            </span>
          </div>
        ))}
      </div>

      <button
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
        className="w-full py-3 px-4 rounded-[14px] text-sm font-bold"
        style={{
          border: selected ? '2px solid #22C55E' : '2px solid rgba(255,255,255,0.9)',
          background: selected ? 'rgba(34,197,94,0.15)' : 'transparent',
          color: selected ? '#22C55E' : '#FFFFFF',
          transition: 'border-color 0.08s, background 0.08s, color 0.08s',
        }}
        data-testid={`button-select-package-${pkg.id}`}
      >
        {selected ? (
          <span className="flex items-center justify-center gap-1.5">
            <Check className="w-4 h-4" />
            Selected
          </span>
        ) : (
          'Select Package'
        )}
      </button>
    </div>
  );
}

interface PackageCarouselProps {
  packages: PackageSnapshot[];
  baseTotal: number;
  selectedPackageId?: number;
  onSelectPackage: (pkg: PackageSnapshot) => void;
  brandColor?: string;
}

export function PackageCarousel({ packages, baseTotal, selectedPackageId, onSelectPackage, brandColor }: PackageCarouselProps) {
  const globalOrder = buildGlobalFeatureOrder(packages);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 10);
  };

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (el) el.addEventListener('scroll', checkScroll, { passive: true });
    return () => el?.removeEventListener('scroll', checkScroll);
  }, [packages]);

  const scroll = (dir: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === 'left' ? -300 : 300, behavior: 'smooth' });
  };

  const calculatePrice = (pkg: PackageSnapshot) => {
    if (pkg.priceAdjustmentType === 'percent') {
      return baseTotal + baseTotal * (pkg.adjustmentValue / 100);
    }
    return baseTotal + Math.round((pkg.adjustmentValue || 0) * 100);
  };

  if (!packages.length) return null;

  return (
    <div className="relative" data-testid="package-carousel">
      {canScrollLeft && (
        <button
          onClick={() => scroll('left')}
          className="absolute left-1 z-10 w-9 h-9 rounded-full flex items-center justify-center text-white"
          style={{
            top: 'calc(50% + 6px)',
            transform: 'translateY(-50%)',
            backgroundColor: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(4px)',
            transition: 'background-color 0.15s ease',
          }}
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      )}

      <div
        ref={scrollRef}
        className="flex gap-4 px-1"
        style={{
          overflowX: 'auto',
          overflowY: 'visible',
          paddingTop: 14,
          paddingBottom: 10,
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          scrollSnapType: 'x mandatory',
        }}
      >
        {packages.map(pkg => (
          <PackageCard
            key={pkg.id}
            pkg={pkg}
            price={calculatePrice(pkg)}
            selected={selectedPackageId === pkg.id}
            onSelect={() => onSelectPackage(pkg)}
            globalFeatureOrder={globalOrder}
            brandColor={brandColor}
          />
        ))}
      </div>

      {canScrollRight && (
        <button
          onClick={() => scroll('right')}
          className="absolute right-1 z-10 w-9 h-9 rounded-full flex items-center justify-center text-white"
          style={{
            top: 'calc(50% + 6px)',
            transform: 'translateY(-50%)',
            backgroundColor: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(4px)',
            transition: 'background-color 0.15s ease',
          }}
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}

interface SelectedPackageSummaryProps {
  pkg: PackageSnapshot;
  brandColor?: string;
}

export function SelectedPackageSummary({ pkg, brandColor }: SelectedPackageSummaryProps) {
  const included = (pkg.features || []).filter(f => f.included && f.active !== false);
  if (!included.length) return null;

  return (
    <div
      className="rounded-[14px] p-4"
      style={{
        border: `2px solid ${hexToRgba(brandColor || '#22C55E', 0.25)}`,
        backgroundColor: 'rgba(34,197,94,0.05)',
        boxShadow: '0 8px 18px rgba(0,0,0,0.06)',
      }}
      data-testid="selected-package-summary"
    >
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
        <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Selected Package:</span>
        <span className="text-base font-extrabold text-gray-900 dark:text-white">{pkg.name}</span>
        {pkg.recommended && (
          <span className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-amber-500/[0.18] text-amber-700 dark:text-amber-400">
            <Crown className="w-3 h-3" />
            Most Popular
          </span>
        )}
      </div>
      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Included Upgrades:</div>
      <div className="grid grid-cols-1 gap-2.5">
        {included.map((f, i) => (
          <div key={i}>
            <div className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
              <Check className="w-3.5 h-3.5 flex-shrink-0 text-emerald-500 mt-0.5" />
              <div>
                <span className="font-medium">{f.name}</span>
                {f.description && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">• {f.description}</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

