import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import PlanSelection from "@/pages/PlanSelection";

export default function SelectPlanPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const selectPlanMutation = useMutation({
    mutationFn: async (plan: 'starter' | 'core' | 'elite') => {
      const res = await apiRequest("POST", "/api/auth/select-plan", { plan });
      return await res.json();
    },
    onSuccess: async (data: any) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
      await queryClient.refetchQueries({ queryKey: ["/api/subscription"] });
      // requiresCheckout means the user must complete Stripe Checkout
      // (card capture + 14-day trial) before their subscription becomes active.
      const redirectTo = data.redirectTo || "/";
      if (data.requiresCheckout) {
        window.location.href = redirectTo;
      } else {
        setLocation(redirectTo);
      }
    },
    onError: (error: any) => {
      toast({ title: "Failed to select plan", description: error.message, variant: "destructive" });
    },
  });

  return (
    <PlanSelection
      onSelectPlan={(plan) => selectPlanMutation.mutate(plan)}
      isLoading={selectPlanMutation.isPending}
    />
  );
}
