import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { PoweredByFusePhone } from "@/components/PoweredByFusePhone";
import { formatPhoneDisplay } from "@/lib/utils";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Clock, CheckCircle, Loader2, AlertCircle, Upload, X, FileText, Image as ImageIcon } from "lucide-react";
import { FusePhoneLogo } from "@/components/FusePhoneLogo";
import { ForceLightTheme } from "@/components/ForceLightTheme";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { isValidPhone, stripPhoneInput } from "@/lib/phone";
import type { BookingFieldConfig } from "@shared/schema";

interface BookingFormProps {
  slug?: string;
}

interface WorkingHoursDay {
  enabled: boolean;
  start: string;
  end: string;
}

interface WorkingHoursData {
  [key: string]: WorkingHoursDay;
}

interface CompanyInfo {
  companyName: string;
  logo: string;
  phone: string;
  email: string;
  bookingToken: string;
  formName?: string;
  fields?: BookingFieldConfig[];
  thankYouUrl?: string | null;
  workingHours?: string | null;
  timezone?: string | null;
  whiteLabelEnabled?: boolean;
}

function generateTimeSlots(workingHours: string | null | undefined, dayOfWeek?: number): { value: string; label: string }[] {
  const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

  let startHour = 8;
  let startMin = 0;
  let endHour = 17;
  let endMin = 0;

  if (workingHours) {
    try {
      const parsed: WorkingHoursData = JSON.parse(workingHours);
      if (dayOfWeek !== undefined && dayOfWeek >= 0 && dayOfWeek <= 6) {
        const dayData = parsed[dayKeys[dayOfWeek]];
        if (dayData && !dayData.enabled) return [];
        if (dayData?.start) {
          const [sh, sm] = dayData.start.split(':').map(Number);
          startHour = sh;
          startMin = sm || 0;
        }
        if (dayData?.end) {
          const [eh, em] = dayData.end.split(':').map(Number);
          endHour = eh;
          endMin = em || 0;
        }
      } else {
        let earliest = 23;
        let latest = 0;
        let earliestMin = 59;
        let latestMin = 0;
        let anyEnabled = false;
        for (const key of dayKeys) {
          const d = parsed[key];
          if (d?.enabled) {
            anyEnabled = true;
            const [sh, sm] = (d.start || '08:00').split(':').map(Number);
            const [eh, em] = (d.end || '17:00').split(':').map(Number);
            if (sh < earliest || (sh === earliest && (sm || 0) < earliestMin)) {
              earliest = sh;
              earliestMin = sm || 0;
            }
            if (eh > latest || (eh === latest && (em || 0) > latestMin)) {
              latest = eh;
              latestMin = em || 0;
            }
          }
        }
        if (anyEnabled) {
          startHour = earliest;
          startMin = earliestMin;
          endHour = latest;
          endMin = latestMin;
        }
      }
    } catch {}
  }

  startMin = Math.floor(startMin / 15) * 15;

  const slots: { value: string; label: string }[] = [];
  let h = startHour;
  let m = startMin;
  while (h < endHour || (h === endHour && m <= endMin)) {
    const hh = h.toString().padStart(2, '0');
    const mm = m.toString().padStart(2, '0');
    const value = `${hh}:${mm}`;

    const period = h >= 12 ? 'PM' : 'AM';
    const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
    const label = `${displayH}:${mm} ${period}`;

    slots.push({ value, label });

    m += 15;
    if (m >= 60) {
      m = 0;
      h++;
    }
  }

  return slots;
}

function isFieldEnabled(fields: BookingFieldConfig[] | undefined, fieldId: string): boolean {
  if (!fields) return true;
  const field = fields.find(f => f.id === fieldId);
  return field ? field.enabled : false;
}

function isFieldRequired(fields: BookingFieldConfig[] | undefined, fieldId: string): boolean {
  if (!fields) {
    return ['firstName', 'lastName', 'email', 'phone'].includes(fieldId);
  }
  const field = fields.find(f => f.id === fieldId);
  return field ? field.required && field.enabled : false;
}

function buildSchema(fields: BookingFieldConfig[] | undefined) {
  const shape: Record<string, z.ZodTypeAny> = {};

  if (isFieldEnabled(fields, 'firstName')) {
    shape.firstName = isFieldRequired(fields, 'firstName')
      ? z.string().min(1, "First name is required")
      : z.string().optional();
  }
  if (isFieldEnabled(fields, 'lastName')) {
    shape.lastName = isFieldRequired(fields, 'lastName')
      ? z.string().min(1, "Last name is required")
      : z.string().optional();
  }
  if (isFieldEnabled(fields, 'email')) {
    shape.email = isFieldRequired(fields, 'email')
      ? z.string().email("Please enter a valid email")
      : z.string().email("Please enter a valid email").or(z.literal('')).optional();
  }
  if (isFieldEnabled(fields, 'phone')) {
    const phoneValidation = z.string().refine(val => {
      if (!val) return !isFieldRequired(fields, 'phone');
      const d = val.replace(/\D/g, '');
      return d.length === 10 || (d.length === 11 && d.startsWith('1'));
    }, "Enter a valid US/Canada phone number");
    shape.phone = phoneValidation;
  }

  if (isFieldEnabled(fields, 'address')) {
    shape.address = z.string().optional();
    shape.city = z.string().optional();
    shape.state = z.string().optional();
    shape.zipCode = z.string().optional();
  }

  if (isFieldEnabled(fields, 'preferredDate')) {
    shape.requestedDate = z.string().optional();
  }
  if (isFieldEnabled(fields, 'preferredTime')) {
    shape.requestedTime = z.string().optional();
  }
  if (isFieldEnabled(fields, 'alternateDate')) {
    shape.alternateDate = z.string().optional();
  }
  if (isFieldEnabled(fields, 'alternateTime')) {
    shape.alternateTime = z.string().optional();
  }
  if (isFieldEnabled(fields, 'projectDescription')) {
    shape.projectDescription = isFieldRequired(fields, 'projectDescription')
      ? z.string().min(1, "Project description is required")
      : z.string().optional();
  }

  return z.object(shape);
}

interface UploadedFile {
  file: File;
  preview?: string;
  key?: string;
  uploading: boolean;
  error?: string;
}

function deriveSourceChannel(utmSource: string, utmMedium: string, referrer: string): string {
  if (utmSource === 'google' && utmMedium === 'maps') return 'Google Business Profile / Maps';
  if (utmSource === 'google' && (utmMedium === 'cpc' || utmMedium === 'ppc')) return 'Google Ads';
  if (utmSource === 'facebook' || utmSource === 'instagram' || utmSource === 'fb' || utmSource === 'ig') return 'Social';
  if (utmMedium === 'email' || utmSource === 'email') return 'Email';
  if (utmSource || utmMedium) return 'Other Referral';
  if (referrer.includes('google.com')) return 'Google Organic';
  if (referrer.includes('bing.com') || referrer.includes('yahoo.com')) return 'Search Organic';
  if (referrer.includes('facebook.com') || referrer.includes('instagram.com')) return 'Social';
  if (referrer) return 'Other Referral';
  return 'Direct / Unknown';
}

function captureFirstTouchTracking() {
  if (typeof window === 'undefined') return;
  if (sessionStorage.getItem('fuse_tracking')) return;

  const params = new URLSearchParams(window.location.search);
  const utmSource = params.get('utm_source') || '';
  const utmMedium = params.get('utm_medium') || '';
  const utmCampaign = params.get('utm_campaign') || '';
  const referrer = document.referrer || '';

  const tracking = {
    landingPage: window.location.href,
    referrer,
    utmSource,
    utmMedium,
    utmCampaign,
    sourceChannel: deriveSourceChannel(utmSource, utmMedium, referrer),
  };
  sessionStorage.setItem('fuse_tracking', JSON.stringify(tracking));
}

function getLeadTrackingData() {
  if (typeof window === 'undefined') return {};

  captureFirstTouchTracking();

  const stored = sessionStorage.getItem('fuse_tracking');
  const firstTouch = stored ? JSON.parse(stored) : {};

  return {
    landingPage: firstTouch.landingPage || window.location.href,
    formPage: window.location.href,
    referrer: firstTouch.referrer || '',
    utmSource: firstTouch.utmSource || '',
    utmMedium: firstTouch.utmMedium || '',
    utmCampaign: firstTouch.utmCampaign || '',
    sourceChannel: firstTouch.sourceChannel || 'Direct / Unknown',
  };
}

export default function BookingForm({ slug }: BookingFormProps) {
  const [submitted, setSubmitted] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    captureFirstTouchTracking();
  }, []);

  const { data: companyInfo, isLoading: isLoadingCompany, error: companyError } = useQuery<CompanyInfo>({
    queryKey: ['/api/public/booking', slug || 'custom-domain'],
    queryFn: async () => {
      const url = slug
        ? `/api/public/booking/${slug}`
        : `/api/public/custom-domain/booking`;
      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 404) throw new Error('not_found');
        throw new Error('Failed to load');
      }
      return res.json();
    },
    retry: false,
  });

  const fields = companyInfo?.fields;
  const schema = buildSchema(fields);

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      address: "",
      city: "",
      state: "",
      zipCode: "",
      requestedDate: "",
      requestedTime: "",
      alternateDate: "",
      alternateTime: "",
      projectDescription: "",
    },
  });

  const handleFilesSelected = useCallback(async (selectedFiles: FileList | File[]) => {
    if (!companyInfo?.bookingToken) return;
    const files = Array.from(selectedFiles);
    const newEntries: UploadedFile[] = files.map(file => ({
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
      uploading: true,
    }));

    setUploadedFiles(prev => [...prev, ...newEntries]);

    const formData = new FormData();
    files.forEach(f => formData.append('files', f));

    try {
      const res = await fetch(`/api/public/booking-upload?token=${companyInfo.bookingToken}`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error('Upload failed');
      const result = await res.json();
      const keys = result.files as string[];

      setUploadedFiles(prev => {
        const updated = [...prev];
        let keyIdx = 0;
        for (let i = 0; i < updated.length; i++) {
          if (updated[i].uploading && files.includes(updated[i].file)) {
            updated[i] = { ...updated[i], uploading: false, key: keys[keyIdx] || undefined };
            keyIdx++;
          }
        }
        return updated;
      });
    } catch {
      setUploadedFiles(prev =>
        prev.map(f => files.includes(f.file) ? { ...f, uploading: false, error: 'Upload failed' } : f)
      );
    }
  }, [companyInfo?.bookingToken]);

  const removeFile = useCallback((idx: number) => {
    setUploadedFiles(prev => {
      const removed = prev[idx];
      if (removed?.preview) URL.revokeObjectURL(removed.preview);
      return prev.filter((_, i) => i !== idx);
    });
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) {
      handleFilesSelected(e.dataTransfer.files);
    }
  }, [handleFilesSelected]);

  const submitMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const token = companyInfo?.bookingToken;
      if (!token) throw new Error('Invalid booking configuration');
      const uploadKeys = uploadedFiles.filter(f => f.key).map(f => f.key);
      const tracking = getLeadTrackingData();
      const res = await fetch(`/api/public/booking-request?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          uploadedFiles: uploadKeys.length > 0 ? uploadKeys : undefined,
          ...tracking,
        }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to submit booking request');
      }
      return res.json();
    },
    onSuccess: () => {
      if (companyInfo?.thankYouUrl) {
        window.location.href = companyInfo.thankYouUrl;
        return;
      }
      setSubmitted(true);
    },
  });

  const onSubmit = (data: Record<string, unknown>) => {
    submitMutation.mutate(data);
  };

  const watchedDate = form.watch("requestedDate");
  const watchedAltDate = form.watch("alternateDate");

  const preferredTimeSlots = useMemo(() => {
    if (!watchedDate) return generateTimeSlots(companyInfo?.workingHours);
    const d = new Date(watchedDate + 'T00:00:00');
    if (isNaN(d.getTime())) return generateTimeSlots(companyInfo?.workingHours);
    return generateTimeSlots(companyInfo?.workingHours, d.getDay());
  }, [watchedDate, companyInfo?.workingHours]);

  const altTimeSlots = useMemo(() => {
    if (!watchedAltDate) return generateTimeSlots(companyInfo?.workingHours);
    const d = new Date(watchedAltDate + 'T00:00:00');
    if (isNaN(d.getTime())) return generateTimeSlots(companyInfo?.workingHours);
    return generateTimeSlots(companyInfo?.workingHours, d.getDay());
  }, [watchedAltDate, companyInfo?.workingHours]);

  const currentTime = form.watch("requestedTime");
  const currentAltTime = form.watch("alternateTime");

  useEffect(() => {
    if (currentTime && preferredTimeSlots.length > 0 && !preferredTimeSlots.some(s => s.value === currentTime)) {
      form.setValue("requestedTime", "");
    }
  }, [currentTime, preferredTimeSlots]);

  useEffect(() => {
    if (currentAltTime && altTimeSlots.length > 0 && !altTimeSlots.some(s => s.value === currentAltTime)) {
      form.setValue("alternateTime", "");
    }
  }, [currentAltTime, altTimeSlots]);

  if (isLoadingCompany) {
    return (
      <ForceLightTheme>
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
        </div>
      </ForceLightTheme>
    );
  }

  if (companyError || !companyInfo) {
    return (
      <ForceLightTheme>
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardContent className="pt-6 text-center space-y-4">
              <div className="mx-auto w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">
                <AlertCircle className="w-10 h-10 text-red-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900" data-testid="text-booking-not-found">Business Not Found</h2>
              <p className="text-gray-500">
                This booking link doesn't match any business. Please check the URL and try again.
              </p>
              <div className="pt-2">
                <FusePhoneLogo size="sm" />
              </div>
            </CardContent>
          </Card>
        </div>
      </ForceLightTheme>
    );
  }

  if (submitted) {
    return (
      <ForceLightTheme>
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardContent className="pt-6 text-center space-y-4">
              <div className="mx-auto w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle className="w-10 h-10 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900" data-testid="text-booking-success">Thank You!</h2>
              <p className="text-gray-500">
                Your appointment request has been submitted successfully. We'll contact you soon to confirm your appointment.
              </p>
              {companyInfo?.phone && (
                <p className="text-sm text-gray-500">
                  Questions? Call us at <a href={`tel:${companyInfo.phone}`} className="text-primary font-medium">{formatPhoneDisplay(String(companyInfo.phone))}</a>
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </ForceLightTheme>
    );
  }

  const showDate = isFieldEnabled(fields, 'preferredDate');
  const showTime = isFieldEnabled(fields, 'preferredTime');
  const showAltDate = isFieldEnabled(fields, 'alternateDate');
  const showAltTime = isFieldEnabled(fields, 'alternateTime');
  const showDateTimeSection = showDate || showTime || showAltDate || showAltTime;
  const showAddress = isFieldEnabled(fields, 'address');
  const showFileUpload = isFieldEnabled(fields, 'fileUpload');

  return (
    <ForceLightTheme>
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader className="text-center pb-2">
            {companyInfo?.logo && (
              <div className="flex justify-center mb-4">
                <img 
                  src={companyInfo.logo} 
                  alt={companyInfo.companyName || 'Company Logo'} 
                  className="h-16 object-contain"
                  data-testid="img-booking-company-logo"
                />
              </div>
            )}
            <CardTitle className="text-2xl" data-testid="text-booking-title">
              {companyInfo?.formName 
                ? String(companyInfo.formName)
                : companyInfo?.companyName 
                  ? `Book an Appointment with ${String(companyInfo.companyName)}` 
                  : 'Book an Appointment'}
            </CardTitle>
            <CardDescription>
              Fill out the form below and we'll contact you to confirm your appointment.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {(isFieldEnabled(fields, 'firstName') || isFieldEnabled(fields, 'lastName')) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {isFieldEnabled(fields, 'firstName') && (
                    <div className="space-y-2">
                      <Label htmlFor="firstName">First Name {isFieldRequired(fields, 'firstName') && '*'}</Label>
                      <Input 
                        id="firstName" 
                        {...form.register("firstName")} 
                        placeholder="John"
                        data-testid="input-first-name"
                      />
                      {form.formState.errors.firstName && (
                        <p className="text-sm text-destructive">{form.formState.errors.firstName.message as string}</p>
                      )}
                    </div>
                  )}
                  {isFieldEnabled(fields, 'lastName') && (
                    <div className="space-y-2">
                      <Label htmlFor="lastName">Last Name {isFieldRequired(fields, 'lastName') && '*'}</Label>
                      <Input 
                        id="lastName" 
                        {...form.register("lastName")} 
                        placeholder="Doe"
                        data-testid="input-last-name"
                      />
                      {form.formState.errors.lastName && (
                        <p className="text-sm text-destructive">{form.formState.errors.lastName.message as string}</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {(isFieldEnabled(fields, 'email') || isFieldEnabled(fields, 'phone')) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {isFieldEnabled(fields, 'email') && (
                    <div className="space-y-2">
                      <Label htmlFor="email">Email {isFieldRequired(fields, 'email') && '*'}</Label>
                      <Input 
                        id="email" 
                        type="email"
                        {...form.register("email")} 
                        placeholder="john@example.com"
                        data-testid="input-email"
                      />
                      {form.formState.errors.email && (
                        <p className="text-sm text-destructive">{form.formState.errors.email.message as string}</p>
                      )}
                    </div>
                  )}
                  {isFieldEnabled(fields, 'phone') && (
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone {isFieldRequired(fields, 'phone') && '*'}</Label>
                      <Input 
                        id="phone" 
                        value={form.watch("phone") || ''}
                        onChange={(e) => {
                          form.setValue("phone", stripPhoneInput(e.target.value));
                        }}
                        inputMode="tel"
                        placeholder="+15551234567"
                        data-testid="input-phone"
                      />
                      {form.formState.errors.phone && (
                        <p className="text-sm text-destructive">{form.formState.errors.phone.message as string}</p>
                      )}
                      {(() => {
                        const phone = form.watch("phone") || '';
                        return phone.length > 0 && !isValidPhone(phone) && !form.formState.errors.phone ? (
                          <p className="text-xs text-amber-500 mt-1">Enter a valid US/Canada phone number</p>
                        ) : null;
                      })()}
                    </div>
                  )}
                </div>
              )}

              {showAddress && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="address">Street Address</Label>
                    <AddressAutocomplete
                      publicMode
                      value={form.watch("address") || ""}
                      onChange={(v) => form.setValue("address", v, { shouldDirty: true })}
                      onAddressSelect={(c) => {
                        const street = [c.streetNumber, c.route].filter(Boolean).join(" ");
                        form.setValue("address", street || c.fullAddress, { shouldDirty: true });
                        if (c.city) form.setValue("city", c.city, { shouldDirty: true });
                        if (c.state) form.setValue("state", c.state, { shouldDirty: true });
                        if (c.zipCode) form.setValue("zipCode", c.zipCode, { shouldDirty: true });
                      }}
                      placeholder="123 Main Street"
                      data-testid="input-address"
                    />
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="space-y-2 col-span-2 sm:col-span-2">
                      <Label htmlFor="city">City</Label>
                      <Input 
                        id="city" 
                        {...form.register("city")} 
                        placeholder="City"
                        data-testid="input-city"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="state">State</Label>
                      <Input 
                        id="state" 
                        {...form.register("state")} 
                        placeholder="State"
                        data-testid="input-state"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="zipCode">ZIP</Label>
                      <Input 
                        id="zipCode" 
                        {...form.register("zipCode")} 
                        placeholder="12345"
                        data-testid="input-zip"
                      />
                    </div>
                  </div>
                </>
              )}

              {showDateTimeSection && (
                <div className="border rounded-lg p-4 space-y-5">
                  <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Preferred Date & Time
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {showDate && (
                      <div className="space-y-2">
                        <Label htmlFor="requestedDate">Preferred Date</Label>
                        <Input 
                          id="requestedDate" 
                          type="date"
                          {...form.register("requestedDate")} 
                          min={new Date().toISOString().split('T')[0]}
                          className="w-full"
                          data-testid="input-date"
                        />
                      </div>
                    )}
                    {showTime && (
                      <div className="space-y-2">
                        <Label htmlFor="requestedTime" className="flex items-center gap-2">
                          <Clock className="w-4 h-4" />
                          Preferred Time
                        </Label>
                        {preferredTimeSlots.length === 0 ? (
                          <p className="text-sm text-muted-foreground py-2">Not available on this day</p>
                        ) : (
                          <Select
                            value={form.watch("requestedTime") || ""}
                            onValueChange={(val) => form.setValue("requestedTime", val)}
                          >
                            <SelectTrigger data-testid="input-time">
                              <SelectValue placeholder="Select a time" />
                            </SelectTrigger>
                            <SelectContent>
                              {preferredTimeSlots.map((slot) => (
                                <SelectItem key={slot.value} value={slot.value}>
                                  {slot.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    )}
                  </div>

                  {(showAltDate || showAltTime) && (
                    <>
                      <div className="border-t pt-4">
                        <p className="text-xs text-muted-foreground mb-3">If your first choice isn't available:</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {showAltDate && (
                            <div className="space-y-2">
                              <Label htmlFor="alternateDate">Alternative Date</Label>
                              <Input 
                                id="alternateDate" 
                                type="date"
                                {...form.register("alternateDate")} 
                                min={new Date().toISOString().split('T')[0]}
                                className="w-full"
                                data-testid="input-alternate-date"
                              />
                            </div>
                          )}
                          {showAltTime && (
                            <div className="space-y-2">
                              <Label htmlFor="alternateTime" className="flex items-center gap-2">
                                <Clock className="w-4 h-4" />
                                Alternative Time
                              </Label>
                              {altTimeSlots.length === 0 ? (
                                <p className="text-sm text-muted-foreground py-2">Not available on this day</p>
                              ) : (
                                <Select
                                  value={form.watch("alternateTime") || ""}
                                  onValueChange={(val) => form.setValue("alternateTime", val)}
                                >
                                  <SelectTrigger data-testid="input-alternate-time">
                                    <SelectValue placeholder="Select a time" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {altTimeSlots.map((slot) => (
                                      <SelectItem key={slot.value} value={slot.value}>
                                        {slot.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {isFieldEnabled(fields, 'projectDescription') && (
                <div className="space-y-2">
                  <Label htmlFor="projectDescription">Project Description {isFieldRequired(fields, 'projectDescription') && '*'}</Label>
                  <Textarea 
                    id="projectDescription" 
                    {...form.register("projectDescription")} 
                    placeholder="Please describe what you're looking to have done..."
                    rows={4}
                    data-testid="input-description"
                  />
                  {form.formState.errors.projectDescription && (
                    <p className="text-sm text-destructive">{form.formState.errors.projectDescription.message as string}</p>
                  )}
                </div>
              )}

              {showFileUpload && (
                <div className="space-y-3">
                  <Label>Photos / Documents</Label>
                  <div
                    className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDrop}
                    data-testid="dropzone-file-upload"
                  >
                    <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Drag & drop files here, or <span className="text-primary font-medium">click to browse</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Images and PDFs accepted (max 10MB each)
                    </p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files && e.target.files.length > 0) {
                          handleFilesSelected(e.target.files);
                          e.target.value = '';
                        }
                      }}
                      data-testid="input-file-upload"
                    />
                  </div>

                  {uploadedFiles.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {uploadedFiles.map((uf, idx) => (
                        <div key={idx} className="relative border rounded-lg overflow-hidden bg-muted/30" data-testid={`file-preview-${idx}`}>
                          {uf.preview ? (
                            <img src={uf.preview} alt={uf.file.name} className="w-full h-24 object-cover" />
                          ) : (
                            <div className="w-full h-24 flex items-center justify-center">
                              {uf.file.type === 'application/pdf' ? (
                                <FileText className="w-8 h-8 text-muted-foreground" />
                              ) : (
                                <ImageIcon className="w-8 h-8 text-muted-foreground" />
                              )}
                            </div>
                          )}
                          <div className="p-1.5 text-xs truncate text-muted-foreground">{uf.file.name}</div>
                          {uf.uploading && (
                            <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                              <Loader2 className="w-5 h-5 animate-spin text-primary" />
                            </div>
                          )}
                          {uf.error && (
                            <div className="absolute inset-0 bg-destructive/10 flex items-center justify-center">
                              <p className="text-xs text-destructive font-medium">Failed</p>
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => removeFile(idx)}
                            className="absolute top-1 right-1 w-5 h-5 rounded-full bg-background/80 flex items-center justify-center hover:bg-destructive/20"
                            data-testid={`button-remove-file-${idx}`}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-start gap-3 p-3 rounded-md border bg-muted/30">
                <Checkbox
                  id="consent"
                  checked={consentChecked}
                  onCheckedChange={(checked) => setConsentChecked(checked === true)}
                  data-testid="checkbox-consent"
                />
                <label htmlFor="consent" className="text-xs text-muted-foreground leading-relaxed cursor-pointer">
                  By submitting this form, I consent to receive calls, text messages, and emails from {String(companyInfo?.companyName || 'this business')} regarding my appointment and related services. Message & data rates may apply. Reply STOP to opt out of text messages at any time.
                </label>
              </div>

              <Button 
                type="submit" 
                className="w-full" 
                size="lg"
                disabled={submitMutation.isPending || !consentChecked}
                data-testid="button-submit-booking"
              >
                {submitMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Request Appointment'
                )}
              </Button>

              {submitMutation.isError && (
                <p className="text-sm text-destructive text-center">
                  {String(submitMutation.error?.message || 'Failed to submit. Please try again.')}
                </p>
              )}
            </form>
          </CardContent>
        </Card>

        <div className="mt-6 text-center space-y-3">
          {companyInfo && (
            <div className="text-sm text-muted-foreground">
              {companyInfo.companyName && <p className="font-medium">{String(companyInfo.companyName)}</p>}
              {companyInfo.phone && (
                <p>
                  <a href={`tel:${companyInfo.phone}`} className="hover:text-primary">
                    {String(companyInfo.phone)}
                  </a>
                </p>
              )}
              {companyInfo.email && (
                <p>
                  <a href={`mailto:${companyInfo.email}`} className="hover:text-primary">
                    {String(companyInfo.email)}
                  </a>
                </p>
              )}
            </div>
          )}
          <PoweredByFusePhone className="pt-2 border-t border-border/50" />
        </div>
      </div>
    </div>
    </ForceLightTheme>
  );
}
