import { Link } from "wouter";
import { confirmNavigation, hasUnsavedChanges } from "@/hooks/use-navigation-guard";
import { useLocation } from "wouter";
import type { ComponentProps } from "react";

type LinkProps = ComponentProps<typeof Link>;

export function GuardedLink({ href, onClick, children, ...props }: LinkProps) {
  const [, navigate] = useLocation();

  const handleClick = (e: React.MouseEvent) => {
    if (hasUnsavedChanges()) {
      e.preventDefault();
      e.stopPropagation();
      confirmNavigation(() => {
        navigate(href as string);
      });
      return;
    }
    if (onClick) {
      (onClick as any)(e);
    }
  };

  return (
    <Link href={href} onClick={handleClick} {...props}>
      {children}
    </Link>
  );
}
