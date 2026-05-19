import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Copy, ExternalLink, Plus, Trash2, Star, Pencil, Loader2, ListChecks, GripVertical } from "lucide-react";
import type { BookingForm, BookingFieldConfig } from "@shared/schema";

export default function BookingFormsManager() {
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingForm, setEditingForm] = useState<BookingForm | null>(null);
  const [newFormName, setNewFormName] = useState("");
  const [newFormSlug, setNewFormSlug] = useState("");

  const { data: forms = [], isLoading } = useQuery<BookingForm[]>({
    queryKey: ['/api/booking-forms'],
  });

  const ensureDefaultMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/booking-forms/ensure-default', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to ensure default form');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/booking-forms'] });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; slug?: string }) => {
      const res = await apiRequest('POST', '/api/booking-forms', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/booking-forms'] });
      setCreateOpen(false);
      setNewFormName("");
      setNewFormSlug("");
      toast({ title: "Booking form created" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: number; name?: string; slug?: string; fields?: BookingFieldConfig[]; thankYouUrl?: string | null }) => {
      const res = await apiRequest('PATCH', `/api/booking-forms/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/booking-forms'] });
      toast({ title: "Form updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('DELETE', `/api/booking-forms/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/booking-forms'] });
      toast({ title: "Form deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to delete", description: err.message, variant: "destructive" });
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('PATCH', `/api/booking-forms/${id}/set-default`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/booking-forms'] });
      toast({ title: "Default form updated" });
    },
  });

  const ensuredRef = useRef(false);
  useEffect(() => {
    if (forms.length === 0 && !isLoading && !ensuredRef.current) {
      ensuredRef.current = true;
      ensureDefaultMutation.mutate();
    }
  }, [forms.length, isLoading]);

  const { data: companySettings } = useQuery<any>({ queryKey: ['/api/settings/company'] });
  const hasCustomDomain = companySettings?.customDomain && companySettings?.customDomainVerified;
  const appDomain = 'https://app.fusephone.com';

  const getFormUrl = (form: BookingForm) => {
    if (hasCustomDomain && form.slug) return `https://${companySettings.customDomain}/${form.slug}/booking`;
    if (form.slug) return `${appDomain}/${form.slug}/booking`;
    return '';
  };

  const copyLink = async (form: BookingForm) => {
    const url = getFormUrl(form);
    if (!url) {
      toast({ title: "Add a URL slug first to generate a link", variant: "destructive" });
      return;
    }
    const { copyToClipboard } = await import("@/lib/clipboard");
    const ok = await copyToClipboard(url);
    toast({ title: ok ? "Link copied to clipboard" : "Could not copy link", description: ok ? undefined : url, variant: ok ? "default" : "destructive" });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <ListChecks className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">Booking Forms</CardTitle>
            <CardDescription>Create multiple booking forms with custom fields</CardDescription>
          </div>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)} data-testid="button-create-booking-form">
          <Plus className="w-4 h-4 mr-1" />
          New Form
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : forms.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No booking forms yet. Create one to get started.</p>
        ) : (
          forms.map(form => (
            <div key={form.id} className="border rounded-lg p-4 space-y-3" data-testid={`booking-form-card-${form.id}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{form.name}</span>
                  {form.isDefault && <Badge variant="secondary" className="text-xs">Default</Badge>}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setEditingForm(form)}
                    data-testid={`button-edit-form-${form.id}`}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => copyLink(form)}
                    data-testid={`button-copy-form-link-${form.id}`}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                  {form.slug && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => window.open(`/${form.slug}/booking`, '_blank')}
                      data-testid={`button-open-form-${form.id}`}
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                  )}
                  {!form.isDefault && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setDefaultMutation.mutate(form.id)}
                      data-testid={`button-set-default-${form.id}`}
                      title="Set as default"
                    >
                      <Star className="w-4 h-4" />
                    </Button>
                  )}
                  {!form.isDefault && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          data-testid={`button-delete-form-${form.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Booking Form?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete "{form.name}" and its booking link. Any existing bookings won't be affected.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteMutation.mutate(form.id)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </div>
              {form.slug ? (
                <p className="text-xs text-muted-foreground font-mono truncate">{getFormUrl(form)}</p>
              ) : (
                <p className="text-xs text-amber-600">No URL slug set — add one to share this form</p>
              )}
              {form.fields && (
                <div className="flex flex-wrap gap-1">
                  {(form.fields as BookingFieldConfig[]).filter(f => f.enabled).map(f => (
                    <Badge key={f.id} variant="outline" className="text-xs">
                      {f.label}{f.required ? ' *' : ''}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </CardContent>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Booking Form</DialogTitle>
            <DialogDescription>Create a new booking form with its own unique link</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="formName">Form Name</Label>
              <Input
                id="formName"
                value={newFormName}
                onChange={(e) => setNewFormName(e.target.value)}
                placeholder="e.g. Interior Painting Estimate"
                data-testid="input-new-form-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="formSlug">URL Slug (optional)</Label>
              <Input
                id="formSlug"
                value={newFormSlug}
                onChange={(e) => setNewFormSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-'))}
                placeholder="e.g. interior-estimate"
                data-testid="input-new-form-slug"
              />
              {newFormSlug && (
                <p className="text-xs text-muted-foreground">{hasCustomDomain ? `https://${companySettings.customDomain}` : appDomain}/{newFormSlug}/booking</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate({ name: newFormName, slug: newFormSlug || undefined })}
              disabled={!newFormName || createMutation.isPending}
              data-testid="button-confirm-create-form"
            >
              {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {editingForm && (
        <EditBookingFormDialog
          form={editingForm}
          onClose={() => setEditingForm(null)}
          onSave={(fields, name, slug, thankYouUrl) => {
            updateMutation.mutate({ id: editingForm.id, fields, name, slug, thankYouUrl }, {
              onSuccess: () => setEditingForm(null),
            });
          }}
          isPending={updateMutation.isPending}
        />
      )}
    </Card>
  );
}

function EditBookingFormDialog({ form, onClose, onSave, isPending }: {
  form: BookingForm;
  onClose: () => void;
  onSave: (fields: BookingFieldConfig[], name: string, slug?: string, thankYouUrl?: string | null) => void;
  isPending: boolean;
}) {
  const defaultFields: BookingFieldConfig[] = [
    { id: 'firstName', label: 'First Name', type: 'text', required: true, enabled: true },
    { id: 'lastName', label: 'Last Name', type: 'text', required: true, enabled: true },
    { id: 'email', label: 'Email', type: 'email', required: true, enabled: true },
    { id: 'phone', label: 'Phone', type: 'phone', required: true, enabled: true },
    { id: 'address', label: 'Address', type: 'address', required: false, enabled: true },
    { id: 'preferredDate', label: 'Preferred Date', type: 'date', required: false, enabled: true },
    { id: 'preferredTime', label: 'Preferred Time', type: 'time', required: false, enabled: true },
    { id: 'alternateDate', label: 'Alternative Date', type: 'date', required: false, enabled: true },
    { id: 'alternateTime', label: 'Alternative Time', type: 'time', required: false, enabled: true },
    { id: 'projectDescription', label: 'Project Description', type: 'textarea', required: false, enabled: true },
    { id: 'fileUpload', label: 'Photos / Documents', type: 'file', required: false, enabled: true },
  ];

  const [fields, setFields] = useState<BookingFieldConfig[]>(
    (form.fields as BookingFieldConfig[]) || defaultFields
  );
  const [name, setName] = useState(form.name);
  const [slug, setSlug] = useState(form.slug || '');
  const [thankYouUrl, setThankYouUrl] = useState(form.thankYouUrl || '');

  const toggleEnabled = (id: string) => {
    setFields(prev => prev.map(f => f.id === id ? { ...f, enabled: !f.enabled, required: !f.enabled ? f.required : false } : f));
  };

  const toggleRequired = (id: string) => {
    setFields(prev => prev.map(f => f.id === id ? { ...f, required: !f.required } : f));
  };

  const coreFields = ['firstName', 'lastName', 'email', 'phone'];

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Booking Form</DialogTitle>
          <DialogDescription>Customize which fields appear on this form</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Form Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="input-edit-form-name"
            />
          </div>
          <div className="space-y-2">
            <Label>URL Slug</Label>
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-'))}
              placeholder="optional-custom-slug"
              data-testid="input-edit-form-slug"
            />
          </div>
          <div className="space-y-2">
            <Label>Thank You Page URL</Label>
            <Input
              value={thankYouUrl}
              onChange={(e) => setThankYouUrl(e.target.value)}
              placeholder="https://yourwebsite.com/thank-you"
              data-testid="input-edit-form-thank-you-url"
            />
            <p className="text-xs text-muted-foreground">After submitting, leads will be redirected to this page. Great for tracking conversions with Google or Facebook pixels.</p>
          </div>

          <div className="space-y-1">
            <Label className="text-sm font-medium">Form Fields</Label>
            <p className="text-xs text-muted-foreground">Toggle which fields are shown and which are required</p>
          </div>

          <div className="border rounded-lg divide-y">
            {fields.map(field => (
              <div key={field.id} className="flex items-center justify-between p-3" data-testid={`field-config-${field.id}`}>
                <div className="flex items-center gap-3">
                  <GripVertical className="w-4 h-4 text-muted-foreground/30" />
                  <span className="text-sm">{field.label}</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Required</span>
                    <Switch
                      checked={field.required}
                      onCheckedChange={() => toggleRequired(field.id)}
                      disabled={!field.enabled || coreFields.includes(field.id)}
                      data-testid={`switch-required-${field.id}`}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Show</span>
                    <Switch
                      checked={field.enabled}
                      onCheckedChange={() => toggleEnabled(field.id)}
                      disabled={coreFields.includes(field.id)}
                      data-testid={`switch-enabled-${field.id}`}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => onSave(fields, name, slug || undefined, thankYouUrl.trim() || null)}
            disabled={!name || isPending}
            data-testid="button-save-form-fields"
          >
            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
