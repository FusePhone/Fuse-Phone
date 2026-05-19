import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FlaskConical, CheckCircle, XCircle, Copy, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

interface TestAccount {
  purpose: string;
  email: string;
  password: string;
  loginMethod: string;
  notes: string;
  exists: boolean;
  id: string | null;
  subscriptionTier: string | null;
  subscriptionStatus: string | null;
  createdAt: string | null;
}

export default function AdminTestAccounts() {
  const { toast } = useToast();
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});

  const { data: accounts, isLoading } = useQuery<TestAccount[]>({
    queryKey: ["/api/admin/test-accounts"],
  });

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied` });
  };

  const togglePassword = (email: string) => {
    setVisiblePasswords(prev => ({ ...prev, [email]: !prev[email] }));
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="h-40 bg-muted rounded" />
          <div className="h-40 bg-muted rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6" data-testid="admin-test-accounts-page">
      <div className="flex items-center gap-3">
        <FlaskConical className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Test Accounts</h1>
      </div>
      <p className="text-muted-foreground text-sm">
        Accounts used for third-party platform reviews and integration testing.
      </p>

      <div className="space-y-4">
        {accounts?.map((account) => (
          <Card key={account.email} data-testid={`card-test-account-${account.email}`}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{account.purpose}</CardTitle>
                <div className="flex items-center gap-2">
                  {account.exists ? (
                    <Badge variant="default" className="bg-green-600" data-testid={`badge-status-${account.email}`}>
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="destructive" data-testid={`badge-status-${account.email}`}>
                      <XCircle className="h-3 w-3 mr-1" />
                      Not Created
                    </Badge>
                  )}
                  {account.subscriptionTier && (
                    <Badge variant="outline" data-testid={`badge-tier-${account.email}`}>
                      {account.subscriptionTier}
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Email</label>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="text-sm bg-muted px-2 py-1 rounded flex-1" data-testid={`text-email-${account.email}`}>
                      {account.email}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => copyToClipboard(account.email, "Email")}
                      data-testid={`button-copy-email-${account.email}`}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Password / Auth</label>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="text-sm bg-muted px-2 py-1 rounded flex-1" data-testid={`text-password-${account.email}`}>
                      {visiblePasswords[account.email] ? account.password : "••••••••••"}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => togglePassword(account.email)}
                      data-testid={`button-toggle-password-${account.email}`}
                    >
                      {visiblePasswords[account.email] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => copyToClipboard(account.password, "Password")}
                      data-testid={`button-copy-password-${account.email}`}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Login Method</label>
                  <p className="text-sm mt-1" data-testid={`text-login-method-${account.email}`}>{account.loginMethod}</p>
                </div>
                {account.createdAt && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Created</label>
                    <p className="text-sm mt-1">{new Date(account.createdAt).toLocaleDateString()}</p>
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes</label>
                <p className="text-sm mt-1 text-muted-foreground" data-testid={`text-notes-${account.email}`}>{account.notes}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
