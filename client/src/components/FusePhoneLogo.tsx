import { useTheme } from "@/components/ThemeProvider";
import logoDark from "@assets/fusephone-Dark-mode-transparent.png";
import logoLight from "@assets/fusephone-Lithg-mode_1770393097141.png";

interface FusePhoneLogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  showText?: boolean;
}

const sizeMap = {
  sm: "w-[38px] h-[38px]",
  md: "w-9 h-9",
  lg: "w-16 h-16",
  xl: "w-24 h-24",
};

const sizePx: Record<string, number> = {
  sm: 38,
  md: 36,
  lg: 64,
  xl: 96,
};

export function FusePhoneLogo({ size = "md", className = "", showText = true }: FusePhoneLogoProps) {
  const { theme } = useTheme();
  const logoSrc = theme === "dark" ? logoDark : logoLight;
  const px = sizePx[size] || 36;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <img
        src={logoSrc}
        alt="Fuse Phone"
        width={px}
        height={px}
        className={`${sizeMap[size]} object-contain`}
        data-testid="img-fuse-phone-logo"
        style={{ maxWidth: px, maxHeight: px }}
      />
      {showText && (
        <span className="font-display font-bold text-xl tracking-tight">Fuse Phone</span>
      )}
    </div>
  );
}

export function FusePhoneLogoImage({ size = "md", className = "" }: { size?: "sm" | "md" | "lg" | "xl"; className?: string }) {
  const { theme } = useTheme();
  const logoSrc = theme === "dark" ? logoDark : logoLight;
  const px = sizePx[size] || 36;

  return (
    <img
      src={logoSrc}
      alt="Fuse Phone"
      width={px}
      height={px}
      className={`${sizeMap[size]} object-contain pointer-events-none select-none ${className}`}
      draggable={false}
      data-testid="img-fuse-phone-logo"
      style={{ maxWidth: px, maxHeight: px, WebkitTouchCallout: 'none', background: 'transparent' } as React.CSSProperties}
    />
  );
}
