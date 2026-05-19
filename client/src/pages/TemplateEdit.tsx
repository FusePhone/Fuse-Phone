import { useTemplates, useUpsertTemplate } from "@/hooks/use-templates";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useRef } from "react";
import { Loader2, ArrowLeft, Save } from "lucide-react";
import { useRoute, useLocation } from "wouter";
import { useSafeBack } from "@/hooks/use-safe-back";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const templateConfigs = [
  {
    slug: 'terms_and_conditions' as const,
    title: 'Terms and Conditions',
    placeholder: 'Enter your terms and conditions...'
  },
  {
    slug: 'standard_expectations' as const,
    title: 'Standard Expectations',
    placeholder: 'Enter your standard expectations...'
  }
];

function htmlToPlainText(html: string): string {
  if (!html) return '';
  let text = html;
  text = text.replace(/<li[^>]*>/gi, '- ');
  text = text.replace(/<\/li>/gi, '\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n');
  text = text.replace(/<\/div>/gi, '\n');
  text = text.replace(/<\/h[1-6]>/gi, '\n');
  text = text.replace(/<[^>]*>/g, '');
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.trim();
  return text;
}

function plainTextToHtml(text: string): string {
  if (!text) return '';
  const lines = text.split('\n');
  const result: string[] = [];
  let inList = false;

  for (const line of lines) {
    const bulletMatch = line.match(/^[\-\*•]\s*(.*)$/);
    if (bulletMatch) {
      if (!inList) {
        result.push('<ul>');
        inList = true;
      }
      result.push(`<li><p>${bulletMatch[1]}</p></li>`);
    } else {
      if (inList) {
        result.push('</ul>');
        inList = false;
      }
      if (line.trim()) {
        result.push(`<p>${line}</p>`);
      } else {
        result.push('<p></p>');
      }
    }
  }
  if (inList) result.push('</ul>');
  return result.join('');
}

export default function TemplateEdit() {
  const [, params] = useRoute("/settings/templates/:slug/edit");
  const [, navigate] = useLocation();
  const handleBack = useSafeBack("/settings/templates");
  const { toast } = useToast();
  
  const { data: templates, isLoading } = useTemplates();
  const { mutate: upsertTemplate, isPending } = useUpsertTemplate();
  
  const [content, setContent] = useState('');
  const [hasLoaded, setHasLoaded] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const slug = params?.slug as 'terms_and_conditions' | 'standard_expectations';
  const config = templateConfigs.find(c => c.slug === slug);

  useEffect(() => {
    if (templates && !hasLoaded && config) {
      const template = templates.find(t => t.slug === slug);
      const plainText = htmlToPlainText(template?.content || '');
      setContent(plainText);
      setHasLoaded(true);
    }
  }, [templates, hasLoaded, slug, config]);

  useEffect(() => {
    if (hasLoaded && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [hasLoaded]);

  const handleSave = () => {
    if (!config) return;
    
    const htmlContent = plainTextToHtml(content);
    
    upsertTemplate(
      { slug, content: htmlContent, title: config.title },
      {
        onSuccess: () => {
          toast({
            title: "Template saved",
            description: `${config.title} has been updated successfully.`
          });
          navigate('/settings/templates');
        },
        onError: () => {
          toast({
            title: "Error",
            description: "Failed to save template. Please try again.",
            variant: "destructive"
          });
        }
      }
    );
  };

  if (!config) {
    return (
      <div className="p-4">
        <p>Template not found</p>
        <Button variant="ghost" onClick={handleBack} data-testid="button-back-templates">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Templates
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col" data-testid="template-editor">
      <div className="sticky top-0 z-50 bg-background border-b">
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleBack}
              data-testid="button-back-templates"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-lg font-bold truncate">{config.title}</h1>
          </div>
          <Button
            onClick={handleSave}
            disabled={isPending}
            data-testid="button-save-template"
          >
            {isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save
          </Button>
        </div>
      </div>

      <div className="flex-1 p-4">
        <Textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={config.placeholder}
          className="min-h-[calc(100vh-120px)] resize-none text-base leading-relaxed"
          data-testid="textarea-template-content"
        />
        <p className="text-xs text-muted-foreground mt-2">
          Use "- " at the start of a line for bullet points
        </p>
      </div>
    </div>
  );
}
