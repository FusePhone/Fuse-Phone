import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FusePhoneLogoImage } from "@/components/FusePhoneLogo";
import { Sparkles, DollarSign, Users, Megaphone, Smartphone, ChevronRight, CheckCircle2, Video, Star } from "lucide-react";

export default function AffiliateLanding() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-2">
          <a href="/" className="flex items-center gap-2" data-testid="link-home">
            <FusePhoneLogoImage size="md" />
            <div className="flex items-baseline gap-2">
              <span className="font-display font-bold text-xl tracking-tight">Fuse Phone</span>
              <span className="text-xs uppercase tracking-widest text-amber-500 font-semibold">Partners</span>
            </div>
          </a>
          <div className="flex items-center gap-2 sm:gap-3">
            <Button variant="ghost" asChild className="hidden sm:inline-flex" data-testid="button-header-login">
              <a href="/login">Partner Login</a>
            </Button>
            <Button asChild data-testid="button-header-apply">
              <Link href="/apply">Apply Now</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 via-transparent to-primary/10" />
        <div className="relative py-20 sm:py-28 px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/5 text-amber-500 text-xs font-semibold uppercase tracking-wider mb-6" data-testid="badge-hero">
              <Sparkles className="w-3.5 h-3.5" />
              Fuse Phone Partner Program
            </div>
            <h1 className="font-display font-bold text-4xl sm:text-5xl lg:text-6xl tracking-tight leading-[1.1] mb-6" data-testid="text-hero-title">
              Get paid to put Fuse Phone in front of contractors.
            </h1>
            <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-8" data-testid="text-hero-subtitle">
              For TikTokers, YouTubers, Instagram creators, app reviewers, and anyone with a contractor audience. Recurring commission for every painter or home services pro you bring in.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button size="lg" asChild className="text-base px-8" data-testid="button-hero-apply">
                <Link href="/apply">Apply to become a partner <ChevronRight className="w-4 h-4 ml-1" /></Link>
              </Button>
              <Button size="lg" variant="ghost" asChild className="text-base" data-testid="button-hero-learn">
                <a href="#how-it-works">See how it works</a>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-6">Free to join · No follower minimum to apply · We pay via Stripe</p>
          </div>
        </div>
      </section>

      {/* Who it's for */}
      <section className="py-16 px-4 sm:px-6 border-t">
        <div className="max-w-5xl mx-auto">
          <h2 className="font-display font-bold text-2xl sm:text-3xl text-center mb-2" data-testid="text-who-title">Who's this for?</h2>
          <p className="text-center text-muted-foreground mb-12">If you talk to contractors — even casually — you can earn.</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { icon: Video, label: "TikTokers", desc: "Trade & business niches" },
              { icon: Megaphone, label: "Influencers", desc: "Instagram, YouTube, X" },
              { icon: Star, label: "App Reviewers", desc: "Software reviews & roundups" },
              { icon: Users, label: "Beta Testers", desc: "Communities & forums" },
            ].map((x) => (
              <Card key={x.label} className="border-border/60" data-testid={`card-audience-${x.label.toLowerCase()}`}>
                <CardContent className="p-5 text-center">
                  <div className="w-10 h-10 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto mb-3">
                    <x.icon className="w-5 h-5" />
                  </div>
                  <div className="font-semibold">{x.label}</div>
                  <div className="text-xs text-muted-foreground mt-1">{x.desc}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-20 px-4 sm:px-6 border-t bg-muted/30">
        <div className="max-w-5xl mx-auto">
          <h2 className="font-display font-bold text-2xl sm:text-3xl text-center mb-12" data-testid="text-how-title">How it works</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { n: "1", title: "Apply in 2 minutes", body: "Fill out the form below. Tell us who you are, where you post, and your audience. We review every application personally." },
              { n: "2", title: "Get your link", body: "Once approved, you'll get a unique referral link and a partner dashboard to track signups and earnings in real time." },
              { n: "3", title: "Earn recurring", body: "Every contractor who signs up through your link earns you a commission every month they keep paying — for the duration of their plan." },
            ].map((s) => (
              <div key={s.n} className="relative" data-testid={`step-${s.n}`}>
                <div className="text-5xl font-display font-bold text-amber-500/20 mb-2">{s.n}</div>
                <h3 className="font-semibold text-lg mb-2">{s.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Commission — placeholder, you said you'll write the real terms */}
      <section className="py-20 px-4 sm:px-6 border-t">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border bg-background text-xs font-semibold uppercase tracking-wider mb-4">
            <DollarSign className="w-3.5 h-3.5" />
            Commission
          </div>
          <h2 className="font-display font-bold text-3xl sm:text-4xl mb-6" data-testid="text-commission-title">
            Recurring monthly commission for every contractor you refer.
          </h2>
          <p className="text-lg text-muted-foreground mb-8" data-testid="text-commission-body">
            Specific commission rates and terms are reviewed individually with each approved partner so we can match the right deal to your audience size and engagement.
          </p>
          <div className="grid sm:grid-cols-3 gap-4 text-left">
            {[
              { icon: DollarSign, t: "Recurring", d: "Get paid every month, not just once." },
              { icon: Smartphone, t: "Stripe payouts", d: "Direct deposit to your bank, monthly." },
              { icon: CheckCircle2, t: "Live tracking", d: "Watch signups and earnings in your dashboard." },
            ].map((x) => (
              <Card key={x.t} className="border-border/60">
                <CardContent className="p-5">
                  <x.icon className="w-5 h-5 text-amber-500 mb-3" />
                  <div className="font-semibold mb-1">{x.t}</div>
                  <div className="text-sm text-muted-foreground">{x.d}</div>
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-8">
            Partners must remain active. We may pause partner accounts that go inactive or fail to refer new users over time.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 px-4 sm:px-6 border-t bg-muted/30">
        <div className="max-w-3xl mx-auto">
          <h2 className="font-display font-bold text-2xl sm:text-3xl text-center mb-10" data-testid="text-faq-title">Common questions</h2>
          <div className="space-y-6">
            {[
              { q: "Do I need to be a contractor to join?", a: "No. Anyone with an audience that includes painters, home services pros, or small business owners can apply. TikTokers, YouTubers, niche bloggers, app reviewers — all welcome." },
              { q: "How big does my audience need to be?", a: "There's no hard minimum to apply. We look at engagement and how relevant your audience is, not just follower count. A 5k niche audience often outperforms a 500k generic one." },
              { q: "When do I get paid?", a: "Commissions are accrued monthly and paid out via Stripe Connect. You'll set up your payout method inside your partner dashboard once approved." },
              { q: "Do I keep earning if my referral keeps paying?", a: "Yes — that's the whole point. Each contractor you refer pays you every month they remain a paying customer (subject to the terms of the program)." },
              { q: "What if I'm already a Fuse Phone customer?", a: "Even better. Use the same email when you apply and we'll link your accounts so you can manage both from one login." },
              { q: "How do I promote Fuse Phone?", a: "Any way that fits your style — videos, reviews, tutorials, posts, newsletters. We'll give you assets and ideas once you're in." },
            ].map((f, i) => (
              <div key={i} className="border-b pb-5" data-testid={`faq-item-${i}`}>
                <h3 className="font-semibold mb-2">{f.q}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 px-4 sm:px-6 border-t">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="font-display font-bold text-3xl sm:text-4xl mb-4" data-testid="text-cta-title">Ready to start earning?</h2>
          <p className="text-muted-foreground mb-8">Applications are reviewed personally — most decisions within 48 hours.</p>
          <Button size="lg" asChild className="text-base px-8" data-testid="button-cta-apply">
            <Link href="/apply">Apply now <ChevronRight className="w-4 h-4 ml-1" /></Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FusePhoneLogoImage size="sm" />
            <span className="text-sm text-muted-foreground">Fuse Phone Partner Program · Powered by Fuse Phone CRM</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <a href="https://fusephone.com" className="hover:text-foreground" data-testid="link-footer-main-site">fusephone.com</a>
            <a href="https://fusephone.com/terms" className="hover:text-foreground" data-testid="link-footer-terms">Terms</a>
            <a href="https://fusephone.com/privacy" className="hover:text-foreground" data-testid="link-footer-privacy">Privacy</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
