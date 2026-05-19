import { useState, useEffect } from "react";
import { formatPhoneDisplay } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PoweredByFusePhone } from "@/components/PoweredByFusePhone";
import {
  MapPin,
  Calendar,
  FileText,
  Phone,
  Mail,
  User,
  Loader2,
  HardHat,
  ClipboardList,
  Download,
  CheckCircle,
  Bell,
  ChevronDown,
  Wrench,
  Paintbrush,
  Home,
} from "lucide-react";
import { format } from "date-fns";

export default function WorkOrderViewer({ params }: { params: { token: string } }) {
  const token = params.token;
  const [viewRecorded, setViewRecorded] = useState(false);

  const { data, isLoading, error } = useQuery<any>({
    queryKey: ['/api/work-order/view', token],
    queryFn: () => fetch(`/api/work-order/view/${token}`).then(r => {
      if (!r.ok) throw new Error('Not found');
      return r.json();
    }),
  });

  useEffect(() => {
    if (data && !viewRecorded) {
      const params = new URLSearchParams(window.location.search);
      const memberId = params.get('member');
      if (memberId) {
        fetch(`/api/work-order/view/${token}/seen`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teamMemberId: memberId }),
        }).catch(() => {});
        setViewRecorded(true);
      }
    }
  }, [data, viewRecorded, token]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="text-center p-6">
          <ClipboardList className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <h2 className="text-lg font-semibold mb-1">Work Order Not Found</h2>
          <p className="text-sm text-muted-foreground">This work order link may have expired or is invalid.</p>
        </div>
      </div>
    );
  }

  const { workOrder, project, contact, companySettings, scopeSections, notes, crewAssignments, changeOrders } = data;
  const brandColor = companySettings?.brandColor || '#2563eb';
  const hasChangeOrders = Array.isArray(changeOrders) && changeOrders.length > 0;
  const hasScope = Array.isArray(scopeSections) && scopeSections.length > 0;

  const scrollToChangeOrders = () => {
    const el = document.getElementById('change-orders');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const renderRoom = (room: any, idx: number) => (
    <div key={room.id || idx} className="rounded-md border bg-muted/30 p-3" data-testid={`wo-room-${idx}`}>
      <div className="flex items-center gap-2 mb-2">
        <Home className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-sm font-semibold">{room.name}</span>
        {room.doorCount > 0 && (
          <span className="text-xs text-muted-foreground">· {room.doorCount} door{room.doorCount !== 1 ? 's' : ''}</span>
        )}
        {room.windowCount > 0 && (
          <span className="text-xs text-muted-foreground">· {room.windowCount} window{room.windowCount !== 1 ? 's' : ''}</span>
        )}
      </div>
      {room.surfaces && room.surfaces.length > 0 && (
        <ul className="space-y-1 mb-2">
          {room.surfaces.map((s: any) => (
            <li key={s.key} className="text-xs flex flex-wrap items-center gap-1.5" data-testid={`wo-surface-${room.id || idx}-${s.key}`}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: brandColor }} />
              <span className="font-medium">{s.label}</span>
              {typeof s.coats === 'number' && s.coats > 0 && (
                <Badge variant="secondary" className="text-[10px] py-0 px-1.5 h-4">{s.coats} coat{s.coats !== 1 ? 's' : ''}</Badge>
              )}
              {s.repair && (
                <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4 border-amber-500 text-amber-700 dark:text-amber-400">
                  <Wrench className="w-2.5 h-2.5 mr-0.5" />
                  Repair{s.repair.hours ? ` · ${s.repair.hours}h` : ''}
                </Badge>
              )}
              {s.note && <span className="text-muted-foreground italic">— {s.note}</span>}
              {s.repair?.description && <span className="text-amber-700 dark:text-amber-400 italic w-full pl-3">↳ {s.repair.description}</span>}
            </li>
          ))}
        </ul>
      )}
      {room.scopeNotes && (
        <p className="text-xs text-muted-foreground italic border-t pt-2 mt-2">{room.scopeNotes}</p>
      )}
    </div>
  );

  const renderScopeSections = (sections: any[], keyPrefix: string) => (
    <div className="space-y-3">
      {sections.map((sec: any, idx: number) => {
        if (sec.kind === 'item') {
          return (
            <div key={`${keyPrefix}-i-${idx}`} className="py-2 border-l-2 pl-3 ml-1" style={{ borderColor: brandColor }} data-testid={`wo-line-item-${idx}`}>
              <div
                className="text-sm font-medium prose prose-sm dark:prose-invert max-w-none [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_p]:my-1"
                dangerouslySetInnerHTML={{ __html: sec.description || sec.name || `Item ${idx + 1}` }}
              />
              {typeof sec.quantity === 'number' && sec.quantity !== 1 && (
                <p className="text-xs text-muted-foreground mt-1">Qty: {sec.quantity}</p>
              )}
              {sec.notes && <p className="text-xs text-muted-foreground mt-0.5">{sec.notes}</p>}
            </div>
          );
        }
        // block
        return (
          <div key={`${keyPrefix}-b-${idx}`} className="rounded-lg border-2 p-3" style={{ borderColor: brandColor }} data-testid={`wo-block-${idx}`}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-md flex items-center justify-center text-white" style={{ backgroundColor: brandColor }}>
                <Paintbrush className="w-3.5 h-3.5" />
              </div>
              <h4 className="text-sm font-bold" data-testid={`wo-block-name-${idx}`}>{sec.name || 'Production Block'}</h4>
            </div>
            {sec.lineItems && sec.lineItems.length > 0 && (
              <ul className="mb-3 space-y-1">
                {sec.lineItems.map((li: any, liIdx: number) => (
                  <li key={liIdx} className="text-xs flex items-start gap-1.5">
                    <span className="text-muted-foreground">•</span>
                    <span dangerouslySetInnerHTML={{ __html: li.description || li.name || '' }} />
                  </li>
                ))}
              </ul>
            )}
            {sec.rooms && sec.rooms.length > 0 && (
              <div className="space-y-2">
                {sec.rooms.map((room: any, ridx: number) => renderRoom(room, ridx))}
              </div>
            )}
            {sec.materialGroups && sec.materialGroups.length > 0 && (
              <div className="mt-3 pt-3 border-t">
                <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1.5">Materials</p>
                <ul className="space-y-0.5">
                  {sec.materialGroups.map((m: any, mIdx: number) => (
                    <li key={mIdx} className="text-xs flex items-center justify-between gap-2">
                      <span>{m.materialName || m.name}</span>
                      {typeof m.qtyToBuy === 'number' && m.qtyToBuy > 0 && (
                        <span className="text-muted-foreground">{m.qtyToBuy} {m.unit || ''}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const fullAddress = [project.jobAddress, project.jobCity, project.jobState, project.jobZipCode]
    .filter(Boolean).join(', ');

  const companyCityStateZip = [companySettings?.city, companySettings?.state].filter(Boolean).join(', ')
    + (companySettings?.zipCode ? ` ${companySettings.zipCode}` : '');

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="max-w-lg mx-auto px-4 py-6">
        <Card className="mb-4 overflow-hidden" data-testid="card-wo-header">
          <CardContent className="p-5 space-y-4">
            {companySettings?.logoUrl && (
              <div className="flex justify-center">
                <img src={companySettings.logoUrl} alt={companySettings?.companyName || ''} className="w-20 h-20 object-contain" data-testid="img-wo-logo" />
              </div>
            )}

            <div className="text-center space-y-1 border-b pb-4">
              <h1 className="text-xl font-bold" style={brandColor !== '#2563eb' ? { color: brandColor } : undefined} data-testid="text-wo-company">{companySettings?.companyName || 'Work Order'}</h1>
              {companySettings?.companyLicense && <p className="text-muted-foreground text-xs">License: {companySettings.companyLicense}</p>}
              {companySettings?.address && <p className="text-muted-foreground text-sm">{companySettings.address}</p>}
              {companyCityStateZip && <p className="text-muted-foreground text-sm">{companyCityStateZip}</p>}
              <div className="flex justify-center gap-4 text-muted-foreground text-sm">
                {companySettings?.phone && <span>{formatPhoneDisplay(companySettings.phone)}</span>}
                {companySettings?.email && <span>{companySettings.email}</span>}
              </div>
            </div>

            <div className="text-center border-b pb-4">
              <p className="text-xs font-bold uppercase text-muted-foreground mb-1">Work Order</p>
              <h2 className="text-lg font-bold" data-testid="text-wo-title">{project.title}</h2>
              {project.description && (
                <p className="text-sm text-muted-foreground mt-1" data-testid="text-wo-description">{project.description}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              {(contact?.name || contact?.phone || contact?.email) && (
                <div>
                  <h4 className="text-xs font-bold uppercase text-muted-foreground mb-1">Customer</h4>
                  {contact?.name && <p className="text-sm font-medium" data-testid="text-wo-customer">{contact.name}</p>}
                  {contact?.phone && (
                    <a href={`tel:${contact.phone}`} className="text-sm text-muted-foreground underline block" data-testid="text-wo-phone">{formatPhoneDisplay(contact.phone)}</a>
                  )}
                  {contact?.email && (
                    <a href={`mailto:${contact.email}`} className="text-sm text-muted-foreground underline block" data-testid="text-wo-email">{contact.email}</a>
                  )}
                </div>
              )}

              <div>
                {fullAddress && (
                  <div className="mb-2">
                    <h4 className="text-xs font-bold uppercase text-muted-foreground mb-1">Job Address</h4>
                    <a
                      href={`https://maps.google.com/?q=${encodeURIComponent(fullAddress)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm underline"
                      data-testid="text-wo-address"
                    >
                      {fullAddress}
                    </a>
                  </div>
                )}
                {project.scheduledDate && (
                  <div>
                    <h4 className="text-xs font-bold uppercase text-muted-foreground mb-1">Schedule</h4>
                    <p className="text-sm" data-testid="text-wo-dates">
                      {project.scheduledDate}
                      {project.scheduledTime && ` at ${project.scheduledTime}`}
                      {project.scheduledEndDate && ` — ${project.scheduledEndDate}`}
                      {project.scheduledEndTime && ` at ${project.scheduledEndTime}`}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {hasChangeOrders && (
          <button
            type="button"
            onClick={scrollToChangeOrders}
            className="w-full mb-4 rounded-lg border-2 border-amber-400 bg-amber-50 dark:bg-amber-950/30 p-3 flex items-center gap-3 hover:bg-amber-100 dark:hover:bg-amber-950/50 transition-colors text-left"
            data-testid="banner-change-orders"
          >
            <div className="w-9 h-9 rounded-full bg-amber-400 flex items-center justify-center flex-shrink-0">
              <Bell className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-amber-900 dark:text-amber-200">
                {changeOrders.length} Change Order{changeOrders.length !== 1 ? 's' : ''} added
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300">Tap to view scope changes at the bottom</p>
            </div>
            <ChevronDown className="w-5 h-5 text-amber-700 dark:text-amber-300 flex-shrink-0" />
          </button>
        )}

        {hasScope && (
          <Card className="mb-4" data-testid="card-wo-scope">
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Scope of Work
              </h3>
              {renderScopeSections(scopeSections, 'main')}
            </CardContent>
          </Card>
        )}

        {notes && (
          <Card className="mb-4" data-testid="card-wo-notes">
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold mb-2">Notes</h3>
              <p className="text-sm text-muted-foreground">{notes}</p>
            </CardContent>
          </Card>
        )}

        {workOrder.additionalNotes && (
          <Card className="mb-4" data-testid="card-wo-instructions">
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold mb-2">Additional Instructions</h3>
              <p className="text-sm text-muted-foreground">{workOrder.additionalNotes}</p>
            </CardContent>
          </Card>
        )}

        {workOrder.showAssignedCrew && crewAssignments && crewAssignments.length > 0 && (
          <Card className="mb-4" data-testid="card-wo-crew">
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <HardHat className="w-4 h-4" />
                Assigned Crew
              </h3>
              <div className="flex flex-wrap gap-2">
                {crewAssignments.map((a: any, idx: number) => (
                  <Badge key={idx} variant="secondary" className="capitalize">
                    {a.teamMember.name} · {a.teamMember.role}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {hasChangeOrders && (
          <div id="change-orders" className="scroll-mt-4 space-y-3 mb-4">
            <div className="flex items-center gap-2 mt-6 mb-2">
              <Bell className="w-4 h-4 text-amber-600" />
              <h2 className="text-base font-bold text-amber-900 dark:text-amber-200">Change Orders</h2>
            </div>
            {changeOrders.map((co: any, idx: number) => (
              <Card key={co.id} className="border-2 border-amber-400 bg-amber-50/40 dark:bg-amber-950/20" data-testid={`card-change-order-${co.id}`}>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between gap-2 mb-3 pb-3 border-b border-amber-300/60">
                    <div>
                      <p className="text-xs font-bold uppercase text-amber-700 dark:text-amber-300">
                        Change Order #{co.number}
                      </p>
                      <h3 className="text-sm font-bold mt-0.5" data-testid={`text-co-title-${co.id}`}>{co.title}</h3>
                    </div>
                    {co.signedAt && (
                      <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-300 whitespace-nowrap">
                        Signed {format(new Date(co.signedAt), 'MMM d')}
                      </Badge>
                    )}
                  </div>
                  {co.scopeSections && co.scopeSections.length > 0 ? (
                    renderScopeSections(co.scopeSections, `co-${co.id}`)
                  ) : (
                    <p className="text-xs text-muted-foreground italic">No scope items in this change order.</p>
                  )}
                  {co.notes && (
                    <div className="mt-3 pt-3 border-t border-amber-300/60">
                      <p className="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-300 mb-1">Notes</p>
                      <p className="text-xs text-muted-foreground">{co.notes}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <div className="text-center py-6 text-xs text-muted-foreground">
          <CheckCircle className="w-5 h-5 mx-auto mb-1 text-green-500" />
          <p>Work order by {companySettings?.companyName || 'Fuse Phone'}</p>
        </div>

        <PoweredByFusePhone className="pt-2 pb-6 border-t border-border/50" />
      </div>
    </div>
  );
}
