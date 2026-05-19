import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, DollarSign, Ruler, Receipt, Save, ShieldCheck, Car, Wrench, Megaphone, Briefcase, Monitor, MoreHorizontal, Users, Calculator, TrendingUp, Target, ArrowUpRight, ArrowDownRight, Building2, Clock, Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { OverheadExpense, TeamMember } from "@shared/schema";
import { useSubscription } from "@/hooks/use-subscription";
import { cn } from "@/lib/utils";
import { FeatureTipBanner } from "@/components/FeatureTipBanner";

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
  { expenseName: "FusePhone Subscription", amount: 49, frequency: "monthly", category: "software" },
  { expenseName: "Twilio Usage", amount: 0, frequency: "monthly", category: "software" },
  { expenseName: "Replit Hosting", amount: 0, frequency: "monthly", category: "software" },
  { expenseName: "Website Hosting", amount: 0, frequency: "monthly", category: "software" },
];

const NON_PRODUCTION_ROLES: Record<string, string> = {
  va: "Virtual Assistant",
  secretary: "Secretary",
  sales: "Sales",
  other: "Other",
};

function calculateMonthlyEquivalent(amount: number, frequency: string): number {
  switch (frequency) {
    case "weekly": return amount * 4.33;
    case "quarterly": return amount / 3;
    case "yearly": return amount / 12;
    case "monthly":
    default: return amount;
  }
}

function formatRoleLabel(role: string): string {
  return NON_PRODUCTION_ROLES[role] || role.charAt(0).toUpperCase() + role.slice(1);
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

export default function FinancialSettings() {
  const { toast } = useToast();

  const { data, isLoading } = useQuery<{ settings: any; expenses: OverheadExpense[] }>({
    queryKey: ["/api/financial-settings"],
  });

  const { data: teamMembersData } = useQuery<TeamMember[]>({
    queryKey: ["/api/team-members"],
  });

  const [sellRate, setSellRate] = useState("");
  const [doorWidth, setDoorWidth] = useState("3");
  const [doorHeight, setDoorHeight] = useState("7");
  const [windowWidth, setWindowWidth] = useState("3");
  const [windowHeight, setWindowHeight] = useState("4");

  const [payrollBurden, setPayrollBurden] = useState("12");
  const [workersComp, setWorkersComp] = useState("18");
  const [benefitsPerHour, setBenefitsPerHour] = useState("0");
  const [useProductionTeam, setUseProductionTeam] = useState(true);
  const [manualLaborCost, setManualLaborCost] = useState("0");
  const [targetNetProfit, setTargetNetProfit] = useState("20");
  const [useAutoSellRate, setUseAutoSellRate] = useState(true);
  const [negotiationFloor, setNegotiationFloor] = useState("30");

  const [localExpenses, setLocalExpenses] = useState<LocalExpense[]>([]);
  const [addCategory, setAddCategory] = useState("other");
  const [newExpenseName, setNewExpenseName] = useState("");
  const defaultsPopulatedRef = useRef(false);

  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<LocalExpense | null>(null);
  const [modalName, setModalName] = useState("");
  const [modalAmount, setModalAmount] = useState("");
  const [modalFrequency, setModalFrequency] = useState("monthly");
  const [modalCategory, setModalCategory] = useState("other");

  const pricingProductionMembers = useMemo(() => {
    if (!teamMembersData) return [];
    return teamMembersData.filter(m =>
      m.isActive !== false &&
      m.activeForPricing !== false &&
      m.employeeType === "production" &&
      m.hourlyRate && m.hourlyRate > 0
    );
  }, [teamMembersData]);

  const productionMembers = pricingProductionMembers;

  const nonProductionMembers = useMemo(() => {
    if (!teamMembersData) return [];
    return teamMembersData.filter(m =>
      m.isActive !== false &&
      m.employeeType === "not_production"
    );
  }, [teamMembersData]);

  const averageHourlyRate = useMemo(() => {
    if (pricingProductionMembers.length === 0) return 0;
    const total = pricingProductionMembers.reduce((sum, m) => sum + (m.hourlyRate || 0), 0);
    return total / pricingProductionMembers.length / 100;
  }, [pricingProductionMembers]);

  const calculatedTrueLaborCost = useMemo(() => {
    if (pricingProductionMembers.length === 0) return 0;
    const totalTrueCost = pricingProductionMembers.reduce((sum, m) => {
      const wage = (m.hourlyRate || 0) / 100;
      const burden = m.payrollBurdenPercentage ?? 0.12;
      const wc = m.workersCompPercentage ?? 0.18;
      const bph = m.benefitsPerHour ?? 0;
      return sum + (wage * (1 + burden + wc) + bph);
    }, 0);
    return totalTrueCost / pricingProductionMembers.length;
  }, [pricingProductionMembers]);

  const effectiveLaborCost = useMemo(() => {
    if (useProductionTeam) return calculatedTrueLaborCost;
    return parseFloat(manualLaborCost) || 0;
  }, [useProductionTeam, calculatedTrueLaborCost, manualLaborCost]);

  const targetNetProfitValue = (parseFloat(targetNetProfit) || 0) / 100;

  useEffect(() => {
    if (data?.settings) {
      const s = data.settings;
      setSellRate(s.sellRatePerHour?.toString() || "");
      setDoorWidth(s.defaultDoorWidthFt?.toString() || "3");
      setDoorHeight(s.defaultDoorHeightFt?.toString() || "7");
      setWindowWidth(s.defaultWindowWidthFt?.toString() || "3");
      setWindowHeight(s.defaultWindowHeightFt?.toString() || "4");
      setPayrollBurden(((s.payrollBurdenPercentage ?? 0.12) * 100).toString());
      setWorkersComp(((s.workersCompPercentage ?? 0.18) * 100).toString());
      setBenefitsPerHour((s.benefitsPerHour ?? 0).toString());
      setUseProductionTeam(s.useProductionTeamForLaborCost !== false);
      setManualLaborCost((s.manualLaborCostPerHour ?? 0).toString());
      setNegotiationFloor(((s.aiNegotiationFloor ?? 0.30) * 100).toString());
      const netProfitPct = s.targetNetProfitPercentage ?? null;
      if (netProfitPct !== null && netProfitPct > 0) {
        setTargetNetProfit((netProfitPct * 100).toString());
        setUseAutoSellRate(true);
      } else if (s.targetGrossMarginPercentage > 0) {
        setTargetNetProfit(((s.targetGrossMarginPercentage ?? 0) * 100).toString());
        setUseAutoSellRate(true);
      } else {
        setUseAutoSellRate(false);
      }
    }
    if (data?.expenses) {
      setLocalExpenses(data.expenses.map(e => ({
        id: e.id,
        expenseName: e.expenseName,
        category: e.category || "other",
        amount: e.amount,
        frequency: e.frequency,
        dirty: false,
      })));
    }
  }, [data]);

  useEffect(() => {
    if (data && !data.settings?.defaultsPopulated && data.expenses.length === 0 && !defaultsPopulatedRef.current) {
      defaultsPopulatedRef.current = true;
      populateDefaults.mutate();
    }
  }, [data]);

  const saveSettings = useMutation({
    mutationFn: async (updates: Record<string, any>) => {
      const res = await apiRequest("PUT", "/api/financial-settings", updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/financial-settings"] });
      toast({ title: "Settings saved" });
    },
    onError: () => {
      toast({ title: "Failed to save settings", variant: "destructive" });
    },
  });

  const populateDefaults = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/financial-settings/expenses/bulk", { expenses: DEFAULT_EXPENSES });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/financial-settings"] });
    },
  });

  const createExpense = useMutation({
    mutationFn: async (expense: { expenseName: string; amount: number; frequency: string; category: string }) => {
      const res = await apiRequest("POST", "/api/financial-settings/expenses", expense);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/financial-settings"] });
      setNewExpenseName("");
      setExpenseModalOpen(false);
      setEditingExpense(null);
      toast({ title: "Expense added" });
    },
  });

  const updateExpense = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Partial<LocalExpense> }) => {
      const res = await apiRequest("PUT", `/api/financial-settings/expenses/${id}`, updates);
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/financial-settings"] });
      setLocalExpenses(prev => prev.map(e => e.id === variables.id ? { ...e, dirty: false } : e));
      setExpenseModalOpen(false);
      setEditingExpense(null);
      toast({ title: "Expense saved" });
    },
    onError: () => {
      toast({ title: "Failed to save", variant: "destructive" });
    },
  });

  const deleteExpense = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/financial-settings/expenses/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/financial-settings"] });
      toast({ title: "Expense removed" });
    },
  });


  const handleSaveLaborCostSource = () => {
    const updates: Record<string, any> = {
      payrollBurdenPercentage: (parseFloat(payrollBurden) || 0) / 100,
      workersCompPercentage: (parseFloat(workersComp) || 0) / 100,
      benefitsPerHour: parseFloat(benefitsPerHour) || 0,
      useProductionTeamForLaborCost: useProductionTeam,
      manualLaborCostPerHour: parseFloat(manualLaborCost) || 0,
    };
    saveSettings.mutate(updates);
  };

  const handleSaveMarginPricing = () => {
    const netProfitDecimal = (parseFloat(targetNetProfit) || 0) / 100;
    const currentSellRate = useAutoSellRate ? autoSellRate : (parseFloat(sellRate) || 0);
    const grossMarginDecimal = currentSellRate > 0 ? (currentSellRate - effectiveLaborCost) / currentSellRate : 0;
    const updates: Record<string, any> = {
      targetNetProfitPercentage: useAutoSellRate ? netProfitDecimal : 0,
      targetGrossMarginPercentage: useAutoSellRate ? grossMarginDecimal : 0,
      targetGrossProfitPerHour: 0,
      sellRatePerHour: currentSellRate,
    };
    saveSettings.mutate(updates);
  };

  const handleSaveNegotiationFloor = () => {
    const floorDecimal = (parseFloat(negotiationFloor) || 0) / 100;
    saveSettings.mutate({ aiNegotiationFloor: floorDecimal });
  };

  const handleSaveDimensions = () => {
    saveSettings.mutate({
      defaultDoorWidthFt: parseFloat(doorWidth) || 3,
      defaultDoorHeightFt: parseFloat(doorHeight) || 7,
      defaultWindowWidthFt: parseFloat(windowWidth) || 3,
      defaultWindowHeightFt: parseFloat(windowHeight) || 4,
    });
  };

  const handleFieldChange = (id: number | undefined, field: keyof LocalExpense, value: any) => {
    setLocalExpenses(prev => prev.map(e =>
      e.id === id ? { ...e, [field]: value, dirty: true } : e
    ));
  };

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const dirtyExpenses = localExpenses.filter(e => e.dirty && e.id && e.expenseName.trim());
    if (dirtyExpenses.length === 0) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      dirtyExpenses.forEach(expense => {
        updateExpense.mutate({
          id: expense.id!,
          updates: {
            expenseName: expense.expenseName,
            amount: expense.amount,
            frequency: expense.frequency,
            category: expense.category,
          },
        });
      });
      setLocalExpenses(prev => prev.map(e => ({ ...e, dirty: false })));
    }, 1500);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [localExpenses]);

  const handleSaveExpense = (expense: LocalExpense) => {
    if (!expense.id || !expense.expenseName.trim()) return;
    updateExpense.mutate({
      id: expense.id,
      updates: {
        expenseName: expense.expenseName,
        amount: expense.amount,
        frequency: expense.frequency,
        category: expense.category,
      },
    });
  };

  const handleDeleteExpense = (expense: LocalExpense) => {
    if (expense.id) {
      deleteExpense.mutate(expense.id);
    }
    setLocalExpenses(prev => prev.filter(e => e.id !== expense.id));
  };

  const handleAddExpense = () => {
    if (!newExpenseName.trim()) return;
    createExpense.mutate({
      expenseName: newExpenseName.trim(),
      amount: 0,
      frequency: "monthly",
      category: addCategory,
    });
  };

  const openAddExpenseModal = (category?: string) => {
    setEditingExpense(null);
    setModalName("");
    setModalAmount("");
    setModalFrequency("monthly");
    setModalCategory(category || "other");
    setExpenseModalOpen(true);
  };

  const openEditExpenseModal = (expense: LocalExpense) => {
    setEditingExpense(expense);
    setModalName(expense.expenseName);
    setModalAmount(expense.amount > 0 ? expense.amount.toString() : "");
    setModalFrequency(expense.frequency);
    setModalCategory(expense.category);
    setExpenseModalOpen(true);
  };

  const handleModalSave = () => {
    if (!modalName.trim()) return;
    if (editingExpense?.id) {
      updateExpense.mutate({
        id: editingExpense.id,
        updates: {
          expenseName: modalName.trim(),
          amount: parseFloat(modalAmount) || 0,
          frequency: modalFrequency,
          category: modalCategory,
        },
      });
    } else {
      createExpense.mutate({
        expenseName: modalName.trim(),
        amount: parseFloat(modalAmount) || 0,
        frequency: modalFrequency,
        category: modalCategory,
      });
    }
  };


  const STANDARD_HOURS_PER_MONTH = 40 * 4.33;

  const nonProdMonthlyTotal = useMemo(() => {
    return nonProductionMembers.reduce((sum, m) => {
      const hourlyRateDollars = (m.hourlyRate || 0) / 100;
      return sum + (hourlyRateDollars * STANDARD_HOURS_PER_MONTH);
    }, 0);
  }, [nonProductionMembers]);

  const totalMonthlyOverhead = useMemo(() => {
    const expenseTotal = localExpenses.reduce((sum, exp) => {
      return sum + calculateMonthlyEquivalent(exp.amount, exp.frequency);
    }, 0);
    return expenseTotal + nonProdMonthlyTotal;
  }, [localExpenses, nonProdMonthlyTotal]);

  const monthlyLaborCost = useMemo(() => {
    const crewSize = pricingProductionMembers.length;
    if (crewSize === 0 || effectiveLaborCost <= 0) return 0;
    return effectiveLaborCost * 160 * crewSize;
  }, [effectiveLaborCost, pricingProductionMembers]);

  const monthlyBreakEven = useMemo(() => {
    return totalMonthlyOverhead + monthlyLaborCost;
  }, [totalMonthlyOverhead, monthlyLaborCost]);

  const overheadPerHour = useMemo(() => {
    const crewSize = pricingProductionMembers.length;
    if (crewSize === 0) return 0;
    return totalMonthlyOverhead / (160 * crewSize);
  }, [totalMonthlyOverhead, pricingProductionMembers]);

  const autoSellRate = useMemo(() => {
    const netPct = targetNetProfitValue;
    if (netPct >= 1 || netPct < 0) return 0;
    if (effectiveLaborCost <= 0 && overheadPerHour <= 0) return 0;
    return (effectiveLaborCost + overheadPerHour) / (1 - netPct);
  }, [effectiveLaborCost, overheadPerHour, targetNetProfitValue]);

  const grossMarginPercent = useMemo(() => {
    if (autoSellRate <= 0) return 0;
    return ((autoSellRate - effectiveLaborCost) / autoSellRate) * 100;
  }, [autoSellRate, effectiveLaborCost]);

  const effectiveSellRate = useMemo(() => {
    if (useAutoSellRate) return autoSellRate;
    return parseFloat(sellRate) || 0;
  }, [useAutoSellRate, autoSellRate, sellRate]);

  const monthlyRevenuePotential = useMemo(() => {
    const crewSize = pricingProductionMembers.length;
    if (crewSize === 0 || effectiveSellRate <= 0) return 0;
    return effectiveSellRate * 160 * crewSize;
  }, [effectiveSellRate, pricingProductionMembers]);

  const monthlyNetProfit = useMemo(() => {
    return monthlyRevenuePotential - monthlyBreakEven;
  }, [monthlyRevenuePotential, monthlyBreakEven]);

  const profitPerHour = useMemo(() => {
    return effectiveSellRate - effectiveLaborCost - overheadPerHour;
  }, [effectiveSellRate, effectiveLaborCost, overheadPerHour]);

  const hoursToBreakEven = useMemo(() => {
    if (effectiveSellRate <= 0) return 0;
    return monthlyBreakEven / effectiveSellRate;
  }, [monthlyBreakEven, effectiveSellRate]);

  const totalAvailableHours = useMemo(() => {
    return 160 * pricingProductionMembers.length;
  }, [pricingProductionMembers]);

  const actualNetMargin = useMemo(() => {
    if (monthlyRevenuePotential <= 0) return 0;
    return (monthlyNetProfit / monthlyRevenuePotential) * 100;
  }, [monthlyNetProfit, monthlyRevenuePotential]);

  const groupedExpenses = useMemo(() => {
    const groups: Record<string, LocalExpense[]> = {};
    for (const cat of CATEGORIES) {
      groups[cat.key] = [];
    }
    for (const exp of localExpenses) {
      const key = groups[exp.category] ? exp.category : "other";
      groups[key].push(exp);
    }
    return groups;
  }, [localExpenses]);

  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto space-y-6">
      <FeatureTipBanner
        id="financial-settings"
        title="Financial Settings"
        description="Configure your labor costs, overhead, and margins to price jobs accurately."
      />
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Financial Settings</h1>
        </div>
        <p className="text-muted-foreground text-sm mt-1">Know your numbers — configure labor pricing, overhead, and margins</p>
      </div>

      <Card data-testid="card-know-your-numbers">
        <CardContent className="px-3 py-2.5 space-y-2.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold">Margin & Pricing</span>
            </div>
            <Button
              size="sm"
              onClick={handleSaveMarginPricing}
              disabled={saveSettings.isPending}
              data-testid="button-save-margin-pricing"
            >
              {saveSettings.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
              Save
            </Button>
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="space-y-0.5">
              <Label className="text-xs font-medium">Auto-Calculate Sell Rate</Label>
              <p className="text-[10px] text-muted-foreground">Set your target net profit and we calculate the sell rate</p>
            </div>
            <Switch
              checked={useAutoSellRate}
              onCheckedChange={setUseAutoSellRate}
              data-testid="switch-auto-sell-rate"
            />
          </div>

          {useAutoSellRate ? (
            <div className="rounded-md border p-3 space-y-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <Label className="text-xs">Net Profit</Label>
                    <InfoTooltip text="Your target net profit percentage after ALL costs (labor + overhead). The sell rate is calculated to achieve this net profit. Industry benchmark: 20-35% is healthy." />
                  </div>
                  <span className={cn("text-lg font-bold tabular-nums", actualNetMargin >= 20 ? "text-emerald-600 dark:text-emerald-400" : actualNetMargin >= 10 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400")} data-testid="text-target-net-profit">{targetNetProfit}%</span>
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
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-0.5 text-center">
                  <Label className="text-[10px] text-muted-foreground uppercase">Labor Cost</Label>
                  <p className="text-sm font-medium tabular-nums" data-testid="text-effective-labor-cost">${effectiveLaborCost.toFixed(2)}<span className="text-[10px] font-normal text-muted-foreground">/hr</span></p>
                </div>
                <div className="space-y-0.5 text-center">
                  <Label className="text-[10px] text-muted-foreground uppercase">Sell Rate</Label>
                  <p className="text-sm font-bold tabular-nums text-primary" data-testid="text-auto-sell-rate">${autoSellRate.toFixed(2)}<span className="text-[10px] font-normal text-muted-foreground">/hr</span></p>
                </div>
                <div className="space-y-0.5 text-center">
                  <Label className="text-[10px] text-muted-foreground uppercase">Gross Margin</Label>
                  <p className={cn("text-sm font-bold tabular-nums", grossMarginPercent >= 45 ? "text-emerald-600 dark:text-emerald-400" : grossMarginPercent >= 30 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400")} data-testid="text-gross-margin">{grossMarginPercent.toFixed(1)}%</p>
                </div>
              </div>
              <div className="rounded-md bg-muted/50 p-2">
                <p className="text-[10px] text-muted-foreground text-center">
                  (${effectiveLaborCost.toFixed(2)} labor + ${overheadPerHour.toFixed(2)} overhead) / (1 - {targetNetProfit}%) = ${autoSellRate.toFixed(2)}/hr
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <Label htmlFor="sell-rate" className="text-xs">Sell Rate Per Hour ($)</Label>
                <InfoTooltip text="What you charge per labor hour on estimates. Labor hours x sell rate = labor total." />
              </div>
              <Input
                id="sell-rate"
                type="number"
                step="0.01"
                min="0"
                value={sellRate}
                onChange={(e) => setSellRate(e.target.value)}
                placeholder="0.00"
                data-testid="input-sell-rate"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-x-4 gap-y-2 pt-2 border-t">
            <div data-testid="metric-monthly-overhead" className="flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-primary shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase leading-none flex items-center gap-1">Overhead/mo <InfoTooltip text="Your total fixed business costs (insurance, vehicle, marketing, office, etc.) that you pay regardless of how many jobs you do." /></p>
                <p className="text-sm font-bold tabular-nums leading-tight">${totalMonthlyOverhead.toLocaleString("en-US", { maximumFractionDigits: 0 })} <span className="text-[10px] font-normal text-muted-foreground">${overheadPerHour.toFixed(2)}/hr</span></p>
              </div>
            </div>
            <div data-testid="metric-monthly-labor" className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-primary shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase leading-none flex items-center gap-1">Labor/mo <InfoTooltip text="Your total crew labor cost including wages, employer taxes, workers comp insurance, and any benefits you provide. This is what it actually costs you to have your crew working." /></p>
                <p className="text-sm font-bold tabular-nums leading-tight">${monthlyLaborCost.toLocaleString("en-US", { maximumFractionDigits: 0 })} <span className="text-[10px] font-normal text-muted-foreground">{pricingProductionMembers.length} crew</span></p>
              </div>
            </div>
            <div data-testid="metric-sell-rate-hr" className="flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-primary shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase leading-none flex items-center gap-1">Sell Rate <InfoTooltip text="What you charge per labor hour. Calculated as: (Labor Cost + Overhead/hr) / (1 - Net Profit %). This covers your labor, overhead, AND builds in your net profit." /></p>
                <p className="text-sm font-bold tabular-nums text-primary leading-tight">${effectiveSellRate.toFixed(2)}<span className="text-[10px] font-normal text-muted-foreground">/hr</span></p>
              </div>
            </div>
            <div data-testid="metric-break-even" className="flex items-center gap-1.5">
              <ArrowDownRight className="w-3.5 h-3.5 text-destructive shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase leading-none flex items-center gap-1">Break-even <InfoTooltip text="The minimum revenue you need to cover all costs (overhead + labor) before making any profit. Below this number, you're losing money." /></p>
                <p className="text-sm font-bold tabular-nums text-destructive leading-tight">${monthlyBreakEven.toLocaleString("en-US", { maximumFractionDigits: 0 })}<span className="text-[10px] font-normal text-muted-foreground">/mo</span></p>
              </div>
            </div>
          </div>
          <div className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md ${monthlyNetProfit >= 0 ? 'bg-primary/5 dark:bg-primary/10' : 'bg-destructive/5 dark:bg-destructive/10'}`}>
            <div className="flex items-center gap-1" data-testid="metric-net-profit">
              {monthlyNetProfit >= 0 ? (
                <ArrowUpRight className="w-3.5 h-3.5 text-primary" />
              ) : (
                <ArrowDownRight className="w-3.5 h-3.5 text-destructive" />
              )}
              <span className="text-[10px] text-muted-foreground">Profit</span>
              <span className={`text-sm font-bold tabular-nums ${monthlyNetProfit >= 0 ? "text-primary" : "text-destructive"}`}>
                {monthlyNetProfit >= 0 ? "" : "-"}${Math.abs(monthlyNetProfit).toLocaleString("en-US", { maximumFractionDigits: 0 })}<span className="text-[10px] font-normal text-muted-foreground">/mo</span>
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
          <div className="px-2.5 py-1.5 rounded-md bg-muted/50 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1" data-testid="metric-hours-break-even">
                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">Break-even at</span>
                <span className="text-sm font-bold tabular-nums">{hoursToBreakEven.toFixed(0)}<span className="text-[10px] font-normal text-muted-foreground"> hrs/mo</span></span>
                <InfoTooltip text="How many billable hours your crew needs to work just to cover all your costs. After this many hours, every additional hour is pure profit." />
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1" data-testid="metric-hours-sell-all">
                <Target className="w-3.5 h-3.5 text-primary" />
                <span className="text-[10px] text-muted-foreground">Sell all {totalAvailableHours} hrs</span>
                <InfoTooltip text="If your crew works and bills every available hour at your sell rate, this is your maximum potential revenue." />
              </div>
              <span className="text-sm font-bold tabular-nums text-primary" data-testid="metric-sell-all-revenue">
                ${monthlyRevenuePotential.toLocaleString("en-US", { maximumFractionDigits: 0 })}<span className="text-[10px] font-normal text-muted-foreground">/mo</span>
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-labor-cost-source">
        <CardHeader className="flex flex-row items-center gap-2">
          <Calculator className="w-5 h-5 text-primary" />
          <CardTitle>Labor Cost Source</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="space-y-1">
              <Label className="text-sm font-medium">Use Production Team for Labor Cost</Label>
              <p className="text-xs text-muted-foreground">
                Auto-calculate labor cost from your production crew's hourly rates
              </p>
            </div>
            <Switch
              checked={useProductionTeam}
              onCheckedChange={setUseProductionTeam}
              data-testid="switch-use-production-team"
            />
          </div>

          {useProductionTeam ? (
            <>
              <div className="rounded-md border p-3 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-sm font-medium">Production Team Summary</span>
                  <Badge variant="secondary" data-testid="badge-production-count">
                    {productionMembers.length} member{productionMembers.length !== 1 ? "s" : ""}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Only active members marked "Active for Pricing" with an hourly wage are included.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Average Hourly Wage</Label>
                    <div className="flex items-center h-9 px-2 text-sm font-medium tabular-nums" data-testid="text-avg-hourly-rate">
                      ${averageHourlyRate.toFixed(2)}/hr
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1">
                      <Label className="text-xs text-muted-foreground">Avg True Labor Cost / Hour</Label>
                      <InfoTooltip text="What each labor hour actually costs you (not what you charge the customer). This averages each team member's wage plus their taxes, insurance, and benefits." />
                    </div>
                    <div className="flex items-center h-9 px-2 text-sm font-bold tabular-nums text-primary" data-testid="text-true-labor-cost">
                      ${calculatedTrueLaborCost.toFixed(2)}/hr
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-md bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">
                  Each team member's real cost is calculated from their individual wage plus employer taxes, workers comp insurance, and any benefits. The average across all team members is shown above.
                </p>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <Label htmlFor="manual-labor-cost">Labor Cost Per Hour ($)</Label>
                <InfoTooltip text="What each labor hour actually costs you (not what you charge the customer). Used with your net profit target to calculate your sell rate." />
              </div>
              <p className="text-xs text-muted-foreground">Manually enter your labor cost per hour</p>
              <Input
                id="manual-labor-cost"
                type="number"
                step="0.01"
                min="0"
                value={manualLaborCost}
                onChange={(e) => setManualLaborCost(e.target.value)}
                placeholder="0.00"
                data-testid="input-manual-labor-cost"
              />
            </div>
          )}

          <div className="flex justify-end">
            <Button
              onClick={handleSaveLaborCostSource}
              disabled={saveSettings.isPending}
              data-testid="button-save-labor-cost-source"
            >
              {saveSettings.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Save
            </Button>
          </div>
        </CardContent>
      </Card>


      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <DollarSign className="w-5 h-5 text-primary" />
          <CardTitle>Labor Pricing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <Label>Sell Rate Per Hour ($)</Label>
                <InfoTooltip text="What you charge per labor hour on estimates. Labor hours x sell rate = labor total." />
              </div>
              <div className="flex items-center h-9 px-3 rounded-md border bg-muted/50 text-sm font-medium tabular-nums" data-testid="text-current-sell-rate">
                ${useAutoSellRate ? autoSellRate.toFixed(2) : (parseFloat(sellRate) || 0).toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground">
                {useAutoSellRate ? "Auto-calculated from net profit target above" : "Manually set in Margin & Pricing above"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <Ruler className="w-5 h-5 text-primary" />
          <CardTitle>Default Dimensions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-3">Door Dimensions</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="door-width">Width (ft)</Label>
                <Input
                  id="door-width"
                  type="number"
                  step="0.1"
                  min="0"
                  value={doorWidth}
                  onChange={(e) => setDoorWidth(e.target.value)}
                  data-testid="input-door-width"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="door-height">Height (ft)</Label>
                <Input
                  id="door-height"
                  type="number"
                  step="0.1"
                  min="0"
                  value={doorHeight}
                  onChange={(e) => setDoorHeight(e.target.value)}
                  data-testid="input-door-height"
                />
              </div>
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-3">Window Dimensions</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="window-width">Width (ft)</Label>
                <Input
                  id="window-width"
                  type="number"
                  step="0.1"
                  min="0"
                  value={windowWidth}
                  onChange={(e) => setWindowWidth(e.target.value)}
                  data-testid="input-window-width"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="window-height">Height (ft)</Label>
                <Input
                  id="window-height"
                  type="number"
                  step="0.1"
                  min="0"
                  value={windowHeight}
                  onChange={(e) => setWindowHeight(e.target.value)}
                  data-testid="input-window-height"
                />
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              onClick={handleSaveDimensions}
              disabled={saveSettings.isPending}
              data-testid="button-save-dimensions"
            >
              {saveSettings.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Save
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Overhead Expenses</h2>
          </div>
          <Button
            onClick={() => openAddExpenseModal()}
            data-testid="button-add-expense"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Expense
          </Button>
        </div>

        <Card data-testid="card-group-non-production">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-base">Non-Production Employees</CardTitle>
                <Badge variant="secondary" className="text-xs">{nonProductionMembers.length}</Badge>
              </div>
              <span className="text-sm font-medium tabular-nums text-muted-foreground" data-testid="text-group-monthly-non-production">
                ${nonProdMonthlyTotal.toFixed(2)}/mo
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            <p className="text-xs text-muted-foreground">
              Monthly costs auto-calculated from hourly rate at 40 hrs/week (173 hrs/month). Manage in Crew Management.
            </p>
            {nonProductionMembers.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2" data-testid="text-no-non-production">
                No active non-production employees. Add them in Crew Management.
              </p>
            ) : (
              nonProductionMembers.map((member) => {
                const hourlyRateDollars = (member.hourlyRate || 0) / 100;
                const monthlyCost = hourlyRateDollars * STANDARD_HOURS_PER_MONTH;
                return (
                  <div
                    key={member.id}
                    className="rounded-md border shadow-sm p-3 flex items-center justify-between gap-3 flex-wrap"
                    data-testid={`employee-cost-row-${member.id}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium truncate" data-testid={`text-employee-name-${member.id}`}>{member.name}</span>
                      <Badge variant="outline" className="text-xs shrink-0">{formatRoleLabel(member.role)}</Badge>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-muted-foreground tabular-nums" data-testid={`text-employee-rate-${member.id}`}>
                        ${hourlyRateDollars.toFixed(2)}/hr
                      </span>
                      <span className="text-sm font-medium tabular-nums text-muted-foreground whitespace-nowrap" data-testid={`text-employee-monthly-${member.id}`}>
                        {monthlyCost > 0 ? `$${monthlyCost.toFixed(0)}/mo` : "No rate set"}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {localExpenses.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground" data-testid="text-expenses-empty">
              {populateDefaults.isPending ? (
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Loading default expenses...</span>
                </div>
              ) : (
                <span>No overhead expenses configured. Click "Add Expense" to get started.</span>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-5">
            {CATEGORIES.map(cat => {
              const items = groupedExpenses[cat.key] || [];
              if (items.length === 0) return null;
              const Icon = cat.icon;
              const groupMonthly = items.reduce((sum, e) => sum + calculateMonthlyEquivalent(e.amount, e.frequency), 0);
              return (
                <Card key={cat.key} data-testid={`card-group-${cat.key}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4 text-muted-foreground" />
                        <CardTitle className="text-base">{cat.label}</CardTitle>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" data-testid={`text-group-monthly-${cat.key}`}>
                          ${groupMonthly.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}/mo
                        </Badge>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openAddExpenseModal(cat.key)}
                          data-testid={`button-add-${cat.key}`}
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Add
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 pt-0">
                    {items.map((expense) => {
                      const monthlyEq = calculateMonthlyEquivalent(expense.amount, expense.frequency);
                      return (
                        <div
                          key={expense.id}
                          className="rounded-md border shadow-sm p-3 flex items-center justify-between gap-3 cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => openEditExpenseModal(expense)}
                          data-testid={`expense-row-${expense.id}`}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate" data-testid={`text-expense-name-${expense.id}`}>
                              {expense.expenseName || "Untitled expense"}
                            </p>
                            <p className="text-xs text-muted-foreground tabular-nums">
                              ${expense.amount > 0 ? expense.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"} / {expense.frequency}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-sm font-medium tabular-nums text-muted-foreground whitespace-nowrap" data-testid={`text-monthly-eq-${expense.id}`}>
                              ${monthlyEq.toFixed(0)}/mo
                            </span>
                            <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <Card>
          <CardContent className="p-4 flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-muted-foreground">Total Monthly Overhead</span>
            <span className="text-lg font-bold tabular-nums" data-testid="text-total-monthly">
              ${totalMonthlyOverhead.toFixed(2)}
            </span>
          </CardContent>
        </Card>
      </div>

      <Dialog open={expenseModalOpen} onOpenChange={setExpenseModalOpen}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto top-[5%] translate-y-0 sm:top-[50%] sm:translate-y-[-50%]" onOpenAutoFocus={(e) => { if (editingExpense) e.preventDefault(); }}>
          <DialogHeader>
            <DialogTitle>{editingExpense ? "Edit Expense" : "Add Expense"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Expense Name</Label>
              <Input
                value={modalName}
                onChange={(e) => setModalName(e.target.value)}
                placeholder="e.g. General Liability Insurance"
                autoFocus={!editingExpense}
                data-testid="input-modal-expense-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={modalCategory} onValueChange={setModalCategory}>
                <SelectTrigger data-testid="select-modal-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => (
                    <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Amount</Label>
                <div className="relative">
                  <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={modalAmount}
                    onChange={(e) => setModalAmount(e.target.value)}
                    className="pl-7"
                    placeholder="0.00"
                    data-testid="input-modal-expense-amount"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Frequency</Label>
                <Select value={modalFrequency} onValueChange={setModalFrequency}>
                  <SelectTrigger data-testid="select-modal-frequency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {(parseFloat(modalAmount) || 0) > 0 && modalFrequency !== "monthly" && (
              <p className="text-xs text-muted-foreground tabular-nums">
                Monthly equivalent: ${calculateMonthlyEquivalent(parseFloat(modalAmount) || 0, modalFrequency).toFixed(2)}/mo
              </p>
            )}
          </div>
          <DialogFooter className="flex-row gap-2">
            {editingExpense?.id && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (editingExpense.id) {
                    deleteExpense.mutate(editingExpense.id);
                    setExpenseModalOpen(false);
                    setEditingExpense(null);
                  }
                }}
                disabled={deleteExpense.isPending}
                className="mr-auto"
                data-testid="button-modal-delete"
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Delete
              </Button>
            )}
            <Button variant="outline" onClick={() => setExpenseModalOpen(false)}>Cancel</Button>
            <Button
              onClick={handleModalSave}
              disabled={!modalName.trim() || createExpense.isPending || updateExpense.isPending}
              data-testid="button-modal-save"
            >
              {(createExpense.isPending || updateExpense.isPending) && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {editingExpense ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
