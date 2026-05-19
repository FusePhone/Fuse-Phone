import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateContact } from "@/hooks/use-contacts";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertContactSchema, type InsertContact } from "@shared/schema";
import { useState, useEffect, useRef } from "react";
import { useScrollFocusedIntoView } from "@/hooks/use-scroll-focused-into-view";
import { Loader2, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AddressAutocomplete, type AddressComponents } from "@/components/AddressAutocomplete";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { cn } from "@/lib/utils";
import { normalizePhone, isValidPhone, stripPhoneInput } from "@/lib/phone";
import { apiRequest, queryClient } from "@/lib/queryClient";

export interface AiPrefillData {
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  description?: string;
  source?: string;
}

interface CreateContactDialogProps {
  defaultType?: 'lead' | 'contact' | 'client';
  aiPrefill?: AiPrefillData | null;
  autoOpen?: boolean;
  onAutoOpenHandled?: () => void;
  aiActionId?: string | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
  defaultPhone?: string;
  defaultName?: string;
  onCreated?: (contact: any) => void;
}

export function CreateContactDialog({ defaultType = 'contact', aiPrefill, autoOpen, onAutoOpenHandled, aiActionId, open: controlledOpen, onOpenChange, hideTrigger, defaultPhone, defaultName, onCreated }: CreateContactDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (val: boolean) => {
    if (!isControlled) setInternalOpen(val);
    onOpenChange?.(val);
  };
  const { mutate, isPending } = useCreateContact();
  const { toast } = useToast();
  
  const form = useForm<InsertContact>({
    resolver: zodResolver(insertContactSchema),
    defaultValues: {
      type: defaultType,
      status: 'new',
      name: '',
      email: '',
      phone: '',
      address: '',
      city: '',
      state: '',
      zipCode: '',
      leadSource: '',
    }
  });

  useEffect(() => {
    if (open) {
      if (defaultPhone) form.setValue('phone', defaultPhone);
      if (defaultName) form.setValue('name', defaultName);
    }
  }, [open, defaultPhone, defaultName]);

  useEffect(() => {
    if (autoOpen && aiPrefill) {
      setOpen(true);
      if (aiPrefill.name) form.setValue('name', aiPrefill.name);
      if (aiPrefill.phone) form.setValue('phone', aiPrefill.phone);
      if (aiPrefill.email) form.setValue('email', aiPrefill.email);
      if (aiPrefill.address) form.setValue('address', aiPrefill.address);
      if (aiPrefill.city) form.setValue('city', aiPrefill.city);
      if (aiPrefill.state) form.setValue('state', aiPrefill.state);
      if (aiPrefill.zip) form.setValue('zipCode', aiPrefill.zip);
      form.setValue('type', 'lead');
      if (aiPrefill.source === 'phone_call') {
        form.setValue('leadSource', 'cold_call');
      } else if (aiPrefill.source === 'sms') {
        form.setValue('leadSource', 'thumbtack');
      }
      onAutoOpenHandled?.();
    }
  }, [autoOpen, aiPrefill]);

  const [customSource, setCustomSource] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  const leadSources = [
    { value: 'google', label: 'Google' },
    { value: 'thumbtack', label: 'Thumbtack' },
    { value: 'facebook', label: 'Facebook' },
    { value: 'angi', label: 'Angi' },
    { value: 'yelp', label: 'Yelp' },
    { value: 'networx', label: 'Networx' },
    { value: 'website', label: 'Website Form' },
    { value: 'referral', label: 'Referral' },
    { value: 'word_of_mouth', label: 'Word of Mouth' },
    { value: 'social_media', label: 'Social Media' },
    { value: 'cold_call', label: 'Cold Call / Phone' },
    { value: 'repeat_customer', label: 'Repeat Customer' },
    { value: 'trade_show', label: 'Trade Show' },
    { value: '_other', label: 'Other (custom)' },
  ];

  const [phoneSubmitError, setPhoneSubmitError] = useState(false);

  const formScrollRef = useRef<HTMLFormElement>(null);
  useScrollFocusedIntoView(formScrollRef, (el) => {
    if (el.closest('[data-autocomplete="address"]')) return 280;
    return 32;
  });

  const onSubmit = (data: InsertContact) => {
    const raw = data.phone || '';
    const digits = raw.replace(/\D/g, '');
    if (!digits) {
      setPhoneSubmitError(true);
      return;
    }
    if (!isValidPhone(raw)) {
      setPhoneSubmitError(true);
      return;
    }
    setPhoneSubmitError(false);
    mutate({ ...data, phone: normalizePhone(raw) }, {
      onSuccess: (contact: any) => {
        setOpen(false);
        form.reset();
        setPhoneSubmitError(false);
        onCreated?.(contact);
        if (aiActionId && aiPrefill) {
          apiRequest('PATCH', `/api/ai-actions/${aiActionId}`, { status: 'acted' })
            .then(() => queryClient.invalidateQueries({ queryKey: ['/api/ai-actions?status=pending'] }))
            .catch(() => {});
          if (contact?.id && data.type === 'lead') {
            const projectTitle = aiPrefill.description || `${data.name || 'New Lead'} — Lead`;
            apiRequest('POST', '/api/projects', {
              contactId: contact.id,
              title: projectTitle,
              stage: 'new_lead',
              address: data.address || '',
              city: data.city || '',
              state: data.state || '',
              zipCode: data.zipCode || '',
            })
              .then(() => {
                queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
                queryClient.invalidateQueries({ queryKey: ['/api/dashboard/pipeline'] });
              })
              .catch(() => {});
          }
        }
      },
      onError: (error) => {
        toast({ 
          title: "Cannot create contact", 
          description: error.message, 
          variant: "destructive" 
        });
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!hideTrigger && (
        <DialogTrigger asChild>
          <Button className="shadow-lg shadow-primary/25">
            <Plus className="w-4 h-4 mr-2" />
            Add {defaultType === 'lead' ? 'Lead' : defaultType === 'client' ? 'Client' : 'Contact'}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent
        className="sm:max-w-[425px] flex flex-col w-[calc(100vw-1rem)] sm:w-full p-4 sm:p-6"
        style={{
          maxHeight: 'calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 1rem)',
          marginTop: 'env(safe-area-inset-top, 0px)',
        }}
      >
        <DialogHeader>
          <DialogTitle>Add New Contact</DialogTitle>
        </DialogHeader>
        <form ref={formScrollRef} onSubmit={form.handleSubmit(onSubmit)} className="flex-1 min-h-0 overflow-y-auto space-y-4 pt-4 -mx-4 px-4 sm:-mx-6 sm:px-6">
          <div className="space-y-2">
            <Label htmlFor="type" className="flex items-center gap-1">Type <InfoTooltip text="Lead = someone interested but hasn't committed. Client = a paying customer. Contact = general contact for networking or reference." /></Label>
            <Select 
              onValueChange={(val) => form.setValue("type", val as 'lead' | 'contact' | 'client')} 
              defaultValue={form.getValues("type")}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lead">Lead</SelectItem>
                <SelectItem value="contact">Contact</SelectItem>
                <SelectItem value="client">Client</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="name">Full Name</Label>
            <Input id="name" {...form.register("name")} placeholder="John Doe" />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" {...form.register("email")} placeholder="john@example.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone *</Label>
              {(() => {
                const phone = form.watch("phone") || '';
                const showInvalid = (phone.length > 0 && !isValidPhone(phone)) || phoneSubmitError;
                return (
                  <>
                    <Input
                      id="phone"
                      value={phone}
                      onChange={(e) => {
                        const val = stripPhoneInput(e.target.value);
                        form.setValue("phone", val);
                        if (isValidPhone(val) || val.length === 0) setPhoneSubmitError(false);
                      }}
                      inputMode="tel"
                      placeholder="+15551234567"
                      className={cn(showInvalid ? 'border-destructive' : '')}
                    />
                    {phone.length > 0 && !isValidPhone(phone) && (
                      <p className="text-xs text-destructive mt-1">Enter a valid US/Canada phone number</p>
                    )}
                    {phoneSubmitError && phone.replace(/\D/g, '').length === 0 && (
                      <p className="text-xs text-destructive mt-1">Phone number is required</p>
                    )}
                  </>
                );
              })()}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Street Address</Label>
            <AddressAutocomplete 
              value={form.watch("address") || ''}
              onChange={(value) => form.setValue("address", value)}
              onAddressSelect={(components: AddressComponents) => {
                form.setValue("address", [components.streetNumber, components.route].filter(Boolean).join(' '));
                form.setValue("city", components.city);
                form.setValue("state", components.state);
                form.setValue("zipCode", components.zipCode);
              }}
              placeholder="123 Main St"
              data-testid="input-address"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input id="city" {...form.register("city")} placeholder="City" data-testid="input-city" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">State</Label>
              <Input id="state" {...form.register("state")} placeholder="ST" data-testid="input-state" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="zipCode">ZIP</Label>
              <Input id="zipCode" {...form.register("zipCode")} placeholder="12345" data-testid="input-zip" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="leadSource" className="flex items-center gap-1">Lead Source <InfoTooltip text="Where this person found your business. Tracking lead sources helps you understand which marketing channels bring in the most customers so you can invest wisely." /></Label>
            <Select 
              onValueChange={(val) => {
                if (val === '_other') {
                  setShowCustomInput(true);
                  form.setValue("leadSource", '');
                } else {
                  setShowCustomInput(false);
                  setCustomSource('');
                  form.setValue("leadSource", val);
                }
              }} 
              defaultValue={form.getValues("leadSource") || ''}
            >
              <SelectTrigger>
                <SelectValue placeholder="Where did this lead come from?" />
              </SelectTrigger>
              <SelectContent>
                {leadSources.map(source => (
                  <SelectItem key={source.value} value={source.value}>{source.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {showCustomInput && (
              <Input
                placeholder="Type your custom lead source..."
                value={customSource}
                onChange={(e) => {
                  setCustomSource(e.target.value);
                  form.setValue("leadSource", e.target.value);
                }}
                data-testid="input-custom-lead-source"
              />
            )}
          </div>

          <div className="flex justify-end pt-4">
            <Button type="submit" disabled={isPending} className="w-full">
              {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create Contact
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
