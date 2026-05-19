import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type CreateDocumentRequest, type UpdateDocumentRequest, type SignDocumentRequest } from "@shared/routes";
import { authFetch } from "@/lib/queryClient";

export function useDocuments(contactId?: number) {
  return useQuery({
    queryKey: [api.documents.list.path, contactId],
    queryFn: async () => {
      let url = api.documents.list.path;
      if (contactId) {
        url += `?contactId=${contactId}`;
      }
      const res = await authFetch(url);
      if (!res.ok) throw new Error(`${res.status}: Failed to fetch documents`);
      return api.documents.list.responses[200].parse(await res.json());
    },
  });
}

export function useDocument(id: number) {
  return useQuery({
    queryKey: [api.documents.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.documents.get.path, { id });
      const res = await authFetch(url);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`${res.status}: Failed to fetch document`);
      return api.documents.get.responses[200].parse(await res.json());
    },
    enabled: !!id,
  });
}

export function useCreateDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateDocumentRequest) => {
      const res = await authFetch(api.documents.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        if (res.status === 401) throw new Error("401: Session expired. Please refresh the page and sign in again.");
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.message || "Failed to create document");
      }
      return api.documents.create.responses[201].parse(await res.json());
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.documents.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.contacts.get.path, variables.contactId] });
    },
  });
}

export function useUpdateDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: UpdateDocumentRequest }) => {
      const url = buildUrl(api.documents.update.path, { id });
      const res = await authFetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        if (res.status === 401) throw new Error("401: Session expired. Please refresh the page and sign in again.");
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.message || "Failed to update document");
      }
      return api.documents.update.responses[200].parse(await res.json());
    },
    onSuccess: (data) => {
      // Merge the PUT response into the detail cache so the page that opened
      // the editor (DocumentDetail / proposal view) re-renders with the new
      // data instantly on close — no 1–2s stale-then-refetch flash.
      // IMPORTANT: keep relation fields the GET endpoint adds (e.g. `contact`)
      // since the PUT response does not include them.
      queryClient.setQueryData(
        [api.documents.get.path, data.id],
        (old: any) => (old ? { ...old, ...data, contact: old.contact ?? (data as any).contact } : old),
      );
      // Patch any list cache entries that include this document so the
      // documents list / contact view reflect the change immediately.
      queryClient.setQueriesData({ queryKey: [api.documents.list.path] }, (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.map((d: any) => (d?.id === data.id ? { ...d, ...data } : d));
      });
      // Background reconciliation — keeps caches consistent with server-side
      // derived fields (totals, signed status, etc.).
      queryClient.invalidateQueries({ queryKey: [api.documents.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.documents.get.path, data.id] });
      queryClient.invalidateQueries({ queryKey: [api.contacts.get.path, data.contactId] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/pipeline"] });
      queryClient.invalidateQueries({ queryKey: ["/api/metrics"] });
      if ((data as any).projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", (data as any).projectId] });
        queryClient.invalidateQueries({ queryKey: ["/api/documents", "project", (data as any).projectId] });
      }
    },
  });
}

export function useSignDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, signature, acceptedOptionalItems, acceptedOptionalAreas, excludedSurfaces }: { id: number; acceptedOptionalItems?: string[]; acceptedOptionalAreas?: string[]; excludedSurfaces?: string[] } & SignDocumentRequest) => {
      const url = buildUrl(api.documents.sign.path, { id });
      const res = await authFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature, acceptedOptionalItems, acceptedOptionalAreas, excludedSurfaces }),
      });
      if (!res.ok) throw new Error(`${res.status}: Failed to sign document`);
      return api.documents.sign.responses[200].parse(await res.json());
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [api.documents.get.path, data.id] });
      queryClient.invalidateQueries({ queryKey: [api.documents.list.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/pipeline"] });
      queryClient.invalidateQueries({ queryKey: ["/api/metrics"] });
      if ((data as any).projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", (data as any).projectId] });
        queryClient.invalidateQueries({ queryKey: ["/api/documents", "project", (data as any).projectId] });
      }
    },
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await authFetch(`/api/documents/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to delete document");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.documents.list.path] });
    },
  });
}
