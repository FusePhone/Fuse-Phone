import { useState } from "react";
import { HelpCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface InfoTooltipProps {
  text: string;
  className?: string;
}

export function InfoTooltip({ text, className }: InfoTooltipProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center justify-center rounded-full text-muted-foreground hover-elevate focus:outline-none ${className || ""}`}
          aria-label="More info"
          data-testid="button-info-tooltip"
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          <HelpCircle className="w-3.5 h-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-64 p-3 text-xs text-muted-foreground leading-relaxed"
        side="top"
        align="center"
        sideOffset={6}
        onPointerDownOutside={(e) => e.stopPropagation()}
      >
        {text}
      </PopoverContent>
    </Popover>
  );
}
