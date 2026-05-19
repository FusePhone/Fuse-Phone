import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  CalendarDays, Users, FileText, Phone,
  ArrowRight, ArrowLeft, Sparkles, Check, Star
} from "lucide-react";
import { format, addDays } from "date-fns";

type Step = 'welcome' | 'features' | 'book';

const features = [
  { icon: Users, title: "Lead Management", desc: "Track leads through your sales pipeline from first contact to close" },
  { icon: FileText, title: "Proposals & Invoices", desc: "Create professional estimates, proposals, and invoices in seconds" },
  { icon: Phone, title: "Built-in Phone System", desc: "Call, text, and track communications with clients directly" },
  { icon: CalendarDays, title: "Scheduling", desc: "Manage your calendar, book appointments, and coordinate your crew" },
];

export function WelcomeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState<Step>('welcome');
  const [selectedDate, setSelectedDate] = useState('');
  const [notes, setNotes] = useState('');
  const { toast } = useToast();

  const existingBookings = useQuery<any[]>({
    queryKey: ['/api/onboarding/booking'],
    enabled: open,
  });

  const bookMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/onboarding/book", {
        preferredDate: selectedDate,
        notes: notes || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/onboarding/booking'] });
      toast({ title: "You're booked!", description: "Gamaliel will confirm a time with you soon." });
      onClose();
    },
    onError: () => {
      toast({ title: "Oops", description: "Could not book. Try again.", variant: "destructive" });
    },
  });

  const hasExistingBooking = existingBookings.data && existingBookings.data.length > 0;
  const minDate = format(addDays(new Date(), 1), 'yyyy-MM-dd');

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        {step === 'welcome' && (
          <div className="space-y-5">
            <div className="text-center space-y-3">
              <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Sparkles className="w-8 h-8 text-primary" />
              </div>
              <DialogHeader>
                <DialogTitle className="text-2xl" data-testid="text-welcome-title">
                  Welcome to Fuse Phone
                </DialogTitle>
              </DialogHeader>
              <p className="text-muted-foreground">
                Hey! I'm <span className="font-semibold text-foreground">Gamaliel Revolorio</span>, founder of Fuse Phone and owner of{" "}
                <a href="https://gamainteriorpainting.com" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">
                  Gama Interior Painting
                </a>. I built this because I know how hard it is to run a home services business.
              </p>
            </div>

            <Card>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Star className="w-4 h-4 text-amber-500" />
                  <span className="font-medium text-sm">Welcome aboard</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Explore everything Fuse Phone has to offer and see how it can help you grow your business.
                </p>
              </CardContent>
            </Card>

            <Button
              className="w-full"
              onClick={() => setStep('features')}
              data-testid="button-welcome-next"
            >
              See What You Can Do <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        )}

        {step === 'features' && (
          <div className="space-y-5">
            <DialogHeader>
              <DialogTitle data-testid="text-features-title">Everything You Need</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Fuse Phone replaces your scattered tools with one simple platform.
            </p>

            <div className="grid grid-cols-1 gap-3">
              {features.map((f) => (
                <div key={f.title} className="flex items-start gap-3 p-3 rounded-md bg-muted/50">
                  <div className="mt-0.5 w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                    <f.icon className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{f.title}</p>
                    <p className="text-xs text-muted-foreground">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep('welcome')} data-testid="button-features-back">
                <ArrowLeft className="w-4 h-4 mr-2" /> Back
              </Button>
              <Button className="flex-1" onClick={() => setStep('book')} data-testid="button-features-next">
                Book Your Setup Call <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {step === 'book' && (
          <div className="space-y-5">
            <DialogHeader>
              <DialogTitle data-testid="text-book-title">
                {hasExistingBooking ? "You're All Set!" : "Let's Get You Started"}
              </DialogTitle>
            </DialogHeader>

            {hasExistingBooking ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 p-4 rounded-md bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300">
                  <Check className="w-5 h-5" />
                  <p className="text-sm">
                    Your onboarding call is booked for{" "}
                    <span className="font-semibold">
                      {format(new Date(existingBookings.data![0].preferredDate), 'MMMM d, yyyy')}
                    </span>
                    {existingBookings.data![0].confirmedTime && (
                      <> at <span className="font-semibold">{existingBookings.data![0].confirmedTime}</span></>
                    )}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground">
                  I'll confirm the exact time via email. In the meantime, feel free to explore!
                </p>
                <Button className="w-full" onClick={onClose} data-testid="button-start-exploring">
                  Start Exploring <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Pick a day that works for a quick 15-minute call with me. I'll walk you through everything and get you set up.
                </p>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="booking-date">Preferred Date</label>
                  <Input
                    id="booking-date"
                    type="date"
                    min={minDate}
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    data-testid="input-booking-date"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="booking-notes">Anything you want to discuss? (optional)</label>
                  <Input
                    id="booking-notes"
                    placeholder="E.g., I mostly need help with invoicing"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    data-testid="input-booking-notes"
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep('features')} data-testid="button-book-back">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back
                  </Button>
                  <Button
                    className="flex-1"
                    disabled={!selectedDate || bookMutation.isPending}
                    onClick={() => bookMutation.mutate()}
                    data-testid="button-book-submit"
                  >
                    {bookMutation.isPending ? "Booking..." : "Book My Call"}
                  </Button>
                </div>
                <button
                  className="w-full text-center text-xs text-muted-foreground hover:underline cursor-pointer"
                  onClick={onClose}
                  data-testid="button-skip-booking"
                >
                  Skip for now, I'll explore on my own
                </button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
