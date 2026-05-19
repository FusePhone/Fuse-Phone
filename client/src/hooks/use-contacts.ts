import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type CreateContactRequest, type UpdateContactRequest } from "@shared/routes";
import { authFetch } from "@/lib/queryClient";

export function useContacts(filters?: { type?: 'lead' | 'contact' | 'client', search?: string, archived?: boolean }) {
  const queryKey = [api.contacts.list.path, filters?.type, filters?.search, filters?.archived];
  
  return useQuery({
    queryKey,
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (filters?.type) params.type = filters.type;
      if (filters?.search) params.search = filters.search;
      if (filters?.archived) params.archived = 'true';
      
      const queryString = new URLSearchParams(params).toString();
      const url = `${api.contacts.list.path}${queryString ? `?${queryString}` : ''}`;

      const res = await authFetch(url);
      if (!res.ok) throw new Error(`${res.status}: Failed to fetch contacts`);
      return api.contacts.list.responses[200].parse(await res.json());
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useContact(id: number) {
  return useQuery({
    queryKey: [api.contacts.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.contacts.get.path, { id });
      const res = await authFetch(url);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`${res.status}: Failed to fetch contact`);
      return api.contacts.get.responses[200].parse(await res.json());
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateContactRequest) => {
      const res = await authFetch(api.contacts.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create contact");
      }
      return api.contacts.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.contacts.list.path] });
    },
  });
}

export function useUpdateContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: UpdateContactRequest }) => {
      const url = buildUrl(api.contacts.update.path, { id });
      const res = await authFetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to update contact");
      }
      return api.contacts.update.responses[200].parse(await res.json());
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [api.contacts.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.contacts.get.path, data.id] });
    },
  });
}

export function useDeleteContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.contacts.delete.path, { id });
      const res = await authFetch(url, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete contact");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.contacts.list.path] });
    },
  });
}
