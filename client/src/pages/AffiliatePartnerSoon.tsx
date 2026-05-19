import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FusePhoneLogoImage } from "@/components/FusePhoneLogo";
import { Mail, Sparkles } from "lucide-react";

export default function AffiliatePartnerSoon() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2" data-testid="link-home">
            <FusePhoneLogoImage size="md" />
            <div className="flex items-baseline gap-2">
              <span className="font-display font-bold text-xl tracking-tight">Fuse Phone</span>
              <span className="text-xs uppercase tracking-widest text-amber-500 font-semibold">Partners</span>
            </div>
          </Link>
          <Button asChild size="sm" data-testid="button-apply">
            <Link href="/apply">Apply</Link>
          </Button>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <Card className="max-w-lg w-full">
          <CardContent className="p-10 text-center">
            <div className="w-14 h-14 mx-auto rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center mb-4">
              <Sparkles className="w-7 h-7" />
            </div>
            <h1 className="font-display font-bold text-2xl mb-3" data-testid="text-title">Partner login coming soon</h1>
            <p className="text-muted-foreground mb-6" data-testid="text-body">
              We're putting the finishing touches on the partner dashboard. Once your application is approved, we'll email you with your referral link, payout setup, and login instructions.
            </p>
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mb-6">
              <Mail className="w-4 h-4" />
              <span>Already applied? Check your inbox for updates.</span>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <Button asChild data-testid="button-apply-cta"><Link href="/apply">Apply now</Link></Button>
              <Button asChild variant="outline" data-testid="button-back-home"><Link href="/">Back to home</Link></Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
