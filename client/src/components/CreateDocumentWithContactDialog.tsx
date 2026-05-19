import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useContacts, useCreateContact } from "@/hooks/use-contacts";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertContactSchema } from "@shared/schema";
import { useState } from "react";
import { Loader2, Plus, UserPlus, Search, ArrowLeft } from "lucide-react";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { CreateDocumentDialog } from "./CreateDocumentDialog";
import { AddressAutocomplete, type AddressComponents } from "@/components/AddressAutocomplete";
import { cn, formatPhoneDisplay } from "@/lib/utils";
import { normalizePhone, isValidPhone, stripPhoneInput } from "@/lib/phone";

const newContactSchema = insertContactSchema.extend({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email required"),
  phone: z.string().min(1, "Phone is required"),
});

type NewContactFormValues = z.infer<typeof newContactSchema>;

interface CreateDocumentWithContactDialogProps {
  onDocumentCreated?: (documentId: number) => void;
}

export function CreateDocumentWithContactDialog({ onDocumentCreated }: CreateDocumentWithContactDialogProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'select-contact' | 'new-contact'>('select-contact');
  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);
  const [contactSearch, setContactSearch] = useState("");

  const { toast } = useToast();
  const { data: contacts, isLoading: contactsLoading } = useContacts();
  const { mutate: createContact, isPending: creatingContact } = useCreateContact();

  const contactForm = useForm<NewContactFormValues>({
    resolver: zodResolver(newContactSchema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      type: 'lead',
      address: '',
      city: '',
      state: '',
      zipCode: '',
    }
  });

  const handleContactSelect = (contactId: number) => {
    setSelectedContactId(contactId);
    setOpen(false);
  };

  const handleNewContactSubmit = (data: NewContactFormValues) => {
    const raw = data.phone || '';
    if (raw.length > 0 && !isValidPhone(raw)) {
      toast({ title: "Invalid phone number", description: "Enter a valid US/Canada phone number", variant: "destructive" });
      return;
    }
    createContact({ ...data, phone: raw ? normalizePhone(raw) : '' }, {
      onSuccess: (newContact) => {
        setSelectedContactId(newContact.id);
        setOpen(false);
        contactForm.reset();
      },
    });
  };

  const resetAll = () => {
    setStep('select-contact');
    setSelectedContactId(null);
    setContactSearch("");
    contactForm.reset();
  };

  const filteredContacts = contactSearch.trim()
    ? (contacts || []).filter(contact => {
        const searchLower = contactSearch.toLowerCase();
        return (
          contact.name.toLowerCase().includes(searchLower) ||
          (contact.email?.toLowerCase().includes(searchLower)) ||
          (contact.phone?.toLowerCase().includes(searchLower))
        );
      })
    : [];

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      resetAll();
    }
  };

  const handleDocumentCreated = (docId: number) => {
    setSelectedContactId(null);
    if (onDocumentCreated) {
      onDocumentCreated(docId);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          <Button size="icon" data-testid="button-create-document" title="Create Document">
            <Plus className="w-4 h-4" />
          </Button>
        </DialogTrigger>
        <DialogContent
          className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto fixed top-4 translate-y-0 sm:top-1/2 sm:-translate-y-1/2"
          hideCloseButton
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {step !== 'select-contact' && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setStep('select-contact')}
                  data-testid="button-back-step"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
              )}
              {step === 'select-contact' && 'Select Contact'}
              {step === 'new-contact' && 'Add New Contact'}
            </DialogTitle>
          </DialogHeader>

          {step === 'select-contact' && (
            <div className="space-y-4 pt-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, email, or phone..."
                  value={contactSearch}
                  onChange={(e) => setContactSearch(e.target.value)}
                  className="pl-9"
                  autoFocus
                  data-testid="input-search-contact"
                />
              </div>

              {contactsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    {!contactSearch.trim() && (
                      <p className="text-center py-4 text-muted-foreground">
                        {contacts?.length === 0 ? "No contacts yet. Add a new one." : "Search for a contact by name, email, or phone"}
                      </p>
                    )}
                    {filteredContacts.map((contact) => (
                      <div
                        key={contact.id}
                        className="p-3 border rounded-md cursor-pointer hover-elevate"
                        onClick={() => handleContactSelect(contact.id)}
                        data-testid={`select-contact-${contact.id}`}
                      >
                        <p className="font-medium">{contact.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {[contact.email, formatPhoneDisplay(contact.phone)].filter(Boolean).join(' \u2022 ')}
                        </p>
                      </div>
                    ))}
                    {filteredContacts.length === 0 && contactSearch.trim() && (
                      <p className="text-center py-4 text-muted-foreground">
                        No contacts match "{contactSearch}"
                      </p>
                    )}
                  </div>

                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setStep('new-contact')}
                    data-testid="button-add-new-contact"
                  >
                    <UserPlus className="w-4 h-4 mr-2" />
                    Add New Contact
                  </Button>
                </>
              )}
            </div>
          )}

          {step === 'new-contact' && (
            <form onSubmit={contactForm.handleSubmit(handleNewContactSubmit)} className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Name *</Label>
                  <Input {...contactForm.register("name")} placeholder="John Smith" data-testid="input-contact-name" />
                  {contactForm.formState.errors.name && (
                    <p className="text-sm text-destructive">{contactForm.formState.errors.name.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select onValueChange={(val) => contactForm.setValue("type", val as any)} defaultValue="lead">
                    <SelectTrigger data-testid="select-contact-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lead">Lead</SelectItem>
                      <SelectItem value="client">Client</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Email *</Label>
                  <Input {...contactForm.register("email")} placeholder="email@example.com" type="email" data-testid="input-contact-email" />
                  {contactForm.formState.errors.email && (
                    <p className="text-sm text-destructive">{contactForm.formState.errors.email.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Phone *</Label>
                  {(() => {
                    const phone = contactForm.watch("phone") || '';
                    const hasError = contactForm.formState.errors.phone;
                    const showInvalid = (phone.length > 0 && !isValidPhone(phone)) || !!hasError;
                    return (
                      <>
                        <Input 
                          value={phone}
                          onChange={(e) => {
                            contactForm.setValue("phone", stripPhoneInput(e.target.value));
                          }}
                          inputMode="tel"
                          placeholder="+15551234567"
                          data-testid="input-contact-phone"
                          className={cn(showInvalid ? 'border-destructive' : '')}
                        />
                        {hasError && (
                          <p className="text-sm text-destructive">{hasError.message}</p>
                        )}
                        {phone.length > 0 && !isValidPhone(phone) && !hasError && (
                          <p className="text-xs text-destructive mt-1">Enter a valid US/Canada phone number</p>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Street Address</Label>
                <AddressAutocomplete 
                  value={contactForm.watch("address") || ''}
                  onChange={(value) => contactForm.setValue("address", value)}
                  onAddressSelect={(components: AddressComponents) => {
                    contactForm.setValue("address", [components.streetNumber, components.route].filter(Boolean).join(' '));
                    contactForm.setValue("city", components.city);
                    contactForm.setValue("state", components.state);
                    contactForm.setValue("zipCode", components.zipCode);
                  }}
                  placeholder="123 Main St"
                  data-testid="input-contact-address"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-2">
                  <Label>City</Label>
                  <Input {...contactForm.register("city")} placeholder="City" data-testid="input-contact-city" />
                </div>
                <div className="space-y-2">
                  <Label>State</Label>
                  <Input {...contactForm.register("state")} placeholder="State" data-testid="input-contact-state" />
                </div>
                <div className="space-y-2">
                  <Label>ZIP</Label>
                  <Input {...contactForm.register("zipCode")} placeholder="ZIP" data-testid="input-contact-zip" />
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setStep('select-contact')} data-testid="button-back-to-contacts">
                  Back
                </Button>
                <Button type="submit" disabled={creatingContact} className="flex-1" data-testid="button-submit-contact">
                  {creatingContact && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Continue to Document
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {selectedContactId && (
        <CreateDocumentDialog
          contactId={selectedContactId}
          onDocumentCreated={handleDocumentCreated}
          autoOpen
          onClose={() => setSelectedContactId(null)}
        />
      )}
    </>
  );
}
