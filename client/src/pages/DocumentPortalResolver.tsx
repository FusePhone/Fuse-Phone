import { useQuery } from "@tanstack/react-query";
import { Loader2, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ForceLightTheme } from "@/components/ForceLightTheme";
import CustomerPortal from "./CustomerPortal";

interface Props {
  params: {
    slug?: string;
    docType: string;
    docId: string;
  };
}

export default function DocumentPortalResolver({ params }: Props) {
  const { slug, docType, docId } = params;
  const docTypeSlug = docType === 'change_order' ? 'change-order' : docType;

  const { data, isLoading, error } = useQuery<{ token: string }>({
    queryKey: ['/api/public', slug || 'custom-domain', 'document', docTypeSlug, docId],
    queryFn: async () => {
      const url = slug
        ? `/api/public/${slug}/document/${docTypeSlug}/${docId}`
        : `/api/public/custom-domain/document/${docTypeSlug}/${docId}`;
      console.log(`[DocResolver] Fetching: ${url} (host: ${window.location.host}, origin: ${window.location.origin})`);
      const res = await fetch(url);
      console.log(`[DocResolver] Response: status=${res.status} url=${url}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Document not found' }));
        console.error(`[DocResolver] Error: ${err.message} for ${url}`);
        throw new Error(err.message || 'Document not found');
      }
      const result = await res.json();
      console.log(`[DocResolver] Resolved token: ${result.token?.substring(0, 8)}...`);
      return result;
    },
    retry: false,
  });

  if (isLoading) {
    return (
      <ForceLightTheme>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <Loader2 className="w-10 h-10 animate-spin text-gray-500" />
        </div>
      </ForceLightTheme>
    );
  }

  if (error || !data?.token) {
    return (
      <ForceLightTheme>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
          <Card className="max-w-md w-full bg-white border-gray-200">
            <CardContent className="pt-6 text-center space-y-4">
              <AlertCircle className="w-16 h-16 text-red-500 mx-auto" />
              <h2 className="text-xl font-bold text-gray-900">Document Not Found</h2>
              <p className="text-gray-500">
                This document may have been removed or the link is invalid.
              </p>
            </CardContent>
          </Card>
        </div>
      </ForceLightTheme>
    );
  }

  return <CustomerPortal params={{ token: data.token }} />;
}
