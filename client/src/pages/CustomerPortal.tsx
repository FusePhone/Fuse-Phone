import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PoweredByFusePhone } from "@/components/PoweredByFusePhone";
import { useDemoMode } from "@/contexts/DemoModeContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, CheckCircle, FileText, AlertCircle, ChevronDown, ChevronUp, ChevronRight, FileDown, ArrowLeft, PenLine, XCircle, DollarSign, CreditCard, Palette, Banknote, Shield, Plus, Check, Minus, Phone, BadgeCheck, MapPin, Home, FolderOpen, Receipt, FileSignature, Paintbrush, Globe, Star, Calendar, Mail, ExternalLink, Lock, Award, Eye } from "lucide-react";
import { AddressDisplay } from "@/components/AddressMapLink";
import { RichTextDisplay } from "@/components/RichTextEditor";
import { DocumentPhotoDisplay } from "@/components/DocumentPhotoDisplay";
import { format, addDays, isBefore } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useRef, useEffect, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import { Badge } from "@/components/ui/badge";
import type { Document, Contact, CompanySettings, Template, Payment, PaymentSettings, ProductionRateBlock, ProposalPackage, PackageSnapshot } from "@shared/schema";
import { ProductionRateBlocksSection, calcExcludedTotals, calcOptionalAreaTotals, calcContractorHiddenTotals, filterExcludedForHiddenAreas, DocumentSqftSummary, calcBlockSqftSummary } from "@/components/ProductionRateBlockDisplay";
import { LineItemRenderer } from "@/components/LineItemRenderer";
import { ChangeOrderContentRenderer } from "@/components/ChangeOrderContentRenderer";
import { generateDocumentPDF } from "@/lib/pdfGenerator";
import { api } from "@shared/routes";
import { formatCurrency, formatPhoneDisplay } from "@/lib/utils";
import { PackageCarousel, SelectedPackageSummary } from "@/components/PackageComponents";
import { packageToSnapshot } from "@/lib/packagePricing";
import { ForceLightTheme } from "@/components/ForceLightTheme";

interface ColorSubmissionEntry {
  paintGroupKey: string;
  groupLabel: string;
  colorName: string;
  finish: string;
  brand?: string;
}

interface ColorSubmissionData {
  status: string;
  entries: ColorSubmissionEntry[];
  rejectionNote?: string;
}

interface PortalDocument extends Document {
  contact: Contact;
  companySettings: CompanySettings | null;
  standardsExpectations?: string | null;
  termsConditions?: string | null;
  paymentInstructions?: string | null;
  sourceProposalToken?: string | null;
  ownerTier?: string;
  portalPackages?: ProposalPackage[];
  projectCoiFilePath?: string | null;
}

function ComplianceDocRow({ icon, label, sublabel, documentPath, isSigned, testId, portalToken }: {
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  documentPath: string;
  isSigned: boolean;
  testId: string;
  portalToken: string;
}) {
  const gatedUrl = `/api/portal/document/${portalToken}/compliance-file?path=${encodeURIComponent(documentPath)}`;

  return (
    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border" data-testid={testId}>
      {icon}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{label}</p>
        {sublabel && <p className="text-xs text-muted-foreground truncate">{sublabel}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-3 text-xs"
          onClick={() => window.open(gatedUrl, '_blank')}
          data-testid={`${testId}-view`}
        >
          {isSigned ? (
            <>
              <FileDown className="w-3.5 h-3.5 mr-1.5" />
              Download
            </>
          ) : (
            <>
              <Eye className="w-3.5 h-3.5 mr-1.5" />
              Preview
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function OptionalAddOnsSection({
  optionalItems,
  optionalBlocks,
  acceptedOptionals,
  toggleOptionalItem,
  isSigned,
  proposalDefaults,
  brandColor,
  excludedSurfaces,
  acceptedOptionalAreas,
  onToggleOptionalArea,
  contractorHiddenAreas,
}: {
  optionalItems: any[];
  optionalBlocks: any[];
  acceptedOptionals: string[];
  toggleOptionalItem: (id: string) => void;
  isSigned: boolean;
  proposalDefaults: any;
  brandColor: string | null;
  excludedSurfaces?: string[];
  acceptedOptionalAreas?: string[];
  onToggleOptionalArea?: (areaKey: string) => void;
  contractorHiddenAreas?: string[];
}) {
  return (
    <div className="mt-8 pt-6 border-t-2 border-emerald-300 dark:border-emerald-700" data-testid="optional-items-section">
      <div className="space-y-5">
        {optionalItems.map((item, i) => {
          const itemId = `item-${item.name || i}`;
          const isAccepted = acceptedOptionals.includes(itemId);
          const displayItem = { ...item, isOptional: false };

          return (
            <div
              key={`opt-item-${i}`}
              className={`rounded-xl overflow-hidden select-none transition-all duration-300 ${isAccepted ? 'bg-emerald-50 dark:bg-emerald-950/40 shadow-md' : 'border border-gray-200 dark:border-gray-700 shadow-sm'}`}
              data-testid={`optional-item-card-${i}`}
            >
              <div className={`flex items-center justify-between px-4 py-2 border-b cursor-pointer ${isAccepted ? 'bg-emerald-100 dark:bg-emerald-900/50 border-emerald-200 dark:border-emerald-800' : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800'}`} onClick={() => !isSigned && toggleOptionalItem(itemId)}>
                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Optional</span>
                <span className={`text-[10px] font-semibold ${isAccepted ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                  {isAccepted ? 'Tap to remove' : 'Select to include'}
                </span>
              </div>
              <div className="transition-opacity duration-300" style={{ opacity: isAccepted ? 1 : 0.55 }}>
                <LineItemRenderer
                  item={displayItem}
                  index={i}
                  mode="customer"
                  proposalDefaults={proposalDefaults}
                  pricesInCents={true}
                  brandColor={brandColor}
                  onBodyClick={() => !isSigned && toggleOptionalItem(itemId)}
                />
              </div>
            </div>
          );
        })}
        {optionalBlocks.map((block, i) => {
          const blockId = `block-${block.id}`;
          const isAccepted = acceptedOptionals.includes(blockId);
          return (
            <div
              key={`opt-block-${i}`}
              className={`rounded-xl overflow-hidden cursor-pointer select-none transition-all duration-300 ${isAccepted ? 'bg-emerald-50 dark:bg-emerald-950/40 shadow-md' : 'border border-gray-200 dark:border-gray-700 shadow-sm'}`}
              onClickCapture={(e) => { e.stopPropagation(); e.preventDefault(); if (!isSigned) toggleOptionalItem(blockId); }}
              data-testid={`optional-block-card-${i}`}
            >
              <div className={`flex items-center justify-between px-4 py-2 border-b ${isAccepted ? 'bg-emerald-100 dark:bg-emerald-900/50 border-emerald-200 dark:border-emerald-800' : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800'}`}>
                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Optional</span>
                <span className={`text-[10px] font-semibold ${isAccepted ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                  {isAccepted ? 'Tap to remove' : 'Select to include'}
                </span>
              </div>
              <div className="transition-opacity duration-300" style={{ opacity: isAccepted ? 1 : 0.55 }}>
                <ProductionRateBlocksSection blocks={[block]} brandColor={brandColor} noCard isCustomerView />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function CustomerPortal({ params }: { params: { token: string } }) {
  const token = params.token;
  const { toast } = useToast();
  const { maskName: dmName, maskPhone: dmPhone, maskEmail: dmEmail, maskAddress: dmAddress, maskCity: dmCity } = useDemoMode();
  const sigPad = useRef<SignatureCanvas>(null);
  const queryClient = useQueryClient();
  const [showChangeOrders, setShowChangeOrders] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [pdfViewUrl, setPdfViewUrl] = useState<string | null>(null);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [showDepositBanner, setShowDepositBanner] = useState(false);
  const [depositInfo, setDepositInfo] = useState<{ amount: number; invoiceToken?: string } | null>(null);
  const [showPaymentInstructions, setShowPaymentInstructions] = useState(false);
  const [paymentInstructionsContext, setPaymentInstructionsContext] = useState<{ amount: number; label: string } | null>(null);
  const [showPaymentOptionsModal, setShowPaymentOptionsModal] = useState(false);
  const [paymentOptionsContext, setPaymentOptionsContext] = useState<{
    depositAmount: number;
    totalAmount: number;
    nextPaymentAmount: number;
    nextPaymentLabel: string;
    allowOnlinePayment: boolean;
    allowOfflinePayment: boolean;
    isDeposit: boolean;
    isSchedulePayment: boolean;
  } | null>(null);
  const [showOfflineConfirmation, setShowOfflineConfirmation] = useState(false);
  const [offlineConfirmationContext, setOfflineConfirmationContext] = useState<{
    amount: number;
    label: string;
    hasInstructions: boolean;
  } | null>(null);
  const paymentBannerRef = useRef<HTMLDivElement>(null);
  const signatureSectionRef = useRef<HTMLDivElement>(null);
  const [colorEntries, setColorEntries] = useState<ColorSubmissionEntry[]>([]);
  const [acceptedOptionals, setAcceptedOptionals] = useState<string[]>([]);
  const [acceptedOptionalAreas, setAcceptedOptionalAreas] = useState<string[]>([]);
  const optionalsSaving = useRef(false);
  const [excludedSurfaces, setExcludedSurfaces] = useState<string[]>([]);
  const packageSaving = useRef(false);
  const [selectedPkgId, setSelectedPkgId] = useState<number | undefined>(undefined);
  const [pkgInitialized, setPkgInitialized] = useState(false);
  const [showCustomerHub, setShowCustomerHub] = useState(false);
  const [hubAuthenticated, setHubAuthenticated] = useState(false);
  const [hubSessionId, setHubSessionId] = useState<string | null>(() => {
    try { return sessionStorage.getItem(`hub_session_${token}`) || null; } catch { return null; }
  });
  const [hubOtpStep, setHubOtpStep] = useState<'identifier' | 'code'>('identifier');
  const [hubOtpIdentifier, setHubOtpIdentifier] = useState('');
  const [hubOtpCode, setHubOtpCode] = useState('');
  const [hubOtpLoading, setHubOtpLoading] = useState(false);
  const [hubOtpError, setHubOtpError] = useState('');
  const [hubOtpSuccess, setHubOtpSuccess] = useState('');
  const [hubOtpContactInfo, setHubOtpContactInfo] = useState<{ phone?: string; email?: string; companyName?: string } | null>(null);
  const [hubOtpNeedHelp, setHubOtpNeedHelp] = useState(false);
  const [showHubOtpModal, setShowHubOtpModal] = useState(false);

  const { data: doc, isLoading, error } = useQuery<PortalDocument>({
    queryKey: ['/api/portal/document', token],
    queryFn: async () => {
      const res = await fetch(`/api/portal/document/${token}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Document not found');
      }
      return res.json();
    },
  });

  useEffect(() => {
    if (!showCustomerHub || !hubSessionId) return;
    fetch(`/api/portal/document/${token}/hub-session/check`, {
      headers: { 'x-portal-session': hubSessionId },
    })
      .then(r => r.json())
      .then(data => {
        if (data.valid) {
          setHubAuthenticated(true);
        } else {
          setHubAuthenticated(false);
          setHubSessionId(null);
          try { sessionStorage.removeItem(`hub_session_${token}`); } catch {}
        }
      })
      .catch(() => {});
  }, [showCustomerHub, hubSessionId, token]);

  const handleHubOtpRequest = async () => {
    if (!hubOtpIdentifier.trim()) return;
    setHubOtpLoading(true);
    setHubOtpError('');
    setHubOtpNeedHelp(false);
    try {
      const res = await fetch(`/api/portal/document/${token}/hub-otp/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: hubOtpIdentifier.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setHubOtpError(data.message || 'Something went wrong');
      } else if (data.contactInfo) {
        setHubOtpContactInfo({ ...data.contactInfo, companyName: data.companyName });
      }

      if (data.noMatch || data.noEmail) {
        setHubOtpError(data.message);
        setHubOtpNeedHelp(true);
      } else if (data.sent) {
        setHubOtpStep('code');
        setHubOtpSuccess(data.message);
      }
    } catch {
      setHubOtpError('Something went wrong. Please try again.');
    } finally {
      setHubOtpLoading(false);
    }
  };

  const handleHubOtpVerify = async () => {
    if (!hubOtpCode.trim()) return;
    setHubOtpLoading(true);
    setHubOtpError('');
    try {
      const res = await fetch(`/api/portal/document/${token}/hub-otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: hubOtpIdentifier.trim(), code: hubOtpCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setHubOtpError(data.message || 'Invalid code');
      } else if (data.sessionId) {
        setHubSessionId(data.sessionId);
        setHubAuthenticated(true);
        try { sessionStorage.setItem(`hub_session_${token}`, data.sessionId); } catch {}
        setShowHubOtpModal(false);
        setHubOtpStep('identifier');
        setHubOtpCode('');
        setHubOtpIdentifier('');
        setHubOtpError('');
        setHubOtpSuccess('');
      }
    } catch {
      setHubOtpError('Something went wrong. Please try again.');
    } finally {
      setHubOtpLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/portal?token=${encodeURIComponent(token)}`;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    function connect() {
      if (closed) return;
      try { ws = new WebSocket(wsUrl); } catch { scheduleReconnect(); return; }

      ws.onmessage = () => {
        if (!optionalsSaving.current && !packageSaving.current) {
          queryClient.invalidateQueries({ queryKey: ['/api/portal/document', token] });
        }
      };
      ws.onclose = () => { ws = null; if (!closed) scheduleReconnect(); };
      ws.onerror = () => {};
    }

    function scheduleReconnect() {
      if (reconnectTimer || closed) return;
      reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, 3000);
    }

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, [token, queryClient]);

  const { data: portalPhotos = [] } = useQuery<any[]>({
    queryKey: ['/api/portal/document', token, 'photos'],
    queryFn: async () => {
      const res = await fetch(`/api/portal/document/${token}/photos`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!doc,
  });

  const optionalsSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toggleOptionalItem = async (itemId: string) => {
    optionalsSaving.current = true;
    if (optionalsSaveTimer.current) clearTimeout(optionalsSaveTimer.current);

    setAcceptedOptionals(prev => {
      const newAccepted = prev.includes(itemId)
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId];

      fetch(`/api/portal/document/${token}/optional-items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acceptedOptionalItems: newAccepted }),
      }).then(() => {
        optionalsSaveTimer.current = setTimeout(() => { optionalsSaving.current = false; }, 1000);
      }).catch(() => {
        optionalsSaving.current = false;
        queryClient.invalidateQueries({ queryKey: ['/api/portal/document', token] });
      });

      return newAccepted;
    });
  };

  const toggleOptionalArea = (areaKey: string) => {
    if (doc?.signature) return;
    setAcceptedOptionalAreas(prev =>
      prev.includes(areaKey) ? prev.filter(k => k !== areaKey) : [...prev, areaKey]
    );
  };

  const portalPackages = doc?.portalPackages || [];
  const packagesEnabled = doc?.content?.proposalPackagesEnabled === true && portalPackages.length > 0;
  const isProposal = doc?.type === 'proposal' || doc?.type === 'estimate';
  const showPackages = packagesEnabled && isProposal && !doc?.signature;

  useEffect(() => {
    if (!doc || pkgInitialized) return;
    if (packagesEnabled) {
      if (doc.content?.selectedPackageId) {
        setSelectedPkgId(doc.content.selectedPackageId);
      } else {
        const recommended = portalPackages.find(p => p.recommended);
        if (recommended) setSelectedPkgId(recommended.id);
        else if (portalPackages.length > 0) setSelectedPkgId(portalPackages[0].id);
      }
    }
    setPkgInitialized(true);
  }, [doc, pkgInitialized, packagesEnabled]);

  const packageSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savePackageSelection = async (pkgId: number | undefined) => {
    const pkgData = portalPackages.find(p => p.id === pkgId);
    packageSaving.current = true;
    if (packageSaveTimer.current) clearTimeout(packageSaveTimer.current);
    try {
      const res = await fetch(`/api/portal/document/${token}/package-selection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedPackageId: pkgId || null,
          packageSnapshot: pkgData ? packageToSnapshot(pkgData) : null,
        }),
      });
      if (!res.ok) {
        queryClient.invalidateQueries({ queryKey: ['/api/portal/document', token] });
      }
      packageSaveTimer.current = setTimeout(() => { packageSaving.current = false; }, 1000);
    } catch (e) {
      packageSaving.current = false;
      queryClient.invalidateQueries({ queryKey: ['/api/portal/document', token] });
    }
  };

  const handleSelectPackage = (pkg: PackageSnapshot) => {
    setSelectedPkgId(pkg.id);
    savePackageSelection(pkg.id);
  };

  const { mutate: signDoc, isPending: isSigning } = useMutation({
    mutationFn: async (signature: string) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      try {
        const res = await fetch(`/api/portal/document/${token}/sign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ signature, acceptedOptionalItems: acceptedOptionals, acceptedOptionalAreas, excludedSurfaces }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.message || 'Failed to sign');
        }
        return res.json();
      } catch (e: any) {
        clearTimeout(timeoutId);
        if (e.name === 'AbortError') {
          throw new Error('Request timed out. Please check your connection and try again.');
        }
        if (e.message === 'Failed to fetch' || e.message === 'Load failed' || e.message?.includes('NetworkError')) {
          throw new Error('Network error. Please check your connection and try again.');
        }
        throw e;
      }
    },
    retry: 2,
    retryDelay: (attempt) => Math.min(2000 * Math.pow(2, attempt), 8000),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/portal/document', token] });
      setShowSignatureModal(false);
      
      if (data.sourceProposalToken) {
        toast({ title: "Change Order Accepted!", description: "Redirecting to your proposal..." });
        setTimeout(() => {
          window.location.href = `/portal/document/${data.sourceProposalToken}`;
        }, 1500);
      } else {
        const hasOnline = !!data.allowOnlinePayment;
        const hasOffline = !!data.allowOfflinePayment;
        const hasAnyPaymentMethod = hasOnline || hasOffline;
        const hasDeposit = data.depositRequired && data.depositAmount > 0;

        if (hasDeposit) {
          setDepositInfo({ amount: data.depositAmount });
        }

        if (hasAnyPaymentMethod && (hasDeposit || data.totalAmount > 0)) {
          toast({ title: "Proposal Accepted!", description: "Thank you! Please select a payment option." });
          const nextAmount = hasDeposit ? data.depositAmount : data.totalAmount;
          const nextLabel = hasDeposit ? 'Down Payment' : 'Payment';
          setPaymentOptionsContext({
            depositAmount: hasDeposit ? data.depositAmount : 0,
            totalAmount: data.totalAmount || 0,
            nextPaymentAmount: nextAmount,
            nextPaymentLabel: nextLabel,
            allowOnlinePayment: hasOnline,
            allowOfflinePayment: hasOffline,
            isDeposit: hasDeposit,
            isSchedulePayment: false,
          });
          setShowPaymentOptionsModal(true);
        } else if (hasDeposit) {
          toast({ title: "Proposal Accepted!", description: "Thank you! A deposit is required." });
          setShowDepositBanner(true);
          setTimeout(() => paymentBannerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
        } else {
          toast({ title: "Document Signed!", description: "Thank you for signing. A copy will be sent to you." });
        }
      }
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  });

  const { mutate: rejectDoc, isPending: isRejecting } = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/portal/document/${token}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to decline');
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/portal/document', token] });
      
      if (data.sourceProposalToken) {
        toast({ title: "Change Order Declined", description: "Redirecting to your proposal..." });
        setTimeout(() => {
          window.location.href = `/portal/document/${data.sourceProposalToken}`;
        }, 1500);
      } else {
        toast({ title: "Change Order Declined", description: "The company has been notified." });
      }
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  });

  // Fetch change orders for proposals/estimates
  const { data: changeOrders } = useQuery<Document[]>({
    queryKey: ['/api/portal/document', token, 'change-orders'],
    queryFn: async () => {
      const res = await fetch(`/api/portal/document/${token}/change-orders`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!doc && (doc.type === 'proposal' || doc.type === 'estimate'),
  });

  const { data: customerHub } = useQuery<any>({
    queryKey: ['/api/portal/document', token, 'customer-hub'],
    queryFn: async () => {
      const res = await fetch(`/api/portal/document/${token}/customer-hub`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: showCustomerHub,
  });

  const { data: payments } = useQuery<Payment[]>({
    queryKey: ['/api/portal/document', token, 'payments'],
    queryFn: async () => {
      const res = await fetch(`/api/portal/document/${token}/payments`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!doc && (doc.type === 'invoice' || ((doc.type === 'proposal' || doc.type === 'estimate') && !!doc.signature)),
  });

  const { data: colorSubmissions, isLoading: isLoadingColors } = useQuery<ColorSubmissionData>({
    queryKey: ['/api/portal', token, 'color-submissions'],
    queryFn: async () => {
      const res = await fetch(`/api/portal/${token}/color-submissions`);
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
    enabled: !!doc?.signedAt && !!doc?.allowClientColorSubmission,
  });

  const { mutate: submitColors, isPending: isSubmittingColors } = useMutation({
    mutationFn: async (entries: ColorSubmissionEntry[]) => {
      const res = await fetch(`/api/portal/${token}/color-submissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to submit');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/portal', token, 'color-submissions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/portal/document', token] });
      toast({ title: "Colors Submitted", description: "Your color selections have been submitted for review." });
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (doc && doc.status === 'sent') {
      fetch(`/api/portal/document/${token}/view`, { method: 'POST' });
    }
  }, [doc, token]);

  useEffect(() => {
    if (doc && doc.type === 'change_order' && doc.signature && doc.sourceProposalToken) {
      window.location.href = `/portal/document/${doc.sourceProposalToken}`;
    }
  }, [doc]);

  const colorEntriesInitializedRef = useRef(false);
  useEffect(() => {
    if (!doc) return;
    const shouldReinit = !colorEntriesInitializedRef.current || colorSubmissions?.status === 'needs_update';
    if (!shouldReinit && colorEntries.length > 0) return;

    const paintGroups = new Map<string, string>();
    doc.content?.items?.forEach((item: any) => {
      item.surfaces?.forEach((surface: any) => {
        if (surface.paintGroupKey && !paintGroups.has(surface.paintGroupKey)) {
          paintGroups.set(surface.paintGroupKey, surface.label || surface.paintGroupKey);
        }
      });
    });

    if (paintGroups.size === 0 && Array.isArray(doc.content?.colorAreas)) {
      doc.content.colorAreas.forEach((area: { key: string; label: string }) => {
        if (area.key && area.label) {
          paintGroups.set(area.key, area.label);
        }
      });
    }

    if (paintGroups.size > 0) {
      const existing = colorSubmissions?.entries;
      const entries: ColorSubmissionEntry[] = [];
      paintGroups.forEach((label, key) => {
        const found = existing?.find((e: ColorSubmissionEntry) => e.paintGroupKey === key);
        entries.push({
          paintGroupKey: key,
          groupLabel: label,
          colorName: found?.colorName || '',
          finish: found?.finish || '',
          brand: found?.brand || '',
        });
      });
      setColorEntries(entries);
      colorEntriesInitializedRef.current = true;
    }
  }, [doc, colorSubmissions]);

  const handleSign = () => {
    if (sigPad.current) {
      if (sigPad.current.isEmpty()) {
        toast({ title: "Signature Required", description: "Please sign below before accepting", variant: "destructive" });
        return;
      }
      const signatureData = sigPad.current.toDataURL();
      signDoc(signatureData);
    }
  };

  const [isCreatingPaymentSession, setIsCreatingPaymentSession] = useState(false);

  const handleCardPayment = async (amount: number, description: string, scheduleIndex?: number) => {
    try {
      setIsCreatingPaymentSession(true);
      const res = await fetch(`/api/portal/document/${token}/create-payment-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, description, scheduleIndex }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Payment Error", description: data.message || "Unable to process payment", variant: "destructive" });
        return;
      }
      if (data.url) {
        sessionStorage.setItem(`payment_pending_${token}`, JSON.stringify({ amount, description, scheduleIndex }));
        window.location.href = data.url;
      }
    } catch (err) {
      toast({ title: "Payment Error", description: "Something went wrong. Please try again.", variant: "destructive" });
    } finally {
      setIsCreatingPaymentSession(false);
    }
  };

  useEffect(() => {
    document.documentElement.classList.remove('dark');
    return () => {
      const savedTheme = localStorage.getItem('theme');
      if (savedTheme === 'dark') {
        document.documentElement.classList.add('dark');
      }
    };
  }, []);

  useEffect(() => {
    if (!token || !doc) return;
    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get('payment');
    const processor = urlParams.get('processor');
    const stripeSessionId = urlParams.get('session_id');

    if (paymentStatus === 'success') {
      const pendingKey = `payment_pending_${token}`;
      const pendingData = sessionStorage.getItem(pendingKey);

      if (pendingData) {
        const { amount, description, scheduleIndex } = JSON.parse(pendingData);
        sessionStorage.removeItem(pendingKey);

        fetch(`/api/portal/document/${token}/record-payment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount,
            scheduleIndex,
            processor: processor || 'stripe',
            paymentLabel: description || 'Payment',
            stripeSessionId: stripeSessionId || undefined,
          }),
        })
          .then(res => res.json())
          .then(data => {
            if (data.success) {
              toast({
                title: "Payment Successful!",
                description: `Your payment of $${(Math.round(amount) / 100).toFixed(2)} has been received. A receipt has been sent to your email.`,
              });
              queryClient.invalidateQueries({ queryKey: ['/api/portal/document', token] });
              queryClient.invalidateQueries({ queryKey: ['/api/portal/document', token, 'payments'] });
            }
          })
          .catch(err => {
            console.error('Failed to record payment:', err);
          });
      }

      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, '', cleanUrl);
    } else if (paymentStatus === 'cancelled') {
      toast({
        title: "Payment Cancelled",
        description: "Your payment was not completed. You can try again anytime.",
        variant: "destructive",
      });
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, '', cleanUrl);
    }
  }, [token, doc]);

  useEffect(() => {
    if (optionalsSaving.current) return;
    if (doc?.content?.acceptedOptionalItems) {
      setAcceptedOptionals(doc.content.acceptedOptionalItems);
    } else if (doc && !doc.content?.acceptedOptionalItems) {
      setAcceptedOptionals([]);
    }
    if ((doc?.content as any)?.acceptedOptionalAreas) {
      setAcceptedOptionalAreas((doc.content as any).acceptedOptionalAreas);
    } else if (doc && !(doc?.content as any)?.acceptedOptionalAreas) {
      setAcceptedOptionalAreas([]);
    }
  }, [doc]);

  useEffect(() => {
    if (doc?.content?.excludedSurfaces) {
      setExcludedSurfaces(doc.content.excludedSurfaces);
    } else if (doc && !doc.content?.excludedSurfaces) {
      setExcludedSurfaces([]);
    }
  }, [doc]);

  useEffect(() => {
    if (packageSaving.current || !pkgInitialized || !doc) return;
    const serverPkgId = doc.content?.selectedPackageId ?? doc.content?.packageSnapshot?.id ?? undefined;
    if (serverPkgId !== selectedPkgId) {
      setSelectedPkgId(serverPkgId);
    }
  }, [doc, pkgInitialized]);

  const themeColor = doc?.companySettings?.secondaryColor || '#1e293b';
  useEffect(() => {
    const metaThemeColor = document.querySelector('meta[name="theme-color"][media="(prefers-color-scheme: light)"]');
    const metaThemeColorDark = document.querySelector('meta[name="theme-color"][media="(prefers-color-scheme: dark)"]');
    const prevLight = metaThemeColor?.getAttribute('content') || '#ffffff';
    const prevDark = metaThemeColorDark?.getAttribute('content') || '#232d3b';
    const prevBodyBg = document.body.style.backgroundColor;

    if (metaThemeColor) metaThemeColor.setAttribute('content', themeColor);
    if (metaThemeColorDark) metaThemeColorDark.setAttribute('content', themeColor);
    document.body.style.backgroundColor = themeColor;

    return () => {
      if (metaThemeColor) metaThemeColor.setAttribute('content', prevLight);
      if (metaThemeColorDark) metaThemeColorDark.setAttribute('content', prevDark);
      document.body.style.backgroundColor = prevBodyBg;
    };
  }, [themeColor]);

  if (isLoading) {
    return (
      <ForceLightTheme>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <Loader2 className="w-10 h-10 animate-spin text-gray-500" />
        </div>
      </ForceLightTheme>
    );
  }

  if (error || !doc) {
    return (
      <ForceLightTheme>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
          <Card className="max-w-md w-full bg-white border-gray-200">
            <CardContent className="pt-6 text-center space-y-4">
              <AlertCircle className="w-16 h-16 text-red-500 mx-auto" />
              <h2 className="text-xl font-bold text-gray-900">Document Not Found</h2>
              <p className="text-gray-500">
                This document may have been removed or the link is invalid.
              </p>
            </CardContent>
          </Card>
        </div>
      </ForceLightTheme>
    );
  }

  const settings = doc.companySettings;
  // Prefer the document's own validUntil if set; otherwise default to createdAt + 30 days.
  const explicitValidUntil = (doc.content as any)?.validUntil;
  const validThroughDate = explicitValidUntil
    ? new Date(explicitValidUntil)
    : (doc.createdAt ? addDays(new Date(doc.createdAt), 30) : null);
  const isExpired = !!(validThroughDate && !isNaN(validThroughDate.getTime()) && isBefore(validThroughDate, new Date()));
  const isProposalOrEstimate = ['proposal', 'estimate', 'change_order'].includes(doc.type);
  const isLocked = ['accepted', 'paid', 'rejected'].includes(doc.status);

  const companyName = settings?.companyName || 'Company';
  const companyLicense = (settings as any)?.companyLicense || '';
  const companyAddress = settings?.address || '';
  const companyCityStateZip = [settings?.city, settings?.state, settings?.zipCode].filter(Boolean).join(', ');
  const companyEmail = settings?.email || '';
  const companyPhone = settings?.phone || '';
  const companyLogo = settings?.logo || '';
  const companyTagline = settings?.tagline || '';
  const companySecondaryColor = settings?.secondaryColor || '';
  const trustBadges: Array<{ id: string; label: string }> = (settings?.documentTrustBadges || []).filter((b: { id: string; label: string }) => b.label?.trim());
  const headerBgColor = companySecondaryColor || '#1e293b';
  const headerAccentColor = settings?.brandColor || '#3b82f6';

  const isLightBg = (() => {
    const hex = headerBgColor.replace('#', '');
    if (!/^[0-9a-fA-F]{3,6}$/.test(hex)) return false;
    const full = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex;
    const r = parseInt(full.substring(0, 2), 16);
    const g = parseInt(full.substring(2, 4), 16);
    const b = parseInt(full.substring(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6;
  })();
  const headerTextColor = isLightBg ? '#1a1a1a' : '#ffffff';
  const headerTextMuted = isLightBg ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.6)';
  const headerTextSemiMuted = isLightBg ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.8)';
  const headerBorderColor = isLightBg ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.2)';
  const headerSubtleBg = isLightBg ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.1)';
  const headerFooterBorder = isLightBg ? '1px solid rgba(0,0,0,0.1)' : '1px solid rgba(255,255,255,0.08)';

  const portalFallbackTaxRate = settings?.taxRate ? parseFloat(settings.taxRate) : 0;
  const portalDocTaxBlock = (doc?.content?.productionRateBlocks || []).find((b: any) => b.taxable && b.taxProfileRate != null);
  const portalTaxRate = portalDocTaxBlock ? parseFloat(String(portalDocTaxBlock.taxProfileRate)) : portalFallbackTaxRate;
  const portalTaxProfileNameRaw = portalDocTaxBlock?.taxProfileName || null;
  const portalTaxProfileName = portalTaxProfileNameRaw && portalTaxProfileNameRaw.length > 22
    ? portalTaxProfileNameRaw.slice(0, 20).trimEnd() + '…'
    : portalTaxProfileNameRaw;
  const portalCalcTax = (items: any[]) => {
    const pricedItems = items.filter((i: any) => !i.descriptionOnly);
    const subtotal = pricedItems.reduce((sum: number, item: any) => sum + (item.total || 0), 0);
    const taxableTotal = pricedItems.filter((i: any) => i.taxable).reduce((sum: number, item: any) => sum + (item.total || 0), 0);
    const taxAmount = portalTaxRate > 0 ? Math.round(taxableTotal * portalTaxRate / 100) : 0;
    return { subtotal, taxableTotal, taxAmount, grandTotal: subtotal + taxAmount };
  };
  const portalTotalPaid = payments?.reduce((sum, p) => sum + p.amount, 0) || 0;
  const portalRemainingBalance = (doc?.totalAmount || 0) - portalTotalPaid;

  const portalChAreas: string[] = doc.content?.contractorHiddenAreas || [];
  const portalChItems: string[] = doc.content?.contractorHiddenItems || [];
  const excludedSurfacesCostCents = (() => {
    const filtered = filterExcludedForHiddenAreas(excludedSurfaces, portalChAreas);
    if (filtered.length === 0) return 0;
    const allBlocks = doc.content?.productionRateBlocks || [];
    let totalExcluded = 0;
    for (const block of allBlocks) {
      if (block.isOptional && !acceptedOptionals.includes(`block-${block.id}`)) continue;
      const excl = calcExcludedTotals(block, filtered);
      totalExcluded += excl.grandTotal;
    }
    return Math.round(totalExcluded * 100);
  })();

  const stickyTotalsBreakdown = (() => {
    if (doc.signature && doc.type !== 'invoice') {
      return { total: doc.totalAmount, taxableBaseCents: 0, taxCents: 0, subtotalAfterDiscountCents: doc.totalAmount };
    }

    if (doc.type === 'invoice') {
      return { total: doc.totalAmount || 0, taxableBaseCents: 0, taxCents: 0, subtotalAfterDiscountCents: doc.totalAmount || 0 };
    }

    const allItems = doc.content?.items || [];
    const nonOptItems = allItems.filter((item: any) => !item.isOptional && !item.name?.startsWith('[CO]'));
    const optItems = allItems.filter((item: any) => item.isOptional);
    const optBlocks = (doc.content?.productionRateBlocks || []).filter((b: any) => b.isOptional);

    const nonOptBlocks = (doc.content?.productionRateBlocks || []).filter((b: any) => !b.isOptional);
    const blocksPreDiscountCents = nonOptBlocks.reduce((s: number, b: any) => s + Math.round((b.roomBuilderData?.grandTotal || 0) * 100), 0);
    const itemsPreDiscountCents = nonOptItems.reduce((s: number, i: any) => s + (i.total || 0), 0);
    const hiddenItemsCents = nonOptItems.reduce((s: number, i: any, idx: number) => {
      const key = `item-${i.name || idx}`;
      return portalChItems.includes(key) ? s + (i.total || 0) : s;
    }, 0);
    const hasBlocks = nonOptBlocks.length > 0;
    const baseAmount = doc.type === 'invoice'
      ? itemsPreDiscountCents
      : hasBlocks
        ? blocksPreDiscountCents + itemsPreDiscountCents
        : (nonOptItems.length > 0
            ? itemsPreDiscountCents
            : (doc.totalAmount - (changeOrders?.filter((co: any) => co.signature).reduce((s: number, co: any) => s + co.totalAmount, 0) || 0)));

    const acceptedOptTotal = optItems.reduce((s: number, item: any, i: number) => {
      const id = `item-${item.name || i}`;
      return acceptedOptionals.includes(id) ? s + (item.total || 0) : s;
    }, 0) + optBlocks.reduce((s: number, block: any) => {
      const id = `block-${block.id}`;
      return acceptedOptionals.includes(id) ? s + Math.round(block.roomBuilderData.grandTotal * 100) : s;
    }, 0);

    let optionalAreaExclCents = 0;
    {
      for (const block of nonOptBlocks) {
        const areas = block.roomBuilderData?.areaResults || [];
        const rooms = block.roomBuilderData?.rooms || [];
        const unacceptedAreaIds = areas
          .filter((a: any) => {
            const isOpt = a.isOptional || (rooms.find((r: any) => r.id === a.roomId) as any)?.isOptional;
            if (!isOpt) return false;
            return !acceptedOptionalAreas.includes(`${block.id}:area:${a.roomId}`);
          })
          .map((a: any) => `${block.id}:area:${a.roomId}`);
        if (unacceptedAreaIds.length > 0) {
          const excl = calcOptionalAreaTotals(block, unacceptedAreaIds);
          optionalAreaExclCents += Math.round(excl.grandTotal * 100);
        }
      }
    }
    let contractorHiddenCents = 0;
    {
      if (portalChAreas.length > 0) {
        const allBlks = doc.content?.productionRateBlocks || [];
        for (const block of allBlks) {
          if (block.isOptional && !acceptedOptionals.includes(`block-${block.id}`)) continue;
          const excl = calcContractorHiddenTotals(block, portalChAreas);
          contractorHiddenCents += Math.round(excl.grandTotal * 100);
        }
      }
    }
    const effectiveBaseForPkg = baseAmount - excludedSurfacesCostCents - optionalAreaExclCents - contractorHiddenCents - hiddenItemsCents;
    const displayBase = effectiveBaseForPkg + acceptedOptTotal;

    let pkgAdj = 0;
    if (showPackages && selectedPkgId) {
      const selPkg = portalPackages.find(p => p.id === selectedPkgId);
      if (selPkg) {
        pkgAdj = selPkg.priceAdjustmentType === 'percent'
          ? Math.round(effectiveBaseForPkg * (selPkg.adjustmentValue / 100))
          : Math.round((selPkg.adjustmentValue || 0) * 100);
      }
    }

    let taxableTotal = 0;
    for (const item of nonOptItems) {
      if (item.taxable) taxableTotal += (item.total || 0);
    }
    for (const block of nonOptBlocks) {
      if (block.taxable) taxableTotal += Math.round((block.roomBuilderData?.grandTotal || 0) * 100);
    }
    for (let i = 0; i < optItems.length; i++) {
      const item = optItems[i];
      const id = `item-${item.name || i}`;
      if (acceptedOptionals.includes(id) && item.taxable) taxableTotal += (item.total || 0);
    }
    for (const block of optBlocks) {
      const id = `block-${block.id}`;
      if (acceptedOptionals.includes(id) && block.taxable) taxableTotal += Math.round(block.roomBuilderData.grandTotal * 100);
    }
    {
      const filteredForTax = filterExcludedForHiddenAreas(excludedSurfaces, portalChAreas);
      if (filteredForTax.length > 0) {
        const allBlocks = doc.content?.productionRateBlocks || [];
        for (const block of allBlocks) {
          if (block.isOptional && !acceptedOptionals.includes(`block-${block.id}`)) continue;
          if (!block.taxable) continue;
          const excl = calcExcludedTotals(block, filteredForTax);
          taxableTotal -= Math.round(excl.grandTotal * 100);
        }
      }
    }
    const baseForDiscount = effectiveBaseForPkg + pkgAdj;
    const subtotalBeforeDiscount = baseForDiscount + acceptedOptTotal;
    const portalDiscounts: { type: 'flat' | 'percentage'; value: number; label?: string; description?: string }[] = doc.content?.discounts?.length
      ? doc.content.discounts
      : doc.content?.discount?.value ? [doc.content.discount] : [];
    let discountCents = 0;
    for (const d of portalDiscounts) {
      if (d.value > 0) {
        discountCents += d.type === 'percentage'
          ? Math.round(baseForDiscount * (Math.min(d.value, 100) / 100))
          : Math.round(d.value * 100);
      }
    }
    discountCents = Math.min(discountCents, Math.max(0, subtotalBeforeDiscount));
    const afterDiscount = subtotalBeforeDiscount - discountCents;
    {
      const taxBlks = doc.content?.productionRateBlocks || [];
      for (const blk of taxBlks) {
        if (blk.isOptional && !acceptedOptionals.includes(`block-${blk.id}`)) continue;
        if (!blk.taxable) continue;
        const a2 = blk.roomBuilderData?.areaResults || [];
        const r2 = blk.roomBuilderData?.rooms || [];
        const unaccepted2 = a2
          .filter((a: any) => {
            const isOpt = a.isOptional || (r2.find((r: any) => r.id === a.roomId) as any)?.isOptional;
            return isOpt && !acceptedOptionalAreas.includes(`${blk.id}:area:${a.roomId}`);
          })
          .map((a: any) => `${blk.id}:area:${a.roomId}`);
        if (unaccepted2.length > 0) {
          const ex2 = calcOptionalAreaTotals(blk, unaccepted2);
          taxableTotal -= Math.round(ex2.grandTotal * 100);
        }
      }
    }
    {
      if (portalChAreas.length > 0) {
        const taxBlks2 = doc.content?.productionRateBlocks || [];
        for (const blk of taxBlks2) {
          if (blk.isOptional && !acceptedOptionals.includes(`block-${blk.id}`)) continue;
          if (!blk.taxable) continue;
          const excl = calcContractorHiddenTotals(blk, portalChAreas);
          taxableTotal -= Math.round(excl.grandTotal * 100);
        }
      }
    }
    const discountRatio = subtotalBeforeDiscount > 0 ? afterDiscount / subtotalBeforeDiscount : 1;
    const taxableAfterDiscount = Math.max(0, Math.round(taxableTotal * discountRatio));
    const tax = portalTaxRate > 0 ? Math.round(taxableAfterDiscount * portalTaxRate / 100) : 0;

    return { total: afterDiscount + tax, taxableBaseCents: taxableAfterDiscount, taxCents: tax, subtotalAfterDiscountCents: afterDiscount };
  })();
  const stickyTotalCents = stickyTotalsBreakdown.total;
  const portalTaxableBaseCents = stickyTotalsBreakdown.taxableBaseCents;

  const showStickyFooter = isProposalOrEstimate && !doc.signature && !isExpired && !isLocked;

  const paymentSettings = doc.content?.paymentSettings;
  const hasOnlinePayment = !!paymentSettings?.allowOnlinePayment;
  const hasOfflinePayment = !!paymentSettings?.allowOfflinePayment;
  const hasAnyPaymentEnabled = hasOnlinePayment || hasOfflinePayment;

  const depositCents = (() => {
    if (!paymentSettings?.depositRequired || !paymentSettings?.depositAmount) return 0;
    if (paymentSettings.depositType === 'percentage') {
      return Math.round(stickyTotalCents * (paymentSettings.depositAmount / 100));
    }
    return Math.round(paymentSettings.depositAmount * 100);
  })();
  const isDepositUnpaid = depositCents > 0 && portalTotalPaid < depositCents;

  const schedule = doc.content?.paymentSettings?.schedule as Array<{ label: string; amount: number; dueCondition?: string; paid?: boolean }> | undefined;

  const adjustedSchedule = (() => {
    if (!schedule || schedule.length === 0) return [];
    const origTotal = schedule.reduce((s, item) => s + (item.amount || 0), 0);
    const remaining = Math.max(0, stickyTotalCents - depositCents);
    if (origTotal <= 0) return schedule.map(item => ({ ...item, adjustedAmount: item.amount || 0 }));
    let distributed = 0;
    return schedule.map((item, idx) => {
      let adj: number;
      if (idx === schedule.length - 1) {
        adj = remaining - distributed;
      } else {
        adj = Math.round(remaining * ((item.amount || 0) / origTotal));
        distributed += adj;
      }
      return { ...item, adjustedAmount: Math.max(0, adj) };
    });
  })();

  const nextScheduleItem = adjustedSchedule.find(item => !item.paid);

  const paymentAmountDue = (() => {
    if (doc.type === 'invoice' && doc.requestedPaymentAmount && doc.requestedPaymentAmount > 0) {
      return doc.requestedPaymentAmount;
    }
    if (isDepositUnpaid) return depositCents;
    if (nextScheduleItem) return nextScheduleItem.adjustedAmount;
    return portalRemainingBalance;
  })();

  const paymentFooterLabel = (() => {
    if (doc.type === 'invoice' && doc.requestedPaymentAmount && doc.requestedPaymentAmount > 0) return 'Requested Payment';
    if (isDepositUnpaid) return doc.type === 'invoice' ? 'Deposit Due' : 'Down Payment Due';
    if (nextScheduleItem) return nextScheduleItem.label;
    return portalTotalPaid > 0 ? 'Balance Due' : 'Amount Due';
  })();

  const cardFeePercent = (paymentSettings?.cardFeeEnabled && paymentSettings?.cardFeePercent && paymentSettings.cardFeePercent > 0)
    ? Math.min(paymentSettings.cardFeePercent, 4)
    : 0;
  const calcCardFee = (baseCents: number) => Math.round(baseCents * (cardFeePercent / 100));

  const showPaymentFooter = (
    (isProposalOrEstimate && !!doc.signature && !isExpired && portalRemainingBalance > 0 && hasAnyPaymentEnabled) ||
    (doc.type === 'invoice' && portalRemainingBalance > 0 && hasAnyPaymentEnabled)
  );

  const handleStickyAccept = () => {
    signatureSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => setShowSignatureModal(true), 600);
  };

  const openPaymentOptions = () => {
    const nextAmount = paymentAmountDue;
    const nextLabel = paymentFooterLabel;
    const isSchedulePayment = !isDepositUnpaid && !!nextScheduleItem;
    setPaymentOptionsContext({
      depositAmount: isDepositUnpaid ? depositCents : 0,
      totalAmount: portalRemainingBalance,
      nextPaymentAmount: nextAmount,
      nextPaymentLabel: nextLabel,
      allowOnlinePayment: hasOnlinePayment,
      allowOfflinePayment: hasOfflinePayment,
      isDeposit: isDepositUnpaid,
      isSchedulePayment,
    });
    setShowPaymentOptionsModal(true);
  };

  const handleDownloadPDF = async () => {
    if (!doc || !settings) return;
    
    setIsGeneratingPDF(true);
    try {
      const excludeTerms = doc.type === 'change_order' || doc.type === 'invoice';
      const isInvoice = doc.type === 'invoice';
      const hiddenPhotoIds: number[] = (doc.content as any)?.hiddenDocumentPhotoIds || [];
      const visiblePortalPhotos = portalPhotos.filter((p: any) => !hiddenPhotoIds.includes(p.id));
      const pdfPhotos = (doc.content as any)?.includePhotosInPdf && visiblePortalPhotos.length > 0 ? visiblePortalPhotos : undefined;
      const pdfSourcePhotos = (doc.content as any)?.includedSourcePhotos?.length > 0
        ? (doc.content as any).includedSourcePhotos as string[]
        : undefined;

      const pdfBlob = await generateDocumentPDF(
        doc, 
        settings, 
        changeOrders || undefined,
        excludeTerms ? undefined : (doc.standardsExpectations || undefined),
        excludeTerms ? undefined : (doc.termsConditions || undefined),
        isInvoice ? payments : undefined,
        packagesEnabled && portalPackages?.length ? portalPackages : undefined,
        selectedPkgId,
        acceptedOptionals.length > 0 ? acceptedOptionals : undefined,
        pdfPhotos,
        pdfSourcePhotos,
        excludedSurfaces.length > 0 ? excludedSurfaces : undefined,
        acceptedOptionalAreas.length > 0 ? acceptedOptionalAreas : undefined
      );
      const url = URL.createObjectURL(pdfBlob);
      const docType = doc.type.replace('_', ' ');
      const filename = `${docType}-${(doc.documentNumber || doc.id).toString().padStart(6, '0')}.pdf`;
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 3000);
      toast({ title: "PDF Downloaded", description: "Your document has been downloaded" });
    } catch (error) {
      console.error('PDF generation failed:', error);
      toast({ 
        title: "Failed to generate PDF", 
        description: "Please try again", 
        variant: "destructive" 
      });
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const handleClosePDF = () => {
    if (pdfViewUrl) {
      URL.revokeObjectURL(pdfViewUrl);
    }
    setPdfViewUrl(null);
  };

  const handleDownloadFromViewer = () => {
    if (!pdfViewUrl || !doc) return;
    const docType = doc.type.replace('_', ' ');
    const filename = `${docType}-${(doc.documentNumber || doc.id).toString().padStart(6, '0')}.pdf`;
    const link = document.createElement('a');
    link.href = pdfViewUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: "PDF Downloaded", description: "Your document has been downloaded" });
  };

  // PDF Viewer Overlay
  if (pdfViewUrl) {
    return (
      <ForceLightTheme>
        <div className="fixed inset-0 z-[9999] bg-white flex flex-col">
          <div className="flex items-center justify-between p-4 border-b bg-white">
            <Button 
              variant="ghost" 
              onClick={handleClosePDF}
              data-testid="button-pdf-back"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <h2 className="font-semibold text-lg hidden sm:block text-gray-900">
              {doc?.type.replace('_', ' ').charAt(0).toUpperCase() + doc?.type.replace('_', ' ').slice(1)} #{(doc?.documentNumber || doc?.id)?.toString().padStart(6, '0')}
            </h2>
            <Button 
              variant="outline" 
              onClick={handleDownloadFromViewer}
              data-testid="button-pdf-download"
            >
              <FileDown className="w-4 h-4 mr-2" />
              Download
            </Button>
          </div>
          <div className="flex-1 overflow-hidden">
            <iframe 
              src={pdfViewUrl} 
              className="w-full h-full border-0"
              title="PDF Document"
            />
          </div>
        </div>
      </ForceLightTheme>
    );
  }

  return (
    <ForceLightTheme>
    <div className="min-h-screen pb-8 px-0" style={{ backgroundColor: headerBgColor }}>
      <div className="max-w-4xl mx-auto">
        {/* Status Banner - show signed banner for non-invoice documents */}
        {doc.signature && doc.type !== 'invoice' && (
          <Card className="bg-green-50 border-green-200">
            <CardContent className="py-4 flex items-center gap-3">
              <CheckCircle className="w-6 h-6 text-green-600" />
              <div>
                <p className="font-medium text-green-800">This document has been signed</p>
                <p className="text-sm text-green-600">
                  Signed on {doc.signedAt ? format(new Date(doc.signedAt), "MMMM d, yyyy 'at' h:mm a") : 'Unknown'}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Starter tier: Thank you message after signing with payment contact info */}
        {doc.signature && doc.type !== 'invoice' && doc.ownerTier === 'starter' && (
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="py-4 space-y-2" data-testid="starter-thankyou-banner">
              <p className="font-medium text-blue-800">
                Thank you for signing and trusting {settings?.companyName || 'us'} with your project!
              </p>
              <p className="text-sm text-blue-700">
                To arrange payment, please reach out to us directly
                {settings?.phone ? ` at ${formatPhoneDisplay(settings.phone)}` : ''}
                {settings?.phone && settings?.email ? ' or' : ''}
                {settings?.email ? ` at ${settings.email}` : ''}.
                We look forward to getting started!
              </p>
            </CardContent>
          </Card>
        )}

        {/* Payment Status Banner for Invoices - shown at top level */}
        {doc.type === 'invoice' && portalRemainingBalance <= 0 && portalTotalPaid > 0 && (
          <Card className="bg-green-50 border-green-200">
            <CardContent className="py-4 text-center">
              <p className="font-medium text-green-800">
                This invoice has been paid in full - ${(portalTotalPaid / 100).toFixed(2)}
              </p>
            </CardContent>
          </Card>
        )}
        {doc.type === 'invoice' && portalRemainingBalance > 0 && doc.requestedPaymentAmount && doc.requestedPaymentAmount > 0 && (
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="py-4 text-center space-y-2">
              <p className="font-medium text-blue-800">
                Payment of <span className="font-bold">${(doc.requestedPaymentAmount / 100).toFixed(2)}</span> requested for this invoice
              </p>
              {portalTotalPaid > 0 && (
                <p className="text-sm text-blue-600">
                  ${(portalTotalPaid / 100).toFixed(2)} of ${(doc.totalAmount / 100).toFixed(2)} paid so far
                </p>
              )}
              {hasAnyPaymentEnabled && (
                <p className="text-xs text-blue-600">Use the payment button below to pay</p>
              )}
            </CardContent>
          </Card>
        )}
        {doc.type === 'invoice' && portalRemainingBalance > 0 && (!doc.requestedPaymentAmount || doc.requestedPaymentAmount <= 0) && portalTotalPaid > 0 && (
          <Card className="bg-orange-50 border-orange-200">
            <CardContent className="py-4 text-center space-y-2">
              <p className="font-medium text-orange-800">
                Payment of <span className="font-bold">${(portalRemainingBalance / 100).toFixed(2)}</span> remaining on this invoice
              </p>
              <p className="text-sm text-orange-600">
                ${(portalTotalPaid / 100).toFixed(2)} of ${(doc.totalAmount / 100).toFixed(2)} paid
              </p>
            </CardContent>
          </Card>
        )}
        {doc.type === 'invoice' && portalRemainingBalance > 0 && (!doc.requestedPaymentAmount || doc.requestedPaymentAmount <= 0) && portalTotalPaid === 0 && hasAnyPaymentEnabled && (
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="py-4 text-center space-y-2">
              <p className="font-medium text-blue-800">
                Invoice total: <span className="font-bold">${((doc.totalAmount || 0) / 100).toFixed(2)}</span>
              </p>
              <p className="text-xs text-blue-600">Use the payment button below to pay</p>
            </CardContent>
          </Card>
        )}

        {doc.status === 'rejected' && (
          <Card className="bg-red-50 border-red-200">
            <CardContent className="py-4 flex items-center gap-3">
              <XCircle className="w-6 h-6 text-red-600" />
              <div>
                <p className="font-medium text-red-800">This change order was declined</p>
                <p className="text-sm text-red-600">
                  The company has been notified of your decision.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {isExpired && !isLocked && (
          <Card className="bg-yellow-50 border-yellow-200">
            <CardContent className="py-4 flex items-center gap-3">
              <AlertCircle className="w-6 h-6 text-yellow-600" />
              <div>
                <p className="font-medium text-yellow-800">This {doc.type} has expired</p>
                <p className="text-sm text-yellow-600">
                  Please contact {companyName} for an updated version.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Offline Payment Confirmation Banner - auto-dismisses after 8 seconds */}
        {showOfflineConfirmation && offlineConfirmationContext && (
          <Card className="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950" data-testid="offline-payment-confirmation-banner">
            <CardContent className="py-4 px-4 space-y-3">
              <div className="flex items-start gap-3">
                <Banknote className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-blue-800 dark:text-blue-200">
                    {offlineConfirmationContext.label}: {formatCurrency(offlineConfirmationContext.amount / 100)}
                  </p>
                  <p className="text-sm text-blue-600 dark:text-blue-400 mt-0.5">
                    {doc?.paymentInstructions
                      ? 'Please follow the payment instructions to complete your payment.'
                      : 'Thank you! Please follow up with us for the next steps to process your payment.'}
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="shrink-0 text-blue-600 dark:text-blue-400 hover:text-blue-800"
                  onClick={() => setShowOfflineConfirmation(false)}
                  data-testid="button-dismiss-offline-banner"
                >
                  <XCircle className="w-5 h-5" />
                </Button>
              </div>
              {doc?.paymentInstructions && (
                <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-blue-100 dark:border-blue-900 ml-8">
                  <RichTextDisplay content={doc.paymentInstructions} />
                </div>
              )}
              <div className="ml-8">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowOfflineConfirmation(false)}
                  data-testid="button-offline-got-it"
                >
                  Got It
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Inline Payment Instructions Banner - deposit after signing or "How to Pay" */}
        {(showDepositBanner || showPaymentInstructions) && (
          <div ref={paymentBannerRef} data-testid="inline-payment-instructions">
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="py-5 px-4 sm:px-6 space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-primary" />
                    {showDepositBanner ? 'Deposit Required' : 'Payment Details'}
                  </h3>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      setShowDepositBanner(false);
                      setShowPaymentInstructions(false);
                      setPaymentInstructionsContext(null);
                    }}
                    data-testid="button-dismiss-payment-banner"
                  >
                    <XCircle className="w-5 h-5" />
                  </Button>
                </div>

                {showDepositBanner && (
                  <p className="text-sm text-muted-foreground">
                    Thank you for accepting! A deposit is required to get started.
                  </p>
                )}

                {/* Amount display */}
                {(showDepositBanner && depositInfo) && (
                  <div className="bg-background rounded-lg p-4 text-center border">
                    <p className="text-sm text-muted-foreground mb-1">Deposit Amount</p>
                    <p className="text-3xl font-bold" data-testid="text-deposit-amount">
                      {formatCurrency(depositInfo.amount / 100)}
                    </p>
                  </div>
                )}
                {(showPaymentInstructions && paymentInstructionsContext) && (
                  <div className="bg-background rounded-lg p-4 text-center border">
                    <p className="text-sm text-muted-foreground mb-1">{paymentInstructionsContext.label}</p>
                    <p className="text-3xl font-bold" data-testid="text-payment-amount">
                      {formatCurrency(paymentInstructionsContext.amount / 100)}
                    </p>
                  </div>
                )}

                {/* Payment instructions content */}
                {doc?.paymentInstructions ? (
                  <div className="bg-background rounded-lg p-4 border">
                    <RichTextDisplay content={doc.paymentInstructions} />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {showDepositBanner
                      ? 'Please follow up with us for the next steps to process your deposit payment.'
                      : 'Please follow up with us for the next steps to process your payment. Thank you!'}
                  </p>
                )}

                <div className="flex flex-col gap-2">
                  {hasOnlinePayment && (
                    <Button
                      className="w-full"
                      onClick={() => {
                        const amount = showDepositBanner && depositInfo
                          ? depositInfo.amount
                          : paymentInstructionsContext?.amount || 0;
                        const label = showDepositBanner
                          ? 'Down Payment'
                          : paymentInstructionsContext?.label || 'Payment';
                        handleCardPayment(amount, label);
                      }}
                      disabled={isCreatingPaymentSession}
                      data-testid="button-pay-card-banner"
                    >
                      {isCreatingPaymentSession ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CreditCard className="w-4 h-4 mr-2" />}
                      Pay with Card Instead
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setShowDepositBanner(false);
                      setShowPaymentInstructions(false);
                      setPaymentInstructionsContext(null);
                    }}
                    data-testid="button-close-payment-banner"
                  >
                    Got It
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Document */}
        <Card className="shadow-lg overflow-hidden rounded-none border-x-0 border-t-0">
          {/* Full Branded Header Section */}
          <div style={{ backgroundColor: headerBgColor }}>
            {/* Home Icon */}
            <div className="flex justify-end px-4 pt-3">
              <button
                onClick={() => setShowCustomerHub(!showCustomerHub)}
                className="p-2 rounded-full transition-all duration-200"
                style={{
                  backgroundColor: showCustomerHub ? headerAccentColor : headerSubtleBg,
                }}
                data-testid="button-customer-hub"
              >
                <Home className="w-5 h-5" style={{ color: headerTextColor }} />
              </button>
            </div>

            {/* Logo + Tagline */}
            <div className="px-2 sm:px-8 pt-4 sm:pt-6 pb-4 text-center">
              {companyLogo && (
                <img
                  src={companyLogo}
                  alt={companyName}
                  className="w-20 h-20 sm:w-24 sm:h-24 object-contain rounded-xl p-1.5 mx-auto mb-3"
                  style={{ backgroundColor: headerSubtleBg }}
                  data-testid="img-portal-document-logo"
                />
              )}
              <h2 data-testid="text-company-name">
                <span className="inline-block rounded-full px-5 py-1.5 text-xl sm:text-2xl font-bold text-white tracking-wide" style={{ backgroundColor: headerAccentColor }}>{companyName}</span>
              </h2>
              {companyTagline && (
                <p className="text-sm sm:text-base mt-1 font-medium tracking-wide uppercase" style={{ color: headerTextMuted }}>{companyTagline}</p>
              )}
              {(() => {
                const localCity = doc.jobCity || (!doc.jobAddressSameAsBilling ? '' : doc.contact?.city) || doc.contact?.city || '';
                return localCity ? (
                  <p className="mt-2 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs sm:text-sm font-semibold" style={{ backgroundColor: headerSubtleBg, color: headerTextSemiMuted }} data-testid="text-local-tagline">
                    <MapPin className="w-3.5 h-3.5 text-green-400 shrink-0" />
                    {localCity}'s Preferred Interior Painter
                  </p>
                ) : null;
              })()}
            </div>

            {/* Trust Badges - on the dark background */}
            {(trustBadges.length > 0 || companyLicense) && (
              <div className="px-2 sm:px-8 pb-4 flex flex-wrap items-center justify-center gap-2.5">
                {trustBadges.map((badge) => (
                  <span
                    key={badge.id}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium"
                    style={{ border: `1px solid ${headerBorderColor}`, color: headerTextSemiMuted }}
                    data-testid={`badge-trust-${badge.id}`}
                  >
                    <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
                    {badge.label}
                  </span>
                ))}
                {companyLicense && (
                  <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium" style={{ border: `1px solid ${headerBorderColor}`, color: headerTextSemiMuted }} data-testid="badge-license">
                    <Shield className="w-4 h-4 text-green-400 shrink-0" />
                    License: {companyLicense}
                  </span>
                )}
              </div>
            )}

            {/* Info Cards */}
            <div className="px-2 sm:px-8 pb-5 space-y-3">
              {/* Company Card */}
              <div className="rounded-xl p-3">
                <span className="inline-block rounded-full px-3 py-1 text-sm font-bold text-white mb-1.5" style={{ backgroundColor: headerAccentColor }} data-testid="text-company-name-card">Address</span>
                <div className="text-sm space-y-0.5 mt-0.5" style={{ color: headerTextMuted }}>
                  {companyAddress && <p>{companyAddress}</p>}
                  {companyCityStateZip && <p>{companyCityStateZip}</p>}
                  {companyPhone && <p className="font-medium" style={{ color: headerTextSemiMuted }}><a href={`tel:${companyPhone.replace(/[^+\d]/g, '')}`} className="underline transition-colors" style={{ textDecorationColor: headerBorderColor }} data-testid="link-portal-company-phone">{formatPhoneDisplay(companyPhone)}</a></p>}
                  {companyEmail && <p>{companyEmail}</p>}
                </div>
              </div>

            </div>

            {/* Accent line at bottom of dark section */}
            <div className="h-1.5" style={{ backgroundColor: headerAccentColor }} />
          </div>

          {/* Info Cards — white background with brand-color header bars */}
          <div className="px-1.5 sm:px-6 pt-5 pb-1 space-y-3 bg-white">
            {/* Client Card */}
            <div className="rounded-xl border border-gray-200 shadow-lg p-3">
              <span className="inline-block rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider text-white mb-2" style={{ backgroundColor: headerAccentColor }}>Client</span>
              <p className="font-bold text-gray-900 text-base">{dmName(doc.contact.name)}</p>
              <AddressDisplay
                address={dmAddress(doc.contact.address)}
                city={dmCity(doc.contact.city)}
                state={doc.contact.state}
                zipCode={doc.contact.zipCode}
                showMapIcon={false}
                textClassName="text-sm text-gray-700"
              />
              {doc.contact.phone && <p className="text-sm font-medium text-gray-800">{dmPhone(doc.contact.phone)}</p>}
              {doc.contact.email && <p className="text-sm text-gray-700">{dmEmail(doc.contact.email)}</p>}
            </div>

            {/* Job Address Card */}
            <div className="rounded-xl border border-gray-200 shadow-lg p-3">
              <span className="inline-block rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider text-white mb-2" style={{ backgroundColor: headerAccentColor }}>Job Address</span>
              {doc.jobAddressSameAsBilling ? (
                <AddressDisplay
                  address={dmAddress(doc.contact.address)}
                  city={dmCity(doc.contact.city)}
                  state={doc.contact.state}
                  zipCode={doc.contact.zipCode}
                  showMapIcon={false}
                  textClassName="text-sm text-gray-800 font-medium"
                />
              ) : (
                <AddressDisplay
                  address={dmAddress(doc.jobAddress)}
                  city={dmCity(doc.jobCity)}
                  state={doc.jobState}
                  zipCode={doc.jobZipCode}
                  showMapIcon={false}
                  textClassName="text-sm text-gray-800 font-medium"
                />
              )}
              {!doc.contact.address && !doc.contact.city && doc.jobAddressSameAsBilling && (
                <p className="text-sm text-gray-500">Same as client</p>
              )}
              {!doc.jobAddress && !doc.jobCity && !doc.jobAddressSameAsBilling && (
                <p className="text-sm text-gray-500">Not specified</p>
              )}
            </div>

            {/* Document Info Card */}
            <div className="rounded-xl border border-gray-200 shadow-lg p-3">
              <span className="inline-block rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider text-white mb-2" style={{ backgroundColor: headerAccentColor }}>{doc.type.replace('_', ' ')} Info</span>
              <p className="font-bold text-gray-900 text-base">#{(doc.documentNumber || doc.id).toString().padStart(6, '0')}</p>
              <p className="text-sm text-gray-700">Date: <span className="font-medium text-gray-900">{doc.createdAt ? format(new Date(doc.createdAt), "MMM d, yyyy") : 'N/A'}</span></p>
              {isProposalOrEstimate && validThroughDate && (
                <p className={`text-sm ${isExpired ? 'text-red-500 font-medium' : 'text-gray-700'}`}>
                  Valid Through: <span className="font-medium">{format(validThroughDate, "MMM d, yyyy")}</span>
                </p>
              )}
            </div>
            {(() => {
              const blocks = doc.content?.productionRateBlocks;
              if (!blocks || !blocks.some((b: any) => b.roomBuilderData?.displayToggles?.showProjectTotalSqft)) return null;
              // Avoid rendering an empty card when filters reduce every opted-in
              // block to zero sqft (e.g. all rooms excluded for the customer).
              const enabledBlocks = blocks.filter((b: any) => b.roomBuilderData?.displayToggles?.showProjectTotalSqft);
              const hasAnySqft = enabledBlocks.some((b: any) => {
                const s = calcBlockSqftSummary(b, {
                  isCustomerView: true,
                  excludedSurfaces,
                  contractorHiddenAreas: doc.content?.contractorHiddenAreas,
                  acceptedOptionalAreas,
                });
                return s.includedSqft > 0 || s.optionalSqft > 0;
              });
              if (!hasAnySqft) return null;
              return (
                <div className="rounded-xl border border-gray-200 shadow-lg p-3" data-testid="card-portal-sqft-summary">
                  <span className="inline-block rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider text-white mb-2" style={{ backgroundColor: headerAccentColor }}>Area Square Footage</span>
                  <DocumentSqftSummary
                    blocks={blocks}
                    isCustomerView
                    excludedSurfaces={excludedSurfaces}
                    contractorHiddenAreas={doc.content?.contractorHiddenAreas}
                    acceptedOptionalAreas={acceptedOptionalAreas}
                    testId="portal-sqft-summary"
                  />
                </div>
              );
            })()}
          </div>

          <CardContent className="px-1.5 sm:px-6 pt-6 pb-0 space-y-6 sm:space-y-8">
            {/* Standards and Expectations Section - Only for proposals/estimates, not change orders or invoices */}
            {doc.standardsExpectations && doc.type !== 'change_order' && doc.type !== 'invoice' && (
              <div className="mb-6 pb-6 border-b">
                <RichTextDisplay content={doc.standardsExpectations} />
              </div>
            )}

            {(() => {
              const isInvoice = doc.type === 'invoice';
              const allItems = doc.content.items;
              const allBlocks = doc.content.productionRateBlocks || [];
              const savedOrder: string[] | undefined = (doc.content as any).itemOrder;

              type DocEntry = { type: 'block'; block: any } | { type: 'item'; item: any };
              let orderedEntries: DocEntry[] = [];
              if (savedOrder && Array.isArray(savedOrder)) {
                let bIdx = 0, iIdx = 0;
                for (const t of savedOrder) {
                  if (t === 'block' && bIdx < allBlocks.length) {
                    orderedEntries.push({ type: 'block', block: allBlocks[bIdx++] });
                  } else if (t === 'item' && iIdx < allItems.length) {
                    orderedEntries.push({ type: 'item', item: allItems[iIdx++] });
                  }
                }
                while (bIdx < allBlocks.length) orderedEntries.push({ type: 'block', block: allBlocks[bIdx++] });
                while (iIdx < allItems.length) orderedEntries.push({ type: 'item', item: allItems[iIdx++] });
              } else {
                orderedEntries = [
                  ...allBlocks.map((block: any) => ({ type: 'block' as const, block })),
                  ...allItems.map((item: any) => ({ type: 'item' as const, item })),
                ];
              }

              const regularEntries = orderedEntries.filter(e => {
                if (e.type === 'block') return !e.block.isOptional;
                if (isInvoice) return !e.item.name?.startsWith('[CO]') && !e.item.isOptional;
                return !e.item.isOptional;
              });
              const optionalEntries = orderedEntries.filter(e => {
                if (e.type === 'block') return e.block.isOptional;
                return e.item.isOptional;
              });
              const optionalItems = optionalEntries.filter(e => e.type === 'item').map(e => (e as any).item);
              const optionalBlocks = optionalEntries.filter(e => e.type === 'block').map(e => (e as any).block);
              const changeOrderItems = isInvoice 
                ? allItems.filter((item: any) => item.name?.startsWith('[CO]'))
                : [];
              const originalTotal = regularEntries.filter(e => e.type === 'item' && !(e as any).item?.descriptionOnly).reduce((sum, e) => sum + ((e as any).item.total || 0), 0);

              const isBlockFullyHidden = (block: any) => {
                const areas = block.roomBuilderData?.areaResults || [];
                if (areas.length === 0) return false;
                const rooms = block.roomBuilderData?.rooms || [];
                const chAreas: string[] = doc?.content?.contractorHiddenAreas || [];
                return areas.every((area: any) => {
                  const roomId = area.roomId;
                  if (chAreas.includes(`${block.id}:area:${roomId}`)) return true;
                  const room = rooms.find((r: any) => r.id === roomId);
                  const isOpt = area.isOptional || room?.isOptional;
                  if (isOpt) return false;
                  const surfaces = area.surfaces || [];
                  if (surfaces.length === 0) return false;
                  return surfaces.every((s: any) =>
                    excludedSurfaces.includes(`${block.id}:${roomId}:${s.key || s.type}`)
                  );
                });
              };

              let portalItemCounter = 0;
              const renderEntry = (entry: DocEntry, idx: number) => {
                if (entry.type === 'block') {
                  if (isBlockFullyHidden(entry.block)) return null;
                  return (
                    <div key={`block-${idx}`} className="mb-4">
                      <ProductionRateBlocksSection blocks={[entry.block]} brandColor={settings?.useBrandColorOnDocs && settings?.brandColor ? settings.brandColor : null} excludedSurfaces={excludedSurfaces} acceptedOptionalAreas={acceptedOptionalAreas} onToggleOptionalArea={!doc?.signature ? toggleOptionalArea : undefined} contractorHiddenAreas={doc?.content?.contractorHiddenAreas} isCustomerView />
                    </div>
                  );
                }
                const item = entry.item;
                const itemIdx = portalItemCounter++;
                const itemKey = `item-${item.name || itemIdx}`;
                if (portalChItems.includes(itemKey)) return null;
                return (
                  <div key={`item-${idx}`} className="rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden px-2 py-3 sm:p-4 mb-4">
                    <LineItemRenderer 
                      item={item} 
                      index={idx} 
                      mode="customer" 
                      proposalDefaults={doc?.content?.proposalDisplayDefaults || null}
                      pricesInCents={true}
                      brandColor={settings?.useBrandColorOnDocs && settings?.brandColor ? settings.brandColor : null}
                    />
                  </div>
                );
              };
              
              return (
                <>
                  <div className="space-y-0">
                    {regularEntries.map((entry, i) => renderEntry(entry, i))}
                  </div>

                  {(optionalItems.length > 0 || optionalBlocks.length > 0) && !doc.signature && (
                    <OptionalAddOnsSection
                      optionalItems={optionalItems}
                      optionalBlocks={optionalBlocks}
                      acceptedOptionals={acceptedOptionals}
                      toggleOptionalItem={toggleOptionalItem}
                      isSigned={!!doc.signature}
                      proposalDefaults={doc?.content?.proposalDisplayDefaults || null}
                      brandColor={settings?.useBrandColorOnDocs && settings?.brandColor ? settings.brandColor : null}
                      excludedSurfaces={excludedSurfaces}
                      acceptedOptionalAreas={acceptedOptionalAreas}
                      onToggleOptionalArea={toggleOptionalArea}
                      contractorHiddenAreas={doc?.content?.contractorHiddenAreas}
                    />
                  )}

                  {showPackages && (() => {
                    const pkgSnapshots = portalPackages.map(p => packageToSnapshot(p));
                    const selectedPkg = pkgSnapshots.find(p => p.id === selectedPkgId);
                    const brandColor = settings?.useBrandColorOnDocs && settings?.brandColor ? settings.brandColor : undefined;
                    const pkgNonOptBlocks = (doc.content?.productionRateBlocks || []).filter((b: any) => !b.isOptional);
                    const pkgBlocksCents = pkgNonOptBlocks.reduce((s: number, b: any) => s + Math.round((b.roomBuilderData?.grandTotal || 0) * 100), 0);
                    const pkgItemsCents = (doc.content?.items || []).filter((item: any) => !item.isOptional && !item.name?.startsWith('[CO]') && !item.descriptionOnly).reduce((s: number, i: any) => s + (i.total || 0), 0);
                    const pkgFullBase = pkgNonOptBlocks.length > 0 ? pkgBlocksCents + pkgItemsCents : doc.totalAmount;
                    const pkgBaseTotal = pkgFullBase - excludedSurfacesCostCents - (() => {
                      let optAreaExcl = 0;
                      const allBlks = doc.content?.productionRateBlocks || [];
                      for (const blk of allBlks) {
                        if (blk.isOptional && !acceptedOptionals.includes(`block-${blk.id}`)) continue;
                        const areas = blk.roomBuilderData?.areaResults || [];
                        const rooms = blk.roomBuilderData?.rooms || [];
                        const unaccepted = areas
                          .filter((a: any) => {
                            const isOpt = a.isOptional || (rooms.find((r: any) => r.id === a.roomId) as any)?.isOptional;
                            return isOpt && !acceptedOptionalAreas.includes(`${blk.id}:area:${a.roomId}`);
                          })
                          .map((a: any) => `${blk.id}:area:${a.roomId}`);
                        if (unaccepted.length > 0) {
                          const excl = calcOptionalAreaTotals(blk, unaccepted);
                          optAreaExcl += Math.round(excl.grandTotal * 100);
                        }
                      }
                      return optAreaExcl;
                    })() - (() => {
                      let hiddenCents = 0;
                      const chAreas: string[] = doc?.content?.contractorHiddenAreas || [];
                      if (chAreas.length > 0) {
                        const allBlks = doc.content?.productionRateBlocks || [];
                        for (const blk of allBlks) {
                          if (blk.isOptional && !acceptedOptionals.includes(`block-${blk.id}`)) continue;
                          const excl = calcContractorHiddenTotals(blk, chAreas);
                          hiddenCents += Math.round(excl.grandTotal * 100);
                        }
                      }
                      return hiddenCents;
                    })();
                    return (
                      <div className="mt-6 mb-6 pb-6 border-b space-y-4" data-testid="portal-packages-section">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Choose Your Package</h3>
                        <PackageCarousel
                          packages={pkgSnapshots}
                          baseTotal={pkgBaseTotal}
                          selectedPackageId={selectedPkgId}
                          onSelectPackage={handleSelectPackage}
                          brandColor={brandColor}
                        />
                        {selectedPkg && <SelectedPackageSummary pkg={selectedPkg} brandColor={brandColor} />}
                      </div>
                    );
                  })()}

                  {/* Original Total - Show different label based on whether there are change orders */}
                  {(() => {
                    const acceptedItemsTotal = optionalItems.reduce((sum, item, i) => {
                      const itemId = `item-${item.name || i}`;
                      return acceptedOptionals.includes(itemId) ? sum + (item.total || 0) : sum;
                    }, 0);
                    const acceptedBlocksTotal = optionalBlocks.reduce((sum, block) => {
                      const blockId = `block-${block.id}`;
                      return acceptedOptionals.includes(blockId) ? sum + Math.round(block.roomBuilderData.grandTotal * 100) : sum;
                    }, 0);
                    const acceptedOptionalTotal = acceptedItemsTotal + acceptedBlocksTotal;
                    const originalItems = regularEntries.filter(e => e.type === 'item').map(e => (e as any).item);
                    const portalItemsTax = portalCalcTax(originalItems);
                    const hasSignedCOs = isInvoice ? changeOrderItems.length > 0 : (changeOrders && changeOrders.filter(co => co.signature).length > 0);

                    const isSigned = !!doc.signature;
                    let displayBase: number;
                    let displayTax: number;
                    let displayTotal: number;
                    let pkgAdjustmentCents = 0;
                    const inlineNonOptBlocks = (doc.content?.productionRateBlocks || []).filter((b: any) => !b.isOptional);
                    const inlineBlocksCents = inlineNonOptBlocks.reduce((s: number, b: any) => s + Math.round((b.roomBuilderData?.grandTotal || 0) * 100), 0);
                    const inlineItemsCents = regularEntries.filter(e => e.type === 'item' && !(e as any).item?.isOptional && !(e as any).item?.descriptionOnly).reduce((s: number, e: any) => s + (e.item.total || 0), 0);
                    const inlineHasBlocks = inlineNonOptBlocks.length > 0;
                    const isSignedLocked = isSigned && !isInvoice;
                    let inlineOptAreaExclCents = 0;
                    let allOptionalAreasCents = 0;
                    let acceptedOptAreasCents = 0;
                    let inlineContractorHiddenCents = 0;
                    let inlineHiddenItemsCents = 0;
                    if (isSignedLocked) {
                      displayBase = doc.totalAmount;
                      displayTax = 0;
                      displayTotal = doc.totalAmount;
                    } else {
                      const baseAmount = inlineHasBlocks
                        ? inlineBlocksCents + inlineItemsCents
                        : isInvoice
                          ? originalTotal
                          : (doc.totalAmount - (changeOrders?.filter(co => co.signature).reduce((sum, co) => sum + co.totalAmount, 0) || 0));
                      {
                        for (const blk of inlineNonOptBlocks) {
                          const areas2 = blk.roomBuilderData?.areaResults || [];
                          const rooms2 = blk.roomBuilderData?.rooms || [];
                          const allOptIds = areas2
                            .filter((a: any) => {
                              const isOpt = a.isOptional || (rooms2.find((r: any) => r.id === a.roomId) as any)?.isOptional;
                              return !!isOpt;
                            })
                            .map((a: any) => `${blk.id}:area:${a.roomId}`);
                          if (allOptIds.length > 0) {
                            const allExcl = calcOptionalAreaTotals(blk, allOptIds);
                            allOptionalAreasCents += Math.round(allExcl.grandTotal * 100);
                          }
                          const unaccepted = allOptIds.filter((id: string) => !acceptedOptionalAreas.includes(id));
                          if (unaccepted.length > 0) {
                            const excl2 = calcOptionalAreaTotals(blk, unaccepted);
                            inlineOptAreaExclCents += Math.round(excl2.grandTotal * 100);
                          }
                          const accepted = allOptIds.filter((id: string) => acceptedOptionalAreas.includes(id));
                          if (accepted.length > 0) {
                            const acc = calcOptionalAreaTotals(blk, accepted);
                            acceptedOptAreasCents += Math.round(acc.grandTotal * 100);
                          }
                        }
                      }
                      {
                        if (portalChAreas.length > 0) {
                          const allBlks2 = doc.content?.productionRateBlocks || [];
                          for (const blk of allBlks2) {
                            if (blk.isOptional && !acceptedOptionals.includes(`block-${blk.id}`)) continue;
                            const excl = calcContractorHiddenTotals(blk, portalChAreas);
                            inlineContractorHiddenCents += Math.round(excl.grandTotal * 100);
                          }
                        }
                      }
                      inlineHiddenItemsCents = regularEntries.filter(e => e.type === 'item' && !(e as any).item?.isOptional).reduce((s: number, e: any, i: number) => {
                        const key = `item-${e.item.name || i}`;
                        return portalChItems.includes(key) ? s + (e.item.total || 0) : s;
                      }, 0);
                      const inlineEffectiveBase = baseAmount - excludedSurfacesCostCents - allOptionalAreasCents - inlineContractorHiddenCents - inlineHiddenItemsCents;
                      displayBase = inlineEffectiveBase + acceptedOptionalTotal + acceptedOptAreasCents;

                      if (showPackages && selectedPkgId) {
                        const selPkg = portalPackages.find(p => p.id === selectedPkgId);
                        if (selPkg) {
                          if (selPkg.priceAdjustmentType === 'percent') {
                            pkgAdjustmentCents = Math.round(inlineEffectiveBase * (selPkg.adjustmentValue / 100));
                          } else {
                            pkgAdjustmentCents = Math.round((selPkg.adjustmentValue || 0) * 100);
                          }
                        }
                      }
                      const acceptedTaxable = optionalItems.reduce((sum, item, i) => {
                        const itemId = `item-${item.name || i}`;
                        return (acceptedOptionals.includes(itemId) && item.taxable) ? sum + (item.total || 0) : sum;
                      }, 0) + optionalBlocks.reduce((sum, block) => {
                        const blockId = `block-${block.id}`;
                        return (acceptedOptionals.includes(blockId) && block.taxable) ? sum + Math.round(block.roomBuilderData.grandTotal * 100) : sum;
                      }, 0);
                      let displayExclTaxableCents = 0;
                      {
                        const inlineFiltered = filterExcludedForHiddenAreas(excludedSurfaces, portalChAreas);
                        if (inlineFiltered.length > 0) {
                          const allBlks = doc.content?.productionRateBlocks || [];
                          for (const blk of allBlks) {
                            if (blk.isOptional && !acceptedOptionals.includes(`block-${blk.id}`)) continue;
                            if (!blk.taxable) continue;
                            const exc = calcExcludedTotals(blk, inlineFiltered);
                            displayExclTaxableCents += Math.round(exc.grandTotal * 100);
                          }
                        }
                      }
                      let displayOptAreaTaxableCents = 0;
                      {
                        const taxBlks2 = doc.content?.productionRateBlocks || [];
                        for (const blk2 of taxBlks2) {
                          if (blk2.isOptional && !acceptedOptionals.includes(`block-${blk2.id}`)) continue;
                          if (!blk2.taxable) continue;
                          const ar2 = blk2.roomBuilderData?.areaResults || [];
                          const rm2 = blk2.roomBuilderData?.rooms || [];
                          const unac2 = ar2
                            .filter((a: any) => {
                              const isOp = a.isOptional || (rm2.find((r: any) => r.id === a.roomId) as any)?.isOptional;
                              return isOp && !acceptedOptionalAreas.includes(`${blk2.id}:area:${a.roomId}`);
                            })
                            .map((a: any) => `${blk2.id}:area:${a.roomId}`);
                          if (unac2.length > 0) {
                            const ex3 = calcOptionalAreaTotals(blk2, unac2);
                            displayOptAreaTaxableCents += Math.round(ex3.grandTotal * 100);
                          }
                        }
                      }
                      const inlineBaseForDiscount = inlineEffectiveBase + pkgAdjustmentCents;
                      const displaySubBeforeDiscount = inlineBaseForDiscount + acceptedOptionalTotal + acceptedOptAreasCents;
                      const dDiscArr: { type: 'flat' | 'percentage'; value: number; label?: string }[] = doc.content?.discounts?.length
                        ? doc.content.discounts
                        : doc.content?.discount?.value ? [doc.content.discount] : [];
                      let displayDiscountCents = 0;
                      for (const dd of dDiscArr) {
                        if (dd.value > 0) {
                          displayDiscountCents += dd.type === 'percentage'
                            ? Math.round(inlineBaseForDiscount * (Math.min(dd.value, 100) / 100))
                            : Math.round(dd.value * 100);
                        }
                      }
                      displayDiscountCents = Math.min(displayDiscountCents, Math.max(0, displaySubBeforeDiscount));
                      const displayAfterDiscount = displaySubBeforeDiscount - displayDiscountCents;
                      let displayContractorHiddenTaxableCents = 0;
                      {
                        if (portalChAreas.length > 0) {
                          const taxBlks3 = doc.content?.productionRateBlocks || [];
                          for (const blk3 of taxBlks3) {
                            if (blk3.isOptional && !acceptedOptionals.includes(`block-${blk3.id}`)) continue;
                            if (!blk3.taxable) continue;
                            const excl3 = calcContractorHiddenTotals(blk3, portalChAreas);
                            displayContractorHiddenTaxableCents += Math.round(excl3.grandTotal * 100);
                          }
                        }
                      }
                      let displayTaxableTotal = 0;
                      for (const item of originalItems) {
                        if (item.taxable && !item.descriptionOnly) displayTaxableTotal += (item.total || 0);
                      }
                      for (const blk of inlineNonOptBlocks) {
                        if (blk.taxable) displayTaxableTotal += Math.round((blk.roomBuilderData?.grandTotal || 0) * 100);
                      }
                      for (const item of optionalItems) {
                        const itemId = `item-${item.name || optionalItems.indexOf(item)}`;
                        if (acceptedOptionals.includes(itemId) && item.taxable) displayTaxableTotal += (item.total || 0);
                      }
                      for (const block of optionalBlocks) {
                        const blockId = `block-${block.id}`;
                        if (acceptedOptionals.includes(blockId) && block.taxable) displayTaxableTotal += Math.round(block.roomBuilderData.grandTotal * 100);
                      }
                      {
                        const inlineFiltered2 = filterExcludedForHiddenAreas(excludedSurfaces, portalChAreas);
                        if (inlineFiltered2.length > 0) {
                          for (const blk of (doc.content?.productionRateBlocks || [])) {
                            if (blk.isOptional && !acceptedOptionals.includes(`block-${blk.id}`)) continue;
                            if (!blk.taxable) continue;
                            const exc = calcExcludedTotals(blk, inlineFiltered2);
                            displayTaxableTotal -= Math.round(exc.grandTotal * 100);
                          }
                        }
                      }
                      {
                        const taxBlksD = doc.content?.productionRateBlocks || [];
                        for (const blk of taxBlksD) {
                          if (blk.isOptional && !acceptedOptionals.includes(`block-${blk.id}`)) continue;
                          if (!blk.taxable) continue;
                          const ar = blk.roomBuilderData?.areaResults || [];
                          const rm = blk.roomBuilderData?.rooms || [];
                          const unac = ar
                            .filter((a: any) => {
                              const isOp = a.isOptional || (rm.find((r: any) => r.id === a.roomId) as any)?.isOptional;
                              return isOp && !acceptedOptionalAreas.includes(`${blk.id}:area:${a.roomId}`);
                            })
                            .map((a: any) => `${blk.id}:area:${a.roomId}`);
                          if (unac.length > 0) {
                            const ex = calcOptionalAreaTotals(blk, unac);
                            displayTaxableTotal -= Math.round(ex.grandTotal * 100);
                          }
                        }
                      }
                      {
                        if (portalChAreas.length > 0) {
                          for (const blk of (doc.content?.productionRateBlocks || [])) {
                            if (blk.isOptional && !acceptedOptionals.includes(`block-${blk.id}`)) continue;
                            if (!blk.taxable) continue;
                            const excl = calcContractorHiddenTotals(blk, portalChAreas);
                            displayTaxableTotal -= Math.round(excl.grandTotal * 100);
                          }
                        }
                      }
                      const displayDiscRatio = displaySubBeforeDiscount > 0 && displayDiscountCents > 0
                        ? displayAfterDiscount / displaySubBeforeDiscount : 1;
                      const displayTaxableAfterDiscount = Math.max(0, Math.round(displayTaxableTotal * displayDiscRatio));
                      displayTax = portalTaxRate > 0 ? Math.round(displayTaxableAfterDiscount * portalTaxRate / 100) : 0;
                      displayTotal = displayAfterDiscount + displayTax;
                    }
                    const selPkgName = showPackages && selectedPkgId
                      ? portalPackages.find(p => p.id === selectedPkgId)?.name
                      : null;
                    const baseBeforeAddons = inlineHasBlocks
                      ? inlineBlocksCents + inlineItemsCents - allOptionalAreasCents - inlineContractorHiddenCents - inlineHiddenItemsCents
                      : isInvoice
                        ? originalTotal
                        : (doc.totalAmount - (changeOrders?.filter(co => co.signature).reduce((sum, co) => sum + co.totalAmount, 0) || 0));

                    return (
                      <div className="flex justify-end pt-4">
                        <div className="w-72 space-y-2">
                          {!isSignedLocked && (
                            <>
                              {selPkgName && (
                                <div className="flex justify-between text-sm font-medium text-primary border-b pb-2 mb-1">
                                  <span>Selected Package</span>
                                  <span>{selPkgName}</span>
                                </div>
                              )}
                              <div className="flex justify-between text-sm text-muted-foreground">
                                <span>{showPackages ? 'Base Price' : 'Subtotal'}</span>
                                <span>${(baseBeforeAddons / 100).toFixed(2)}</span>
                              </div>
                              {pkgAdjustmentCents !== 0 && (
                                <div className="flex justify-between text-sm text-muted-foreground">
                                  <span>Package Adjustment</span>
                                  <span>{pkgAdjustmentCents >= 0 ? '+' : '-'}${(Math.abs(pkgAdjustmentCents) / 100).toFixed(2)}</span>
                                </div>
                              )}
                              {(acceptedOptionalTotal + acceptedOptAreasCents) > 0 && (
                                <div className="flex justify-between text-sm text-emerald-600">
                                  <span>Accepted Add-ons</span>
                                  <span>+${((acceptedOptionalTotal + acceptedOptAreasCents) / 100).toFixed(2)}</span>
                                </div>
                              )}
                              {excludedSurfacesCostCents > 0 && (
                                <div className="flex justify-between text-sm text-red-500" data-testid="text-excluded-surfaces-deduction">
                                  <span>Excluded Surfaces</span>
                                  <span>-${(excludedSurfacesCostCents / 100).toFixed(2)}</span>
                                </div>
                              )}
                              {(() => {
                                const portalDiscArr: { type: 'flat' | 'percentage'; value: number; label?: string; description?: string }[] = doc.content?.discounts?.length
                                  ? doc.content.discounts
                                  : doc.content?.discount?.value ? [doc.content.discount] : [];
                                if (!portalDiscArr.length) return null;
                                const portalSubBeforeDisc = (baseBeforeAddons + pkgAdjustmentCents + acceptedOptionalTotal + acceptedOptAreasCents - excludedSurfacesCostCents);
                                return portalDiscArr.map((pd, pdIdx) => {
                                  if (!pd.value) return null;
                                  const pdCents = pd.type === 'percentage'
                                    ? Math.round(portalSubBeforeDisc * (pd.value / 100))
                                    : Math.round(pd.value * 100);
                                  return (
                                    <div key={pdIdx} className="flex justify-between text-sm text-emerald-600" data-testid={`text-portal-discount-line-${pdIdx}`}>
                                      <span>{pd.label || 'Discount'}{pd.type === 'percentage' ? ` (${pd.value}%)` : ''}</span>
                                      <span>-${(pdCents / 100).toFixed(2)}</span>
                                    </div>
                                  );
                                });
                              })()}
                              {displayTax > 0 && (
                                <div className="flex flex-col gap-0.5">
                                  <div className="flex justify-between text-sm text-muted-foreground">
                                    <span>{portalTaxProfileName ? `${portalTaxProfileName} (${portalTaxRate}%)` : `Sales tax (${portalTaxRate}%)`}</span>
                                    <span>${(displayTax / 100).toFixed(2)}</span>
                                  </div>
                                  <div className="text-[11px] text-muted-foreground/80 italic">
                                    on ${(portalTaxableBaseCents / 100).toFixed(2)} taxable
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                          <div className={`flex justify-between text-xl font-bold ${!isSignedLocked ? 'border-t pt-3 mt-1' : 'border-t pt-4'}`}>
                            <span>{hasSignedCOs ? 'Original Total' : 'Total'}</span>
                            <span>${((isSignedLocked ? displayTotal : stickyTotalCents) / 100).toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Invoice Change Order Items Section */}
                  {isInvoice && changeOrderItems.length > 0 && (
                    <div className="mt-12 pt-8 border-t-4 border-primary/20">
                      <h3 className="text-lg font-bold mb-4">Accepted Change Orders</h3>
                      
                      {/* Desktop Layout for Change Order Items */}
                      <div className="hidden sm:block space-y-4">
                        {changeOrderItems.map((item, i) => (
                          <div key={i} className="rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden p-4">
                            <LineItemRenderer 
                              item={item} 
                              index={i} 
                              mode="customer" 
                              proposalDefaults={doc?.content?.proposalDisplayDefaults || null}
                              pricesInCents={true}
                              brandColor={settings?.useBrandColorOnDocs && settings?.brandColor ? settings.brandColor : null}
                            />
                          </div>
                        ))}
                      </div>

                      {/* Mobile Layout for Change Order Items - Matches proposal format */}
                      <div className="sm:hidden space-y-4">
                        {changeOrderItems.map((item, i) => (
                          <div key={i} className="rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden p-4">
                            <LineItemRenderer 
                              item={item} 
                              index={i} 
                              mode="customer" 
                              proposalDefaults={doc?.content?.proposalDisplayDefaults || null}
                              pricesInCents={true}
                              brandColor={settings?.useBrandColorOnDocs && settings?.brandColor ? settings.brandColor : null}
                            />
                          </div>
                        ))}
                      </div>

                      {/* Change Order Subtotal */}
                      <div className="flex justify-end pt-4">
                        <div className="w-64 space-y-2">
                          <div className="flex justify-between font-bold">
                            <span>Change Orders Total</span>
                            <span>${(changeOrderItems.reduce((sum, item) => sum + (item.total || 0), 0) / 100).toFixed(2)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Grand Total for Invoice */}
                      {(() => {
                        const invoiceGrandTax = portalCalcTax(doc.content?.items || []);
                        return (
                          <div className="flex justify-end pt-4">
                            <div className="w-64 space-y-2">
                              {invoiceGrandTax.taxAmount > 0 && (
                                <div className="flex flex-col gap-0.5">
                                  <div className="flex justify-between text-sm text-muted-foreground">
                                    <span>{portalTaxProfileName ? `${portalTaxProfileName} (${portalTaxRate}%)` : `Sales tax (${portalTaxRate}%)`}</span>
                                    <span>${(invoiceGrandTax.taxAmount / 100).toFixed(2)}</span>
                                  </div>
                                  <div className="text-[11px] text-muted-foreground/80 italic">
                                    on ${(invoiceGrandTax.taxableTotal / 100).toFixed(2)} taxable
                                  </div>
                                </div>
                              )}
                              <div className="flex justify-between text-xl font-bold border-t pt-4">
                                <span>Grand Total</span>
                                <span>${(invoiceGrandTax.grandTotal / 100).toFixed(2)}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </>
              );
            })()}

            {/* Change Orders - Each on a visually distinct section to match PDF page-break behavior */}
            {changeOrders && changeOrders.filter(co => co.signature).length > 0 && (
              <>
                {changeOrders
                  .filter(co => co.signature)
                  .sort((a, b) => new Date(a.signedAt || 0).getTime() - new Date(b.signedAt || 0).getTime())
                  .map((co) => (
                  <div key={co.id} className="mt-12 pt-8 border-t-4 border-primary/20">
                    {/* Change Order Header */}
                    <div className="flex items-center gap-2 mb-4">
                      <h3 className="text-lg font-bold">Change Order: {co.title}</h3>
                      <Badge variant="outline" className="text-xs">
                        #{(co.documentNumber || co.id).toString().padStart(6, '0')}
                      </Badge>
                      {co.signedAt && (
                        <span className="text-sm text-muted-foreground ml-auto">
                          Accepted {format(new Date(co.signedAt), "MMM d, yyyy")}
                        </span>
                      )}
                    </div>

                    {/* Change Order Line Items + Production Rate Blocks */}
                    {co.content && (
                      <ChangeOrderContentRenderer
                        content={co.content}
                        mode="customer"
                        brandColor={settings?.useBrandColorOnDocs && settings?.brandColor ? settings.brandColor : null}
                        testIdPrefix={`co-portal-parent-${co.id}`}
                      />
                    )}

                    {/* Change Order Subtotal */}
                    <div className="flex justify-end pt-4">
                      <div className="w-64">
                        <div className="flex justify-between font-bold">
                          <span>Change Order Total</span>
                          <span>${(co.totalAmount / 100).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Grand Total after all change orders */}
                {(() => {
                  const coGrandTax = portalCalcTax(doc.content?.items || []);
                  return (
                    <div className="flex justify-end pt-6 mt-6 border-t-2">
                      <div className="w-64 space-y-2">
                        {coGrandTax.taxAmount > 0 && (
                          <div className="flex flex-col gap-0.5">
                            <div className="flex justify-between text-sm text-muted-foreground">
                              <span>{portalTaxProfileName ? `${portalTaxProfileName} (${portalTaxRate}%)` : `Sales tax (${portalTaxRate}%)`}</span>
                              <span>${(coGrandTax.taxAmount / 100).toFixed(2)}</span>
                            </div>
                            <div className="text-[11px] text-muted-foreground/80 italic">
                              on ${(coGrandTax.taxableTotal / 100).toFixed(2)} taxable
                            </div>
                          </div>
                        )}
                        <div className="flex justify-between text-xl font-bold text-primary">
                          <span>Grand Total</span>
                          <span>${(coGrandTax.grandTotal / 100).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </>
            )}

            {/* Payment Schedule - shown on proposal when enabled */}
            {doc.content?.paymentSettings?.showPaymentSchedule && doc.content.paymentSettings.depositRequired && doc.content.paymentSettings.schedule?.length > 0 && (() => {
              const psSettings = doc.content.paymentSettings;
              const psDepositCents = psSettings.depositType === 'percentage'
                ? Math.round(stickyTotalCents * (psSettings.depositAmount / 100))
                : Math.round(psSettings.depositAmount * 100);
              return (
              <div className="pt-6 mt-6 border-t" data-testid="payment-schedule-on-document">
                <h4 className="font-bold text-foreground mb-3">Payment Schedule</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between py-2 border-b">
                    <div>
                      <span className="font-medium">Deposit</span>
                      <span className="text-muted-foreground ml-2">
                        ({psSettings.depositType === 'percentage' 
                          ? `${psSettings.depositAmount}%` 
                          : 'Fixed'})
                      </span>
                    </div>
                    <span className="font-medium">
                      {formatCurrency(psDepositCents / 100)}
                    </span>
                  </div>
                  {adjustedSchedule.map((item: any, idx: number) => (
                    <div key={idx} className="flex justify-between py-2 border-b last:border-0">
                      <div>
                        <span className="font-medium">{item.label || `Payment ${idx + 1}`}</span>
                        {item.dueCondition && (
                          <span className="text-muted-foreground ml-2">
                            {item.dueCondition === 'upon_signing' ? 'Upon signing' 
                              : item.dueCondition === 'upon_start' ? 'At start of work'
                              : item.dueCondition === 'upon_completion' ? 'Upon completion'
                              : item.dueCondition === 'net_30' ? 'Net 30 days'
                              : item.dueCondition}
                          </span>
                        )}
                      </div>
                      <span className="font-medium">{formatCurrency(item.adjustedAmount / 100)}</span>
                    </div>
                  ))}
                </div>
              </div>
              );
            })()}

            {/* Payment History - Only for invoices with payments */}
            {doc.type === 'invoice' && payments && payments.length > 0 && (
              <div className="pt-6 mt-6 border-t">
                <h4 className="font-bold text-foreground mb-3">Payment History</h4>
                <div className="space-y-2">
                  {payments.map((payment) => (
                    <div key={payment.id} className="flex justify-between items-center py-2 border-b last:border-0 text-sm">
                      <div>
                        <span className="font-medium">
                          {payment.paymentDate ? format(new Date(payment.paymentDate), "MMM d, yyyy") : '-'}
                        </span>
                        <span className="text-muted-foreground ml-2 capitalize">
                          {({ cash: 'Cash', check: 'Check', zelle: 'Zelle', venmo: 'Venmo', paypal: 'PayPal', credit_card: 'Credit Card' } as Record<string, string>)[payment.paymentType] ?? payment.paymentType.replace('_', ' ')}
                        </span>
                        {payment.notes && (
                          <span className="text-muted-foreground ml-2">- {payment.notes}</span>
                        )}
                      </div>
                      <span className="font-medium text-green-600">${(payment.amount / 100).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between items-center pt-3 mt-2 border-t font-bold">
                  <span>Balance Remaining</span>
                  <span className={portalRemainingBalance > 0 ? "text-orange-600" : "text-green-600"}>
                    ${(portalRemainingBalance / 100).toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            {settings?.financingEnabled && settings?.financingLink && (doc.type === 'proposal' || doc.type === 'estimate') && doc.content?.paymentSettings?.showFinancing && (
              <div className="pt-6 mt-6 border-t">
                <div
                  className="p-5 rounded-lg border border-emerald-200 dark:border-emerald-800"
                  style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.12), rgba(34,197,94,0.06))' }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Banknote className="w-5 h-5 text-emerald-600" />
                    <p className="font-semibold text-foreground" data-testid="text-financing-available">Financing Available</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground mb-2" data-testid="text-financing-monthly">
                    As low as ${Math.ceil((stickyTotalCents / 100) / 36)}/mo*
                  </p>
                  <p className="text-sm text-muted-foreground mb-3">
                    Flexible payment options available through {settings.financingProvider || 'financing'}.
                  </p>
                  <div className="flex flex-col gap-1 mb-4">
                    <span className="text-xs text-emerald-700 dark:text-emerald-400">✔ Fast approval</span>
                    <span className="text-xs text-emerald-700 dark:text-emerald-400">✔ No obligation to apply</span>
                  </div>
                  <a href={settings.financingLink} target="_blank" rel="noopener noreferrer">
                    <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="button-apply-financing">
                      See Payment Options →
                    </Button>
                  </a>
                  <p className="text-[10px] text-muted-foreground mt-3 leading-tight">
                    *Estimated payment. Actual financing terms, approval, and rates are determined by {settings.financingProvider || 'the financing provider'} and may vary.
                  </p>
                </div>
              </div>
            )}

            {/* Notes */}
            {doc.content.notes && (
              <div className="pt-6 border-t text-sm text-muted-foreground">
                <h4 className="font-bold text-foreground mb-1">Notes:</h4>
                <p>{doc.content.notes}</p>
              </div>
            )}

            {/* Terms and Conditions - Only for proposals/estimates, not change orders or invoices */}
            {doc.termsConditions && doc.type !== 'change_order' && doc.type !== 'invoice' && (
              <div className="mt-6 pt-6 border-t border-amber-300">
                <h3 className="text-lg font-semibold mb-4 text-foreground">Terms and Conditions</h3>
                <RichTextDisplay content={doc.termsConditions} />
              </div>
            )}

            {/* Photos Section — all photos unified in one swipeable gallery */}
            {(() => {
              const hiddenIds: number[] = (doc.content as any)?.hiddenDocumentPhotoIds || [];
              const visiblePhotos = portalPhotos.filter((p: any) => !hiddenIds.includes(p.id));
              const normalizeUrl = (u: string) => u.replace(/^\/objects\//, '');
              const seen = new Set(visiblePhotos.map((p: any) => normalizeUrl(p.storageKey)));
              const extras: Array<{ url: string; label?: string; annotations?: any[] | null }> = [];
              const blocks = (doc.content as any)?.productionRateBlocks || [];
              for (const block of blocks) {
                for (const room of (block.roomBuilderData?.rooms || [])) {
                  for (const photo of (room.photos || [])) {
                    const key = normalizeUrl(photo.url || '');
                    if (key && !photo.uploading && photo.showOnProposal === true && !seen.has(key)) {
                      seen.add(key);
                      extras.push({ url: photo.url, label: room.name || 'Area', annotations: photo.annotations || null });
                    }
                  }
                }
              }
              const srcPhotos = ((doc.content as any)?.includedSourcePhotos || []) as string[];
              for (const url of srcPhotos) {
                const key = normalizeUrl(url);
                if (!seen.has(key)) {
                  seen.add(key);
                  extras.push({ url, label: 'Project Photo' });
                }
              }
              const ccPhotos = ((doc.content as any)?.includedCompanyCamPhotos || []) as string[];
              for (const url of ccPhotos) {
                if (url && !seen.has(url)) {
                  seen.add(url);
                  extras.push({ url, label: 'CompanyCam' });
                }
              }
              return (visiblePhotos.length > 0 || extras.length > 0) ? <DocumentPhotoDisplay photos={visiblePhotos} extraPhotos={extras} /> : null;
            })()}

            {/* Signature Section - Only show for proposals and estimates */}
            {isProposalOrEstimate && (
            <div ref={signatureSectionRef} className={doc.signature ? "mt-8 pt-8 border-t-2 border-dashed" : ""}>
              {doc.signature ? (
                <div className="space-y-4">
                  {settings?.useContractorSignature && settings?.contractorSignature ? (
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-muted-foreground">Contractor</p>
                        <div className="border p-4 bg-white rounded-lg">
                          <img src={settings.contractorSignature} alt="Contractor signature" className="h-20 object-contain" />
                        </div>
                        <p className="text-xs text-muted-foreground">{settings.companyName}</p>
                        <p className="text-xs text-muted-foreground">
                          {doc.signedAt ? format(new Date(doc.signedAt), "MMM d, yyyy h:mm a") : 'Unknown date'}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-muted-foreground">Customer</p>
                        <div className="border p-4 bg-white rounded-lg">
                          <img src={doc.signature} alt="Customer signature" className="h-20 object-contain" />
                        </div>
                        <p className="text-xs text-muted-foreground">Signed by {doc.contact.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {doc.signedAt ? format(new Date(doc.signedAt), "MMM d, yyyy h:mm a") : 'Unknown date'}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground">Signed by {doc.contact.name}</p>
                      <div className="border p-4 inline-block bg-white rounded-lg">
                        <img src={doc.signature} alt="Signature" className="h-24" />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Signed on {doc.signedAt ? format(new Date(doc.signedAt), "MMM d, yyyy h:mm a") : 'Unknown date'}
                      </p>
                    </>
                  )}
                </div>
              ) : isExpired ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">
                    This {doc.type} has expired. Please contact {companyName} for an updated version.
                  </p>
                </div>
              ) : showStickyFooter ? (
                null
              ) : (
                <div className="flex flex-col sm:flex-row justify-center items-center gap-4 py-6">
                  <Button 
                    onClick={() => setShowSignatureModal(true)}
                    className="bg-green-600 hover:bg-green-700"
                    size="lg"
                    data-testid="button-open-signature"
                  >
                    <PenLine className="w-4 h-4 mr-2" />
                    Accept & Sign {doc.type.replace('_', ' ')}
                  </Button>
                  {doc.type === 'change_order' && (
                    <Button 
                      variant="destructive"
                      onClick={() => rejectDoc()}
                      disabled={isRejecting}
                      size="lg"
                      data-testid="button-decline-change-order"
                    >
                      {isRejecting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      <XCircle className="w-4 h-4 mr-2" />
                      Decline Change Order
                    </Button>
                  )}
                </div>
              )}

              {/* Signature Modal */}
              <Dialog open={showSignatureModal} onOpenChange={setShowSignatureModal}>
                <DialogContent className="sm:max-w-lg" onOpenAutoFocus={(e) => e.preventDefault()}>
                  <DialogHeader>
                    <DialogTitle>Sign to Accept {doc.type.replace('_', ' ')}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-6 pt-4">
                    <p className="text-sm text-muted-foreground text-center">
                      By signing below, you agree to the terms and pricing outlined in this {doc.type.replace('_', ' ')}.
                    </p>
                    
                    <div className="flex justify-center px-2">
                      <div className="border-2 border-dashed rounded-lg bg-white p-2 w-full max-w-[420px]">
                        <SignatureCanvas 
                          ref={sigPad}
                          penColor="black"
                          canvasProps={{ 
                            width: 300, 
                            height: 150, 
                            className: 'sigCanvas rounded w-full',
                            style: { touchAction: 'none', width: '100%', height: 'auto' }
                          }} 
                        />
                      </div>
                    </div>

                    <div className="flex justify-center gap-4">
                      <Button 
                        variant="outline" 
                        onClick={() => sigPad.current?.clear()}
                        data-testid="button-clear-signature"
                      >
                        Clear
                      </Button>
                      <Button 
                        onClick={() => {
                          handleSign();
                          setShowSignatureModal(false);
                        }} 
                        disabled={isSigning}
                        className="bg-green-600 hover:bg-green-700"
                        data-testid="button-accept-sign"
                      >
                        {isSigning && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Submit Signature
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

            </div>
            )}
          </CardContent>

          {/* Compliance documents moved to OTP-gated hub only */}

          {/* Download PDF & COI Buttons + Footer */}
          <div className={`flex flex-col items-center pt-4 ${(showStickyFooter || showPaymentFooter) ? 'pb-10' : 'pb-6'}`}>
            {doc.type !== 'change_order' && (
              <>
                <Button 
                  variant="outline" 
                  onClick={handleDownloadPDF} 
                  disabled={isGeneratingPDF}
                  data-testid="button-download-pdf"
                >
                  {isGeneratingPDF ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <FileDown className="w-4 h-4 mr-2" />
                  )}
                  Download PDF
                </Button>
              </>
            )}
            <PoweredByFusePhone className="mt-4" />
          </div>
        </Card>

        {/* Paint Color Selection Section - Hidden for now, will redefine later */}
        {false && doc.signedAt && doc.allowClientColorSubmission && colorEntries.length > 0 && (
          <Card data-testid="card-color-submission">
            <CardContent className="pt-6 space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2" data-testid="text-color-section-title">
                <Palette className="w-5 h-5" />
                Paint Color Selection
              </h3>

              {isLoadingColors ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" data-testid="loader-color-submissions" />
                </div>
              ) : colorSubmissions?.status === 'pending_approval' ? (
                <div className="space-y-4" data-testid="status-pending-approval">
                  <div className="flex items-center gap-2 text-amber-600">
                    <AlertCircle className="w-5 h-5" />
                    <p className="font-medium" data-testid="text-pending-message">Your color selections have been submitted and are pending review</p>
                  </div>
                  <div className="space-y-2">
                    {colorSubmissions.entries.map((entry, idx) => (
                      <div key={entry.paintGroupKey} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30" data-testid={`color-entry-display-${idx}`}>
                        <div>
                          <p className="font-medium text-sm" data-testid={`text-group-label-${idx}`}>{entry.groupLabel}</p>
                          <p className="text-sm text-muted-foreground">
                            {entry.colorName}{entry.finish ? ` - ${entry.finish}` : ''}{entry.brand ? ` (${entry.brand})` : ''}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : colorSubmissions?.status === 'approved' ? (
                <div className="space-y-4" data-testid="status-approved">
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="w-5 h-5" />
                    <p className="font-medium" data-testid="text-approved-message">Your color selections have been approved</p>
                  </div>
                  <div className="space-y-2">
                    {colorSubmissions.entries.map((entry, idx) => (
                      <div key={entry.paintGroupKey} className="flex items-center justify-between p-3 rounded-lg border bg-green-50 border-green-200" data-testid={`color-entry-approved-${idx}`}>
                        <div>
                          <p className="font-medium text-sm">{entry.groupLabel}</p>
                          <p className="text-sm text-muted-foreground">
                            {entry.colorName}{entry.finish ? ` - ${entry.finish}` : ''}{entry.brand ? ` (${entry.brand})` : ''}
                          </p>
                        </div>
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-5" data-testid="status-form">
                  {colorSubmissions?.status === 'needs_update' && colorSubmissions.rejectionNote && (
                    <div className="flex items-start gap-2 p-3 rounded-lg border border-red-200 bg-red-50" data-testid="color-rejection-note">
                      <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="font-medium text-sm text-red-800">Update requested</p>
                        <p className="text-sm text-red-600">{colorSubmissions.rejectionNote}</p>
                      </div>
                    </div>
                  )}
                  <p className="text-sm text-muted-foreground">
                    Your contractor needs you to choose paint colors for the areas listed below. For each area, enter the color name and select a sheen.
                  </p>
                  <div className="space-y-3">
                    {colorEntries.map((entry, idx) => (
                      <div key={entry.paintGroupKey} className="rounded-lg border overflow-hidden" data-testid={`color-entry-form-${idx}`}>
                        <div className="px-4 py-2.5 bg-muted/50 border-b">
                          <p className="font-semibold text-sm" data-testid={`text-form-group-label-${idx}`}>
                            {entry.groupLabel}
                          </p>
                        </div>
                        <div className="p-4 space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="text-xs font-medium text-muted-foreground mb-1 block">Color Name *</label>
                              <Input
                                placeholder="e.g. Simply White OC-117"
                                value={entry.colorName}
                                onChange={(e) => {
                                  const updated = [...colorEntries];
                                  updated[idx] = { ...updated[idx], colorName: e.target.value };
                                  setColorEntries(updated);
                                }}
                                data-testid={`input-color-name-${idx}`}
                              />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-muted-foreground mb-1 block">Sheen *</label>
                              <Select
                                value={entry.finish}
                                onValueChange={(val) => {
                                  const updated = [...colorEntries];
                                  updated[idx] = { ...updated[idx], finish: val };
                                  setColorEntries(updated);
                                }}
                              >
                                <SelectTrigger data-testid={`select-finish-${idx}`}>
                                  <SelectValue placeholder="Choose a sheen" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="Flat">Flat</SelectItem>
                                  <SelectItem value="Matte">Matte</SelectItem>
                                  <SelectItem value="Eggshell">Eggshell</SelectItem>
                                  <SelectItem value="Satin">Satin</SelectItem>
                                  <SelectItem value="Semi-gloss">Semi-gloss</SelectItem>
                                  <SelectItem value="Gloss">Gloss</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground mb-1 block">Brand (optional)</label>
                            <Input
                              placeholder="e.g. Benjamin Moore, Sherwin-Williams"
                              value={entry.brand || ''}
                              onChange={(e) => {
                                const updated = [...colorEntries];
                                updated[idx] = { ...updated[idx], brand: e.target.value };
                                setColorEntries(updated);
                              }}
                              data-testid={`input-brand-${idx}`}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <p className="text-xs text-muted-foreground">* Required fields</p>
                    <Button
                      onClick={() => {
                        const incomplete = colorEntries.some(e => !e.colorName || !e.finish);
                        if (incomplete) {
                          toast({ title: "Missing Information", description: "Please fill in the color name and sheen for each area.", variant: "destructive" });
                          return;
                        }
                        submitColors(colorEntries);
                      }}
                      disabled={isSubmittingColors}
                      data-testid="button-submit-colors"
                    >
                      {isSubmittingColors && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Submit Color Selections
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}


      </div>

      {showStickyFooter && (() => {
        const selPkg = showPackages && selectedPkgId ? portalPackages.find(p => p.id === selectedPkgId) : null;

        return (
          <div
            className="fixed bottom-0 left-0 right-0 z-50 print:hidden"
            data-testid="sticky-proposal-footer"
          >
            <div style={{
              backgroundColor: headerBgColor,
              borderTop: isLightBg ? '1px solid rgba(0,0,0,0.15)' : headerFooterBorder,
              boxShadow: isLightBg ? '0 -4px 20px rgba(0,0,0,0.12)' : '0 -6px 18px rgba(0,0,0,0.16)',
              paddingTop: 6,
              paddingBottom: 'calc(6px + env(safe-area-inset-bottom, 0px))',
            }}>
              <div className="max-w-3xl mx-auto px-4">
                {selPkg && (
                  <div className="flex items-center justify-center gap-1.5 mb-1" data-testid="sticky-selected-package">
                    <span style={{ color: headerTextMuted, fontSize: 10 }}>Selected Package:</span>
                    <span style={{ color: headerTextSemiMuted, fontSize: 10 }}>{selPkg.name}</span>
                  </div>
                )}
                <div className="flex items-center justify-between gap-3">
                  <div data-testid="sticky-total-price">
                    <span style={{ color: headerTextMuted, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', lineHeight: 1.1 }}>Total</span>
                    <span style={{ color: headerTextColor, fontSize: 19, fontWeight: 800, lineHeight: 1.1 }}>${(stickyTotalCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <button
                    onClick={handleStickyAccept}
                    className="flex items-center gap-1.5 font-bold text-white whitespace-nowrap transition-colors"
                    style={{
                      backgroundColor: '#22C55E',
                      padding: '0 14px',
                      height: 38,
                      borderRadius: 12,
                      fontSize: 14,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#16A34A')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#22C55E')}
                    data-testid="button-sticky-accept"
                  >
                    <PenLine className="w-3.5 h-3.5" />
                    <span className="sm:hidden">Accept & Sign</span>
                    <span className="hidden sm:inline">Accept & Sign Proposal</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      <Dialog open={showPaymentOptionsModal} onOpenChange={setShowPaymentOptionsModal}>
        <DialogContent className="sm:max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-green-600" />
              {paymentOptionsContext?.isDeposit ? 'Deposit Payment Required' : 'Payment Options'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {paymentOptionsContext?.isDeposit && (
              <p className="text-sm text-muted-foreground text-center">
                A deposit is required to get started on your project.
              </p>
            )}

            <div className="bg-muted/50 rounded-lg p-4 text-center border">
              <p className="text-xs text-muted-foreground mb-1">
                {paymentOptionsContext?.nextPaymentLabel || 'Amount Due'}
              </p>
              <p className="text-3xl font-bold" data-testid="text-modal-payment-amount">
                {formatCurrency((paymentOptionsContext?.nextPaymentAmount || 0) / 100)}
              </p>
              {paymentOptionsContext && paymentOptionsContext.totalAmount > paymentOptionsContext.nextPaymentAmount && (
                <p className="text-xs text-muted-foreground mt-1">
                  Remaining Balance: {formatCurrency(paymentOptionsContext.totalAmount / 100)}
                </p>
              )}
            </div>

            {paymentOptionsContext?.allowOnlinePayment && cardFeePercent > 0 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs space-y-1" data-testid="card-fee-breakdown">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal (paid by card)</span>
                  <span className="font-medium">{formatCurrency((paymentOptionsContext.nextPaymentAmount || 0) / 100)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Card processing fee ({cardFeePercent}%)</span>
                  <span className="font-medium">+{formatCurrency(calcCardFee(paymentOptionsContext.nextPaymentAmount || 0) / 100)}</span>
                </div>
                <div className="flex justify-between font-semibold border-t border-amber-500/30 pt-1 mt-1">
                  <span>Total charged to card</span>
                  <span data-testid="text-card-total-with-fee">{formatCurrency(((paymentOptionsContext.nextPaymentAmount || 0) + calcCardFee(paymentOptionsContext.nextPaymentAmount || 0)) / 100)}</span>
                </div>
                <p className="text-[10px] text-muted-foreground pt-1">Fee only applies to card payments. Offline payments are not charged a fee.</p>
              </div>
            )}

            <div className="space-y-2">
              {paymentOptionsContext?.allowOnlinePayment && (
                <Button
                  className="w-full h-12"
                  onClick={() => {
                    setShowPaymentOptionsModal(false);
                    handleCardPayment(paymentOptionsContext.nextPaymentAmount, paymentOptionsContext.nextPaymentLabel);
                  }}
                  disabled={isCreatingPaymentSession}
                  data-testid="button-modal-pay-card"
                >
                  {isCreatingPaymentSession ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <CreditCard className="w-5 h-5 mr-2" />}
                  {cardFeePercent > 0
                    ? `Pay ${formatCurrency(((paymentOptionsContext.nextPaymentAmount || 0) + calcCardFee(paymentOptionsContext.nextPaymentAmount || 0)) / 100)} with Card`
                    : `Pay ${paymentOptionsContext.nextPaymentLabel} with Card`}
                </Button>
              )}

              {paymentOptionsContext?.allowOfflinePayment && (
                <Button
                  variant="outline"
                  className="w-full h-12"
                  onClick={() => {
                    setShowPaymentOptionsModal(false);
                    setShowOfflineConfirmation(true);
                    setOfflineConfirmationContext({
                      amount: paymentOptionsContext.nextPaymentAmount,
                      label: paymentOptionsContext.nextPaymentLabel,
                      hasInstructions: !!doc?.paymentInstructions,
                    });
                    setTimeout(() => {
                      setShowOfflineConfirmation(false);
                    }, 8000);
                  }}
                  data-testid="button-modal-pay-offline"
                >
                  <Banknote className="w-5 h-5 mr-2" />
                  Offline Payment (Zelle, Check, etc.)
                </Button>
              )}

              {paymentOptionsContext && paymentOptionsContext.totalAmount > paymentOptionsContext.nextPaymentAmount && (
                <div className="pt-2 border-t">
                  <p className="text-xs text-muted-foreground text-center mb-2">Or pay the full remaining balance</p>
                  {paymentOptionsContext.allowOnlinePayment && (
                    <Button
                      variant="secondary"
                      className="w-full"
                      onClick={() => {
                        setShowPaymentOptionsModal(false);
                        handleCardPayment(paymentOptionsContext.totalAmount, 'Full Balance');
                      }}
                      disabled={isCreatingPaymentSession}
                      data-testid="button-modal-pay-full-card"
                    >
                      <CreditCard className="w-4 h-4 mr-2" />
                      {cardFeePercent > 0
                        ? `Pay Full Balance (${formatCurrency((paymentOptionsContext.totalAmount + calcCardFee(paymentOptionsContext.totalAmount)) / 100)} incl. ${cardFeePercent}% card fee)`
                        : `Pay Full Balance (${formatCurrency(paymentOptionsContext.totalAmount / 100)})`}
                    </Button>
                  )}
                  {paymentOptionsContext.allowOfflinePayment && (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        setShowPaymentOptionsModal(false);
                        setShowOfflineConfirmation(true);
                        setOfflineConfirmationContext({
                          amount: paymentOptionsContext.totalAmount,
                          label: 'Full Balance',
                          hasInstructions: !!doc?.paymentInstructions,
                        });
                        setTimeout(() => {
                          setShowOfflineConfirmation(false);
                        }, 8000);
                      }}
                      data-testid="button-modal-pay-full-offline"
                    >
                      <Banknote className="w-4 h-4 mr-2" />
                      Pay Full Balance Offline ({formatCurrency(paymentOptionsContext.totalAmount / 100)})
                    </Button>
                  )}
                </div>
              )}
            </div>

            <Button
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={() => setShowPaymentOptionsModal(false)}
              data-testid="button-modal-pay-later"
            >
              I'll pay later
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {showPaymentFooter && (
        <div
          className="fixed bottom-0 left-0 right-0 z-50 print:hidden"
          data-testid="sticky-payment-footer"
        >
          <div style={{
            backgroundColor: headerBgColor,
            borderTop: isLightBg ? '1px solid rgba(0,0,0,0.15)' : headerFooterBorder,
            boxShadow: isLightBg ? '0 -4px 20px rgba(0,0,0,0.12)' : '0 -6px 18px rgba(0,0,0,0.16)',
            paddingTop: 6,
            paddingBottom: 'calc(6px + env(safe-area-inset-bottom, 0px))',
          }}>
            <div className="max-w-3xl mx-auto px-4">
              <div className="flex items-center justify-between gap-3">
                <div data-testid="sticky-payment-info">
                  <span style={{ color: headerTextMuted, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', lineHeight: 1.1 }}>
                    {paymentFooterLabel}
                  </span>
                  <span style={{ color: headerTextColor, fontSize: 19, fontWeight: 800, lineHeight: 1.1 }}>
                    ${(paymentAmountDue / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <button
                  onClick={() => openPaymentOptions()}
                  className="flex items-center gap-1.5 font-bold text-white whitespace-nowrap transition-colors"
                  style={{
                    backgroundColor: '#22C55E',
                    padding: '0 14px',
                    height: 38,
                    borderRadius: 12,
                    fontSize: 14,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#16A34A')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#22C55E')}
                  data-testid="button-sticky-make-payment"
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  <span className="sm:hidden">Make a Payment</span>
                  <span className="hidden sm:inline">Make a Payment</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>

      {/* Customer Hub Overlay */}
      {showCustomerHub && (
        <div
          className="fixed inset-0 z-50 flex flex-col"
          onClick={(e) => { if (e.target === e.currentTarget) setShowCustomerHub(false); }}
        >
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowCustomerHub(false)} />
          <div
            className="relative w-full max-w-4xl mx-auto overflow-y-auto"
            style={{
              maxHeight: '85vh',
              animation: 'hubSlideDown 0.4s ease-out',
            }}
          >
            <div className="m-3 sm:m-4 rounded-2xl border border-gray-200 shadow-2xl bg-white p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between mb-1">
                <div>
                  {customerHub?.customerName && (
                    <p className="text-base font-semibold text-gray-800 mb-0.5">Welcome, {customerHub.customerName.split(' ')[0]}</p>
                  )}
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-400">My Projects</p>
                </div>
                <button
                  onClick={() => setShowCustomerHub(false)}
                  className="p-1.5 rounded-full hover:bg-gray-100 transition-colors"
                  data-testid="button-close-hub"
                >
                  <XCircle className="w-5 h-5 text-gray-400" />
                </button>
              </div>
              {!customerHub ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
                </div>
              ) : (
                <>
                  {customerHub.companyInfo && Object.keys(customerHub.companyInfo).length > 0 && (
                    <>
                      {customerHub.companyInfo.license && (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-xs text-gray-500">
                          <Shield className="w-3.5 h-3.5 shrink-0 text-blue-600" />
                          <span>License: {customerHub.companyInfo.license}</span>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        {customerHub.companyInfo.website && (
                          <a
                            href={customerHub.companyInfo.website.startsWith('http') ? customerHub.companyInfo.website : `https://${customerHub.companyInfo.website}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm text-gray-600 hover:text-gray-900 transition-all border border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                            data-testid="hub-link-website"
                          >
                            <Globe className="w-4 h-4 shrink-0" />
                            <span className="truncate">Website</span>
                            <ExternalLink className="w-3 h-3 shrink-0 ml-auto opacity-40" />
                          </a>
                        )}
                        {customerHub.companyInfo.reviewLink && (
                          <a
                            href={customerHub.companyInfo.reviewLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm text-gray-600 hover:text-gray-900 transition-all border border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                            data-testid="hub-link-review"
                          >
                            <Star className="w-4 h-4 shrink-0" />
                            <span className="truncate">Leave a Review</span>
                            <ExternalLink className="w-3 h-3 shrink-0 ml-auto opacity-40" />
                          </a>
                        )}
                        {customerHub.companyInfo.bookingUrl && (
                          <a
                            href={customerHub.companyInfo.bookingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm text-gray-600 hover:text-gray-900 transition-all border border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                            data-testid="hub-link-booking"
                          >
                            <Calendar className="w-4 h-4 shrink-0" />
                            <span className="truncate">Book Online</span>
                            <ExternalLink className="w-3 h-3 shrink-0 ml-auto opacity-40" />
                          </a>
                        )}
                        {customerHub.companyInfo.phone && (
                          <a
                            href={`tel:${customerHub.companyInfo.phone}`}
                            className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm text-gray-600 hover:text-gray-900 transition-all border border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                            data-testid="hub-link-phone"
                          >
                            <Phone className="w-4 h-4 shrink-0" />
                            <span className="truncate">Call Us</span>
                          </a>
                        )}
                        {customerHub.companyInfo.email && (
                          <a
                            href={`mailto:${customerHub.companyInfo.email}`}
                            className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm text-gray-600 hover:text-gray-900 transition-all border border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                            data-testid="hub-link-email"
                          >
                            <Mail className="w-4 h-4 shrink-0" />
                            <span className="truncate">Email Us</span>
                          </a>
                        )}
                      </div>
                    </>
                  )}

                  <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mt-1">My Projects</p>

                  {customerHub.projects?.map((project: any) => {
                    const coiPath = project.coiFilePath || customerHub.companyInfo?.coiFilePath;
                    const compData = customerHub.companyInfo?.complianceData;
                    const hubInsurances = (compData?.insurances || []).filter((ins: any) => ins.documentPath);
                    const hubCertificates = (compData?.certificates || []).filter((cert: any) => cert.documentPath);
                    const hasComplianceDocs = coiPath || hubInsurances.length > 0 || hubCertificates.length > 0;
                    const anySigned = project.documents?.some((d: any) => d.signature);
                    const makeUrl = (path: string) => `/api/portal/document/${token}/compliance-file?path=${encodeURIComponent(path)}`;

                    return (
                    <div key={project.id} className="rounded-xl border border-gray-200 overflow-hidden bg-gray-50 shadow-md">
                      <div className="px-4 py-2.5 flex items-center gap-2">
                        <FolderOpen className="w-4 h-4 text-gray-400 shrink-0" />
                        <span className="text-sm font-semibold text-gray-800 truncate">{project.title}</span>
                      </div>
                      <div className="px-3 pb-2.5 space-y-1">
                        {project.documents?.map((d: any) => {
                          const isCurrent = d.id === customerHub.currentDocId;
                          const icon = d.type === 'invoice' ? Receipt : d.type === 'change_order' ? FileSignature : FileText;
                          const Icon = icon;
                          const label = d.type === 'change_order' ? 'Change Order' : d.type.charAt(0).toUpperCase() + d.type.slice(1);
                          return (
                            <a
                              key={d.id}
                              href={`/portal/document/${d.publicToken}`}
                              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${
                                isCurrent
                                  ? 'text-white font-semibold'
                                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                              }`}
                              style={isCurrent ? { backgroundColor: headerAccentColor } : undefined}
                              data-testid={`hub-doc-${d.id}`}
                            >
                              <Icon className="w-4 h-4 shrink-0" />
                              <span className="truncate">{label} #{(d.documentNumber || d.id).toString().padStart(6, '0')}</span>
                              {d.signature && <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0 ml-auto" />}
                            </a>
                          );
                        })}
                        {project.colorSubmissions?.map((cs: any) => (
                          <a
                            key={`cs-${cs.id}`}
                            href={`/color-review/${cs.reviewToken}`}
                            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-all"
                            data-testid={`hub-color-${cs.id}`}
                          >
                            <Paintbrush className="w-4 h-4 shrink-0" />
                            <span className="truncate">Color Selection</span>
                            {cs.customerApproved && <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0 ml-auto" />}
                          </a>
                        ))}
                        {(!project.documents?.length && !project.colorSubmissions?.length) && (
                          <p className="px-3 py-2 text-xs text-gray-300">No documents yet</p>
                        )}
                        {hasComplianceDocs && (
                          <div className="mt-1 border-t border-gray-100 pt-2">
                            <p className="px-3 pb-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5" data-testid={`hub-compliance-label-${project.id}`}>
                              <Shield className="w-3 h-3" />
                              Licenses & Certificates
                            </p>
                            {!hubAuthenticated ? (
                              <button
                                onClick={() => {
                                  setShowHubOtpModal(true);
                                  setHubOtpStep('identifier');
                                  setHubOtpCode('');
                                  setHubOtpError('');
                                  setHubOtpSuccess('');
                                }}
                                className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-all"
                                data-testid={`hub-view-compliance-${project.id}`}
                              >
                                <Lock className="w-4 h-4 shrink-0 text-blue-600" />
                                <span>View Documents</span>
                                <ChevronRight className="w-3.5 h-3.5 shrink-0 ml-auto opacity-40" />
                              </button>
                            ) : (
                              <div className="space-y-0.5">
                                {coiPath && (
                                  <a href={makeUrl(coiPath)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-all" data-testid={`hub-coi-${project.id}`}>
                                    <Shield className="w-4 h-4 shrink-0 text-blue-600" />
                                    <span className="truncate">Certificate of Insurance</span>
                                    {!anySigned ? <Eye className="w-3 h-3 shrink-0 ml-auto opacity-40" /> : <ExternalLink className="w-3 h-3 shrink-0 ml-auto opacity-40" />}
                                  </a>
                                )}
                                {hubInsurances.map((ins: any) => (
                                  <a key={`hub-ins-${ins.id}`} href={makeUrl(ins.documentPath)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-all" data-testid={`hub-insurance-${ins.id}-${project.id}`}>
                                    <Shield className="w-4 h-4 shrink-0 text-blue-600" />
                                    <span className="truncate">{ins.type || 'Insurance Policy'}</span>
                                    {!anySigned ? <Eye className="w-3 h-3 shrink-0 ml-auto opacity-40" /> : <ExternalLink className="w-3 h-3 shrink-0 ml-auto opacity-40" />}
                                  </a>
                                ))}
                                {hubCertificates.map((cert: any) => (
                                  <a key={`hub-cert-${cert.id}`} href={makeUrl(cert.documentPath)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-all" data-testid={`hub-cert-${cert.id}-${project.id}`}>
                                    <Award className="w-4 h-4 shrink-0 text-emerald-600" />
                                    <span className="truncate">{cert.name || 'Certificate'}</span>
                                    {!anySigned ? <Eye className="w-3 h-3 shrink-0 ml-auto opacity-40" /> : <ExternalLink className="w-3 h-3 shrink-0 ml-auto opacity-40" />}
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    );
                  })}
                  {customerHub.unlinkedDocuments?.length > 0 && (
                    <div className="rounded-xl border border-gray-200 overflow-hidden bg-gray-50 shadow-md">
                      <div className="px-4 py-2.5 flex items-center gap-2">
                        <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                        <span className="text-sm font-semibold text-gray-800">Other Documents</span>
                      </div>
                      <div className="px-3 pb-2.5 space-y-1">
                        {customerHub.unlinkedDocuments.map((d: any) => {
                          const isCurrent = d.id === customerHub.currentDocId;
                          const label = d.type === 'change_order' ? 'Change Order' : d.type.charAt(0).toUpperCase() + d.type.slice(1);
                          return (
                            <a
                              key={d.id}
                              href={`/portal/document/${d.publicToken}`}
                              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${
                                isCurrent
                                  ? 'text-white font-semibold'
                                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                              }`}
                              style={isCurrent ? { backgroundColor: headerAccentColor } : undefined}
                              data-testid={`hub-doc-${d.id}`}
                            >
                              <FileText className="w-4 h-4 shrink-0" />
                              <span className="truncate">{label} #{(d.documentNumber || d.id).toString().padStart(6, '0')}</span>
                              {d.signature && <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0 ml-auto" />}
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {(!customerHub.projects?.length && !customerHub.unlinkedDocuments?.length) && (
                    <p className="text-center text-sm text-gray-300 py-4">No projects found</p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {showHubOtpModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowHubOtpModal(false); }}>
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowHubOtpModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-3" style={{ animation: 'hubSlideDown 0.3s ease-out' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center">
                  <Lock className="w-4.5 h-4.5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">Verify Your Identity</p>
                  <p className="text-xs text-gray-400">to view licenses & certificates</p>
                </div>
              </div>
              <button onClick={() => setShowHubOtpModal(false)} className="p-1.5 rounded-full hover:bg-gray-100 transition-colors" data-testid="button-close-otp-modal">
                <XCircle className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <p className="text-xs text-gray-500">Enter the email or phone number associated with your project. We'll send a verification code to confirm your identity.</p>
            {hubOtpStep === 'identifier' ? (
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Enter your email or phone number"
                  value={hubOtpIdentifier}
                  onChange={(e) => setHubOtpIdentifier(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleHubOtpRequest()}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                  data-testid="input-hub-otp-identifier"
                />
                {hubOtpError && <p className="text-xs text-red-500" data-testid="text-hub-otp-error">{hubOtpError}</p>}
                {hubOtpNeedHelp && hubOtpContactInfo && (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-1.5" data-testid="hub-otp-contact-help">
                    <p className="text-xs font-medium text-amber-800">Need help? Contact {hubOtpContactInfo.companyName || 'us'}:</p>
                    <div className="flex flex-wrap gap-2">
                      {hubOtpContactInfo.phone && (
                        <a href={`tel:${hubOtpContactInfo.phone}`} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white border border-amber-200 text-xs font-medium text-amber-900 hover:bg-amber-100 transition-colors" data-testid="hub-otp-call-link">
                          <Phone className="w-3 h-3" /> Call
                        </a>
                      )}
                      {hubOtpContactInfo.email && (
                        <a href={`mailto:${hubOtpContactInfo.email}`} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white border border-amber-200 text-xs font-medium text-amber-900 hover:bg-amber-100 transition-colors" data-testid="hub-otp-email-link">
                          <Mail className="w-3 h-3" /> Email
                        </a>
                      )}
                    </div>
                  </div>
                )}
                <button
                  onClick={handleHubOtpRequest}
                  disabled={hubOtpLoading || !hubOtpIdentifier.trim()}
                  className="w-full px-3 py-2.5 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-50"
                  style={{ backgroundColor: headerAccentColor }}
                  data-testid="button-hub-otp-send"
                >
                  {hubOtpLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Send Verification Code'}
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {hubOtpSuccess && <p className="text-xs text-green-600" data-testid="text-hub-otp-success">{hubOtpSuccess}</p>}
                <input
                  type="text"
                  placeholder="Enter 6-digit code"
                  value={hubOtpCode}
                  onChange={(e) => setHubOtpCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                  onKeyDown={(e) => e.key === 'Enter' && handleHubOtpVerify()}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-center tracking-[0.3em] font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  maxLength={6}
                  autoFocus
                  data-testid="input-hub-otp-code"
                />
                {hubOtpError && <p className="text-xs text-red-500" data-testid="text-hub-otp-error">{hubOtpError}</p>}
                <button
                  onClick={handleHubOtpVerify}
                  disabled={hubOtpLoading || hubOtpCode.length < 6}
                  className="w-full px-3 py-2.5 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-50"
                  style={{ backgroundColor: headerAccentColor }}
                  data-testid="button-hub-otp-verify"
                >
                  {hubOtpLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Verify'}
                </button>
                <button
                  onClick={() => { setHubOtpStep('identifier'); setHubOtpCode(''); setHubOtpError(''); setHubOtpSuccess(''); }}
                  className="w-full text-xs text-gray-400 hover:text-gray-600 transition-colors"
                  data-testid="button-hub-otp-back"
                >
                  Use a different email or phone
                </button>
                {hubOtpContactInfo && (
                  <div className="pt-1 border-t border-gray-100 mt-2">
                    <p className="text-[10px] text-gray-400 text-center">
                      Not receiving the code?{' '}
                      {hubOtpContactInfo.phone && <a href={`tel:${hubOtpContactInfo.phone}`} className="text-blue-500 hover:underline">Call us</a>}
                      {hubOtpContactInfo.phone && hubOtpContactInfo.email && ' or '}
                      {hubOtpContactInfo.email && <a href={`mailto:${hubOtpContactInfo.email}`} className="text-blue-500 hover:underline">email us</a>}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes hubSlideDown {
          from { transform: translateY(-100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </ForceLightTheme>
  );
}
