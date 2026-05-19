import { Button } from "@/components/ui/button";
import { FusePhoneLogoImage } from "@/components/FusePhoneLogo";
import { Lock, LogOut } from "lucide-react";

interface TeamMemberLockedWallProps {
  companyName: string;
  daysLapsed: number;
}

export function TeamMemberLockedWall({ companyName, daysLapsed }: TeamMemberLockedWallProps) {
  const handleSignOut = async () => {
    try {
      await fetch('/api/logout', { method: 'POST', credentials: 'include' });
    } catch {}
    try { localStorage.clear(); } catch {}
    try { sessionStorage.clear(); } catch {}
    window.location.href = '/auth';
  };

  return (
    <div
      className="fixed inset-0 z-[10000] flex flex-col items-center justify-center bg-background px-6 text-center overflow-y-auto py-12"
      data-testid="wall-team-member-locked"
    >
      <div className="max-w-md w-full flex flex-col items-center gap-6">
        <FusePhoneLogoImage size="xl" />
        <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
          <Lock className="w-8 h-8 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="space-y-3">
          <h1 className="text-2xl font-bold" data-testid="text-wall-title">
            Your company subscription is on hold
          </h1>
          <p className="text-muted-foreground" data-testid="text-wall-message">
            Your access to Fuse Phone is paused because{' '}
            <span className="font-semibold text-foreground">{companyName}</span>'s
            subscription is not active right now.
          </p>
          <p className="text-muted-foreground">
            Please ask {companyName} to renew the subscription to restore your access.
            All your work is safe — nothing has been deleted.
          </p>
          {daysLapsed > 0 && (
            <p className="text-xs text-muted-foreground" data-testid="text-wall-days-lapsed">
              Locked for {daysLapsed} {daysLapsed === 1 ? 'day' : 'days'}
            </p>
          )}
        </div>
        <Button
          onClick={handleSignOut}
          variant="outline"
          className="w-full"
          data-testid="button-wall-sign-out"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sign Out
        </Button>
      </div>
    </div>
  );
}
