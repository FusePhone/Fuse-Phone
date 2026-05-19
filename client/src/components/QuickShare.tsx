import { useState, useCallback, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useCompanySettings } from "@/hooks/use-company-settings";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  CalendarCheck,
  Star,
  ArrowLeft,
  Copy,
  MessageSquare,
  Share2,
  Check,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface QuickShareProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ShareOption = "booking" | "review" | null;

export function QuickShare({ open, onOpenChange }: QuickShareProps) {
  const [selected, setSelected] = useState<ShareOption>(null);
  const [smsPhone, setSmsPhone] = useState("");
  const [showSmsInput, setShowSmsInput] = useState(false);
  const [copied, setCopied] = useState(false);
  const [smsSending, setSmsSending] = useState(false);
  const { data: settings } = useCompanySettings();
  const { toast } = useToast();

  const getBookingUrl = useCallback(() => {
    if (settings?.customDomain && settings?.customDomainVerified) {
      return `https://${settings.customDomain}/booking`;
    }
    if (settings?.bookingUrl) return settings.bookingUrl;
    if (settings?.bookingSlug) return `https://app.fusephone.com/${settings.bookingSlug}/booking`;
    return null;
  }, [settings]);

  const getReviewUrl = useCallback(() => {
    return settings?.reviewLink || null;
  }, [settings]);

  const getShareUrl = useCallback(() => {
    if (selected === "booking") return getBookingUrl();
    if (selected === "review") return getReviewUrl();
    return null;
  }, [selected, getBookingUrl, getReviewUrl]);

  const getShareLabel = useCallback(() => {
    if (selected === "booking") return "Book an Appointment";
    if (selected === "review") return "Leave a Review";
    return "";
  }, [selected]);

  const companyName = settings?.companyName || "our company";

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setTimeout(() => {
        setSelected(null);
        setShowSmsInput(false);
        setSmsPhone("");
        setCopied(false);
      }, 300);
    }
  };

  const handleBack = () => {
    setSelected(null);
    setShowSmsInput(false);
    setSmsPhone("");
    setCopied(false);
  };

  const handleCopy = async () => {
    const url = getShareUrl();
    if (!url) return;
    try {
      const { copyToClipboard } = await import("@/lib/clipboard");
      const ok = await copyToClipboard(url);
      if (ok) {
        setCopied(true);
        toast({ title: "Link copied!" });
        setTimeout(() => setCopied(false), 2000);
      } else {
        toast({ title: "Could not copy link", description: url, variant: "destructive" });
      }
    } catch {
      toast({ title: "Could not copy link", variant: "destructive" });
    }
  };

  const handleSendSms = async () => {
    const url = getShareUrl();
    if (!url || !smsPhone.trim()) return;

    setSmsSending(true);
    try {
      const message = selected === "booking"
        ? `${companyName} - Book your appointment here: ${url}\n\nBy booking, you consent to receive calls & texts from ${companyName}. Msg & data rates may apply. Reply STOP to opt out.`
        : `We'd love your feedback! Leave us a review for ${companyName}: ${url}\n\nReply STOP to opt out of future messages.`;

      const res = await fetch("/api/twilio/send-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: smsPhone.trim(), body: message }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to send");
      toast({ title: "Text sent!" });
      setSmsPhone("");
      setShowSmsInput(false);
    } catch {
      toast({ title: "Could not send text", variant: "destructive" });
    } finally {
      setSmsSending(false);
    }
  };

  const handleNativeShare = async () => {
    const url = getShareUrl();
    if (!url) return;
    try {
      await navigator.share({
        title: getShareLabel(),
        text: selected === "booking"
          ? `Book an appointment with ${companyName}`
          : `Leave a review for ${companyName}`,
        url,
      });
    } catch {
    }
  };

  const shareUrl = getShareUrl();

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerContent data-testid="quickshare-drawer">
        <DrawerHeader className="text-center pb-2">
          {selected ? (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={handleBack}
                data-testid="button-quickshare-back"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="flex-1 text-center pr-8">
                <DrawerTitle data-testid="text-quickshare-title">{getShareLabel()}</DrawerTitle>
                <DrawerDescription>Scan the code or share the link</DrawerDescription>
              </div>
            </div>
          ) : (
            <>
              <DrawerTitle data-testid="text-quickshare-title">Quick Share</DrawerTitle>
              <DrawerDescription>Share with someone nearby</DrawerDescription>
            </>
          )}
        </DrawerHeader>

        <div className="px-6 pb-6">
          {!selected ? (
            <div className="grid grid-cols-2 gap-3" data-testid="quickshare-options">
              <button
                className={cn(
                  "flex flex-col items-center gap-3 p-5 rounded-xl border-2 transition-all",
                  "hover:border-primary hover:bg-primary/5",
                  !getBookingUrl() && "opacity-50 cursor-not-allowed"
                )}
                onClick={() => getBookingUrl() && setSelected("booking")}
                disabled={!getBookingUrl()}
                data-testid="button-quickshare-booking"
              >
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                  <CalendarCheck className="w-7 h-7 text-primary" />
                </div>
                <div className="text-center">
                  <p className="font-semibold text-sm">Book Appointment</p>
                  {!getBookingUrl() && (
                    <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-0.5 justify-center">
                      <AlertCircle className="w-3 h-3" /> Set up in Company Profile
                    </p>
                  )}
                </div>
              </button>

              <button
                className={cn(
                  "flex flex-col items-center gap-3 p-5 rounded-xl border-2 transition-all",
                  "hover:border-primary hover:bg-primary/5",
                  !getReviewUrl() && "opacity-50 cursor-not-allowed"
                )}
                onClick={() => getReviewUrl() && setSelected("review")}
                disabled={!getReviewUrl()}
                data-testid="button-quickshare-review"
              >
                <div className="w-14 h-14 rounded-full bg-amber-500/10 flex items-center justify-center">
                  <Star className="w-7 h-7 text-amber-500" />
                </div>
                <div className="text-center">
                  <p className="font-semibold text-sm">Leave a Review</p>
                  {!getReviewUrl() && (
                    <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-0.5 justify-center">
                      <AlertCircle className="w-3 h-3" /> Add review link in Company Profile
                    </p>
                  )}
                </div>
              </button>
            </div>
          ) : shareUrl ? (
            <div className="flex flex-col items-center gap-4">
              <div
                className="bg-white p-4 rounded-2xl shadow-sm border"
                data-testid="quickshare-qr-code"
              >
                <QRCodeSVG
                  value={shareUrl}
                  size={200}
                  level="M"
                  includeMargin={false}
                  bgColor="#ffffff"
                  fgColor="#000000"
                />
              </div>

              <p className="text-xs text-muted-foreground text-center max-w-[240px]">
                Point their camera at this code to open the link instantly
              </p>

              <div className="flex gap-2 w-full">
                <Button
                  variant="outline"
                  className="flex-1 gap-2"
                  onClick={handleCopy}
                  data-testid="button-quickshare-copy"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? "Copied" : "Copy Link"}
                </Button>

                {typeof navigator !== "undefined" && "share" in navigator && (
                  <Button
                    variant="outline"
                    className="flex-1 gap-2"
                    onClick={handleNativeShare}
                    data-testid="button-quickshare-native"
                  >
                    <Share2 className="w-4 h-4" />
                    Share
                  </Button>
                )}
              </div>

              {!showSmsInput ? (
                <Button
                  variant="secondary"
                  className="w-full gap-2"
                  onClick={() => setShowSmsInput(true)}
                  data-testid="button-quickshare-sms-toggle"
                >
                  <MessageSquare className="w-4 h-4" />
                  Send via Text
                </Button>
              ) : (
                <div className="flex gap-2 w-full" data-testid="quickshare-sms-form">
                  <Input
                    type="tel"
                    placeholder="Phone number"
                    value={smsPhone}
                    onChange={(e) => setSmsPhone(e.target.value)}
                    className="flex-1"
                    data-testid="input-quickshare-phone"
                  />
                  <Button
                    onClick={handleSendSms}
                    disabled={!smsPhone.trim() || smsSending}
                    data-testid="button-quickshare-send-sms"
                  >
                    {smsSending ? "Sending..." : "Send"}
                  </Button>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
