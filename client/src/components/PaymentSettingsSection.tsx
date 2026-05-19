import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, DollarSign, Percent, CreditCard, Banknote } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import type { PaymentSettings, PaymentScheduleItem } from "@shared/schema";

interface PaymentSettingsSectionProps {
  totalAmount: number;
  paymentSettings: PaymentSettings | undefined;
  onPaymentSettingsChange: (settings: PaymentSettings | undefined) => void;
  disabled?: boolean;
  isInvoice?: boolean;
  userTier?: string;
  financingAvailable?: boolean;
  companyState?: string | null;
}

const SURCHARGE_BANNED_STATES = ['CT', 'MA', 'ME'];

const DEFAULT_DUE_CONDITIONS = [
  { value: "upon_signing", label: "Upon signing" },
  { value: "upon_start", label: "At start of work" },
  { value: "upon_completion", label: "Upon completion" },
  { value: "net_30", label: "Net 30 days" },
  { value: "custom", label: "Custom" },
];

export function PaymentSettingsSection({ totalAmount, paymentSettings, onPaymentSettingsChange, disabled, isInvoice, userTier, financingAvailable, companyState }: PaymentSettingsSectionProps) {
  const stateRestrictsSurcharge = !!companyState && SURCHARGE_BANNED_STATES.includes(companyState.toUpperCase());
  const isStarter = userTier === 'starter';
  const [depositRequired, setDepositRequired] = useState(paymentSettings?.depositRequired ?? false);
  const [depositType, setDepositType] = useState<'fixed' | 'percentage'>(paymentSettings?.depositType ?? 'percentage');
  const [depositAmount, setDepositAmount] = useState(paymentSettings?.depositAmount ?? 50);
  const [schedule, setSchedule] = useState<PaymentScheduleItem[]>(paymentSettings?.schedule ?? []);
  const [showPaymentSchedule, setShowPaymentSchedule] = useState(paymentSettings?.showPaymentSchedule ?? false);
  const [allowOnlinePayment, setAllowOnlinePayment] = useState(paymentSettings?.allowOnlinePayment ?? false);
  const [allowOfflinePayment, setAllowOfflinePayment] = useState(paymentSettings?.allowOfflinePayment ?? false);
  const [showFinancing, setShowFinancing] = useState(paymentSettings?.showFinancing ?? false);
  const [cardFeeEnabled, setCardFeeEnabled] = useState(paymentSettings?.cardFeeEnabled ?? false);
  const [cardFeePercent, setCardFeePercent] = useState(paymentSettings?.cardFeePercent ?? 3);

  useEffect(() => {
    if (paymentSettings) {
      const depReq = paymentSettings.depositRequired ?? false;
      const depType = paymentSettings.depositType ?? 'percentage';
      const depAmt = paymentSettings.depositAmount ?? 50;
      const rawSchedule = Array.isArray(paymentSettings.schedule) ? paymentSettings.schedule : [];
      setDepositRequired(depReq);
      setDepositType(depType);
      setDepositAmount(depAmt);
      setShowPaymentSchedule(paymentSettings.showPaymentSchedule ?? false);
      setAllowOnlinePayment(paymentSettings.allowOnlinePayment ?? false);
      setAllowOfflinePayment(paymentSettings.allowOfflinePayment ?? false);
      setShowFinancing(paymentSettings.showFinancing ?? false);
      setCardFeeEnabled(paymentSettings.cardFeeEnabled ?? false);
      setCardFeePercent(paymentSettings.cardFeePercent ?? 3);
      if (depReq && rawSchedule.length > 0 && totalAmount > 0) {
        const depositCents = depType === 'percentage'
          ? Math.round(totalAmount * (depAmt / 100))
          : Math.round(depAmt * 100);
        const remaining = totalAmount - depositCents;
        const balanced = rebalanceSchedule(rawSchedule, remaining);
        setSchedule(balanced);
        const changed = balanced.some((item, i) => item.amount !== rawSchedule[i]?.amount);
        if (changed) {
          onPaymentSettingsChange({
            ...paymentSettings,
            depositRequired: depReq,
            depositType: depType,
            depositAmount: depAmt,
            schedule: balanced,
          });
        }
      } else {
        setSchedule(rawSchedule);
      }
    } else {
      setDepositRequired(false);
      setDepositType('percentage');
      setDepositAmount(50);
      setSchedule([]);
      setShowPaymentSchedule(false);
      setAllowOnlinePayment(false);
      setAllowOfflinePayment(false);
      setShowFinancing(false);
      setCardFeeEnabled(false);
      setCardFeePercent(3);
    }
  }, [paymentSettings]);

  useEffect(() => {
    if (!depositRequired || schedule.length === 0) return;
    const depositCents = depositType === 'percentage'
      ? Math.round(totalAmount * (depositAmount / 100))
      : Math.round(depositAmount * 100);
    const remaining = totalAmount - depositCents;
    const balanced = rebalanceSchedule(schedule, remaining);
    const changed = balanced.some((item, i) => item.amount !== schedule[i]?.amount);
    if (changed) {
      setSchedule(balanced);
      updateAndEmit(depositRequired, depositType, depositAmount, balanced);
    }
  }, [totalAmount]);

  const getDepositAmountCents = (): number => {
    if (!depositRequired) return 0;
    if (depositType === 'percentage') {
      return Math.round(totalAmount * (depositAmount / 100));
    }
    return Math.round(depositAmount * 100);
  };

  const getRemainingAfterDeposit = (): number => {
    return totalAmount - getDepositAmountCents();
  };

  const getScheduleTotal = (): number => {
    return schedule.reduce((sum, item) => sum + (item.amount || 0), 0);
  };

  const updateAndEmit = (
    newDepositRequired: boolean,
    newDepositType: 'fixed' | 'percentage',
    newDepositAmount: number,
    newSchedule: PaymentScheduleItem[],
    newShowPaymentSchedule?: boolean,
    newAllowOnlinePayment?: boolean,
    newAllowOfflinePayment?: boolean,
    newShowFinancing?: boolean,
    newCardFeeEnabled?: boolean,
    newCardFeePercent?: number
  ) => {
    const showOnDoc = newShowPaymentSchedule ?? showPaymentSchedule;
    const onlinePayment = newAllowOnlinePayment ?? allowOnlinePayment;
    const offlinePayment = newAllowOfflinePayment ?? allowOfflinePayment;
    const financing = newShowFinancing ?? showFinancing;
    const cardFee = newCardFeeEnabled ?? cardFeeEnabled;
    const cardPct = newCardFeePercent ?? cardFeePercent;
    if (!newDepositRequired && newSchedule.length === 0 && !showOnDoc && !onlinePayment && !offlinePayment && !financing && !cardFee) {
      onPaymentSettingsChange(undefined);
      return;
    }
    onPaymentSettingsChange({
      depositRequired: newDepositRequired,
      depositType: newDepositType,
      depositAmount: newDepositAmount,
      schedule: newSchedule,
      showPaymentSchedule: showOnDoc,
      allowOnlinePayment: onlinePayment,
      allowOfflinePayment: offlinePayment,
      showFinancing: financing,
      cardFeeEnabled: cardFee,
      cardFeePercent: cardPct,
    });
  };

  const handleDepositToggle = (checked: boolean) => {
    setDepositRequired(checked);
    if (checked && schedule.length === 0) {
      const remaining = totalAmount - (depositType === 'percentage' ? Math.round(totalAmount * (depositAmount / 100)) : Math.round(depositAmount * 100));
      const newSchedule: PaymentScheduleItem[] = [{
        label: "Final Payment",
        amount: remaining,
        dueCondition: "upon_completion",
      }];
      setSchedule(newSchedule);
      updateAndEmit(checked, depositType, depositAmount, newSchedule);
    } else if (!checked) {
      setSchedule([]);
      updateAndEmit(false, depositType, depositAmount, []);
    } else {
      updateAndEmit(checked, depositType, depositAmount, schedule);
    }
  };

  const handleDepositTypeChange = (type: 'fixed' | 'percentage') => {
    setDepositType(type);
    const newDepAmt = type === 'percentage' ? 50 : Math.round(totalAmount / 2 / 100);
    setDepositAmount(newDepAmt);
    const depositCents = type === 'percentage' ? Math.round(totalAmount * (newDepAmt / 100)) : Math.round(newDepAmt * 100);
    const remaining = totalAmount - depositCents;
    const newSchedule = rebalanceSchedule(schedule, remaining);
    setSchedule(newSchedule);
    updateAndEmit(depositRequired, type, newDepAmt, newSchedule);
  };

  const handleDepositAmountChange = (val: string) => {
    const num = parseFloat(val) || 0;
    setDepositAmount(num);
    const depositCents = depositType === 'percentage' ? Math.round(totalAmount * (num / 100)) : Math.round(num * 100);
    const remaining = totalAmount - depositCents;
    const newSchedule = rebalanceSchedule(schedule, remaining);
    setSchedule(newSchedule);
    updateAndEmit(depositRequired, depositType, num, newSchedule);
  };

  const rebalanceSchedule = (sched: PaymentScheduleItem[], remaining: number): PaymentScheduleItem[] => {
    if (sched.length === 0) return [];
    const newSched = [...sched];
    if (newSched.length === 1) {
      newSched[0] = { ...newSched[0], amount: remaining };
    } else {
      const othersTotal = newSched.slice(0, -1).reduce((sum, item) => sum + (item.amount || 0), 0);
      const lastAmount = remaining - othersTotal;
      newSched[newSched.length - 1] = { ...newSched[newSched.length - 1], amount: Math.max(0, lastAmount) };
    }
    return newSched;
  };

  const handleAddPayment = () => {
    const remaining = getRemainingAfterDeposit();
    const newSchedule = [...schedule];
    if (newSchedule.length > 0) {
      const totalItems = newSchedule.length + 1;
      const evenSplit = Math.round(remaining / totalItems);
      const newItem: PaymentScheduleItem = {
        label: `Payment ${newSchedule.length}`,
        amount: evenSplit,
        dueCondition: "upon_start",
      };
      newSchedule.splice(newSchedule.length - 1, 0, newItem);
      for (let i = 0; i < newSchedule.length - 1; i++) {
        newSchedule[i] = { ...newSchedule[i], amount: evenSplit };
      }
    } else {
      newSchedule.push({
        label: "Final Payment",
        amount: remaining,
        dueCondition: "upon_completion",
      });
    }
    const balanced = rebalanceSchedule(newSchedule, remaining);
    setSchedule(balanced);
    updateAndEmit(depositRequired, depositType, depositAmount, balanced);
  };

  const handleRemovePayment = (index: number) => {
    const newSchedule = schedule.filter((_, i) => i !== index);
    const remaining = getRemainingAfterDeposit();
    const balanced = rebalanceSchedule(newSchedule, remaining);
    setSchedule(balanced);
    updateAndEmit(depositRequired, depositType, depositAmount, balanced);
  };

  const handleScheduleAmountChange = (index: number, val: string) => {
    const num = Math.round((parseFloat(val) || 0) * 100);
    const newSchedule = [...schedule];
    newSchedule[index] = { ...newSchedule[index], amount: num };
    const remaining = getRemainingAfterDeposit();
    if (index < newSchedule.length - 1) {
      const othersTotal = newSchedule.slice(0, -1).reduce((sum, item) => sum + (item.amount || 0), 0);
      newSchedule[newSchedule.length - 1] = { ...newSchedule[newSchedule.length - 1], amount: Math.max(0, remaining - othersTotal) };
    }
    setSchedule(newSchedule);
    updateAndEmit(depositRequired, depositType, depositAmount, newSchedule);
  };

  const handleScheduleLabelChange = (index: number, label: string) => {
    const newSchedule = [...schedule];
    newSchedule[index] = { ...newSchedule[index], label };
    setSchedule(newSchedule);
    updateAndEmit(depositRequired, depositType, depositAmount, newSchedule);
  };

  const handleScheduleConditionChange = (index: number, dueCondition: string) => {
    const newSchedule = [...schedule];
    newSchedule[index] = { ...newSchedule[index], dueCondition };
    setSchedule(newSchedule);
    updateAndEmit(depositRequired, depositType, depositAmount, newSchedule);
  };

  const depositCents = getDepositAmountCents();
  const remaining = getRemainingAfterDeposit();

  return (
    <div className="space-y-3" data-testid="payment-settings-section">
        <div className="space-y-4 pl-1">
          {!isInvoice && (
          <label className="flex items-center gap-3 cursor-pointer" data-testid="checkbox-deposit-required">
            <input
              type="checkbox"
              checked={depositRequired}
              onChange={(e) => handleDepositToggle(e.target.checked)}
              className="h-4 w-4 rounded border-input"
              disabled={disabled}
            />
            <span className="text-sm flex items-center gap-1">Require deposit <InfoTooltip text="Collect a portion of the project cost upfront before work begins. Deposits protect you from cancellations and help cover material costs." /></span>
          </label>
          )}

          {!isInvoice && depositRequired && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Select value={depositType} onValueChange={(v) => handleDepositTypeChange(v as 'fixed' | 'percentage')} disabled={disabled}>
                    <SelectTrigger className="w-[140px]" data-testid="select-deposit-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="z-[10001]">
                      <SelectItem value="percentage">
                        <span className="flex items-center gap-1.5"><Percent className="h-3 w-3" /> Percentage</span>
                      </SelectItem>
                      <SelectItem value="fixed">
                        <span className="flex items-center gap-1.5"><DollarSign className="h-3 w-3" /> Fixed Amount</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2 flex-1 min-w-[120px]">
                  {depositType === 'percentage' ? (
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        value={depositAmount || ''}
                        onChange={(e) => handleDepositAmountChange(e.target.value)}
                        className="w-20"
                        min={1}
                        max={99}
                        disabled={disabled}
                        data-testid="input-deposit-amount"
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-muted-foreground">$</span>
                      <Input
                        type="number"
                        value={depositAmount || ''}
                        onChange={(e) => handleDepositAmountChange(e.target.value)}
                        className="w-28"
                        min={0}
                        step={0.01}
                        disabled={disabled}
                        data-testid="input-deposit-amount"
                      />
                    </div>
                  )}
                </div>
              </div>

              {totalAmount > 0 && (
                <div className="text-sm space-y-1 bg-muted/50 rounded-md p-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Deposit amount</span>
                    <span className="font-medium" data-testid="text-deposit-amount">{formatCurrency(depositCents / 100)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Remaining balance</span>
                    <span className="font-medium" data-testid="text-remaining-balance">{formatCurrency(remaining / 100)}</span>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <Label className="text-sm font-medium flex items-center gap-1">Payment Schedule <InfoTooltip text="Split the remaining balance into multiple payments tied to project milestones. Common setups: 50% deposit + 50% on completion, or thirds (deposit, midpoint, completion)." /></Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddPayment}
                    disabled={disabled}
                    data-testid="button-add-payment"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add Payment
                  </Button>
                </div>

                {schedule.length === 0 && (
                  <p className="text-xs text-muted-foreground">No payment schedule set. Add payments to split the remaining balance.</p>
                )}

                {schedule.map((item, index) => {
                  const isLast = index === schedule.length - 1;
                  return (
                    <Card key={index} data-testid={`card-schedule-payment-${index}`}>
                      <CardContent className="pt-3 pb-3 space-y-2">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <Input
                            value={item.label}
                            onChange={(e) => handleScheduleLabelChange(index, e.target.value)}
                            placeholder="Payment label"
                            className="flex-1 min-w-[140px]"
                            disabled={disabled}
                            data-testid={`input-schedule-label-${index}`}
                          />
                          {schedule.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemovePayment(index)}
                              disabled={disabled}
                              data-testid={`button-remove-payment-${index}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                          <div className="flex items-center gap-1">
                            <span className="text-sm text-muted-foreground">$</span>
                            <Input
                              type="number"
                              value={item.amount ? (item.amount / 100).toFixed(2) : ''}
                              onChange={(e) => handleScheduleAmountChange(index, e.target.value)}
                              className="w-28"
                              min={0}
                              step={0.01}
                              disabled={disabled || (isLast && schedule.length > 1)}
                              data-testid={`input-schedule-amount-${index}`}
                            />
                            {isLast && schedule.length > 1 && (
                              <span className="text-xs text-muted-foreground whitespace-nowrap">(auto)</span>
                            )}
                          </div>
                          <Select
                            value={item.dueCondition || "upon_completion"}
                            onValueChange={(v) => handleScheduleConditionChange(index, v)}
                            disabled={disabled}
                          >
                            <SelectTrigger className="w-[160px]" data-testid={`select-schedule-condition-${index}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="z-[10001]">
                              {DEFAULT_DUE_CONDITIONS.map(c => (
                                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}

                {schedule.length > 0 && totalAmount > 0 && (
                  <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
                    <div className="flex justify-between">
                      <span>Deposit</span>
                      <span>{formatCurrency(depositCents / 100)}</span>
                    </div>
                    {schedule.map((item, i) => (
                      <div key={i} className="flex justify-between">
                        <span>{item.label || `Payment ${i + 1}`}</span>
                        <span>{formatCurrency((item.amount || 0) / 100)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between font-medium border-t pt-1 mt-1">
                      <span>Total</span>
                      <span>{formatCurrency((depositCents + getScheduleTotal()) / 100)}</span>
                    </div>
                  </div>
                )}

              </div>
            </div>
          )}

          {userTier === 'elite' && (
            <label className="flex items-center gap-3 cursor-pointer" data-testid="checkbox-allow-online-payment">
              <input
                type="checkbox"
                checked={allowOnlinePayment}
                onChange={(e) => {
                  setAllowOnlinePayment(e.target.checked);
                  updateAndEmit(depositRequired, depositType, depositAmount, schedule, undefined, e.target.checked);
                }}
                className="h-4 w-4 rounded border-input"
                disabled={false}
              />
              <div>
                <span className="text-sm flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5" />
                  Allow credit card payments
                  <InfoTooltip text="Enable online payments so customers can pay with a credit card via Stripe or Square. You'll need to connect a payment processor in Integrations first." />
                </span>
                <span className="text-xs text-muted-foreground">
                  Customer can pay online with a card (requires Stripe or Square in Integrations)
                </span>
              </div>
            </label>
          )}

          {userTier === 'elite' && allowOnlinePayment && (
            <div className="ml-7 space-y-2 -mt-1">
              {stateRestrictsSurcharge && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-900 dark:text-amber-200" data-testid="warning-surcharge-state">
                  <span className="font-semibold">Heads up — your company address is in {companyState?.toUpperCase()}.</span> Credit card surcharging is restricted by state law in CT, MA, and ME. Most contractors in these states absorb the fee instead. You can still turn it on if you've confirmed it's allowed for your situation, but you do so at your own discretion — Fuse Phone does not provide legal advice.
                </div>
              )}
              <label className="flex items-center gap-3 cursor-pointer" data-testid="checkbox-card-fee-enabled">
                <input
                  type="checkbox"
                  checked={cardFeeEnabled}
                  onChange={(e) => {
                    setCardFeeEnabled(e.target.checked);
                    updateAndEmit(depositRequired, depositType, depositAmount, schedule, undefined, undefined, undefined, undefined, e.target.checked);
                  }}
                  className="h-4 w-4 rounded border-input"
                  disabled={disabled}
                />
                <div>
                  <span className="text-sm flex items-center gap-1.5">
                    <Percent className="w-3.5 h-3.5" />
                    Pass card processing fee to customer
                    <InfoTooltip text="Add a percentage fee on top of the amount when the customer pays online with a card. Offline payments (Zelle, check) are never charged a fee. Note: surcharging credit cards is restricted in some states (CT, MA, ME). Verify rules in your service area." />
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Adds the fee on top of the charged amount; shown to the customer before they pay
                  </span>
                </div>
              </label>
              {cardFeeEnabled && (
                <div className="flex items-center gap-2 ml-7">
                  <span className="text-xs text-muted-foreground">Fee</span>
                  <Input
                    type="number"
                    value={cardFeePercent || ''}
                    onChange={(e) => {
                      const num = Math.max(0, Math.min(4, parseFloat(e.target.value) || 0));
                      setCardFeePercent(num);
                      updateAndEmit(depositRequired, depositType, depositAmount, schedule, undefined, undefined, undefined, undefined, undefined, num);
                    }}
                    className="w-20"
                    min={0}
                    max={4}
                    step={0.1}
                    disabled={disabled}
                    data-testid="input-card-fee-percent"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                  <span className="text-xs text-muted-foreground">(typical: 3.0%, max 4%)</span>
                </div>
              )}
            </div>
          )}

          <label className="flex items-center gap-3 cursor-pointer" data-testid="checkbox-allow-offline-payment">
            <input
              type="checkbox"
              checked={allowOfflinePayment}
              onChange={(e) => {
                setAllowOfflinePayment(e.target.checked);
                updateAndEmit(depositRequired, depositType, depositAmount, schedule, undefined, undefined, e.target.checked);
              }}
              className="h-4 w-4 rounded border-input"
              disabled={false}
            />
            <div>
              <span className="text-sm flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5" />
                Allow offline payment (Zelle, check, etc.)
                <InfoTooltip text="Show offline payment instructions to customers. They will see your payment instructions template (e.g. Zelle details, check mailing address) as an option when paying." />
              </span>
              <span className="text-xs text-muted-foreground">
                Customer sees your payment instructions for Zelle, check, or other offline methods
              </span>
            </div>
          </label>

          {!isInvoice && depositRequired && schedule.length > 0 && (
            <label className="flex items-center gap-3 cursor-pointer" data-testid="checkbox-show-payment-schedule">
              <input
                type="checkbox"
                checked={showPaymentSchedule}
                onChange={(e) => {
                  setShowPaymentSchedule(e.target.checked);
                  updateAndEmit(depositRequired, depositType, depositAmount, schedule, e.target.checked);
                }}
                className="h-4 w-4 rounded border-input"
                disabled={disabled}
              />
              <span className="text-sm">Include payment schedule on proposal</span>
            </label>
          )}

          {financingAvailable && !isInvoice && (
            <label className="flex items-center gap-3 cursor-pointer" data-testid="checkbox-show-financing">
              <input
                type="checkbox"
                checked={showFinancing}
                onChange={(e) => {
                  setShowFinancing(e.target.checked);
                  updateAndEmit(depositRequired, depositType, depositAmount, schedule, undefined, undefined, undefined, e.target.checked);
                }}
                className="h-4 w-4 rounded border-input"
                disabled={disabled}
              />
              <div>
                <span className="text-sm flex items-center gap-1.5">
                  <Banknote className="w-3.5 h-3.5" />
                  Show financing options
                  <InfoTooltip text="Display a 'Financing Available' section on the proposal so customers can apply for financing through your connected provider." />
                </span>
                <span className="text-xs text-muted-foreground">
                  Customer sees financing options with estimated monthly payment
                </span>
              </div>
            </label>
          )}
        </div>
    </div>
  );
}
