import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { authFetch } from "@/lib/queryClient";
import type { Template, InsertTemplate, ProposalTemplate, InsertProposalTemplate, MessageTemplate } from "@shared/schema";

export function useTemplates() {
  return useQuery<Template[]>({
    queryKey: [api.templates.list.path],
    queryFn: async () => {
      const res = await authFetch(api.templates.list.path);
      if (!res.ok) throw new Error("Failed to fetch templates");
      return res.json();
    },
  });
}

export function useTemplate(slug: string) {
  return useQuery<Template | null>({
    queryKey: [api.templates.get.path, slug],
    queryFn: async () => {
      const res = await authFetch(api.templates.get.path.replace(':slug', slug));
      if (!res.ok) throw new Error("Failed to fetch template");
      return res.json();
    },
    enabled: !!slug,
  });
}

export function useUpsertTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: InsertTemplate) => {
      const res = await authFetch(api.templates.upsert.path.replace(':slug', data.slug), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to save template");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.templates.list.path] });
    },
  });
}

// Proposal Templates hooks
export function useProposalTemplates() {
  return useQuery<ProposalTemplate[]>({
    queryKey: [api.proposalTemplates.list.path],
    queryFn: async () => {
      const res = await authFetch(api.proposalTemplates.list.path);
      if (!res.ok) throw new Error("Failed to fetch proposal templates");
      return res.json();
    },
  });
}

export function useProposalTemplate(id: number) {
  return useQuery<ProposalTemplate | null>({
    queryKey: [api.proposalTemplates.get.path, id],
    queryFn: async () => {
      const res = await authFetch(api.proposalTemplates.get.path.replace(':id', String(id)));
      if (!res.ok) throw new Error("Failed to fetch proposal template");
      return res.json();
    },
    enabled: !!id,
  });
}

export function useCreateProposalTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: InsertProposalTemplate) => {
      const res = await authFetch(api.proposalTemplates.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create proposal template");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.proposalTemplates.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.proposalTemplates.get.path] });
    },
  });
}

export function useUpdateProposalTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<InsertProposalTemplate> & { id: number }) => {
      const res = await authFetch(api.proposalTemplates.update.path.replace(':id', String(id)), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update proposal template");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.proposalTemplates.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.proposalTemplates.get.path] });
    },
  });
}

export function useDeleteProposalTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await authFetch(api.proposalTemplates.delete.path.replace(':id', String(id)), {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to delete proposal template");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.proposalTemplates.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.proposalTemplates.get.path] });
    },
  });
}

// Message Templates hooks
export function useMessageTemplates() {
  return useQuery<MessageTemplate[]>({
    queryKey: [api.messageTemplates.list.path],
    queryFn: async () => {
      const res = await authFetch(api.messageTemplates.list.path);
      if (!res.ok) throw new Error("Failed to fetch message templates");
      return res.json();
    },
  });
}

export function useMessageTemplate(slug: string) {
  return useQuery<MessageTemplate | null>({
    queryKey: [api.messageTemplates.get.path, slug],
    queryFn: async () => {
      const res = await authFetch(api.messageTemplates.get.path.replace(':slug', slug));
      if (!res.ok) throw new Error("Failed to fetch message template");
      return res.json();
    },
    enabled: !!slug,
  });
}

export function useUpdateMessageTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ slug, content, emailSubject, emailContent, isEnabled, delayMinutes }: { slug: string; content: string; emailSubject?: string; emailContent?: string; isEnabled?: boolean; delayMinutes?: number | null }) => {
      const res = await authFetch(api.messageTemplates.upsert.path.replace(':slug', slug), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, emailSubject, emailContent, isEnabled, delayMinutes }),
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to save message template");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.messageTemplates.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.messageTemplates.get.path] });
    },
  });
}
