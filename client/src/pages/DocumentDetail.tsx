import { useDocument, useUpdateDocument, useSignDocument, useDeleteDocument, useCreateDocument } from "@/hooks/use-documents";
import { isCapacitorNative } from "@/lib/iap";
import { useCompanySettings, useSendSms, useSendEmail, useMakeCall } from "@/hooks/use-company-settings";
import { useAuth } from "@/hooks/use-auth";
import { useMobileNavVisibility } from "@/components/layout/Sidebar";
import { useCustomerView } from "@/contexts/CustomerViewContext";
import { useDemoMode } from "@/contexts/DemoModeContext";
import { useTemplate, useMessageTemplates } from "@/hooks/use-templates";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ArrowLeft, Send, CheckCircle, Download, MessageSquare, Phone, Link2, Eye, AlertTriangle, DollarSign, Trash2, Plus, FileText, ChevronDown, ChevronUp, ChevronRight, FileDown, Pencil, PenLine, Copy, Archive, RotateCcw, Mail, MoreVertical, User, Clock, CalendarClock, Palette, XCircle, FolderOpen, Info, Banknote, Layers, Shield, Settings, Tag, Percent, BadgeCheck, MapPin } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { generateDocumentPDF, viewPDF, downloadPDF } from "@/lib/pdfGenerator";
import { Link, useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { format, addDays } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import SignatureCanvas from "react-signature-canvas";
import { cn, formatCurrency, formatPhoneDisplay } from "@/lib/utils";
import { normalizePhone, isValidPhone, stripPhoneInput } from "@/lib/phone";
import { copyToClipboard } from "@/lib/clipboard";
import { EditDocumentDialog, type EditFocusEntry } from "@/components/EditDocumentDialog";
import { PaymentSettingsSection } from "@/components/PaymentSettingsSection";
import { DocumentPhotoDisplay } from "@/components/DocumentPhotoDisplay";
import { ProjectPhotosCard } from "@/components/ProjectPhotosCard";
import type { PaymentSettings, ProductionRateBlock, PackageSnapshot } from "@shared/schema";
import { ProductionRateBlocksSection, calcExcludedTotals, calcOptionalAreaTotals, calcContractorHiddenTotals, filterExcludedForHiddenAreas, DocumentSqftSummary } from "@/components/ProductionRateBlockDisplay";
import { SelectedPackageSummary, PackageCarousel } from "@/components/PackageComponents";
import { ProposalPackageSettingsModal } from "@/components/InlinePackageEditor";
import { packageToSnapshot } from "@/lib/packagePricing";
import type { ProposalPackage } from "@shared/schema";
import { CreateChangeOrderDialog } from "@/components/CreateChangeOrderDialog";
import { EditChangeOrderDialog } from "@/components/EditChangeOrderDialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { DocumentView, Payment, Document, ProjectRecipient, ColorSubmission } from "@shared/schema";
import { Input } from "@/components/ui/input";
import { AddressAutocomplete, type AddressComponents } from "@/components/AddressAutocomplete";
import { AddressDisplay } from "@/components/AddressMapLink";
import { RichTextDisplay, stripHtmlForValidation } from "@/components/RichTextEditor";
import { LineItemEditorModal, LineItemCard, type LineItem } from "@/components/LineItemEditorModal";
import { LineItemRenderer } from "@/components/LineItemRenderer";
import { ChangeOrderContentRenderer } from "@/components/ChangeOrderContentRenderer";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function InternalDocHeader({ doc, isProposalOrEstimate, validThroughDate, openContactEditModal, openJobAddressEditModal }: {
  doc: any;
  isProposalOrEstimate: boolean;
  validThroughDate: Date | null;
  openContactEditModal: () => void;
  openJobAddressEditModal: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { maskName, maskPhone, maskEmail, maskAddress, maskCity } = useDemoMode();
  const docNumber = `#${(doc.documentNumber || doc.id).toString().padStart(6, '0')}`;
  const dContactName = maskName(doc.contact.name);
  const dContactPhone = maskPhone(doc.contact.phone);
  const dContactEmail = maskEmail(doc.contact.email);
  const dContactAddress = maskAddress(doc.contact.address);
  const dContactCity = maskCity(doc.contact.city);
  const dJobAddress = maskAddress(doc.jobAddress);
  const dJobCity = maskCity(doc.jobCity);
  const jobAddress = doc.jobAddressSameAsBilling
    ? [dContactAddress, dContactCity, doc.contact.state, doc.contact.zipCode].filter(Boolean).join(', ')
    : [dJobAddress, dJobCity, doc.jobState, doc.jobZipCode].filter(Boolean).join(', ');
  // Auto-created invoices (sourceDocumentId set) are always immutable so they
  // stay locked even after the status flips to 'sent' on send/request-payment.
  const isAutoCreatedInvoice = doc.type === 'invoice' && !!doc.sourceDocumentId;
  const canEdit = !doc.signature && doc.status !== 'accepted' && !isAutoCreatedInvoice;

  return (
    <div className="border-b pb-4" data-testid="internal-doc-header">
      <button
        type="button"
        className="w-full flex items-center justify-between gap-2 text-left"
        onClick={() => setExpanded(!expanded)}
        data-testid="button-toggle-internal-header"
      >
        <div className="min-w-0">
          <p className="font-bold text-base">{dContactName}</p>
          <p className="text-sm text-muted-foreground truncate">{jobAddress || 'No address'} {docNumber}</p>
        </div>
        <div className="shrink-0">
          {expanded
            ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
            : <ChevronDown className="w-4 h-4 text-muted-foreground" />
          }
        </div>
      </button>
      <DocumentSqftSummary
        blocks={doc.content?.productionRateBlocks}
        isCustomerView={false}
        excludedSurfaces={doc.content?.excludedSurfaces}
        contractorHiddenAreas={doc.content?.contractorHiddenAreas}
        acceptedOptionalAreas={doc.content?.acceptedOptionalAreas}
        className="mt-2"
        testId="internal-doc-sqft-summary"
      />

      {expanded && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mt-4">
          <div>
            <h4
              className={cn("text-xs font-bold uppercase text-muted-foreground mb-2 inline-block", canEdit && "cursor-pointer hover:text-primary transition-colors")}
              onClick={canEdit ? openContactEditModal : undefined}
              data-testid="clickable-client-title-proposal"
            >
              Client: {canEdit && <Pencil className="w-3 h-3 inline ml-1" />}
            </h4>
            <p className="font-bold">{dContactName}</p>
            <AddressDisplay
              address={dContactAddress}
              city={dContactCity}
              state={doc.contact.state}
              zipCode={doc.contact.zipCode}
            />
            <p className="text-sm text-muted-foreground">{dContactPhone ? formatPhoneDisplay(dContactPhone) : ''}</p>
            <p className="text-sm text-muted-foreground">{dContactEmail}</p>
          </div>
          <div>
            <h4
              className={cn("text-xs font-bold uppercase text-muted-foreground mb-2 inline-block", canEdit && "cursor-pointer hover:text-primary transition-colors")}
              onClick={canEdit ? openJobAddressEditModal : undefined}
              data-testid="clickable-job-address-title-proposal"
            >
              Job Address: {canEdit && <Pencil className="w-3 h-3 inline ml-1" />}
            </h4>
            {doc.jobAddressSameAsBilling ? (
              <AddressDisplay
                address={dContactAddress}
                city={dContactCity}
                state={doc.contact.state}
                zipCode={doc.contact.zipCode}
              />
            ) : (
              <AddressDisplay
                address={dJobAddress}
                city={dJobCity}
                state={doc.jobState}
                zipCode={doc.jobZipCode}
              />
            )}
            {!doc.contact.address && !doc.contact.city && doc.jobAddressSameAsBilling && (
              <p className="text-sm text-muted-foreground">Same as billing</p>
            )}
            {!doc.jobAddress && !doc.jobCity && !doc.jobAddressSameAsBilling && (
              <p className="text-sm text-muted-foreground">Not specified</p>
            )}
          </div>
          <div className="sm:text-right">
            <h4 className="text-xs font-bold uppercase text-muted-foreground mb-2">{doc.type.replace('_', ' ')} Info:</h4>
            <p className="font-medium">{docNumber}</p>
            <p className="text-sm text-muted-foreground">Date: {doc.createdAt ? format(new Date(doc.createdAt), "MMM d, yyyy") : 'N/A'}</p>
            {isProposalOrEstimate && validThroughDate && (
              <p className="text-sm text-muted-foreground">Valid Through: {format(validThroughDate, "MMM d, yyyy")}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function applyTemplateTags(text: string, vars: {
  contactName?: string; contactPhone?: string; contactEmail?: string;
  companyName?: string; companyPhone?: string; companyEmail?: string;
  documentLink?: string; amount?: string; documentType?: string;
  reviewLink?: string;
  proposalLink?: string; invoiceLink?: string; estimateLink?: string; changeOrderLink?: string;
  crewLead?: string; salesRep?: string; crewMember?: string;
}): string {
  const firstName = vars.contactName?.split(' ')[0] || '';
  return text
    .replace(/\{\{client_name\}\}/g, vars.contactName || '')
    .replace(/\{\{client_first_name\}\}/g, firstName)
    .replace(/\{\{client_phone\}\}/g, vars.contactPhone || '')
    .replace(/\{\{client_email\}\}/g, vars.contactEmail || '')
    .replace(/\{\{company_name\}\}/g, vars.companyName || '')
    .replace(/\{\{company_phone\}\}/g, vars.companyPhone || '')
    .replace(/\{\{company_email\}\}/g, vars.companyEmail || '')
    .replace(/\{\{document_link\}\}/g, vars.documentLink || '')
    .replace(/\{\{proposal_link\}\}/g, vars.proposalLink || vars.documentLink || '')
    .replace(/\{\{invoice_link\}\}/g, vars.invoiceLink || vars.documentLink || '')
    .replace(/\{\{estimate_link\}\}/g, vars.estimateLink || vars.documentLink || '')
    .replace(/\{\{change_order_link\}\}/g, vars.changeOrderLink || vars.documentLink || '')
    .replace(/\{\{amount\}\}/g, vars.amount || '')
    .replace(/\{\{document_type\}\}/g, vars.documentType || '')
    .replace(/\{\{review_link\}\}/g, vars.reviewLink || '')
    .replace(/\{\{crew_lead\}\}/g, vars.crewLead || '')
    .replace(/\{\{sales_rep\}\}/g, vars.salesRep || '')
    .replace(/\{\{crew_member\}\}/g, vars.crewMember || '');
}

function CollapsibleLineItem({ item, index, taxRate, proposalDefaults, brandColor, mode = "internal", onEdit }: { item: any; index: number; taxRate: number; proposalDefaults: any; brandColor?: string | null; mode?: "internal" | "customer"; onEdit?: () => void }) {
  const [expanded, setExpanded] = useState(true);
  const hasContent = !!(item.scopeNoteHtml || item.description || (item.surfaces && item.surfaces.length > 0) || item.pricingDetails || item.debug);

  return (
    <div data-testid={`line-item-wrapper-${index}`}>
      {index > 0 && <hr className="border-foreground my-3" style={{ borderTopWidth: '3px' }} />}
      <div>
        <button
          type="button"
          className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md text-left ${!brandColor ? 'bg-foreground/90 dark:bg-foreground/85' : ''}`}
          style={brandColor ? { backgroundColor: brandColor } : undefined}
          onClick={() => hasContent && setExpanded(!expanded)}
          data-testid={`button-toggle-item-${index}`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {hasContent && (
              <ChevronRight className={`w-4 h-4 shrink-0 ${brandColor ? 'text-white/70' : 'text-background/70'} transition-transform ${expanded ? 'rotate-90' : ''}`} />
            )}
            <span className={`text-sm font-semibold ${brandColor ? 'text-white' : 'text-background'}`}>{item.name || `Item ${index + 1}`}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!item.descriptionOnly && (
              <span className={`text-sm font-medium tabular-nums ${brandColor ? 'text-white/90' : 'text-background/90'}`}>
                ${((item.total || 0) / 100).toFixed(2)}
              </span>
            )}
            {onEdit && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); onEdit(); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onEdit(); } }}
                className={`inline-flex items-center justify-center w-6 h-6 rounded hover:bg-white/20 ${brandColor ? 'text-white/90' : 'text-background/90'}`}
                data-testid={`button-edit-item-${index}`}
                title="Edit this item"
              >
                <Pencil className="w-3.5 h-3.5" />
              </span>
            )}
          </div>
        </button>
        {expanded && (
          <div className="mt-2">
            <LineItemRenderer item={item} index={index} mode={mode} proposalDefaults={proposalDefaults} pricesInCents={true} hideNameAndTotal={true} />
          </div>
        )}
      </div>
    </div>
  );
}

export default function DocumentDetail({ params }: { params: { id: string } }) {
  const docId = parseInt(params.id);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userTier = user?.subscriptionTier || 'starter';
  const { maskName: dmName, maskPhone: dmPhone, maskEmail: dmEmail, maskAddress: dmAddress, maskCity: dmCity } = useDemoMode();
  const { data: doc, isLoading } = useDocument(docId);
  const { data: settings } = useCompanySettings();
  const { data: msgTemplates } = useMessageTemplates();
  const { data: teamMembersData } = useQuery<{ id: number; name: string; role: string }[]>({ queryKey: ["/api/team-members"] });
  const { mutate: updateDoc } = useUpdateDocument();
  const pendingPkgChangesRef = useRef<Record<string, any>>({});
  const pkgFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushPkgChanges = useCallback(() => {
    if (pkgFlushTimerRef.current) clearTimeout(pkgFlushTimerRef.current);
    pkgFlushTimerRef.current = setTimeout(() => {
      if (!doc) return;
      const pending = pendingPkgChangesRef.current;
      if (Object.keys(pending).length === 0) return;
      const content = { ...(doc.content as any), ...pending };
      pendingPkgChangesRef.current = {};
      updateDoc({ id: doc.id, data: { content } });
    }, 0);
  }, [doc, updateDoc]);
  const { mutate: signDoc, isPending: isSigning } = useSignDocument();
  const { mutate: sendSms, isPending: isSendingSms } = useSendSms();
  const { mutate: sendEmail, isPending: isSendingEmail } = useSendEmail();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const sigPad = useRef<SignatureCanvas>(null);
  const [showSmsDialog, setShowSmsDialog] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [showSendOptionsDialog, setShowSendOptionsDialog] = useState(false);
  const [showViewHistory, setShowViewHistory] = useState(false);
  const [showCallConfirm, setShowCallConfirm] = useState(false);
  const [showOpenPhoneCallDialog, setShowOpenPhoneCallDialog] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showRequestPaymentDialog, setShowRequestPaymentDialog] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentType, setPaymentType] = useState("");
  const [paymentDate, setPaymentDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [paymentNotes, setPaymentNotes] = useState("");
  const [notifyCustomer, setNotifyCustomer] = useState(true);
  const [paymentLabel, setPaymentLabel] = useState("");
  const [requestPaymentAmount, setRequestPaymentAmount] = useState("");
  const [requestPaymentSmsMessage, setRequestPaymentSmsMessage] = useState("");
  const [requestPaymentEmailMessage, setRequestPaymentEmailMessage] = useState("");
  const [sendPaymentViaSms, setSendPaymentViaSms] = useState(false);
  const [sendPaymentViaEmail, setSendPaymentViaEmail] = useState(false);
  const [paymentSendTiming, setPaymentSendTiming] = useState<'now' | 'working_hours' | 'scheduled'>('now');
  const [paymentScheduledDate, setPaymentScheduledDate] = useState('');
  const [paymentScheduledTime, setPaymentScheduledTime] = useState('');
  const [sendDocViaSms, setSendDocViaSms] = useState(false);
  const [sendDocViaNativeSms, setSendDocViaNativeSms] = useState(false);
  const [sendDocViaEmail, setSendDocViaEmail] = useState(false);
  const [sendDocSmsMessage, setSendDocSmsMessage] = useState("");
  const [sendDocEmailMessage, setSendDocEmailMessage] = useState("");
  const [sendDocEmailSubject, setSendDocEmailSubject] = useState("");
  const [sendTiming, setSendTiming] = useState<'now' | 'working_hours' | 'scheduled'>('now');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [showEditMessagesDialog, setShowEditMessagesDialog] = useState(false);
  const [draftSmsMessage, setDraftSmsMessage] = useState("");
  const [draftEmailSubject, setDraftEmailSubject] = useState("");
  const [draftEmailMessage, setDraftEmailMessage] = useState("");
  const [includeAdditionalRecipients, setIncludeAdditionalRecipients] = useState(true);
  const [showInvoiceDetails, setShowInvoiceDetails] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [showHeaderActions, setShowHeaderActions] = useState(false);
  const [showArchiveCOConfirm, setShowArchiveCOConfirm] = useState(false);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [showDeleteCOConfirm, setShowDeleteCOConfirm] = useState(false);
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [showCreateChangeOrder, setShowCreateChangeOrder] = useState(false);
  const { mutate: deleteDocument, isPending: isDeleting } = useDeleteDocument();
  const { mutate: createDocument, isPending: isCreatingChangeOrder } = useCreateDocument();
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  // State for contact and job address edit modals
  const [showContactEditModal, setShowContactEditModal] = useState(false);
  const [showJobAddressEditModal, setShowJobAddressEditModal] = useState(false);
  const [editContactName, setEditContactName] = useState("");
  const [editContactEmail, setEditContactEmail] = useState("");
  const [editContactPhone, setEditContactPhone] = useState("");
  const [editContactAddress, setEditContactAddress] = useState("");
  const [editContactCity, setEditContactCity] = useState("");
  const [editContactState, setEditContactState] = useState("");
  const [editContactZipCode, setEditContactZipCode] = useState("");
  const [editJobAddress, setEditJobAddress] = useState("");
  const [editJobCity, setEditJobCity] = useState("");
  const [editJobState, setEditJobState] = useState("");
  const [editJobZipCode, setEditJobZipCode] = useState("");
  const [editJobSameAsBilling, setEditJobSameAsBilling] = useState(false);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [paymentSettingsExpanded, setPaymentSettingsExpanded] = useState(false);
  const [customerView, setCustomerViewLocal] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [editFocus, setEditFocus] = useState<EditFocusEntry | null>(null);
  const editOriginViewRef = useRef<boolean | null>(null);
  const openEditWithFocus = useCallback((focus: EditFocusEntry) => {
    editOriginViewRef.current = customerView;
    setEditFocus(focus);
    setEditDialogOpen(true);
  }, [customerView]);
  const handleEditOpenChange = useCallback((v: boolean) => {
    setEditDialogOpen(v);
    if (!v) {
      setEditFocus(null);
      if (editOriginViewRef.current !== null) {
        setCustomerViewLocal(editOriginViewRef.current);
        editOriginViewRef.current = null;
      }
    }
  }, []);
  const { setCustomerView: setGlobalCustomerView } = useCustomerView();
  const setCustomerView = useCallback((v: boolean) => {
    setCustomerViewLocal(v);
    setGlobalCustomerView(v);
  }, [setGlobalCustomerView]);
  const [cvSelectedPkgId, setCvSelectedPkgId] = useState<number | undefined>(undefined);
  const [cvAcceptedOptionals, setCvAcceptedOptionals] = useState<string[]>([]);
  const [cvAcceptedOptionalAreas, setCvAcceptedOptionalAreas] = useState<string[]>([]);
  const [cvExcludedSurfaces, setCvExcludedSurfaces] = useState<string[]>([]);
  const [contractorHiddenAreas, setContractorHiddenAreas] = useState<string[]>([]);
  const [contractorHiddenItems, setContractorHiddenItems] = useState<string[]>([]);
  const [showPackageSettingsModal, setShowPackageSettingsModal] = useState(false);
  const [showPaymentSettingsModal, setShowPaymentSettingsModal] = useState(false);
  const { setHidden: setMobileNavHidden } = useMobileNavVisibility();

  const { data: globalPackagesForDetail } = useQuery<ProposalPackage[]>({ queryKey: ['/api/proposal-packages'] });

  useEffect(() => {
    if (doc?.content?.paymentSettings?.depositRequired) {
      setPaymentSettingsExpanded(true);
    }
  }, [doc?.id]);


  useEffect(() => {
    if (customerView && doc) {
      const savedPkgId = doc.content?.packageSnapshot?.id;
      if (savedPkgId && !cvSelectedPkgId) {
        setCvSelectedPkgId(savedPkgId);
      }
      if (doc.content?.acceptedOptionalItems) {
        setCvAcceptedOptionals(doc.content.acceptedOptionalItems);
      }
      if ((doc.content as any)?.acceptedOptionalAreas) {
        setCvAcceptedOptionalAreas((doc.content as any).acceptedOptionalAreas);
      }
      if (doc.content?.excludedSurfaces) {
        setCvExcludedSurfaces(doc.content.excludedSurfaces);
      }
      setMobileNavHidden(true);
    }
    if (!customerView) {
      setCvSelectedPkgId(undefined);
      setCvAcceptedOptionals([]);
      setCvAcceptedOptionalAreas([]);
      setCvExcludedSurfaces([]);
      setMobileNavHidden(false);
    }
    return () => {
      setMobileNavHidden(false);
      setGlobalCustomerView(false);
    };
  }, [customerView, doc?.id]);

  const cvOptionalsSaving = useRef(false);
  const cvOptionalsSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cvExcludedSaving = useRef(false);
  const cvExcludedSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!customerView || !doc) return;
    const serverPkgId = (doc.content as any)?.selectedPackageId ?? (doc.content as any)?.packageSnapshot?.id ?? undefined;
    if (serverPkgId !== cvSelectedPkgId) {
      setCvSelectedPkgId(serverPkgId);
    }
  }, [customerView, (doc?.content as any)?.selectedPackageId, (doc?.content as any)?.packageSnapshot?.id]);

  useEffect(() => {
    if (!customerView || !doc || cvOptionalsSaving.current) return;
    const serverOptionals = doc.content?.acceptedOptionalItems || [];
    setCvAcceptedOptionals(serverOptionals);
  }, [customerView, doc?.content?.acceptedOptionalItems]);

  useEffect(() => {
    if (!customerView || !doc || cvExcludedSaving.current) return;
    const serverExcluded = doc.content?.excludedSurfaces || [];
    setCvExcludedSurfaces(serverExcluded);
  }, [customerView, doc?.content?.excludedSurfaces]);

  const docRef = useRef(doc);
  docRef.current = doc;

  const toggleCvOptionalItem = useCallback(async (itemId: string) => {
    cvOptionalsSaving.current = true;
    if (cvOptionalsSaveTimer.current) clearTimeout(cvOptionalsSaveTimer.current);
    setCvAcceptedOptionals(prev => {
      const newVal = prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId];
      const currentDoc = docRef.current;
      if (currentDoc) {
        const updatedContent = { ...(currentDoc.content as any), acceptedOptionalItems: newVal };
        updateDoc({ id: currentDoc.id, data: { content: updatedContent } });
      }
      cvOptionalsSaveTimer.current = setTimeout(() => { cvOptionalsSaving.current = false; }, 5000);
      return newVal;
    });
  }, [updateDoc]);

  const toggleCvOptionalArea = useCallback((areaId: string) => {
    cvOptionalsSaving.current = true;
    if (cvOptionalsSaveTimer.current) clearTimeout(cvOptionalsSaveTimer.current);
    setCvAcceptedOptionalAreas(prev => {
      const newVal = prev.includes(areaId) ? prev.filter(id => id !== areaId) : [...prev, areaId];
      const currentDoc = docRef.current;
      if (currentDoc) {
        const updatedContent = { ...(currentDoc.content as any), acceptedOptionalAreas: newVal };
        updateDoc({ id: currentDoc.id, data: { content: updatedContent } });
      }
      cvOptionalsSaveTimer.current = setTimeout(() => { cvOptionalsSaving.current = false; }, 5000);
      return newVal;
    });
  }, [updateDoc]);

  const toggleCvExcludedSurface = useCallback((surfaceId: string) => {
    cvExcludedSaving.current = true;
    if (cvExcludedSaveTimer.current) clearTimeout(cvExcludedSaveTimer.current);
    setCvExcludedSurfaces(prev => {
      const newVal = prev.includes(surfaceId) ? prev.filter(id => id !== surfaceId) : [...prev, surfaceId];
      const currentDoc = docRef.current;
      if (currentDoc) {
        const updatedContent = { ...(currentDoc.content as any), excludedSurfaces: newVal };
        updateDoc({ id: currentDoc.id, data: { content: updatedContent } });
      }
      cvExcludedSaveTimer.current = setTimeout(() => { cvExcludedSaving.current = false; }, 5000);
      return newVal;
    });
  }, [updateDoc]);

  useEffect(() => {
    if (doc?.content?.contractorHiddenAreas) {
      setContractorHiddenAreas(doc.content.contractorHiddenAreas);
    }
    if (doc?.content?.contractorHiddenItems) {
      setContractorHiddenItems(doc.content.contractorHiddenItems);
    }
  }, [doc?.id]);

  const toggleContractorHiddenArea = useCallback((areaId: string) => {
    setContractorHiddenAreas(prev => {
      const newVal = prev.includes(areaId) ? prev.filter(id => id !== areaId) : [...prev, areaId];
      const currentDoc = docRef.current;
      if (currentDoc) {
        const updatedContent = { ...(currentDoc.content as any), contractorHiddenAreas: newVal };
        updateDoc({ id: currentDoc.id, data: { content: updatedContent } });
      }
      return newVal;
    });
  }, [updateDoc]);

  const toggleContractorHiddenItem = useCallback((itemKey: string) => {
    setContractorHiddenItems(prev => {
      const newVal = prev.includes(itemKey) ? prev.filter(id => id !== itemKey) : [...prev, itemKey];
      const currentDoc = docRef.current;
      if (currentDoc) {
        const updatedContent = { ...(currentDoc.content as any), contractorHiddenItems: newVal };
        updateDoc({ id: currentDoc.id, data: { content: updatedContent } });
      }
      return newVal;
    });
  }, [updateDoc]);

  // Fetch view history when dialog is opened
  const { data: viewHistory, isLoading: viewHistoryLoading } = useQuery<DocumentView[]>({
    queryKey: ['/api/documents', docId, 'views'],
    enabled: showViewHistory,
  });

  // Fetch payments for this document (invoices only)
  const { data: payments, isLoading: paymentsLoading } = useQuery<Payment[]>({
    queryKey: ['/api/documents', docId, 'payments'],
    enabled: !!doc && doc.type === 'invoice',
  });

  // Fetch linked invoice document (for proposals/estimates)
  const { data: linkedInvoice } = useQuery<Document>({
    queryKey: ['/api/documents', doc?.linkedInvoiceId],
    enabled: !!doc && (doc.type === 'proposal' || doc.type === 'estimate') && !!doc.linkedInvoiceId,
  });

  // Fetch payments from linked invoice (for proposals/estimates)
  const { data: linkedInvoicePayments } = useQuery<Payment[]>({
    queryKey: ['/api/documents', doc?.linkedInvoiceId, 'payments'],
    enabled: !!doc && (doc.type === 'proposal' || doc.type === 'estimate') && !!doc.linkedInvoiceId,
  });

  // Fetch source proposal document (for invoices created from a signed proposal)
  const { data: sourceProposal } = useQuery<Document>({
    queryKey: ['/api/documents', doc?.sourceDocumentId],
    enabled: !!doc && doc.type === 'invoice' && !!doc.sourceDocumentId,
  });

  // Fetch photos for this document
  const { data: docPhotos = [] } = useQuery<any[]>({
    queryKey: ["/api/documents", docId, "photos"],
    queryFn: async () => {
      const res = await fetch(`/api/documents/${docId}/photos`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load photos");
      return res.json();
    },
  });

  const companyCamConnected = !!(settings as any)?.companyCamApiToken;
  const companyCamProjectId = (doc as any)?.companyCamProjectId;
  const companyCamProjectName = (doc as any)?.companyCamProjectName;
  const { data: companyCamPhotos = [], isLoading: companyCamLoading, isError: companyCamError } = useQuery<any[]>({
    queryKey: ["/api/companycam/projects", companyCamProjectId, "photos"],
    queryFn: async () => {
      const res = await fetch(`/api/companycam/projects/${companyCamProjectId}/photos`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: companyCamConnected && !!companyCamProjectId,
  });

  // Fetch change orders for proposals
  const { data: changeOrders } = useQuery<Document[]>({
    queryKey: ['/api/documents', docId, 'change-orders'],
    enabled: !!doc && (doc.type === 'proposal' || doc.type === 'estimate'),
  });

  // Fetch standards and expectations template for PDF generation
  const { data: standardsTemplate } = useTemplate('standard_expectations');
  
  // Fetch terms and conditions template for PDF generation
  const { data: termsTemplate } = useTemplate('terms_and_conditions');

  // State for showing change orders section
  const [showChangeOrders, setShowChangeOrders] = useState(false);
  
  // State for change order popup
  const [showChangeOrderPopup, setShowChangeOrderPopup] = useState(false);
  const [selectedChangeOrder, setSelectedChangeOrder] = useState<Document | null>(null);
  const [showCOSmsDialog, setShowCOSmsDialog] = useState(false);
  const [showEditChangeOrderDialog, setShowEditChangeOrderDialog] = useState(false);
  const coSigPad = useRef<SignatureCanvas>(null);
  const [isSigningCO, setIsSigningCO] = useState(false);
  const [showCOSignatureModal, setShowCOSignatureModal] = useState(false);

  const [redirectedFromCO, setRedirectedFromCO] = useState(false);

  // Project Recipients (managed at project level)
  const { data: projectRecipients } = useQuery<ProjectRecipient[]>({
    queryKey: ['/api/projects', doc?.projectId, 'recipients'],
    enabled: !!doc?.projectId,
  });

  const { data: linkedProject } = useQuery<{ coiFilePath?: string | null }>({
    queryKey: ['/api/projects', doc?.projectId],
    enabled: !!doc?.projectId,
  });

  const { data: colorSubmissionsData } = useQuery<ColorSubmission[]>({
    queryKey: ['/api/documents', docId, 'color-submissions'],
    enabled: !!doc && (doc.type === 'proposal' || doc.type === 'estimate'),
  });

  const { data: proposalPackages } = useQuery<any[]>({
    queryKey: ['/api/proposal-packages'],
    enabled: !!settings?.packagesEnabled && !!doc?.content?.packageSnapshot,
  });

  const [showRejectColorDialog, setShowRejectColorDialog] = useState(false);
  const [rejectColorSubmissionId, setRejectColorSubmissionId] = useState<number | null>(null);
  const [rejectColorNote, setRejectColorNote] = useState("");
  const [colorAreas, setColorAreas] = useState<{ key: string; label: string }[]>([]);
  const colorAreasInitRef = useRef(false);

  useEffect(() => {
    if (!doc) return;
    if (colorAreasInitRef.current) return;
    const areas = (doc.content as any)?.colorAreas;
    if (Array.isArray(areas) && areas.length > 0) {
      setColorAreas(areas);
      colorAreasInitRef.current = true;
    }
  }, [doc]);

  const saveColorAreasMutation = useMutation({
    mutationFn: async (areas: { key: string; label: string }[]) => {
      const res = await fetch(`/api/documents/${docId}/color-settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ colorAreas: areas }),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to save color areas');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/documents', docId] });
      toast({ title: "Color areas saved" });
    },
  });

  const toggleColorSubmissionMutation = useMutation({
    mutationFn: async (allow: boolean) => {
      const res = await fetch(`/api/documents/${docId}/color-settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowClientColorSubmission: allow }),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to update color settings');
      return res.json();
    },
    onMutate: async (allow: boolean) => {
      await queryClient.cancelQueries({ queryKey: ['/api/documents', docId] });
      const previous = queryClient.getQueryData(['/api/documents', docId]);
      queryClient.setQueryData(['/api/documents', docId], (old: any) => {
        const updated: any = {
          ...old,
          allowClientColorSubmission: allow,
          colorSubmissionStatus: allow ? 'not_submitted' : 'not_requested',
        };
        if (allow && !old?.content?.colorAreas) {
          const hasPaintGroups = old?.content?.items?.some((item: any) =>
            item.surfaces?.some((s: any) => s.paintGroupKey)
          );
          if (!hasPaintGroups) {
            const defaults = [
              { key: 'walls', label: 'Walls' },
              { key: 'trim', label: 'Trim' },
              { key: 'ceiling', label: 'Ceiling' },
            ];
            updated.content = { ...old?.content, colorAreas: defaults };
            setColorAreas(defaults);
            colorAreasInitRef.current = true;
          }
        }
        return updated;
      });
      return { previous };
    },
    onError: (_err, _allow, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['/api/documents', docId], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/documents', docId] });
    },
  });

  const approveColorsMutation = useMutation({
    mutationFn: async (submissionId: number) => {
      const res = await fetch(`/api/documents/${docId}/color-submissions/${submissionId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to approve colors');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/documents', docId] });
      queryClient.invalidateQueries({ queryKey: ['/api/documents', docId, 'color-submissions'] });
      toast({ title: "Colors approved" });
    },
  });

  const rejectColorsMutation = useMutation({
    mutationFn: async ({ submissionId, note }: { submissionId: number; note?: string }) => {
      const res = await fetch(`/api/documents/${docId}/color-submissions/${submissionId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to reject colors');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/documents', docId] });
      queryClient.invalidateQueries({ queryKey: ['/api/documents', docId, 'color-submissions'] });
      setShowRejectColorDialog(false);
      setRejectColorNote("");
      setRejectColorSubmissionId(null);
      toast({ title: "Color changes requested" });
    },
  });

  useEffect(() => {
    if (doc && doc.type === 'change_order' && doc.sourceDocumentId && doc.sourceDocumentId !== doc.id && !redirectedFromCO) {
      setRedirectedFromCO(true);
      sessionStorage.setItem('openChangeOrderId', JSON.stringify({ coId: doc.id, parentId: doc.sourceDocumentId }));
      setLocation(`/documents/${doc.sourceDocumentId}`);
    }
  }, [doc, setLocation, redirectedFromCO]);

  useEffect(() => {
    if (!changeOrders) return;
    const raw = sessionStorage.getItem('openChangeOrderId');
    if (raw) {
      try {
        const { coId, parentId } = JSON.parse(raw);
        if (parentId === docId) {
          const co = changeOrders.find(c => c.id === coId);
          if (co) {
            sessionStorage.removeItem('openChangeOrderId');
            setSelectedChangeOrder(co);
            setShowChangeOrderPopup(true);
          }
        } else {
          sessionStorage.removeItem('openChangeOrderId');
        }
      } catch {
        sessionStorage.removeItem('openChangeOrderId');
      }
    }
  }, [changeOrders, docId]);

  useEffect(() => {
    if (showChangeOrderPopup) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showChangeOrderPopup]);

  // Create payment mutation
  const createPaymentMutation = useMutation({
    mutationFn: async (data: { amount: number; paymentType: string; paymentDate: string; notes: string; notifyCustomer?: boolean; paymentLabel?: string }) => {
      const res = await fetch(`/api/documents/${docId}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to create payment');
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/documents', docId, 'payments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/documents/:id', docId] });
      setShowPaymentDialog(false);
      setPaymentAmount("");
      setPaymentType("");
      setPaymentDate(format(new Date(), "yyyy-MM-dd"));
      setPaymentNotes("");
      setNotifyCustomer(true);
      setPaymentLabel("");
      const desc = variables.notifyCustomer
        ? "Payment recorded and customer notified."
        : "The payment has been recorded successfully.";
      toast({ title: "Payment Recorded", description: desc });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to record payment.", variant: "destructive" });
    },
  });

  // Delete payment mutation
  const deletePaymentMutation = useMutation({
    mutationFn: async (paymentId: number) => {
      const res = await fetch(`/api/documents/${docId}/payments/${paymentId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to delete payment');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/documents', docId, 'payments'] });
      toast({ title: "Payment Deleted", description: "The payment has been deleted." });
    },
  });

  // Archive mutation for change orders
  const archiveMutation = useMutation({
    mutationFn: async ({ id, archived }: { id: number; archived: boolean }) => {
      const res = await fetch(`/api/documents/${id}/archive`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ archived }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to archive');
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/documents', docId, 'change-orders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
      toast({ title: variables.archived ? "Archived" : "Restored", description: variables.archived ? "Change order has been archived." : "Change order has been restored." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // State for mark as paid dialog (for proposals)
  const [showMarkAsPaidDialog, setShowMarkAsPaidDialog] = useState(false);
  const [markAsPaidInvoiceId, setMarkAsPaidInvoiceId] = useState<number | null>(null);
  
  // Create invoice from proposal mutation
  const createInvoiceMutation = useMutation({
    mutationFn: async (proposalId: number) => {
      const res = await fetch(`/api/documents/${proposalId}/create-invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to create invoice');
      }
      return res.json();
    },
    onSuccess: (invoice) => {
      // Set amount first, then open dialog
      const amount = (invoice.totalAmount / 100).toFixed(2);
      setPaymentAmount(amount);
      setMarkAsPaidInvoiceId(invoice.id);
      setPaymentLabel('Payment');
      setNotifyCustomer(true);
      setShowMarkAsPaidDialog(true);
      // Invalidate after dialog is open to avoid state interference
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['/api/documents', docId] });
      }, 100);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Handle Mark as Paid button click
  const handleMarkAsPaid = async () => {
    if (!doc) return;
    
    if (doc.type === 'invoice') {
      // For invoices, open payment dialog directly
      setMarkAsPaidInvoiceId(doc.id);
      setPaymentAmount((remainingBalance / 100).toFixed(2));
      setPaymentLabel('Payment');
      setNotifyCustomer(true);
      setShowMarkAsPaidDialog(true);
    } else if ((doc.type === 'proposal' || doc.type === 'estimate') && doc.status === 'accepted') {
      if (doc.linkedInvoiceId) {
        // Invoice exists, open payment dialog for that invoice
        setMarkAsPaidInvoiceId(doc.linkedInvoiceId);
        // We need to fetch the invoice to get remaining balance
        const invoiceRes = await fetch(`/api/documents/${doc.linkedInvoiceId}`);
        if (invoiceRes.ok) {
          const invoice = await invoiceRes.json();
          const invoicePaymentsRes = await fetch(`/api/documents/${doc.linkedInvoiceId}/payments`);
          const invoicePayments = invoicePaymentsRes.ok ? await invoicePaymentsRes.json() : [];
          const paidAmount = invoicePayments.reduce((sum: number, p: any) => sum + p.amount, 0);
          const remaining = invoice.totalAmount - paidAmount;
          setPaymentAmount((remaining / 100).toFixed(2));
        } else {
          setPaymentAmount((doc.totalAmount / 100).toFixed(2));
        }
        setPaymentLabel('Payment');
        setNotifyCustomer(true);
        setShowMarkAsPaidDialog(true);
      } else {
        // No linked invoice, create one first
        createInvoiceMutation.mutate(doc.id);
      }
    }
  };

  // Create payment mutation for mark as paid (targets linked invoice)
  const createMarkAsPaidPaymentMutation = useMutation({
    mutationFn: async (data: { amount: number; paymentType: string; paymentDate: string; notes: string; notifyCustomer?: boolean; paymentLabel?: string }) => {
      if (!markAsPaidInvoiceId) throw new Error('No invoice selected');
      const res = await fetch(`/api/documents/${markAsPaidInvoiceId}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to create payment');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/documents', docId] });
      queryClient.invalidateQueries({ queryKey: ['/api/documents', docId, 'payments'] });
      if (markAsPaidInvoiceId) {
        queryClient.invalidateQueries({ queryKey: ['/api/documents', markAsPaidInvoiceId, 'payments'] });
      }
      setShowMarkAsPaidDialog(false);
      setPaymentAmount("");
      setPaymentType("");
      setPaymentDate(format(new Date(), "yyyy-MM-dd"));
      setPaymentNotes("");
      setNotifyCustomer(true);
      setPaymentLabel("");
      setMarkAsPaidInvoiceId(null);
      toast({ title: "Payment Recorded", description: "The payment has been recorded successfully." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to record payment.", variant: "destructive" });
    },
  });

  // Handle record payment for mark as paid
  const handleRecordMarkAsPaidPayment = () => {
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: "Error", description: "Please enter a valid amount.", variant: "destructive" });
      return;
    }
    if (!paymentType) {
      toast({ title: "Error", description: "Please select a payment type.", variant: "destructive" });
      return;
    }
    createMarkAsPaidPaymentMutation.mutate({
      amount,
      paymentType,
      paymentDate,
      notes: paymentNotes,
      notifyCustomer,
      paymentLabel: paymentLabel || 'Payment',
    });
  };

  // Archive mutation for main document (redirects after)
  const publishDocument = async (docId: number): Promise<boolean> => {
    try {
      const res = await fetch(`/api/documents/${docId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({ title: "Could not publish", description: data.message || "Customer view was not updated.", variant: "destructive" });
        return false;
      }
      queryClient.invalidateQueries({ queryKey: ['/api/documents', docId] });
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
      return true;
    } catch (e: any) {
      toast({ title: "Could not publish", description: e?.message || "Network error", variant: "destructive" });
      return false;
    }
  };

  const publishMutation = useMutation({
    mutationFn: async (id: number) => {
      const ok = await publishDocument(id);
      if (!ok) throw new Error('Publish failed');
      return true;
    },
    onSuccess: () => {
      toast({ title: "Customer view updated", description: "Your customer will now see the latest version." });
    },
  });

  const archiveDocMutation = useMutation({
    mutationFn: async ({ id, archived }: { id: number; archived: boolean }) => {
      const res = await fetch(`/api/documents/${id}/archive`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ archived }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to archive');
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
      toast({ title: variables.archived ? "Document Archived" : "Document Restored" });
      setLocation("/documents");
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Update contact mutation
  const updateContactMutation = useMutation({
    mutationFn: async (data: { name: string; email: string; phone: string; address: string; city?: string; state?: string; zipCode?: string }) => {
      const res = await fetch(`/api/contacts/${doc?.contactId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to update contact');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/documents', docId] });
      setShowContactEditModal(false);
      toast({ title: "Contact Updated", description: "Contact information has been updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update contact.", variant: "destructive" });
    },
  });

  // Update job address mutation
  const updateJobAddressMutation = useMutation({
    mutationFn: async (data: { jobAddress: string; jobCity: string; jobState: string; jobZipCode: string; jobAddressSameAsBilling: boolean }) => {
      const res = await fetch(`/api/documents/${docId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to update job address');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/documents', docId] });
      setShowJobAddressEditModal(false);
      toast({ title: "Job Address Updated", description: "Job address has been updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update job address.", variant: "destructive" });
    },
  });

  // Open contact edit modal
  const openContactEditModal = () => {
    if (doc) {
      setEditContactName(doc.contact.name);
      setEditContactEmail(doc.contact.email);
      setEditContactPhone(doc.contact.phone);
      setEditContactAddress(doc.contact.address || '');
      setEditContactCity(doc.contact.city || '');
      setEditContactState(doc.contact.state || '');
      setEditContactZipCode(doc.contact.zipCode || '');
      setShowContactEditModal(true);
    }
  };

  // Open job address edit modal
  const openJobAddressEditModal = () => {
    if (doc) {
      setEditJobAddress(doc.jobAddress || '');
      setEditJobCity(doc.jobCity || '');
      setEditJobState(doc.jobState || '');
      setEditJobZipCode(doc.jobZipCode || '');
      setEditJobSameAsBilling(doc.jobAddressSameAsBilling || false);
      setShowJobAddressEditModal(true);
    }
  };

  // Handle save contact
  const handleSaveContact = () => {
    if (editContactPhone.length > 0 && !isValidPhone(editContactPhone)) {
      toast({ title: "Invalid phone number", description: "Enter a valid US/Canada phone number", variant: "destructive" });
      return;
    }
    updateContactMutation.mutate({
      name: editContactName,
      email: editContactEmail,
      phone: editContactPhone ? normalizePhone(editContactPhone) : '',
      address: editContactAddress,
      city: editContactCity,
      state: editContactState,
      zipCode: editContactZipCode,
    });
  };

  // Handle save job address
  const handleSaveJobAddress = () => {
    updateJobAddressMutation.mutate({
      jobAddress: editJobSameAsBilling ? (doc?.contact.address || '') : editJobAddress,
      jobCity: editJobSameAsBilling ? (doc?.contact.city || '') : editJobCity,
      jobState: editJobSameAsBilling ? (doc?.contact.state || '') : editJobState,
      jobZipCode: editJobSameAsBilling ? (doc?.contact.zipCode || '') : editJobZipCode,
      jobAddressSameAsBilling: editJobSameAsBilling,
    });
  };

  // Get formatted contact address for display (returns array of lines)
  const getContactAddressLines = (): string[] => {
    if (!doc) return [];
    const streetLine = doc.contact.address || '';
    const cityStateZip = [doc.contact.city, doc.contact.state, doc.contact.zipCode].filter(Boolean).join(', ');
    
    if (!streetLine && !cityStateZip) return [];
    if (!streetLine) return [cityStateZip];
    if (!cityStateZip) return [streetLine];
    return [streetLine, cityStateZip];
  };

  // Get formatted job address for display (returns array of lines)
  const getJobAddressLines = (): string[] => {
    if (!doc) return ["N/A"];
    if (doc.jobAddressSameAsBilling) {
      const contactLines = getContactAddressLines();
      return contactLines.length > 0 ? contactLines : ["Same as billing"];
    }
    const streetLine = doc.jobAddress || '';
    const cityStateZip = [doc.jobCity, doc.jobState, doc.jobZipCode].filter(Boolean).join(', ');
    
    if (!streetLine && !cityStateZip) return ["Not specified"];
    if (!streetLine) return [cityStateZip];
    if (!cityStateZip) return [streetLine];
    return [streetLine, cityStateZip];
  };

  const handleRecordPayment = () => {
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: "Error", description: "Please enter a valid amount.", variant: "destructive" });
      return;
    }
    if (!paymentType) {
      toast({ title: "Error", description: "Please select a payment type.", variant: "destructive" });
      return;
    }
    createPaymentMutation.mutate({
      amount,
      paymentType,
      paymentDate,
      notes: paymentNotes,
      notifyCustomer,
      paymentLabel: paymentLabel || 'Payment',
    });
  };

  const fallbackTaxRate = settings?.taxRate ? parseFloat(settings.taxRate) : 0;
  const docTaxBlock = (doc?.content?.productionRateBlocks || []).find((b: any) => b.taxable && b.taxProfileRate != null);
  const taxRate = docTaxBlock ? parseFloat(String(docTaxBlock.taxProfileRate)) : fallbackTaxRate;
  const taxProfileName = docTaxBlock?.taxProfileName || null;
  const calcTax = (items: any[]) => {
    const pricedItems = items.filter((i: any) => !i.descriptionOnly);
    const subtotal = pricedItems.reduce((sum: number, item: any) => sum + (item.total || 0), 0);
    const taxableSubtotal = pricedItems.filter((i: any) => i.taxable).reduce((sum: number, item: any) => sum + (item.total || 0), 0);
    const taxAmount = taxRate > 0 ? Math.round(taxableSubtotal * taxRate / 100) : 0;
    return { subtotal, taxableSubtotal, taxAmount, grandTotal: subtotal + taxAmount };
  };

  const cvTotals = useMemo(() => {
    if (!doc) return { subtotal: 0, taxAmount: 0, grandTotal: 0 };

    const signedCOTotal = changeOrders?.filter((co: any) => co.signature).reduce((s: number, co: any) => s + co.totalAmount, 0) || 0;

    if (doc.signature && doc.type !== 'invoice') {
      return { subtotal: doc.totalAmount - signedCOTotal, taxAmount: 0, grandTotal: doc.totalAmount };
    }

    const hasPerProposalPkgs = (doc.content as any)?.proposalPackagesEnabled === true;
    const cvAvailPkgs = hasPerProposalPkgs
      ? ((doc.content as any)?.proposalPackagesData || [])
      : (globalPackagesForDetail || []);
    const pkgSnapshots = (hasPerProposalPkgs
      ? cvAvailPkgs
      : cvAvailPkgs.map((p: any) => packageToSnapshot(p))
    ).filter((p: any) => p.active !== false);
    const allItems = doc.content?.items || [];
    const nonOptItems = allItems.filter((item: any) => !item.isOptional && !item.name?.startsWith('[CO]'));
    const optItems = allItems.filter((item: any) => item.isOptional);
    const optBlocks = (doc.content?.productionRateBlocks || []).filter((b: any) => b.isOptional);
    const nonOptBlocks = (doc.content?.productionRateBlocks || []).filter((b: any) => !b.isOptional);
    const blocksPreDiscountCents = nonOptBlocks.reduce((s: number, b: any) => s + Math.round((b.roomBuilderData?.grandTotal || 0) * 100), 0);
    const itemsPreDiscountCents = nonOptItems.reduce((s: number, i: any) => s + (i.total || 0), 0);
    const hiddenItemsCents = nonOptItems.reduce((s: number, i: any, idx: number) => {
      const key = `item-${i.name || idx}`;
      return contractorHiddenItems.includes(key) ? s + (i.total || 0) : s;
    }, 0);
    const hasBlocks = nonOptBlocks.length > 0;
    const baseAmount = hasBlocks
      ? blocksPreDiscountCents + itemsPreDiscountCents
      : (nonOptItems.length > 0 ? itemsPreDiscountCents : doc.totalAmount - signedCOTotal);

    const acceptedOptTotal = optItems.reduce((s: number, item: any, i: number) => {
      const id = `item-${item.name || i}`;
      return cvAcceptedOptionals.includes(id) ? s + (item.total || 0) : s;
    }, 0) + optBlocks.reduce((s: number, block: any) => {
      const id = `block-${block.id}`;
      return cvAcceptedOptionals.includes(id) ? s + Math.round((block.roomBuilderData?.grandTotal || 0) * 100) : s;
    }, 0);

    let excludedSurfaceCostCents = 0;
    const filteredCvExcluded = filterExcludedForHiddenAreas(cvExcludedSurfaces, contractorHiddenAreas);
    if (filteredCvExcluded.length > 0) {
      const allBlocks = doc.content?.productionRateBlocks || [];
      const nonOptBlocks = allBlocks.filter((b: any) => !b.isOptional);
      for (const block of nonOptBlocks) {
        const excl = calcExcludedTotals(block, filteredCvExcluded);
        excludedSurfaceCostCents += Math.round(excl.grandTotal * 100);
      }
      for (const block of optBlocks) {
        const blockId = `block-${block.id}`;
        if (cvAcceptedOptionals.includes(blockId)) {
          const excl = calcExcludedTotals(block, filteredCvExcluded);
          excludedSurfaceCostCents += Math.round(excl.grandTotal * 100);
        }
      }
    }

    const taxableTotal = nonOptItems.filter((i: any) => i.taxable).reduce((s: number, i: any) => s + (i.total || 0), 0);
    const taxableBlocksTotal = nonOptBlocks.filter((b: any) => b.taxable).reduce((s: number, b: any) => s + Math.round((b.roomBuilderData?.grandTotal || 0) * 100), 0);
    const optTaxable = optItems.reduce((s: number, item: any, i: number) => {
      const id = `item-${item.name || i}`;
      return (cvAcceptedOptionals.includes(id) && item.taxable) ? s + (item.total || 0) : s;
    }, 0) + optBlocks.reduce((s: number, block: any) => {
      const id = `block-${block.id}`;
      return (cvAcceptedOptionals.includes(id) && block.taxable) ? s + Math.round((block.roomBuilderData?.grandTotal || 0) * 100) : s;
    }, 0);
    let excludedTaxableCents = 0;
    if (filteredCvExcluded.length > 0) {
      const allBlocks = doc.content?.productionRateBlocks || [];
      for (const block of allBlocks) {
        if (block.isOptional && !cvAcceptedOptionals.includes(`block-${block.id}`)) continue;
        if (!block.taxable) continue;
        const excl = calcExcludedTotals(block, filteredCvExcluded);
        excludedTaxableCents += Math.round(excl.grandTotal * 100);
      }
    }
    let optionalAreaExclCents = 0;
    {
      const allBlocks = doc.content?.productionRateBlocks || [];
      for (const block of allBlocks) {
        if (block.isOptional && !cvAcceptedOptionals.includes(`block-${block.id}`)) continue;
        const areas = block.roomBuilderData?.areaResults || [];
        const rooms = block.roomBuilderData?.rooms || [];
        const unacceptedAreaIds = areas
          .filter((a: any) => {
            const isOpt = a.isOptional || (rooms.find((r: any) => r.id === a.roomId) as any)?.isOptional;
            if (!isOpt) return false;
            return !cvAcceptedOptionalAreas.includes(`${block.id}:area:${a.roomId}`);
          })
          .map((a: any) => `${block.id}:area:${a.roomId}`);
        if (unacceptedAreaIds.length > 0) {
          const excl = calcOptionalAreaTotals(block, unacceptedAreaIds);
          optionalAreaExclCents += Math.round(excl.grandTotal * 100);
        }
      }
    }
    let contractorHiddenCostCents = 0;
    {
      const chAreas = contractorHiddenAreas;
      if (chAreas.length > 0) {
        const allBlks = doc.content?.productionRateBlocks || [];
        for (const block of allBlks) {
          if (block.isOptional && !cvAcceptedOptionals.includes(`block-${block.id}`)) continue;
          const excl = calcContractorHiddenTotals(block, chAreas);
          contractorHiddenCostCents += Math.round(excl.grandTotal * 100);
        }
      }
    }

    const effectiveBaseForPkg = baseAmount - excludedSurfaceCostCents - optionalAreaExclCents - contractorHiddenCostCents - hiddenItemsCents;
    const activePkgId = cvSelectedPkgId || (doc.content as any)?.packageSnapshot?.id;
    let pkgAdj = 0;
    if (activePkgId) {
      const selPkg = pkgSnapshots.find((p: any) => p.id === activePkgId);
      if (selPkg) {
        pkgAdj = selPkg.priceAdjustmentType === 'percent'
          ? Math.round(effectiveBaseForPkg * (selPkg.adjustmentValue / 100))
          : Math.round((selPkg.adjustmentValue || 0) * 100);
      }
    }

    const baseForDiscount = effectiveBaseForPkg + pkgAdj;
    const subtotalBeforeDiscount = baseForDiscount + acceptedOptTotal;
    const allDiscounts: { type: 'flat' | 'percentage'; value: number; label?: string }[] = doc.content?.discounts?.length
      ? doc.content.discounts
      : doc.content?.discount?.value ? [doc.content.discount] : [];
    let discountCents = 0;
    for (const d of allDiscounts) {
      if (d.value > 0) {
        discountCents += d.type === 'percentage'
          ? Math.round(baseForDiscount * (Math.min(d.value, 100) / 100))
          : Math.round(d.value * 100);
      }
    }
    discountCents = Math.min(discountCents, Math.max(0, subtotalBeforeDiscount));
    const subtotal = subtotalBeforeDiscount - discountCents;
    let optAreaTaxableExclCents = 0;
    {
      const allBlocks2 = doc.content?.productionRateBlocks || [];
      for (const block of allBlocks2) {
        if (block.isOptional && !cvAcceptedOptionals.includes(`block-${block.id}`)) continue;
        if (!block.taxable) continue;
        const areas2 = block.roomBuilderData?.areaResults || [];
        const rooms2 = block.roomBuilderData?.rooms || [];
        const unacceptedAreaIds2 = areas2
          .filter((a: any) => {
            const isOpt = a.isOptional || (rooms2.find((r: any) => r.id === a.roomId) as any)?.isOptional;
            if (!isOpt) return false;
            return !cvAcceptedOptionalAreas.includes(`${block.id}:area:${a.roomId}`);
          })
          .map((a: any) => `${block.id}:area:${a.roomId}`);
        if (unacceptedAreaIds2.length > 0) {
          const excl2 = calcOptionalAreaTotals(block, unacceptedAreaIds2);
          optAreaTaxableExclCents += Math.round(excl2.grandTotal * 100);
        }
      }
    }
    let contractorHiddenTaxableCents = 0;
    {
      const chAreas2 = contractorHiddenAreas;
      if (chAreas2.length > 0) {
        const allBlks2 = doc.content?.productionRateBlocks || [];
        for (const block of allBlks2) {
          if (block.isOptional && !cvAcceptedOptionals.includes(`block-${block.id}`)) continue;
          if (!block.taxable) continue;
          const excl = calcContractorHiddenTotals(block, chAreas2);
          contractorHiddenTaxableCents += Math.round(excl.grandTotal * 100);
        }
      }
    }
    const taxableBeforeDiscount = taxableTotal + taxableBlocksTotal + optTaxable - excludedTaxableCents - optAreaTaxableExclCents - contractorHiddenTaxableCents;
    const taxableAfterDiscount = taxableBeforeDiscount > 0 && subtotalBeforeDiscount > 0
      ? Math.round(taxableBeforeDiscount * (subtotal / subtotalBeforeDiscount))
      : taxableBeforeDiscount;
    const taxAmount = taxRate > 0 ? Math.round(taxableAfterDiscount * taxRate / 100) : 0;
    const grandTotal = subtotal + taxAmount + signedCOTotal;
    return { subtotal, taxAmount, grandTotal, discountCents, allDiscounts, subtotalBeforeDiscount, effectiveBaseForPkg };
  }, [doc, cvSelectedPkgId, cvAcceptedOptionals, cvAcceptedOptionalAreas, cvExcludedSurfaces, changeOrders, taxRate, globalPackagesForDetail, contractorHiddenAreas, contractorHiddenItems]);
  const cvEffectiveTotal = cvTotals.grandTotal;

  // Calculate total paid and remaining balance
  // For proposals/estimates, use payments from the linked invoice
  const effectivePayments = (doc?.type === 'proposal' || doc?.type === 'estimate') 
    ? linkedInvoicePayments 
    : payments;
  const totalPaid = effectivePayments?.reduce((sum, p) => sum + p.amount, 0) || 0;
  const remainingBalance = (doc?.totalAmount || 0) - totalPaid;
  
  // Calculate invoice payment status
  const getInvoicePaymentStatus = () => {
    if (!doc || doc.type !== 'invoice') return null;
    if (remainingBalance <= 0) return { label: 'Paid', color: 'bg-green-500' };
    if (totalPaid > 0) return { label: 'Partially Paid', color: 'bg-orange-500' };
    return { label: 'Open', color: 'bg-blue-500' };
  };
  const invoicePaymentStatus = getInvoicePaymentStatus();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [docId]);

  // Initialize Request Payment dialog values when it opens - pre-fill from templates
  useEffect(() => {
    if (showRequestPaymentDialog && doc) {
      const amountToRequest = remainingBalance > 0 ? remainingBalance : (doc.totalAmount || 0);
      setRequestPaymentAmount((amountToRequest / 100).toFixed(2));
      setPaymentSendTiming('now');
      setPaymentScheduledDate('');
      setPaymentScheduledTime('');
      const isOPPay = settings?.phoneProvider === 'openphone';
      const hasPhonePay = isOPPay
        ? !!(settings?.openphoneApiKey && settings?.openphonePhoneNumber)
        : !!(settings?.twilioAccountSid && settings?.twilioAuthToken && (settings?.twilioPhoneNumber || settings?.twilioMessagingServiceSid));
      setSendPaymentViaSms(!!(hasPhonePay && doc.contact?.phone));
      setSendPaymentViaEmail(!!((settings?.googleEmail || settings?.smtpConnectedAt) && doc.contact?.email));
      const portalUrl = (() => {
        if (!doc.publicToken) return '';
        const docTypeSlug = doc.type === 'change_order' ? 'change-order' : doc.type;
        if (settings?.customDomain && settings?.customDomainVerified) {
          return `https://${settings.customDomain}/${docTypeSlug}/${doc.publicToken}`;
        }
        const companySlug = settings?.bookingSlug;
        if (companySlug) {
          return `${window.location.origin}/${companySlug}/${docTypeSlug}/${doc.publicToken}`;
        }
        return `${window.location.origin}/portal/document/${doc.publicToken}`;
      })();
      const pmtTagVars = {
        contactName: doc.contact.name,
        contactPhone: doc.contact.phone,
        contactEmail: doc.contact.email,
        companyName: settings?.companyName || '',
        companyPhone: (settings?.phoneProvider === 'openphone' ? settings?.openphonePhoneNumber : settings?.twilioPhoneNumber) || settings?.phone || '',
        companyEmail: settings?.googleEmail || settings?.smtpFromEmail || settings?.smtpUser || settings?.email || '',
        documentLink: portalUrl,
        amount: `$${(amountToRequest / 100).toFixed(2)}`,
        documentType: doc.type.replace('_', ' '),
        reviewLink: settings?.reviewLink || '',
      };
      const template = msgTemplates?.find(t => t.slug === 'payment_request');
      if (template) {
        setRequestPaymentSmsMessage(template.content ? applyTemplateTags(template.content, pmtTagVars) : '');
        setRequestPaymentEmailMessage(template.emailContent ? applyTemplateTags(template.emailContent, pmtTagVars) : '');
      } else {
        setRequestPaymentSmsMessage('');
        setRequestPaymentEmailMessage('');
      }
    }
  }, [showRequestPaymentDialog, doc, settings, remainingBalance, msgTemplates]);

  // Initialize Receive Payment dialog values when it opens
  useEffect(() => {
    if (showPaymentDialog && doc) {
      const depositSettings = doc.content?.paymentSettings;
      const hasDeposit = depositSettings?.depositRequired && depositSettings?.depositAmount > 0;
      const noPaymentsYet = !effectivePayments || effectivePayments.length === 0;

      if (hasDeposit && noPaymentsYet) {
        const depositAmountCents = depositSettings.depositType === 'percentage'
          ? Math.round((doc.totalAmount || 0) * (depositSettings.depositAmount / 100))
          : Math.round(depositSettings.depositAmount * 100);
        setPaymentAmount((depositAmountCents / 100).toFixed(2));
        setPaymentLabel('Down Payment');
      } else if (doc.requestedPaymentAmount && doc.requestedPaymentAmount > 0) {
        setPaymentAmount((doc.requestedPaymentAmount / 100).toFixed(2));
        setPaymentLabel('Payment');
      } else {
        const amountToReceive = remainingBalance > 0 ? remainingBalance : (doc.totalAmount || 0);
        setPaymentAmount((amountToReceive / 100).toFixed(2));
        setPaymentLabel('Payment');
      }
      setNotifyCustomer(true);
    }
  }, [showPaymentDialog, doc, remainingBalance, effectivePayments]);

  // Initialize Send Document dialog values when it opens - pre-fill from templates
  useEffect(() => {
    if (showSendOptionsDialog && doc) {
      const isOP = settings?.phoneProvider === 'openphone';
      const hasPhone = isOP
        ? !!(settings?.openphoneApiKey && settings?.openphonePhoneNumber)
        : !!(settings?.twilioAccountSid && settings?.twilioAuthToken && (settings?.twilioPhoneNumber || settings?.twilioMessagingServiceSid));
      setSendDocViaSms(!!(hasPhone && doc.contact?.phone));
      setSendDocViaNativeSms(!!(userTier !== 'elite' && !hasPhone && doc.contact?.phone));
      setSendDocViaEmail(!!((settings?.googleEmail || settings?.smtpConnectedAt) && doc.contact?.email));
      setSendTiming('now');
      setScheduledDate('');
      setScheduledTime('');
      const docIsResend = !['draft', 'created'].includes(doc.status);
      const portalUrl = (() => {
        if (!doc.publicToken) return '';
        const docTypeSlug = doc.type === 'change_order' ? 'change-order' : doc.type;
        if (settings?.customDomain && settings?.customDomainVerified) {
          return `https://${settings.customDomain}/${docTypeSlug}/${doc.publicToken}`;
        }
        const companySlug = settings?.bookingSlug;
        if (companySlug) {
          return `${window.location.origin}/${companySlug}/${docTypeSlug}/${doc.publicToken}`;
        }
        return `${window.location.origin}/portal/document/${doc.publicToken}`;
      })();
      const docTypeLinks: Record<string, string> = { proposal: '', invoice: '', estimate: '', change_order: '' };
      docTypeLinks[doc.type] = portalUrl;
      const tagVars = {
        contactName: doc.contact.name,
        contactPhone: doc.contact.phone,
        contactEmail: doc.contact.email,
        companyName: settings?.companyName || '',
        companyPhone: (settings?.phoneProvider === 'openphone' ? settings?.openphonePhoneNumber : settings?.twilioPhoneNumber) || settings?.phone || '',
        companyEmail: settings?.googleEmail || settings?.smtpFromEmail || settings?.smtpUser || settings?.email || '',
        documentLink: portalUrl,
        amount: doc.totalAmount ? `$${(doc.totalAmount / 100).toFixed(2)}` : '',
        documentType: doc.type.replace('_', ' '),
        reviewLink: settings?.reviewLink || '',
        proposalLink: docTypeLinks.proposal || portalUrl,
        invoiceLink: docTypeLinks.invoice || portalUrl,
        estimateLink: docTypeLinks.estimate || portalUrl,
        changeOrderLink: docTypeLinks.change_order || portalUrl,
        crewLead: teamMembersData?.find(m => m.role === 'lead')?.name || '',
        salesRep: teamMembersData?.find(m => m.role === 'sales')?.name || '',
        crewMember: teamMembersData?.find(m => m.role === 'crew')?.name || '',
      };
      const updatedTemplate = docIsResend ? msgTemplates?.find(t => t.slug === `sending_${doc.type}_updated`) : null;
      const baseTemplate = msgTemplates?.find(t => t.slug === `sending_${doc.type}`);
      const template = updatedTemplate || baseTemplate;
      const docTypeName = doc.type.replace('_', ' ');
      const companyName = settings?.companyName || '';

      // SMS
      if (template?.content) {
        setSendDocSmsMessage(applyTemplateTags(template.content, tagVars));
      } else if (docIsResend) {
        setSendDocSmsMessage(`Hi ${doc.contact.name}, here's the updated ${docTypeName} for your review.\n\nView and sign here: ${portalUrl}\n\nThank you for your business!\n\n${companyName}`);
      } else {
        setSendDocSmsMessage('');
      }

      // Email subject
      if (template?.emailSubject) {
        setSendDocEmailSubject(applyTemplateTags(template.emailSubject, tagVars));
      } else if (docIsResend) {
        setSendDocEmailSubject(`Updated ${docTypeName} from ${companyName || 'us'}`);
      } else {
        setSendDocEmailSubject('');
      }

      // Email body
      if (template?.emailContent) {
        setSendDocEmailMessage(applyTemplateTags(template.emailContent, tagVars));
      } else if (docIsResend) {
        setSendDocEmailMessage(`Hi ${doc.contact.name},\n\nHere's the updated ${docTypeName} for your review. Please take a look at the latest version.\n\nView and sign here: ${portalUrl}\n\nThank you for your business!\n\n${companyName}`);
      } else {
        setSendDocEmailMessage('');
      }
    }
  }, [showSendOptionsDialog, doc, settings, msgTemplates]);

  const handleMessage = () => {
    if (!doc?.contact.phone) return;
    if (hasInAppMessaging) {
      setLocation(`/messages?contactId=${doc.contactId}`);
    } else {
      window.location.href = `sms:${doc.contact.phone}`;
    }
  };

  const handleCallClick = () => {
    if (!doc?.contact.phone) return;
    if (isOpenPhoneProvider) {
      setShowOpenPhoneCallDialog(true);
    } else if (isTwilioConfigured) {
      setShowCallConfirm(true);
    } else {
      window.location.href = `tel:${doc.contact.phone}`;
    }
  };

  const { mutate: makeCallDoc, isPending: isCallingDoc } = useMakeCall();

  const handleCallConfirm = () => {
    setShowCallConfirm(false);
    if (!doc?.contact.phone) return;
    makeCallDoc({ to: doc.contact.phone, contactId: doc.contactId, contactName: doc.contact.name }, {
      onSuccess: (data: any) => {
        if (data.twoLeg) {
          toast({ title: "Calling your office first", description: `Answer to be connected to ${doc.contact.name}` });
        } else {
          toast({ title: "Call initiated", description: `Calling ${doc.contact.name}...` });
        }
      },
      onError: (err) => {
        toast({ title: "Failed to call", description: err.message, variant: "destructive" });
      }
    });
  };

  if (isLoading && !doc) {
    return <div className="flex h-screen items-center justify-center"><Loader2 className="w-10 h-10 animate-spin text-primary" /></div>;
  }

  if (!doc) {
    return <div className="p-8 text-center">Document not found</div>;
  }

  // Auto-created invoices stay immutable forever, even after Send (which
  // would otherwise flip status to 'sent' and re-enable edit gates).
  const isAutoCreatedInvoice = doc.type === 'invoice' && !!doc.sourceDocumentId;
  const canEdit = !doc.signature && doc.status !== 'accepted' && !isAutoCreatedInvoice;

  const handleStatusChange = (status: string) => {
    updateDoc({ id: docId, data: { status } }, {
      onSuccess: () => toast({ title: "Status updated", description: `Document marked as ${status}` })
    });
  };

  const handleSign = () => {
    if (sigPad.current) {
      if (sigPad.current.isEmpty()) {
        toast({ title: "Error", description: "Please provide a signature", variant: "destructive" });
        return;
      }
      const signatureData = sigPad.current.toDataURL();
      signDoc({ id: docId, signature: signatureData, acceptedOptionalItems: cvAcceptedOptionals, acceptedOptionalAreas: cvAcceptedOptionalAreas, excludedSurfaces: cvExcludedSurfaces }, {
        onSuccess: () => {
          toast({ title: "Document Signed", description: "The document has been successfully signed." });
        }
      });
    }
  };

  // Calculate valid through date (30 days from creation)
  const validThroughDate = doc.createdAt ? addDays(new Date(doc.createdAt), 30) : null;
  const isProposalOrEstimate = ['proposal', 'estimate'].includes(doc.type);


  const handleSignCOInModal = async () => {
    if (!selectedChangeOrder || !coSigPad.current) return;
    
    if (coSigPad.current.isEmpty()) {
      toast({ title: "Signature Required", description: "Please sign before accepting", variant: "destructive" });
      return;
    }
    
    setIsSigningCO(true);
    const signatureData = coSigPad.current.toDataURL();
    
    try {
      const res = await fetch(`/api/documents/${selectedChangeOrder.id}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ signature: signatureData })
      });
      if (!res.ok) throw new Error('Failed to sign');
      
      queryClient.invalidateQueries({ queryKey: ['/api/documents', docId, 'change-orders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/documents', docId] });
      toast({ title: "Signed", description: "Change order accepted and signed" });
      setShowChangeOrderPopup(false);
    } catch (err) {
      toast({ title: "Error", description: "Failed to sign change order", variant: "destructive" });
    } finally {
      setIsSigningCO(false);
    }
  };


  // Generate public portal link - use friendly URL when company slug is available
  const portalLink = (() => {
    if (!doc.publicToken) return null;
    const docTypeSlug = doc.type === 'change_order' ? 'change-order' : doc.type;
    if (settings?.customDomain && settings?.customDomainVerified) {
      return `https://${settings.customDomain}/${docTypeSlug}/${doc.publicToken}`;
    }
    const companySlug = settings?.bookingSlug;
    if (companySlug) {
      return `${window.location.origin}/${companySlug}/${docTypeSlug}/${doc.publicToken}`;
    }
    return `${window.location.origin}/portal/document/${doc.publicToken}`;
  })();

  const isOpenPhoneProvider = settings?.phoneProvider === 'openphone';
  const isOpenPhoneConfigured = isOpenPhoneProvider && !!settings?.openphonePhoneNumber;
  const isTwilioConfigured = !isOpenPhoneProvider && !!settings?.twilioAccountSid && !!settings?.twilioAuthToken && !!settings?.twilioPhoneNumber;
  const hasOfficePhone = !!settings?.twilioOfficePhone;
  const hasInAppMessaging = userTier === 'elite' && (isTwilioConfigured || isOpenPhoneConfigured);
  const canSendSmsCheck = isOpenPhoneProvider
    ? !!(settings?.openphoneApiKey && settings?.openphonePhoneNumber)
    : !!(settings?.twilioAccountSid && settings?.twilioAuthToken && (settings?.twilioPhoneNumber || settings?.twilioMessagingServiceSid));

  const handleSendViaSms = () => {
    if (!canSendSmsCheck) {
      toast({ 
        title: "Phone not configured", 
        description: "Please set up your phone integration in Settings > Integrations",
        variant: "destructive"
      });
      return;
    }

    if (!portalLink) {
      toast({ 
        title: "Document not ready", 
        description: "Please try again in a moment",
        variant: "destructive"
      });
      return;
    }
    
    const message = `Hi ${doc.contact.name}, here's your ${doc.type.replace('_', ' ')} from ${settings?.companyName || 'us'}. View and sign here: ${portalLink}`;
    
    const optimisticMsg: any = {
      id: -(Date.now()),
      userId: '',
      contactId: doc.contactId,
      phoneNumber: doc.contact.phone,
      type: 'sms',
      direction: 'outbound',
      content: message,
      isRead: true,
      timestamp: new Date().toISOString(),
      messageSid: null,
      _optimistic: true,
    };
    const commsCacheKey = ['/api/communications', doc.contactId];
    queryClient.setQueryData(commsCacheKey, (old: any[] | undefined) => {
      const arr = Array.isArray(old) ? old : [];
      return [...arr, optimisticMsg];
    });
    queryClient.setQueryData<any[]>(
      ['/api/communications/conversation-contacts'],
      (old) => {
        if (!Array.isArray(old)) return old;
        const updated = old.map((c: any) =>
          c.id === doc.contactId
            ? { ...c, last_message: message, last_message_time: new Date().toISOString(), last_message_direction: 'outbound', last_message_type: 'sms' }
            : c
        );
        updated.sort((a: any, b: any) => new Date(b.last_message_time || 0).getTime() - new Date(a.last_message_time || 0).getTime());
        return updated;
      }
    );

    sendSms({
      to: doc.contact.phone,
      body: message,
      contactId: doc.contactId,
    }, {
      onSuccess: () => {
        toast({ title: "Sent!", description: `${doc.type.replace('_', ' ')} link sent to ${doc.contact.name}` });
        handleStatusChange('sent');
        setShowSmsDialog(false);
        setShowSendOptionsDialog(false);
        queryClient.invalidateQueries({ queryKey: commsCacheKey });
      },
      onError: (err) => {
        queryClient.setQueryData(commsCacheKey, (old: any[] | undefined) => {
          const arr = Array.isArray(old) ? old : [];
          return arr.filter((m: any) => m.id !== optimisticMsg.id);
        });
        toast({ title: "Failed to send", description: err.message, variant: "destructive" });
      }
    });
  };

  const handleSendViaEmail = () => {
    if (!settings?.googleEmail && !settings?.smtpConnectedAt) {
      toast({ 
        title: "Email not connected", 
        description: "Please connect Gmail or set up SMTP in Integrations to send emails",
        variant: "destructive"
      });
      return;
    }

    if (!doc.contact.email) {
      toast({ 
        title: "No email address", 
        description: "This contact doesn't have an email address",
        variant: "destructive"
      });
      return;
    }

    if (!portalLink) {
      toast({ 
        title: "Document not ready", 
        description: "Please try again in a moment",
        variant: "destructive"
      });
      return;
    }

    const docTypeName = doc.type.replace('_', ' ');
    const subject = `Your ${docTypeName} from ${settings?.companyName || 'us'}`;
    const body = `Hi ${doc.contact.name},\n\nPlease find your ${docTypeName} ready for review.\n\nThank you for your business!\n\n${settings?.companyName || ''}`;
    
    sendEmail({
      to: doc.contact.email,
      subject,
      body,
      fromName: settings?.companyName || undefined,
      ctaText: `View Your ${docTypeName.charAt(0).toUpperCase() + docTypeName.slice(1)}`,
      ctaUrl: portalLink,
      contactId: doc.contactId,
    }, {
      onSuccess: () => {
        toast({ title: "Email Sent!", description: `${docTypeName} sent to ${doc.contact.email}` });
        handleStatusChange('sent');
        setShowEmailDialog(false);
        setShowSendOptionsDialog(false);
      },
      onError: (err) => {
        toast({ title: "Failed to send email", description: err.message, variant: "destructive" });
      }
    });
  };

  const getDefaultPaymentSmsMessage = () => {
    const amount = requestPaymentAmount || (remainingBalance > 0 ? (remainingBalance / 100).toFixed(2) : "0.00");
    const invoiceLink = portalLink || '';
    return `Hi ${doc.contact.name}, you have a payment of $${amount} due for Invoice #${doc.documentNumber || doc.id}.${invoiceLink ? `\n\nView your invoice here: ${invoiceLink}` : ''}\n\nThank you! - ${settings?.companyName || 'Your Service Provider'}`;
  };

  const getDefaultPaymentEmailMessage = () => {
    const amount = requestPaymentAmount || (remainingBalance > 0 ? (remainingBalance / 100).toFixed(2) : "0.00");
    const invoiceLink = portalLink || '';
    return `Hi ${doc.contact.name},\n\nYou have a payment of $${amount} due for Invoice #${doc.documentNumber || doc.id}.${invoiceLink ? `\n\nView your invoice here: ${invoiceLink}` : ''}\n\nThank you!\n\n${settings?.companyName || ''}`;
  };

  const tagVars = {
    contactName: doc.contact.name,
    contactPhone: doc.contact.phone,
    contactEmail: doc.contact.email,
    companyName: settings?.companyName || '',
    companyPhone: (settings?.phoneProvider === 'openphone' ? settings?.openphonePhoneNumber : settings?.twilioPhoneNumber) || settings?.phone || '',
    companyEmail: settings?.googleEmail || settings?.smtpFromEmail || settings?.smtpUser || settings?.email || '',
    documentLink: portalLink || '',
    amount: doc.totalAmount ? `$${(doc.totalAmount / 100).toFixed(2)}` : '',
    documentType: doc.type.replace('_', ' '),
    reviewLink: settings?.reviewLink || '',
    crewLead: teamMembersData?.find(m => m.role === 'lead')?.name || '',
    salesRep: teamMembersData?.find(m => m.role === 'sales')?.name || '',
    crewMember: teamMembersData?.find(m => m.role === 'crew')?.name || '',
  };

  // Resend detection: if the doc has been sent before (status moved past draft/created), treat as an updated version
  const isResend = !!doc && !['draft', 'created'].includes(doc.status);

  const getDefaultDocSmsMessage = () => {
    const updatedTpl = isResend ? msgTemplates?.find(t => t.slug === `sending_${doc.type}_updated`) : null;
    const template = updatedTpl || msgTemplates?.find(t => t.slug === `sending_${doc.type}`);
    if (template?.content) return applyTemplateTags(template.content, tagVars);
    const docTypeName = doc.type.replace('_', ' ');
    if (isResend) {
      return `Hi ${doc.contact.name}, here's the updated ${docTypeName} for your review.\n\nView and sign here: ${portalLink}\n\nThank you for your business!\n\n${settings?.companyName || ''}`;
    }
    return `Hi ${doc.contact.name}, please find your ${docTypeName} ready for review.\n\nView and sign here: ${portalLink}\n\nThank you for your business!\n\n${settings?.companyName || ''}`;
  };

  const getDefaultDocEmailMessage = () => {
    const updatedTpl = isResend ? msgTemplates?.find(t => t.slug === `sending_${doc.type}_updated`) : null;
    const template = updatedTpl || msgTemplates?.find(t => t.slug === `sending_${doc.type}`);
    if (template?.emailContent) return applyTemplateTags(template.emailContent, tagVars);
    const docTypeName = doc.type.replace('_', ' ');
    if (isResend) {
      return `Hi ${doc.contact.name},\n\nHere's the updated ${docTypeName} for your review. Please take a look at the latest version.\n\nView and sign here: ${portalLink}\n\nThank you for your business!\n\n${settings?.companyName || ''}`;
    }
    return `Hi ${doc.contact.name},\n\nPlease find your ${docTypeName} ready for review.\n\nView and sign here: ${portalLink}\n\nThank you for your business!\n\n${settings?.companyName || ''}`;
  };

  const getDefaultDocEmailSubject = () => {
    const updatedTpl = isResend ? msgTemplates?.find(t => t.slug === `sending_${doc.type}_updated`) : null;
    const template = updatedTpl || msgTemplates?.find(t => t.slug === `sending_${doc.type}`);
    if (template?.emailSubject) return applyTemplateTags(template.emailSubject, tagVars);
    const docTypeName = doc.type.replace('_', ' ');
    if (isResend) {
      return `Updated ${docTypeName} from ${settings?.companyName || 'us'}`;
    }
    return `Your ${docTypeName} from ${settings?.companyName || 'us'}`;
  };

  const handleSendDocument = async () => {
    if (!sendDocViaSms && !sendDocViaEmail) {
      toast({ 
        title: "Select delivery method", 
        description: "Please select at least one way to send the document (SMS or Email)",
        variant: "destructive"
      });
      return;
    }

    // Snapshot current content as the published version so the customer sees what we're sending.
    if (doc && doc.type !== 'invoice') {
      const ok = await publishDocument(doc.id);
      if (!ok) return;
    }

    let smsSuccess = false;
    let emailSuccess = false;
    const docTypeName = doc.type.replace('_', ' ');

    // Send to primary contact
    if (sendDocViaSms && canSendSmsCheck && doc.contact.phone) {
      const smsMessage = sendDocSmsMessage || getDefaultDocSmsMessage();
      const optimisticMsg: any = {
        id: -(Date.now()),
        userId: '',
        contactId: doc.contactId,
        phoneNumber: doc.contact.phone,
        type: 'sms',
        direction: 'outbound',
        content: smsMessage,
        isRead: true,
        timestamp: new Date().toISOString(),
        messageSid: null,
        _optimistic: true,
      };
      const commsCacheKey = ['/api/communications', doc.contactId];
      queryClient.setQueryData(commsCacheKey, (old: any[] | undefined) => {
        const arr = Array.isArray(old) ? old : [];
        return [...arr, optimisticMsg];
      });
      queryClient.setQueryData<any[]>(
        ['/api/communications/conversation-contacts'],
        (old) => {
          if (!Array.isArray(old)) return old;
          const updated = old.map((c: any) =>
            c.id === doc.contactId
              ? { ...c, last_message: smsMessage, last_message_time: new Date().toISOString(), last_message_direction: 'outbound', last_message_type: 'sms' }
              : c
          );
          updated.sort((a: any, b: any) => new Date(b.last_message_time || 0).getTime() - new Date(a.last_message_time || 0).getTime());
          return updated;
        }
      );
      try {
        await new Promise((resolve, reject) => {
          sendSms({
            to: doc.contact.phone,
            body: smsMessage,
            contactId: doc.contactId,
          }, {
            onSuccess: () => {
              queryClient.invalidateQueries({ queryKey: commsCacheKey });
              resolve(true);
            },
            onError: (err) => reject(err),
          });
        });
        smsSuccess = true;
      } catch (err: any) {
        queryClient.setQueryData(commsCacheKey, (old: any[] | undefined) => {
          const arr = Array.isArray(old) ? old : [];
          return arr.filter((m: any) => m.id !== optimisticMsg.id);
        });
        toast({ title: "Failed to send SMS", description: err.message, variant: "destructive" });
      }
    }

    if (sendDocViaEmail && (settings?.googleEmail || settings?.smtpConnectedAt) && doc.contact.email) {
      const subject = sendDocEmailSubject || getDefaultDocEmailSubject();
      const emailBody = sendDocEmailMessage || getDefaultDocEmailMessage();
      const docTypeName = doc.type.replace('_', ' ');
      try {
        await new Promise((resolve, reject) => {
          sendEmail({
            to: doc.contact.email,
            subject,
            body: emailBody,
            fromName: settings?.companyName || undefined,
            ctaText: `View Your ${docTypeName.charAt(0).toUpperCase() + docTypeName.slice(1)}`,
            ctaUrl: portalLink || undefined,
            contactId: doc.contactId,
          }, {
            onSuccess: () => resolve(true),
            onError: (err) => reject(err),
          });
        });
        emailSuccess = true;
      } catch (err: any) {
        toast({ title: "Failed to send email", description: err.message, variant: "destructive" });
      }
    }

    // Send to additional recipients if enabled
    if (includeAdditionalRecipients && projectRecipients && projectRecipients.length > 0) {
      for (const recipient of projectRecipients) {
        if (sendDocViaSms && canSendSmsCheck && recipient.phone) {
          const smsMessage = sendDocSmsMessage || getDefaultDocSmsMessage();
          const recipientSms = smsMessage.replace(doc.contact.name, recipient.name);
          try {
            await new Promise((resolve, reject) => {
              sendSms({
                to: recipient.phone!,
                body: recipientSms,
                contactId: recipient.contactId || undefined,
              }, {
                onSuccess: () => resolve(true),
                onError: (err) => reject(err),
              });
            });
          } catch (err: any) {
            console.error(`Failed to send SMS to recipient ${recipient.name}:`, err);
          }
        }
        if (sendDocViaEmail && (settings?.googleEmail || settings?.smtpConnectedAt) && recipient.email) {
          const subject = sendDocEmailSubject || getDefaultDocEmailSubject();
          const emailBody = sendDocEmailMessage || getDefaultDocEmailMessage();
          const recipientBody = emailBody.replace(doc.contact.name, recipient.name);
          const docTypeName = doc.type.replace('_', ' ');
          try {
            await new Promise((resolve, reject) => {
              sendEmail({
                to: recipient.email!,
                subject,
                body: recipientBody,
                fromName: settings?.companyName || undefined,
                ctaText: `View Your ${docTypeName.charAt(0).toUpperCase() + docTypeName.slice(1)}`,
                ctaUrl: portalLink || undefined,
                contactId: recipient.contactId || undefined,
              }, {
                onSuccess: () => resolve(true),
                onError: (err) => reject(err),
              });
            });
          } catch (err: any) {
            console.error(`Failed to send email to recipient ${recipient.name}:`, err);
          }
        }
      }
    }

    if (smsSuccess || emailSuccess) {
      const methods = [];
      if (smsSuccess) methods.push("SMS");
      if (emailSuccess) methods.push("Email");
      const recipientCount = includeAdditionalRecipients && projectRecipients?.length 
        ? ` + ${projectRecipients.length} additional recipient${projectRecipients.length > 1 ? 's' : ''}`
        : '';
      toast({ title: "Document Sent!", description: `Sent via ${methods.join(" and ")}${recipientCount}` });
      handleStatusChange('sent');
      setShowSendOptionsDialog(false);
      setSendDocSmsMessage("");
      setSendDocEmailMessage("");
      setSendDocEmailSubject("");
    }
  };

  const handleSendPaymentRequest = async () => {
    const amount = requestPaymentAmount || (remainingBalance > 0 ? (remainingBalance / 100).toFixed(2) : "0.00");
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast({ 
        title: "Invalid amount", 
        description: "Please enter a valid payment amount greater than zero",
        variant: "destructive"
      });
      return;
    }

    if (!sendPaymentViaSms && !sendPaymentViaEmail) {
      toast({ 
        title: "Select delivery method", 
        description: "Please select at least one way to send the payment request (SMS or Email)",
        variant: "destructive"
      });
      return;
    }

    if (paymentSendTiming === 'scheduled' && (!paymentScheduledDate || !paymentScheduledTime)) {
      toast({ title: "Please select a date and time", variant: "destructive" });
      return;
    }

    if (paymentSendTiming === 'working_hours' || paymentSendTiming === 'scheduled') {
      let scheduledAt: string | null = null;
      if (paymentSendTiming === 'scheduled') {
        scheduledAt = new Date(`${paymentScheduledDate}T${paymentScheduledTime}`).toISOString();
      } else {
        try {
          const whRes = await fetch('/api/next-business-window', { credentials: 'include' });
          const whData = await whRes.json();
          scheduledAt = whData?.nextBusinessWindow || null;
        } catch { /* fall through to send now */ }
      }

      if (scheduledAt) {
        try {
          const smsMessage = sendPaymentViaSms && doc.contact.phone ? (requestPaymentSmsMessage || getDefaultPaymentSmsMessage()) : null;
          const emailSubject = sendPaymentViaEmail && doc.contact.email ? `Payment Request - Invoice #${doc.documentNumber || doc.id} - ${settings?.companyName || ''}` : null;
          const emailBody = sendPaymentViaEmail && doc.contact.email ? (requestPaymentEmailMessage || getDefaultPaymentEmailMessage()) : null;

          const schedRes = await fetch('/api/scheduled-messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              contactId: doc.contactId,
              phoneNumber: smsMessage ? doc.contact.phone : null,
              body: smsMessage,
              scheduledAt,
              emailTo: emailBody ? doc.contact.email : null,
              emailSubject,
              emailBody,
              emailFromName: settings?.companyName || null,
              emailCtaText: emailBody ? 'View Invoice & Pay' : null,
              emailCtaUrl: emailBody ? (portalLink || null) : null,
            }),
          });
          if (!schedRes.ok) {
            const errData = await schedRes.json().catch(() => ({}));
            throw new Error(errData.message || 'Failed to schedule payment request');
          }

          try {
            const amountInCents = Math.round(parseFloat(amount) * 100);
            await fetch(`/api/documents/${doc.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ requestedPaymentAmount: amountInCents }),
            });
            queryClient.invalidateQueries({ queryKey: ['/api/documents/:id', doc.id] });
          } catch (err) {
            console.error('Failed to save requested payment amount:', err);
          }

          toast({ 
            title: paymentSendTiming === 'working_hours' ? "Queued for Working Hours" : "Payment Request Scheduled",
            description: paymentSendTiming === 'working_hours' 
              ? "Payment request will be sent during your next working hours window."
              : `Payment request scheduled for ${paymentScheduledDate} at ${paymentScheduledTime}.`
          });
          setShowRequestPaymentDialog(false);
          setRequestPaymentAmount("");
          setRequestPaymentSmsMessage("");
          setRequestPaymentEmailMessage("");
          setPaymentSendTiming('now');
          setPaymentScheduledDate('');
          setPaymentScheduledTime('');
          return;
        } catch (err: any) {
          toast({ title: "Failed to schedule", description: err.message, variant: "destructive" });
          return;
        }
      }
      // scheduledAt is null = currently within working hours, fall through to send immediately
    }

    let smsSuccess = false;
    let emailSuccess = false;

    if (sendPaymentViaSms && canSendSmsCheck && doc.contact.phone) {
      const smsMessage = requestPaymentSmsMessage || getDefaultPaymentSmsMessage();
      try {
        await new Promise((resolve, reject) => {
          sendSms({
            to: doc.contact.phone,
            body: smsMessage,
            contactId: doc.contactId,
          }, {
            onSuccess: () => resolve(true),
            onError: (err) => reject(err),
          });
        });
        smsSuccess = true;
      } catch (err: any) {
        toast({ title: "Failed to send SMS", description: err.message, variant: "destructive" });
      }
    }

    if (sendPaymentViaEmail && (settings?.googleEmail || settings?.smtpConnectedAt) && doc.contact.email) {
      const subject = `Payment Request - Invoice #${doc.documentNumber || doc.id} - ${settings?.companyName || ''}`;
      const emailBody = requestPaymentEmailMessage || getDefaultPaymentEmailMessage();
      try {
        await new Promise((resolve, reject) => {
          sendEmail({
            to: doc.contact.email,
            subject,
            body: emailBody,
            fromName: settings?.companyName || undefined,
            ctaText: 'View Invoice & Pay',
            ctaUrl: portalLink || undefined,
            contactId: doc.contactId,
          }, {
            onSuccess: () => resolve(true),
            onError: (err) => reject(err),
          });
        });
        emailSuccess = true;
      } catch (err: any) {
        toast({ title: "Failed to send email", description: err.message, variant: "destructive" });
      }
    }

    if (smsSuccess || emailSuccess) {
      const methods = [];
      if (smsSuccess) methods.push("SMS");
      if (emailSuccess) methods.push("Email");
      
      try {
        const amountInCents = Math.round(parseFloat(amount) * 100);
        await fetch(`/api/documents/${doc.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ requestedPaymentAmount: amountInCents }),
        });
        queryClient.invalidateQueries({ queryKey: ['/api/documents/:id', doc.id] });
      } catch (err) {
        console.error('Failed to save requested payment amount:', err);
      }

      toast({ title: "Payment Request Sent!", description: `Sent via ${methods.join(" and ")}` });
      handleStatusChange('sent');
      setShowRequestPaymentDialog(false);
      setRequestPaymentAmount("");
      setRequestPaymentSmsMessage("");
      setRequestPaymentEmailMessage("");
      setPaymentSendTiming('now');
    }
  };

  const handleRequestPaymentViaEmail = () => {
    if (!settings?.googleEmail && !settings?.smtpConnectedAt) {
      toast({ 
        title: "Email not connected", 
        description: "Please connect Gmail or set up SMTP in Integrations to send emails",
        variant: "destructive"
      });
      return;
    }

    if (!doc.contact.email) {
      toast({ 
        title: "No email address", 
        description: "This contact doesn't have an email address",
        variant: "destructive"
      });
      return;
    }

    const amount = requestPaymentAmount || (remainingBalance > 0 ? (remainingBalance / 100).toFixed(2) : "0.00");
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast({ 
        title: "Invalid amount", 
        description: "Please enter a valid payment amount greater than zero",
        variant: "destructive"
      });
      return;
    }

    const subject = `Payment Request - Invoice #${doc.documentNumber || doc.id} - ${settings?.companyName || ''}`;
    const body = `Hi ${doc.contact.name},\n\nYou have a payment of $${amount} due for Invoice #${doc.documentNumber || doc.id}.\n\nPlease contact us to arrange payment.\n\nThank you!\n\n${settings?.companyName || ''}`;
    
    sendEmail({
      to: doc.contact.email,
      subject,
      body,
      fromName: settings?.companyName || undefined,
      ctaText: 'View Invoice & Pay',
      ctaUrl: portalLink || undefined,
      contactId: doc.contactId,
    }, {
      onSuccess: () => {
        toast({ title: "Payment Request Sent!", description: `Payment request sent to ${doc.contact.email}` });
        setShowRequestPaymentDialog(false);
        setRequestPaymentAmount("");
      },
      onError: (err) => {
        toast({ title: "Failed to send email", description: err.message, variant: "destructive" });
      }
    });
  };

  const handleRequestPayment = () => {
    if (!canSendSmsCheck && !(settings?.googleEmail || settings?.smtpConnectedAt)) {
      toast({ 
        title: "Phone or email not configured", 
        description: "Please set up a phone or email integration in Settings > Integrations",
        variant: "destructive"
      });
      return;
    }

    const amount = requestPaymentAmount || (remainingBalance > 0 ? (remainingBalance / 100).toFixed(2) : "0.00");
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast({ 
        title: "Invalid amount", 
        description: "Please enter a valid payment amount greater than zero",
        variant: "destructive"
      });
      return;
    }
    const message = `Hi ${doc.contact.name}, you have a payment of $${amount} due for Invoice #${doc.documentNumber || doc.id}. Please contact us to arrange payment. Thank you! - ${settings?.companyName || 'Your Service Provider'}`;
    
    sendSms({
      to: doc.contact.phone,
      body: message,
      contactId: doc.contactId,
    }, {
      onSuccess: () => {
        toast({ title: "Payment Request Sent!", description: `Payment request sent to ${doc.contact.name}` });
        setShowRequestPaymentDialog(false);
        setRequestPaymentAmount("");
      },
      onError: (err) => {
        toast({ title: "Failed to send", description: err.message, variant: "destructive" });
      }
    });
  };

  const handleCopyLink = async () => {
    if (!portalLink) {
      toast({ title: "Link not available", description: "Please try again in a moment", variant: "destructive" });
      return;
    }
    // IMPORTANT: copy first, synchronously within the user-gesture tick.
    // iOS WebKit (Safari + PWA) rejects clipboard writes that happen after an
    // intervening `await` (e.g. a network call) because the gesture chain is broken.
    const ok = await copyToClipboard(portalLink);
    // Publish (draft→sent) BEFORE the success toast so the link is guaranteed to
    // open for the customer the moment we say "Link copied!". Custom-domain
    // portal links don't carry the owner's session cookie, so a still-draft doc
    // would otherwise return 404 even to the owner.
    const needsPublish = !!(doc && doc.type !== 'invoice' && !doc.publishedAt);
    let published = true;
    if (ok && needsPublish) {
      try {
        published = await publishDocument(doc!.id);
      } catch {
        published = false;
      }
    }
    if (!ok) {
      toast({ title: "Could not copy link", description: portalLink, variant: "destructive" });
    } else if (!published) {
      // publishDocument already shows its own destructive toast on failure.
      toast({ title: "Link copied, but not yet shareable", description: "Publishing failed — your customer may see 'not found' until you try again.", variant: "destructive" });
    } else {
      toast({ title: "Link copied!", description: "Share this link with your customer" });
    }
  };

  const handleCopyCOLink = async (co: Document) => {
    if (!co.publicToken) {
      toast({ title: "Link not available", description: "Change order doesn't have a public link", variant: "destructive" });
      return;
    }
    const companySlug = settings?.bookingSlug;
    const coPortalLink = (settings?.customDomain && settings?.customDomainVerified)
      ? `https://${settings.customDomain}/change-order/${co.publicToken}`
      : companySlug
        ? `${window.location.origin}/${companySlug}/change-order/${co.publicToken}`
        : `${window.location.origin}/portal/document/${co.publicToken}`;
    // Copy first within the user-gesture tick (iOS requirement). Then await
    // publish BEFORE the success toast so the link is guaranteed to open for
    // the customer the moment we say "Link copied!" — custom-domain portal
    // links don't carry the owner's session, so a draft would otherwise 404.
    const ok = await copyToClipboard(coPortalLink);
    let published = true;
    if (ok && !co.publishedAt) {
      try {
        published = await publishDocument(co.id);
      } catch {
        published = false;
      }
    }
    if (!ok) {
      toast({ title: "Could not copy link", description: coPortalLink, variant: "destructive" });
    } else if (!published) {
      toast({ title: "Link copied, but not yet shareable", description: "Publishing failed — your customer may see 'not found' until you try again.", variant: "destructive" });
    } else {
      toast({ title: "Link copied!", description: "Share this link with your customer" });
    }
  };

  const handleViewPDF = async () => {
    if (!doc || !settings) return;
    
    setIsGeneratingPDF(true);
    try {
      const isInvoice = doc.type === 'invoice';
      const docPkgEnabled = (doc.content as any)?.proposalPackagesEnabled;
      const hasPerProposalPkgs = docPkgEnabled === true && (doc.content as any)?.proposalPackagesData?.length > 0;
      const availableGlobalPkgs = proposalPackages || globalPackagesForDetail || [];
      const showPkgs = hasPerProposalPkgs || (docPkgEnabled === true && settings?.packagesEnabled && availableGlobalPkgs.length > 0);

      let pdfPackages: any[] | undefined;
      let pdfSelectedPkgId: number | undefined;
      if (showPkgs && !isInvoice) {
        pdfPackages = hasPerProposalPkgs
          ? (doc.content as any).proposalPackagesData
          : availableGlobalPkgs.map((p: any) => packageToSnapshot(p));
        pdfPackages = pdfPackages?.filter((p: any) => p.active !== false);
        pdfSelectedPkgId = cvSelectedPkgId || (doc.content as any)?.packageSnapshot?.id || (doc.content as any)?.selectedPackageId;
      }

      const pdfAcceptedOpts = customerView ? cvAcceptedOptionals : (doc.content as any)?.acceptedOptionalItems || undefined;

      const hiddenPhotoIds: number[] = (doc.content as any)?.hiddenDocumentPhotoIds || [];
      const visibleDocPhotos = docPhotos.filter((p: any) => !hiddenPhotoIds.includes(p.id));
      const pdfPhotos = (doc.content as any)?.includePhotosInPdf && visibleDocPhotos.length > 0 ? visibleDocPhotos : undefined;
      const pdfSourcePhotos = [
        ...((doc.content as any)?.includedSourcePhotos || []) as string[],
        ...((doc.content as any)?.includedCompanyCamPhotos || []) as string[],
      ].filter(Boolean);
      const pdfSourcePhotosArg = pdfSourcePhotos.length > 0 ? pdfSourcePhotos : undefined;

      const pdfBlob = await generateDocumentPDF(
        doc, 
        settings, 
        changeOrders || undefined,
        isInvoice ? undefined : (standardsTemplate?.enabled !== false ? (standardsTemplate?.content || undefined) : undefined),
        isInvoice ? undefined : (termsTemplate?.enabled !== false ? (termsTemplate?.content || undefined) : undefined),
        isInvoice ? payments : undefined,
        pdfPackages,
        pdfSelectedPkgId,
        pdfAcceptedOpts,
        pdfPhotos,
        pdfSourcePhotosArg
      );
      viewPDF(pdfBlob);
    } catch (error) {
      console.error('PDF generation failed:', error);
      toast({ 
        title: "PDF generation failed", 
        description: "Please try again", 
        variant: "destructive" 
      });
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  // Company details from settings
  const companyName = settings?.companyName || 'My Company';
  const companyAddress = settings?.address || '';
  const companyCityStateZip = [settings?.city, settings?.state, settings?.zipCode].filter(Boolean).join(', ');
  const companyEmail = settings?.email || '';
  const companyPhone = settings?.phone || '';
  const companyLogo = settings?.logo || '';
  const companyLicense = settings?.companyLicense || '';
  const companyTagline = settings?.tagline || '';
  const companySecondaryColor = settings?.secondaryColor || '';
  const cvTrustBadges: Array<{ id: string; label: string }> = (settings?.documentTrustBadges || []).filter((b: { id: string; label: string }) => b.label?.trim());
  const cvHeaderBgColor = companySecondaryColor || '#1e293b';
  const cvHeaderAccentColor = settings?.brandColor || '#3b82f6';

  const cvIsLightBg = (() => {
    const hex = cvHeaderBgColor.replace('#', '');
    if (!/^[0-9a-fA-F]{3,6}$/.test(hex)) return false;
    const full = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex;
    const r = parseInt(full.substring(0, 2), 16);
    const g = parseInt(full.substring(2, 4), 16);
    const b = parseInt(full.substring(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6;
  })();
  const cvTextColor = cvIsLightBg ? '#1a1a1a' : '#ffffff';
  const cvTextMuted = cvIsLightBg ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.6)';
  const cvTextSemiMuted = cvIsLightBg ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.8)';
  const cvBorderColor = cvIsLightBg ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.2)';
  const cvSubtleBg = cvIsLightBg ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.1)';

  return (
    <div className={cn("max-w-4xl mx-auto pb-24 space-y-6 sm:space-y-8 animate-in fade-in duration-300 overflow-x-hidden", customerView ? "px-0 pt-0" : "px-1.5 py-3 sm:p-6 lg:p-8")}>
      {/* Customer / Company View Toggle - at the top */}
      <div className="flex items-center justify-center">
        <div className="inline-flex items-center rounded-lg border bg-card p-1 gap-1" data-testid="view-mode-toggle">
          <button
            type="button"
            className={cn(
              "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              !customerView ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setCustomerView(false)}
            data-testid="button-company-view"
          >
            Company View
          </button>
          <button
            type="button"
            className={cn(
              "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              customerView ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setCustomerView(true)}
            data-testid="button-customer-view"
          >
            Customer View
          </button>
        </div>
      </div>

      {/* Branded header is now inside the customer view card below */}

      {/* Document header card - hidden in customer view */}
      {!customerView && <Card>
        <CardContent className="px-2 py-3 sm:p-4">
          {/* Line 1: Back button | Centered Name | 3-dot menu */}
          <div 
            className="flex items-center justify-between gap-2"
            data-testid="header-card-toggle"
          >
            <Button variant="ghost" size="icon" data-testid="button-back" onClick={() => {
              // Intent-based navigation: never trust window.history.back() here.
              // The Record Payment dialog and other in-page modals can leave stale
              // history entries, and deep-link launches make back() leave the app
              // entirely. Always go to the document's natural parent instead.
              if (doc.projectId) {
                setLocation(`/projects/${doc.projectId}`);
              } else if (doc.contactId) {
                setLocation(`/contacts/${doc.contactId}`);
              } else {
                setLocation('/documents');
              }
            }}>
              <ArrowLeft className="w-5 h-5" />
            </Button>

            <h1 className="text-2xl sm:text-3xl font-bold font-display truncate text-center flex-1 min-w-0">{doc.contact.name}</h1>

            <div className="relative" ref={(el) => { (window as any).__headerMenuAnchor = el; }}>
              <Button variant="ghost" size="icon" onClick={() => setShowHeaderActions(!showHeaderActions)} data-testid="button-header-menu">
                <MoreVertical className="w-5 h-5 text-muted-foreground" />
              </Button>
              {showHeaderActions && createPortal(
                <>
                  <div className="fixed inset-0 z-[9998]" onClick={() => setShowHeaderActions(false)} />
                  <div 
                    className="fixed z-[9999] bg-popover border rounded-lg shadow-lg py-1 min-w-[160px]"
                    style={{
                      top: ((window as any).__headerMenuAnchor?.getBoundingClientRect()?.bottom ?? 0) + 4,
                      right: window.innerWidth - ((window as any).__headerMenuAnchor?.getBoundingClientRect()?.right ?? 0),
                    }}
                  >
                    {(doc.type === 'proposal' || doc.type === 'estimate') && (
                      <button
                        type="button"
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted transition-colors"
                        onClick={() => { setShowHeaderActions(false); setShowCopyDialog(true); }}
                        data-testid="button-copy-document"
                      >
                        <Copy className="w-4 h-4" /> Copy Proposal
                      </button>
                    )}
                    {!doc.archived && !['accepted', 'paid'].includes(doc.status) && !(doc.type === 'invoice' && doc.sourceDocumentId) && (
                      <button
                        type="button"
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted transition-colors"
                        onClick={() => { setShowHeaderActions(false); setShowArchiveConfirm(true); }}
                        data-testid="button-archive-document"
                      >
                        <Archive className="w-4 h-4" /> Archive
                      </button>
                    )}
                    {doc.archived && doc.type !== 'change_order' && (
                      <button
                        type="button"
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted transition-colors"
                        onClick={() => { setShowHeaderActions(false); setShowRestoreConfirm(true); }}
                        data-testid="button-restore-document"
                      >
                        <RotateCcw className="w-4 h-4" /> Restore
                      </button>
                    )}
                    {!['accepted', 'paid'].includes(doc.status) && (
                      <button
                        type="button"
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-destructive hover:bg-muted transition-colors"
                        onClick={() => { setShowHeaderActions(false); setShowDeleteConfirm(true); }}
                        data-testid="button-delete-document"
                      >
                        <Trash2 className="w-4 h-4" /> Delete
                      </button>
                    )}
                  </div>
                </>,
                document.body
              )}
            </div>
          </div>

          {/* Document cards: Proposal (blue) + Invoice (green) — color-coded to match document list */}
          {(doc.type === 'proposal' || doc.type === 'estimate' || doc.type === 'invoice') ? (() => {
            const statusBadgeClass = (status: string) =>
              status === 'paid' ? 'bg-green-500' :
              status === 'accepted' ? 'bg-green-500' :
              status === 'sent' ? 'bg-orange-500' :
              status === 'viewed' ? 'bg-purple-500' :
              status === 'created' ? 'bg-blue-500' :
              'bg-gray-500';

            const isProposalCurrent = doc.type === 'proposal' || doc.type === 'estimate';
            const propDoc = isProposalCurrent ? doc : sourceProposal;
            const propId = isProposalCurrent ? doc.id : doc.sourceDocumentId;
            const propNumber = propDoc?.documentNumber ?? propId;
            const propTypeLabel = isProposalCurrent ? doc.type.replace('_', ' ') : 'proposal';

            const isInvoiceCurrent = doc.type === 'invoice';
            const invDoc = isInvoiceCurrent ? doc : linkedInvoice;
            const invId = isInvoiceCurrent ? doc.id : doc.linkedInvoiceId;
            const invNumber = invDoc?.documentNumber ?? invId;

            const baseCard = "flex items-start gap-3 p-3 rounded-lg border transition-all";

            const proposalContent = propId ? (
              <>
                <div className="p-2 rounded-md bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400 shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1 text-left">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-semibold text-sm capitalize">{propTypeLabel}</span>
                    <span className="text-xs text-muted-foreground">#{propNumber?.toString().padStart(6, '0')}</span>
                    {propDoc?.status && (
                      <Badge className={cn("text-[10px] h-4 px-1.5", statusBadgeClass(propDoc.status))}>
                        {propDoc.status.toUpperCase()}
                      </Badge>
                    )}
                  </div>
                  {isProposalCurrent && (doc.viewCount > 0 || doc.lastViewedAt || doc.signedAt) && (
                    <div className="flex items-center gap-x-2 gap-y-0.5 mt-1 text-xs text-muted-foreground flex-wrap">
                      {doc.signedAt && (
                        <span>Signed {format(new Date(doc.signedAt), "MMM d, yyyy")}</span>
                      )}
                      {doc.viewCount > 0 && (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                          onClick={(e) => { e.stopPropagation(); e.preventDefault(); setShowViewHistory(true); }}
                          data-testid="badge-view-count"
                        >
                          <Eye className="w-3 h-3" />
                          Viewed {doc.viewCount}×
                        </button>
                      )}
                      {doc.lastViewedAt && (
                        <span data-testid="text-last-viewed">
                          {format(new Date(doc.lastViewedAt), "MMM d, h:mm a")}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </>
            ) : null;

            const invoiceContent = invId ? (
              <>
                <div className="p-2 rounded-md bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400 shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1 text-left">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-semibold text-sm">Invoice</span>
                    <span className="text-xs text-muted-foreground">#{invNumber?.toString().padStart(6, '0')}</span>
                    {invDoc?.sourceDocumentId ? (
                      <Badge
                        variant="outline"
                        className="text-[10px] h-4 px-1.5 border-green-500 text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/40"
                        data-testid="badge-invoice-auto-created"
                      >
                        Auto-created
                      </Badge>
                    ) : invDoc?.status ? (
                      <Badge className={cn("text-[10px] h-4 px-1.5", statusBadgeClass(invDoc.status))}>
                        {invDoc.status.toUpperCase()}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                    {totalPaid > 0 && remainingBalance > 0 && (
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-orange-400 text-orange-600 dark:text-orange-400">
                        Partially Paid
                      </Badge>
                    )}
                    {totalPaid > 0 && remainingBalance <= 0 && (
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-green-500 text-green-600 dark:text-green-400">
                        Fully Paid
                      </Badge>
                    )}
                    {isInvoiceCurrent && doc.viewCount > 0 && (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setShowViewHistory(true); }}
                        data-testid="badge-view-count"
                      >
                        <Eye className="w-3 h-3" />
                        Viewed {doc.viewCount}×
                      </button>
                    )}
                    {isInvoiceCurrent && doc.lastViewedAt && (
                      <span data-testid="text-last-viewed">
                        {format(new Date(doc.lastViewedAt), "MMM d, h:mm a")}
                      </span>
                    )}
                  </div>
                </div>
              </>
            ) : null;

            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                {proposalContent && (
                  isProposalCurrent ? (
                    <div
                      className={cn(baseCard, "border-blue-300 dark:border-blue-800 bg-blue-50/40 dark:bg-blue-950/20 cursor-default")}
                      data-testid="card-proposal"
                    >
                      {proposalContent}
                    </div>
                  ) : (
                    <Link
                      href={`/documents/${propId}`}
                      className={cn(baseCard, "border-border hover:border-blue-300 dark:hover:border-blue-800 hover:bg-blue-50/40 dark:hover:bg-blue-950/20 cursor-pointer")}
                      onClick={(e) => e.stopPropagation()}
                      data-testid="link-proposal-card"
                    >
                      {proposalContent}
                    </Link>
                  )
                )}
                {invoiceContent && (
                  isInvoiceCurrent ? (
                    <div
                      className={cn(baseCard, "border-green-300 dark:border-green-800 bg-green-50/40 dark:bg-green-950/20 cursor-default")}
                      data-testid="card-invoice"
                    >
                      {invoiceContent}
                    </div>
                  ) : (
                    <Link
                      href={`/documents/${invId}`}
                      className={cn(baseCard, "border-border hover:border-green-300 dark:hover:border-green-800 hover:bg-green-50/40 dark:hover:bg-green-950/20 cursor-pointer")}
                      onClick={(e) => e.stopPropagation()}
                      data-testid="link-invoice-card"
                    >
                      {invoiceContent}
                    </Link>
                  )
                )}
              </div>
            );
          })() : (
            /* Fallback for change orders and other types — simple inline header */
            <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
              <span className="text-muted-foreground capitalize text-sm sm:text-base">{doc.type.replace('_', ' ')}</span>
              <span className="text-muted-foreground text-sm sm:text-base">#{(doc.documentNumber || doc.id).toString().padStart(6, '0')}</span>
              <Badge className={cn("text-xs sm:text-sm",
                doc.status === 'paid' ? 'bg-green-500' :
                doc.status === 'accepted' ? 'bg-green-500' :
                doc.status === 'sent' ? 'bg-orange-500' :
                doc.status === 'viewed' ? 'bg-purple-500' :
                doc.status === 'created' ? 'bg-blue-500' :
                'bg-gray-500'
              )}>
                {doc.status.toUpperCase()}
              </Badge>
            </div>
          )}

          {/* Draft / unpublished-changes banner (proposals, estimates, change orders) */}
          {doc.type !== 'invoice' && !doc.signature && (() => {
            const isPublished = !!doc.publishedAt;
            const updatedTs = doc.updatedAt ? new Date(doc.updatedAt).getTime() : 0;
            const publishedTs = doc.publishedAt ? new Date(doc.publishedAt).getTime() : 0;
            const hasUnpublishedEdits = isPublished && updatedTs > publishedTs + 2000;
            if (!isPublished) {
              return (
                <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 px-3 py-2 text-sm flex items-start justify-between gap-3" data-testid="banner-draft">
                  <div className="text-amber-900 dark:text-amber-200">
                    <strong>Draft — not shared yet.</strong> The customer can't see this until you send it or copy the link.
                  </div>
                  <Button size="sm" variant="outline" className="shrink-0" disabled={publishMutation.isPending} onClick={() => publishMutation.mutate(doc.id)} data-testid="button-publish-now">
                    Publish now
                  </Button>
                </div>
              );
            }
            if (hasUnpublishedEdits) {
              return (
                <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 px-3 py-2 text-sm flex items-start justify-between gap-3" data-testid="banner-unpublished-changes">
                  <div className="text-amber-900 dark:text-amber-200">
                    <strong>Unpublished changes.</strong> Customer is still seeing the version from {new Date(doc.publishedAt!).toLocaleString()}.
                  </div>
                  <Button size="sm" variant="outline" className="shrink-0" disabled={publishMutation.isPending} onClick={() => publishMutation.mutate(doc.id)} data-testid="button-publish-now">
                    Publish update
                  </Button>
                </div>
              );
            }
            return null;
          })()}

          {/* Row 1: Send, Copy Link, Call, Text, Mark Paid */}
          <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t">
            <Button size="sm" onClick={() => setShowSendOptionsDialog(true)} className="gap-1.5" data-testid="button-send-document">
              <Send className="w-3.5 h-3.5" />
              Send
            </Button>
            <Button size="sm" variant="outline" onClick={handleCopyLink} className="gap-1.5" data-testid="button-copy-link">
              <Link2 className="w-3.5 h-3.5" />
              Copy Link
            </Button>
            {userTier === 'elite' && (
              <>
                <Button size="sm" variant="outline" onClick={handleCallClick} className="px-2.5" data-testid="button-call-contact">
                  <Phone className="w-3.5 h-3.5" />
                </Button>
                <Button size="sm" variant="outline" onClick={handleMessage} className="px-2.5" data-testid="button-message-contact">
                  <MessageSquare className="w-3.5 h-3.5" />
                </Button>
              </>
            )}
            {doc.status === 'accepted' && (
              remainingBalance > 0 ? (
                <Button 
                  size="sm"
                  onClick={handleMarkAsPaid} 
                  disabled={createInvoiceMutation.isPending}
                  className="bg-green-600 gap-1.5"
                  data-testid="button-mark-paid"
                >
                  {createInvoiceMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <DollarSign className="w-3.5 h-3.5" />
                  )}
                  Mark Paid
                </Button>
              ) : (
                <Badge variant="outline" className="text-xs text-green-600 border-green-600">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Fully Paid
                </Badge>
              )
            )}
          </div>

          {/* Row 2: Payment, Packages, Edit */}
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            {(doc.type === 'proposal' || doc.type === 'estimate' || doc.type === 'invoice') && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => setShowPaymentSettingsModal(true)}
                data-testid="button-payment-settings"
              >
                <DollarSign className="w-3.5 h-3.5" />
                Payment
              </Button>
            )}
            {userTier === 'elite' && (doc.type === 'proposal' || doc.type === 'estimate') && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => setShowPackageSettingsModal(true)}
                data-testid="button-package-settings-detail"
              >
                <Layers className="w-3.5 h-3.5" />
                Packages
              </Button>
            )}
            {!['accepted', 'paid', 'rejected'].includes(doc.status) && !isAutoCreatedInvoice && (
              <Button
                variant="outline"
                size="default"
                onClick={() => setEditDialogOpen(true)}
                data-testid="button-edit-document"
              >
                <Pencil className="w-4 h-4 mr-2" />
                Edit
              </Button>
            )}
            {['accepted', 'paid', 'rejected'].includes(doc.status) && (doc.type === 'proposal' || doc.type === 'estimate') && (
              <Button
                variant="outline"
                size="default"
                onClick={() => setViewDialogOpen(true)}
                data-testid="button-view-document"
              >
                <Eye className="w-4 h-4 mr-2" />
                View Details
              </Button>
            )}
          </div>
        </CardContent>
      </Card>}

      {!['accepted', 'paid', 'rejected'].includes(doc.status) && !isAutoCreatedInvoice && (
        <EditDocumentDialog
          document={doc}
          externalOpen={editDialogOpen}
          onExternalOpenChange={handleEditOpenChange}
          focusEntry={editFocus}
          hideTrigger
        />
      )}

      {['accepted', 'paid', 'rejected'].includes(doc.status) && (doc.type === 'proposal' || doc.type === 'estimate') && (
        <EditDocumentDialog
          document={doc}
          externalOpen={viewDialogOpen}
          onExternalOpenChange={setViewDialogOpen}
          hideTrigger
          readOnly
        />
      )}

      {!customerView && doc.projectId && (
        <ProjectPhotosCard
          projectId={doc.projectId}
          documentId={doc.id}
          contactPhone={doc.contact?.phone || null}
          contactEmail={doc.contact?.email || null}
          contactName={doc.contact?.name || null}
          contactAddress={doc.contact?.address || null}
          contactCity={doc.contact?.city || null}
          contactState={doc.contact?.state || null}
          contactZipCode={doc.contact?.zipCode || null}
          companyName={settings?.companyName || null}
          canSendSms={canSendSmsCheck}
          canSendEmail={!!(settings?.googleEmail || settings?.smtpConnectedAt || settings?.sendgridFromEmail || settings?.googleConnectedAt)}
        />
      )}

      {/* Change Order Source Proposal Banner */}
      {doc.type === 'change_order' && doc.sourceDocumentId && (
        <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3">
            <FileText className="w-5 h-5 text-purple-600 shrink-0 mt-0.5 sm:mt-0" />
            <div>
              <p className="font-medium text-purple-800 dark:text-purple-200 text-sm sm:text-base">Change Order for Proposal #{doc.sourceDocumentId}</p>
              <p className="text-xs sm:text-sm text-purple-600 dark:text-purple-400">
                {doc.status === 'accepted' 
                  ? "This change order has been approved. The total has been added to the proposal and invoice."
                  : "When accepted, this amount will be added to the original proposal and invoice."}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="border-purple-300 text-purple-700 dark:border-purple-700 dark:text-purple-300 w-full sm:w-auto"
            data-testid="button-view-source-proposal"
            onClick={() => {
              // Replace the change-order entry in history with the proposal so
              // tapping back from the proposal returns to the project (or wherever
              // the user came from) instead of bouncing back to this CO.
              setLocation(`/documents/${doc.sourceDocumentId}`, { replace: true });
            }}
          >
            <FileText className="w-4 h-4 mr-2" />
            View Proposal
          </Button>
        </div>
      )}

      {/* Add Change Order Button - Shows when there are NO change orders yet */}
      {(doc.type === 'proposal' || doc.type === 'estimate') && doc.signature && changeOrders && changeOrders.filter(co => !co.archived).length === 0 && (
        <Button 
          onClick={() => setShowCreateChangeOrder(true)} 
          className="w-full sm:w-auto"
          data-testid="button-add-first-change-order"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Change Order
        </Button>
      )}

      {/* Change Orders Management Section - At Top for signed proposals */}
      {(doc.type === 'proposal' || doc.type === 'estimate') && doc.signature && changeOrders && changeOrders.filter(co => !co.archived).length > 0 && (
        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-2 py-3 sm:p-6 pb-3">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <FileText className="w-5 h-5" />
              Change Orders ({changeOrders.filter(co => !co.archived).length})
            </CardTitle>
            <Button size="sm" onClick={() => setShowCreateChangeOrder(true)} data-testid="button-add-change-order-top">
              <Plus className="w-4 h-4 mr-2" />
              Add Change Order
            </Button>
          </CardHeader>
          <CardContent className="px-2 py-3 sm:p-6 pt-0">
            <div className="space-y-2">
              {[...changeOrders]
                .filter(co => !co.archived)
                .sort((a, b) => {
                  // Unsigned first, then signed sorted by acceptance date (newest accepted first)
                  if (!a.signature && b.signature) return -1;
                  if (a.signature && !b.signature) return 1;
                  // Both signed - sort by signedAt (newest accepted first)
                  if (a.signature && b.signature) {
                    return new Date(b.signedAt || 0).getTime() - new Date(a.signedAt || 0).getTime();
                  }
                  // Both unsigned - sort by createdAt (oldest first)
                  return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
                })
                .map((co) => (
                <div 
                  key={co.id} 
                  className={cn(
                    "rounded-xl p-4 cursor-pointer transition-all border-2 overflow-hidden bg-card hover:-translate-y-0.5",
                    co.signature 
                      ? "border-green-400 dark:border-green-700 shadow-[0_4px_14px_-2px_rgba(34,197,94,0.35)] hover:shadow-[0_8px_22px_-2px_rgba(34,197,94,0.5)]"
                      : "border-amber-400 dark:border-amber-600 shadow-[0_4px_14px_-2px_rgba(245,158,11,0.35)] hover:shadow-[0_8px_22px_-2px_rgba(245,158,11,0.55)]"
                  )}
                  onClick={() => {
                    setSelectedChangeOrder(co);
                    setShowChangeOrderPopup(true);
                  }}
                  data-testid={`card-change-order-${co.id}`}
                >
                  {/* Top row: icon + title/badges + amount on right */}
                  <div className="flex items-start gap-3 mb-3">
                    <div className={cn(
                      "w-9 h-9 rounded-full flex items-center justify-center shrink-0 shadow-sm",
                      co.signature
                        ? "bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400"
                        : "bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400"
                    )}>
                      {co.signature ? <CheckCircle className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={cn("font-semibold text-sm truncate", co.signature ? "text-green-800 dark:text-green-200" : "")}>{co.title}</span>
                        <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 h-4", co.signature ? "border-green-400 text-green-700 dark:text-green-300" : "")}>
                          #{(co.documentNumber || co.id).toString().padStart(6, '0')}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {co.signature ? (
                          <>
                            <Badge className="bg-green-600 hover:bg-green-600 text-[10px] px-1.5 py-0 h-4">Accepted</Badge>
                            {co.signedAt && (
                              <span className="text-[11px] text-green-700 dark:text-green-300">
                                {format(new Date(co.signedAt), 'MMM d, yyyy')}
                              </span>
                            )}
                          </>
                        ) : co.status === 'sent' || co.status === 'viewed' ? (
                          <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 text-[10px] px-1.5 py-0 h-4 border-0">Pending</Badge>
                        ) : (
                          <Badge className="bg-slate-100 text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 text-[10px] px-1.5 py-0 h-4 border-0">Draft</Badge>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={cn("font-bold text-base leading-tight", co.signature ? "text-green-700 dark:text-green-300" : "text-foreground")}>
                        ${(co.totalAmount / 100).toFixed(2)}
                      </div>
                    </div>
                  </div>

                  {/* Unpublished-changes banner per change order */}
                  {!co.signature && (() => {
                    const coPublishedTs = co.publishedAt ? new Date(co.publishedAt).getTime() : 0;
                    const coUpdatedTs = co.updatedAt ? new Date(co.updatedAt).getTime() : 0;
                    const coIsPublished = !!co.publishedAt;
                    const coHasUnpublishedEdits = coIsPublished && coUpdatedTs > coPublishedTs + 2000;
                    if (!coIsPublished && (co.status === 'sent' || co.status === 'viewed')) {
                      // already shared via send-flow which auto-publishes; no banner
                      return null;
                    }
                    if (!coIsPublished) {
                      return (
                        <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 px-3 py-2 text-xs flex items-center justify-between gap-2" data-testid={`banner-co-draft-${co.id}`}>
                          <span className="text-amber-900 dark:text-amber-200"><strong>Draft.</strong> Customer can't see this yet.</span>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs shrink-0"
                            disabled={publishMutation.isPending}
                            onClick={(e) => { e.stopPropagation(); publishMutation.mutate(co.id); }}
                            data-testid={`button-publish-co-${co.id}`}
                          >
                            Publish now
                          </Button>
                        </div>
                      );
                    }
                    if (coHasUnpublishedEdits) {
                      return (
                        <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 px-3 py-2 text-xs flex items-center justify-between gap-2" data-testid={`banner-co-unpublished-${co.id}`}>
                          <span className="text-amber-900 dark:text-amber-200"><strong>Unpublished changes.</strong> Customer is still seeing the older version.</span>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs shrink-0"
                            disabled={publishMutation.isPending}
                            onClick={(e) => { e.stopPropagation(); publishMutation.mutate(co.id); }}
                            data-testid={`button-publish-co-${co.id}`}
                          >
                            Publish update
                          </Button>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  {/* Action buttons row */}
                  <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-border/40">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs flex-1 sm:flex-initial"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyCOLink(co);
                      }}
                      data-testid={`button-copy-co-link-${co.id}`}
                    >
                      <Copy className="w-3.5 h-3.5 mr-1.5 text-blue-600" />
                      Copy Link
                    </Button>
                    {!co.signature && (
                      <>
                        <Button
                          size="sm"
                          className="h-8 text-xs flex-1 sm:flex-initial bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedChangeOrder(co);
                            setShowCOSmsDialog(true);
                          }}
                          data-testid={`button-send-co-${co.id}`}
                        >
                          <Send className="w-3.5 h-3.5 mr-1.5" />
                          Send
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 w-8 p-0 text-destructive border-destructive/30 hover:bg-destructive hover:text-destructive-foreground hover:border-destructive shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedChangeOrder(co);
                            setShowDeleteCOConfirm(true);
                          }}
                          title="Delete"
                          data-testid={`button-delete-co-${co.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 w-8 p-0 text-slate-600 dark:text-slate-300 shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedChangeOrder(co);
                            setShowArchiveCOConfirm(true);
                          }}
                          disabled={archiveMutation.isPending}
                          title="Archive"
                          data-testid={`button-archive-co-${co.id}`}
                        >
                          <Archive className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Document View */}
      {customerView ? (
        <>
        <Card className="shadow-lg overflow-hidden rounded-none border-x-0" data-testid="card-customer-view">
          {/* Branded Header inside the card - matches portal layout */}
          <div style={{ backgroundColor: cvHeaderBgColor }}>
            <div className="px-2 sm:px-8 pt-6 sm:pt-8 pb-4 text-center">
              {companyLogo && (
                <img
                  src={companyLogo}
                  alt={companyName}
                  className="w-20 h-20 sm:w-24 sm:h-24 object-contain rounded-xl p-1.5 mx-auto mb-3"
                  style={{ backgroundColor: cvSubtleBg }}
                  data-testid="img-cv-document-logo"
                />
              )}
              <h2 data-testid="text-cv-company-name">
                <span className="inline-block rounded-full px-5 py-1.5 text-xl sm:text-2xl font-bold text-white tracking-wide" style={{ backgroundColor: cvHeaderAccentColor }}>{companyName}</span>
              </h2>
              {companyTagline && (
                <p className="text-sm sm:text-base mt-1 font-medium tracking-wide uppercase" style={{ color: cvTextMuted }}>{companyTagline}</p>
              )}
              {(() => {
                const localCity = doc.jobCity || (!doc.jobAddressSameAsBilling ? '' : doc.contact?.city) || doc.contact?.city || '';
                return localCity ? (
                  <p className="mt-2 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs sm:text-sm font-semibold" style={{ backgroundColor: cvSubtleBg, color: cvTextSemiMuted }} data-testid="text-cv-local-tagline">
                    <MapPin className="w-3.5 h-3.5 text-green-400 shrink-0" />
                    {localCity}'s Preferred Interior Painter
                  </p>
                ) : null;
              })()}
            </div>

            {(cvTrustBadges.length > 0 || companyLicense) && (
              <div className="px-2 sm:px-8 pb-4 flex flex-wrap items-center justify-center gap-2.5">
                {cvTrustBadges.map((badge) => (
                  <span
                    key={badge.id}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium"
                    style={{ border: `1px solid ${cvBorderColor}`, color: cvTextSemiMuted }}
                    data-testid={`badge-cv-trust-${badge.id}`}
                  >
                    <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
                    {badge.label}
                  </span>
                ))}
                {companyLicense && (
                  <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium" style={{ border: `1px solid ${cvBorderColor}`, color: cvTextSemiMuted }} data-testid="badge-cv-license">
                    <Shield className="w-4 h-4 text-green-400 shrink-0" />
                    License: {companyLicense}
                  </span>
                )}
              </div>
            )}

            {/* Company Address Card - on dark background */}
            <div className="px-2 sm:px-8 pb-5 space-y-3">
              <div className="rounded-xl p-3">
                <span className="inline-block rounded-full px-3 py-1 text-sm font-bold text-white mb-1.5" style={{ backgroundColor: cvHeaderAccentColor }} data-testid="text-cv-company-name-card">Address</span>
                <div className="text-sm space-y-0.5 mt-0.5" style={{ color: cvTextMuted }}>
                  {companyAddress && <p>{companyAddress}</p>}
                  {companyCityStateZip && <p>{companyCityStateZip}</p>}
                  {companyPhone && <p className="font-medium" style={{ color: cvTextSemiMuted }}><a href={`tel:${companyPhone.replace(/[^+\d]/g, '')}`} className="underline transition-colors" style={{ textDecorationColor: cvBorderColor }} data-testid="link-cv-company-phone">{formatPhoneDisplay(companyPhone)}</a></p>}
                  {companyEmail && <p>{companyEmail}</p>}
                </div>
              </div>
            </div>

            <div className="h-1.5" style={{ backgroundColor: cvHeaderAccentColor }} />
          </div>

          {/* Info Cards — white background with brand-color header bars (matches portal) */}
          {doc && (
            <div className="px-1.5 sm:px-6 pt-5 pb-1 space-y-3 bg-white">
              {/* Client Card */}
              <div className="rounded-xl border border-gray-200 shadow-lg p-3">
                <span className="inline-block rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider text-white mb-2" style={{ backgroundColor: cvHeaderAccentColor }}>Client</span>
                <p className="font-bold text-gray-900 text-base">{doc.contact.name}</p>
                <AddressDisplay
                  address={doc.contact.address}
                  city={doc.contact.city}
                  state={doc.contact.state}
                  zipCode={doc.contact.zipCode}
                  showMapIcon={false}
                  textClassName="text-sm text-gray-700"
                />
                {doc.contact.phone && <p className="text-sm font-medium text-gray-800">{formatPhoneDisplay(doc.contact.phone)}</p>}
                {doc.contact.email && <p className="text-sm text-gray-700">{doc.contact.email}</p>}
              </div>

              {/* Job Address Card */}
              <div className="rounded-xl border border-gray-200 shadow-lg p-3">
                <span className="inline-block rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider text-white mb-2" style={{ backgroundColor: cvHeaderAccentColor }}>Job Address</span>
                {doc.jobAddressSameAsBilling ? (
                  <AddressDisplay
                    address={doc.contact.address}
                    city={doc.contact.city}
                    state={doc.contact.state}
                    zipCode={doc.contact.zipCode}
                    showMapIcon={false}
                    textClassName="text-sm text-gray-800 font-medium"
                  />
                ) : (
                  <AddressDisplay
                    address={doc.jobAddress}
                    city={doc.jobCity}
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
                <span className="inline-block rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider text-white mb-2" style={{ backgroundColor: cvHeaderAccentColor }}>{doc.type.replace('_', ' ')} Info</span>
                <p className="font-bold text-gray-900 text-base">#{(doc.documentNumber || doc.id).toString().padStart(6, '0')}</p>
                <p className="text-sm text-gray-700">Date: <span className="font-medium text-gray-900">{doc.createdAt ? format(new Date(doc.createdAt), "MMM d, yyyy") : 'N/A'}</span></p>
                {(doc.type === 'proposal' || doc.type === 'estimate') && doc.validThrough && (() => {
                  const vtDate = new Date(doc.validThrough);
                  const expired = vtDate < new Date();
                  return (
                    <p className={`text-sm ${expired ? 'text-red-500 font-medium' : 'text-gray-700'}`}>
                      Valid Through: <span className="font-medium">{format(vtDate, "MMM d, yyyy")}</span>
                    </p>
                  );
                })()}
              </div>
            </div>
          )}

          <CardContent className="px-1.5 sm:px-6 pt-6 pb-6 space-y-6 sm:space-y-8">
            {standardsTemplate?.content && standardsTemplate?.enabled !== false && doc.type !== 'change_order' && doc.type !== 'invoice' && (
              <div className="mb-6 pb-6 border-b">
                <RichTextDisplay content={standardsTemplate.content} />
              </div>
            )}

            {(() => {
              const isInvoice = doc.type === 'invoice';
              const allItems = doc.content.items || [];
              const allBlocks = doc.content.productionRateBlocks || [];
              const itemOrder: string[] = (doc.content as any).itemOrder || [];

              const nonOptionalItems = isInvoice
                ? allItems.filter((item: any) => !item.name?.startsWith('[CO]') && !item.isOptional)
                : allItems.filter((item: any) => !item.isOptional);
              const nonOptionalBlocks = allBlocks.filter((b: any) => !b.isOptional);
              const optionalItems = allItems.filter((item: any) => item.isOptional);
              const optionalBlocks = allBlocks.filter((b: any) => b.isOptional);
              const changeOrderLineItems = isInvoice
                ? allItems.filter((item: any) => item.name?.startsWith('[CO]'))
                : [];

              const getItemSrcIdx = (it: any) => allItems.indexOf(it);
              const orderedEntries: Array<{ type: 'item' | 'block'; item?: any; block?: any; srcIdx?: number }> = [];
              if (itemOrder.length > 0) {
                let iIdx = 0, bIdx = 0;
                for (const t of itemOrder) {
                  if (t === 'block' && bIdx < nonOptionalBlocks.length) {
                    orderedEntries.push({ type: 'block', block: nonOptionalBlocks[bIdx++] });
                  } else if (t === 'item' && iIdx < nonOptionalItems.length) {
                    const it = nonOptionalItems[iIdx++];
                    orderedEntries.push({ type: 'item', item: it, srcIdx: getItemSrcIdx(it) });
                  }
                }
                while (bIdx < nonOptionalBlocks.length) orderedEntries.push({ type: 'block', block: nonOptionalBlocks[bIdx++] });
                while (iIdx < nonOptionalItems.length) { const it = nonOptionalItems[iIdx++]; orderedEntries.push({ type: 'item', item: it, srcIdx: getItemSrcIdx(it) }); }
              } else {
                nonOptionalBlocks.forEach(block => orderedEntries.push({ type: 'block', block }));
                nonOptionalItems.forEach(item => orderedEntries.push({ type: 'item', item, srcIdx: getItemSrcIdx(item) }));
              }

              let itemCounter = 0;
              return (
                <>
                  <div className="space-y-4">
                    {orderedEntries.map((entry, i) => {
                      if (entry.type === 'block') {
                        return (
                          <div key={`block-${i}`}>
                            <ProductionRateBlocksSection blocks={[entry.block]} brandColor={settings?.useBrandColorOnDocs && settings?.brandColor ? settings.brandColor : null} excludedSurfaces={canEdit ? cvExcludedSurfaces : undefined} onToggleSurface={canEdit ? toggleCvExcludedSurface : undefined} acceptedOptionalAreas={cvAcceptedOptionalAreas} onToggleOptionalArea={canEdit ? toggleCvOptionalArea : undefined} contractorHiddenAreas={contractorHiddenAreas} onToggleContractorArea={canEdit ? toggleContractorHiddenArea : undefined} onEditBlock={canEdit ? ((blockId) => openEditWithFocus({ kind: 'block', blockId })) : undefined} onEditArea={canEdit ? ((blockId, roomId) => openEditWithFocus({ kind: 'block', blockId, roomId })) : undefined} />
                          </div>
                        );
                      }
                      const idx = itemCounter++;
                      const itemKey = `item-${entry.item.name || idx}`;
                      const isItemHidden = contractorHiddenItems.includes(itemKey);
                      return (
                        <div key={`item-${i}`} className={`rounded-xl border shadow-sm overflow-hidden px-2 py-3 sm:p-4 transition-all duration-300 ${isItemHidden ? 'border-muted-foreground/30 bg-muted/30 opacity-60' : 'border-gray-200 dark:border-gray-700'}`}>
                          <div className="flex items-start gap-2">
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => toggleContractorHiddenItem(itemKey)}
                                className={`shrink-0 w-6 h-6 mt-0.5 rounded border-2 flex items-center justify-center transition-colors ${
                                  isItemHidden
                                    ? 'border-muted-foreground/40 bg-transparent'
                                    : 'border-primary bg-primary'
                                }`}
                                data-testid={`toggle-contractor-item-${idx}`}
                                title={isItemHidden ? 'Hidden from customer — tap to show' : 'Visible to customer — tap to hide'}
                              >
                                {!isItemHidden && (
                                  <svg className="w-3.5 h-3.5 text-primary-foreground" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 6l3 3 5-5" /></svg>
                                )}
                              </button>
                            )}
                            <div className="flex-1 min-w-0">
                              <LineItemRenderer item={entry.item} index={idx} mode="customer" proposalDefaults={doc.content?.proposalDisplayDefaults || null} pricesInCents={true} brandColor={settings?.useBrandColorOnDocs && settings?.brandColor ? settings.brandColor : null} forceCollapsed={isItemHidden} onEdit={canEdit && entry.srcIdx !== undefined ? (() => openEditWithFocus({ kind: 'item', itemId: String(entry.srcIdx) })) : undefined} />
                              {!entry.item.descriptionOnly && !entry.item.hidePrice && (
                              <div className="border-t pt-2 mt-2">
                                <div className="flex items-center justify-end">
                                  <span className="text-sm font-semibold tabular-nums">
                                    Subtotal: {isItemHidden ? '$0.00' : `$${((entry.item.total || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                                  </span>
                                </div>
                              </div>
                              )}
                              {isItemHidden && (
                                <div className="mt-1.5 text-xs text-muted-foreground italic">
                                  <span className="text-red-500 font-semibold text-[9px] bg-red-50 px-1.5 py-0.5 rounded-full mr-1.5">Hidden</span>
                                  This item is hidden from the customer view
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {(optionalItems.length > 0 || optionalBlocks.length > 0) && !doc.signature && (
                    <div className="mt-8 pt-6 border-t-2 border-emerald-300 dark:border-emerald-700" data-testid="cv-optional-items-section">
                      <div className="space-y-5">
                        {optionalItems.map((item: any, i: number) => {
                          const itemId = `item-${item.name || i}`;
                          const isAccepted = cvAcceptedOptionals.includes(itemId);
                          const displayItem = { ...item, isOptional: false };
                          const srcIdx = getItemSrcIdx(item);
                          return (
                            <div
                              key={`opt-item-${i}`}
                              className={`rounded-xl overflow-hidden select-none transition-all duration-300 ${isAccepted ? 'bg-emerald-50 dark:bg-emerald-950/40 shadow-md' : 'border border-gray-200 dark:border-gray-700 shadow-sm'}`}
                              data-testid={`cv-optional-item-card-${i}`}
                            >
                              <div
                                className={`flex items-center justify-between px-4 py-2 border-b cursor-pointer ${isAccepted ? 'bg-emerald-100 dark:bg-emerald-900/50 border-emerald-200 dark:border-emerald-800' : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800'}`}
                                onClick={() => toggleCvOptionalItem(itemId)}
                              >
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
                                  proposalDefaults={doc.content?.proposalDisplayDefaults || null}
                                  pricesInCents={true}
                                  brandColor={settings?.useBrandColorOnDocs && settings?.brandColor ? settings.brandColor : null}
                                  onBodyClick={() => toggleCvOptionalItem(itemId)}
                                  onEdit={canEdit && srcIdx !== undefined ? (() => openEditWithFocus({ kind: 'item', itemId: String(srcIdx) })) : undefined}
                                />
                              </div>
                            </div>
                          );
                        })}
                        {optionalBlocks.map((block: any, i: number) => {
                          const blockId = `block-${block.id}`;
                          const isAccepted = cvAcceptedOptionals.includes(blockId);
                          return (
                            <div
                              key={`opt-block-${i}`}
                              className={`rounded-xl overflow-hidden cursor-pointer select-none transition-all duration-300 ${isAccepted ? 'bg-emerald-50 dark:bg-emerald-950/40 shadow-md' : 'border border-gray-200 dark:border-gray-700 shadow-sm'}`}
                              onClickCapture={(e) => { e.stopPropagation(); e.preventDefault(); toggleCvOptionalItem(blockId); }}
                              data-testid={`cv-optional-block-card-${i}`}
                            >
                              <div className={`flex items-center justify-between px-4 py-2 border-b ${isAccepted ? 'bg-emerald-100 dark:bg-emerald-900/50 border-emerald-200 dark:border-emerald-800' : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800'}`}>
                                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Optional</span>
                                <span className={`text-[10px] font-semibold ${isAccepted ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                                  {isAccepted ? 'Tap to remove' : 'Select to include'}
                                </span>
                              </div>
                              <div className="transition-opacity duration-300" style={{ opacity: isAccepted ? 1 : 0.55 }}>
                                <ProductionRateBlocksSection blocks={[block]} brandColor={settings?.useBrandColorOnDocs && settings?.brandColor ? settings.brandColor : null} noCard isCustomerView onEditBlock={canEdit ? ((bId) => openEditWithFocus({ kind: 'block', blockId: bId })) : undefined} onEditArea={canEdit ? ((bId, rId) => openEditWithFocus({ kind: 'block', blockId: bId, roomId: rId })) : undefined} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {(() => {
                    const docPkgEnabled = (doc.content as any)?.proposalPackagesEnabled;
                    const hasPerProposalPkgs = docPkgEnabled === true && (doc.content as any)?.proposalPackagesData?.length > 0;
                    const cvAvailPkgs2 = proposalPackages || globalPackagesForDetail || [];
                    const showPkgs = hasPerProposalPkgs || (docPkgEnabled === true && settings?.packagesEnabled && cvAvailPkgs2.length > 0);
                    const cvBrandColor = settings?.useBrandColorOnDocs && settings?.brandColor ? settings.brandColor : undefined;

                    if (showPkgs) {
                      const pkgSnapshots = (hasPerProposalPkgs
                        ? (doc.content as any).proposalPackagesData
                        : cvAvailPkgs2.map((p: any) => packageToSnapshot(p))
                      ).filter((p: any) => p.active !== false);
                      const activePkgId = cvSelectedPkgId || doc.content?.packageSnapshot?.id;
                      const activePkg = pkgSnapshots.find((p: any) => p.id === activePkgId);

                      return (
                        <div className="mt-6 mb-6 pb-6 border-b space-y-4" data-testid="doc-detail-package-section">
                          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Choose Your Package</h3>
                          <PackageCarousel
                            packages={pkgSnapshots}
                            baseTotal={cvTotals.effectiveBaseForPkg}
                            selectedPackageId={activePkgId}
                            onSelectPackage={(pkg) => setCvSelectedPkgId(pkg.id)}
                            brandColor={cvBrandColor}
                          />
                          {activePkg && <SelectedPackageSummary pkg={activePkg} brandColor={cvBrandColor} />}
                        </div>
                      );
                    }

                    if (docPkgEnabled === true && doc.content?.packageSnapshot) {
                      return (
                        <div className="mt-6 mb-6 pb-6 border-b" data-testid="doc-detail-package-summary">
                          <SelectedPackageSummary
                            pkg={doc.content.packageSnapshot}
                            brandColor={cvBrandColor}
                          />
                        </div>
                      );
                    }

                    return null;
                  })()}

                  {isInvoice && changeOrderLineItems.length > 0 && (
                    <div className="mt-12 pt-8 border-t-4 border-primary/20">
                      <h3 className="text-lg font-bold mb-4">Accepted Change Orders</h3>
                      <div className="space-y-4">
                        {changeOrderLineItems.map((item: any, i: number) => (
                          <div key={i} className="rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden p-4">
                            <LineItemRenderer item={item} index={i} mode="customer" proposalDefaults={doc.content?.proposalDisplayDefaults || null} pricesInCents={true} brandColor={settings?.useBrandColorOnDocs && settings?.brandColor ? settings.brandColor : null} />
                          </div>
                        ))}
                      </div>
                      <div className="flex justify-end pt-4">
                        <div className="w-64 space-y-2">
                          <div className="flex justify-between font-bold">
                            <span>Change Orders Total</span>
                            <span>${(changeOrderLineItems.reduce((sum: number, item: any) => sum + (item.total || 0), 0) / 100).toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {(() => {
                    const hasSignedCOs = changeOrders && changeOrders.filter(co => co.signature && !co.archived).length > 0;
                    const showBreakdown = cvTotals.taxAmount > 0 || cvTotals.discountCents > 0;
                    return (
                      <div className="flex justify-end pt-4">
                        <div className="w-full sm:w-64 space-y-2">
                          {showBreakdown && (
                            <>
                              <div className="flex justify-between text-sm text-muted-foreground border-t pt-2">
                                <span>Subtotal</span>
                                <span>${((cvTotals.subtotal + cvTotals.discountCents) / 100).toFixed(2)}</span>
                              </div>
                              {(cvTotals.allDiscounts?.length ?? 0) > 0 && (cvTotals.allDiscounts || []).map((ad: any, adIdx: number) => {
                                if (!ad.value) return null;
                                const adAmt = ad.type === 'percentage'
                                  ? Math.round(cvTotals.subtotalBeforeDiscount * (Math.min(ad.value, 100) / 100))
                                  : ad.value * 100;
                                return (
                                  <div key={adIdx} className="flex justify-between text-sm text-emerald-600" data-testid={`text-discount-line-${adIdx}`}>
                                    <span>{ad.label || 'Discount'}{ad.type === 'percentage' ? ` (${ad.value}%)` : ''}</span>
                                    <span>-${(adAmt / 100).toFixed(2)}</span>
                                  </div>
                                );
                              })}
                              {cvTotals.taxAmount > 0 && (
                                <div className="flex justify-between text-sm text-muted-foreground">
                                  <span>{taxProfileName ? `${taxProfileName} (${taxRate}%)` : `Tax (${taxRate}%)`}</span>
                                  <span>${(cvTotals.taxAmount / 100).toFixed(2)}</span>
                                </div>
                              )}
                            </>
                          )}
                          <div className="flex justify-between text-xl font-bold border-t pt-2">
                            <span>{hasSignedCOs || (isInvoice && changeOrderLineItems.length > 0) ? 'Grand Total' : 'Total'}</span>
                            <span>${(cvEffectiveTotal / 100).toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </>
              );
            })()}

            {changeOrders && changeOrders.filter(co => co.signature && !co.archived).length > 0 && (
              <>
                {changeOrders.filter(co => co.signature && !co.archived)
                  .sort((a, b) => new Date(a.signedAt || 0).getTime() - new Date(b.signedAt || 0).getTime())
                  .map((co) => (
                  <div key={co.id} className="mt-12 pt-8 border-t-4 border-primary/20">
                    <div className="flex items-center gap-2 mb-4">
                      <h3 className="text-lg font-bold">Change Order: {co.title}</h3>
                      <Badge variant="outline" className="text-xs">#{(co.documentNumber || co.id).toString().padStart(6, '0')}</Badge>
                      {co.signedAt && <span className="text-sm text-muted-foreground ml-auto">Accepted {format(new Date(co.signedAt), "MMM d, yyyy")}</span>}
                    </div>
                    {co.content && (
                      <ChangeOrderContentRenderer
                        content={co.content}
                        mode="customer"
                        brandColor={settings?.useBrandColorOnDocs && settings?.brandColor ? settings.brandColor : null}
                        testIdPrefix={`co-customer-view-${co.id}`}
                      />
                    )}
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
              </>
            )}

            {doc.content?.paymentSettings?.showPaymentSchedule && doc.content.paymentSettings.depositRequired && doc.content.paymentSettings.schedule?.length > 0 && (() => {
              const ddPs = doc.content.paymentSettings;
              const ddTotal = cvEffectiveTotal;
              const ddDepositCents = ddPs.depositType === 'percentage'
                ? Math.round(ddTotal * (ddPs.depositAmount / 100))
                : Math.round(ddPs.depositAmount * 100);
              const ddOrigScheduleTotal = ddPs.schedule.reduce((s: number, item: any) => s + (item.amount || 0), 0);
              const ddRemainingAfterDeposit = Math.max(0, ddTotal - ddDepositCents);
              let ddDistributed = 0;
              const ddAdjSchedule = ddPs.schedule.map((item: any, idx: number) => {
                let adj: number;
                if (ddOrigScheduleTotal <= 0) { adj = item.amount || 0; }
                else if (idx === ddPs.schedule.length - 1) { adj = Math.max(0, ddRemainingAfterDeposit - ddDistributed); }
                else { adj = Math.round(ddRemainingAfterDeposit * ((item.amount || 0) / ddOrigScheduleTotal)); ddDistributed += adj; }
                return { ...item, adjustedAmount: adj };
              });
              return (
              <div className="pt-6 mt-6 border-t">
                <h4 className="font-bold text-foreground mb-3">Payment Schedule</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between py-2 border-b">
                    <div>
                      <span className="font-medium">Deposit</span>
                      <span className="text-muted-foreground ml-2">
                        ({ddPs.depositType === 'percentage'
                          ? `${ddPs.depositAmount}%`
                          : 'Fixed'})
                      </span>
                    </div>
                    <span className="font-medium">
                      {formatCurrency(ddDepositCents / 100)}
                    </span>
                  </div>
                  {ddAdjSchedule.map((item: any, idx: number) => (
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

            {settings?.financingEnabled && settings?.financingLink && (doc.type === 'proposal' || doc.type === 'estimate') && doc.content?.paymentSettings?.showFinancing && (
              <div className="pt-6 mt-6 border-t">
                <div
                  className="p-5 rounded-lg border border-emerald-200 dark:border-emerald-800"
                  style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.12), rgba(34,197,94,0.06))' }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Banknote className="w-5 h-5 text-emerald-600" />
                    <p className="font-semibold text-foreground" data-testid="text-financing-available-detail">Financing Available</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground mb-2" data-testid="text-financing-monthly-detail">
                    As low as ${(() => {
                      let total = doc.totalAmount;
                      const docPkgFlag = (doc.content as any)?.proposalPackagesEnabled;
                      if (docPkgFlag === true || (docPkgFlag === undefined && settings?.packagesEnabled)) {
                        const pkgSnap = doc.content?.packageSnapshot;
                        if (pkgSnap) {
                          total += pkgSnap.priceAdjustmentType === 'percent'
                            ? Math.round(doc.totalAmount * (pkgSnap.adjustmentValue / 100))
                            : Math.round((pkgSnap.adjustmentValue || 0) * 100);
                        }
                      }
                      return Math.ceil((total / 100) / 36);
                    })()}/mo*
                  </p>
                  <p className="text-sm text-muted-foreground mb-3">
                    Flexible payment options available through {settings.financingProvider || 'financing'}.
                  </p>
                  <div className="flex flex-col gap-1 mb-4">
                    <span className="text-xs text-emerald-700 dark:text-emerald-400">✔ Fast approval</span>
                    <span className="text-xs text-emerald-700 dark:text-emerald-400">✔ No obligation to apply</span>
                  </div>
                  <a href={settings.financingLink} target="_blank" rel="noopener noreferrer">
                    <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="button-apply-financing-detail">
                      See Payment Options →
                    </Button>
                  </a>
                  <p className="text-[10px] text-muted-foreground mt-3 leading-tight">
                    *Estimated payment. Actual financing terms, approval, and rates are determined by {settings.financingProvider || 'the financing provider'} and may vary.
                  </p>
                </div>
              </div>
            )}

            {doc.content.notes && (
              <div className="pt-6 border-t text-sm text-muted-foreground">
                <h4 className="font-bold text-foreground mb-1">Notes:</h4>
                <p>{doc.content.notes}</p>
              </div>
            )}

            {termsTemplate?.content && termsTemplate?.enabled !== false && doc.type !== 'change_order' && doc.type !== 'invoice' && (
              <div className="mt-6 pt-6 border-t border-amber-300">
                <h3 className="text-lg font-semibold mb-4 text-foreground">Terms and Conditions</h3>
                <RichTextDisplay content={termsTemplate.content} />
              </div>
            )}

            {(() => {
              const hiddenIds: number[] = (doc.content as any)?.hiddenDocumentPhotoIds || [];
              const visiblePhotos = docPhotos.filter((p: any) => !hiddenIds.includes(p.id));
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

            {isProposalOrEstimate && (
              <div className="mt-8 pt-8 border-t-2 border-dashed">
                {doc.signature ? (
                  <div className="space-y-4">
                    {settings?.useContractorSignature && settings?.contractorSignature ? (
                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-muted-foreground">Contractor</p>
                          <div className="border p-4 bg-muted/10 rounded-lg">
                            <img src={settings.contractorSignature} alt="Contractor signature" className="h-20 object-contain" />
                          </div>
                          <p className="text-xs text-muted-foreground">{settings?.companyName || 'Contractor'}</p>
                          <p className="text-xs text-muted-foreground">
                            {doc.signedAt ? format(new Date(doc.signedAt), "MMM d, yyyy h:mm a") : 'Unknown date'}
                          </p>
                        </div>
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-muted-foreground">Customer</p>
                          <div className="border p-4 bg-muted/10 rounded-lg">
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
                        <div className="border p-4 inline-block bg-muted/10 rounded-lg">
                          <img src={doc.signature} alt="Signature" className="h-24" />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Signed on {doc.signedAt ? format(new Date(doc.signedAt), "MMM d, yyyy h:mm a") : 'Unknown date'}
                        </p>
                      </>
                    )}
                  </div>
                ) : (doc.status === 'sent' || doc.status === 'viewed' || doc.status === 'draft' || doc.status === 'created') ? (
                  <div className="flex justify-center py-6">
                    <Button
                      onClick={() => setShowSignatureModal(true)}
                      className="bg-green-600 hover:bg-green-700"
                      size="lg"
                      data-testid="button-cv-open-signature"
                    >
                      <PenLine className="w-4 h-4 mr-2" />
                      Accept & Sign {doc.type.replace('_', ' ')}
                    </Button>
                  </div>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>

        {(() => {
          const docPkgEnabled2 = (doc.content as any)?.proposalPackagesEnabled;
          const hasPerProposalPkgs = docPkgEnabled2 === true && (doc.content as any)?.proposalPackagesData?.length > 0;
          const cvAvailablePkgs = proposalPackages || globalPackagesForDetail || [];
          const showPkgs = hasPerProposalPkgs || (docPkgEnabled2 === true && settings?.packagesEnabled && cvAvailablePkgs.length > 0);
          const isUnsigned = !doc.signature && (doc.status === 'sent' || doc.status === 'viewed' || doc.status === 'draft' || doc.status === 'created');

          const hasOptionalItems = ((doc.content?.items || []).some((item: any) => item.isOptional) || (doc.content?.productionRateBlocks || []).some((b: any) => b.isOptional));
          if ((!showPkgs && !hasOptionalItems) || !isUnsigned) return null;

          const pkgSnapshots = (hasPerProposalPkgs
            ? (doc.content as any).proposalPackagesData
            : cvAvailablePkgs.map((p: any) => packageToSnapshot(p))
          ).filter((p: any) => p.active !== false);
          const activePkgId = cvSelectedPkgId || doc.content?.packageSnapshot?.id;

          const cvTotal = cvEffectiveTotal;

          const defaultPkgId = pkgSnapshots.find((p: any) => p.recommended)?.id || pkgSnapshots[0]?.id;
          const showPkgLine = activePkgId && activePkgId !== defaultPkgId;
          const selPkgName = showPkgLine ? pkgSnapshots.find((p: any) => p.id === activePkgId)?.name : null;

          return (
            <div
              className="fixed bottom-0 left-0 right-0 z-50 print:hidden"
              data-testid="sticky-cv-footer"
            >
              <div style={{
                backgroundColor: cvHeaderBgColor,
                borderTop: cvIsLightBg ? '1px solid rgba(0,0,0,0.15)' : '1px solid rgba(255,255,255,0.08)',
                boxShadow: cvIsLightBg ? '0 -4px 20px rgba(0,0,0,0.12)' : '0 -6px 18px rgba(0,0,0,0.16)',
                paddingTop: 10,
                paddingBottom: 'calc(10px + env(safe-area-inset-bottom, 0px))',
              }}>
                <div className="max-w-3xl mx-auto px-4">
                  {selPkgName && (
                    <div className="flex items-center justify-center gap-1.5 mb-1.5" data-testid="sticky-cv-selected-package">
                      <span style={{ color: cvTextMuted, fontSize: 11 }}>Selected Package:</span>
                      <span style={{ color: cvTextSemiMuted, fontSize: 11 }}>{selPkgName}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-3">
                    <div data-testid="sticky-cv-total-price">
                      <span style={{ color: cvTextMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', lineHeight: 1.2 }}>Total</span>
                      <span style={{ color: cvTextColor, fontSize: 21, fontWeight: 800, lineHeight: 1.2 }}>${(cvTotal / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <button
                      onClick={() => setShowSignatureModal(true)}
                      className="flex items-center gap-1.5 font-bold text-white whitespace-nowrap transition-colors"
                      style={{
                        backgroundColor: '#22C55E',
                        padding: '0 16px',
                        height: 44,
                        borderRadius: 14,
                        fontSize: 15,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#16A34A')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#22C55E')}
                      data-testid="button-sticky-cv-accept"
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
        </>
      ) : doc.type === 'invoice' ? (
        /* Invoice Compact View */
        <Card className="shadow-lg border-t-4 border-t-primary">
          <CardContent className="p-4 sm:p-6">
            {/* Invoice Header with Payment Status */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
                <div>
                  <h3 className="text-lg sm:text-xl font-bold uppercase tracking-wider text-muted-foreground">Invoice</h3>
                  <p className="font-medium text-base sm:text-lg">#{(doc.documentNumber || doc.id).toString().padStart(6, '0')}</p>
                </div>
                {invoicePaymentStatus && (
                  <Badge className={cn("text-white", invoicePaymentStatus.color)} data-testid="badge-payment-status">
                    {invoicePaymentStatus.label}
                  </Badge>
                )}
              </div>
              <div className="sm:text-right">
                {(() => {
                  // Use the stored grand total set when the invoice was created
                  // from the signed proposal. Recomputing from doc.content.items
                  // alone misses production rate blocks and would understate the
                  // total for proposals that used Room Builder blocks.
                  return (
                    <p className="text-xl sm:text-2xl font-bold" data-testid="text-invoice-header-total">${((doc.totalAmount || 0) / 100).toFixed(2)}</p>
                  );
                })()}
                <p className="text-muted-foreground text-sm">Date: {doc.createdAt ? format(new Date(doc.createdAt), "MMM d, yyyy") : 'N/A'}</p>
              </div>
            </div>

            {/* Payment Request / Balance Banner */}
            {remainingBalance <= 0 && totalPaid > 0 && (
              <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-md p-3 mb-4 text-center" data-testid="banner-payment-complete">
                <p className="text-sm font-medium text-green-800 dark:text-green-200">
                  This invoice has been paid in full - ${(totalPaid / 100).toFixed(2)}
                </p>
              </div>
            )}
            {remainingBalance > 0 && doc.requestedPaymentAmount && doc.requestedPaymentAmount > 0 && (
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-md p-3 mb-4 text-center" data-testid="banner-payment-requested">
                <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                  Payment of <span className="font-bold">${(doc.requestedPaymentAmount / 100).toFixed(2)}</span> requested for this invoice
                </p>
                {totalPaid > 0 && (
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                    ${(totalPaid / 100).toFixed(2)} of ${(doc.totalAmount / 100).toFixed(2)} paid so far
                  </p>
                )}
              </div>
            )}
            {remainingBalance > 0 && (!doc.requestedPaymentAmount || doc.requestedPaymentAmount <= 0) && totalPaid > 0 && (
              <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-md p-3 mb-4 text-center" data-testid="banner-payment-balance">
                <p className="text-sm font-medium text-orange-800 dark:text-orange-200">
                  Payment of <span className="font-bold">${(remainingBalance / 100).toFixed(2)}</span> remaining on this invoice
                </p>
                <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                  ${(totalPaid / 100).toFixed(2)} of ${(doc.totalAmount / 100).toFixed(2)} paid
                </p>
              </div>
            )}

            {/* Client Summary */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-4 border-t border-b">
              <div>
                <p className="text-sm text-muted-foreground">Bill To:</p>
                <p className="font-medium">{doc.contact.name}</p>
              </div>
              <Button 
                variant="ghost" 
                onClick={() => setShowInvoiceDetails(!showInvoiceDetails)}
                data-testid="button-toggle-invoice-details"
              >
                {showInvoiceDetails ? (
                  <>
                    <ChevronUp className="w-4 h-4 mr-2" />
                    Hide Details
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-4 h-4 mr-2" />
                    Show Details
                  </>
                )}
              </Button>
            </div>

            {/* Collapsible Full Invoice Details */}
            {showInvoiceDetails && (
              <div className="pt-6 space-y-6">
                <InternalDocHeader
                  doc={doc}
                  isProposalOrEstimate={isProposalOrEstimate}
                  validThroughDate={validThroughDate}
                  openContactEditModal={openContactEditModal}
                  openJobAddressEditModal={openJobAddressEditModal}
                />

                {/* Line Items & Production Rate Blocks - respecting itemOrder */}
                {(() => {
                  const internalAllItems = doc.content.items || [];
                  const internalAllBlocks = doc.content.productionRateBlocks || [];
                  const internalItemOrder: string[] = (doc.content as any).itemOrder || [];
                  const originalItems = internalAllItems.filter(item => !item.name?.startsWith('[CO]'));
                  const changeOrderItems = internalAllItems.filter(item => item.name?.startsWith('[CO]'));
                  const internalNonOptBlocks = internalAllBlocks.filter((b: any) => !b.isOptional);
                  const internalBlocksSubtotalCents = internalNonOptBlocks.reduce(
                    (s: number, b: any) => s + Math.round((b.roomBuilderData?.grandTotal || 0) * 100),
                    0,
                  );
                  const originalItemsSubtotal = originalItems
                    .filter(item => !(item as any).descriptionOnly)
                    .reduce((sum, item) => sum + (item.total || 0), 0);
                  const originalTotal = originalItemsSubtotal + internalBlocksSubtotalCents;

                  const internalOrdered: Array<{ type: 'item' | 'block'; item?: any; block?: any }> = [];
                  if (internalItemOrder.length > 0) {
                    let iIdx = 0, bIdx = 0;
                    for (const t of internalItemOrder) {
                      if (t === 'block' && bIdx < internalAllBlocks.length) {
                        internalOrdered.push({ type: 'block', block: internalAllBlocks[bIdx++] });
                      } else if (t === 'item' && iIdx < originalItems.length) {
                        internalOrdered.push({ type: 'item', item: originalItems[iIdx++] });
                      }
                    }
                    while (bIdx < internalAllBlocks.length) internalOrdered.push({ type: 'block', block: internalAllBlocks[bIdx++] });
                    while (iIdx < originalItems.length) internalOrdered.push({ type: 'item', item: originalItems[iIdx++] });
                  } else {
                    internalAllBlocks.forEach(block => internalOrdered.push({ type: 'block', block }));
                    originalItems.forEach(item => internalOrdered.push({ type: 'item', item }));
                  }

                  let internalItemCounter = 0;
                  return (
                    <>
                      <div className="mt-6 space-y-4">
                        {internalOrdered.map((entry, i) => {
                          if (entry.type === 'block') {
                            return (
                              <div key={`block-${i}`}>
                                <ProductionRateBlocksSection blocks={[entry.block]} brandColor={settings?.useBrandColorOnDocs && settings?.brandColor ? settings.brandColor : null} noCard />
                              </div>
                            );
                          }
                          const idx = internalItemCounter++;
                          return (
                            <div key={`item-${i}`} className="border-b pb-4 last:border-0">
                              <LineItemRenderer item={entry.item} index={idx} mode="internal" proposalDefaults={doc.content?.proposalDisplayDefaults || null} pricesInCents={true} />
                            </div>
                          );
                        })}
                      </div>

                      {/* Original Subtotal - Only show if there are change order items */}
                      {changeOrderItems.length > 0 && (
                        <div className="flex justify-end pt-4">
                          <div className="w-full sm:w-64 space-y-2">
                            <div className="flex justify-between text-base font-medium border-t pt-2">
                              <span>Original Total</span>
                              <span>${(originalTotal / 100).toFixed(2)}</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Change Order Items Section */}
                      {changeOrderItems.length > 0 && (
                        <div className="mt-6 pt-6 border-t-2 border-dashed">
                          <h3 className="text-lg font-bold text-muted-foreground mb-4">
                            Accepted Change Orders
                          </h3>
                          
                          {/* Change Order Line Items */}
                          <div className="space-y-4">
                            {changeOrderItems.map((item, i) => (
                              <div key={i} className="border-b pb-4 last:border-0">
                                <LineItemRenderer item={item} index={i} mode="internal" proposalDefaults={doc.content?.proposalDisplayDefaults || null} pricesInCents={true} />
                              </div>
                            ))}
                          </div>

                          {/* Change Order Subtotal */}
                          <div className="flex justify-end pt-4">
                            <div className="w-full sm:w-64 space-y-2">
                              <div className="flex justify-between font-medium">
                                <span>Change Orders Total</span>
                                <span>${(changeOrderItems.reduce((sum, item) => sum + (item.total || 0), 0) / 100).toFixed(2)}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Grand Total with Tax Breakdown */}
                      {(() => {
                        const allItems = doc.content?.items || [];
                        const itemsTax = calcTax(allItems);
                        // Include non-optional production rate blocks in subtotal & tax.
                        const taxableBlocksCents = internalNonOptBlocks
                          .filter((b: any) => b.taxable)
                          .reduce((s: number, b: any) => s + Math.round((b.roomBuilderData?.grandTotal || 0) * 100), 0);
                        const blocksTaxCents = taxRate > 0 ? Math.round(taxableBlocksCents * taxRate / 100) : 0;
                        const subtotalWithBlocks = itemsTax.subtotal + internalBlocksSubtotalCents;
                        const totalTax = itemsTax.taxAmount + blocksTaxCents;
                        // Trust the stored doc.totalAmount as the source of truth — it already
                        // includes items + blocks + tax + any signed change orders. Falling back
                        // to the computed sum keeps things sane if totalAmount is missing.
                        const grandTotal = doc.totalAmount ?? (subtotalWithBlocks + totalTax);
                        const showBreakdown = totalTax > 0 || internalBlocksSubtotalCents > 0;
                        return (
                          <div className="flex justify-end pt-4">
                            <div className="w-full sm:w-64 space-y-2">
                              {showBreakdown && (
                                <>
                                  <div className="flex justify-between text-sm text-muted-foreground border-t pt-2 mt-2">
                                    <span>Subtotal</span>
                                    <span>${(subtotalWithBlocks / 100).toFixed(2)}</span>
                                  </div>
                                  {totalTax > 0 && (
                                    <div className="flex justify-between text-sm text-muted-foreground">
                                      <span>{taxProfileName ? `${taxProfileName} (${taxRate}%)` : `Tax (${taxRate}%)`}</span>
                                      <span>${(totalTax / 100).toFixed(2)}</span>
                                    </div>
                                  )}
                                </>
                              )}
                              <div className={`flex justify-between text-base sm:text-lg font-bold ${showBreakdown ? 'border-t pt-2' : 'border-t pt-2 mt-2'}`}>
                                <span>{changeOrderItems.length > 0 ? 'Grand Total' : 'Total'}</span>
                                <span>${(grandTotal / 100).toFixed(2)}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </>
                  );
                })()}

                {/* Notes */}
                {doc.content.notes && (
                  <div className="pt-6 border-t text-sm text-muted-foreground">
                    <h4 className="font-bold text-foreground mb-1">Notes:</h4>
                    <p>{doc.content.notes}</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        /* Full Document View for Proposals/Estimates/Change Orders */
        <Card className="shadow-lg border-t-4 border-t-primary">
          <CardContent className="p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-8">
            <InternalDocHeader
              doc={doc}
              isProposalOrEstimate={isProposalOrEstimate}
              validThroughDate={validThroughDate}
              openContactEditModal={openContactEditModal}
              openJobAddressEditModal={openJobAddressEditModal}
            />

            {/* Line Items & Production Rate Blocks - respecting itemOrder */}
            {(() => {
              const fullViewItems = doc.content.items || [];
              const fullViewBlocks = doc.content.productionRateBlocks || [];
              const fullViewOrder: string[] = (doc.content as any).itemOrder || [];

              const fullOrdered: Array<{ type: 'item' | 'block'; item?: any; block?: any; srcIdx?: number }> = [];
              if (fullViewOrder.length > 0) {
                let iIdx = 0, bIdx = 0;
                for (const t of fullViewOrder) {
                  if (t === 'block' && bIdx < fullViewBlocks.length) {
                    fullOrdered.push({ type: 'block', block: fullViewBlocks[bIdx++] });
                  } else if (t === 'item' && iIdx < fullViewItems.length) {
                    fullOrdered.push({ type: 'item', item: fullViewItems[iIdx], srcIdx: iIdx }); iIdx++;
                  }
                }
                while (bIdx < fullViewBlocks.length) fullOrdered.push({ type: 'block', block: fullViewBlocks[bIdx++] });
                while (iIdx < fullViewItems.length) { fullOrdered.push({ type: 'item', item: fullViewItems[iIdx], srcIdx: iIdx }); iIdx++; }
              } else {
                fullViewBlocks.forEach(block => fullOrdered.push({ type: 'block', block }));
                fullViewItems.forEach((item, idx) => fullOrdered.push({ type: 'item', item, srcIdx: idx }));
              }

              return (
                <div className="mt-6 sm:mt-8">
                  {fullOrdered.map((entry, i) => {
                    if (entry.type === 'block') {
                      return (
                        <div key={`block-${i}`}>
                          <ProductionRateBlocksSection blocks={[entry.block]} brandColor={settings?.useBrandColorOnDocs && settings?.brandColor ? settings.brandColor : null} noCard onEditBlock={canEdit ? ((blockId) => openEditWithFocus({ kind: 'block', blockId })) : undefined} onEditArea={canEdit ? ((blockId, roomId) => openEditWithFocus({ kind: 'block', blockId, roomId })) : undefined} />
                        </div>
                      );
                    }
                    return (
                      <CollapsibleLineItem key={`item-${i}`} item={entry.item} index={i} taxRate={taxRate} proposalDefaults={doc.content?.proposalDisplayDefaults || null} brandColor={settings?.useBrandColorOnDocs && settings?.brandColor ? settings.brandColor : null} mode="internal" onEdit={canEdit && entry.srcIdx !== undefined ? (() => openEditWithFocus({ kind: 'item', itemId: String(entry.srcIdx) })) : undefined} />
                    );
                  })}
                  <hr className="border-foreground mt-3" style={{ borderTopWidth: '3px' }} />
                </div>
              );
            })()}

            {/* Totals - Original Proposal Amount with Tax Breakdown */}
            {(() => {
              const proposalTax = calcTax(doc.content?.items || []);
              const hasSignedCOs = changeOrders && changeOrders.filter(co => co.signature && !co.archived).length > 0;
              const coTotal = changeOrders?.filter(co => co.signature && !co.archived).reduce((sum, co) => sum + co.totalAmount, 0) || 0;
              const fvNonOptBlocks = (doc.content?.productionRateBlocks || []).filter((b: any) => !b.isOptional);
              const fvBlocksCents = fvNonOptBlocks.reduce((s: number, b: any) => s + Math.round((b.roomBuilderData?.grandTotal || 0) * 100), 0);
              const fvNonOptItems = (doc.content?.items || []).filter((item: any) => !item.isOptional && !item.name?.startsWith('[CO]'));
              const fvItemsCents = fvNonOptItems.reduce((s: number, i: any) => s + (i.total || 0), 0);
              const baseSubtotal = fvNonOptBlocks.length > 0
                ? fvBlocksCents + fvItemsCents
                : doc.totalAmount - coTotal;
              const isSigned = !!doc.signature && doc.type !== 'invoice';
              const editDiscArr: { type: 'flat' | 'percentage'; value: number; label?: string }[] =
                doc.content?.discounts?.length ? doc.content.discounts
                : doc.content?.discount?.value ? [doc.content.discount] : [];
              let editDiscCents = 0;
              if (!isSigned && editDiscArr.length > 0) {
                for (const ed of editDiscArr) {
                  if (ed.value > 0) {
                    editDiscCents += ed.type === 'percentage'
                      ? Math.round(baseSubtotal * (ed.value / 100))
                      : Math.round(ed.value * 100);
                  }
                }
                editDiscCents = Math.min(editDiscCents, baseSubtotal);
              }
              const afterDiscount = baseSubtotal - editDiscCents;
              const taxableBase = proposalTax.taxableSubtotal || 0;
              const adjustedTax = editDiscCents > 0 && taxableBase > 0 && baseSubtotal > 0
                ? Math.round(taxableBase * (afterDiscount / baseSubtotal) * taxRate / 100)
                : proposalTax.taxAmount;
              const showBreakdown = adjustedTax > 0 || editDiscCents > 0;
              return (
                <div className="flex justify-end pt-4">
                  <div className="w-full sm:w-64 space-y-2">
                    {showBreakdown && (
                      <>
                        <div className="flex justify-between text-sm text-muted-foreground border-t pt-2 mt-2">
                          <span>Subtotal</span>
                          <span>${(baseSubtotal / 100).toFixed(2)}</span>
                        </div>
                        {editDiscArr.map((ed, edIdx) => {
                          if (!ed.value) return null;
                          const edAmt = ed.type === 'percentage'
                            ? Math.round(baseSubtotal * (ed.value / 100))
                            : Math.round(ed.value * 100);
                          return (
                            <div key={edIdx} className="flex justify-between text-sm text-emerald-600">
                              <span>{ed.label || 'Discount'}{ed.type === 'percentage' ? ` (${ed.value}%)` : ''}</span>
                              <span>-${(edAmt / 100).toFixed(2)}</span>
                            </div>
                          );
                        })}
                        {adjustedTax > 0 && (
                          <div className="flex justify-between text-sm text-muted-foreground">
                            <span>{taxProfileName ? `${taxProfileName} (${taxRate}%)` : `Tax (${taxRate}%)`}</span>
                            <span>${(adjustedTax / 100).toFixed(2)}</span>
                          </div>
                        )}
                      </>
                    )}
                    <div className={`flex justify-between text-base sm:text-lg font-bold ${showBreakdown ? 'border-t pt-2' : 'border-t pt-2 mt-2'}`}>
                      <span>{hasSignedCOs ? 'Original Total' : 'Total'}</span>
                      <span>${((afterDiscount + adjustedTax) / 100).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Change Orders Section - Collapsible with inline details when expanded */}
            {changeOrders && changeOrders.filter(co => co.signature && !co.archived).length > 0 && (
              <div className="mt-8 pt-6 border-t-2 border-dashed">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-muted-foreground">
                    This {doc.type.replace('_', ' ')} contains the following change orders:
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowChangeOrders(!showChangeOrders)}
                    data-testid="button-toggle-change-orders"
                  >
                    {showChangeOrders ? (
                      <>
                        <ChevronUp className="w-4 h-4 mr-2" />
                        Hide Details
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-4 h-4 mr-2" />
                        Show Details
                      </>
                    )}
                  </Button>
                </div>

                {/* Change Orders - Collapsed Summary or Expanded Details */}
                {changeOrders.filter(co => co.signature && !co.archived).map((co) => (
                  <div key={co.id} className={showChangeOrders ? "mt-6 pt-4 border-t" : "mb-2"}>
                    {/* Change Order Header */}
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">Change Order: {co.title}</span>
                      <Badge variant="outline" className="text-xs">
                        #{(co.documentNumber || co.id).toString().padStart(6, '0')}
                      </Badge>
                      <span className="font-bold ml-auto">${(co.totalAmount / 100).toFixed(2)}</span>
                    </div>
                    {co.signedAt && (
                      <p className="text-xs text-muted-foreground mb-2">
                        Accepted {format(new Date(co.signedAt), "MMM d, yyyy")}
                      </p>
                    )}

                    {/* Expanded Details - Full inline layout like customer portal */}
                    {showChangeOrders && co.content && (
                      <>
                        {/* Change Order Line Items + Production Rate Blocks */}
                        <div className="mt-4">
                          <ChangeOrderContentRenderer
                            content={co.content}
                            mode="internal"
                            testIdPrefix={`co-show-details-${co.id}`}
                          />
                        </div>

                        {/* Change Order Subtotal */}
                        <div className="flex justify-end pt-4">
                          <div className="w-64">
                            <div className="flex justify-between font-bold">
                              <span>Change Order Total</span>
                              <span>${(co.totalAmount / 100).toFixed(2)}</span>
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ))}

                {/* Combined Total */}
                <div className="flex justify-end pt-4 mt-4">
                  <div className="w-64 space-y-2">
                    <div className="flex justify-between text-muted-foreground text-sm">
                      <span>Change Orders Total</span>
                      <span>${(changeOrders.filter(co => co.signature && !co.archived).reduce((sum, co) => sum + co.totalAmount, 0) / 100).toFixed(2)}</span>
                    </div>
                    {(() => {
                      const allDocTax = calcTax(doc.content?.items || []);
                      return (
                        <>
                          {allDocTax.taxAmount > 0 && (
                            <div className="flex justify-between text-sm text-muted-foreground">
                              <span>{taxProfileName ? `${taxProfileName} (${taxRate}%)` : `Tax (${taxRate}%)`}</span>
                              <span>${(allDocTax.taxAmount / 100).toFixed(2)}</span>
                            </div>
                          )}
                          <div className="flex justify-between text-xl font-bold border-t-2 pt-2 text-primary">
                            <span>Grand Total</span>
                            <span>${(allDocTax.grandTotal / 100).toFixed(2)}</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}

            {/* Photos Section in Document View */}
            {(() => {
              const hiddenIds: number[] = (doc.content as any)?.hiddenDocumentPhotoIds || [];
              const visiblePhotos = docPhotos.filter((p: any) => !hiddenIds.includes(p.id));
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
              const ccPhotos2 = ((doc.content as any)?.includedCompanyCamPhotos || []) as string[];
              for (const url of ccPhotos2) {
                if (url && !seen.has(url)) {
                  seen.add(url);
                  extras.push({ url, label: 'CompanyCam' });
                }
              }
              return (visiblePhotos.length > 0 || extras.length > 0) ? <DocumentPhotoDisplay photos={visiblePhotos} extraPhotos={extras} /> : null;
            })()}

            {/* Payment Schedule - shown when enabled */}
            {doc.content?.paymentSettings?.showPaymentSchedule && doc.content.paymentSettings.depositRequired && doc.content.paymentSettings.schedule?.length > 0 && (() => {
              const cvPs = doc.content.paymentSettings;
              const cvTotalForSchedule = customerView ? cvEffectiveTotal : doc.totalAmount;
              const cvDepositCents = cvPs.depositType === 'percentage'
                ? Math.round(cvTotalForSchedule * (cvPs.depositAmount / 100))
                : Math.round(cvPs.depositAmount * 100);
              const cvOrigScheduleTotal = cvPs.schedule.reduce((s: number, item: any) => s + (item.amount || 0), 0);
              const cvRemainingAfterDeposit = Math.max(0, cvTotalForSchedule - cvDepositCents);
              let cvDistributed = 0;
              const cvAdjSchedule = cvPs.schedule.map((item: any, idx: number) => {
                let adj: number;
                if (cvOrigScheduleTotal <= 0) { adj = item.amount || 0; }
                else if (idx === cvPs.schedule.length - 1) { adj = Math.max(0, cvRemainingAfterDeposit - cvDistributed); }
                else { adj = Math.round(cvRemainingAfterDeposit * ((item.amount || 0) / cvOrigScheduleTotal)); cvDistributed += adj; }
                return { ...item, adjustedAmount: adj };
              });
              return (
              <div className="pt-6 mt-6 border-t" data-testid="payment-schedule-on-document-detail">
                <h4 className="font-bold text-foreground mb-3">Payment Schedule</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between py-2 border-b">
                    <div>
                      <span className="font-medium">Deposit</span>
                      <span className="text-muted-foreground ml-2">
                        ({cvPs.depositType === 'percentage' 
                          ? `${cvPs.depositAmount}%` 
                          : 'Fixed'})
                      </span>
                    </div>
                    <span className="font-medium">
                      {formatCurrency(cvDepositCents / 100)}
                    </span>
                  </div>
                  {cvAdjSchedule.map((item: any, idx: number) => (
                    <div key={idx} className="flex justify-between py-2 border-b last:border-0">
                      <span className="font-medium">{item.label || `Payment ${idx + 1}`}</span>
                      <span className="font-medium">
                        {formatCurrency(item.adjustedAmount / 100)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              );
            })()}

            {/* Paint Colors Section - Hidden for now, will redefine later */}
            {false && (doc.type === 'proposal' || doc.type === 'estimate') && (
              <div className="mt-8 pt-6 border-t" data-testid="section-paint-colors">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                  <div className="flex items-center gap-2">
                    <Palette className="w-5 h-5 text-muted-foreground" />
                    <h3 className="text-lg font-semibold">Paint Colors</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="toggle-color-submission" className="text-sm text-muted-foreground">
                      Allow client to submit paint colors
                    </Label>
                    <Switch
                      id="toggle-color-submission"
                      checked={doc.allowClientColorSubmission ?? false}
                      onCheckedChange={(checked) => toggleColorSubmissionMutation.mutate(checked)}
                      disabled={toggleColorSubmissionMutation.isPending}
                      data-testid="switch-allow-color-submission"
                    />
                  </div>
                </div>

                {doc.allowClientColorSubmission && colorSubmissionsData && colorSubmissionsData.length > 0 && (() => {
                  const latestSubmission = colorSubmissionsData[0];
                  const isPending = latestSubmission.status === 'pending' || doc.colorSubmissionStatus === 'pending_approval';
                  const isApproved = latestSubmission.status === 'approved' || doc.colorSubmissionStatus === 'approved';
                  const isRejected = latestSubmission.status === 'rejected' || doc.colorSubmissionStatus === 'needs_update';

                  return (
                    <div className="space-y-3">
                      <div className="rounded-md border">
                        <div className="p-3 border-b bg-muted/30">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-sm font-medium">
                              Submitted {latestSubmission.submittedAt ? format(new Date(latestSubmission.submittedAt), "MMM d, yyyy h:mm a") : ''}
                            </span>
                            {isApproved && (
                              <Badge className="bg-green-500 text-xs" data-testid="badge-colors-approved">
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Approved
                              </Badge>
                            )}
                            {isPending && (
                              <Badge className="bg-orange-500 text-xs" data-testid="badge-colors-pending">
                                Review Needed
                              </Badge>
                            )}
                            {isRejected && (
                              <Badge className="bg-red-500 text-xs" data-testid="badge-colors-rejected">
                                Update Requested
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="divide-y">
                          {(latestSubmission.entries as any[]).map((entry: any, idx: number) => (
                            <div key={idx} className="p-3 flex flex-wrap items-center gap-3" data-testid={`color-entry-${idx}`}>
                              {isApproved && <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />}
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm">{entry.groupLabel}</p>
                                <p className="text-sm text-muted-foreground">
                                  {entry.colorName}
                                  {entry.finish && ` \u2022 ${entry.finish}`}
                                  {entry.brand && ` \u2022 ${entry.brand}`}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                        {latestSubmission.reviewNote && (
                          <div className="p-3 border-t bg-red-50 dark:bg-red-950/20">
                            <p className="text-sm text-red-700 dark:text-red-300">
                              <span className="font-medium">Review Note:</span> {latestSubmission.reviewNote}
                            </p>
                          </div>
                        )}
                      </div>

                      {isPending && (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            className="bg-green-600"
                            onClick={() => approveColorsMutation.mutate(latestSubmission.id)}
                            disabled={approveColorsMutation.isPending}
                            data-testid="button-approve-colors"
                          >
                            {approveColorsMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                            Approve Colors
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => {
                              setRejectColorSubmissionId(latestSubmission.id);
                              setShowRejectColorDialog(true);
                            }}
                            data-testid="button-reject-colors"
                          >
                            <XCircle className="w-4 h-4 mr-2" />
                            Request Changes
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {doc.allowClientColorSubmission && (!colorSubmissionsData || colorSubmissionsData.length === 0) && (
                  <div className="space-y-3" data-testid="section-color-areas-editor">
                    <p className="text-sm text-muted-foreground">
                      Define which areas the client should pick colors for. They'll see this form after signing.
                    </p>
                    <div className="space-y-2">
                      {colorAreas.map((area, idx) => (
                        <div key={area.key} className="flex items-center gap-2" data-testid={`color-area-row-${idx}`}>
                          <Input
                            value={area.label}
                            onChange={(e) => {
                              const updated = [...colorAreas];
                              updated[idx] = { ...updated[idx], label: e.target.value };
                              setColorAreas(updated);
                            }}
                            placeholder="e.g. Living Room Walls"
                            className="flex-1"
                            data-testid={`input-color-area-${idx}`}
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              const updated = colorAreas.filter((_, i) => i !== idx);
                              setColorAreas(updated);
                            }}
                            data-testid={`button-remove-area-${idx}`}
                          >
                            <XCircle className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const key = `area_${Date.now()}`;
                          setColorAreas([...colorAreas, { key, label: '' }]);
                        }}
                        data-testid="button-add-color-area"
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Add Area
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => saveColorAreasMutation.mutate(colorAreas.filter(a => a.label.trim()))}
                        disabled={saveColorAreasMutation.isPending}
                        data-testid="button-save-color-areas"
                      >
                        {saveColorAreasMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                        Save Areas
                      </Button>
                    </div>
                    {doc.colorSubmissionStatus === 'not_submitted' && colorAreas.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Waiting for client to submit their paint color selections.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Reject Color Submission Dialog */}
            <Dialog open={showRejectColorDialog} onOpenChange={setShowRejectColorDialog}>
              <DialogContent className="sm:max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
                <DialogHeader>
                  <DialogTitle>Request Color Changes</DialogTitle>
                  <DialogDescription>
                    Let the client know what needs to be updated with their color selections.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <Textarea
                    placeholder="Optional note to the client (e.g., 'Please select a different finish for the living room')"
                    value={rejectColorNote}
                    onChange={(e) => setRejectColorNote(e.target.value)}
                    rows={3}
                    data-testid="textarea-reject-color-note"
                  />
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowRejectColorDialog(false);
                      setRejectColorNote("");
                      setRejectColorSubmissionId(null);
                    }}
                    data-testid="button-cancel-reject-colors"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => {
                      if (rejectColorSubmissionId) {
                        rejectColorsMutation.mutate({
                          submissionId: rejectColorSubmissionId,
                          note: rejectColorNote || undefined,
                        });
                      }
                    }}
                    disabled={rejectColorsMutation.isPending}
                    data-testid="button-confirm-reject-colors"
                  >
                    {rejectColorsMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    Send Request
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Signature Section - Only for non-invoices */}
            <div className="mt-12 pt-8 border-t-2 border-dashed">
              {doc.signature ? (
                <>
                  <p className="text-sm text-muted-foreground mb-4">Signed by {doc.contact.name}</p>
                  <div className="border p-4 inline-block bg-muted/10 rounded-lg">
                    <img src={doc.signature} alt="Signature" className="h-20" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Signed on {doc.signedAt ? format(new Date(doc.signedAt), "MMM d, yyyy h:mm a") : 'Unknown date'}
                  </p>
                </>
              ) : (doc.status === 'sent' || doc.status === 'viewed' || doc.status === 'draft') ? (
                <div className="flex justify-center py-4">
                  <Button 
                    onClick={() => setShowSignatureModal(true)}
                    className="bg-green-600 hover:bg-green-700"
                    size="lg"
                    data-testid="button-open-signature"
                  >
                    <PenLine className="w-4 h-4 mr-2" />
                    Accept & Sign {doc.type.replace('_', ' ')}
                  </Button>
                </div>
              ) : null}

            </div>

            {/* Notes */}
            {doc.content.notes && (
              <div className="pt-8 border-t text-sm text-muted-foreground">
                <h4 className="font-bold text-foreground mb-1">Notes:</h4>
                <p>{doc.content.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Signature Modal - rendered outside customerView conditional so it works in both views */}
      <Dialog open={showSignatureModal} onOpenChange={setShowSignatureModal}>
        <DialogContent className="sm:max-w-lg z-[10001]" overlayClassName="z-[10001]" onOpenAutoFocus={(e) => e.preventDefault()}>
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

      {/* Payments Section - Only for Invoices */}
      {doc.type === 'invoice' && (
        <Card className="mt-6">
          <CardHeader className="space-y-3">
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Payments
            </CardTitle>
            <div className="flex flex-col sm:flex-row gap-2">
              {userTier !== 'starter' && (
                <Button variant="outline" onClick={() => setShowRequestPaymentDialog(true)} data-testid="button-request-payment">
                  <Send className="w-4 h-4 mr-2" />
                  Request Payment
                </Button>
              )}
              <Button onClick={() => {
                setPaymentAmount((remainingBalance / 100).toFixed(2));
                setShowPaymentDialog(true);
              }} data-testid="button-receive-payment">
                <Plus className="w-4 h-4 mr-2" />
                Receive Payment
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Payment Summary */}
            <div className="grid grid-cols-3 gap-4 mb-6 p-4 bg-muted rounded-lg">
              <div>
                <p className="text-sm text-muted-foreground">Total Amount</p>
                <p className="text-xl font-bold">${(doc.totalAmount / 100).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Paid</p>
                <p className="text-xl font-bold text-green-600">${(totalPaid / 100).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Remaining Balance</p>
                <p className={cn("text-xl font-bold", remainingBalance > 0 ? "text-orange-600" : "text-green-600")}>
                  ${(remainingBalance / 100).toFixed(2)}
                </p>
              </div>
            </div>

            {/* Payment History */}
            {paymentsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : payments && payments.length > 0 ? (
              <div className="space-y-2">
                <h4 className="font-medium text-sm text-muted-foreground mb-3">Payment History</h4>
                <table className="w-full">
                  <thead>
                    <tr className="border-b text-sm">
                      <th className="text-left py-2 font-semibold text-muted-foreground">Date</th>
                      <th className="text-left py-2 font-semibold text-muted-foreground">Type</th>
                      <th className="text-left py-2 font-semibold text-muted-foreground">Notes</th>
                      <th className="text-right py-2 font-semibold text-muted-foreground">Amount</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((payment) => (
                      <tr key={payment.id} className="border-b last:border-0" data-testid={`payment-row-${payment.id}`}>
                        <td className="py-3">
                          {payment.paymentDate ? format(new Date(payment.paymentDate), "MMM d, yyyy") : '-'}
                        </td>
                        <td className="py-3">
                          <Badge variant="outline" className="capitalize">
                            {({ cash: 'Cash', check: 'Check', zelle: 'Zelle', venmo: 'Venmo', paypal: 'PayPal', credit_card: 'Credit Card' } as Record<string, string>)[payment.paymentType] ?? payment.paymentType.replace('_', ' ')}
                          </Badge>
                        </td>
                        <td className="py-3 text-muted-foreground text-sm">
                          {payment.notes || '-'}
                        </td>
                        <td className="py-3 text-right font-medium text-green-600">
                          ${(payment.amount / 100).toFixed(2)}
                        </td>
                        <td className="py-3">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deletePaymentMutation.mutate(payment.id)}
                            data-testid={`button-delete-payment-${payment.id}`}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-4">
                No payments recorded yet.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Download PDF & COI buttons at the bottom */}
      <div className={`flex flex-col items-center gap-3 py-4 ${customerView ? 'pb-28 bg-white' : ''}`}>
        <Button variant="outline" onClick={handleViewPDF} disabled={isGeneratingPDF} data-testid="button-view-pdf">
          {isGeneratingPDF ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <FileDown className="w-4 h-4 mr-2" />
          )}
          Download PDF
        </Button>

        {(() => {
          const rawCoiPath = linkedProject?.coiFilePath || settings?.coiFilePath;
          if (!rawCoiPath) return null;
          const coiPath = rawCoiPath.startsWith('/objects/') ? rawCoiPath : `/objects/${rawCoiPath}`;
          return (
            <Button
              variant="outline"
              onClick={() => window.open(coiPath, '_blank')}
              data-testid="button-view-coi"
            >
              <Shield className="w-4 h-4 mr-2" />
              View Certificate of Insurance
            </Button>
          );
        })()}
      </div>

      {/* Receive Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Receive Payment</DialogTitle>
            <DialogDescription>
              Enter the payment details for this invoice.
            </DialogDescription>
          </DialogHeader>
          
          {paymentLabel === 'Down Payment' && (
            <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-md text-sm text-blue-700 dark:text-blue-300" data-testid="text-down-payment-badge">
              <DollarSign className="w-4 h-4" />
              Auto-detected as Down Payment
            </div>
          )}

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount ($)</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                data-testid="input-payment-amount"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="paymentLabel">Payment Label</Label>
              <Select value={paymentLabel} onValueChange={setPaymentLabel}>
                <SelectTrigger data-testid="select-payment-label">
                  <SelectValue placeholder="Select label" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Payment">Payment</SelectItem>
                  <SelectItem value="Down Payment">Down Payment</SelectItem>
                  <SelectItem value="Final Payment">Final Payment</SelectItem>
                  <SelectItem value="Progress Payment">Progress Payment</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="paymentType">Payment Type</Label>
              <Select value={paymentType} onValueChange={setPaymentType}>
                <SelectTrigger data-testid="select-payment-type">
                  <SelectValue placeholder="Select payment type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="check">Check</SelectItem>
                  <SelectItem value="zelle">Zelle</SelectItem>
                  <SelectItem value="venmo">Venmo</SelectItem>
                  <SelectItem value="paypal">PayPal</SelectItem>
                  <SelectItem value="credit_card">Credit Card</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="paymentDate">Payment Date</Label>
              <Input
                id="paymentDate"
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                data-testid="input-payment-date"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                placeholder="Any additional notes about this payment..."
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                onFocus={(e) => setTimeout(() => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300)}
                data-testid="input-payment-notes"
              />
            </div>

            <div className="flex items-center justify-between pt-2 border-t">
              <div className="space-y-0.5">
                <Label htmlFor="notifyCustomer" className="text-sm font-medium cursor-pointer">Notify Customer</Label>
                <p className="text-xs text-muted-foreground">Send a receipt via SMS and email</p>
              </div>
              <Switch
                id="notifyCustomer"
                checked={notifyCustomer}
                onCheckedChange={setNotifyCustomer}
                data-testid="switch-notify-customer"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPaymentDialog(false)}>Cancel</Button>
            <Button 
              onClick={handleRecordPayment}
              disabled={createPaymentMutation.isPending}
              data-testid="button-confirm-payment"
            >
              {createPaymentMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              <DollarSign className="w-4 h-4 mr-2" />
              Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark as Paid Dialog (for proposals and invoices) */}
      <Dialog open={showMarkAsPaidDialog} onOpenChange={(open) => {
        setShowMarkAsPaidDialog(open);
        if (!open) {
          setMarkAsPaidInvoiceId(null);
          setPaymentAmount("");
          setPaymentType("");
          setPaymentNotes("");
          setNotifyCustomer(true);
          setPaymentLabel("");
        }
      }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Receive Payment</DialogTitle>
            <DialogDescription>
              Record a payment for this {doc.type === 'invoice' ? 'invoice' : 'accepted proposal'}.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="markAsPaidAmount">Amount ($)</Label>
              <Input
                id="markAsPaidAmount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                data-testid="input-mark-as-paid-amount"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="markAsPaidLabel">Payment Label</Label>
              <Select value={paymentLabel} onValueChange={setPaymentLabel}>
                <SelectTrigger data-testid="select-mark-as-paid-label">
                  <SelectValue placeholder="Select label" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Payment">Payment</SelectItem>
                  <SelectItem value="Down Payment">Down Payment</SelectItem>
                  <SelectItem value="Final Payment">Final Payment</SelectItem>
                  <SelectItem value="Progress Payment">Progress Payment</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="markAsPaidType">Payment Type</Label>
              <Select value={paymentType} onValueChange={setPaymentType}>
                <SelectTrigger data-testid="select-mark-as-paid-type">
                  <SelectValue placeholder="Select payment type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="check">Check</SelectItem>
                  <SelectItem value="zelle">Zelle</SelectItem>
                  <SelectItem value="venmo">Venmo</SelectItem>
                  <SelectItem value="paypal">PayPal</SelectItem>
                  <SelectItem value="credit_card">Credit Card</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="markAsPaidDate">Payment Date</Label>
              <Input
                id="markAsPaidDate"
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                data-testid="input-mark-as-paid-date"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="markAsPaidNotes">Notes (optional)</Label>
              <Textarea
                id="markAsPaidNotes"
                placeholder="Any additional notes about this payment..."
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                onFocus={(e) => setTimeout(() => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300)}
                data-testid="input-mark-as-paid-notes"
              />
            </div>

            <div className="flex items-center justify-between pt-2 border-t">
              <div className="space-y-0.5">
                <Label htmlFor="markAsPaidNotify" className="text-sm font-medium cursor-pointer">Notify Customer</Label>
                <p className="text-xs text-muted-foreground">Send a receipt via SMS and email</p>
              </div>
              <Switch
                id="markAsPaidNotify"
                checked={notifyCustomer}
                onCheckedChange={setNotifyCustomer}
                data-testid="switch-mark-as-paid-notify"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMarkAsPaidDialog(false)}>Cancel</Button>
            <Button 
              onClick={handleRecordMarkAsPaidPayment}
              disabled={createMarkAsPaidPaymentMutation.isPending}
              data-testid="button-confirm-mark-as-paid"
            >
              {createMarkAsPaidPaymentMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              <DollarSign className="w-4 h-4 mr-2" />
              Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Options Dialog */}
      <Dialog open={showSendOptionsDialog} onOpenChange={setShowSendOptionsDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Send {doc.type.replace('_', ' ')} to Customer</DialogTitle>
            <DialogDescription>
              Send this document to {doc.contact.name}.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-2 overflow-y-auto flex-1 min-h-0">
            {/* Copy Link - always available */}
            <div className="p-3 border rounded-lg space-y-2">
              <div className="flex items-center gap-3">
                <Link2 className="w-4 h-4" />
                <Label className="text-sm font-medium">Copy Link</Label>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  handleCopyLink();
                }}
                className="gap-2"
                data-testid="button-copy-link-send-dialog"
              >
                <Link2 className="w-4 h-4" />
                Copy Link to Clipboard
              </Button>
            </div>

            {/* Send via Phone (Native Messages app) — Starter & Core (no Twilio/OpenPhone) */}
            {userTier !== 'elite' && !canSendSmsCheck && doc.contact?.phone && (
            <div className={`p-3 border rounded-lg space-y-2 ${sendDocViaNativeSms ? '' : 'opacity-70'}`}>
              <div className="flex items-center gap-3">
                <Checkbox
                  id="sendDocViaNativeSms"
                  checked={sendDocViaNativeSms}
                  onCheckedChange={(checked) => setSendDocViaNativeSms(!!checked)}
                  data-testid="checkbox-send-doc-native-sms"
                />
                <Label htmlFor="sendDocViaNativeSms" className="flex items-center gap-2 cursor-pointer">
                  <MessageSquare className="w-4 h-4" />
                  Send via Phone
                  <span className="text-xs text-muted-foreground">(opens your Messages app)</span>
                </Label>
              </div>
              {sendDocViaNativeSms && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground pl-6">To: {formatPhoneDisplay(doc.contact.phone)}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setDraftSmsMessage(sendDocSmsMessage);
                      setDraftEmailSubject(sendDocEmailSubject);
                      setDraftEmailMessage(sendDocEmailMessage);
                      setShowEditMessagesDialog(true);
                    }}
                    className="w-full text-left p-3 bg-muted/50 rounded text-sm whitespace-pre-wrap break-words hover:bg-muted/70 transition-colors border border-transparent hover:border-border cursor-pointer"
                    data-testid="preview-doc-native-sms"
                  >
                    {sendDocSmsMessage || <span className="text-muted-foreground italic">No message content</span>}
                    <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground mt-2 pt-2 border-t">
                      <Pencil className="w-3 h-3" />
                      Tap to edit
                    </div>
                  </button>
                  <p className="text-xs text-muted-foreground pl-6">Tip: Tapping Send opens your Messages app with this pre-filled — you just tap Send.</p>
                </div>
              )}
            </div>
            )}

            {/* SMS Channel - Elite only with Twilio configured */}
            {userTier === 'elite' && canSendSmsCheck && (
            <div className={`p-3 border rounded-lg space-y-2 ${sendDocViaSms ? '' : 'opacity-70'}`}>
              <div className="flex items-center gap-3">
                <Checkbox
                  id="sendDocViaSms"
                  checked={sendDocViaSms}
                  onCheckedChange={(checked) => setSendDocViaSms(!!checked)}
                  disabled={!doc.contact.phone}
                  data-testid="checkbox-send-doc-sms"
                />
                <Label htmlFor="sendDocViaSms" className="flex items-center gap-2 cursor-pointer">
                  <MessageSquare className="w-4 h-4" />
                  SMS
                  {!doc.contact.phone && (
                    <span className="text-xs text-muted-foreground">(No phone)</span>
                  )}
                </Label>
              </div>
              {sendDocViaSms && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground pl-6">To: {doc.contact.phone ? formatPhoneDisplay(doc.contact.phone) : ''}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setDraftSmsMessage(sendDocSmsMessage);
                      setDraftEmailSubject(sendDocEmailSubject);
                      setDraftEmailMessage(sendDocEmailMessage);
                      setShowEditMessagesDialog(true);
                    }}
                    className="w-full text-left p-3 bg-muted/50 rounded text-sm whitespace-pre-wrap break-words hover:bg-muted/70 transition-colors border border-transparent hover:border-border cursor-pointer"
                    data-testid="preview-doc-sms"
                  >
                    {sendDocSmsMessage || <span className="text-muted-foreground italic">No message content</span>}
                    <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground mt-2 pt-2 border-t">
                      <Pencil className="w-3 h-3" />
                      Tap to edit
                    </div>
                  </button>
                </div>
              )}
            </div>
            )}

            {/* Email Channel - only when email is connected */}
            {(settings?.googleEmail || settings?.smtpConnectedAt) && (
            <div className={`p-3 border rounded-lg space-y-2 ${sendDocViaEmail ? '' : 'opacity-70'}`}>
              <div className="flex items-center gap-3">
                <Checkbox
                  id="sendDocViaEmail"
                  checked={sendDocViaEmail}
                  onCheckedChange={(checked) => setSendDocViaEmail(!!checked)}
                  disabled={!doc.contact.email}
                  data-testid="checkbox-send-doc-email"
                />
                <Label htmlFor="sendDocViaEmail" className="flex items-center gap-2 cursor-pointer">
                  <Mail className="w-4 h-4" />
                  Email
                  {!doc.contact.email && (
                    <span className="text-xs text-muted-foreground">(No email)</span>
                  )}
                </Label>
              </div>
              {sendDocViaEmail && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground pl-6">To: {doc.contact.email}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setDraftSmsMessage(sendDocSmsMessage);
                      setDraftEmailSubject(sendDocEmailSubject);
                      setDraftEmailMessage(sendDocEmailMessage);
                      setShowEditMessagesDialog(true);
                    }}
                    className="w-full text-left p-3 bg-muted/50 rounded text-sm hover:bg-muted/70 transition-colors border border-transparent hover:border-border cursor-pointer space-y-2"
                    data-testid="preview-doc-email"
                  >
                    <div className="font-medium" data-testid="preview-email-subject">
                      {sendDocEmailSubject || <span className="text-muted-foreground italic font-normal">No subject</span>}
                    </div>
                    <div className="whitespace-pre-wrap break-words text-muted-foreground">
                      {sendDocEmailMessage || <span className="italic">No message content</span>}
                    </div>
                    <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground pt-2 border-t">
                      <Pencil className="w-3 h-3" />
                      Tap to edit
                    </div>
                  </button>
                </div>
              )}
            </div>
            )}

            {/* Additional Recipients */}
            {projectRecipients && projectRecipients.length > 0 && (
              <div className="p-3 border rounded-lg space-y-2">
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="includeRecipients"
                    checked={includeAdditionalRecipients}
                    onCheckedChange={(checked) => setIncludeAdditionalRecipients(!!checked)}
                    data-testid="checkbox-include-recipients"
                  />
                  <Label htmlFor="includeRecipients" className="flex items-center gap-2 cursor-pointer text-sm font-medium">
                    <User className="w-4 h-4" />
                    Also send to additional recipients ({projectRecipients.length})
                  </Label>
                </div>
                {includeAdditionalRecipients && (
                  <div className="space-y-1 ml-7">
                    {projectRecipients.map((r) => (
                      <div key={r.id} className="text-xs text-muted-foreground flex flex-wrap gap-x-2">
                        <span className="font-medium text-foreground">{r.name}</span>
                        {r.phone && <span>{formatPhoneDisplay(r.phone)}</span>}
                        {r.email && <span>{r.email}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Send Timing - hidden for Starter tier */}
            {userTier !== 'starter' && (
            <div className="p-3 border rounded-lg space-y-3">
              <Label className="flex items-center gap-2 text-sm font-medium">
                <Clock className="w-4 h-4" />
                When to Send
              </Label>
              <RadioGroup value={sendTiming} onValueChange={(val: 'now' | 'working_hours' | 'scheduled') => setSendTiming(val)} className="space-y-2">
                <div className="flex items-center gap-3">
                  <RadioGroupItem value="now" id="timing-now" data-testid="radio-send-now" />
                  <Label htmlFor="timing-now" className="cursor-pointer text-sm">Send Now</Label>
                </div>
                <div className="flex items-center gap-3">
                  <RadioGroupItem value="working_hours" id="timing-wh" data-testid="radio-send-working-hours" />
                  <Label htmlFor="timing-wh" className="cursor-pointer text-sm">
                    Send During Working Hours
                    <span className="text-xs text-muted-foreground ml-1">(next available window)</span>
                  </Label>
                </div>
                <div className="flex items-center gap-3">
                  <RadioGroupItem value="scheduled" id="timing-schedule" data-testid="radio-send-scheduled" />
                  <Label htmlFor="timing-schedule" className="cursor-pointer text-sm">Schedule</Label>
                </div>
              </RadioGroup>
              {sendTiming === 'scheduled' && (
                <div className="flex items-center gap-2 pl-6 flex-wrap">
                  <Input
                    type="date"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className="w-auto"
                    data-testid="input-schedule-date"
                  />
                  <Input
                    type="time"
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    className="w-auto"
                    data-testid="input-schedule-time"
                  />
                </div>
              )}
            </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowSendOptionsDialog(false)} data-testid="button-cancel-send-dialog">
              {userTier === 'starter' ? 'Close' : 'Cancel'}
            </Button>
            {userTier !== 'starter' && !sendDocViaNativeSms && (
              <>
                {(!canSendSmsCheck || !doc.contact.phone) && ((!settings?.googleEmail && !settings?.smtpConnectedAt) || !doc.contact.email) ? (
                  <Button 
                    onClick={() => {
                      handleCopyLink();
                      setShowSendOptionsDialog(false);
                    }}
                    data-testid="button-copy-link-fallback"
                  >
                    <Link2 className="w-4 h-4 mr-2" />
                    Copy Link
                  </Button>
                ) : (
                  <Button 
                    onClick={async () => {
                      if (sendTiming === 'scheduled' && (!scheduledDate || !scheduledTime)) {
                        toast({ title: "Please select a date and time", variant: "destructive" });
                        return;
                      }
                      if (sendTiming === 'working_hours' || sendTiming === 'scheduled') {
                        let scheduledAtVal: string | null = null;
                        if (sendTiming === 'scheduled') {
                          scheduledAtVal = new Date(`${scheduledDate}T${scheduledTime}`).toISOString();
                        } else {
                          try {
                            const whRes = await fetch('/api/next-business-window', { credentials: 'include' });
                            const whData = await whRes.json();
                            scheduledAtVal = whData?.nextBusinessWindow || null;
                          } catch { /* fall through */ }
                        }
                        if (!scheduledAtVal) {
                          handleSendDocument();
                          return;
                        }
                        try {
                          const smsMsg = sendDocViaSms && doc.contact.phone ? (sendDocSmsMessage || getDefaultDocSmsMessage()) : null;
                          const emailSub = sendDocViaEmail && doc.contact.email ? (sendDocEmailSubject || getDefaultDocEmailSubject()) : null;
                          const emailMsg = sendDocViaEmail && doc.contact.email ? (sendDocEmailMessage || getDefaultDocEmailMessage()) : null;
                          const docTypeName = doc.type.replace('_', ' ');
                          const schedRes = await fetch('/api/scheduled-messages', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'include',
                            body: JSON.stringify({
                              contactId: doc.contactId,
                              phoneNumber: smsMsg ? doc.contact.phone : null,
                              body: smsMsg,
                              scheduledAt: scheduledAtVal,
                              emailTo: emailMsg ? doc.contact.email : null,
                              emailSubject: emailSub,
                              emailBody: emailMsg,
                              emailFromName: settings?.companyName || null,
                              emailCtaText: emailMsg ? `View Your ${docTypeName.charAt(0).toUpperCase() + docTypeName.slice(1)}` : null,
                              emailCtaUrl: emailMsg ? (portalLink || null) : null,
                            }),
                          });
                          if (!schedRes.ok) {
                            const errData = await schedRes.json().catch(() => ({}));
                            throw new Error(errData.message || 'Failed to schedule');
                          }
                          toast({ 
                            title: sendTiming === 'working_hours' ? "Queued for Working Hours" : "Scheduled",
                            description: sendTiming === 'working_hours' 
                              ? "Message will be sent during your next working hours window."
                              : `Message scheduled for ${scheduledDate} at ${scheduledTime}.`
                          });
                        } catch (err: any) {
                          toast({ title: "Failed to schedule", description: err.message, variant: "destructive" });
                        }
                        setShowSendOptionsDialog(false);
                        return;
                      }
                      handleSendDocument();
                    }}
                    disabled={isSendingSms || isSendingEmail || (!sendDocViaSms && !sendDocViaEmail)}
                    data-testid="button-send-document-confirm"
                  >
                    {(isSendingSms || isSendingEmail) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    {sendTiming === 'now' ? (
                      <><Send className="w-4 h-4 mr-2" /> Send Now</>
                    ) : sendTiming === 'working_hours' ? (
                      <><Clock className="w-4 h-4 mr-2" /> Queue for Working Hours</>
                    ) : (
                      <><CalendarClock className="w-4 h-4 mr-2" /> Schedule Send</>
                    )}
                  </Button>
                )}
              </>
            )}
            {userTier !== 'elite' && (sendDocViaEmail || sendDocViaNativeSms) && (
              <Button
                onClick={async () => {
                  if (sendDocViaNativeSms && doc.contact?.phone) {
                    if (doc.type !== 'invoice') {
                      const ok = await publishDocument(doc.id);
                      if (!ok) return;
                    }
                    const msg = sendDocSmsMessage || getDefaultDocSmsMessage();
                    window.location.href = `sms:${doc.contact.phone}?body=${encodeURIComponent(msg)}`;
                    handleStatusChange('sent');
                    if (sendDocViaEmail && doc.contact?.email) {
                      handleSendDocument();
                    } else {
                      toast({ title: "Opening Messages…", description: "Tap Send in your Messages app to deliver." });
                      setShowSendOptionsDialog(false);
                    }
                  } else {
                    handleSendDocument();
                  }
                }}
                disabled={isSendingEmail}
                data-testid="button-send-non-elite"
              >
                {isSendingEmail && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                <Send className="w-4 h-4 mr-2" />
                {sendDocViaNativeSms && sendDocViaEmail ? 'Send Both' : sendDocViaNativeSms ? 'Send via Messages' : 'Send Email'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Messages Dialog (sub-dialog of Send Options) */}
      <Dialog
        open={showEditMessagesDialog}
        onOpenChange={(open) => {
          if (!open) {
            const hasUnsavedSms = (sendDocViaSms || sendDocViaNativeSms) && draftSmsMessage !== sendDocSmsMessage;
            const hasUnsavedEmail = sendDocViaEmail && (draftEmailSubject !== sendDocEmailSubject || draftEmailMessage !== sendDocEmailMessage);
            if ((hasUnsavedSms || hasUnsavedEmail) && !window.confirm('Discard your changes?')) {
              return;
            }
          }
          setShowEditMessagesDialog(open);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Edit Messages</DialogTitle>
            <DialogDescription>
              Customize the SMS and email content before sending.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 flex flex-col gap-5 py-2 min-h-0 overflow-hidden">
            {(sendDocViaSms || sendDocViaNativeSms) && (
              <div className="flex flex-col min-h-0 flex-1">
                <div className="flex-shrink-0 pb-2 border-b">
                  <Label className="flex items-center gap-2 text-sm font-semibold">
                    <MessageSquare className="w-4 h-4" />
                    Text Message
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">To: {doc.contact.phone ? formatPhoneDisplay(doc.contact.phone) : ''}</p>
                </div>
                <Textarea
                  placeholder="Type your SMS message..."
                  value={draftSmsMessage}
                  onChange={(e) => setDraftSmsMessage(e.target.value)}
                  className="flex-1 min-h-[160px] text-sm mt-2 resize-none"
                  data-testid="textarea-doc-sms-message"
                />
                <p className="flex-shrink-0 text-[11px] text-muted-foreground text-right mt-1">{draftSmsMessage.length} chars</p>
              </div>
            )}
            {sendDocViaEmail && (
              <div className="flex flex-col min-h-0 flex-1">
                <div className="flex-shrink-0 pb-2 border-b">
                  <Label className="flex items-center gap-2 text-sm font-semibold">
                    <Mail className="w-4 h-4" />
                    Email
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">To: {doc.contact.email}</p>
                </div>
                <Textarea
                  placeholder="Type your email message..."
                  value={draftEmailMessage}
                  onChange={(e) => setDraftEmailMessage(e.target.value)}
                  className="flex-1 min-h-[220px] text-sm mt-2 resize-none"
                  data-testid="textarea-doc-email-message"
                />
              </div>
            )}
            {!sendDocViaSms && !sendDocViaNativeSms && !sendDocViaEmail && (
              <p className="text-sm text-muted-foreground text-center py-8">
                Enable SMS or Email in the previous screen to edit a message.
              </p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowEditMessagesDialog(false)}
              data-testid="button-cancel-edit-messages"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (sendDocViaSms || sendDocViaNativeSms) setSendDocSmsMessage(draftSmsMessage);
                if (sendDocViaEmail) {
                  setSendDocEmailSubject(draftEmailSubject);
                  setSendDocEmailMessage(draftEmailMessage);
                }
                setShowEditMessagesDialog(false);
              }}
              data-testid="button-save-edit-messages"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SMS Send Dialog */}
      <Dialog open={showSmsDialog} onOpenChange={setShowSmsDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm: Send {doc.type.replace('_', ' ')} via SMS</DialogTitle>
            <DialogDescription>
              You are about to send a text message to {doc.contact.name}.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-yellow-700">Please verify the phone number is correct</p>
                <p className="text-yellow-600">This message will be sent immediately.</p>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Sending to:</p>
              <p className="text-lg font-semibold">{doc.contact.phone ? formatPhoneDisplay(doc.contact.phone) : ''}</p>
              <p className="text-sm text-muted-foreground">({doc.contact.name})</p>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Message preview:</p>
              <div className="p-3 bg-muted rounded-lg text-sm">
                Hi {doc.contact.name}, here's your {doc.type.replace('_', ' ')} from {settings?.companyName || 'us'}. View and sign here: {portalLink}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSmsDialog(false)}>Cancel</Button>
            <Button 
              onClick={handleSendViaSms} 
              disabled={isSendingSms}
              data-testid="button-confirm-send-sms"
            >
              {isSendingSms && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              <Send className="w-4 h-4 mr-2" />
              Yes, Send SMS
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email Send Dialog */}
      <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm: Send {doc.type.replace('_', ' ')} via Email</DialogTitle>
            <DialogDescription>
              You are about to send an email to {doc.contact.name}.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-yellow-700">Please verify the email address is correct</p>
                <p className="text-yellow-600">This email will be sent immediately from your Gmail.</p>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Sending to:</p>
              <p className="text-lg font-semibold">{doc.contact.email}</p>
              <p className="text-sm text-muted-foreground">({doc.contact.name})</p>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">From:</p>
              <p className="text-sm text-muted-foreground">{settings?.googleEmail || settings?.smtpFromEmail || settings?.smtpUser}</p>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Subject:</p>
              <div className="p-2 bg-muted rounded-lg text-sm">
                Your {doc.type.replace('_', ' ')} from {settings?.companyName || 'us'}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Message preview:</p>
              <div className="p-3 bg-muted rounded-lg text-sm whitespace-pre-line">
                Hi {doc.contact.name},{'\n\n'}Please find your {doc.type.replace('_', ' ')} ready for review.{'\n\n'}View and sign here: {portalLink}{'\n\n'}Thank you for your business!{'\n\n'}{settings?.companyName || ''}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEmailDialog(false)}>Cancel</Button>
            <Button 
              onClick={handleSendViaEmail} 
              disabled={isSendingEmail}
              data-testid="button-confirm-send-email"
            >
              {isSendingEmail && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              <Mail className="w-4 h-4 mr-2" />
              Yes, Send Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Request Payment Dialog */}
      <Dialog open={showRequestPaymentDialog} onOpenChange={setShowRequestPaymentDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Request Payment</DialogTitle>
            <DialogDescription>
              Send a payment request to {doc.contact.name}.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4 overflow-y-auto flex-1 min-h-0">
            <div className="space-y-2">
              <Label htmlFor="requestAmount">Amount to Request ($)</Label>
              <Input
                id="requestAmount"
                type="number"
                step="0.01"
                min="0"
                placeholder={remainingBalance > 0 ? (remainingBalance / 100).toFixed(2) : "0.00"}
                value={requestPaymentAmount}
                onChange={(e) => setRequestPaymentAmount(e.target.value)}
                data-testid="input-request-amount"
              />
              {remainingBalance > 0 && (
                <p className="text-sm text-muted-foreground">
                  Remaining balance: ${(remainingBalance / 100).toFixed(2)}
                </p>
              )}
            </div>

            {/* SMS Section - only when SMS is configured */}
            {canSendSmsCheck && (
            <div className="space-y-3 p-3 border rounded-lg">
              <div className="flex items-center gap-3">
                <Checkbox 
                  id="sendViaSms"
                  checked={sendPaymentViaSms}
                  onCheckedChange={(checked) => setSendPaymentViaSms(!!checked)}
                  disabled={!doc.contact.phone}
                  data-testid="checkbox-send-sms"
                />
                <Label htmlFor="sendViaSms" className="flex items-center gap-2 cursor-pointer">
                  <MessageSquare className="w-4 h-4" />
                  Send via SMS
                  {!doc.contact.phone && (
                    <span className="text-xs text-muted-foreground">(No phone number)</span>
                  )}
                </Label>
              </div>
              {sendPaymentViaSms && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">To: {doc.contact.phone ? formatPhoneDisplay(doc.contact.phone) : ''}</p>
                  <Textarea
                    placeholder="Type your SMS message..."
                    value={requestPaymentSmsMessage}
                    onChange={(e) => setRequestPaymentSmsMessage(e.target.value)}
                    className="min-h-[80px] max-h-[30vh] text-sm"
                    data-testid="textarea-sms-message"
                  />
                  <p className="text-xs text-muted-foreground">Pre-filled from template. Edit before sending.</p>
                </div>
              )}
            </div>
            )}

            {/* Email Section - only when email is connected */}
            {(settings?.googleEmail || settings?.smtpConnectedAt) && (
            <div className="space-y-3 p-3 border rounded-lg">
              <div className="flex items-center gap-3">
                <Checkbox 
                  id="sendViaEmail"
                  checked={sendPaymentViaEmail}
                  onCheckedChange={(checked) => setSendPaymentViaEmail(!!checked)}
                  disabled={!doc.contact.email}
                  data-testid="checkbox-send-email"
                />
                <Label htmlFor="sendViaEmail" className="flex items-center gap-2 cursor-pointer">
                  <Mail className="w-4 h-4" />
                  Send via Email
                  {!doc.contact.email && (
                    <span className="text-xs text-muted-foreground">(No email address)</span>
                  )}
                </Label>
              </div>
              {sendPaymentViaEmail && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">To: {doc.contact.email}</p>
                  <Textarea
                    placeholder="Type your email message..."
                    value={requestPaymentEmailMessage}
                    onChange={(e) => setRequestPaymentEmailMessage(e.target.value)}
                    className="min-h-[100px] max-h-[30vh] text-sm"
                    data-testid="textarea-email-message"
                  />
                  <p className="text-xs text-muted-foreground">Pre-filled from template. Edit before sending.</p>
                </div>
              )}
            </div>
            )}

            {userTier !== 'starter' && (
            <div className="p-3 border rounded-lg space-y-3">
              <Label className="flex items-center gap-2 text-sm font-medium">
                <Clock className="w-4 h-4" />
                When to Send
              </Label>
              <RadioGroup value={paymentSendTiming} onValueChange={(val: 'now' | 'working_hours' | 'scheduled') => setPaymentSendTiming(val)} className="space-y-2">
                <div className="flex items-center gap-3">
                  <RadioGroupItem value="now" id="pmt-timing-now" data-testid="radio-pmt-send-now" />
                  <Label htmlFor="pmt-timing-now" className="cursor-pointer text-sm">Send Now</Label>
                </div>
                <div className="flex items-center gap-3">
                  <RadioGroupItem value="working_hours" id="pmt-timing-wh" data-testid="radio-pmt-send-working-hours" />
                  <Label htmlFor="pmt-timing-wh" className="cursor-pointer text-sm">
                    Send During Working Hours
                    <span className="text-xs text-muted-foreground ml-1">(next available window)</span>
                  </Label>
                </div>
                <div className="flex items-center gap-3">
                  <RadioGroupItem value="scheduled" id="pmt-timing-schedule" data-testid="radio-pmt-send-scheduled" />
                  <Label htmlFor="pmt-timing-schedule" className="cursor-pointer text-sm">Schedule</Label>
                </div>
              </RadioGroup>
              {paymentSendTiming === 'scheduled' && (
                <div className="flex items-center gap-2 pl-6 flex-wrap">
                  <Input
                    type="date"
                    value={paymentScheduledDate}
                    onChange={(e) => setPaymentScheduledDate(e.target.value)}
                    className="w-auto"
                    data-testid="input-pmt-schedule-date"
                  />
                  <Input
                    type="time"
                    value={paymentScheduledTime}
                    onChange={(e) => setPaymentScheduledTime(e.target.value)}
                    className="w-auto"
                    data-testid="input-pmt-schedule-time"
                  />
                </div>
              )}
            </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRequestPaymentDialog(false)}>Cancel</Button>
            {(!canSendSmsCheck || !doc.contact.phone) && ((!settings?.googleEmail && !settings?.smtpConnectedAt) || !doc.contact.email) ? (
              <Button 
                onClick={() => {
                  handleCopyLink();
                  setShowRequestPaymentDialog(false);
                }}
                data-testid="button-copy-link-fallback"
              >
                <Link2 className="w-4 h-4 mr-2" />
                Copy Link
              </Button>
            ) : (
              <Button 
                onClick={handleSendPaymentRequest}
                disabled={isSendingSms || isSendingEmail || (!sendPaymentViaSms && !sendPaymentViaEmail)}
                data-testid="button-send-payment-request"
              >
                {(isSendingSms || isSendingEmail) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {paymentSendTiming === 'now' ? (
                  <><Send className="w-4 h-4 mr-2" /> Send Now</>
                ) : paymentSendTiming === 'working_hours' ? (
                  <><Clock className="w-4 h-4 mr-2" /> Queue for Working Hours</>
                ) : (
                  <><CalendarClock className="w-4 h-4 mr-2" /> Schedule Send</>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* View History Dialog */}
      <Dialog open={showViewHistory} onOpenChange={setShowViewHistory}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" />
              View History
            </DialogTitle>
            <DialogDescription>
              Customer views of this document
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 max-h-80 overflow-y-auto">
            {viewHistoryLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : viewHistory && viewHistory.length > 0 ? (
              (() => {
                const uniqueIps = new Set(viewHistory.filter(v => v.ipAddress && v.ipAddress !== 'unknown').map(v => v.ipAddress));
                const getDeviceLabel = (ua: string | null) => {
                  if (!ua) return 'Unknown';
                  if (/bot|crawl|spider|preview|facebookexternalhit|Twitterbot|Slackbot|WhatsApp|TelegramBot|Discordbot|LinkedInBot|Googlebot|bingbot|Applebot|iMessageBot|HeadlessChrome|curl|wget|python-requests|Go-http-client|node-fetch|axios/i.test(ua)) return 'Bot/Preview';
                  if (/iPhone|iPad/i.test(ua)) return 'iPhone/iPad';
                  if (/Android/i.test(ua)) return 'Android';
                  if (/Mac OS/i.test(ua)) return 'Mac';
                  if (/Windows/i.test(ua)) return 'Windows';
                  if (/Linux/i.test(ua)) return 'Linux';
                  return 'Other';
                };
                const humanViews = viewHistory.filter(v => getDeviceLabel(v.userAgent) !== 'Bot/Preview');
                const botViews = viewHistory.length - humanViews.length;
                return (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-3 pb-2 border-b">
                      <div className="text-center flex-1">
                        <p className="text-2xl font-bold" data-testid="text-view-count">{doc.viewCount}</p>
                        <p className="text-xs text-muted-foreground">Counted Views</p>
                      </div>
                      <div className="text-center flex-1">
                        <p className="text-2xl font-bold" data-testid="text-unique-viewers">{uniqueIps.size}</p>
                        <p className="text-xs text-muted-foreground">Unique Devices</p>
                      </div>
                      {botViews > 0 && (
                        <div className="text-center flex-1">
                          <p className="text-2xl font-bold text-muted-foreground" data-testid="text-bot-views">{botViews}</p>
                          <p className="text-xs text-muted-foreground">Bot/Preview</p>
                        </div>
                      )}
                    </div>
                    {humanViews.map((view, index) => (
                      <div 
                        key={view.id} 
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium text-sm">
                            {humanViews.length - index}
                          </div>
                          <div>
                            <p className="font-medium text-sm">
                              {view.viewedAt ? format(new Date(view.viewedAt), "MMMM d, yyyy") : 'Unknown date'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {view.viewedAt ? format(new Date(view.viewedAt), "h:mm a") : ''}
                              {' · '}
                              {getDeviceLabel(view.userAgent)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                    {botViews > 0 && (
                      <p className="text-xs text-muted-foreground text-center pt-1">
                        {botViews} bot/link preview visit{botViews !== 1 ? 's' : ''} hidden
                      </p>
                    )}
                  </div>
                );
              })()
            ) : (
              <p className="text-center text-muted-foreground py-8">
                No views recorded yet
              </p>
            )}
          </div>

          <DialogFooter>
            <Button onClick={() => setShowViewHistory(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Call Confirmation Dialog */}
      <Dialog open={showCallConfirm} onOpenChange={setShowCallConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
              Place a Call?
            </DialogTitle>
            <DialogDescription>
              You are about to place a call to {doc.contact.name}
            </DialogDescription>
          </DialogHeader>
          {!hasOfficePhone && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md p-3 text-sm text-amber-700 dark:text-amber-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>Office phone not set. Go to Settings &gt; Integrations &gt; Twilio to add your office or cell number for call bridging.</span>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowCallConfirm(false)}>
              Cancel
            </Button>
            <Button onClick={handleCallConfirm} disabled={!hasOfficePhone || isCallingDoc} data-testid="button-confirm-call">
              <Phone className="w-4 h-4 mr-2" />
              Call via Office Phone
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* OpenPhone Call Options Dialog */}
      <Dialog open={showOpenPhoneCallDialog} onOpenChange={setShowOpenPhoneCallDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Phone className="w-5 h-5" />
              Call {doc.contact.name}
            </DialogTitle>
            <DialogDescription>
              Your phone system is set to OpenPhone. You can call using the OpenPhone app, or use your device's phone dialer.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Button 
              variant="outline" 
              className="gap-2 justify-start"
              onClick={() => {
                setShowOpenPhoneCallDialog(false);
                window.open(`https://app.openphone.com`, '_blank');
              }}
              data-testid="button-call-openphone-app"
            >
              <Phone className="w-4 h-4" />
              Open OpenPhone App
            </Button>
            <Button 
              variant="outline" 
              className="gap-2 justify-start"
              onClick={() => {
                setShowOpenPhoneCallDialog(false);
                window.location.href = `tel:${doc.contact.phone}`;
              }}
              data-testid="button-call-device-dialer"
            >
              <Phone className="w-4 h-4" />
              Call from Device
            </Button>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowOpenPhoneCallDialog(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this {doc.type === 'change_order' ? 'change order' : doc.type}?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong className="text-destructive">This cannot be undone.</strong>
              {doc.type === 'proposal' || doc.type === 'estimate' ? ' Deleting this proposal will also remove any change orders attached to it and any payment history on its linked invoice.' : ''}
              {doc.type === 'invoice' && !doc.sourceDocumentId ? ' Any recorded payments on this invoice will be lost.' : ''}
              {doc.type === 'change_order' ? ' The change order amount will be removed from the parent proposal and its linked invoice.' : ''}
              {' '}If you just want to hide it, choose Archive instead — archived documents can always be restored.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                deleteDocument(doc.id, {
                  onSuccess: () => {
                    toast({ title: "Document deleted successfully" });
                    setLocation("/documents");
                  },
                  onError: (error) => {
                    toast({ 
                      title: "Failed to delete document", 
                      description: error.message,
                      variant: "destructive" 
                    });
                  }
                });
              }}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete-doc"
            >
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Copy Proposal Dialog */}
      <AlertDialog open={showCopyDialog} onOpenChange={setShowCopyDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Copy Proposal</AlertDialogTitle>
            <AlertDialogDescription>
              Create a duplicate of this {doc.type} with the same details. The copy will be in draft status with a new number.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2 py-2">
            <Button
              variant="outline"
              className="justify-start gap-2 h-auto py-3"
              disabled={isCopying}
              onClick={async () => {
                setIsCopying(true);
                try {
                  const res = await fetch(`/api/documents/${doc.id}/copy`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ mode: 'same_project' }),
                  });
                  if (!res.ok) throw new Error((await res.json()).message || 'Failed to copy');
                  const newDoc = await res.json();
                  toast({ title: "Proposal copied", description: "Added to the same project as a draft." });
                  setShowCopyDialog(false);
                  setLocation(`/documents/${newDoc.id}`);
                } catch (err: any) {
                  toast({ title: "Failed to copy", description: err.message, variant: "destructive" });
                } finally {
                  setIsCopying(false);
                }
              }}
              data-testid="button-copy-same-project"
            >
              <FolderOpen className="w-4 h-4" />
              <div className="text-left">
                <div className="font-medium">Same Project</div>
                <div className="text-xs text-muted-foreground">Add the copy to project #{doc.projectId}</div>
              </div>
              {isCopying && <Loader2 className="w-4 h-4 animate-spin ml-auto" />}
            </Button>
            <Button
              variant="outline"
              className="justify-start gap-2 h-auto py-3"
              disabled={isCopying}
              onClick={async () => {
                setIsCopying(true);
                try {
                  const res = await fetch(`/api/documents/${doc.id}/copy`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ mode: 'new_project' }),
                  });
                  if (!res.ok) throw new Error((await res.json()).message || 'Failed to copy');
                  const newDoc = await res.json();
                  toast({ title: "Proposal copied", description: "Created in a new project as a draft." });
                  setShowCopyDialog(false);
                  setLocation(`/documents/${newDoc.id}`);
                } catch (err: any) {
                  toast({ title: "Failed to copy", description: err.message, variant: "destructive" });
                } finally {
                  setIsCopying(false);
                }
              }}
              data-testid="button-copy-new-project"
            >
              <Plus className="w-4 h-4" />
              <div className="text-left">
                <div className="font-medium">New Project</div>
                <div className="text-xs text-muted-foreground">Create a new project with the copied proposal</div>
              </div>
              {isCopying && <Loader2 className="w-4 h-4 animate-spin ml-auto" />}
            </Button>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Change Order Confirmation Dialog */}
      <AlertDialog open={showDeleteCOConfirm} onOpenChange={setShowDeleteCOConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this change order?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong className="text-destructive">This cannot be undone.</strong> The change order amount will be removed from the parent proposal and its linked invoice.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!selectedChangeOrder) return;
                deleteDocument(selectedChangeOrder.id, {
                  onSuccess: () => {
                    toast({ title: "Change order deleted successfully" });
                    setShowDeleteCOConfirm(false);
                    setSelectedChangeOrder(null);
                    queryClient.invalidateQueries({ queryKey: ['/api/documents', doc.id, 'change-orders'] });
                  },
                  onError: (error) => {
                    toast({ 
                      title: "Failed to delete change order", 
                      description: error.message,
                      variant: "destructive" 
                    });
                  }
                });
              }}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete-co"
            >
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Archive Document Confirmation Dialog */}
      <AlertDialog open={showArchiveConfirm} onOpenChange={setShowArchiveConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Document</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to archive this {doc.type}? Archived documents can be restored later from the Documents page.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                archiveDocMutation.mutate({ id: doc.id, archived: true });
                setShowArchiveConfirm(false);
              }}
              data-testid="button-confirm-archive-doc"
            >
              {archiveDocMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Restore Document Confirmation Dialog */}
      <AlertDialog open={showRestoreConfirm} onOpenChange={setShowRestoreConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore Document</AlertDialogTitle>
            <AlertDialogDescription>
              Do you really want to restore this {doc.type}? It will be moved back to your active documents.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                archiveDocMutation.mutate({ id: doc.id, archived: false });
                setShowRestoreConfirm(false);
              }}
              data-testid="button-confirm-restore-doc"
            >
              {archiveDocMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Archive Change Order Confirmation Dialog */}
      <AlertDialog open={showArchiveCOConfirm} onOpenChange={setShowArchiveCOConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Change Order</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to archive this change order? Archived change orders can be restored later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!selectedChangeOrder) return;
                archiveMutation.mutate({ id: selectedChangeOrder.id, archived: true });
                setShowArchiveCOConfirm(false);
                setSelectedChangeOrder(null);
              }}
              data-testid="button-confirm-archive-co"
            >
              {archiveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      {showPaymentSettingsModal && doc && (
        <Dialog open={showPaymentSettingsModal} onOpenChange={(open) => { if (!open) setShowPaymentSettingsModal(false); }}>
          <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <DollarSign className="w-5 h-5" />
                Payment & Deposit Settings
              </DialogTitle>
            </DialogHeader>
            <PaymentSettingsSection
              totalAmount={doc.totalAmount}
              paymentSettings={doc.content?.paymentSettings}
              onPaymentSettingsChange={(newSettings) => {
                const updatedContent = { ...doc.content, paymentSettings: newSettings };
                updateDoc({ id: doc.id, data: { content: updatedContent } });
              }}
              disabled={doc.type === 'invoice' ? doc.status === 'paid' : ['accepted', 'paid', 'rejected'].includes(doc.status)}
              isInvoice={doc.type === 'invoice'}
              userTier={userTier}
              financingAvailable={!!settings?.financingEnabled && !!settings?.financingLink}
              companyState={settings?.state}
            />
          </DialogContent>
        </Dialog>
      )}

      {showPackageSettingsModal && doc && (
        <ProposalPackageSettingsModal
          open={showPackageSettingsModal}
          onClose={() => setShowPackageSettingsModal(false)}
          packages={(doc.content as any)?.proposalPackagesData || []}
          materialAdjustments={(doc.content as any)?.proposalMaterialAdjustments ?? false}
          onPackagesChange={(pkgs) => {
            pendingPkgChangesRef.current = { ...pendingPkgChangesRef.current, proposalPackagesData: pkgs };
            flushPkgChanges();
          }}
          onMaterialAdjustmentsChange={(val) => {
            pendingPkgChangesRef.current = { ...pendingPkgChangesRef.current, proposalMaterialAdjustments: val };
            flushPkgChanges();
          }}
        />
      )}

      {/* Create Change Order - Fullscreen portal (same pattern as CreateDocumentDialog) */}
      <CreateChangeOrderDialog
        contactId={doc.contactId}
        sourceDocumentId={doc.id}
        originalTotalAmount={doc.totalAmount}
        open={showCreateChangeOrder}
        onOpenChange={setShowCreateChangeOrder}
        onChangeOrderCreated={(newDoc) => {
          setSelectedChangeOrder(newDoc);
          setShowChangeOrderPopup(true);
        }}
        projectId={doc.projectId || undefined}
        parentTaxRate={taxRate}
        parentTaxProfileName={taxProfileName}
      />

      {/* Change Order Detail - Full Page Overlay (portaled to body to escape layout stacking context) */}
      {showChangeOrderPopup && selectedChangeOrder && createPortal(
        <div className="fixed inset-0 z-[9999] bg-background overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch', touchAction: 'manipulation' }} onTouchMove={(e) => e.stopPropagation()}>
          {/* Header with Back button and Actions - matches Change Order Builder dark slate */}
          <div
            className="sticky top-0 z-[10000] bg-slate-800 dark:bg-slate-900 text-white shadow-md"
            style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
          >
            <div className="container max-w-4xl mx-auto px-3 py-2.5 sm:px-4 sm:py-3">
              <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 px-3 shrink-0 text-white hover:bg-white/10 hover:text-white"
                  onClick={() => setShowChangeOrderPopup(false)}
                  data-testid="button-close-co-page"
                >
                  Cancel
                </Button>
                <div className="min-w-0 text-center px-1">
                  <div className="flex items-center justify-center gap-2 min-w-0">
                    <h1 className="text-base sm:text-lg font-semibold truncate text-white" data-testid="text-co-title">
                      {selectedChangeOrder.title}
                    </h1>
                    {selectedChangeOrder.signature ? (
                      <Badge className="bg-green-500 hover:bg-green-500 text-white text-[10px] px-1.5 py-0 h-4 shrink-0 border-0">Accepted</Badge>
                    ) : selectedChangeOrder.status === 'sent' || selectedChangeOrder.status === 'viewed' ? (
                      <Badge className="bg-blue-500 hover:bg-blue-500 text-white text-[10px] px-1.5 py-0 h-4 shrink-0 border-0">Pending</Badge>
                    ) : (
                      <Badge className="bg-white/15 hover:bg-white/15 text-white text-[10px] px-1.5 py-0 h-4 shrink-0 border-0">Draft</Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-300 leading-tight truncate">
                    Change Order • #{(selectedChangeOrder.documentNumber || selectedChangeOrder.id).toString().padStart(6, '0')}
                  </p>
                </div>
                {!selectedChangeOrder.signature ? (
                  <Button
                    size="sm"
                    className="h-9 px-3 shrink-0 bg-white text-slate-900 hover:bg-slate-100"
                    onClick={() => setShowEditChangeOrderDialog(true)}
                    data-testid="button-edit-co"
                  >
                    <Pencil className="w-4 h-4 mr-1.5" /> Edit
                  </Button>
                ) : <div className="w-[1px]" />}
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="container max-w-4xl mx-auto px-4 py-6">
              <Card className="shadow-lg border-t-4 border-t-primary">
                <CardContent className="p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-8">
                  {/* Centered Logo Header */}
                  {companyLogo && (
                    <div className="flex justify-center pb-4">
                      <img 
                        src={companyLogo} 
                        alt={companyName} 
                        className="w-20 h-20 sm:w-24 sm:h-24 object-contain"
                      />
                    </div>
                  )}

                  {/* Company Info - Centered below logo */}
                  <div className="text-center space-y-1 border-b pb-6">
                    <h2 className="text-xl sm:text-2xl font-bold" style={settings?.useBrandColorOnDocs && settings?.brandColor ? { color: settings.brandColor } : undefined} data-testid="text-company-name">{companyName}</h2>
                    {companyAddress && <p className="text-muted-foreground text-sm">{companyAddress}</p>}
                    {companyCityStateZip && <p className="text-muted-foreground text-sm">{companyCityStateZip}</p>}
                    <div className="flex justify-center gap-4 text-muted-foreground text-sm">
                      {companyPhone && <span>{formatPhoneDisplay(companyPhone)}</span>}
                      {companyEmail && <span>{companyEmail}</span>}
                    </div>
                  </div>

                  {/* Three Column Layout: Client, Job Address, Change Order Info */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 border-b pb-6">
                    <div>
                      <h4 className="text-xs font-bold uppercase text-muted-foreground mb-2">Client:</h4>
                      <p className="font-bold">{dmName(doc.contact.name)}</p>
                      <AddressDisplay
                        address={dmAddress(doc.contact.address)}
                        city={dmCity(doc.contact.city)}
                        state={doc.contact.state}
                        zipCode={doc.contact.zipCode}
                      />
                      <p className="text-sm text-muted-foreground">{dmPhone(doc.contact.phone)}</p>
                      <p className="text-sm text-muted-foreground">{dmEmail(doc.contact.email)}</p>
                    </div>
                    <div>
                      <h4 className="text-xs font-bold uppercase text-muted-foreground mb-2">Job Address:</h4>
                      {doc.jobAddressSameAsBilling ? (
                        <AddressDisplay
                          address={dmAddress(doc.contact.address)}
                          city={dmCity(doc.contact.city)}
                          state={doc.contact.state}
                          zipCode={doc.contact.zipCode}
                        />
                      ) : (
                        <AddressDisplay
                          address={dmAddress(doc.jobAddress)}
                          city={dmCity(doc.jobCity)}
                          state={doc.jobState}
                          zipCode={doc.jobZipCode}
                        />
                      )}
                    </div>
                    <div className="sm:text-right">
                      <h4 className="text-xs font-bold uppercase text-muted-foreground mb-2">Change Order Info:</h4>
                      <p className="font-medium">#{(selectedChangeOrder.documentNumber || selectedChangeOrder.id).toString().padStart(6, '0')}</p>
                      <p className="text-sm text-muted-foreground">
                        Date: {selectedChangeOrder.createdAt ? format(new Date(selectedChangeOrder.createdAt), "MMM d, yyyy") : 'N/A'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        For: {doc.title} (#{(doc.documentNumber || doc.id).toString().padStart(6, '0')})
                      </p>
                    </div>
                  </div>

                  {/* Line Items + Production Rate Blocks */}
                  <ChangeOrderContentRenderer
                    content={selectedChangeOrder.content}
                    mode="internal"
                    testIdPrefix="co-popup-content"
                  />

                  {/* Total */}
                  <div className="flex justify-end pt-4">
                    <div className="w-full sm:w-64 space-y-2">
                      <div className="flex justify-between text-base sm:text-lg font-bold border-t pt-2 mt-2">
                        <span>Total</span>
                        <span>${(selectedChangeOrder.totalAmount / 100).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Signature Display */}
                  {selectedChangeOrder.signature && (
                    <div className="pt-6 border-t border-dashed">
                      <p className="text-sm text-muted-foreground mb-2">Signed by {doc.contact.name}</p>
                      <div className="border p-4 inline-block bg-white rounded-lg">
                        <img src={selectedChangeOrder.signature} alt="Signature" className="h-20" />
                      </div>
                      {selectedChangeOrder.signedAt && (
                        <p className="text-xs text-muted-foreground mt-2">
                          Signed on {format(new Date(selectedChangeOrder.signedAt), "MMM d, yyyy h:mm a")}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Sign Button for Unsigned Change Orders */}
                  {!selectedChangeOrder.signature && (
                    <div className="pt-6 border-t border-dashed">
                      <div className="flex flex-col items-center gap-3">
                        <p className="text-sm text-muted-foreground text-center">
                          Click the button below to sign and accept this change order.
                        </p>
                        <Button 
                          onClick={() => setShowCOSignatureModal(true)}
                          className="bg-green-600 hover:bg-green-700"
                          data-testid="button-open-co-signature"
                        >
                          <PenLine className="w-4 h-4 mr-2" />
                          Sign Change Order
                        </Button>
                      </div>
                    </div>
                  )}

                    {/* View Count */}
                    {selectedChangeOrder.viewCount > 0 && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Eye className="w-4 h-4" />
                        Viewed {selectedChangeOrder.viewCount} time{selectedChangeOrder.viewCount !== 1 ? 's' : ''}
                        {selectedChangeOrder.lastViewedAt && (
                          <span>• Last viewed {format(new Date(selectedChangeOrder.lastViewedAt), "MMM d, yyyy")}</span>
                        )}
                      </div>
                    )}
                </CardContent>
              </Card>
          </div>
        </div>,
        document.body
      )}

      {/* Edit Change Order Dialog */}
      {selectedChangeOrder && (
        <EditChangeOrderDialog
          changeOrder={selectedChangeOrder}
          parentDocumentId={docId}
          originalTotalAmount={doc.totalAmount || 0}
          open={showEditChangeOrderDialog}
          onOpenChange={setShowEditChangeOrderDialog}
          onSaved={(updatedDoc) => {
            setSelectedChangeOrder({ ...selectedChangeOrder, ...updatedDoc });
            setShowChangeOrderPopup(true);
          }}
          parentTaxRate={taxRate}
          parentTaxProfileName={taxProfileName}
        />
      )}

      {/* Change Order Signature Modal - needs high z-index to appear above change order popup */}
      <Dialog open={showCOSignatureModal} onOpenChange={setShowCOSignatureModal}>
        <DialogContent className="sm:max-w-lg z-[10000]" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Sign to Accept Change Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 pt-4">
            <p className="text-sm text-muted-foreground text-center">
              By signing below, you agree to the terms and pricing outlined in this change order.
            </p>
            
            <div className="flex justify-center px-2">
              <div className="border-2 border-dashed rounded-lg bg-white p-2 w-full max-w-[420px]">
                <SignatureCanvas 
                  ref={coSigPad}
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
                onClick={() => coSigPad.current?.clear()}
                data-testid="button-clear-co-signature"
              >
                Clear
              </Button>
              <Button 
                onClick={() => {
                  handleSignCOInModal();
                  setShowCOSignatureModal(false);
                }} 
                disabled={isSigningCO}
                className="bg-green-600 hover:bg-green-700"
                data-testid="button-submit-co-signature"
              >
                {isSigningCO && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                <CheckCircle className="w-4 h-4 mr-2" />
                Submit Signature
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Contact Edit Modal */}
      <Dialog open={showContactEditModal} onOpenChange={setShowContactEditModal}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Contact Information</DialogTitle>
            <DialogDescription>
              Update the client's contact details.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input 
                value={editContactName} 
                onChange={(e) => setEditContactName(e.target.value)}
                placeholder="Client name"
                data-testid="input-edit-contact-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input 
                type="email"
                value={editContactEmail} 
                onChange={(e) => setEditContactEmail(e.target.value)}
                placeholder="email@example.com"
                data-testid="input-edit-contact-email"
              />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input 
                value={editContactPhone} 
                onChange={(e) => setEditContactPhone(stripPhoneInput(e.target.value))}
                placeholder="+15551234567"
                inputMode="tel"
                data-testid="input-edit-contact-phone"
              />
              {editContactPhone && editContactPhone.length > 0 && !isValidPhone(editContactPhone) && (
                <p className="text-xs text-amber-500 mt-1">Enter a valid US/Canada phone number</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Street Address</Label>
              <AddressAutocomplete 
                value={editContactAddress}
                onChange={setEditContactAddress}
                onAddressSelect={(components: AddressComponents) => {
                  setEditContactAddress([components.streetNumber, components.route].filter(Boolean).join(' '));
                  setEditContactCity(components.city);
                  setEditContactState(components.state);
                  setEditContactZipCode(components.zipCode);
                }}
                placeholder="123 Main St"
                data-testid="input-edit-contact-address"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-2">
                <Label>City</Label>
                <Input 
                  value={editContactCity} 
                  onChange={(e) => setEditContactCity(e.target.value)}
                  placeholder="City"
                  data-testid="input-edit-contact-city"
                />
              </div>
              <div className="space-y-2">
                <Label>State</Label>
                <Input 
                  value={editContactState} 
                  onChange={(e) => setEditContactState(e.target.value)}
                  placeholder="ST"
                  data-testid="input-edit-contact-state"
                />
              </div>
              <div className="space-y-2">
                <Label>ZIP</Label>
                <Input 
                  value={editContactZipCode} 
                  onChange={(e) => setEditContactZipCode(e.target.value)}
                  placeholder="12345"
                  data-testid="input-edit-contact-zip"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowContactEditModal(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSaveContact}
              disabled={updateContactMutation.isPending}
              data-testid="button-save-contact"
            >
              {updateContactMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Job Address Edit Modal */}
      <Dialog open={showJobAddressEditModal} onOpenChange={setShowJobAddressEditModal}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Job Address</DialogTitle>
            <DialogDescription>
              Update the job site address for this document.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="editSameAsBilling"
                checked={editJobSameAsBilling}
                onCheckedChange={(checked) => {
                  setEditJobSameAsBilling(checked === true);
                  if (checked && doc) {
                    setEditJobAddress(doc.contact.address || '');
                    setEditJobCity(doc.contact.city || '');
                    setEditJobState(doc.contact.state || '');
                    setEditJobZipCode(doc.contact.zipCode || '');
                  }
                }}
                data-testid="checkbox-edit-same-as-billing"
              />
              <Label htmlFor="editSameAsBilling" className="font-normal cursor-pointer">
                Same as billing address
              </Label>
            </div>
            
            <div className="space-y-2">
              <Label>Street Address</Label>
              <AddressAutocomplete 
                value={editJobAddress} 
                onChange={setEditJobAddress}
                onAddressSelect={(components: AddressComponents) => {
                  setEditJobAddress([components.streetNumber, components.route].filter(Boolean).join(' '));
                  setEditJobCity(components.city);
                  setEditJobState(components.state);
                  setEditJobZipCode(components.zipCode);
                }}
                placeholder="123 Job Site St"
                disabled={editJobSameAsBilling}
                data-testid="input-edit-job-address"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-2">
                <Label>City</Label>
                <Input 
                  value={editJobCity} 
                  onChange={(e) => setEditJobCity(e.target.value)}
                  placeholder="City"
                  disabled={editJobSameAsBilling}
                  data-testid="input-edit-job-city"
                />
              </div>
              <div className="space-y-2">
                <Label>State</Label>
                <Input 
                  value={editJobState} 
                  onChange={(e) => setEditJobState(e.target.value)}
                  placeholder="State"
                  disabled={editJobSameAsBilling}
                  data-testid="input-edit-job-state"
                />
              </div>
              <div className="space-y-2">
                <Label>ZIP</Label>
                <Input 
                  value={editJobZipCode} 
                  onChange={(e) => setEditJobZipCode(e.target.value)}
                  placeholder="ZIP"
                  disabled={editJobSameAsBilling}
                  data-testid="input-edit-job-zip"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowJobAddressEditModal(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSaveJobAddress}
              disabled={updateJobAddressMutation.isPending}
              data-testid="button-save-job-address"
            >
              {updateJobAddressMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Order SMS Dialog */}
      <Dialog open={showCOSmsDialog} onOpenChange={setShowCOSmsDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Change Order via SMS</DialogTitle>
            <DialogDescription>
              Send the change order link to {doc.contact.name} for their approval.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-4">
              Recipient: <span className="font-medium text-foreground">{doc.contact.phone ? formatPhoneDisplay(doc.contact.phone) : ''}</span>
            </p>
            <p className="text-sm">
              A message will be sent with a link to view and sign the change order.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCOSmsDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!selectedChangeOrder || !selectedChangeOrder.publicToken) {
                  toast({ title: "Error", description: "Change order does not have a portal link", variant: "destructive" });
                  return;
                }
                await publishDocument(selectedChangeOrder.id);
                const companySlug = settings?.bookingSlug;
                const link = (settings?.customDomain && settings?.customDomainVerified)
                  ? `https://${settings.customDomain}/change-order/${selectedChangeOrder.publicToken}`
                  : companySlug
                    ? `${window.location.origin}/${companySlug}/change-order/${selectedChangeOrder.publicToken}`
                    : `${window.location.origin}/portal/document/${selectedChangeOrder.publicToken}`;
                const smsBody = `Hi ${doc.contact.name}, please review and sign the change order for "${selectedChangeOrder.title}". View it here: ${link}`;
                sendSms({
                  to: doc.contact.phone!,
                  body: smsBody,
                  contactId: doc.contactId,
                }, {
                  onSuccess: () => {
                    setShowCOSmsDialog(false);
                    toast({ title: "SMS Sent", description: "Change order link sent successfully" });
                  },
                  onError: () => {
                    toast({ title: "Error", description: "Failed to send SMS", variant: "destructive" });
                  }
                });
              }}
              disabled={isSendingSms}
              data-testid="button-confirm-send-co-sms"
            >
              {isSendingSms && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              <Send className="w-4 h-4 mr-2" />
              Send SMS
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
