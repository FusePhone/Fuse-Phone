import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ChevronRight, Mail, ExternalLink } from "lucide-react";

const fmtMoney = (cents: number | null | undefined) =>
  `$${((cents || 0) / 100).toFixed(2)}`;
const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString() : "—";

type StatusFilter = "all" | "applied" | "approved" | "paused" | "rejected";

export default function AdminAffiliates() {
  const { toast } = useToast();
  const [reasons, setReasons] = useState<Record<number, string>>({});
  const [rateDraft, setRateDraft] = useState<Record<number, string>>({});
  const [notesDraft, setNotesDraft] = useState<Record<number, string>>({});
  const [openId, setOpenId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const { data: affs } = useQuery<{ affiliates: any[] }>({ queryKey: ["/api/admin/affiliates"] });
  const { data: gifts } = useQuery<{ requests: any[] }>({ queryKey: ["/api/admin/gift-cards"] });

  // Resync drafts from server data on every refetch — server truth wins,
  // so saves and other admin's edits don't leave stale local drafts behind.
  useEffect(() => {
    if (!affs?.affiliates) return;
    const r: Record<number, string> = {};
    const n: Record<number, string> = {};
    for (const row of affs.affiliates) {
      r[row.a.id] = ((row.a.commissionBps ?? 1000) / 100).toString();
      n[row.a.id] = row.a.adminNotes || "";
    }
    setRateDraft(r);
    setNotesDraft(n);
  }, [affs?.affiliates]);

  // When opening a row, ensure its drafts reflect the current server values
  useEffect(() => {
    if (openId == null) return;
    const row = (affs?.affiliates || []).find((r: any) => r.a.id === openId);
    if (!row) return;
    setRateDraft((prev) => ({ ...prev, [openId]: ((row.a.commissionBps ?? 1000) / 100).toString() }));
    setNotesDraft((prev) => ({ ...prev, [openId]: row.a.adminNotes || "" }));
  }, [openId]);

  const decideAffiliate = useMutation({
    mutationFn: async ({ id, decision, reason }: { id: number; decision: string; reason?: string }) =>
      apiRequest("POST", `/api/admin/affiliates/${id}/decision`, { decision, reason }),
    onSuccess: (_d, vars) => {
      toast({
        title: vars.decision === "approved" ? "Approved — welcome email sent" : "Updated",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/affiliates"] });
    },
    onError: (e: any) => toast({ title: "Failed", description: e?.message, variant: "destructive" }),
  });

  const updateAffiliate = useMutation({
    mutationFn: async ({ id, body }: { id: number; body: any }) =>
      apiRequest("PATCH", `/api/admin/affiliates/${id}`, body),
    onSuccess: () => {
      toast({ title: "Saved" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/affiliates"] });
    },
    onError: (e: any) => toast({ title: "Failed", description: e?.message, variant: "destructive" }),
  });

  const decideGift = useMutation({
    mutationFn: async ({ id, decision, notes }: { id: number; decision: string; notes?: string }) =>
      apiRequest("POST", `/api/admin/gift-cards/${id}/decision`, { decision, notes }),
    onSuccess: () => {
      toast({ title: "Updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/gift-cards"] });
    },
    onError: (e: any) => toast({ title: "Failed", description: e?.message, variant: "destructive" }),
  });

  const saveRate = (id: number) => {
    const pct = parseFloat(rateDraft[id] || "10");
    if (isNaN(pct) || pct < 0 || pct > 100) {
      toast({ title: "Invalid rate", description: "Enter a percentage between 0 and 100", variant: "destructive" });
      return;
    }
    updateAffiliate.mutate({ id, body: { commissionBps: Math.round(pct * 100) } });
  };

  const saveNotes = (id: number) => {
    updateAffiliate.mutate({ id, body: { adminNotes: notesDraft[id] || "" } });
  };

  const filtered = useMemo(() => {
    const list = affs?.affiliates || [];
    if (statusFilter === "all") return list;
    return list.filter((row: any) => row.a.status === statusFilter);
  }, [affs?.affiliates, statusFilter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0, applied: 0, approved: 0, paused: 0, rejected: 0 };
    for (const row of affs?.affiliates || []) {
      c.all++;
      c[row.a.status] = (c[row.a.status] || 0) + 1;
    }
    return c;
  }, [affs?.affiliates]);

  const openRow = filtered.find((row: any) => row.a.id === openId) || (affs?.affiliates || []).find((row: any) => row.a.id === openId);

  const statusBadge = (status: string) => {
    const variant =
      status === "approved" ? "default" :
      status === "applied" ? "secondary" :
      status === "paused" ? "outline" : "destructive";
    return <Badge variant={variant as any} className="capitalize" data-testid={`badge-status-${status}`}>{status}</Badge>;
  };

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6">
      <h1 className="text-2xl font-bold mb-4">Affiliate & Rewards Admin</h1>
      <Tabs defaultValue="affiliates">
        <TabsList>
          <TabsTrigger value="affiliates" data-testid="tab-affiliates">Affiliates</TabsTrigger>
          <TabsTrigger value="gifts" data-testid="tab-gifts">Gift card queue</TabsTrigger>
        </TabsList>

        <TabsContent value="affiliates">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3 flex-wrap">
                <span>Affiliates ({affs?.affiliates?.length || 0})</span>
                <div className="flex gap-1 flex-wrap">
                  {(["all", "applied", "approved", "paused", "rejected"] as StatusFilter[]).map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant={statusFilter === s ? "default" : "outline"}
                      onClick={() => setStatusFilter(s)}
                      className="h-7 px-2.5 text-xs capitalize"
                      data-testid={`filter-status-${s}`}
                    >
                      {s} {counts[s] ? `(${counts[s]})` : ""}
                    </Button>
                  ))}
                </div>
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Default commission is 10%. Tap a row to see full details and actions.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              {filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground py-12 text-center">No affiliates match this filter.</p>
              ) : (
                <ul className="divide-y">
                  {filtered.map((row: any) => {
                    const a = row.a;
                    const s = row.stats || {};
                    return (
                      <li key={a.id}>
                        <button
                          type="button"
                          onClick={() => setOpenId(a.id)}
                          className="w-full text-left px-4 py-3 hover-elevate active-elevate-2 flex items-center gap-3"
                          data-testid={`row-affiliate-${a.id}`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold truncate" data-testid={`text-name-${a.id}`}>
                                {a.fullName || `${row.firstName || ""} ${row.lastName || ""}`.trim() || "(no name)"}
                              </span>
                              {statusBadge(a.status)}
                              {!row.userEmail && a.email && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">Guest</span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground truncate mt-0.5">
                              {row.userEmail || a.email || "—"}
                              {a.socialPlatform && <span> · {a.socialPlatform}</span>}
                              {a.followerCount ? <span> · {a.followerCount.toLocaleString()} followers</span> : null}
                            </div>
                          </div>
                          <div className="hidden sm:flex items-center gap-4 text-xs text-right">
                            <div>
                              <div className="text-muted-foreground">Signups</div>
                              <div className="font-bold text-sm">{s.signups || 0}</div>
                            </div>
                            <div>
                              <div className="text-muted-foreground">Earned</div>
                              <div className="font-bold text-sm">{fmtMoney(s.totalEarnedCents)}</div>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gifts">
          <Card>
            <CardHeader><CardTitle>Gift card requests</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Requested</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(gifts?.requests || []).map((row: any) => {
                    const r = row.r;
                    return (
                      <TableRow key={r.id} data-testid={`row-gift-${r.id}`}>
                        <TableCell>{row.userEmail || row.a?.email || "—"}</TableCell>
                        <TableCell>{fmtMoney(r.amountCents)}</TableCell>
                        <TableCell><Badge>{r.status}</Badge></TableCell>
                        <TableCell>{fmtDate(r.createdAt)}</TableCell>
                        <TableCell className="space-x-2">
                          {r.status === "requested" && (
                            <Button size="sm" onClick={() => decideGift.mutate({ id: r.id, decision: "approved" })} data-testid={`button-gift-approve-${r.id}`}>Approve</Button>
                          )}
                          {(r.status === "approved" || r.status === "requested") && (
                            <Button size="sm" variant="outline" onClick={() => decideGift.mutate({ id: r.id, decision: "sent" })} data-testid={`button-gift-sent-${r.id}`}>Mark sent</Button>
                          )}
                          {r.status !== "sent" && r.status !== "declined" && (
                            <Button size="sm" variant="destructive" onClick={() => decideGift.mutate({ id: r.id, decision: "declined" })} data-testid={`button-gift-decline-${r.id}`}>Decline</Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={openId !== null} onOpenChange={(open) => !open && setOpenId(null)}>
        <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto" data-testid="dialog-affiliate-details">
          {openRow && (() => {
            const a = openRow.a;
            const s = openRow.stats || {};
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 flex-wrap">
                    <span>{a.fullName || `${openRow.firstName || ""} ${openRow.lastName || ""}`.trim() || "(no name)"}</span>
                    {statusBadge(a.status)}
                    {!openRow.userEmail && a.email && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">Guest applicant</span>
                    )}
                  </DialogTitle>
                </DialogHeader>

                <div className="space-y-5 pt-2">
                  {/* Identity */}
                  <section className="space-y-1.5">
                    <div className="text-sm flex items-center gap-2">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                      <a href={`mailto:${openRow.userEmail || a.email}`} className="text-primary underline">
                        {openRow.userEmail || a.email || "—"}
                      </a>
                    </div>
                    <div className="text-sm">
                      <strong>{a.socialPlatform || "—"}</strong>
                      {a.socialHandle && <span className="text-muted-foreground"> @{a.socialHandle}</span>}
                    </div>
                    <div className="text-sm">Followers: <strong>{a.followerCount?.toLocaleString() || "—"}</strong></div>
                    {a.websiteUrl && (
                      <div className="text-sm flex items-center gap-1.5">
                        <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                        <a href={a.websiteUrl} target="_blank" rel="noreferrer" className="text-primary underline truncate">{a.websiteUrl}</a>
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground">
                      Applied {fmtDate(a.createdAt)}
                      {a.approvedAt && <> · Approved {fmtDate(a.approvedAt)}</>}
                    </div>
                    {a.applicationNotes && (
                      <div className="text-sm mt-2 p-3 rounded bg-muted/50">
                        <div className="text-xs font-medium mb-1">Why they applied</div>
                        {a.applicationNotes}
                      </div>
                    )}
                    {a.rejectionReason && (
                      <div className="text-sm mt-2 text-destructive">Rejected: {a.rejectionReason}</div>
                    )}
                  </section>

                  {/* Performance */}
                  <section>
                    <div className="text-xs font-medium text-muted-foreground mb-2">PERFORMANCE</div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                      <div>
                        <div className="text-muted-foreground">Signups</div>
                        <div className="font-bold text-lg" data-testid={`stat-signups-${a.id}`}>{s.signups || 0}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Paying</div>
                        <div className="font-bold text-lg" data-testid={`stat-active-${a.id}`}>{s.active || 0}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Lifetime earned</div>
                        <div className="font-bold text-lg" data-testid={`stat-earned-${a.id}`}>{fmtMoney(s.totalEarnedCents)}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Unpaid balance</div>
                        <div className="font-bold text-lg" data-testid={`stat-unpaid-${a.id}`}>{fmtMoney(s.unpaidCents)}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Paid out</div>
                        <div className="font-bold" data-testid={`stat-paid-${a.id}`}>{fmtMoney(s.paidOutCents)}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Last payout</div>
                        <div className="font-bold text-xs">
                          {s.lastPayoutAt ? `${fmtDate(s.lastPayoutAt)} (${s.lastPayoutStatus})` : "Never"}
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground mt-3">
                      Stripe Connect: {a.stripeConnectAccountId ? (a.stripeOnboardingComplete ? "✓ ready" : "incomplete") : "not set up"}
                    </div>
                  </section>

                  {/* Controls */}
                  <section className="space-y-3 border-t pt-4">
                    <div>
                      <Label htmlFor={`rate-${a.id}`} className="text-xs font-medium text-muted-foreground">COMMISSION RATE (%)</Label>
                      <div className="flex gap-2 mt-1">
                        <Input
                          id={`rate-${a.id}`}
                          type="number"
                          min="0"
                          max="100"
                          step="0.5"
                          value={rateDraft[a.id] ?? ""}
                          onChange={(e) => setRateDraft({ ...rateDraft, [a.id]: e.target.value })}
                          className="w-28"
                          data-testid={`input-rate-${a.id}`}
                        />
                        <Button size="sm" onClick={() => saveRate(a.id)} disabled={updateAffiliate.isPending} data-testid={`button-save-rate-${a.id}`}>
                          Save rate
                        </Button>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Currently {((a.commissionBps ?? 1000) / 100).toFixed(2)}% · 0 = paused
                      </div>
                    </div>

                    <div>
                      <Label htmlFor={`notes-${a.id}`} className="text-xs font-medium text-muted-foreground">ADMIN NOTES (private)</Label>
                      <Textarea
                        id={`notes-${a.id}`}
                        rows={2}
                        value={notesDraft[a.id] ?? ""}
                        onChange={(e) => setNotesDraft({ ...notesDraft, [a.id]: e.target.value })}
                        placeholder="e.g. Negotiated 15% for 6 months..."
                        data-testid={`input-notes-${a.id}`}
                      />
                      <Button size="sm" variant="outline" className="mt-1" onClick={() => saveNotes(a.id)} disabled={updateAffiliate.isPending} data-testid={`button-save-notes-${a.id}`}>
                        Save notes
                      </Button>
                    </div>

                    <div className="pt-2 border-t space-y-2">
                      {a.status === "applied" && (
                        <>
                          <Button className="w-full" onClick={() => decideAffiliate.mutate({ id: a.id, decision: "approved" })} disabled={decideAffiliate.isPending} data-testid={`button-approve-${a.id}`}>
                            Approve & send welcome email
                          </Button>
                          <Textarea
                            placeholder="Rejection reason (optional)"
                            value={reasons[a.id] || ""}
                            onChange={(e) => setReasons({ ...reasons, [a.id]: e.target.value })}
                            rows={2}
                          />
                          <Button variant="destructive" className="w-full" onClick={() => decideAffiliate.mutate({ id: a.id, decision: "rejected", reason: reasons[a.id] })} disabled={decideAffiliate.isPending} data-testid={`button-reject-${a.id}`}>
                            Reject
                          </Button>
                        </>
                      )}
                      {a.status === "approved" && (
                        <Button variant="outline" className="w-full" onClick={() => decideAffiliate.mutate({ id: a.id, decision: "paused" })} disabled={decideAffiliate.isPending} data-testid={`button-pause-${a.id}`}>
                          Pause affiliate
                        </Button>
                      )}
                      {a.status === "paused" && (
                        <Button className="w-full" onClick={() => decideAffiliate.mutate({ id: a.id, decision: "approved" })} disabled={decideAffiliate.isPending} data-testid={`button-resume-${a.id}`}>
                          Resume
                        </Button>
                      )}
                      {a.status === "rejected" && (
                        <Button className="w-full" onClick={() => decideAffiliate.mutate({ id: a.id, decision: "approved" })} disabled={decideAffiliate.isPending} data-testid={`button-reapprove-${a.id}`}>
                          Approve anyway
                        </Button>
                      )}
                    </div>
                  </section>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
