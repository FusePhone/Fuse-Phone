import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Bookmark, Loader2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type Entry =
  | { type: 'block'; block: any }
  | { type: 'line_item'; item: any };

interface Props {
  target: Entry | null;
  name: string;
  onNameChange: (s: string) => void;
  onClose: () => void;
}

export function SaveServiceTemplateDialog({ target, name, onNameChange, onClose }: Props) {
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: async () => {
      if (!target) return;
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Name required');
      const payload = target.type === 'block'
        ? { name: trimmed, type: 'production_rate', productionRateBlock: target.block }
        : { name: trimmed, type: 'line_item', lineItem: target.item };
      return await apiRequest('POST', '/api/service-templates', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/service-templates'] });
      toast({ title: 'Saved to library' });
      onClose();
    },
    onError: (e: any) => {
      toast({ title: 'Could not save', description: e?.message || 'Please try again', variant: 'destructive' });
    },
  });

  const open = target !== null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bookmark className="w-4 h-4" /> Save to Service Library
          </DialogTitle>
        </DialogHeader>
        <div className="py-2 space-y-3">
          <div>
            <Label htmlFor="svc-tpl-name">Template name</Label>
            <Input
              id="svc-tpl-name"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="e.g. Standard Bedroom Repaint"
              autoFocus
              data-testid="input-template-name"
            />
            <p className="text-xs text-muted-foreground mt-1">
              You'll be able to drop this into any future proposal from "From Library".
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} data-testid="button-cancel-save-template">Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !name.trim()} data-testid="button-confirm-save-template">
            {mutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Bookmark className="w-4 h-4 mr-1" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
