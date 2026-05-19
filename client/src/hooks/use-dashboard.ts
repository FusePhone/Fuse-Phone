import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { authFetch } from "@/lib/queryClient";
import type { z } from "zod";

type DashboardStats = z.infer<typeof api.dashboard.stats.responses[200]>;
type DashboardPipeline = z.infer<typeof api.dashboard.pipeline.responses[200]>;

export function useDashboardStats() {
  return useQuery<DashboardStats>({
    queryKey: [api.dashboard.stats.path],
    queryFn: async () => {
      const res = await authFetch(api.dashboard.stats.path);
      if (!res.ok) {
        console.error("[Dashboard] Stats fetch failed:", res.status, res.statusText);
        throw new Error(`${res.status}: Failed to fetch dashboard stats`);
      }
      const json = await res.json();
      try {
        return api.dashboard.stats.responses[200].parse(json);
      } catch (parseErr) {
        console.error("[Dashboard] Stats parse error:", parseErr, "Raw data:", JSON.stringify(json).slice(0, 500));
        return json;
      }
    },
  });
}

export function useDashboardPipeline() {
  return useQuery<DashboardPipeline>({
    queryKey: [api.dashboard.pipeline.path],
    queryFn: async () => {
      const res = await authFetch(api.dashboard.pipeline.path);
      if (!res.ok) {
        console.error("[Dashboard] Pipeline fetch failed:", res.status, res.statusText);
        throw new Error(`${res.status}: Failed to fetch pipeline data`);
      }
      const json = await res.json();
      try {
        return api.dashboard.pipeline.responses[200].parse(json);
      } catch (parseErr) {
        console.error("[Dashboard] Pipeline parse error:", parseErr, "Raw data keys:", Object.keys(json));
        return json;
      }
    },
  });
}
