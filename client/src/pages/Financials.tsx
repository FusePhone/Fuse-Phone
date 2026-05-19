import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, DollarSign, ShieldCheck, Car, Wrench, Megaphone, Briefcase, Monitor, MoreHorizontal, Calculator, Save, TrendingUp, Users, ArrowUpRight, ArrowDownRight, Target, Clock } from "lucide-react";
import type { OverheadExpense } from "@shared/schema";

const CATEGORIES = [
  { key: "insurance", label: "Insurance", icon: ShieldCheck },
  { key: "vehicle", label: "Vehicle & Fuel", icon: Car },
  { key: "operations", label: "Operations", icon: Wrench },
  { key: "marketing", label: "Marketing", icon: Megaphone },
  { key: "professional", label: "Professional Services", icon: Briefcase },
  { key: "software", label: "Software & Subscriptions", icon: Monitor },
  { key: "other", label: "Other", icon: MoreHorizontal },
] as const;

const DEFAULT_EXPENSES = [
  { expenseName: "General Liability Insurance", amount: 0, frequency: "yearly", category: "insurance" },
  { expenseName: "Workers Comp Insurance", amount: 0, frequency: "yearly", category: "insurance" },
  { expenseName: "Commercial Auto Insurance", amount: 0, frequency: "yearly", category: "insurance" },
  { expenseName: "Vehicle Payment", amount: 0, frequency: "monthly", category: "vehicle" },
  { expenseName: "Fuel", amount: 0, frequency: "monthly", category: "vehicle" },
  { expenseName: "Equipment / Tools Replacement", amount: 0, frequency: "monthly", category: "operations" },
  { expenseName: "Office Supplies", amount: 0, frequency: "monthly", category: "operations" },
  { expenseName: "Storage / Warehouse", amount: 0, frequency: "monthly", category: "operations" },
  { expenseName: "Marketing / Ads", amount: 0, frequency: "monthly", category: "marketing" },
  { expenseName: "Accounting / CPA", amount: 0, frequency: "monthly", category: "professional" },
  { expenseName: "Phone / Internet", amount: 0, frequency: "monthly", category: "software" },
  { expenseName: "Software Subscriptions", amount: 0, frequency: "monthly", category: "software" },
];

const NON_PRODUCTION_ROLES: Record<string, string> = {
  va: "Virtual Assistant",
  secretary: "Secretary / Office",
  sales: "Sales",
  estimator: "Estimator",
  other: "Other",
};

const STANDARD_HOURS_PER_MONTH = 40 * 4.33;

function calculateMonthlyEquivalent(amount: number, frequency: string): number {
  switch (frequency) {
    case "weekly": return amount * 4.33;
    case "quarterly": return amount / 3;
    case "yearly": return amount / 12;
    case "monthly":
    default: return amount;
  }
}

interface LocalExpense {
  id?: number;
  expenseName: string;
  category: string;
  amount: number;
  frequency: string;
  dirty?: boolean;
  isNew?: boolean;
}

interface ProductionEmployee {
  name: string;
  hourlyRate: number;
  payrollBurden: number;
  workersComp: number;
  benefitsPerHour: number;
}

interface NonProductionEmployee {
  name: string;
  role: string;
  hourlyRate: number;
}

export default function Financials() {
  const { toast } = useToast();

  const { data, isLoading } = useQuery<{ settings: any; expenses: OverheadExpense[] }>({
    queryKey: ["/api/financial-settings"],
  });

  const [targetNetProfit, setTargetNetProfit] = useState("20");
  const [viewMode, setViewMode] = useState<"monthly" | "yearly">("monthly");
  const [localExpenses, setLocalExpenses] = useState<LocalExpense[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  const [productionEmployees, setProductionEmployees] = useState<ProductionEmployee[]>([
    { name: "Employee 1", hourlyRate: 20, payrollBurden: 12, workersComp: 18, benefitsPerHour: 0 },
  ]);

  const [nonProductionEmployees, setNonProductionEmployees] = useState<NonProductionEmployee[]>([]);

  useEffect(() => {
    if (data?.expenses && data.expenses.length > 0) {
      setLocalExpenses(data.expenses.map(e => ({
        id: e.id,
        expenseName: e.expenseName,
        category: e.category,
        amount: e.amount,
        frequency: e.frequency,
      })));
    } else if (data && (!data.expenses || data.expenses.length === 0)) {
      setLocalExpenses(DEFAULT_EXPENSES.map(e => ({ ...e, isNew: true, dirty: true })));
      setHasChanges(true);
    }
  }, [data]);

  const crewSize = productionEmployees.length;

  const calculatedTrueLaborCost = useMemo(() => {
    if (productionEmployees.length === 0) return 0;
    const totalCost = productionEmployees.reduce((sum, emp) => {
      const burden = emp.hourlyRate * (emp.payrollBurden / 100);
      const wc = emp.hourlyRate * (emp.workersComp / 100);
      return sum + emp.hourlyRate + burden + wc + emp.benefitsPerHour;
    }, 0);
    return totalCost / productionEmployees.length;
  }, [productionEmployees]);

  const averageHourlyRate = useMemo(() => {
    if (productionEmployees.length === 0) return 0;
    return productionEmployees.reduce((sum, emp) => sum + emp.hourlyRate, 0) / productionEmployees.length;
  }, [productionEmployees]);

  const targetNetProfitValue = (parseFloat(targetNetProfit) || 0) / 100;

  const nonProdMonthlyTotal = useMemo(() => {
    return nonProductionEmployees.reduce((sum, emp) => {
      return sum + (emp.hourlyRate * STANDARD_HOURS_PER_MONTH);
    }, 0);
  }, [nonProductionEmployees]);

  const expenseMonthlyTotal = useMemo(() => {
    return localExpenses.reduce((sum, exp) => {
      return sum + calculateMonthlyEquivalent(exp.amount, exp.frequency);
    }, 0);
  }, [localExpenses]);

  const totalMonthlyOverhead = expenseMonthlyTotal + nonProdMonthlyTotal;

  const overheadPerHour = useMemo(() => {
    if (crewSize === 0) return 0;
    return totalMonthlyOverhead / (160 * crewSize);
  }, [totalMonthlyOverhead, crewSize]);

  const autoSellRate = useMemo(() => {
    const netPct = targetNetProfitValue;
    if (netPct >= 1 || netPct < 0) return 0;
    if (calculatedTrueLaborCost <= 0 && overheadPerHour <= 0) return 0;
    return (calculatedTrueLaborCost + overheadPerHour) / (1 - netPct);
  }, [calculatedTrueLaborCost, overheadPerHour, targetNetProfitValue]);

  const monthlyLaborCost = useMemo(() => {
    if (crewSize === 0 || calculatedTrueLaborCost <= 0) return 0;
    return calculatedTrueLaborCost * 160 * crewSize;
  }, [calculatedTrueLaborCost, crewSize]);

  const monthlyBreakEven = totalMonthlyOverhead + monthlyLaborCost;

  const monthlyRevenuePotential = useMemo(() => {
    if (crewSize === 0 || autoSellRate <= 0) return 0;
    return autoSellRate * 160 * crewSize;
  }, [autoSellRate, crewSize]);

  const monthlyNetProfit = monthlyRevenuePotential - monthlyBreakEven;

  const profitPerHour = autoSellRate - calculatedTrueLaborCost - overheadPerHour;

  const totalAvailableHours = 160 * crewSize;

  const hoursToBreakEven = useMemo(() => {
    if (autoSellRate <= 0) return 0;
    return monthlyBreakEven / autoSellRate;
  }, [monthlyBreakEven, autoSellRate]);

  const actualNetMargin = useMemo(() => {
    if (monthlyRevenuePotential <= 0) return 0;
    return (monthlyNetProfit / monthlyRevenuePotential) * 100;
  }, [monthlyNetProfit, monthlyRevenuePotential]);

  const grossMarginPercent = useMemo(() => {
    if (autoSellRate <= 0) return 0;
    return ((autoSellRate - calculatedTrueLaborCost) / autoSellRate) * 100;
  }, [autoSellRate, calculatedTrueLaborCost]);

  const netProfitColorClass = actualNetMargin >= 20 ? "text-emerald-600 dark:text-emerald-400" : actualNetMargin >= 10 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";
  const netProfitBgClass = actualNetMargin >= 20 ? "bg-emerald-600 dark:bg-emerald-400" : actualNetMargin >= 10 ? "bg-amber-600 dark:bg-amber-400" : "bg-red-600 dark:bg-red-400";

  const m = viewMode === "yearly" ? 12 : 1;
  const periodLabel = viewMode === "yearly" ? "yr" : "mo";
  const displayOverhead = totalMonthlyOverhead * m;
  const displayLabor = monthlyLaborCost * m;
  const displayBreakEven = monthlyBreakEven * m;
  const displayRevenue = monthlyRevenuePotential * m;
  const displayProfit = monthlyNetProfit * m;
  const displayAvailableHours = totalAvailableHours * m;
  const displayBreakEvenHours = hoursToBreakEven * m;

  const updateProductionEmployee = (index: number, field: keyof ProductionEmployee, value: any) => {
    setProductionEmployees(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: typeof value === 'string' ? (parseFloat(value) || 0) : value };
      return updated;
    });
  };

  const addProductionEmployee = () => {
    setProductionEmployees(prev => [
      ...prev,
      { name: `Employee ${prev.length + 1}`, hourlyRate: 20, payrollBurden: 12, workersComp: 18, benefitsPerHour: 0 },
    ]);
  };

  const removeProductionEmployee = (index: number) => {
    setProductionEmployees(prev => prev.filter((_, i) => i !== index));
  };

  const addNonProductionEmployee = () => {
    setNonProductionEmployees(prev => [
      ...prev,
      { name: "", role: "va", hourlyRate: 0 },
    ]);
  };

  const updateNonProductionEmployee = (index: number, field: keyof NonProductionEmployee, value: any) => {
    setNonProductionEmployees(prev => {
      const updated = [...prev];
      if (field === 'hourlyRate') {
        updated[index] = { ...updated[index], [field]: parseFloat(value) || 0 };
      } else {
        updated[index] = { ...updated[index], [field]: value };
      }
      return updated;
    });
  };

  const removeNonProductionEmployee = (index: number) => {
    setNonProductionEmployees(prev => prev.filter((_, i) => i !== index));
  };

  const updateExpense = (index: number, field: keyof LocalExpense, value: any) => {
    setLocalExpenses(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value, dirty: true };
      return updated;
    });
    setHasChanges(true);
  };

  const addExpense = (category: string) => {
    setLocalExpenses(prev => [
      ...prev,
      { expenseName: "", category, amount: 0, frequency: "monthly", isNew: true, dirty: true },
    ]);
    setHasChanges(true);
  };

  const removeExpense = (index: number) => {
    const exp = localExpenses[index];
    if (exp.id) {
      deleteMutation.mutate(exp.id);
    }
    setLocalExpenses(prev => prev.filter((_, i) => i !== index));
    setHasChanges(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const toSave = localExpenses.filter(e => e.dirty);
      if (toSave.length === 0) return;

      await apiRequest("POST", "/api/financial-settings/expenses/bulk", {
        expenses: toSave.map(e => ({
          id: e.id,
          expenseName: e.expenseName,
          category: e.category,
          amount: e.amount,
          frequency: e.frequency,
        })),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/financial-settings"] });
      setHasChanges(false);
      toast({ title: "Saved", description: "Your overhead expenses have been saved." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save expenses.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/financial-settings/expenses/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/financial-settings"] });
    },
  });

  const groupedExpenses = useMemo(() => {
    const groups: Record<string, (LocalExpense & { originalIndex: number })[]> = {};
    for (const cat of CATEGORIES) {
      groups[cat.key] = [];
    }
    localExpenses.forEach((exp, idx) => {
      const key = groups[exp.category] ? exp.category : "other";
      groups[key].push({ ...exp, originalIndex: idx });
    });
    return groups;
  }, [localExpenses]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Net Profit & Hourly Rate Calculator</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Know your numbers. Enter your employees and expenses, set your target net profit, and see what to charge per hour.
          </p>
        </div>
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={!hasChanges || saveMutation.isPending}
          data-testid="button-save-expenses"
        >
          {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Save Expenses
        </Button>
      </div>

      <Card data-testid="card-summary">
        <CardContent className="px-3 py-2.5">
          <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
            <div className="flex items-center gap-1.5" data-testid="metric-target-profit">
              <Target className={cn("w-3.5 h-3.5 shrink-0", netProfitColorClass)} />
              <span className="text-[10px] text-muted-foreground uppercase">Net Profit</span>
              <span className={cn("text-sm font-bold tabular-nums", netProfitColorClass)}>{targetNetProfit}%</span>
              <span className={cn("inline-block w-2 h-2 rounded-full shrink-0", netProfitBgClass)} />
              <InfoTooltip text="Your target net profit percentage after ALL costs (labor + overhead). Industry benchmarks: below 10% needs attention, 10-19% okay, 20%+ is healthy." />
            </div>
            <div className="inline-flex items-center rounded-md border text-xs" data-testid="toggle-view-mode">
              <button
                type="button"
                onClick={() => setViewMode("monthly")}
                className={`px-2.5 py-1 rounded-l-md transition-colors ${viewMode === "monthly" ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground"}`}
                data-testid="button-view-monthly"
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setViewMode("yearly")}
                className={`px-2.5 py-1 rounded-r-md transition-colors ${viewMode === "yearly" ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground"}`}
                data-testid="button-view-yearly"
              >
                Yearly
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <div data-testid="metric-overhead" className="flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-primary shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase leading-none flex items-center gap-1">Overhead/{periodLabel} <InfoTooltip text="Your total fixed business costs (insurance, vehicle, marketing, office, etc.) that you pay regardless of how many jobs you do." /></p>
                <p className="text-sm font-bold tabular-nums leading-tight">${displayOverhead.toLocaleString("en-US", { maximumFractionDigits: 0 })}</p>
              </div>
            </div>
            <div data-testid="metric-labor" className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-primary shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase leading-none flex items-center gap-1">Labor/{periodLabel} <InfoTooltip text="Your total crew labor cost including wages, employer taxes, workers comp insurance, and any benefits you provide. This is what it actually costs you to have your crew working." /></p>
                <p className="text-sm font-bold tabular-nums leading-tight">${displayLabor.toLocaleString("en-US", { maximumFractionDigits: 0 })} <span className="text-[10px] font-normal text-muted-foreground">{crewSize} crew</span></p>
              </div>
            </div>
            <div data-testid="metric-sell-rate" className="flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-primary shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase leading-none flex items-center gap-1">Sell Rate <InfoTooltip text="What you charge per labor hour. Calculated as: (Labor Cost + Overhead/hr) / (1 - Net Profit %). This covers your labor, overhead, AND builds in your net profit." /></p>
                <p className="text-sm font-bold tabular-nums text-primary leading-tight">${autoSellRate.toFixed(2)}<span className="text-[10px] font-normal text-muted-foreground">/hr</span></p>
              </div>
            </div>
            <div data-testid="metric-break-even" className="flex items-center gap-1.5">
              <ArrowDownRight className="w-3.5 h-3.5 text-destructive shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase leading-none flex items-center gap-1">Break-even <InfoTooltip text="The minimum revenue you need to cover all costs (overhead + labor) before making any profit. Below this number, you're losing money." /></p>
                <p className="text-sm font-bold tabular-nums text-destructive leading-tight">${displayBreakEven.toLocaleString("en-US", { maximumFractionDigits: 0 })}<span className="text-[10px] font-normal text-muted-foreground">/{periodLabel}</span></p>
              </div>
            </div>
          </div>
          <div className={`flex items-center justify-between gap-2 mt-2 px-2.5 py-1.5 rounded-md ${displayProfit >= 0 ? 'bg-primary/5 dark:bg-primary/10' : 'bg-destructive/5 dark:bg-destructive/10'}`}>
            <div className="flex items-center gap-1" data-testid="metric-net-profit">
              {displayProfit >= 0 ? <ArrowUpRight className="w-3.5 h-3.5 text-primary" /> : <ArrowDownRight className="w-3.5 h-3.5 text-destructive" />}
              <span className="text-[10px] text-muted-foreground">Profit</span>
              <span className={`text-sm font-bold tabular-nums ${displayProfit >= 0 ? "text-primary" : "text-destructive"}`}>
                {displayProfit >= 0 ? "" : "-"}${Math.abs(displayProfit).toLocaleString("en-US", { maximumFractionDigits: 0 })}<span className="text-[10px] font-normal text-muted-foreground">/{periodLabel}</span>
              </span>
              <InfoTooltip text="Your projected net profit after all costs. This is revenue minus overhead minus labor. A positive number means you're making money." />
            </div>
            <div className="flex items-center gap-1" data-testid="metric-profit-hr">
              <span className="text-[10px] text-muted-foreground">{actualNetMargin.toFixed(1)}%</span>
              <span className={`text-xs font-semibold tabular-nums ${profitPerHour >= 0 ? "text-primary" : "text-destructive"}`}>
                {profitPerHour >= 0 ? "" : "-"}${Math.abs(profitPerHour).toFixed(2)}<span className="text-[10px] font-normal text-muted-foreground">/hr</span>
              </span>
            </div>
          </div>
          <div className="mt-1.5 px-2.5 py-1.5 rounded-md bg-muted/50 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1" data-testid="metric-hours-break-even">
                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">Break-even at</span>
                <span className="text-sm font-bold tabular-nums">{displayBreakEvenHours.toFixed(0)}<span className="text-[10px] font-normal text-muted-foreground"> hrs/{periodLabel}</span></span>
                <InfoTooltip text="How many billable hours your crew needs to work just to cover all your costs. After this many hours, every additional hour is pure profit." />
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1" data-testid="metric-hours-sell-all">
                <Target className="w-3.5 h-3.5 text-primary" />
                <span className="text-[10px] text-muted-foreground">Sell all {displayAvailableHours} hrs</span>
                <InfoTooltip text="If your crew works and bills every available hour at your sell rate, this is your maximum potential revenue." />
              </div>
              <span className="text-sm font-bold tabular-nums text-primary" data-testid="metric-sell-all-revenue">
                ${displayRevenue.toLocaleString("en-US", { maximumFractionDigits: 0 })}<span className="text-[10px] font-normal text-muted-foreground">/{periodLabel}</span>
              </span>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t space-y-2.5" data-testid="card-margin">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <Label className="text-xs text-muted-foreground">Net Profit</Label>
                <InfoTooltip text="Your target net profit percentage after ALL costs (labor + overhead). The sell rate is calculated to achieve this. Industry benchmark: 20-35% is healthy." />
              </div>
              <span className={cn("text-lg font-bold tabular-nums", netProfitColorClass)} data-testid="text-net-profit-pct">{targetNetProfit}%</span>
            </div>
            <Slider
              value={[parseFloat(targetNetProfit) || 0]}
              onValueChange={([v]) => setTargetNetProfit(v.toString())}
              min={0}
              max={60}
              step={1}
              data-testid="slider-target-net-profit"
            />
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>0%</span>
              <span>20% target</span>
              <span>60%</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-0.5 text-center">
                <Label className="text-[10px] text-muted-foreground uppercase">Labor Cost</Label>
                <p className="text-sm font-medium tabular-nums">${calculatedTrueLaborCost.toFixed(2)}<span className="text-[10px] font-normal text-muted-foreground">/hr</span></p>
              </div>
              <div className="space-y-0.5 text-center">
                <Label className="text-[10px] text-muted-foreground uppercase">Sell Rate</Label>
                <p className="text-sm font-bold tabular-nums text-primary" data-testid="text-sell-rate">${autoSellRate.toFixed(2)}<span className="text-[10px] font-normal text-muted-foreground">/hr</span></p>
              </div>
              <div className="space-y-0.5 text-center">
                <Label className="text-[10px] text-muted-foreground uppercase">Gross Margin</Label>
                <p className={cn("text-sm font-bold tabular-nums", grossMarginPercent >= 45 ? "text-emerald-600 dark:text-emerald-400" : grossMarginPercent >= 30 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400")}>{grossMarginPercent.toFixed(1)}%</p>
              </div>
            </div>
            <div className="rounded-md bg-muted/50 p-2">
              <p className="text-[10px] text-muted-foreground text-center">
                (${calculatedTrueLaborCost.toFixed(2)} labor + ${overheadPerHour.toFixed(2)} overhead) / (1 - {targetNetProfit}%) = ${autoSellRate.toFixed(2)}/hr
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-production-employees">
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            <CardTitle>Production Employees</CardTitle>
          </div>
          <Button size="sm" variant="ghost" onClick={addProductionEmployee} data-testid="button-add-production-employee">
            <Plus className="w-4 h-4 mr-1" />
            Add
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Your team members who do the actual work on job sites. Enter each employee's hourly wage and burden rates to calculate your true labor cost per hour.
          </p>

          {productionEmployees.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Add at least one production employee to calculate labor costs</p>
            </div>
          ) : (
            <div className="space-y-3">
              {productionEmployees.map((emp, index) => {
                const trueCost = emp.hourlyRate * (1 + emp.payrollBurden / 100 + emp.workersComp / 100) + emp.benefitsPerHour;
                return (
                  <div key={index} className="rounded-md border p-3 space-y-3" data-testid={`production-employee-${index}`}>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <Input
                        value={emp.name}
                        onChange={(e) => {
                          setProductionEmployees(prev => {
                            const updated = [...prev];
                            updated[index] = { ...updated[index], name: e.target.value };
                            return updated;
                          });
                        }}
                        placeholder="Employee name"
                        className="max-w-[200px]"
                        data-testid={`input-prod-name-${index}`}
                      />
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" data-testid={`badge-true-cost-${index}`}>
                          True cost: ${trueCost.toFixed(2)}/hr
                        </Badge>
                        <Button size="icon" variant="ghost" onClick={() => removeProductionEmployee(index)} data-testid={`button-remove-prod-${index}`}>
                          <Trash2 className="w-4 h-4 text-muted-foreground" />
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Hourly Rate ($)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={emp.hourlyRate || ""}
                          onChange={(e) => updateProductionEmployee(index, "hourlyRate", e.target.value)}
                          placeholder="0.00"
                          data-testid={`input-prod-rate-${index}`}
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1">
                          <Label className="text-xs text-muted-foreground">Payroll Burden %</Label>
                          <InfoTooltip text="Employer-paid taxes on top of wages (Social Security, Medicare, unemployment). Typically 10-15% of what you pay them." />
                        </div>
                        <Input
                          type="number"
                          step="0.1"
                          min="0"
                          value={emp.payrollBurden || ""}
                          onChange={(e) => updateProductionEmployee(index, "payrollBurden", e.target.value)}
                          placeholder="12"
                          data-testid={`input-prod-burden-${index}`}
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1">
                          <Label className="text-xs text-muted-foreground">Workers Comp %</Label>
                          <InfoTooltip text="The insurance you pay to cover on-the-job injuries. It's a percentage of wages and varies by trade — painting is typically 8-20%, roofing 15-30%." />
                        </div>
                        <Input
                          type="number"
                          step="0.1"
                          min="0"
                          value={emp.workersComp || ""}
                          onChange={(e) => updateProductionEmployee(index, "workersComp", e.target.value)}
                          placeholder="18"
                          data-testid={`input-prod-wc-${index}`}
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1">
                          <Label className="text-xs text-muted-foreground">Benefits $/hr</Label>
                          <InfoTooltip text="Any extra per-hour cost you pay for things like health insurance, retirement contributions, or paid time off." />
                        </div>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={emp.benefitsPerHour || ""}
                          onChange={(e) => updateProductionEmployee(index, "benefitsPerHour", e.target.value)}
                          placeholder="0.00"
                          data-testid={`input-prod-benefits-${index}`}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="rounded-md bg-muted/50 p-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase">Avg Hourly Wage</p>
                <p className="text-sm font-bold tabular-nums" data-testid="text-avg-wage">${averageHourlyRate.toFixed(2)}/hr</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase">Avg True Labor Cost</p>
                <p className="text-sm font-bold tabular-nums text-primary" data-testid="text-true-labor-cost">${calculatedTrueLaborCost.toFixed(2)}/hr</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase">Crew Size</p>
                <p className="text-sm font-bold tabular-nums" data-testid="text-crew-size">{crewSize}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>


      <Card data-testid="card-non-production">
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-primary" />
            <CardTitle>Non-Production Employees</CardTitle>
          </div>
          <Button size="sm" variant="ghost" onClick={addNonProductionEmployee} data-testid="button-add-non-production">
            <Plus className="w-4 h-4 mr-1" />
            Add
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Staff who support your business but don't do billable work on job sites. Their cost is added to your monthly overhead. Examples: virtual assistants, office managers, secretaries, salespeople, estimators.
          </p>

          {nonProductionEmployees.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground">
              <p className="text-sm">No non-production employees added. Their cost would be added to your overhead.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {nonProductionEmployees.map((emp, index) => {
                const monthlyCost = emp.hourlyRate * STANDARD_HOURS_PER_MONTH;
                return (
                  <div key={index} className="rounded-md border p-3 space-y-2" data-testid={`non-production-employee-${index}`}>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Input
                          value={emp.name}
                          onChange={(e) => updateNonProductionEmployee(index, "name", e.target.value)}
                          placeholder="Name"
                          className="max-w-[160px]"
                          data-testid={`input-nonprod-name-${index}`}
                        />
                        <Select value={emp.role} onValueChange={(v) => updateNonProductionEmployee(index, "role", v)}>
                          <SelectTrigger className="w-[160px] shrink-0" data-testid={`select-nonprod-role-${index}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(NON_PRODUCTION_ROLES).map(([key, label]) => (
                              <SelectItem key={key} value={key}>{label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" data-testid={`badge-nonprod-monthly-${index}`}>
                          ${monthlyCost.toLocaleString("en-US", { maximumFractionDigits: 0 })}/mo
                        </Badge>
                        <Button size="icon" variant="ghost" onClick={() => removeNonProductionEmployee(index)} data-testid={`button-remove-nonprod-${index}`}>
                          <Trash2 className="w-4 h-4 text-muted-foreground" />
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Hourly Rate ($)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={emp.hourlyRate || ""}
                        onChange={(e) => updateNonProductionEmployee(index, "hourlyRate", e.target.value)}
                        placeholder="0.00"
                        data-testid={`input-nonprod-rate-${index}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {nonProductionEmployees.length > 0 && (
            <div className="rounded-md bg-muted/50 p-3 flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">Total non-production cost added to overhead</span>
              <span className="text-sm font-bold tabular-nums" data-testid="text-nonprod-total">
                ${nonProdMonthlyTotal.toLocaleString("en-US", { maximumFractionDigits: 0 })}/mo
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      <div>
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Calculator className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold" data-testid="text-overhead-title">Overhead Expenses</h2>
          </div>
          <Badge variant="secondary" data-testid="badge-total-monthly">
            ${expenseMonthlyTotal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}/mo
          </Badge>
        </div>

        <div className="space-y-4">
          {CATEGORIES.map(cat => {
            const catExpenses = groupedExpenses[cat.key] || [];
            const catTotal = catExpenses.reduce(
              (sum, exp) => sum + calculateMonthlyEquivalent(exp.amount, exp.frequency),
              0
            );

            return (
              <Card key={cat.key} data-testid={`card-category-${cat.key}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <cat.icon className="w-4 h-4 text-muted-foreground" />
                      <CardTitle className="text-base">{cat.label}</CardTitle>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        ${catTotal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}/mo
                      </Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => addExpense(cat.key)}
                        data-testid={`button-add-${cat.key}`}
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Add
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {catExpenses.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-3">No expenses in this category</p>
                  ) : (
                    <div className="space-y-3">
                      {catExpenses.map((exp) => (
                        <div key={exp.originalIndex} className="rounded-md border shadow-sm p-3 space-y-1.5" data-testid={`expense-row-${exp.originalIndex}`}>
                          <Input
                            value={exp.expenseName}
                            onChange={(e) => updateExpense(exp.originalIndex, "expenseName", e.target.value)}
                            placeholder="Expense name"
                            data-testid={`input-expense-name-${exp.originalIndex}`}
                          />
                          <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                              <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                              <Input
                                type="number"
                                value={exp.amount || ""}
                                onChange={(e) => updateExpense(exp.originalIndex, "amount", parseFloat(e.target.value) || 0)}
                                className="pl-6"
                                placeholder="0"
                                data-testid={`input-expense-amount-${exp.originalIndex}`}
                              />
                            </div>
                            <Select
                              value={exp.frequency}
                              onValueChange={(v) => updateExpense(exp.originalIndex, "frequency", v)}
                            >
                              <SelectTrigger className="w-28 shrink-0" data-testid={`select-expense-freq-${exp.originalIndex}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="weekly">Weekly</SelectItem>
                                <SelectItem value="monthly">Monthly</SelectItem>
                                <SelectItem value="quarterly">Quarterly</SelectItem>
                                <SelectItem value="yearly">Yearly</SelectItem>
                              </SelectContent>
                            </Select>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => removeExpense(exp.originalIndex)}
                              data-testid={`button-delete-expense-${exp.originalIndex}`}
                            >
                              <Trash2 className="w-4 h-4 text-muted-foreground" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {hasChanges && (
        <div className="sticky bottom-4 flex justify-center z-50">
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            size="lg"
            data-testid="button-save-sticky"
          >
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save Changes
          </Button>
        </div>
      )}
    </div>
  );
}
