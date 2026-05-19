import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUpdateContact } from "@/hooks/use-contacts";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertContactSchema, type InsertContact, type Contact } from "@shared/schema";
import { useState, useEffect, useRef } from "react";
import { useScrollFocusedIntoView } from "@/hooks/use-scroll-focused-into-view";
import { Loader2, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AddressAutocomplete, type AddressComponents } from "@/components/AddressAutocomplete";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { cn } from "@/lib/utils";
import { normalizePhone, isValidPhone, stripPhoneInput } from "@/lib/phone";

interface EditContactDialogProps {
  contact: Contact;
  trigger?: React.ReactNode;
}

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

export function EditContactDialog({ contact, trigger }: EditContactDialogProps) {
  const [open, setOpen] = useState(false);
  const { mutate, isPending } = useUpdateContact();
  const { toast } = useToast();
  const knownValues = leadSources.filter(s => s.value !== '_other').map(s => s.value);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customSource, setCustomSource] = useState('');
  
  const form = useForm<InsertContact>({
    resolver: zodResolver(insertContactSchema),
    defaultValues: {
      type: contact.type as 'lead' | 'client',
      status: contact.status,
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      address: contact.address || '',
      city: contact.city || '',
      state: contact.state || '',
      zipCode: contact.zipCode || '',
      leadSource: contact.leadSource || '',
    }
  });

  useEffect(() => {
    if (open) {
      const isCustom = !!(contact.leadSource && !knownValues.includes(contact.leadSource));
      setShowCustomInput(isCustom);
      setCustomSource(isCustom ? contact.leadSource || '' : '');
      form.reset({
        type: contact.type as 'lead' | 'client',
        status: contact.status,
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        address: contact.address || '',
        city: contact.city || '',
        state: contact.state || '',
        zipCode: contact.zipCode || '',
        leadSource: contact.leadSource || '',
      });
    }
  }, [open, contact]);

  const formScrollRef = useRef<HTMLFormElement>(null);
  useScrollFocusedIntoView(formScrollRef, (el) => {
    if (el.closest('[data-autocomplete="address"]')) return 280;
    return 32;
  });

  const onSubmit = (data: InsertContact) => {
    const raw = data.phone || '';
    const digits = raw.replace(/\D/g, '');
    if (digits && !isValidPhone(raw)) {
      toast({ title: "Invalid phone number", description: "Enter a valid US/Canada phone number", variant: "destructive" });
      return;
    }
    mutate({ id: contact.id, data: { ...data, phone: digits ? normalizePhone(raw) : '' } }, {
      onSuccess: () => {
        toast({ title: "Contact updated successfully" });
        setOpen(false);
      },
      onError: (error) => {
        toast({ title: "Failed to update contact", description: error.message, variant: "destructive" });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="text-xs sm:text-sm min-h-8 w-full md:w-auto justify-center">
            <Pencil className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-2 shrink-0" />
            Edit
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] max-h-[85dvh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit Contact</DialogTitle>
        </DialogHeader>
        <form ref={formScrollRef} onSubmit={form.handleSubmit(onSubmit)} className="flex-1 overflow-y-auto space-y-4 pt-4 -mx-6 px-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="type" className="flex items-center gap-1">Type <InfoTooltip text="Lead = someone interested but hasn't committed. Client = a paying customer. Contact = general contact for networking or reference." /></Label>
              <Select 
                onValueChange={(val) => form.setValue("type", val as 'lead' | 'contact' | 'client')} 
                value={form.watch("type")}
              >
                <SelectTrigger data-testid="select-type">
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
              <Label htmlFor="status">Status</Label>
              <Select 
                onValueChange={(val) => form.setValue("status", val)} 
                value={form.watch("status")}
              >
                <SelectTrigger data-testid="select-status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="contacted">Contacted</SelectItem>
                  <SelectItem value="qualified">Qualified</SelectItem>
                  <SelectItem value="proposal_sent">Proposal Sent</SelectItem>
                  <SelectItem value="won">Won</SelectItem>
                  <SelectItem value="lost">Lost</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="name">Full Name</Label>
            <Input id="name" {...form.register("name")} data-testid="input-name" />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" {...form.register("email")} data-testid="input-email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              {(() => {
                const phone = form.watch("phone") || '';
                const isEmpty = !phone.trim();
                const isInvalid = phone.length > 0 && !isValidPhone(phone);
                return (
                  <>
                    <Input
                      id="phone"
                      value={phone}
                      onChange={(e) => {
                        form.setValue("phone", stripPhoneInput(e.target.value));
                      }}
                      inputMode="tel"
                      placeholder="+15551234567"
                      data-testid="input-phone"
                      className={cn(isInvalid ? 'border-destructive' : '')}
                    />
                    {isInvalid && (
                      <p className="text-xs text-destructive mt-1">Enter a valid US/Canada phone number</p>
                    )}
                    {form.formState.isSubmitted && isEmpty && !isInvalid && (
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
              value={showCustomInput ? '_other' : (form.watch("leadSource") || '')}
            >
              <SelectTrigger data-testid="select-lead-source">
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

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending} data-testid="button-save-contact">
              {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
