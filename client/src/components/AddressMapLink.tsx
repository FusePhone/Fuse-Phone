import { MapPin } from "lucide-react";

interface AddressDisplayProps {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  className?: string;
  textClassName?: string;
  showMapIcon?: boolean;
}

export function AddressDisplay({
  address,
  city,
  state,
  zipCode,
  className = "",
  textClassName = "text-sm text-muted-foreground",
  showMapIcon = true
}: AddressDisplayProps) {
  const streetLine = address || '';
  const cityStateZip = [city, state, zipCode].filter(Boolean).join(', ');
  
  if (!streetLine && !cityStateZip) {
    return null;
  }

  const fullAddress = [streetLine, cityStateZip].filter(Boolean).join(', ');
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`;

  return (
    <a
      href={mapsUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={`flex items-start gap-2 cursor-pointer group ${className}`}
      title="Open in Google Maps"
      data-testid="link-address-map"
    >
      {showMapIcon && (
        <div className="p-0.5 rounded flex-shrink-0 mt-0.5">
          <MapPin className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
        </div>
      )}
      <div className="flex flex-col flex-1">
        {streetLine && <p className={`${textClassName} group-hover:text-primary group-hover:underline transition-colors`}>{streetLine}</p>}
        {cityStateZip && <p className={`${textClassName} group-hover:text-primary group-hover:underline transition-colors`}>{cityStateZip}</p>}
      </div>
    </a>
  );
}

interface AddressMapLinkProps {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  showIcon?: boolean;
  className?: string;
  iconClassName?: string;
}

export function AddressMapLink({
  address,
  city,
  state,
  zipCode,
  showIcon = true,
  className = "",
  iconClassName = "w-3.5 h-3.5"
}: AddressMapLinkProps) {
  const streetLine = address || '';
  const cityStateZip = [city, state, zipCode].filter(Boolean).join(', ');
  
  if (!streetLine && !cityStateZip) {
    return null;
  }

  const fullAddress = [streetLine, cityStateZip].filter(Boolean).join(', ');
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`;

  return (
    <a
      href={mapsUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={`flex items-start gap-2 cursor-pointer group ${className}`}
      title="Open in Google Maps"
      data-testid="link-address-map"
    >
      {showIcon && (
        <div className="p-0.5 rounded flex-shrink-0 mt-0.5">
          <MapPin className={`${iconClassName} text-muted-foreground group-hover:text-primary transition-colors`} />
        </div>
      )}
      <div className="flex flex-col flex-1">
        {streetLine && <span className="group-hover:text-primary group-hover:underline transition-colors">{streetLine}</span>}
        {cityStateZip && <span className="group-hover:text-primary group-hover:underline transition-colors">{cityStateZip}</span>}
      </div>
    </a>
  );
}
