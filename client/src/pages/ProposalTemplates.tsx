import { useProposalTemplates, useDeleteProposalTemplate } from "@/hooks/use-templates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, ArrowLeft, MoreVertical, Trash2, Edit } from "lucide-react";
import { useLocation } from "wouter";
import { useSafeBack } from "@/hooks/use-safe-back";
import { formatCurrency } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

function stripHtml(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
}

export default function ProposalTemplates() {
  const [, navigate] = useLocation();
  const handleBack = useSafeBack("/settings/templates");
  const { data: templates, isLoading } = useProposalTemplates();
  const deleteTemplate = useDeleteProposalTemplate();
  const { toast } = useToast();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<number | null>(null);

  const handleDelete = async () => {
    if (templateToDelete === null) return;
    try {
      await deleteTemplate.mutateAsync(templateToDelete);
      toast({ title: "Template deleted" });
    } catch (error) {
      toast({ title: "Failed to delete template", variant: "destructive" });
    }
    setDeleteDialogOpen(false);
    setTemplateToDelete(null);
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary" data-testid="loader-proposal-templates" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-6 pb-24 lg:p-8 lg:pb-24 animate-in fade-in duration-300">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleBack}
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold font-display">Proposal Templates</h1>
            <p className="text-muted-foreground">Reusable proposal structures with line items</p>
          </div>
        </div>
        <Button 
          onClick={() => navigate('/settings/proposal-templates/new')}
          data-testid="button-new-template"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Template
        </Button>
      </div>

      {(!templates || templates.length === 0) ? (
        <Card className="flex-1 flex flex-col items-center justify-center py-12">
          <p className="text-muted-foreground mb-4">No proposal templates yet</p>
          <Button 
            onClick={() => navigate('/settings/proposal-templates/new')}
            data-testid="button-create-first-template"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Your First Template
          </Button>
        </Card>
      ) : (
        <div className="flex-1 space-y-3 overflow-auto">
          {templates.map((template) => {
            const lineItems = (template.lineItems || []).filter(item => item != null);
            const lineItemNames = lineItems.map(item => item.name || stripHtml(item.description || '').substring(0, 30)).filter(Boolean);
            
            return (
              <Card 
                key={template.id}
                className="cursor-pointer hover-elevate transition-all"
                onClick={() => navigate(`/settings/proposal-templates/${template.id}/edit`)}
                data-testid={`card-template-${template.id}`}
              >
                <CardHeader className="py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base">{template.name}</CardTitle>
                      <div className="mt-1 space-y-1">
                        <p className="text-sm text-muted-foreground">
                          {lineItems.length} line item{lineItems.length !== 1 ? 's' : ''}
                          {lineItemNames.length > 0 && (
                            <span className="ml-2 text-xs">
                              ({lineItemNames.slice(0, 3).join(', ')}{lineItemNames.length > 3 ? '...' : ''})
                            </span>
                          )}
                        </p>
                        <p className="text-sm font-medium">
                          Total: {formatCurrency(template.totalAmount / 100)}
                        </p>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" data-testid={`button-template-menu-${template.id}`}>
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem 
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/settings/proposal-templates/${template.id}/edit`);
                          }}
                          data-testid={`menuitem-edit-${template.id}`}
                        >
                          <Edit className="w-4 h-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={(e) => {
                            e.stopPropagation();
                            setTemplateToDelete(template.id);
                            setDeleteDialogOpen(true);
                          }}
                          className="text-destructive"
                          data-testid={`menuitem-delete-${template.id}`}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this template? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
