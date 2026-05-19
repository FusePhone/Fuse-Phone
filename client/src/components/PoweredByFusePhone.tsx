interface PoweredByFusePhoneProps {
  className?: string;
  variant?: "light" | "dark";
}

export function PoweredByFusePhone({ className = "", variant = "light" }: PoweredByFusePhoneProps) {
  const primaryColor = variant === "dark" ? "text-white/40" : "text-muted-foreground/60";
  const secondaryColor = variant === "dark" ? "text-white/25" : "text-muted-foreground/40";

  return (
    <div className={`text-center ${className}`} data-testid="powered-by-fuse-phone">
      <a
        href="https://fusephone.com"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block hover:opacity-80 transition-opacity"
      >
        <p className={`text-sm ${primaryColor}`}>
          Powered by <span className="font-bold uppercase tracking-wide">FUSE PHONE</span>
        </p>
        <p className={`text-xs ${secondaryColor} mt-1`}>
          The CRM for Painters & Home Service Contractors
        </p>
      </a>
    </div>
  );
}
