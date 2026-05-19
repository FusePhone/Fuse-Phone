import { useCompanySettings, useUpdateCompanySettings } from "@/hooks/use-company-settings";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { normalizePhone, isValidPhone, stripPhoneInput } from "@/lib/phone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useRef, useCallback } from "react";
import { Loader2, Building2, Save, Upload, X, Image, Link2, Copy, ExternalLink, CalendarDays, Check, CheckCircle, AlertTriangle, TriangleAlert, Clock, Globe, Palette, RotateCcw, Pipette, DollarSign, Plus, Shield, FileText, Trash2, Sparkles, ArrowRight, ArrowUp, ArrowDown, PenLine, BadgeCheck } from "lucide-react";
import SignatureCanvas from "react-signature-canvas";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useUpload } from "@/hooks/use-upload";
import { useSubscription } from "@/hooks/use-subscription";
import { Link } from "wouter";
import { PRICE_LABELS } from "@shared/pricing";
import { DeleteAccountCard } from "@/components/DeleteAccountCard";

function extractDominantColor(imageSrc: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(null); return; }
      const size = 50;
      canvas.width = size;
      canvas.height = size;
      ctx.drawImage(img, 0, 0, size, size);
      const data = ctx.getImageData(0, 0, size, size).data;
      const colorCounts: Record<string, { count: number; r: number; g: number; b: number }> = {};
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
        if (a < 128) continue;
        if (r > 230 && g > 230 && b > 230) continue;
        if (r < 25 && g < 25 && b < 25) continue;
        const qr = Math.round(r / 32) * 32;
        const qg = Math.round(g / 32) * 32;
        const qb = Math.round(b / 32) * 32;
        const key = `${qr},${qg},${qb}`;
        if (!colorCounts[key]) colorCounts[key] = { count: 0, r: 0, g: 0, b: 0 };
        colorCounts[key].count++;
        colorCounts[key].r += r;
        colorCounts[key].g += g;
        colorCounts[key].b += b;
      }
      let best: { count: number; r: number; g: number; b: number } | null = null;
      for (const c of Object.values(colorCounts)) {
        const saturation = Math.max(c.r / c.count, c.g / c.count, c.b / c.count) - Math.min(c.r / c.count, c.g / c.count, c.b / c.count);
        const weight = c.count * (1 + saturation / 255);
        if (!best || weight > (best as any)._weight) {
          best = c;
          (best as any)._weight = weight;
        }
      }
      if (!best) { resolve(null); return; }
      const avgR = Math.round(best.r / best.count);
      const avgG = Math.round(best.g / best.count);
      const avgB = Math.round(best.b / best.count);
      resolve(`#${avgR.toString(16).padStart(2, '0')}${avgG.toString(16).padStart(2, '0')}${avgB.toString(16).padStart(2, '0')}`);
    };
    img.onerror = () => resolve(null);
    img.src = imageSrc;
  });
}

export default function CompanyProfile() {
  const { data: settings, isLoading } = useCompanySettings();
  const { mutate: updateSettings, isPending } = useUpdateCompanySettings();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);
  const secondaryColorInputRef = useRef<HTMLInputElement>(null);
  const [logoPickerOpen, setLogoPickerOpen] = useState(false);
  const logoCanvasRef = useRef<HTMLCanvasElement>(null);
  const [pickerPreviewColor, setPickerPreviewColor] = useState<string | null>(null);

  const defaultWH = JSON.stringify({
    mon: { enabled: true, start: '08:00', end: '17:00' },
    tue: { enabled: true, start: '08:00', end: '17:00' },
    wed: { enabled: true, start: '08:00', end: '17:00' },
    thu: { enabled: true, start: '08:00', end: '17:00' },
    fri: { enabled: true, start: '08:00', end: '17:00' },
    sat: { enabled: false, start: '08:00', end: '17:00' },
    sun: { enabled: false, start: '08:00', end: '17:00' },
  });

  const [form, setForm] = useState({
    companyName: '',
    companyLicense: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    phone: '',
    email: '',
    website: '',
    bookingUrl: '',
    reviewLink: '',
    taxRate: '',
    logo: '',
    brandColor: '',
    secondaryColor: '',
    tagline: '',
    documentTrustBadges: [] as Array<{ id: string; label: string }>,
    useBrandColorOnDocs: false,
    timezone: 'America/New_York',
    workingHours: defaultWH,
  });

  const initializedRef = useRef(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  useEffect(() => {
    if (settings) {
      setForm({
        companyName: settings.companyName || '',
        companyLicense: settings.companyLicense || '',
        address: settings.address || '',
        city: settings.city || '',
        state: settings.state || '',
        zipCode: settings.zipCode || '',
        phone: settings.phone || '',
        email: settings.email || '',
        website: settings.website || '',
        bookingUrl: settings.bookingUrl || '',
        reviewLink: settings.reviewLink || '',
        taxRate: settings.taxRate || '',
        logo: settings.logo || '',
        brandColor: settings.brandColor || '',
        secondaryColor: settings.secondaryColor || '',
        tagline: settings.tagline || '',
        documentTrustBadges: settings.documentTrustBadges || [],
        useBrandColorOnDocs: settings.useBrandColorOnDocs || false,
        timezone: settings.timezone || 'America/New_York',
        workingHours: settings.workingHours || defaultWH,
      });
      initializedRef.current = true;
    }
  }, [settings]);

  const doAutoSave = useCallback((currentForm: typeof form) => {
    const rawPhone = currentForm.phone || '';
    if (rawPhone.length > 0 && !isValidPhone(rawPhone)) return;
    const sanitizedBrandColor = currentForm.brandColor && /^#[0-9a-fA-F]{6}$/.test(currentForm.brandColor) ? currentForm.brandColor : '';
    const sanitizedSecondaryColor = currentForm.secondaryColor && /^#[0-9a-fA-F]{6}$/.test(currentForm.secondaryColor) ? currentForm.secondaryColor : '';
    const { taxRate: _taxRate, ...formWithoutTax } = currentForm;
    setAutoSaveStatus('saving');
    updateSettings({ ...formWithoutTax, phone: rawPhone ? normalizePhone(rawPhone) : '', brandColor: sanitizedBrandColor, secondaryColor: sanitizedSecondaryColor } as any, {
      onSuccess: () => {
        setAutoSaveStatus('saved');
        setTimeout(() => setAutoSaveStatus('idle'), 2000);
      },
      onError: () => {
        setAutoSaveStatus('idle');
      }
    });
  }, [updateSettings]);

  const scheduleAutoSave = useCallback((newForm: typeof form) => {
    if (!initializedRef.current) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      doAutoSave(newForm);
    }, 1500);
  }, [doAutoSave]);

  const updateForm = useCallback((updates: Partial<typeof form>) => {
    setForm(prev => {
      const next = { ...prev, ...updates };
      scheduleAutoSave(next);
      return next;
    });
  }, [scheduleAutoSave]);

  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, []);

  const drawLogoToCanvas = useCallback(() => {
    if (!form.logo || !logoCanvasRef.current) return;
    const canvas = logoCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const maxW = Math.min(320, window.innerWidth - 64);
      const scale = maxW / img.width;
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = form.logo;
  }, [form.logo]);

  useEffect(() => {
    if (logoPickerOpen) {
      setTimeout(drawLogoToCanvas, 50);
    }
  }, [logoPickerOpen, drawLogoToCanvas]);

  const handleCanvasColorPick = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = logoCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    let clientX: number, clientY: number;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    const x = Math.round((clientX - rect.left) * (canvas.width / rect.width));
    const y = Math.round((clientY - rect.top) * (canvas.height / rect.height));
    const pixel = ctx.getImageData(x, y, 1, 1).data;
    if (pixel[3] < 10) return;
    const hex = `#${pixel[0].toString(16).padStart(2,'0')}${pixel[1].toString(16).padStart(2,'0')}${pixel[2].toString(16).padStart(2,'0')}`;
    setPickerPreviewColor(hex);
  }, []);

  const confirmLogoColor = useCallback(() => {
    if (pickerPreviewColor) {
      updateForm({ brandColor: pickerPreviewColor });
      toast({ title: "Color picked!", description: pickerPreviewColor });
    }
    setLogoPickerOpen(false);
    setPickerPreviewColor(null);
  }, [pickerPreviewColor, toast, updateForm]);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({ title: "Please select an image file", variant: "destructive" });
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Image must be less than 2MB", variant: "destructive" });
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      const color = await extractDominantColor(base64);
      const updates: Partial<typeof form> = { logo: base64 };
      if (color && !form.brandColor) {
        updates.brandColor = color;
        toast({ title: "Brand color detected from logo", description: `Color ${color} extracted. You can adjust it below.` });
      }
      updateForm(updates);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    updateForm({ logo: '' });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  if (isLoading && !settings) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6 pb-28 lg:p-8 lg:pb-8 space-y-8 animate-in fade-in duration-300">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
          <Building2 className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold font-display">Company Profile</h1>
          <p className="text-muted-foreground">Manage your home services company information</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Company Logo</CardTitle>
          <CardDescription>Upload your company logo to display on proposals and invoices</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-start gap-6">
            <div className="w-32 h-32 border-2 border-dashed rounded-lg flex items-center justify-center bg-muted/30 overflow-hidden">
              {form.logo ? (
                <img 
                  src={form.logo} 
                  alt="Company logo" 
                  className="w-full h-full object-contain"
                  data-testid="img-company-logo"
                />
              ) : (
                <Image className="w-8 h-8 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                className="hidden"
                data-testid="input-logo-upload"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="button-upload-logo"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {form.logo ? 'Change Logo' : 'Upload Logo'}
                </Button>
                {form.logo && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleRemoveLogo}
                    data-testid="button-remove-logo"
                  >
                    <X className="w-4 h-4 mr-2" />
                    Remove
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Recommended: Square image (PNG or JPG), max 2MB
              </p>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t">
            <div className="flex items-center gap-2 mb-3">
              <Palette className="w-4 h-4 text-muted-foreground" />
              <Label>Brand Color</Label>
              <InfoTooltip content="Used in email templates for buttons and header accents. Automatically detected from your logo, or pick your own." />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div 
                className="w-10 h-10 rounded-lg border-2 border-border cursor-pointer shadow-sm transition-all hover:scale-105"
                style={{ backgroundColor: form.brandColor || '#2563eb' }}
                onClick={() => colorInputRef.current?.click()}
                data-testid="button-brand-color-swatch"
              />
              <input
                ref={colorInputRef}
                type="color"
                value={form.brandColor || '#2563eb'}
                onChange={(e) => updateForm({ brandColor: e.target.value })}
                className="sr-only"
                data-testid="input-brand-color"
              />
              <Input
                value={form.brandColor || '#2563eb'}
                onChange={(e) => {
                  const val = e.target.value;
                  if (/^#[0-9a-fA-F]{0,6}$/.test(val)) {
                    updateForm({ brandColor: val });
                  }
                }}
                className="w-28 font-mono text-sm uppercase"
                placeholder="#2563eb"
                maxLength={7}
                data-testid="input-brand-color-hex"
              />
              {form.logo && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setPickerPreviewColor(null);
                    setLogoPickerOpen(true);
                  }}
                  className="text-muted-foreground"
                  data-testid="button-pick-from-logo"
                >
                  <Pipette className="w-3.5 h-3.5 mr-1" />
                  Pick from Logo
                </Button>
              )}
              {'EyeDropper' in window && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    try {
                      const eyeDropper = new (window as any).EyeDropper();
                      const result = await eyeDropper.open();
                      if (result?.sRGBHex) {
                        updateForm({ brandColor: result.sRGBHex });
                        toast({ title: "Color picked!", description: result.sRGBHex });
                      }
                    } catch {
                    }
                  }}
                  className="text-muted-foreground"
                  data-testid="button-eyedropper"
                >
                  <Pipette className="w-3.5 h-3.5 mr-1" />
                  Pick from Screen
                </Button>
              )}
              {form.brandColor && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => updateForm({ brandColor: '' })}
                  className="text-muted-foreground"
                  data-testid="button-reset-brand-color"
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1" />
                  Reset
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              This color is used for buttons and accents in your emails (proposals, invoices, etc.)
            </p>
            {form.brandColor && (
              <>
                <div className="flex items-center gap-2 mt-3">
                  <Checkbox
                    id="useBrandColorOnDocs"
                    checked={form.useBrandColorOnDocs}
                    onCheckedChange={(checked) => updateForm({ useBrandColorOnDocs: !!checked })}
                    data-testid="checkbox-use-brand-color-on-docs"
                  />
                  <Label htmlFor="useBrandColorOnDocs" className="text-sm cursor-pointer">
                    Use this color on proposal and invoice item headers
                  </Label>
                </div>
                <div className="mt-3 p-3 rounded-lg border bg-muted/30">
                  <p className="text-xs font-medium mb-2 text-muted-foreground">Preview</p>
                  <div className="flex items-center gap-3">
                    <div 
                      className="px-4 py-2 rounded-lg text-white text-sm font-semibold" 
                      style={{ backgroundColor: form.brandColor }}
                    >
                      View Proposal
                    </div>
                    <div 
                      className="h-1.5 w-24 rounded-full" 
                      style={{ backgroundColor: form.brandColor }}
                    />
                  </div>
                </div>
              </>
            )}

            {logoPickerOpen && form.logo && (
              <div className="mt-4 p-4 rounded-xl border-2 border-primary/40 bg-card shadow-lg" data-testid="logo-color-picker">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold flex items-center gap-2">
                    <Pipette className="w-4 h-4" />
                    Tap on your logo to pick a color
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => { setLogoPickerOpen(false); setPickerPreviewColor(null); }}
                    data-testid="button-close-logo-picker"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex justify-center mb-3">
                  <canvas
                    ref={logoCanvasRef}
                    className="rounded-lg border cursor-crosshair touch-none max-w-full"
                    onClick={handleCanvasColorPick}
                    onTouchStart={(e) => { e.preventDefault(); handleCanvasColorPick(e); }}
                    onTouchMove={(e) => { e.preventDefault(); handleCanvasColorPick(e); }}
                    data-testid="canvas-logo-picker"
                  />
                </div>
                {pickerPreviewColor && (
                  <div className="flex items-center gap-3 mb-3" data-testid="picker-preview">
                    <div
                      className="w-10 h-10 rounded-lg border-2 border-border shadow-sm"
                      style={{ backgroundColor: pickerPreviewColor }}
                    />
                    <span className="font-mono text-sm font-semibold uppercase">{pickerPreviewColor}</span>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={!pickerPreviewColor}
                    onClick={confirmLogoColor}
                    data-testid="button-confirm-logo-color"
                  >
                    <Check className="w-3.5 h-3.5 mr-1" />
                    Use This Color
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => { setLogoPickerOpen(false); setPickerPreviewColor(null); }}
                    data-testid="button-cancel-logo-picker"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 pt-6 border-t">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <Label className="text-base font-semibold">Document Branding</Label>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Customize how your proposals, invoices, and change orders look to customers.
            </p>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Background Color</Label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {[
                    '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
                    '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
                    '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
                    '#ec4899', '#f43f5e', '#78716c', '#64748b', '#000000',
                    '#ffffff',
                  ].map((c) => (
                    <button
                      key={c}
                      type="button"
                      className="w-8 h-8 rounded-lg border-2 transition-all hover:scale-110 shrink-0"
                      style={{
                        backgroundColor: c,
                        borderColor: (form.secondaryColor || '#3b82f6') === c ? (c === '#ffffff' ? '#3b82f6' : '#fff') : (c === '#ffffff' ? '#d1d5db' : 'transparent'),
                        boxShadow: (form.secondaryColor || '#3b82f6') === c ? '0 0 0 2px currentColor' : 'none',
                      }}
                      onClick={() => updateForm({ secondaryColor: c })}
                      data-testid={`button-palette-color-${c.replace('#', '')}`}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-lg border-2 border-border cursor-pointer shadow-sm transition-all hover:scale-105"
                    style={{ backgroundColor: form.secondaryColor || '#3b82f6' }}
                    onClick={() => secondaryColorInputRef.current?.click()}
                    data-testid="button-secondary-color-swatch"
                  />
                  <input
                    ref={secondaryColorInputRef}
                    type="color"
                    value={form.secondaryColor || '#3b82f6'}
                    onChange={(e) => updateForm({ secondaryColor: e.target.value })}
                    className="sr-only"
                    data-testid="input-secondary-color"
                  />
                  <Input
                    value={form.secondaryColor || '#3b82f6'}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (/^#[0-9a-fA-F]{0,6}$/.test(val)) {
                        updateForm({ secondaryColor: val });
                      }
                    }}
                    className="w-28 font-mono text-sm uppercase"
                    placeholder="#3b82f6"
                    maxLength={7}
                    data-testid="input-secondary-color-hex"
                  />
                  {form.secondaryColor && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => updateForm({ secondaryColor: '' })}
                      className="text-muted-foreground"
                      data-testid="button-reset-secondary-color"
                    >
                      <RotateCcw className="w-3.5 h-3.5 mr-1" />
                      Reset
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">Tap a color or use the swatch/hex code. This is the header background color on your documents. Your brand color is used for card borders and labels.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tagline">Tagline / Motto</Label>
                <Input
                  id="tagline"
                  value={form.tagline}
                  onChange={(e) => updateForm({ tagline: e.target.value })}
                  placeholder="e.g. Painting & Renovation"
                  maxLength={60}
                  data-testid="input-tagline"
                />
                <p className="text-xs text-muted-foreground">Shown next to your logo on document headers.</p>
              </div>

              <div className="space-y-2">
                <Label>Trust Badges</Label>
                <p className="text-xs text-muted-foreground mb-2">Add badges that appear below your header on proposals and invoices (e.g. "Fully Licensed & Insured").</p>
                <div className="space-y-2">
                  {form.documentTrustBadges.map((badge, idx) => (
                    <div key={badge.id} className="flex items-center gap-2" data-testid={`trust-badge-row-${idx}`}>
                      <BadgeCheck className="w-4 h-4 text-muted-foreground shrink-0" />
                      <Input
                        value={badge.label}
                        onChange={(e) => {
                          const updated = [...form.documentTrustBadges];
                          updated[idx] = { ...badge, label: e.target.value };
                          updateForm({ documentTrustBadges: updated });
                        }}
                        placeholder="Badge text"
                        className="flex-1"
                        data-testid={`input-trust-badge-${idx}`}
                      />
                      <div className="flex gap-0.5 shrink-0">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground"
                          disabled={idx === 0}
                          onClick={() => {
                            const updated = [...form.documentTrustBadges];
                            [updated[idx - 1], updated[idx]] = [updated[idx], updated[idx - 1]];
                            updateForm({ documentTrustBadges: updated });
                          }}
                          data-testid={`button-move-up-trust-badge-${idx}`}
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground"
                          disabled={idx === form.documentTrustBadges.length - 1}
                          onClick={() => {
                            const updated = [...form.documentTrustBadges];
                            [updated[idx], updated[idx + 1]] = [updated[idx + 1], updated[idx]];
                            updateForm({ documentTrustBadges: updated });
                          }}
                          data-testid={`button-move-down-trust-badge-${idx}`}
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                        onClick={() => {
                          updateForm({ documentTrustBadges: form.documentTrustBadges.filter((_, i) => i !== idx) });
                        }}
                        data-testid={`button-remove-trust-badge-${idx}`}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      updateForm({
                        documentTrustBadges: [...form.documentTrustBadges, { id: crypto.randomUUID(), label: '' }]
                      });
                    }}
                    data-testid="button-add-trust-badge"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Add Badge
                  </Button>
                </div>
              </div>

              <div className="mt-4 p-4 rounded-xl border bg-muted/30">
                <p className="text-xs font-medium mb-3 text-muted-foreground">Header Preview</p>
                <div className="rounded-lg overflow-hidden shadow-sm border">
                  {(() => {
                  const pvBg = form.secondaryColor || '#1e293b';
                  const pvHex = pvBg.replace('#', '');
                  const pvFull = pvHex.length === 3 ? pvHex.split('').map((c: string) => c + c).join('') : pvHex;
                  const pvR = parseInt(pvFull.substring(0, 2), 16) || 0;
                  const pvG = parseInt(pvFull.substring(2, 4), 16) || 0;
                  const pvB = parseInt(pvFull.substring(4, 6), 16) || 0;
                  const pvLight = (0.299 * pvR + 0.587 * pvG + 0.114 * pvB) / 255 > 0.6;
                  const pvText = pvLight ? '#1a1a1a' : '#ffffff';
                  const pvMuted = pvLight ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.6)';
                  const pvSemiMuted = pvLight ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.8)';
                  const pvBorder = pvLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.2)';
                  const pvSubtleBg = pvLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.1)';
                  return (
                <div style={{ backgroundColor: pvBg }}>
                    <div className="px-4 py-3 text-center">
                      {form.logo && (
                        <img src={form.logo} alt="" className="w-10 h-10 object-contain rounded-lg p-0.5 mx-auto mb-1.5" style={{ backgroundColor: pvSubtleBg }} />
                      )}
                      <p className="text-sm font-bold tracking-wide" style={{ color: pvText }}>{form.companyName || 'Your Company'}</p>
                      {form.tagline && <p className="text-[10px] uppercase tracking-wider mt-0.5" style={{ color: pvMuted }}>{form.tagline}</p>}
                    </div>
                    {form.documentTrustBadges.filter(b => b.label.trim()).length > 0 && (
                      <div className="px-3 pb-2 flex flex-wrap gap-1.5 justify-center">
                        {form.documentTrustBadges.filter(b => b.label.trim()).map(b => (
                          <span key={b.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium" style={{ border: `1px solid ${pvBorder}`, color: pvSemiMuted }}>
                            <CheckCircle className="w-2.5 h-2.5 text-green-400" />
                            {b.label}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="h-0.5" style={{ backgroundColor: form.brandColor || '#3b82f6' }} />
                  </div>
                  );
                  })()}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <ContractorSignatureCard />

      <Card>
        <CardHeader>
          <CardTitle>Business Information</CardTitle>
          <CardDescription>This information appears on your documents and invoices</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="companyName">Company Name</Label>
            <Input 
              id="companyName"
              value={form.companyName}
              onChange={(e) => updateForm({ companyName: e.target.value })}
              placeholder="Your Company Name"
              data-testid="input-company-name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="companyLicense" className="flex items-center gap-1">License Number <InfoTooltip text="Your contractor or business license number. This will appear on all your proposals, estimates, and invoices." /></Label>
            <Input 
              id="companyLicense"
              value={form.companyLicense}
              onChange={(e) => updateForm({ companyLicense: e.target.value })}
              placeholder="e.g. #12345678"
              data-testid="input-company-license"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Street Address</Label>
            <Input 
              id="address"
              value={form.address}
              onChange={(e) => updateForm({ address: e.target.value })}
              placeholder="123 Main Street"
              data-testid="input-address"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input 
                id="city"
                value={form.city}
                onChange={(e) => updateForm({ city: e.target.value })}
                placeholder="City"
                data-testid="input-city"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">State</Label>
              <Input 
                id="state"
                value={form.state}
                onChange={(e) => updateForm({ state: e.target.value })}
                placeholder="CA"
                data-testid="input-state"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="zipCode">ZIP Code</Label>
              <Input 
                id="zipCode"
                value={form.zipCode}
                onChange={(e) => updateForm({ zipCode: e.target.value })}
                placeholder="12345"
                data-testid="input-zip"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input 
                id="phone"
                value={form.phone}
                onChange={(e) => {
                  updateForm({ phone: stripPhoneInput(e.target.value) });
                }}
                inputMode="tel"
                placeholder="+15551234567"
                data-testid="input-phone"
              />
              {form.phone && form.phone.length > 0 && !isValidPhone(form.phone) && (
                <p className="text-xs text-amber-500 mt-1">Enter a valid US/Canada phone number</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Business Email</Label>
              <Input 
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => updateForm({ email: e.target.value })}
                placeholder="info@yourcompany.com"
                data-testid="input-email"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="website">Website</Label>
            <Input 
              id="website"
              value={form.website}
              onChange={(e) => updateForm({ website: e.target.value })}
              placeholder="https://yourcompany.com"
              data-testid="input-website"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bookingUrl" className="flex items-center gap-1">Custom Booking Link (Optional) <InfoTooltip text="If you use Calendly, your own website booking page, or another scheduling tool, paste the link here. This URL is sent to customers via text when they request proposals." /></Label>
            <Input 
              id="bookingUrl"
              value={form.bookingUrl}
              onChange={(e) => updateForm({ bookingUrl: e.target.value })}
              placeholder="https://yourwebsite.com/book or https://calendly.com/yourcompany"
              data-testid="input-booking-url"
            />
            <p className="text-xs text-muted-foreground">If you have your own booking page on your website, paste it here. This link will be sent to customers who request proposals by text. If empty, we'll use your built-in Fuse Phone booking form below instead.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reviewLink" className="flex items-center gap-1">Review Link <InfoTooltip text="Direct link to your Google, Yelp, or Facebook review page. This is shared with customers after completed projects to help you collect more positive reviews." /></Label>
            <Input 
              id="reviewLink"
              value={form.reviewLink}
              onChange={(e) => updateForm({ reviewLink: e.target.value })}
              placeholder="https://g.page/your-business/review"
              data-testid="input-review-link"
            />
            <p className="text-xs text-muted-foreground">Link where customers can leave you a review (Google, Yelp, Facebook, etc.)</p>
          </div>

          {autoSaveStatus === 'saving' && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground pt-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Saving...
            </div>
          )}
          {autoSaveStatus === 'saved' && (
            <div className="flex items-center gap-2 text-sm text-green-600 pt-2">
              <Check className="w-3.5 h-3.5" />
              Saved
            </div>
          )}
        </CardContent>
      </Card>

      <ProposalSettingsCard settings={settings} />

      <WorkingHoursCard form={form} setForm={updateForm} />

      <ComplianceCard settings={settings} />

      <BookingSlugCard settings={settings} toast={toast} />

      <MakeItYourOwnBanner />

      <DeleteAccountTrigger />

    </div>
  );
}

function DeleteAccountTrigger() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="flex justify-center pt-4 pb-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-sm text-muted-foreground hover:text-destructive underline inline-flex items-center gap-1"
          data-testid="link-open-delete-account"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Delete account
        </button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" data-testid="dialog-profile-delete-account">
          <DialogHeader>
            <DialogTitle>Delete account</DialogTitle>
            <DialogDescription>
              Schedule your account for deletion. You'll have 60 days to change your mind by signing back in.
            </DialogDescription>
          </DialogHeader>
          {/* key forces a fresh mount each time the dialog opens, so users
              never re-enter on the destructive "confirm" step they left
              behind. */}
          <DeleteAccountCard key={open ? 'open' : 'closed'} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function MakeItYourOwnBanner() {
  const { isElite, hasWhiteLabel, isNativeApp } = useSubscription();

  if (!isElite || hasWhiteLabel || isNativeApp) return null;

  return (
    <Card className="overflow-visible border-primary/20 bg-gradient-to-br from-primary/5 via-transparent to-primary/5" data-testid="card-make-it-your-own-banner">
      <CardContent className="p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Sparkles className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h3 className="text-lg font-bold font-display">Make It Your Own</h3>
              <Badge variant="secondary" className="text-xs">Limited Time</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Get your own branded portal (portal.yourdomain.com) for proposals, invoices, and booking pages. Remove all Fuse Phone branding for a fully professional experience.
            </p>
            <p className="text-sm font-semibold mt-1">{PRICE_LABELS.makeItYourOwnMonthly}/mo</p>
          </div>
          <Link href="/settings/integrations">
            <Button data-testid="button-make-it-your-own-cta">
              Get Started
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function ContractorSignatureCard() {
  const { data: settings } = useCompanySettings();
  const { mutate: updateSettings, isPending } = useUpdateCompanySettings();
  const { toast } = useToast();
  const sigPad = useRef<SignatureCanvas>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const savedSig = settings?.contractorSignature;
  const isEnabled = settings?.useContractorSignature ?? false;

  const handleSave = () => {
    if (!sigPad.current || sigPad.current.isEmpty()) {
      toast({ title: "Please draw your signature first", variant: "destructive" });
      return;
    }
    const dataUrl = sigPad.current.toDataURL();
    updateSettings({ contractorSignature: dataUrl } as any, {
      onSuccess: () => {
        toast({ title: "Signature saved" });
        setIsDrawing(false);
      },
    });
  };

  const handleClear = () => {
    sigPad.current?.clear();
  };

  const handleRemove = () => {
    updateSettings({ contractorSignature: null, useContractorSignature: false } as any, {
      onSuccess: () => toast({ title: "Signature removed" }),
    });
  };

  const handleToggle = (checked: boolean) => {
    if (checked && !savedSig) {
      toast({ title: "Please draw and save your signature first", variant: "destructive" });
      return;
    }
    updateSettings({ useContractorSignature: checked } as any, {
      onSuccess: () => toast({ title: checked ? "Contractor signature enabled on documents" : "Contractor signature disabled" }),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PenLine className="w-5 h-5" />
          Contractor Signature
        </CardTitle>
        <CardDescription>Add your signature to appear on proposals and estimates alongside the customer's signature</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Checkbox
            id="useContractorSignature"
            checked={isEnabled}
            onCheckedChange={handleToggle}
            data-testid="checkbox-use-contractor-signature"
          />
          <Label htmlFor="useContractorSignature" className="cursor-pointer">
            Show contractor signature on documents
          </Label>
          <InfoTooltip text="When enabled, your signature will appear on the left side of proposals and estimates, with the customer's signature on the right." />
        </div>

        {savedSig && !isDrawing ? (
          <div className="space-y-3">
            <div className="border rounded-lg p-4">
              <p className="text-xs text-muted-foreground mb-2">Your saved signature</p>
              <div className="bg-white rounded-md p-3 border">
                <img src={savedSig} alt="Contractor signature" className="h-20 object-contain" data-testid="img-contractor-signature" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsDrawing(true)} data-testid="button-redraw-signature">
                <PenLine className="w-3.5 h-3.5 mr-1.5" />
                Redraw
              </Button>
              <Button variant="outline" size="sm" onClick={handleRemove} className="text-destructive hover:text-destructive" data-testid="button-remove-signature">
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                Remove
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="border-2 border-dashed rounded-lg bg-white overflow-hidden">
              <SignatureCanvas
                ref={sigPad}
                canvasProps={{
                  className: "w-full",
                  style: { width: '100%', height: 150 },
                  "data-testid": "canvas-contractor-signature",
                }}
                backgroundColor="rgb(255,255,255)"
              />
            </div>
            <p className="text-xs text-muted-foreground">Draw your signature above using your mouse or finger</p>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave} disabled={isPending} data-testid="button-save-signature">
                {isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
                Save Signature
              </Button>
              <Button variant="outline" size="sm" onClick={handleClear} data-testid="button-clear-signature">
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                Clear
              </Button>
              {savedSig && (
                <Button variant="ghost" size="sm" onClick={() => setIsDrawing(false)} data-testid="button-cancel-redraw">
                  Cancel
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TaxProfilesSection() {
  const { toast } = useToast();
  const { data: profiles = [], refetch } = useQuery<any[]>({ queryKey: ['/api/tax-profiles'] });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editRate, setEditRate] = useState('');
  const [newName, setNewName] = useState('');
  const [newRate, setNewRate] = useState('');
  const [adding, setAdding] = useState(false);

  const saveNew = async () => {
    if (!newName.trim() || !newRate.trim()) return;
    const isFirst = profiles.length === 0;
    await apiRequest('POST', '/api/tax-profiles', { name: newName.trim(), rate: newRate.trim(), isDefault: isFirst });
    setNewName(''); setNewRate(''); setAdding(false);
    refetch();
    toast({ title: "Tax rate added" });
  };

  const saveEdit = async (id: number) => {
    if (!editName.trim() || !editRate.trim()) return;
    await apiRequest('PUT', `/api/tax-profiles/${id}`, { name: editName.trim(), rate: editRate.trim() });
    setEditingId(null);
    refetch();
    toast({ title: "Tax rate updated" });
  };

  const setDefault = async (id: number) => {
    await apiRequest('PUT', `/api/tax-profiles/${id}`, { isDefault: true });
    refetch();
    toast({ title: "Default tax rate updated" });
  };

  const deleteProfile = async (id: number) => {
    await apiRequest('DELETE', `/api/tax-profiles/${id}`);
    refetch();
    toast({ title: "Tax rate removed" });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-1">
          Tax Rates
          <InfoTooltip text="Set up multiple tax rates for different areas (county, city, etc.). When creating a proposal, you can choose which tax rate applies to each section." />
        </Label>
        {!adding && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)} data-testid="button-add-tax-profile">
            <Plus className="w-3.5 h-3.5 mr-1" /> Add Rate
          </Button>
        )}
      </div>
      {profiles.length === 0 && !adding && (
        <p className="text-sm text-muted-foreground">No tax rates configured. Add one to enable tax calculations on your proposals.</p>
      )}
      <div className="space-y-2">
        {profiles.map((p: any) => (
          <div key={p.id} className="flex items-center gap-2 p-2.5 rounded-lg border bg-card" data-testid={`tax-profile-${p.id}`}>
            {editingId === p.id ? (
              <div className="flex-1 space-y-2">
                <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-8" placeholder="Name" data-testid="input-edit-tax-name" />
                <div className="flex items-center gap-2">
                  <Input value={editRate} onChange={e => setEditRate(e.target.value)} type="number" step="0.001" className="w-28 h-8" placeholder="Rate %" data-testid="input-edit-tax-rate" />
                  <span className="text-sm text-muted-foreground">%</span>
                  <div className="flex-1" />
                  <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => saveEdit(p.id)} data-testid="button-save-tax-edit"><Check className="w-4 h-4" /></Button>
                  <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setEditingId(null)} data-testid="button-cancel-tax-edit"><X className="w-4 h-4" /></Button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium truncate">{p.name}</span>
                    {p.isDefault && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">Default</span>}
                  </div>
                  <span className="text-xs text-muted-foreground">{p.rate}%</span>
                </div>
                {!p.isDefault && (
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setDefault(p.id)} data-testid={`button-set-default-tax-${p.id}`}>Set Default</Button>
                )}
                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => { setEditingId(p.id); setEditName(p.name); setEditRate(p.rate); }} data-testid={`button-edit-tax-${p.id}`}><PenLine className="w-3.5 h-3.5" /></Button>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={() => deleteProfile(p.id)} data-testid={`button-delete-tax-${p.id}`}><Trash2 className="w-3.5 h-3.5" /></Button>
              </>
            )}
          </div>
        ))}
        {adding && (
          <div className="p-2.5 rounded-lg border border-dashed bg-muted/30 space-y-2">
            <Input value={newName} onChange={e => setNewName(e.target.value)} className="h-8" placeholder="e.g., Nassau County" autoFocus data-testid="input-new-tax-name" />
            <div className="flex items-center gap-2">
              <Input value={newRate} onChange={e => setNewRate(e.target.value)} type="number" step="0.001" className="w-28 h-8" placeholder="Rate %" data-testid="input-new-tax-rate" />
              <span className="text-sm text-muted-foreground">%</span>
              <div className="flex-1" />
              <Button size="sm" className="h-8" onClick={saveNew} data-testid="button-save-new-tax">Save</Button>
              <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => { setAdding(false); setNewName(''); setNewRate(''); }} data-testid="button-cancel-new-tax"><X className="w-4 h-4" /></Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ProposalSettingsCard({ settings }: { settings: any }) {
  const { toast } = useToast();
  const { mutate: updateSettings, isPending } = useUpdateCompanySettings();

  const [depositRequired, setDepositRequired] = useState(false);
  const [depositType, setDepositType] = useState<'fixed' | 'percentage'>('percentage');
  const [depositAmount, setDepositAmount] = useState(50);
  const [showPaymentSchedule, setShowPaymentSchedule] = useState(false);
  const [allowOnlinePayment, setAllowOnlinePayment] = useState(false);
  const [showFinancing, setShowFinancing] = useState(false);
  const [schedule, setSchedule] = useState<Array<{ label: string; dueCondition: string }>>([]);
  const [cardFeeEnabled, setCardFeeEnabled] = useState(false);
  const [cardFeePercent, setCardFeePercent] = useState(3);

  useEffect(() => {
    if (settings) {
      const ps = settings.defaultPaymentSettings;
      if (ps) {
        setDepositRequired(ps.depositRequired ?? false);
        setDepositType(ps.depositType ?? 'percentage');
        setDepositAmount(ps.depositAmount ?? 50);
        setShowPaymentSchedule(ps.showPaymentSchedule ?? false);
        setAllowOnlinePayment(ps.allowOnlinePayment ?? false);
        setShowFinancing(ps.showFinancing ?? false);
        setCardFeeEnabled(ps.cardFeeEnabled ?? false);
        setCardFeePercent(ps.cardFeePercent ?? 3);
        setSchedule((ps.schedule || []).map((s: any) => ({
          label: s.label || '',
          dueCondition: s.dueCondition || 'upon_completion',
        })));
      }
    }
  }, [settings]);

  const handleSave = () => {
    const defaultPaymentSettings = {
      depositRequired,
      depositType,
      depositAmount,
      showPaymentSchedule,
      allowOnlinePayment,
      showFinancing,
      cardFeeEnabled,
      cardFeePercent,
      schedule: schedule.map(s => ({
        label: s.label,
        amount: 0,
        dueCondition: s.dueCondition,
      })),
    };
    updateSettings({ defaultPaymentSettings } as any, {
      onSuccess: () => toast({ title: "Proposal settings saved" }),
      onError: (error: any) => toast({ title: "Failed to save", description: error.message, variant: "destructive" }),
    });
  };

  const addScheduleItem = () => {
    setSchedule(prev => [...prev, { label: 'Final Payment', dueCondition: 'upon_completion' }]);
  };

  const removeScheduleItem = (index: number) => {
    setSchedule(prev => prev.filter((_, i) => i !== index));
  };

  const updateScheduleItem = (index: number, field: string, value: string) => {
    setSchedule(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };

  const DUE_CONDITIONS = [
    { value: "upon_signing", label: "Upon signing" },
    { value: "upon_start", label: "At start of work" },
    { value: "upon_completion", label: "Upon completion" },
    { value: "net_30", label: "Net 30 days" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="w-5 h-5" />
          Proposal Settings
        </CardTitle>
        <CardDescription>Set defaults that automatically apply to every new proposal and invoice you create</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <TaxProfilesSection />

        <div className="border-t pt-6 space-y-4">
          <div>
            <Label className="flex items-center gap-1 text-base font-medium">
              Default Payment & Deposit Settings
              <InfoTooltip text="These settings will be automatically applied to every new proposal and invoice you create. You can always change them on individual documents." />
            </Label>
            <p className="text-xs text-muted-foreground mt-1">Automatically applied when you create a new document</p>
          </div>

          <div className="flex items-center gap-3">
            <Checkbox
              id="defaultDepositRequired"
              checked={depositRequired}
              onCheckedChange={(checked) => setDepositRequired(!!checked)}
              data-testid="checkbox-default-deposit"
            />
            <Label htmlFor="defaultDepositRequired" className="cursor-pointer">Require deposit</Label>
          </div>

          {depositRequired && (
            <div className="ml-7 space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center gap-3">
                <Select value={depositType} onValueChange={(v) => setDepositType(v as 'fixed' | 'percentage')}>
                  <SelectTrigger className="w-36" data-testid="select-default-deposit-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage</SelectItem>
                    <SelectItem value="fixed">Fixed Amount</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1">
                  {depositType === 'fixed' && <span className="text-muted-foreground">$</span>}
                  <Input
                    type="number"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(Number(e.target.value))}
                    className="w-24"
                    min={0}
                    max={depositType === 'percentage' ? 100 : undefined}
                    data-testid="input-default-deposit-amount"
                  />
                  {depositType === 'percentage' && <span className="text-muted-foreground">%</span>}
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <Checkbox
              id="defaultAllowOnlinePayment"
              checked={allowOnlinePayment}
              onCheckedChange={(checked) => setAllowOnlinePayment(!!checked)}
              data-testid="checkbox-default-online-payment"
            />
            <Label htmlFor="defaultAllowOnlinePayment" className="cursor-pointer flex items-center gap-1">
              Allow credit card / Stripe payments
              <InfoTooltip text="Let customers pay online with a credit card. Requires Stripe to be connected in Integrations." />
            </Label>
          </div>

          {allowOnlinePayment && (
            <div className="ml-7 space-y-3 animate-in fade-in duration-200">
              {!!settings?.state && ['CT', 'MA', 'ME'].includes(String(settings.state).toUpperCase()) && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-900 dark:text-amber-200" data-testid="warning-default-surcharge-state">
                  <span className="font-semibold">Heads up — your company address is in {String(settings.state).toUpperCase()}.</span> Credit card surcharging is restricted by state law in CT, MA, and ME. Most contractors in these states absorb the fee instead. You can still turn it on if you've confirmed it's allowed for your situation, but you do so at your own discretion — Fuse Phone does not provide legal advice.
                </div>
              )}
              <div className="flex items-center gap-3">
                <Checkbox
                  id="defaultCardFeeEnabled"
                  checked={cardFeeEnabled}
                  onCheckedChange={(checked) => setCardFeeEnabled(!!checked)}
                  data-testid="checkbox-default-card-fee"
                />
                <Label htmlFor="defaultCardFeeEnabled" className="cursor-pointer flex items-center gap-1">
                  Pass card processing fee to customer
                  <InfoTooltip text="When the customer pays with a card, add this percentage on top of the charged amount. Offline payments are never charged a fee. Surcharging credit cards is restricted in some states (CT, MA, ME). Verify rules in your service area." />
                </Label>
              </div>
              {cardFeeEnabled && (
                <div className="flex items-center gap-2 ml-7">
                  <span className="text-sm text-muted-foreground">Fee</span>
                  <Input
                    type="number"
                    value={cardFeePercent}
                    onChange={(e) => {
                      const num = Math.max(0, Math.min(4, parseFloat(e.target.value) || 0));
                      setCardFeePercent(num);
                    }}
                    className="w-20"
                    min={0}
                    max={4}
                    step={0.1}
                    data-testid="input-default-card-fee-percent"
                  />
                  <span className="text-sm text-muted-foreground">% (typical: 3.0%, max 4%)</span>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-3">
            <Checkbox
              id="defaultShowSchedule"
              checked={showPaymentSchedule}
              onCheckedChange={(checked) => setShowPaymentSchedule(!!checked)}
              data-testid="checkbox-default-show-schedule"
            />
            <Label htmlFor="defaultShowSchedule" className="cursor-pointer">Include payment schedule on proposal</Label>
          </div>

          {showPaymentSchedule && (
            <div className="ml-7 space-y-3 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Payment Schedule</Label>
                <Button variant="outline" size="sm" onClick={addScheduleItem} data-testid="button-add-default-payment">
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Add Payment
                </Button>
              </div>
              {schedule.map((item, i) => (
                <div key={i} className="p-3 border rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <Input
                      value={item.label}
                      onChange={(e) => updateScheduleItem(i, 'label', e.target.value)}
                      placeholder="Payment name"
                      className="flex-1 mr-2"
                      data-testid={`input-default-schedule-label-${i}`}
                    />
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeScheduleItem(i)} data-testid={`button-remove-default-schedule-${i}`}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  <Select value={item.dueCondition} onValueChange={(v) => updateScheduleItem(i, 'dueCondition', v)}>
                    <SelectTrigger className="w-full" data-testid={`select-default-schedule-due-${i}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DUE_CONDITIONS.map(c => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
              {schedule.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">No schedule items yet. Add a payment milestone above.</p>
              )}
            </div>
          )}

          {settings?.financingEnabled && settings?.financingLink && (
            <div className="flex items-center gap-3">
              <Checkbox
                id="defaultShowFinancing"
                checked={showFinancing}
                onCheckedChange={(checked) => setShowFinancing(!!checked)}
                data-testid="checkbox-default-show-financing"
              />
              <Label htmlFor="defaultShowFinancing" className="cursor-pointer flex items-center gap-1">
                Show financing options on proposals
                <InfoTooltip text="When enabled, new proposals will include a 'Financing Available' section so customers can apply through your financing provider." />
              </Label>
            </div>
          )}
        </div>

        <div className="pt-4 border-t">
          <Button onClick={handleSave} disabled={isPending} data-testid="button-save-proposal-settings">
            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            <Save className="w-4 h-4 mr-2" />
            Save Proposal Settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

const DAYS = [
  { key: 'mon', label: 'Monday', short: 'Mon' },
  { key: 'tue', label: 'Tuesday', short: 'Tue' },
  { key: 'wed', label: 'Wednesday', short: 'Wed' },
  { key: 'thu', label: 'Thursday', short: 'Thu' },
  { key: 'fri', label: 'Friday', short: 'Fri' },
  { key: 'sat', label: 'Saturday', short: 'Sat' },
  { key: 'sun', label: 'Sunday', short: 'Sun' },
] as const;

const US_TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HT)' },
  { value: 'America/Phoenix', label: 'Arizona (no DST)' },
];

const TIME_OPTIONS = (() => {
  const opts: { value: string; label: string }[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      const val = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      const ampm = h < 12 ? 'AM' : 'PM';
      const label = `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
      opts.push({ value: val, label });
    }
  }
  return opts;
})();

interface WorkingHoursDay {
  enabled: boolean;
  start: string;
  end: string;
}

interface WorkingHoursData {
  [key: string]: WorkingHoursDay;
}

function WorkingHoursCard({ form, setForm }: {
  form: any;
  setForm: (updates: Partial<typeof form>) => void;
}) {
  const hours: WorkingHoursData = (() => {
    try { return JSON.parse(form.workingHours); } catch { return {}; }
  })();

  const updateDay = (dayKey: string, field: keyof WorkingHoursDay, value: any) => {
    const updated = { ...hours, [dayKey]: { ...hours[dayKey], [field]: value } };
    setForm({ workingHours: JSON.stringify(updated) });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-4">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Clock className="w-5 h-5 text-primary" />
        </div>
        <div>
          <CardTitle className="text-lg">Working Hours & Timezone</CardTitle>
          <CardDescription>Set when your business operates. Automated messages will only send during these hours.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-muted-foreground" />
            Timezone
            <InfoTooltip text="Your business timezone. All scheduled messages, automated follow-ups, and appointment times are based on this setting." />
          </Label>
          <Select value={form.timezone} onValueChange={(val) => setForm({ timezone: val })}>
            <SelectTrigger data-testid="select-timezone">
              <SelectValue placeholder="Select timezone" />
            </SelectTrigger>
            <SelectContent>
              {US_TIMEZONES.map((tz) => (
                <SelectItem key={tz.value} value={tz.value} data-testid={`option-tz-${tz.value}`}>
                  {tz.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-3">
          <Label className="flex items-center gap-1">Business Hours <InfoTooltip text="Set your operating hours for each day of the week. Automated texts and follow-up messages will only be sent during these hours to avoid contacting customers at inappropriate times." /></Label>
          <div className="space-y-2">
            {DAYS.map((day) => {
              const dayData = hours[day.key] || { enabled: false, start: '08:00', end: '17:00' };
              return (
                <div key={day.key} className="flex items-center gap-3 py-1.5">
                  <Checkbox
                    id={`day-${day.key}`}
                    checked={dayData.enabled}
                    onCheckedChange={(checked) => updateDay(day.key, 'enabled', !!checked)}
                    data-testid={`checkbox-day-${day.key}`}
                  />
                  <Label
                    htmlFor={`day-${day.key}`}
                    className={`w-12 text-sm cursor-pointer ${!dayData.enabled ? 'text-muted-foreground' : ''}`}
                  >
                    {day.short}
                  </Label>
                  {dayData.enabled ? (
                    <div className="flex items-center gap-2 flex-1 flex-wrap">
                      <Select value={dayData.start} onValueChange={(val) => updateDay(day.key, 'start', val)}>
                        <SelectTrigger className="w-[120px]" data-testid={`select-start-${day.key}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TIME_OPTIONS.map((t) => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span className="text-sm text-muted-foreground">to</span>
                      <Select value={dayData.end} onValueChange={(val) => updateDay(day.key, 'end', val)}>
                        <SelectTrigger className="w-[120px]" data-testid={`select-end-${day.key}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TIME_OPTIONS.map((t) => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">Closed</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

      </CardContent>
    </Card>
  );
}

interface InsuranceItem {
  id: string;
  type: string;
  provider: string;
  policyNumber: string;
  expirationDate: string;
  coverageAmount: string;
  documentPath?: string;
}

interface CertificateItem {
  id: string;
  name: string;
  issuedBy: string;
  number: string;
  expirationDate: string;
  documentPath?: string;
}

interface AwardItem {
  id: string;
  name: string;
  issuedBy: string;
  year: string;
  documentPath?: string;
}

function ComplianceDocUpload({ documentPath, onUpload, onRemove, isUploading, itemId, label }: {
  documentPath?: string;
  onUpload: (path: string) => void;
  onRemove: () => void;
  isUploading: boolean;
  itemId: string;
  label: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { uploadFile, isUploading: uploading } = useUpload();
  const busy = isUploading || uploading;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'];
    if (!allowed.includes(file.type)) {
      toast({ title: "Please select a PDF or image file (JPG, PNG, WebP, HEIC)", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File must be less than 10MB", variant: "destructive" });
      return;
    }
    const result = await uploadFile(file);
    if (result) {
      onUpload(result.objectPath);
      toast({ title: `${label} uploaded` });
    }
    if (inputRef.current) inputRef.current.value = '';
  };

  const isImage = documentPath && /\.(jpg|jpeg|png|webp|heic)$/i.test(documentPath);

  return (
    <div className="mt-2">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
        onChange={handleFileChange}
        className="hidden"
        data-testid={`input-doc-upload-${itemId}`}
      />
      {documentPath ? (
        <div className="flex items-center gap-3 p-2 border rounded-lg bg-muted/30">
          {isImage ? (
            <Image className="w-4 h-4 text-primary shrink-0" />
          ) : (
            <FileText className="w-4 h-4 text-primary shrink-0" />
          )}
          <span className="text-xs text-muted-foreground flex-1 truncate" data-testid={`text-doc-name-${itemId}`}>
            {isImage ? 'Image uploaded' : 'PDF uploaded'}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={() => window.open(documentPath.startsWith('/objects/') ? documentPath : `/objects/${documentPath}`, '_blank')} data-testid={`button-view-doc-${itemId}`}>
              View
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={() => inputRef.current?.click()} disabled={busy} data-testid={`button-replace-doc-${itemId}`}>
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Replace'}
            </Button>
            <Button variant="ghost" size="sm" className="h-7 px-1" onClick={onRemove} data-testid={`button-remove-doc-${itemId}`}>
              <Trash2 className="w-3 h-3 text-muted-foreground" />
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => inputRef.current?.click()} disabled={busy} data-testid={`button-upload-doc-${itemId}`}>
          {busy ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Upload className="w-3 h-3 mr-1" />}
          Upload Proof (PDF/Image)
        </Button>
      )}
    </div>
  );
}

function ComplianceCard({ settings }: { settings: any }) {
  const { toast } = useToast();
  const { mutate: updateSettings, isPending } = useUpdateCompanySettings();
  const { uploadFile, isUploading } = useUpload();

  const [insurances, setInsurances] = useState<InsuranceItem[]>([]);
  const [certificates, setCertificates] = useState<CertificateItem[]>([]);
  const [awards, setAwards] = useState<AwardItem[]>([]);

  useEffect(() => {
    if (settings) {
      const cd = settings.complianceData;
      setInsurances(cd?.insurances || []);
      setCertificates(cd?.certificates || []);
      setAwards(cd?.awards || []);
    }
  }, [settings]);

  const addInsurance = () => {
    setInsurances(prev => [...prev, {
      id: crypto.randomUUID(),
      type: 'General Liability',
      provider: '',
      policyNumber: '',
      expirationDate: '',
      coverageAmount: '',
    }]);
  };

  const updateInsurance = (id: string, field: keyof InsuranceItem, value: string) => {
    setInsurances(prev => prev.map(ins => ins.id === id ? { ...ins, [field]: value } : ins));
  };

  const removeInsurance = (id: string) => {
    setInsurances(prev => prev.filter(ins => ins.id !== id));
  };

  const addCertificate = () => {
    setCertificates(prev => [...prev, {
      id: crypto.randomUUID(),
      name: '',
      issuedBy: '',
      number: '',
      expirationDate: '',
    }]);
  };

  const updateCertificate = (id: string, field: keyof CertificateItem, value: string) => {
    setCertificates(prev => prev.map(cert => cert.id === id ? { ...cert, [field]: value } : cert));
  };

  const removeCertificate = (id: string) => {
    setCertificates(prev => prev.filter(cert => cert.id !== id));
  };

  const addAward = () => {
    setAwards(prev => [...prev, {
      id: crypto.randomUUID(),
      name: '',
      issuedBy: '',
      year: new Date().getFullYear().toString(),
    }]);
  };

  const updateAward = (id: string, field: keyof AwardItem, value: string) => {
    setAwards(prev => prev.map(a => a.id === id ? { ...a, [field]: value } : a));
  };

  const removeAward = (id: string) => {
    setAwards(prev => prev.filter(a => a.id !== id));
  };

  const handleSave = () => {
    const complianceData = { insurances, certificates, awards };
    updateSettings({ complianceData } as any, {
      onSuccess: () => toast({ title: "Compliance information saved" }),
      onError: (error: any) => toast({ title: "Failed to save", description: error.message, variant: "destructive" }),
    });
  };

  const isExpiringSoon = (dateStr: string) => {
    if (!dateStr) return false;
    const exp = new Date(dateStr);
    const now = new Date();
    const diffDays = (exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays <= 30 && diffDays >= 0;
  };

  const isExpired = (dateStr: string) => {
    if (!dateStr) return false;
    return new Date(dateStr) < new Date();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Shield className="w-5 h-5 text-primary" />
          <div>
            <CardTitle>Compliance</CardTitle>
            <CardDescription>Manage your insurance policies, certificates, licenses, and awards</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-8">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Insurance Policies</h3>
            <Button variant="outline" size="sm" onClick={addInsurance} data-testid="button-add-insurance">
              <Plus className="w-4 h-4 mr-1" />
              Add Insurance
            </Button>
          </div>

          {insurances.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center border rounded-lg border-dashed">No insurance policies added yet</p>
          )}

          {insurances.map((ins) => (
            <div key={ins.id} className="border rounded-lg p-4 space-y-3" data-testid={`card-insurance-${ins.id}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Select value={ins.type} onValueChange={(v) => updateInsurance(ins.id, 'type', v)}>
                    <SelectTrigger className="w-[200px]" data-testid={`select-insurance-type-${ins.id}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="General Liability">General Liability</SelectItem>
                      <SelectItem value="Workers Compensation">Workers Compensation</SelectItem>
                      <SelectItem value="Commercial Auto">Commercial Auto</SelectItem>
                      <SelectItem value="Professional Liability">Professional Liability</SelectItem>
                      <SelectItem value="Umbrella/Excess">Umbrella / Excess</SelectItem>
                      <SelectItem value="Property">Property</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  {ins.expirationDate && isExpired(ins.expirationDate) && (
                    <Badge variant="destructive" className="text-xs">Expired</Badge>
                  )}
                  {ins.expirationDate && isExpiringSoon(ins.expirationDate) && !isExpired(ins.expirationDate) && (
                    <Badge variant="outline" className="text-xs border-amber-500 text-amber-600">Expiring Soon</Badge>
                  )}
                </div>
                <Button variant="ghost" size="sm" onClick={() => removeInsurance(ins.id)} data-testid={`button-remove-insurance-${ins.id}`}>
                  <Trash2 className="w-4 h-4 text-muted-foreground" />
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Insurance Provider</Label>
                  <Input
                    value={ins.provider}
                    onChange={(e) => updateInsurance(ins.id, 'provider', e.target.value)}
                    placeholder="e.g. State Farm"
                    data-testid={`input-insurance-provider-${ins.id}`}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Policy Number</Label>
                  <Input
                    value={ins.policyNumber}
                    onChange={(e) => updateInsurance(ins.id, 'policyNumber', e.target.value)}
                    placeholder="Policy #"
                    data-testid={`input-insurance-policy-${ins.id}`}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Coverage Amount</Label>
                  <Input
                    value={ins.coverageAmount}
                    onChange={(e) => updateInsurance(ins.id, 'coverageAmount', e.target.value)}
                    placeholder="e.g. $1,000,000"
                    data-testid={`input-insurance-coverage-${ins.id}`}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Expiration Date</Label>
                  <Input
                    type="date"
                    value={ins.expirationDate}
                    onChange={(e) => updateInsurance(ins.id, 'expirationDate', e.target.value)}
                    data-testid={`input-insurance-expiry-${ins.id}`}
                  />
                </div>
              </div>
              <ComplianceDocUpload
                documentPath={ins.documentPath}
                onUpload={(path) => updateInsurance(ins.id, 'documentPath', path)}
                onRemove={() => updateInsurance(ins.id, 'documentPath', '')}
                isUploading={isUploading}
                itemId={`ins-${ins.id}`}
                label="Insurance document"
              />
            </div>
          ))}
        </div>

        <div className="border-t pt-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Certificates & Licenses</h3>
            <Button variant="outline" size="sm" onClick={addCertificate} data-testid="button-add-certificate">
              <Plus className="w-4 h-4 mr-1" />
              Add Certificate
            </Button>
          </div>

          {certificates.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center border rounded-lg border-dashed">No certificates or licenses added yet</p>
          )}

          {certificates.map((cert) => (
            <div key={cert.id} className="border rounded-lg p-4 space-y-3" data-testid={`card-certificate-${cert.id}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{cert.name || 'New Certificate'}</span>
                  {cert.expirationDate && isExpired(cert.expirationDate) && (
                    <Badge variant="destructive" className="text-xs">Expired</Badge>
                  )}
                  {cert.expirationDate && isExpiringSoon(cert.expirationDate) && !isExpired(cert.expirationDate) && (
                    <Badge variant="outline" className="text-xs border-amber-500 text-amber-600">Expiring Soon</Badge>
                  )}
                </div>
                <Button variant="ghost" size="sm" onClick={() => removeCertificate(cert.id)} data-testid={`button-remove-certificate-${cert.id}`}>
                  <Trash2 className="w-4 h-4 text-muted-foreground" />
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Certificate / License Name</Label>
                  <Input
                    value={cert.name}
                    onChange={(e) => updateCertificate(cert.id, 'name', e.target.value)}
                    placeholder="e.g. EPA Lead-Safe Certification"
                    data-testid={`input-certificate-name-${cert.id}`}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Issued By</Label>
                  <Input
                    value={cert.issuedBy}
                    onChange={(e) => updateCertificate(cert.id, 'issuedBy', e.target.value)}
                    placeholder="e.g. EPA, State Board"
                    data-testid={`input-certificate-issuer-${cert.id}`}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Certificate / License Number</Label>
                  <Input
                    value={cert.number}
                    onChange={(e) => updateCertificate(cert.id, 'number', e.target.value)}
                    placeholder="Number"
                    data-testid={`input-certificate-number-${cert.id}`}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Expiration Date</Label>
                  <Input
                    type="date"
                    value={cert.expirationDate}
                    onChange={(e) => updateCertificate(cert.id, 'expirationDate', e.target.value)}
                    data-testid={`input-certificate-expiry-${cert.id}`}
                  />
                </div>
              </div>
              <ComplianceDocUpload
                documentPath={cert.documentPath}
                onUpload={(path) => updateCertificate(cert.id, 'documentPath', path)}
                onRemove={() => updateCertificate(cert.id, 'documentPath', '')}
                isUploading={isUploading}
                itemId={`cert-${cert.id}`}
                label="Certificate document"
              />
            </div>
          ))}
        </div>

        <div className="border-t pt-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Awards & Recognition</h3>
            <Button variant="outline" size="sm" onClick={addAward} data-testid="button-add-award">
              <Plus className="w-4 h-4 mr-1" />
              Add Award
            </Button>
          </div>

          {awards.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center border rounded-lg border-dashed">No awards added yet</p>
          )}

          {awards.map((award) => (
            <div key={award.id} className="border rounded-lg p-4 space-y-3" data-testid={`card-award-${award.id}`}>
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">{award.name || 'New Award'}</span>
                <Button variant="ghost" size="sm" onClick={() => removeAward(award.id)} data-testid={`button-remove-award-${award.id}`}>
                  <Trash2 className="w-4 h-4 text-muted-foreground" />
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Award Name</Label>
                  <Input
                    value={award.name}
                    onChange={(e) => updateAward(award.id, 'name', e.target.value)}
                    placeholder="e.g. Best of Houzz 2024"
                    data-testid={`input-award-name-${award.id}`}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Issued By</Label>
                  <Input
                    value={award.issuedBy}
                    onChange={(e) => updateAward(award.id, 'issuedBy', e.target.value)}
                    placeholder="e.g. Houzz, Angi"
                    data-testid={`input-award-issuer-${award.id}`}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Year</Label>
                  <Input
                    value={award.year}
                    onChange={(e) => updateAward(award.id, 'year', e.target.value)}
                    placeholder="e.g. 2024"
                    data-testid={`input-award-year-${award.id}`}
                  />
                </div>
              </div>
              <ComplianceDocUpload
                documentPath={award.documentPath}
                onUpload={(path) => updateAward(award.id, 'documentPath', path)}
                onRemove={() => updateAward(award.id, 'documentPath', '')}
                isUploading={isUploading}
                itemId={`award-${award.id}`}
                label="Award document"
              />
            </div>
          ))}
        </div>

        <div className="pt-2">
          <Button onClick={handleSave} disabled={isPending} data-testid="button-save-compliance">
            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            <Save className="w-4 h-4 mr-2" />
            Save Compliance Info
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function BookingSlugCard({ settings, toast }: { settings: any; toast: any }) {
  const { mutate: updateSettings, isPending } = useUpdateCompanySettings();
  const [slugInput, setSlugInput] = useState('');
  const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const checkTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentSlug = settings?.bookingSlug || '';
  const hasCompanyName = settings?.companyName && settings.companyName !== 'My Company';
  const hasCustomDomain = settings?.customDomain && settings?.customDomainVerified;
  const appDomain = 'https://app.fusephone.com';
  const bookingUrl = hasCustomDomain
    ? `https://${settings.customDomain}/booking`
    : currentSlug 
      ? `${appDomain}/${currentSlug}/booking`
      : '';

  useEffect(() => {
    if (settings?.bookingSlug) {
      setSlugInput(settings.bookingSlug);
    }
  }, [settings?.bookingSlug]);

  const checkSlugAvailability = useCallback(async (slug: string) => {
    if (!slug || slug.length < 3) {
      setSlugStatus('idle');
      setSuggestions([]);
      return;
    }
    setSlugStatus('checking');
    try {
      const res = await fetch(`/api/settings/check-slug?slug=${encodeURIComponent(slug)}`);
      const data = await res.json();
      if (data.available) {
        setSlugStatus('available');
        setSuggestions([]);
      } else {
        setSlugStatus('taken');
        setSuggestions(data.suggestions || []);
      }
    } catch {
      setSlugStatus('idle');
    }
  }, []);

  const handleSlugChange = (value: string) => {
    const cleaned = value.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-/, '');
    setSlugInput(cleaned);
    setSlugStatus('idle');
    setSuggestions([]);
    if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current);
    if (cleaned.length >= 3 && cleaned !== currentSlug) {
      checkTimeoutRef.current = setTimeout(() => checkSlugAvailability(cleaned), 500);
    }
  };

  const handleSaveSlug = () => {
    if (!slugInput || slugInput.length < 3) {
      toast({ title: "URL must be at least 3 characters", variant: "destructive" });
      return;
    }
    updateSettings({ bookingSlug: slugInput } as any, {
      onSuccess: () => {
        toast({ title: "Booking URL saved" });
        setIsEditing(false);
        setSlugStatus('idle');
      },
      onError: (error: any) => {
        toast({ title: "Failed to save", description: error.message, variant: "destructive" });
      }
    });
  };

  const handleGenerateAndSave = async () => {
    if (!hasCompanyName) return;
    setIsGenerating(true);
    try {
      const res = await fetch('/api/settings/generate-slug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName: settings.companyName }),
      });
      const data = await res.json();
      if (data.available && data.slug) {
        updateSettings({ bookingSlug: data.slug } as any, {
          onSuccess: () => {
            toast({ title: "Booking URL created" });
            setIsGenerating(false);
          },
          onError: (error: any) => {
            toast({ title: "Failed to save", description: error.message, variant: "destructive" });
            setIsGenerating(false);
          }
        });
      } else {
        setSlugInput(data.slug || '');
        setSlugStatus(data.available ? 'available' : 'taken');
        setSuggestions(data.suggestions || []);
        setIsEditing(true);
        setIsGenerating(false);
      }
    } catch {
      toast({ title: "Failed to generate URL", variant: "destructive" });
      setIsGenerating(false);
    }
  };

  const selectSuggestion = (suggestion: string) => {
    setSlugInput(suggestion);
    setSlugStatus('available');
    setSuggestions([]);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-4">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <CalendarDays className="w-5 h-5 text-primary" />
        </div>
        <div>
          <CardTitle className="text-lg">Online Booking Form</CardTitle>
          <CardDescription>Share your unique booking link with customers</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasCompanyName && !currentSlug ? (
          <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md" data-testid="banner-setup-company">
            <TriangleAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-700 dark:text-amber-300">Set up your company name first</p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                Your booking URL is generated from your company name. Fill in the Company Information section above and save to get started.
              </p>
            </div>
          </div>
        ) : currentSlug && !isEditing ? (
          <>
            <div className="space-y-3">
              <Label className="text-xs text-muted-foreground">Your Booking URL</Label>
              <div className="p-3 bg-muted rounded-md font-mono text-sm break-all select-all" data-testid="text-booking-url">
                {bookingUrl}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button 
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const { copyToClipboard } = await import("@/lib/clipboard");
                    const ok = await copyToClipboard(bookingUrl);
                    toast({ title: ok ? "Link copied to clipboard" : "Could not copy link", description: ok ? undefined : bookingUrl, variant: ok ? "default" : "destructive" });
                  }}
                  data-testid="button-copy-booking-link"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copy Link
                </Button>
                <Button 
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(`/${currentSlug}/booking`, '_blank')}
                  data-testid="button-open-booking-form"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Open
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" data-testid="button-edit-slug">
                      Change URL
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle className="flex items-center gap-2">
                        <TriangleAlert className="w-5 h-5 text-amber-500" />
                        Change Booking URL?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        If you change your booking URL, anyone using your current link will no longer be able to reach your booking form. Make sure to update any shared links, social media posts, or printed materials with your new URL.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep Current URL</AlertDialogCancel>
                      <AlertDialogAction onClick={() => setIsEditing(true)} data-testid="button-confirm-change-url">
                        Change URL
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </>
        ) : !currentSlug && !isEditing ? (
          <Button 
            onClick={handleGenerateAndSave} 
            disabled={isGenerating || isPending}
            data-testid="button-generate-booking-url"
          >
            {(isGenerating || isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            <Globe className="w-4 h-4 mr-2" />
            Generate Booking URL
          </Button>
        ) : (
          <>
            {currentSlug && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md">
                <TriangleAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Changing your URL will make your current link stop working. Update any shared links after saving.
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="bookingSlug">Booking URL</Label>
              <p className="text-xs text-muted-foreground truncate">{appDomain}/</p>
              <div className="flex items-center gap-2">
                <Input
                  id="bookingSlug"
                  value={slugInput}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  placeholder="yourcompanyname"
                  className="flex-1 min-w-0"
                  data-testid="input-booking-slug"
                />
                {slugStatus === 'checking' && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />}
                {slugStatus === 'available' && <Check className="w-4 h-4 text-green-600 shrink-0" />}
                {slugStatus === 'taken' && <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />}
              </div>
              {slugStatus === 'available' && (
                <p className="text-xs text-green-600" data-testid="text-slug-available">This URL is available</p>
              )}
              {slugStatus === 'taken' && (
                <p className="text-xs text-destructive" data-testid="text-slug-taken">This URL is already taken</p>
              )}
            </div>

            {suggestions.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Try one of these instead:</p>
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((s) => (
                    <Badge
                      key={s}
                      variant="outline"
                      className="cursor-pointer"
                      onClick={() => selectSuggestion(s)}
                      data-testid={`badge-suggestion-${s}`}
                    >
                      {s}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 flex-wrap">
              <Button
                onClick={handleSaveSlug}
                disabled={isPending || slugStatus === 'taken' || slugStatus === 'checking' || !slugInput || slugInput.length < 3}
                data-testid="button-save-slug"
              >
                {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                <Save className="w-4 h-4 mr-2" />
                Save URL
              </Button>
              {currentSlug && (
                <Button variant="ghost" onClick={() => { setIsEditing(false); setSlugInput(currentSlug); setSlugStatus('idle'); setSuggestions([]); }}>
                  Cancel
                </Button>
              )}
            </div>
          </>
        )}
        <p className="text-sm text-muted-foreground">
          Customers can submit appointment requests through this form. You'll receive the requests and can follow up to schedule appointments.
        </p>
      </CardContent>
    </Card>
  );
}

