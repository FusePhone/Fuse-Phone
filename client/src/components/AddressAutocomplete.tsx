import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { MapPin, Loader2 } from 'lucide-react';
import { useKeyboardOffset } from '@/hooks/use-keyboard-offset';

export interface AddressComponents {
  streetNumber: string;
  route: string;
  city: string;
  state: string;
  zipCode: string;
  fullAddress: string;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onAddressSelect?: (components: AddressComponents) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  'data-testid'?: string;
  /** When true, hits the unauthenticated public endpoints (for booking forms,
   *  customer-facing pages, etc.). Defaults to false (logged-in app usage). */
  publicMode?: boolean;
}

interface Prediction {
  description: string;
  place_id: string;
  structured_formatting?: {
    main_text: string;
    secondary_text: string;
  };
}

export function AddressAutocomplete({
  value,
  onChange,
  onAddressSelect,
  placeholder = 'Enter address',
  disabled = false,
  className,
  'data-testid': testId,
  publicMode = false,
}: AddressAutocompleteProps) {
  const autocompleteUrl = publicMode ? '/api/public/places/autocomplete' : '/api/places/autocomplete';
  const detailsUrl = publicMode ? '/api/public/places/details' : '/api/places/details';
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [apiFailed, setApiFailed] = useState(false);
  const failCountRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const skipNextSearch = useRef(false);
  const { keyboardOffset } = useKeyboardOffset(showDropdown);

  const searchPlaces = useCallback(async (input: string) => {
    if (apiFailed || input.length < 3) {
      setPredictions([]);
      setShowDropdown(false);
      return;
    }

    setIsSearching(true);
    try {
      const res = await fetch(`${autocompleteUrl}?input=${encodeURIComponent(input)}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      if (data.status && data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        throw new Error(data.status);
      }
      failCountRef.current = 0;
      if (data.predictions && data.predictions.length > 0) {
        setPredictions(data.predictions.slice(0, 5));
        setShowDropdown(true);
        setHighlightIndex(-1);
      } else {
        setPredictions([]);
        setShowDropdown(false);
      }
    } catch {
      failCountRef.current++;
      if (failCountRef.current >= 2) {
        setApiFailed(true);
      }
      setPredictions([]);
      setShowDropdown(false);
    } finally {
      setIsSearching(false);
    }
  }, [apiFailed]);

  const handleInputChange = useCallback((newValue: string) => {
    onChange(newValue);

    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      return;
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      searchPlaces(newValue);
    }, 300);
  }, [onChange, searchPlaces]);

  const selectPlace = useCallback(async (prediction: Prediction) => {
    skipNextSearch.current = true;
    setShowDropdown(false);
    setPredictions([]);

    try {
      const res = await fetch(`${detailsUrl}?place_id=${encodeURIComponent(prediction.place_id)}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch details');
      const data = await res.json();

      if (data.result?.address_components) {
        const components: AddressComponents = {
          streetNumber: '',
          route: '',
          city: '',
          state: '',
          zipCode: '',
          fullAddress: data.result.formatted_address || prediction.description,
        };

        for (const comp of data.result.address_components) {
          const type = comp.types[0];
          switch (type) {
            case 'street_number':
              components.streetNumber = comp.long_name;
              break;
            case 'route':
              components.route = comp.long_name;
              break;
            case 'locality':
              components.city = comp.long_name;
              break;
            case 'administrative_area_level_1':
              components.state = comp.short_name;
              break;
            case 'postal_code':
              components.zipCode = comp.long_name;
              break;
          }
        }

        const streetAddress = [components.streetNumber, components.route]
          .filter(Boolean)
          .join(' ');

        onChange(streetAddress);

        if (onAddressSelect) {
          onAddressSelect({
            ...components,
            fullAddress: streetAddress,
          });
        }
      } else {
        onChange(prediction.description);
      }
    } catch {
      onChange(prediction.description);
    }
  }, [onChange, onAddressSelect]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!showDropdown || predictions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex(prev => (prev + 1) % predictions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex(prev => (prev - 1 + predictions.length) % predictions.length);
    } else if (e.key === 'Enter' && highlightIndex >= 0) {
      e.preventDefault();
      selectPlace(predictions[highlightIndex]);
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  }, [showDropdown, predictions, highlightIndex, selectPlace]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      if (containerRef.current && containerRef.current.contains(target)) return;
      // Also ignore clicks inside the portaled dropdown (rendered when keyboard is open)
      if ((target as HTMLElement).closest?.('[data-address-suggestions-portal="true"]')) return;
      setShowDropdown(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return (
    <div ref={containerRef} className="relative" data-autocomplete="address">
      <div className="relative">
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => {
            if (predictions.length > 0) setShowDropdown(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(className)}
          data-testid={testId}
          autoComplete="off"
        />
        {isSearching && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
      {showDropdown && predictions.length > 0 && keyboardOffset === 0 && (
        <div
          className="absolute z-[100000] left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg max-h-[290px] overflow-y-auto"
          data-testid="address-suggestions-dropdown"
        >
          {predictions.map((prediction, index) => (
            <SuggestionRow
              key={prediction.place_id}
              prediction={prediction}
              index={index}
              highlightIndex={highlightIndex}
              onSelect={selectPlace}
              onHover={setHighlightIndex}
            />
          ))}
        </div>
      )}
      {showDropdown && predictions.length > 0 && keyboardOffset > 0 && createPortal(
        <div
          className="fixed bg-popover border border-border rounded-md shadow-2xl overflow-y-auto"
          style={{
            left: 8,
            right: 8,
            bottom: `calc(${keyboardOffset + 8}px + env(safe-area-inset-bottom, 0px))`,
            maxHeight: '290px',
            zIndex: 100000,
          }}
          data-address-suggestions-portal="true"
          data-testid="address-suggestions-dropdown"
        >
          {predictions.map((prediction, index) => (
            <SuggestionRow
              key={prediction.place_id}
              prediction={prediction}
              index={index}
              highlightIndex={highlightIndex}
              onSelect={selectPlace}
              onHover={setHighlightIndex}
            />
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

function SuggestionRow({
  prediction,
  index,
  highlightIndex,
  onSelect,
  onHover,
}: {
  prediction: Prediction;
  index: number;
  highlightIndex: number;
  onSelect: (p: Prediction) => void;
  onHover: (i: number) => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "w-full text-left px-3 py-2.5 text-sm flex items-start gap-2 transition-colors",
        index === highlightIndex
          ? "bg-accent text-accent-foreground"
          : "hover-elevate"
      )}
      onClick={() => onSelect(prediction)}
      onMouseEnter={() => onHover(index)}
      data-testid={`address-suggestion-${index}`}
    >
      <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <div className="font-medium truncate">
          {prediction.structured_formatting?.main_text || prediction.description}
        </div>
        {prediction.structured_formatting?.secondary_text && (
          <div className="text-xs text-muted-foreground truncate">
            {prediction.structured_formatting.secondary_text}
          </div>
        )}
      </div>
    </button>
  );
}
