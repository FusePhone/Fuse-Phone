import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  DollarSign, TrendingUp, Receipt, FileText, Loader2, ArrowLeft,
  Calendar, CheckCircle, Clock, AlertCircle
} from "lucide-react";
import { Link } from "wouter";
import { useSafeBack } from "@/hooks/use-safe-back";
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths, subYears, startOfWeek, endOfWeek, subWeeks } from "date-fns";
import { cn } from "@/lib/utils";

type DateRange = 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'this_quarter' | 'last_quarter' | 'this_year' | 'last_year' | 'all_time';

export default function Revenue() {
  const [dateRange, setDateRange] = useState<DateRange>('this_month');
  const handleBack = useSafeBack("/financials");

  // Fetch all payments and documents
  const { data: payments, isLoading: paymentsLoading } = useQuery<any[]>({
    queryKey: ['/api/payments'],
  });

  const { data: documents, isLoading: docsLoading } = useQuery<any[]>({
    queryKey: ['/api/documents'],
  });

  const isLoading = paymentsLoading || docsLoading;

  // Calculate date range boundaries
  const { startDate, endDate, label } = useMemo(() => {
    const now = new Date();
    let start: Date;
    let end: Date;
    let lbl: string;

    switch (dateRange) {
      case 'this_week':
        start = startOfWeek(now, { weekStartsOn: 1 });
        end = endOfWeek(now, { weekStartsOn: 1 });
        lbl = 'This Week';
        break;
      case 'last_week':
        start = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
        end = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
        lbl = 'Last Week';
        break;
      case 'this_month':
        start = startOfMonth(now);
        end = endOfMonth(now);
        lbl = format(now, 'MMMM yyyy');
        break;
      case 'last_month':
        start = startOfMonth(subMonths(now, 1));
        end = endOfMonth(subMonths(now, 1));
        lbl = format(subMonths(now, 1), 'MMMM yyyy');
        break;
      case 'this_quarter':
        const q = Math.floor(now.getMonth() / 3);
        start = new Date(now.getFullYear(), q * 3, 1);
        end = new Date(now.getFullYear(), q * 3 + 3, 0);
        lbl = `Q${q + 1} ${now.getFullYear()}`;
        break;
      case 'last_quarter':
        const lq = Math.floor(now.getMonth() / 3) - 1;
        const year = lq < 0 ? now.getFullYear() - 1 : now.getFullYear();
        const quarter = lq < 0 ? 3 : lq;
        start = new Date(year, quarter * 3, 1);
        end = new Date(year, quarter * 3 + 3, 0);
        lbl = `Q${quarter + 1} ${year}`;
        break;
      case 'this_year':
        start = startOfYear(now);
        end = endOfYear(now);
        lbl = now.getFullYear().toString();
        break;
      case 'last_year':
        start = startOfYear(subYears(now, 1));
        end = endOfYear(subYears(now, 1));
        lbl = (now.getFullYear() - 1).toString();
        break;
      case 'all_time':
      default:
        start = new Date(2020, 0, 1);
        end = now;
        lbl = 'All Time';
        break;
    }

    return { startDate: start, endDate: end, label: lbl };
  }, [dateRange]);

  // Filter and calculate metrics
  const metrics = useMemo(() => {
    if (!payments || !documents) return null;

    // Filter payments in range
    const paymentsInRange = payments.filter(p => {
      const paymentDate = p.paymentDate ? new Date(p.paymentDate) : null;
      return paymentDate && paymentDate >= startDate && paymentDate <= endDate;
    });

    // Filter documents in range
    const docsInRange = documents.filter(d => {
      const createdAt = d.createdAt ? new Date(d.createdAt) : null;
      return createdAt && createdAt >= startDate && createdAt <= endDate;
    });

    // Revenue from payments
    const totalRevenue = paymentsInRange.reduce((sum, p) => sum + (p.amount || 0), 0);

    // Invoice metrics
    const invoices = docsInRange.filter(d => d.type === 'invoice');
    const paidInvoices = invoices.filter(d => d.status === 'paid');
    const pendingInvoices = documents.filter(d => d.type === 'invoice' && d.status === 'sent');
    const overdueInvoices = pendingInvoices.filter(d => {
      const createdAt = d.createdAt ? new Date(d.createdAt) : null;
      if (!createdAt) return false;
      const dueDate = new Date(createdAt);
      dueDate.setDate(dueDate.getDate() + 30);
      return dueDate < new Date();
    });

    // Proposal metrics (includes both proposal and estimate types)
    const proposals = docsInRange.filter(d => d.type === 'proposal' || d.type === 'estimate');
    const acceptedProposals = proposals.filter(d => d.status === 'accepted');
    const activeProposals = documents.filter(d => (d.type === 'proposal' || d.type === 'estimate') && ['sent', 'viewed'].includes(d.status));

    // Total amounts
    const pendingInvoicesAmount = pendingInvoices.reduce((sum, d) => sum + (d.totalAmount || 0), 0);
    const overdueAmount = overdueInvoices.reduce((sum, d) => sum + (d.totalAmount || 0), 0);
    const proposalValue = activeProposals.reduce((sum, d) => sum + (d.totalAmount || 0), 0);

    return {
      totalRevenue,
      paymentsCount: paymentsInRange.length,
      invoicesCreated: invoices.length,
      invoicesPaid: paidInvoices.length,
      pendingInvoicesCount: pendingInvoices.length,
      pendingInvoicesAmount,
      overdueCount: overdueInvoices.length,
      overdueAmount,
      proposalsCreated: proposals.length,
      proposalsAccepted: acceptedProposals.length,
      activeProposalsCount: activeProposals.length,
      proposalValue,
    };
  }, [payments, documents, startDate, endDate]);

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
  };

  if (isLoading && !payments && !documents) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary" data-testid="loading-spinner" />
      </div>
    );
  }

  return (
    <div className="p-4 pb-24 lg:p-6 lg:pb-24 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" data-testid="button-back" onClick={handleBack}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl lg:text-3xl font-display font-bold text-foreground" data-testid="text-revenue-title">
              Revenue Analytics
            </h1>
            <p className="text-muted-foreground mt-1">Track your business performance</p>
          </div>
        </div>

        {/* Date Range Selector */}
        <div className="flex items-center gap-3">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
            <SelectTrigger className="w-[180px]" data-testid="select-date-range">
              <SelectValue placeholder="Select range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="this_week">This Week</SelectItem>
              <SelectItem value="last_week">Last Week</SelectItem>
              <SelectItem value="this_month">This Month</SelectItem>
              <SelectItem value="last_month">Last Month</SelectItem>
              <SelectItem value="this_quarter">This Quarter</SelectItem>
              <SelectItem value="last_quarter">Last Quarter</SelectItem>
              <SelectItem value="this_year">This Year</SelectItem>
              <SelectItem value="last_year">Last Year</SelectItem>
              <SelectItem value="all_time">All Time</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Date Range Label */}
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-sm px-3 py-1">
          {label}
        </Badge>
        <span className="text-sm text-muted-foreground">
          {format(startDate, 'MMM d, yyyy')} - {format(endDate, 'MMM d, yyyy')}
        </span>
      </div>

      {/* Primary Revenue Metric */}
      <Card className="bg-gradient-to-br from-emerald-500/10 to-green-500/5 border-emerald-200 dark:border-emerald-900">
        <CardContent className="pt-6 pb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Total Revenue
              </p>
              <p className="text-4xl lg:text-5xl font-bold text-emerald-600 dark:text-emerald-400 mt-2" data-testid="value-total-revenue">
                {formatCurrency(metrics?.totalRevenue || 0)}
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                From {metrics?.paymentsCount || 0} payment{metrics?.paymentsCount !== 1 ? 's' : ''} received
              </p>
            </div>
            <div className="p-4 rounded-full bg-emerald-500/20">
              <DollarSign className="w-10 h-10 text-emerald-600" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Invoice & Payment Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card data-testid="card-invoices-created">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground uppercase">Invoices Created</span>
              <div className="p-1.5 rounded-md bg-blue-500/10">
                <FileText className="w-3.5 h-3.5 text-blue-500" />
              </div>
            </div>
            <div className="text-2xl font-bold">{metrics?.invoicesCreated || 0}</div>
          </CardContent>
        </Card>

        <Card data-testid="card-invoices-paid">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground uppercase">Invoices Paid</span>
              <div className="p-1.5 rounded-md bg-green-500/10">
                <CheckCircle className="w-3.5 h-3.5 text-green-500" />
              </div>
            </div>
            <div className="text-2xl font-bold">{metrics?.invoicesPaid || 0}</div>
          </CardContent>
        </Card>

        <Link href="/documents?type=invoice&status=sent">
          <Card className="hover-elevate cursor-pointer h-full" data-testid="card-pending-invoices">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground uppercase">Pending</span>
                <div className="p-1.5 rounded-md bg-amber-500/10">
                  <Clock className="w-3.5 h-3.5 text-amber-500" />
                </div>
              </div>
              <div className="text-2xl font-bold">{metrics?.pendingInvoicesCount || 0}</div>
              <div className="text-sm text-muted-foreground">{formatCurrency(metrics?.pendingInvoicesAmount || 0)}</div>
            </CardContent>
          </Card>
        </Link>

        <Card className={cn(
          "border-red-200 dark:border-red-900",
          (metrics?.overdueCount || 0) > 0 && "bg-red-50 dark:bg-red-950/20"
        )} data-testid="card-overdue-invoices">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground uppercase">Overdue</span>
              <div className="p-1.5 rounded-md bg-red-500/10">
                <AlertCircle className="w-3.5 h-3.5 text-red-500" />
              </div>
            </div>
            <div className="text-2xl font-bold text-red-600">{metrics?.overdueCount || 0}</div>
            <div className="text-sm text-red-500">{formatCurrency(metrics?.overdueAmount || 0)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Proposal Metrics */}
      <Card data-testid="card-proposals-summary">
        <CardHeader>
          <CardTitle className="text-lg">Proposals</CardTitle>
          <CardDescription>Proposal performance for {label.toLowerCase()}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 rounded-lg bg-muted/50">
              <p className="text-2xl font-bold">{metrics?.proposalsCreated || 0}</p>
              <p className="text-xs text-muted-foreground mt-1">Created</p>
            </div>
            <div className="text-center p-4 rounded-lg bg-green-500/10">
              <p className="text-2xl font-bold text-green-600">{metrics?.proposalsAccepted || 0}</p>
              <p className="text-xs text-muted-foreground mt-1">Accepted</p>
            </div>
            <Link href="/documents?type=proposal&status=sent,viewed">
              <div className="text-center p-4 rounded-lg bg-indigo-500/10 hover-elevate cursor-pointer">
                <p className="text-2xl font-bold text-indigo-600">{metrics?.activeProposalsCount || 0}</p>
                <p className="text-xs text-muted-foreground mt-1">Active</p>
              </div>
            </Link>
          </div>
          <div className="mt-4 pt-4 border-t">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Active proposal value</span>
              <span className="font-bold text-indigo-600">{formatCurrency(metrics?.proposalValue || 0)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Links */}
      <div className="flex gap-3 flex-wrap">
        <Link href="/documents?type=invoice">
          <Button variant="outline" data-testid="button-view-invoices">
            <Receipt className="w-4 h-4 mr-2" />
            View All Invoices
          </Button>
        </Link>
        <Link href="/documents?type=proposal">
          <Button variant="outline" data-testid="button-view-proposals">
            <FileText className="w-4 h-4 mr-2" />
            View All Proposals
          </Button>
        </Link>
      </div>
    </div>
  );
}
