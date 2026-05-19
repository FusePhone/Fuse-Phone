import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Loader2, Users, TrendingUp, Clock, Target, DollarSign,
  ArrowUpRight, ArrowDownRight, Receipt, BarChart3, FileSignature, Zap,
  AlertTriangle, Settings, HardHat, CheckCircle2, Calendar,
  Lightbulb, Trophy, Star, TrendingDown, X, Lock
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid
} from "recharts";

const CHART_COLORS = [
  'hsl(var(--primary))',
  'hsl(220 70% 55%)',
  'hsl(150 60% 45%)',
  'hsl(35 85% 55%)',
  'hsl(280 65% 55%)',
  'hsl(10 75% 55%)',
  'hsl(180 55% 45%)',
  'hsl(330 65% 55%)',
];

function KpiCard({ icon: Icon, label, value, sub, color, bg, testId }: {
  icon: typeof TrendingUp; label: string; value: string; sub?: string; color: string; bg: string; testId: string;
}) {
  return (
    <Card data-testid={testId}>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={cn("p-2 rounded-md flex-shrink-0", bg)}>
            <Icon className={cn("w-4 h-4", color)} />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium leading-none mb-1">{label}</p>
            <p className="text-lg font-bold leading-tight" data-testid={`${testId}-value`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CustomTooltip({ active, payload, label, formatter }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border rounded-md shadow-lg px-3 py-2 text-sm">
      <p className="font-medium text-foreground mb-1">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} className="text-muted-foreground">
          <span style={{ color: entry.color }}>{entry.name || entry.dataKey}: </span>
          <span className="font-semibold text-foreground">
            {formatter ? formatter(entry.value)
              : typeof entry.value === 'number' && (entry.dataKey?.includes('revenue') || entry.dataKey?.includes('Revenue'))
              ? `$${entry.value.toLocaleString()}`
              : entry.value}
          </span>
        </p>
      ))}
    </div>
  );
}

type SourceView = 'leads' | 'sales' | 'closeRate' | 'avgValue';

function SourceBreakdownChart({ sourceBreakdown, leadSources }: { sourceBreakdown: any[]; leadSources: any[] }) {
  const [view, setView] = useState<SourceView>('leads');

  const getChartData = () => {
    if (view === 'leads') {
      return leadSources.map((s: any, i: number) => ({
        source: s.source,
        value: s.count,
        color: CHART_COLORS[i % CHART_COLORS.length],
      }));
    }
    const sorted = [...sourceBreakdown].sort((a, b) => {
      if (view === 'sales') return b.sales - a.sales;
      if (view === 'closeRate') return b.closeRate - a.closeRate;
      return b.avgValue - a.avgValue;
    });
    return sorted.map((s: any, i: number) => ({
      source: s.source,
      value: view === 'sales' ? s.sales : view === 'closeRate' ? s.closeRate : s.avgValue,
      color: CHART_COLORS[i % CHART_COLORS.length],
    }));
  };

  const chartData = getChartData();
  const hasData = chartData.length > 0 && chartData.some((d: any) => d.value > 0);

  const formatValue = (val: number) => {
    if (view === 'closeRate') return `${val}%`;
    if (view === 'avgValue') return `$${val.toLocaleString()}`;
    return val.toString();
  };

  const viewLabels: Record<SourceView, string> = {
    leads: 'Leads',
    sales: 'Sales',
    closeRate: 'Close Rate',
    avgValue: 'Avg Value',
  };

  return (
    <Card data-testid="chart-source-breakdown">
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            By Source
          </CardTitle>
          <div className="flex rounded-md border bg-muted/30 p-0.5" data-testid="source-view-toggle">
            {(Object.keys(viewLabels) as SourceView[]).map((v) => (
              <Button
                key={v}
                variant={view === v ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setView(v)}
                className={cn("text-xs", view !== v && "text-muted-foreground")}
                data-testid={`button-source-${v}`}
              >
                {viewLabels[v]}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-64 flex items-center">
          {hasData ? (
            <div className="flex w-full gap-4">
              <div className="w-1/2">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={chartData}
                      dataKey="value"
                      nameKey="source"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      innerRadius={40}
                    >
                      {chartData.map((_: any, i: number) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip formatter={formatValue} />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="w-1/2 flex flex-col justify-center gap-1.5">
                {chartData.slice(0, 8).map((src: any, i: number) => (
                  <div key={src.source} className="flex items-center gap-2 text-sm" data-testid={`source-item-${i}`}>
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                    <span className="truncate text-muted-foreground flex-1">{src.source}</span>
                    <span className="font-semibold tabular-nums">{formatValue(src.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center w-full">
              <Users className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-40" />
              <p className="text-sm text-muted-foreground">
                {view === 'leads' ? 'No lead data yet' : view === 'sales' ? 'No sales data yet' : 'No data yet'}
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}


function LeadIntelligenceSection() {
  const { data: intel, isLoading } = useQuery<any>({ queryKey: ['/api/metrics/lead-intelligence'] });

  if (isLoading) return null;
  if (!intel || !intel.sources?.length) return null;

  const { sources, rankings, budgetRecommendations } = intel;

  const topCloseSource = rankings?.byCloseRate?.[0] ? sources.find((s: any) => s.source === rankings.byCloseRate[0]) : null;
  const topRevenueSource = rankings?.byTotalRevenue?.[0] ? sources.find((s: any) => s.source === rankings.byTotalRevenue[0]) : null;
  const topAvgSource = rankings?.byAvgValue?.[0] ? sources.find((s: any) => s.source === rankings.byAvgValue[0]) : null;

  const actionableInsights: string[] = [];
  if (rankings?.bestROI?.length > 0) {
    actionableInsights.push(`Best ROI sources: ${rankings.bestROI.join(', ')} — focus your ad spend here.`);
  }
  if (budgetRecommendations?.length > 0) {
    const topRec = budgetRecommendations[0];
    if (topRec.estimatedBudget > 0) {
      actionableInsights.push(`To generate ~$${topRec.expectedRevenue.toLocaleString()} from ${topRec.source}, invest ~$${topRec.estimatedBudget.toLocaleString()} for ${topRec.leadsNeeded} leads.`);
    }
  }

  return (
    <div className="space-y-4" data-testid="section-lead-intelligence">
      <div className="flex items-center gap-2">
        <Lightbulb className="w-4 h-4 text-amber-500" />
        <h3 className="text-sm font-semibold">Lead Intelligence</h3>
        <Badge variant="secondary" className="text-[10px]">Last {intel.period?.days || 60} days</Badge>
      </div>

      {actionableInsights.length > 0 && (
        <Card className="border-primary/20 bg-primary/5" data-testid="card-lead-recommendations">
          <CardContent className="p-4">
            <div className="space-y-2">
              {actionableInsights.map((rec: string, i: number) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <Lightbulb className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-foreground">{rec}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {topCloseSource && (
          <Card data-testid="card-top-close-rate">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Trophy className="w-4 h-4 text-amber-500" />
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Best Close Rate</p>
              </div>
              <p className="font-bold text-lg" data-testid="text-top-close-source">{topCloseSource.source}</p>
              <p className="text-sm text-emerald-600 dark:text-emerald-400">{topCloseSource.closeRate}% close rate</p>
              <p className="text-xs text-muted-foreground">{topCloseSource.leads} leads, {topCloseSource.sales} sales</p>
            </CardContent>
          </Card>
        )}
        {topRevenueSource && (
          <Card data-testid="card-top-revenue">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-4 h-4 text-emerald-500" />
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Highest Revenue</p>
              </div>
              <p className="font-bold text-lg" data-testid="text-top-revenue-source">{topRevenueSource.source}</p>
              <p className="text-sm text-emerald-600 dark:text-emerald-400">${topRevenueSource.totalRevenue.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">{topRevenueSource.sales} sales, avg ${topRevenueSource.avgDealValue.toLocaleString()}</p>
            </CardContent>
          </Card>
        )}
        {topAvgSource && (
          <Card data-testid="card-top-avg-value">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Star className="w-4 h-4 text-blue-500" />
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Highest Avg Deal</p>
              </div>
              <p className="font-bold text-lg" data-testid="text-top-avg-source">{topAvgSource.source}</p>
              <p className="text-sm text-blue-600 dark:text-blue-400">${topAvgSource.avgDealValue.toLocaleString()} avg</p>
              <p className="text-xs text-muted-foreground">{topAvgSource.closeRate}% close rate</p>
            </CardContent>
          </Card>
        )}
      </div>

      <Card data-testid="card-source-details">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            Source Performance & Recommended Spend
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <table className="w-full text-sm" data-testid="table-lead-sources">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Source</th>
                  <th className="text-right py-2 px-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Leads</th>
                  <th className="text-right py-2 px-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Sales</th>
                  <th className="text-right py-2 px-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Close %</th>
                  <th className="text-right py-2 px-2 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Avg Deal</th>
                  <th className="text-right py-2 px-2 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden md:table-cell">Revenue</th>
                  <th className="text-right py-2 pl-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Max CPL</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((s: any, i: number) => (
                  <tr key={s.source} className="border-b border-border/50 last:border-0" data-testid={`row-source-${i}`}>
                    <td className="py-2.5 pr-3 font-medium">{s.source}</td>
                    <td className="text-right py-2.5 px-2 tabular-nums">{s.leads}</td>
                    <td className="text-right py-2.5 px-2 tabular-nums">{s.sales}</td>
                    <td className="text-right py-2.5 px-2">
                      <Badge
                        variant={s.closeRate >= 30 ? "default" : s.closeRate >= 15 ? "secondary" : "outline"}
                        className="text-xs tabular-nums"
                      >
                        {s.closeRate}%
                      </Badge>
                    </td>
                    <td className="text-right py-2.5 px-2 tabular-nums text-muted-foreground hidden sm:table-cell">${s.avgDealValue.toLocaleString()}</td>
                    <td className="text-right py-2.5 px-2 tabular-nums text-emerald-600 dark:text-emerald-400 hidden md:table-cell">${s.totalRevenue.toLocaleString()}</td>
                    <td className="text-right py-2.5 pl-2 tabular-nums font-medium">
                      {s.recommendedCostPerLead > 0 ? `$${s.recommendedCostPerLead.toLocaleString()}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-muted-foreground mt-3">
            Max CPL = maximum you should spend per lead from this source while maintaining a 30% profit margin
          </p>
        </CardContent>
      </Card>

      {budgetRecommendations?.length > 0 && (
        <Card data-testid="card-budget-recommendations">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" />
              Budget Allocation Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
              <table className="w-full text-sm" data-testid="table-budget-recs">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Source</th>
                    <th className="text-right py-2 px-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Leads Needed</th>
                    <th className="text-right py-2 px-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Est. Budget</th>
                    <th className="text-right py-2 pl-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Expected Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {budgetRecommendations.map((r: any, i: number) => (
                    <tr key={r.source} className="border-b border-border/50 last:border-0" data-testid={`row-budget-${i}`}>
                      <td className="py-2.5 pr-3 font-medium">{r.source}</td>
                      <td className="text-right py-2.5 px-2 tabular-nums">{r.leadsNeeded}</td>
                      <td className="text-right py-2.5 px-2 tabular-nums">${r.estimatedBudget.toLocaleString()}</td>
                      <td className="text-right py-2.5 pl-2 tabular-nums text-emerald-600 dark:text-emerald-400">${r.expectedRevenue.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function OverallTab({ metrics }: { metrics: any }) {
  const { leadSources, sourceBreakdown, conversion, timeToSign, pipeline, revenueTrends, outstanding, pnl, actualPnl, newLeads, proposals, setupStatus } = metrics;
  const [pnlView, setPnlView] = useState<'actual' | 'goal'>('actual');
  const [pnlPeriod, setPnlPeriod] = useState<'week' | 'month' | 'year' | 'custom'>('month');
  const [showPnlPicker, setShowPnlPicker] = useState(false);
  const [pnlPickerMode, setPnlPickerMode] = useState<'single' | 'range'>('single');
  const [pnlPickingStart, setPnlPickingStart] = useState<string | null>(null);
  const [pnlCustomRange, setPnlCustomRange] = useState<{ from: string; to: string } | null>(null);
  const hasPnlData = setupStatus?.hasOverheadExpenses && setupStatus?.hasCrewMembers;
  const missingItems = setupStatus?.missingSetup || [];

  const pnlPeriodLabel = (() => {
    if (pnlPeriod === 'week') return 'This Week';
    if (pnlPeriod === 'year') return 'Year-to-Date';
    if (pnlPeriod === 'custom' && pnlCustomRange) {
      const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const [fy, fm] = pnlCustomRange.from.split('-').map(Number);
      const [ty, tm] = pnlCustomRange.to.split('-').map(Number);
      if (pnlCustomRange.from === pnlCustomRange.to) return `${monthNames[fm-1]} ${fy}`;
      return `${monthNames[fm-1]} ${fy} – ${monthNames[tm-1]} ${ty}`;
    }
    return 'This Month';
  })();

  return (
    <div className="space-y-6">
      {missingItems.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5 dark:bg-amber-500/10" data-testid="card-setup-needed">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">Complete your setup for full metrics</p>
                <p className="text-xs text-muted-foreground mt-1">
                  To see accurate break-even tracking and P&L data, set up your {missingItems.join(', ')}.
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {(!setupStatus?.hasFinancialSettings || !setupStatus?.hasOverheadExpenses) && (
                    <Link href="/settings/financial">
                      <Button variant="outline" size="sm" data-testid="button-setup-financial">
                        <Settings className="w-3.5 h-3.5 mr-1.5" />
                        Financial Settings
                      </Button>
                    </Link>
                  )}
                  {!setupStatus?.hasCrewMembers && (
                    <Link href="/settings/crew">
                      <Button variant="outline" size="sm" data-testid="button-setup-crew">
                        <HardHat className="w-3.5 h-3.5 mr-1.5" />
                        Crew Management
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {hasPnlData ? (
        <Card className="shadow-md" data-testid="card-pnl-summary">
          <CardContent className="p-0">
            <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold">P&L</span>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="flex rounded-md border border-primary/30 bg-background p-0.5"
                  onClick={(e) => e.stopPropagation()}
                  data-testid="pnl-period-toggle"
                >
                  {(['week', 'month', 'year'] as const).map(p => (
                    <Button
                      key={p}
                      variant={pnlPeriod === p ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setPnlPeriod(p)}
                      className="h-6 px-2 text-[11px]"
                      data-testid={`button-pnl-period-${p}`}
                    >
                      {p === 'week' ? 'Wk' : p === 'month' ? 'Mo' : 'Yr'}
                    </Button>
                  ))}
                  <Button
                    variant={pnlPeriod === 'custom' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => {
                      setPnlPickerMode('single');
                      setPnlPickingStart(null);
                      setShowPnlPicker(true);
                    }}
                    className="h-6 px-1.5 text-[11px] gap-0.5"
                    data-testid="button-pnl-period-custom"
                  >
                    <Calendar className="w-3 h-3" />
                    {pnlPeriod === 'custom' && pnlCustomRange ? <span className="text-[9px]">{pnlPeriodLabel}</span> : null}
                  </Button>
                </div>
                <div className="flex rounded-md border bg-muted/30 p-0.5" data-testid="pnl-view-toggle">
                  <Button
                    variant={pnlView === 'actual' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setPnlView('actual')}
                    className={cn("text-[11px] h-6 px-2", pnlView !== 'actual' && "text-muted-foreground")}
                    data-testid="button-pnl-actual"
                  >
                    Actual
                  </Button>
                  <Button
                    variant={pnlView === 'goal' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setPnlView('goal')}
                    className={cn("text-[11px] h-6 px-2", pnlView !== 'goal' && "text-muted-foreground")}
                    data-testid="button-pnl-goal"
                  >
                    Goal
                  </Button>
                </div>
              </div>
            </div>

            {pnlView === 'actual' ? (
              <div className="px-3 py-3 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border bg-background shadow-sm px-3 py-2.5" data-testid="pnl-revenue">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-md bg-emerald-500/10 flex-shrink-0">
                        <TrendingUp className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] text-muted-foreground font-medium leading-none mb-1">Revenue</p>
                        <p className="text-base font-bold tabular-nums text-emerald-600 dark:text-emerald-400 leading-tight" data-testid="text-pnl-revenue">
                          ${(actualPnl ? pnl.revenueThisMonth : pnl.revenueThisMonth).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className={cn("rounded-lg border shadow-sm px-3 py-2.5", (actualPnl?.actualEstimatedProfit ?? pnl.estimatedProfit) >= 0 ? "bg-background" : "bg-red-500/5 dark:bg-red-500/10 border-red-200 dark:border-red-800/30")} data-testid="pnl-profit">
                    <div className="flex items-center gap-2">
                      <div className={cn("p-1.5 rounded-md flex-shrink-0", (actualPnl?.actualEstimatedProfit ?? pnl.estimatedProfit) >= 0 ? "bg-emerald-500/10" : "bg-red-500/10")}>
                        {(actualPnl?.actualEstimatedProfit ?? pnl.estimatedProfit) >= 0
                          ? <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          : <ArrowDownRight className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                        }
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] text-muted-foreground font-medium leading-none mb-1">Surplus</p>
                        <p className={cn("text-base font-bold tabular-nums leading-tight", (actualPnl?.actualEstimatedProfit ?? pnl.estimatedProfit) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")} data-testid="text-pnl-profit">
                          {(actualPnl?.actualEstimatedProfit ?? pnl.estimatedProfit) >= 0 ? '' : '-'}${Math.abs(actualPnl?.actualEstimatedProfit ?? pnl.estimatedProfit).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg border bg-background shadow-sm px-2.5 py-2" data-testid="pnl-overhead">
                    <p className="text-[9px] text-muted-foreground font-medium leading-none mb-0.5">Overhead</p>
                    <p className="text-sm font-bold tabular-nums leading-tight">${(actualPnl ? actualPnl.actualOverheadToDate : pnl.overhead).toLocaleString()}</p>
                    {actualPnl && <p className="text-[9px] text-muted-foreground mt-0.5">+${actualPnl.projectedOverheadRemaining.toLocaleString()} rem</p>}
                  </div>
                  <div className="rounded-lg border bg-background shadow-sm px-2.5 py-2" data-testid="pnl-labor">
                    <p className="text-[9px] text-muted-foreground font-medium leading-none mb-0.5">Labor</p>
                    <p className="text-sm font-bold tabular-nums leading-tight">${(actualPnl ? actualPnl.actualLaborToDate : pnl.labor).toLocaleString()}</p>
                    {actualPnl && <p className="text-[9px] text-muted-foreground mt-0.5">+${actualPnl.projectedLaborRemaining.toLocaleString()} rem</p>}
                  </div>
                  <div className="rounded-lg border bg-background shadow-sm px-2.5 py-2" data-testid="pnl-breakeven">
                    <p className="text-[9px] text-muted-foreground font-medium leading-none mb-0.5">Break-even</p>
                    <p className="text-sm font-bold tabular-nums leading-tight">${(actualPnl ? actualPnl.totalActualBreakEven : pnl.breakEven).toLocaleString()}</p>
                  </div>
                </div>
                {actualPnl && (() => {
                  const laborDiff = pnl.labor - (actualPnl.actualLaborToDate + actualPnl.projectedLaborRemaining);
                  if (laborDiff === 0) return null;
                  return (
                    <div className={cn(
                      "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs",
                      laborDiff > 0 ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-red-500/10 text-red-700 dark:text-red-300"
                    )} data-testid="actual-pnl-comparison">
                      {laborDiff > 0 ? (
                        <>
                          <TrendingDown className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>Labor ${laborDiff.toLocaleString()} under projected</span>
                        </>
                      ) : (
                        <>
                          <TrendingUp className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>Labor ${Math.abs(laborDiff).toLocaleString()} over projected</span>
                        </>
                      )}
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="px-3 py-6">
                <div className="flex flex-col items-center justify-center text-center">
                  <div className="p-3 rounded-full bg-muted/50 mb-3">
                    <Lock className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-foreground mb-1">Goal Tracking</p>
                  <p className="text-xs text-muted-foreground max-w-[240px]">Set financial goals and track your progress against them. Coming soon.</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="shadow-md" data-testid="card-pnl-placeholder">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-md bg-muted/50 flex-shrink-0">
                <DollarSign className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">Monthly P&L</p>
                <p className="text-xs text-muted-foreground mt-0.5">Add overhead expenses and crew members to see your numbers.</p>
                <div className="flex gap-2 mt-2">
                  <Link href="/settings/financial">
                    <Button variant="outline" size="sm" className="h-7 text-xs" data-testid="button-pnl-financial">
                      <Settings className="w-3 h-3 mr-1" />
                      Financial
                    </Button>
                  </Link>
                  <Link href="/settings/crew">
                    <Button variant="outline" size="sm" className="h-7 text-xs" data-testid="button-pnl-crew">
                      <HardHat className="w-3 h-3 mr-1" />
                      Crew
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {showPnlPicker && (() => {
        const now = new Date();
        const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const tiles: { key: string; label: string; year: number; month: number }[] = [];
        for (let i = 23; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          tiles.push({
            key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
            label: monthNames[d.getMonth()],
            year: d.getFullYear(),
            month: d.getMonth(),
          });
        }
        const years = [...new Set(tiles.map(t => t.year))];

        const handleMonthTap = (key: string) => {
          if (pnlPickerMode === 'single') {
            setPnlCustomRange({ from: key, to: key });
            setPnlPeriod('custom');
            setPnlPickingStart(null);
            setShowPnlPicker(false);
          } else {
            if (!pnlPickingStart) {
              setPnlPickingStart(key);
            } else {
              const from = pnlPickingStart <= key ? pnlPickingStart : key;
              const to = pnlPickingStart <= key ? key : pnlPickingStart;
              setPnlCustomRange({ from, to });
              setPnlPeriod('custom');
              setPnlPickingStart(null);
              setShowPnlPicker(false);
            }
          }
        };

        const isInRange = (key: string) => {
          if (pnlPickingStart) return key === pnlPickingStart;
          if (pnlCustomRange && pnlPeriod === 'custom') {
            return key >= pnlCustomRange.from && key <= pnlCustomRange.to;
          }
          return false;
        };

        return (
          <div
            className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24"
            onClick={() => { setShowPnlPicker(false); setPnlPickingStart(null); }}
            style={{ overscrollBehavior: 'contain' }}
            data-testid="pnl-month-picker-overlay"
          >
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <div
              className="relative w-full max-w-sm mx-3 rounded-2xl border border-white/20 dark:border-white/10 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300 max-h-[80vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
              style={{ overscrollBehavior: 'contain' }}
              data-testid="pnl-month-picker-modal"
            >
              <div className="px-5 pt-5 pb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-foreground">
                    {pnlPickerMode === 'single' ? 'Select Month' : 'Select Range'}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {pnlPickerMode === 'single'
                      ? 'Tap a month'
                      : pnlPickingStart ? 'Tap end month' : 'Tap start month'}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 rounded-full"
                  onClick={() => { setShowPnlPicker(false); setPnlPickingStart(null); }}
                  data-testid="button-close-pnl-picker"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div className="px-5 pb-3">
                <div className="flex rounded-lg border border-primary/20 bg-muted/30 p-0.5">
                  <button
                    className={cn("flex-1 text-xs font-medium py-1.5 rounded-md transition-all", pnlPickerMode === 'single' ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
                    onClick={() => { setPnlPickerMode('single'); setPnlPickingStart(null); }}
                    data-testid="button-pnl-picker-single"
                  >
                    Month
                  </button>
                  <button
                    className={cn("flex-1 text-xs font-medium py-1.5 rounded-md transition-all", pnlPickerMode === 'range' ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
                    onClick={() => { setPnlPickerMode('range'); setPnlPickingStart(null); }}
                    data-testid="button-pnl-picker-range"
                  >
                    Custom Range
                  </button>
                </div>
              </div>

              <div className="px-5 pb-5 space-y-4">
                {years.map(year => (
                  <div key={year}>
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-2">{year}</p>
                    <div className="grid grid-cols-6 gap-1.5">
                      {tiles.filter(t => t.year === year).map(t => {
                        const selected = isInRange(t.key);
                        const isStart = t.key === pnlPickingStart;
                        const isCurrent = t.month === now.getMonth() && t.year === now.getFullYear();
                        return (
                          <button
                            key={t.key}
                            onClick={() => handleMonthTap(t.key)}
                            className={cn(
                              "relative py-2 px-1 rounded-lg text-xs font-medium transition-all duration-150",
                              "hover:scale-105 active:scale-95",
                              selected
                                ? "bg-primary text-primary-foreground shadow-md"
                                : isStart
                                  ? "bg-primary/70 text-primary-foreground ring-2 ring-primary ring-offset-1"
                                  : isCurrent
                                    ? "bg-muted/80 text-foreground ring-1 ring-primary/30"
                                    : "bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                            )}
                            data-testid={`pnl-month-tile-${t.key}`}
                          >
                            {t.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {pnlPickerMode === 'range' && pnlPickingStart && (
                <div className="px-5 pb-4">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/10">
                    <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    <span className="text-xs text-muted-foreground">
                      From <strong className="text-foreground">{(() => { const [y,m] = pnlPickingStart.split('-').map(Number); return `${monthNames[m-1]} ${y}`; })()}</strong> — tap end month
                    </span>
                  </div>
                </div>
              )}

              {pnlCustomRange && !pnlPickingStart && (
                <div className="px-5 pb-4 flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs"
                    onClick={() => {
                      setPnlCustomRange(null);
                      setPnlPeriod('month');
                      setShowPnlPicker(false);
                    }}
                    data-testid="button-clear-pnl-custom"
                  >
                    Clear
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 text-xs"
                    onClick={() => setShowPnlPicker(false)}
                    data-testid="button-apply-pnl-custom"
                  >
                    Done
                  </Button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={Users}
          label="Conversion Rate"
          value={`${conversion.conversionRate}%`}
          sub={`${conversion.totalClients} clients from ${conversion.totalLeads} leads`}
          color="text-emerald-600 dark:text-emerald-400"
          bg="bg-emerald-500/10"
          testId="kpi-conversion"
        />
        <KpiCard
          icon={FileSignature}
          label="Close Rate"
          value={`${proposals.closeRate}%`}
          sub={`${proposals.accepted} accepted of ${proposals.sent} sent`}
          color="text-blue-600 dark:text-blue-400"
          bg="bg-blue-500/10"
          testId="kpi-close-rate"
        />
        <KpiCard
          icon={Clock}
          label="Avg Time to Sign"
          value={`${timeToSign.avg} days`}
          sub={`Median: ${timeToSign.median} days (${timeToSign.total} signed)`}
          color="text-amber-600 dark:text-amber-400"
          bg="bg-amber-500/10"
          testId="kpi-time-to-sign"
        />
        <KpiCard
          icon={Receipt}
          label="Outstanding"
          value={`$${Math.round(outstanding.totalAmount / 100).toLocaleString()}`}
          sub={`${outstanding.invoices} unpaid invoices`}
          color="text-orange-600 dark:text-orange-400"
          bg="bg-orange-500/10"
          testId="kpi-outstanding"
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={Zap}
          label="New Leads This Week"
          value={newLeads.thisWeek.toString()}
          sub={`${newLeads.thisMonth} this month`}
          color="text-violet-600 dark:text-violet-400"
          bg="bg-violet-500/10"
          testId="kpi-new-leads"
        />
        <KpiCard
          icon={TrendingUp}
          label="Revenue This Month"
          value={`$${pnl.revenueThisMonth.toLocaleString()}`}
          sub={`YTD: $${pnl.revenueYTD.toLocaleString()}`}
          color="text-emerald-600 dark:text-emerald-400"
          bg="bg-emerald-500/10"
          testId="kpi-revenue"
        />
        {hasPnlData ? (
          <>
            <KpiCard
              icon={Target}
              label="Break-even Progress"
              value={`${pnl.breakEvenProgress}%`}
              sub={pnl.remainingToBreakEven > 0 ? `$${pnl.remainingToBreakEven.toLocaleString()} remaining` : 'Target hit!'}
              color="text-primary"
              bg="bg-primary/10"
              testId="kpi-breakeven"
            />
            <KpiCard
              icon={pnl.estimatedProfit >= 0 ? ArrowUpRight : ArrowDownRight}
              label="Monthly Surplus"
              value={`${pnl.estimatedProfit >= 0 ? '' : '-'}$${Math.abs(pnl.estimatedProfit).toLocaleString()}`}
              color={pnl.estimatedProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}
              bg={pnl.estimatedProfit >= 0 ? "bg-emerald-500/10" : "bg-red-500/10"}
              testId="kpi-profit"
            />
          </>
        ) : (
          <>
            <Card data-testid="kpi-breakeven-placeholder">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-md flex-shrink-0 bg-muted/50">
                    <Target className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium leading-none mb-1">Break-even</p>
                    <p className="text-xs text-muted-foreground mt-1">Add expenses & crew to track</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card data-testid="kpi-profit-placeholder">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-md flex-shrink-0 bg-muted/50">
                    <DollarSign className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium leading-none mb-1">Surplus</p>
                    <p className="text-xs text-muted-foreground mt-1">Add expenses & crew to track</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card data-testid="chart-revenue-trends">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              Revenue Trends (12 months)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueTrends}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" className="text-[10px]" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis className="text-[10px]" tick={{ fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v) => `$${(v/100).toLocaleString()}`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Revenue (cents)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <SourceBreakdownChart sourceBreakdown={sourceBreakdown || []} leadSources={leadSources} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card data-testid="chart-time-to-sign">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              Time to Sign
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {timeToSign.total > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={timeToSign.speedSegments}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" className="text-[10px]" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis className="text-[10px]" tick={{ fill: 'hsl(var(--muted-foreground))' }} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" fill="hsl(220 70% 55%)" radius={[4, 4, 0, 0]} name="Documents" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <Clock className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-40" />
                    <p className="text-sm text-muted-foreground">No signed documents yet</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card data-testid="chart-pipeline">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" />
                Pipeline by Stage
              </CardTitle>
              <Badge variant="secondary" className="text-xs" data-testid="pipeline-total">
                {pipeline.totalActive} active
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {pipeline.stages.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pipeline.stages} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis type="number" className="text-[10px]" tick={{ fill: 'hsl(var(--muted-foreground))' }} allowDecimals={false} />
                    <YAxis type="category" dataKey="label" className="text-[10px]" tick={{ fill: 'hsl(var(--muted-foreground))' }} width={100} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" fill="hsl(150 60% 45%)" radius={[0, 4, 4, 0]} name="Projects" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <BarChart3 className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-40" />
                    <p className="text-sm text-muted-foreground">No active projects</p>
                  </div>
                </div>
              )}
            </div>
            {pipeline.avgDaysInStage > 0 && (
              <p className="text-xs text-muted-foreground mt-2 text-center" data-testid="text-avg-days-stage">
                Average {pipeline.avgDaysInStage} days in current stage
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <LeadIntelligenceSection />
    </div>
  );
}

function CompletedTab() {
  const { data: completed, isLoading } = useQuery<any>({ queryKey: ['/api/metrics/completed'] });

  if (isLoading && !completed) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" data-testid="loading-completed" />
      </div>
    );
  }

  if (!completed || completed.projectCount === 0) {
    return (
      <div className="space-y-6">
        <Card data-testid="card-no-completed">
          <CardContent className="p-8">
            <div className="flex flex-col items-center justify-center text-center">
              <CheckCircle2 className="w-12 h-12 text-muted-foreground opacity-30 mb-4" />
              <p className="text-sm font-medium text-foreground mb-1">No completed projects yet</p>
              <p className="text-xs text-muted-foreground max-w-sm">
                Once you mark projects as completed, you'll see actual job costing data here with real revenue, labor, material costs, and expenses.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { totals, projects, avgProjectValue, avgMargin, avgDaysToComplete, projectCount } = completed;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={CheckCircle2}
          label="Completed Projects"
          value={projectCount.toString()}
          sub={`Avg ${avgDaysToComplete} days to complete`}
          color="text-emerald-600 dark:text-emerald-400"
          bg="bg-emerald-500/10"
          testId="kpi-completed-count"
        />
        <KpiCard
          icon={DollarSign}
          label="Total Revenue"
          value={`$${totals.revenue.toLocaleString()}`}
          sub={`Avg $${avgProjectValue.toLocaleString()} per project`}
          color="text-blue-600 dark:text-blue-400"
          bg="bg-blue-500/10"
          testId="kpi-completed-revenue"
        />
        <KpiCard
          icon={totals.grossProfit >= 0 ? ArrowUpRight : ArrowDownRight}
          label="Gross Profit"
          value={`${totals.grossProfit >= 0 ? '' : '-'}$${Math.abs(totals.grossProfit).toLocaleString()}`}
          sub={`${totals.grossMargin}% margin`}
          color={totals.grossProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}
          bg={totals.grossProfit >= 0 ? "bg-emerald-500/10" : "bg-red-500/10"}
          testId="kpi-completed-profit"
        />
        <KpiCard
          icon={Target}
          label="Avg Margin"
          value={`${avgMargin}%`}
          sub={`Across ${projectCount} projects`}
          color="text-primary"
          bg="bg-primary/10"
          testId="kpi-completed-margin"
        />
      </div>

      <Card data-testid="card-completed-pnl">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-primary" />
            Completed Projects P&L
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <div className="text-center p-3 rounded-md bg-emerald-500/5 dark:bg-emerald-500/10" data-testid="completed-pnl-revenue">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Revenue</p>
              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">${totals.revenue.toLocaleString()}</p>
            </div>
            <div className="text-center p-3 rounded-md bg-muted/50" data-testid="completed-pnl-labor">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Labor</p>
              <p className="text-lg font-bold">${totals.laborCost.toLocaleString()}</p>
            </div>
            <div className="text-center p-3 rounded-md bg-muted/50" data-testid="completed-pnl-material">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Materials</p>
              <p className="text-lg font-bold">${totals.materialCost.toLocaleString()}</p>
            </div>
            <div className="text-center p-3 rounded-md bg-muted/50" data-testid="completed-pnl-expenses">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Expenses</p>
              <p className="text-lg font-bold">${totals.expenses.toLocaleString()}</p>
            </div>
            <div className={cn("text-center p-3 rounded-md", totals.grossProfit >= 0 ? "bg-emerald-500/5 dark:bg-emerald-500/10" : "bg-red-500/5 dark:bg-red-500/10")} data-testid="completed-pnl-profit">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Gross Profit</p>
              <p className={cn("text-lg font-bold", totals.grossProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                {totals.grossProfit >= 0 ? '' : '-'}${Math.abs(totals.grossProfit).toLocaleString()}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {projects.length > 0 && (
        <Card data-testid="card-completed-breakdown">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" />
                Project Profitability
              </CardTitle>
              <Badge variant="secondary" className="text-xs">{projectCount} projects</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={projects.slice(0, 10)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" className="text-[10px]" tick={{ fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v) => `$${v.toLocaleString()}`} />
                  <YAxis type="category" dataKey="title" className="text-[10px]" tick={{ fill: 'hsl(var(--muted-foreground))' }} width={140} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="revenue" fill="hsl(150 60% 45%)" radius={[0, 4, 4, 0]} name="Revenue" stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {projects.length > 0 && (
        <Card data-testid="card-completed-table">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              Project Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
              <table className="w-full text-sm" data-testid="table-completed-projects">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Project</th>
                    <th className="text-right py-2 px-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Revenue</th>
                    <th className="text-right py-2 px-2 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Labor</th>
                    <th className="text-right py-2 px-2 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Materials</th>
                    <th className="text-right py-2 px-2 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden md:table-cell">Expenses</th>
                    <th className="text-right py-2 px-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Profit</th>
                    <th className="text-right py-2 pl-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((proj: any) => (
                    <tr key={proj.id} className="border-b border-border/50 last:border-0" data-testid={`row-project-${proj.id}`}>
                      <td className="py-2.5 pr-4">
                        <span className="font-medium text-foreground truncate block max-w-[200px]" title={proj.title}>
                          {proj.title}
                        </span>
                        {proj.daysToComplete > 0 && (
                          <span className="text-xs text-muted-foreground">{proj.daysToComplete} days</span>
                        )}
                      </td>
                      <td className="text-right py-2.5 px-2 tabular-nums font-medium text-emerald-600 dark:text-emerald-400">${proj.revenue.toLocaleString()}</td>
                      <td className="text-right py-2.5 px-2 tabular-nums text-muted-foreground hidden sm:table-cell">${proj.laborCost.toLocaleString()}</td>
                      <td className="text-right py-2.5 px-2 tabular-nums text-muted-foreground hidden sm:table-cell">${proj.materialCost.toLocaleString()}</td>
                      <td className="text-right py-2.5 px-2 tabular-nums text-muted-foreground hidden md:table-cell">${proj.expenses.toLocaleString()}</td>
                      <td className={cn("text-right py-2.5 px-2 tabular-nums font-medium", proj.grossProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                        {proj.grossProfit >= 0 ? '' : '-'}${Math.abs(proj.grossProfit).toLocaleString()}
                      </td>
                      <td className="text-right py-2.5 pl-2">
                        <Badge
                          variant={proj.grossMargin >= 30 ? "default" : proj.grossMargin >= 15 ? "secondary" : "destructive"}
                          className="text-xs tabular-nums"
                          data-testid={`margin-${proj.id}`}
                        >
                          {proj.grossMargin}%
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function Metrics() {
  const [activeTab, setActiveTab] = useState<'overall' | 'completed'>('overall');
  const { data: metrics, isLoading, error } = useQuery<any>({ queryKey: ['/api/metrics'] });

  if (isLoading && !metrics) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary" data-testid="loading-spinner" />
      </div>
    );
  }

  if (!isLoading && (error || !metrics)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">Unable to load metrics</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="space-y-6 p-4 pb-24 lg:p-6 lg:pb-24 max-w-[1400px] mx-auto w-full animate-in fade-in duration-500">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl lg:text-3xl font-display font-bold text-foreground" data-testid="text-metrics-title">Business Metrics</h1>
            <p className="text-muted-foreground mt-0.5 text-sm">Track your performance, conversions, and revenue</p>
          </div>
          <div className="flex rounded-md border bg-muted/30 p-0.5" data-testid="metrics-tab-switcher">
            <Button
              variant={activeTab === 'overall' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('overall')}
              className={cn("gap-1.5", activeTab !== 'overall' && "text-muted-foreground")}
              data-testid="tab-overall"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Overall
            </Button>
            <Button
              variant={activeTab === 'completed' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('completed')}
              className={cn("gap-1.5", activeTab !== 'completed' && "text-muted-foreground")}
              data-testid="tab-completed"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Completed
            </Button>
          </div>
        </div>

        {activeTab === 'overall' ? (
          <OverallTab metrics={metrics} />
        ) : (
          <CompletedTab />
        )}
      </div>
    </div>
  );
}
