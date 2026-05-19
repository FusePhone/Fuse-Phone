import { useEditor, EditorContent, Editor, Extension } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import FontFamily from '@tiptap/extension-font-family';
import { DOMParser as PMDOMParser } from 'prosemirror-model';
import { Button } from "@/components/ui/button";
import { 
  Bold, 
  Italic, 
  List, 
  ListOrdered, 
  Highlighter,
  Type,
  Undo2,
  Redo2,
  Palette,
  ChevronDown,
} from "lucide-react";
import { useEffect, useState, useRef, useCallback } from 'react';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';

function isSeparatorLine(text: string): boolean {
  if (!text || text.length === 0) return false;
  if (/^[\s]*[\u2E3A\u2E3B]+[\s]*$/.test(text)) return true;
  if (/^[\s]*[—–─━]{1,}[\s]*$/.test(text)) return true;
  return /^[\s]*[\-=_~\u2500-\u257F\u2580-\u259F]{2,}[\s]*$/.test(text);
}

function isHeadingLine(line: string, lines: string[], index: number): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 80) return false;
  if (trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*')) return false;
  if (/^\d+[.\)]/.test(trimmed)) return false;
  const words = trimmed.split(/\s+/);
  if (words.length > 8) return false;
  const prevLine = index > 0 ? lines[index - 1]?.trim() : '';
  const nextLine = index < lines.length - 1 ? lines[index + 1]?.trim() : '';
  const prevEmpty = !prevLine || isSeparatorLine(prevLine);
  const nextEmpty = !nextLine || isSeparatorLine(nextLine);
  if (prevEmpty && nextEmpty && !trimmed.endsWith('.') && !trimmed.endsWith(',')) {
    return true;
  }
  return false;
}

function convertPlainTextToHtml(text: string): string {
  const lines = text.split('\n');
  let result: string[] = [];
  let inList = false;
  let listType: 'ul' | 'ol' | null = null;
  let lastWasEmpty = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (isSeparatorLine(trimmed)) {
      continue;
    }

    const bulletMatch = line.match(/^[\t\s]*[•\*]\s+(.*)$/) || line.match(/^[\t\s]*\-\s+(.+)$/);
    const numberedMatch = line.match(/^[\t\s]*(\d+)[.\)]\s+(.*)$/);

    if (bulletMatch) {
      lastWasEmpty = false;
      if (!inList || listType !== 'ul') {
        if (inList) result.push(listType === 'ul' ? '</ul>' : '</ol>');
        result.push('<ul>');
        inList = true;
        listType = 'ul';
      }
      result.push(`<li><p>${bulletMatch[1]}</p></li>`);
    } else if (numberedMatch) {
      lastWasEmpty = false;
      if (!inList || listType !== 'ol') {
        if (inList) result.push(listType === 'ul' ? '</ul>' : '</ol>');
        result.push('<ol>');
        inList = true;
        listType = 'ol';
      }
      result.push(`<li><p>${numberedMatch[2]}</p></li>`);
    } else {
      if (inList) {
        result.push(listType === 'ul' ? '</ul>' : '</ol>');
        inList = false;
        listType = null;
      }
      if (trimmed) {
        lastWasEmpty = false;
        if (isHeadingLine(line, lines, i)) {
          result.push(`<p><strong>${trimmed}</strong></p>`);
        } else {
          result.push(`<p>${line}</p>`);
        }
      } else {
        lastWasEmpty = true;
      }
    }
  }

  if (inList) {
    result.push(listType === 'ul' ? '</ul>' : '</ol>');
  }

  return result.join('');
}

const ALLOWED_TAGS = new Set([
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's',
  'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'span', 'mark', 'sub', 'sup',
  'blockquote', 'pre', 'code',
]);

function sanitizeExternalHtml(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  function cleanNode(node: Node): Node | null {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.cloneNode(true);
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return null;
    const el = node as HTMLElement;
    const tagName = el.tagName.toLowerCase();

    if (!ALLOWED_TAGS.has(tagName)) {
      const fragment = document.createDocumentFragment();
      el.childNodes.forEach(child => {
        const cleaned = cleanNode(child);
        if (cleaned) fragment.appendChild(cleaned);
      });
      return fragment;
    }

    const newEl = document.createElement(tagName);

    if (tagName === 'span') {
      const fontSize = el.style.fontSize;
      const color = el.style.color;
      const fontFamily = el.style.fontFamily;
      const styles: string[] = [];
      if (fontSize) styles.push(`font-size: ${fontSize}`);
      if (color) styles.push(`color: ${color}`);
      if (fontFamily) styles.push(`font-family: ${fontFamily}`);
      if (styles.length > 0) {
        newEl.setAttribute('style', styles.join('; '));
      }
    }

    if (tagName === 'mark') {
      const bgColor = el.style.backgroundColor;
      if (bgColor) {
        newEl.setAttribute('data-color', bgColor);
        newEl.setAttribute('style', `background-color: ${bgColor}`);
      }
    }

    el.childNodes.forEach(child => {
      const cleaned = cleanNode(child);
      if (cleaned) newEl.appendChild(cleaned);
    });

    return newEl;
  }

  const result = document.createDocumentFragment();
  doc.body.childNodes.forEach(child => {
    const cleaned = cleanNode(child);
    if (cleaned) result.appendChild(cleaned);
  });

  const wrapper = document.createElement('div');
  wrapper.appendChild(result);

  let output = wrapper.innerHTML;
  output = output.replace(/<li>\s*(?!<p>)(.*?)(?:<\/p>)?\s*<\/li>/gi, (match, content) => {
    if (content.startsWith('<p>')) return match;
    return `<li><p>${content}</p></li>`;
  });
  output = output.replace(/(<p>\s*(<br\s*\/?>)?\s*<\/p>\s*){2,}/gi, '<p></p>');
  output = output.replace(/<hr\s*\/?>/gi, '');
  return output;
}

function convertHtmlBulletsToLists(html: string): string {
  if (!html) return html;
  if (!html.match(/[\t\s]*[•][\t\s]+/)) return html;
  if (html.includes('<ul>') || html.includes('<ol>')) return html;

  let result = html.replace(/<br\s*\/?>/gi, '<br>');
  const segments = result.split(/<br>/);
  let processedSegments: string[] = [];
  let listBuffer: string[] = [];

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const bulletMatch = segment.match(/^[\t\s]*[•][\t\s]+(.*)$/);

    if (bulletMatch) {
      listBuffer.push(`<li><p>${bulletMatch[1].trim()}</p></li>`);
    } else {
      if (listBuffer.length > 0) {
        processedSegments.push('<ul>' + listBuffer.join('') + '</ul>');
        listBuffer = [];
      }
      if (segment.trim()) {
        processedSegments.push(segment);
      }
    }
  }

  if (listBuffer.length > 0) {
    processedSegments.push('<ul>' + listBuffer.join('') + '</ul>');
  }

  result = '';
  for (let i = 0; i < processedSegments.length; i++) {
    const seg = processedSegments[i];
    if (seg.startsWith('<ul>')) {
      result += seg;
    } else if (result && !result.endsWith('</ul>')) {
      result += '<br>' + seg;
    } else {
      result += seg;
    }
  }

  return result || html;
}

function isEmptyParagraph(el: Element): boolean {
  const text = (el.textContent || '').replace(/\u00a0/g, '').trim();
  if (text.length > 0) return false;
  const hasOnlyBr = el.children.length <= 1 && (!el.children.length || el.children[0]?.tagName === 'BR');
  return hasOnlyBr || el.innerHTML.trim() === '' || el.innerHTML.trim() === '<br>';
}

function cleanupHtmlSpacing(html: string): string {
  if (!html) return html;
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const allP = Array.from(doc.body.querySelectorAll('p'));
  for (const el of allP) {
    const text = (el.textContent || '').replace(/\u00a0/g, ' ').trim();
    if (isSeparatorLine(text)) {
      el.remove();
    }
  }

  const topNodes = Array.from(doc.body.childNodes);
  for (const node of topNodes) {
    if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === 'P') {
      if (isEmptyParagraph(node as Element)) {
        node.parentNode?.removeChild(node);
      }
    }
  }

  return doc.body.innerHTML;
}

interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  nestedScroll?: boolean;
  stickyToolbar?: boolean;
  bottomToolbar?: boolean;
  toolbarOnly?: boolean;
  contentOnly?: boolean;
  headerMode?: boolean;
  onBack?: () => void;
  onSave?: () => void;
  isSaving?: boolean;
  autoSaveStatus?: 'idle' | 'saving' | 'saved';
  showToolbar?: boolean;
  noBorder?: boolean;
}

const fonts = [
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Times New Roman', value: 'Times New Roman, serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Verdana', value: 'Verdana, sans-serif' },
  { label: 'Tahoma', value: 'Tahoma, sans-serif' },
  { label: 'Trebuchet MS', value: 'Trebuchet MS, sans-serif' },
  { label: 'Calibri', value: 'Calibri, sans-serif' },
  { label: 'Helvetica', value: 'Helvetica, Arial, sans-serif' },
  { label: 'Courier New', value: 'Courier New, monospace' },
  { label: 'Garamond', value: 'Garamond, serif' },
];

const fontSizes = [
  { label: '8', value: '8px' },
  { label: '10', value: '10px' },
  { label: '12', value: '12px' },
  { label: '14', value: '14px' },
  { label: '16', value: '16px' },
  { label: '18', value: '18px' },
  { label: '20', value: '20px' },
  { label: '22', value: '22px' },
  { label: '24', value: '24px' },
  { label: '26', value: '26px' },
  { label: '28', value: '28px' },
];

const textColors = [
  { label: 'Default', value: 'inherit', className: 'bg-foreground' },
  { label: 'Grey', value: '#6b7280', className: 'bg-gray-500' },
  { label: 'Blue', value: '#2563eb', className: 'bg-blue-600' },
  { label: 'Green', value: '#16a34a', className: 'bg-green-600' },
  { label: 'Red', value: '#dc2626', className: 'bg-red-600' },
];

const highlightColors = [
  { label: 'None', value: 'none', className: 'bg-transparent' },
  { label: 'Yellow', value: '#fef08a', className: 'bg-yellow-200' },
  { label: 'Green', value: '#bbf7d0', className: 'bg-green-200' },
  { label: 'Blue', value: '#bfdbfe', className: 'bg-blue-200' },
];

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (size: string) => ReturnType;
      unsetFontSize: () => ReturnType;
    };
  }
}

const FontSize = Extension.create({
  name: 'fontSize',
  addOptions() {
    return {
      types: ['textStyle'],
    };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: element => element.style.fontSize?.replace(/['"]+/g, ''),
            renderHTML: attributes => {
              if (!attributes.fontSize) {
                return {};
              }
              return {
                style: `font-size: ${attributes.fontSize}`,
              };
            },
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setFontSize: (fontSize: string) => ({ chain }) => {
        return chain()
          .setMark('textStyle', { fontSize })
          .run();
      },
      unsetFontSize: () => ({ chain }) => {
        return chain()
          .setMark('textStyle', { fontSize: null })
          .removeEmptyTextStyle()
          .run();
      },
    };
  },
});

function MenuBar({ editor }: { editor: Editor | null }) {
  const [fontOpen, setFontOpen] = useState(false);
  const [sizeOpen, setSizeOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [highlightOpen, setHighlightOpen] = useState(false);
  const savedSel = useRef<{ from: number; to: number } | null>(null);
  const fontRef = useRef<HTMLDivElement>(null);
  const sizeRef = useRef<HTMLDivElement>(null);
  const colorRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  const saveSel = useCallback(() => {
    if (editor) {
      savedSel.current = {
        from: editor.state.selection.from,
        to: editor.state.selection.to,
      };
    }
  }, [editor]);

  const applyWithSelection = useCallback((fn: () => void) => {
    if (editor && savedSel.current) {
      editor.chain().focus().setTextSelection(savedSel.current).run();
    }
    setTimeout(fn, 10);
  }, [editor]);

  // Close dropdown when clicking outside
  const useOutsideClose = (ref: React.RefObject<HTMLDivElement | null>, setOpen: (v: boolean) => void, isOpen: boolean) => {
    useEffect(() => {
      if (!isOpen) return;
      const handler = (e: MouseEvent | TouchEvent) => {
        if (ref.current && !ref.current.contains(e.target as Node)) {
          setOpen(false);
        }
      };
      document.addEventListener('mousedown', handler);
      document.addEventListener('touchstart', handler);
      return () => {
        document.removeEventListener('mousedown', handler);
        document.removeEventListener('touchstart', handler);
      };
    }, [isOpen]);
  };

  useOutsideClose(fontRef, setFontOpen, fontOpen);
  useOutsideClose(sizeRef, setSizeOpen, sizeOpen);
  useOutsideClose(colorRef, setColorOpen, colorOpen);
  useOutsideClose(highlightRef, setHighlightOpen, highlightOpen);

  if (!editor) {
    return null;
  }

  const toggleDropdown = (which: string, e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    saveSel();
    setFontOpen(which === 'font' ? !fontOpen : false);
    setSizeOpen(which === 'size' ? !sizeOpen : false);
    setColorOpen(which === 'color' ? !colorOpen : false);
    setHighlightOpen(which === 'highlight' ? !highlightOpen : false);
  };

  const closeAll = () => {
    setFontOpen(false);
    setSizeOpen(false);
    setColorOpen(false);
    setHighlightOpen(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-1 p-2 pt-3 border-b bg-background rounded-t-md">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        data-testid="button-undo"
      >
        <Undo2 className="h-4 w-4" />
      </Button>
      
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        data-testid="button-redo"
      >
        <Redo2 className="h-4 w-4" />
      </Button>

      <div className="w-px h-6 bg-border mx-1" />

      <Button
        type="button"
        variant={editor.isActive('bold') ? 'secondary' : 'ghost'}
        size="icon"
        className="h-8 w-8"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleBold().run()}
        data-testid="button-bold"
      >
        <Bold className="h-4 w-4" />
      </Button>
      
      <Button
        type="button"
        variant={editor.isActive('italic') ? 'secondary' : 'ghost'}
        size="icon"
        className="h-8 w-8"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        data-testid="button-italic"
      >
        <Italic className="h-4 w-4" />
      </Button>

      <div className="w-px h-6 bg-border mx-1" />

      <Button
        type="button"
        variant={editor.isActive('bulletList') ? 'secondary' : 'ghost'}
        size="icon"
        className="h-8 w-8"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        data-testid="button-bullet-list"
      >
        <List className="h-4 w-4" />
      </Button>
      
      <Button
        type="button"
        variant={editor.isActive('orderedList') ? 'secondary' : 'ghost'}
        size="icon"
        className="h-8 w-8"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        data-testid="button-ordered-list"
      >
        <ListOrdered className="h-4 w-4" />
      </Button>

      <div className="w-px h-6 bg-border mx-1" />

      {/* Font Family - custom dropdown */}
      <div className="relative" ref={fontRef}>
        <button
          type="button"
          className="h-8 px-2 inline-flex items-center gap-1 rounded-md text-sm border border-input bg-background hover:bg-accent"
          onMouseDown={(e) => toggleDropdown('font', e)}
          data-testid="button-font"
        >
          <Type className="h-3 w-3" />
          <span className="text-xs">Font</span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </button>
        {fontOpen && (
          <div className="absolute top-full left-0 mt-1 bg-background border rounded-md shadow-lg z-[9999] w-48 py-1 max-h-[250px] overflow-y-auto">
            {fonts.map((font) => (
              <div
                key={font.value}
                className="px-3 py-2 text-sm cursor-pointer hover:bg-accent active:bg-accent/80"
                style={{ fontFamily: font.value }}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  applyWithSelection(() => {
                    editor.chain().focus().setFontFamily(font.value).run();
                  });
                  closeAll();
                }}
                data-testid={`font-option-${font.label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                {font.label}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Font Size - custom dropdown */}
      <div className="relative" ref={sizeRef}>
        <button
          type="button"
          className="h-8 px-2 inline-flex items-center gap-1 rounded-md text-sm border border-input bg-background hover:bg-accent"
          onMouseDown={(e) => toggleDropdown('size', e)}
          data-testid="button-font-size"
        >
          <span className="text-xs">Size</span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </button>
        {sizeOpen && (
          <div className="absolute top-full left-0 mt-1 bg-background border rounded-md shadow-lg z-[9999] w-28 py-1">
            {fontSizes.map((size) => (
              <div
                key={size.value}
                className="px-3 py-2 text-sm cursor-pointer hover:bg-accent active:bg-accent/80"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  applyWithSelection(() => {
                    editor.chain().focus().setFontSize(size.value).run();
                  });
                  closeAll();
                }}
                data-testid={`size-option-${size.label.toLowerCase()}`}
              >
                {size.label}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="w-px h-6 bg-border mx-1" />

      {/* Text Color - custom dropdown */}
      <div className="relative" ref={colorRef}>
        <button
          type="button"
          className="h-8 px-2 inline-flex items-center gap-1 rounded-md text-sm border border-input bg-background hover:bg-accent"
          onMouseDown={(e) => toggleDropdown('color', e)}
          data-testid="button-color"
        >
          <div 
            className="w-3 h-3 rounded-full border" 
            style={{ backgroundColor: editor.getAttributes('textStyle').color || 'currentColor' }}
          />
          <span className="text-xs">Color</span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </button>
        {colorOpen && (
          <div className="absolute top-full left-0 mt-1 bg-background border rounded-md shadow-lg z-[9999] w-36 py-1">
            {textColors.map((color) => (
              <div
                key={color.value}
                className="px-3 py-2 text-sm cursor-pointer hover:bg-accent active:bg-accent/80 flex items-center gap-2"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  applyWithSelection(() => {
                    if (color.value === 'inherit') {
                      editor.chain().focus().unsetColor().run();
                    } else {
                      editor.chain().focus().setColor(color.value).run();
                    }
                  });
                  closeAll();
                }}
                data-testid={`color-option-${color.label.toLowerCase()}`}
              >
                <div 
                  className="w-4 h-4 rounded-full border flex-shrink-0" 
                  style={{ backgroundColor: color.value === 'inherit' ? 'currentColor' : color.value }}
                />
                {color.label}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Highlight - custom dropdown */}
      <div className="relative" ref={highlightRef}>
        <button
          type="button"
          className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-input bg-background hover:bg-accent"
          onMouseDown={(e) => toggleDropdown('highlight', e)}
          data-testid="button-highlight"
        >
          <Highlighter className="h-4 w-4" />
        </button>
        {highlightOpen && (
          <div className="absolute top-full right-0 mt-1 bg-background border rounded-md shadow-lg z-[9999] w-36 py-1">
            {highlightColors.map((color) => (
              <div
                key={color.value}
                className="px-3 py-2 text-sm cursor-pointer hover:bg-accent active:bg-accent/80 flex items-center gap-2"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  applyWithSelection(() => {
                    if (color.value === 'none') {
                      editor.chain().focus().unsetHighlight().run();
                    } else {
                      editor.chain().focus().toggleHighlight({ color: color.value }).run();
                    }
                  });
                  closeAll();
                }}
                data-testid={`highlight-option-${color.label.toLowerCase()}`}
              >
                <div 
                  className="w-4 h-4 rounded border flex-shrink-0" 
                  style={{ backgroundColor: color.value === 'none' ? 'transparent' : color.value }}
                />
                {color.label}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Bottom toolbar editor - stays above iOS keyboard using visualViewport API
function BottomToolbarEditor({ editor, showToolbar = true }: { editor: Editor | null; showToolbar?: boolean }) {
  const [toolbarBottom, setToolbarBottom] = useState(0);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const updatePosition = () => {
      // Calculate how much the viewport has shrunk (keyboard height)
      const keyboardHeight = window.innerHeight - viewport.height - viewport.offsetTop;
      setToolbarBottom(Math.max(0, keyboardHeight));
    };

    viewport.addEventListener('resize', updatePosition);
    viewport.addEventListener('scroll', updatePosition);
    updatePosition();

    return () => {
      viewport.removeEventListener('resize', updatePosition);
      viewport.removeEventListener('scroll', updatePosition);
    };
  }, []);

  if (!editor) return null;

  return (
    <div className="h-full flex flex-col relative" data-testid="rich-text-editor">
      {/* Scrollable content area - leave room for fixed toolbar when visible */}
      <div 
        className="flex-1 overflow-y-auto p-4 border rounded-md bg-background" 
        style={{ paddingBottom: showToolbar ? '60px' : '0' }}
      >
        <EditorContent editor={editor} />
      </div>
      {/* Fixed toolbar at bottom - only visible when showToolbar is true */}
      {showToolbar && (
        <div 
          className="fixed left-0 right-0 bg-background border-t shadow-[0_-2px_10px_rgba(0,0,0,0.1)] z-[10002]"
          style={{ bottom: `${toolbarBottom}px` }}
        >
          <MenuBar editor={editor} />
        </div>
      )}
    </div>
  );
}

export function RichTextEditor({ content, onChange, placeholder = "Enter description...", nestedScroll = false, stickyToolbar = false, bottomToolbar = false, toolbarOnly = false, contentOnly = false, headerMode = false, onBack, onSave, isSaving = false, autoSaveStatus = 'idle', showToolbar = true, noBorder = false }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bulletList: {
          keepMarks: true,
          keepAttributes: true,
        },
        orderedList: {
          keepMarks: true,
          keepAttributes: true,
        },
      }),
      TextStyle,
      Color.configure({
        types: ['textStyle'],
      }),
      Highlight.configure({
        multicolor: true,
      }),
      FontFamily.configure({
        types: ['textStyle'],
      }),
      FontSize,
    ],
    content: cleanupHtmlSpacing(convertHtmlBulletsToLists(content || '')),
    onUpdate: ({ editor }) => {
      isInternalUpdate.current = true;
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[100px] p-3',
        'data-placeholder': placeholder,
        'style': 'user-select: text; -webkit-user-select: text;',
      },
      handleDOMEvents: {
        touchstart: () => { return false; },
        touchmove: () => { return false; },
        touchend: () => { return false; },
      },
      handlePaste: (view, event) => {
        const clipboardHtml = event.clipboardData?.getData('text/html') || '';
        const plainText = event.clipboardData?.getData('text/plain') || '';

        if (!clipboardHtml && !plainText) {
          return false;
        }

        const isFromProseMirror = clipboardHtml.includes('data-pm-slice');

        if (isFromProseMirror) {
          return false;
        }

        event.preventDefault();

        let htmlToInsert = '';

        if (plainText) {
          htmlToInsert = convertPlainTextToHtml(plainText);
        } else if (clipboardHtml && clipboardHtml.trim().length > 0) {
          htmlToInsert = sanitizeExternalHtml(clipboardHtml);
        }

        const contentToInsert = htmlToInsert || plainText;
        if (!contentToInsert) return true;

        try {
          if (htmlToInsert) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = htmlToInsert;
            const parser = PMDOMParser.fromSchema(view.state.schema);
            const slice = parser.parseSlice(tempDiv);
            if (slice && slice.content.size > 0) {
              view.dispatch(view.state.tr.replaceSelection(slice));
              return true;
            }
          }
          view.dispatch(view.state.tr.insertText(plainText));
        } catch {
          try {
            view.dispatch(view.state.tr.insertText(plainText));
          } catch {
            // last resort fallback
          }
        }

        return true;
      },
    },
  });

  const isInternalUpdate = useRef(false);
  
  useEffect(() => {
    if (editor && !isInternalUpdate.current) {
      const currentHtml = editor.getHTML();
      if (content !== currentHtml) {
        const convertedContent = cleanupHtmlSpacing(convertHtmlBulletsToLists(content || ''));
        editor.commands.setContent(convertedContent);
      }
    }
    isInternalUpdate.current = false;
  }, [content, editor]);

  // Auto-focus editor when in headerMode.
  // Only auto-focus when the description is empty — for existing content we
  // let the user tap exactly where they want to edit. Otherwise the
  // auto-focus to 'start' races with their tap and the cursor jumps back to
  // the beginning of the text.
  useEffect(() => {
    if (!headerMode || !editor) return;
    const isEmpty = editor.isEmpty;
    window.scrollTo(0, 0);
    if (isEmpty) {
      setTimeout(() => {
        editor.commands.focus('start');
      }, 300);
    }
  }, [headerMode, editor]);

  const [vpState, setVpState] = useState({ top: 0, height: 0 });
  // Tracks the keyboard height reported by the Capacitor Keyboard plugin on
  // native iOS / Android, where `visualViewport` does NOT shrink because the
  // WKWebView is configured with `Keyboard.resize: none`. Without this, the
  // editor wrapper extends behind the keyboard and the cursor scroll math
  // thinks the cursor is "visible" while it is actually under the keys.
  const [nativeKbHeight, setNativeKbHeight] = useState(0);

  useEffect(() => {
    if (!headerMode) return;
    const vv = window.visualViewport;

    const handleViewportChange = () => {
      const winH = window.innerHeight;
      if (vv) {
        // Use the smaller of the two heights so we always shrink when keyboard
        // is open whether iOS resizes the WKWebView (Capacitor `resize: native`)
        // or just the visual viewport (web / `resize: none`).
        const visibleH = Math.min(winH, vv.height);
        setVpState({ top: vv.offsetTop, height: visibleH });
        if (vv.offsetTop > 0) {
          window.scrollTo(0, 0);
        }
      } else {
        setVpState({ top: 0, height: winH });
      }
    };

    handleViewportChange();
    vv?.addEventListener('resize', handleViewportChange);
    vv?.addEventListener('scroll', handleViewportChange);
    window.addEventListener('resize', handleViewportChange);

    // Capacitor native keyboard listeners. Best-effort dynamic import — does
    // nothing on web. The plugin gives us the keyboardHeight directly so we
    // can shrink the wrapper above the keyboard even though visualViewport
    // does not change on native iOS.
    let willShowL: { remove?: () => void } | undefined;
    let didShowL: { remove?: () => void } | undefined;
    let willHideL: { remove?: () => void } | undefined;
    let didHideL: { remove?: () => void } | undefined;
    let cancelled = false;
    (async () => {
      try {
        const isNative = (window as any).Capacitor?.isNativePlatform?.() === true;
        if (!isNative) return;
        const { Keyboard } = await import('@capacitor/keyboard');
        if (cancelled) return;
        const onShow = (info: any) => {
          const h = Number(info?.keyboardHeight) || 0;
          if (h > 0) setNativeKbHeight(h);
        };
        const onHide = () => setNativeKbHeight(0);
        willShowL = await Keyboard.addListener('keyboardWillShow', onShow);
        didShowL = await Keyboard.addListener('keyboardDidShow', onShow);
        willHideL = await Keyboard.addListener('keyboardWillHide', onHide);
        didHideL = await Keyboard.addListener('keyboardDidHide', onHide);
      } catch {
        /* not Capacitor or plugin unavailable */
      }
    })();

    return () => {
      cancelled = true;
      vv?.removeEventListener('resize', handleViewportChange);
      vv?.removeEventListener('scroll', handleViewportChange);
      window.removeEventListener('resize', handleViewportChange);
      willShowL?.remove?.();
      didShowL?.remove?.();
      willHideL?.remove?.();
      didHideL?.remove?.();
      setNativeKbHeight(0);
    };
  }, [headerMode]);

  // Scroll cursor into view when typing or tapping in header mode
  useEffect(() => {
    if (!headerMode || !editor) return;

    const scrollCursorIntoView = (delay = 0) => {
      const doScroll = () => {
        requestAnimationFrame(() => {
          const sel = window.getSelection();
          if (!sel || sel.rangeCount === 0) return;
          const range = sel.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          if (!rect || rect.height === 0) return;
          const scrollContainer = document.querySelector('[data-testid="rich-text-editor"] [data-scroll-content]');
          if (!scrollContainer) return;
          const containerRect = scrollContainer.getBoundingClientRect();
          if (rect.bottom > containerRect.bottom - 10) {
            scrollContainer.scrollTop += (rect.bottom - containerRect.bottom + 40);
          } else if (rect.top < containerRect.top + 10) {
            scrollContainer.scrollTop -= (containerRect.top - rect.top + 40);
          }
        });
      };
      if (delay > 0) {
        setTimeout(doScroll, delay);
      } else {
        doScroll();
      }
    };

    const handleUpdate = () => scrollCursorIntoView(0);
    const handleSelectionUpdate = () => scrollCursorIntoView(100);
    const handleFocus = () => scrollCursorIntoView(300);

    editor.on('update', handleUpdate);
    editor.on('selectionUpdate', handleSelectionUpdate);
    editor.on('focus', handleFocus);
    return () => {
      editor.off('update', handleUpdate);
      editor.off('selectionUpdate', handleSelectionUpdate);
      editor.off('focus', handleFocus);
    };
  }, [headerMode, editor]);

  if (headerMode) {
    return (
      <>
        <div className="fixed inset-0 bg-background" style={{ zIndex: 2147483644 }} />
        <div 
          className="fixed left-0 right-0 flex flex-col bg-background overflow-hidden" 
          style={{
            zIndex: 2147483645,
            top: vpState.height > 0 ? `${vpState.top}px` : 0,
            // On native iOS the visualViewport does not shrink when the
            // keyboard opens. Subtract the reported keyboard height so the
            // editor wrapper actually ends above the keyboard instead of
            // extending behind it.
            height: vpState.height > 0
              ? `${Math.max(120, vpState.height - nativeKbHeight)}px`
              : nativeKbHeight > 0
                ? `calc(100% - ${nativeKbHeight}px)`
                : '100%',
            transition: 'height 0.18s ease-out',
          }}
          data-testid="rich-text-editor"
        >
          <div className="shrink-0 z-50 bg-background border-b" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
            <div className="flex items-center justify-end gap-2 px-2 py-1">
              {autoSaveStatus === 'saving' && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> Saving...
                </span>
              )}
              {autoSaveStatus === 'saved' && (
                <span className="text-xs text-green-600 dark:text-green-400">Saved</span>
              )}
              <Button
                type="button"
                size="sm"
                onClick={() => { if (onSave) onSave(); else if (onBack) onBack(); }}
                disabled={isSaving}
                data-testid="button-done-description"
              >
                Done
              </Button>
            </div>
            <MenuBar editor={editor} />
          </div>
          <div 
            className="flex-1 overflow-y-auto overscroll-contain [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
            style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
            data-scroll-content
            data-no-autoscroll
          >
            <div className="p-4 min-h-[calc(100%+1px)]">
              <EditorContent editor={editor} />
            </div>
          </div>
        </div>
      </>
    );
  }

  // Bottom toolbar mode: toolbar fixed at bottom, content scrolls above
  // Uses visualViewport API to stay above iOS keyboard
  if (bottomToolbar) {
    return (
      <BottomToolbarEditor editor={editor} showToolbar={showToolbar} />
    );
  }

  // Sticky toolbar mode: toolbar sticks below header (57px), content scrolls
  if (stickyToolbar) {
    return (
      <div className="flex flex-col" data-testid="rich-text-editor">
        {/* Sticky toolbar - positioned below the page header */}
        <div className="sticky top-[57px] z-40 bg-background border-b shadow-sm">
          <MenuBar editor={editor} />
        </div>
        {/* Content area */}
        <div className="flex-1 p-4 min-h-[60vh]">
          <EditorContent editor={editor} />
        </div>
      </div>
    );
  }

  // Nested scroll mode: toolbar is in outer scroll, content has its own inner scroll
  if (nestedScroll) {
    return (
      <div className="border rounded-md bg-background" data-testid="rich-text-editor">
        {/* Toolbar - scrolls with outer container */}
        <div className="border-b">
          <MenuBar editor={editor} />
        </div>
        {/* Text content - has its own scroll, fixed height so user can scroll outer to reach toolbar */}
        <div className="h-[50vh] overflow-y-auto">
          <EditorContent editor={editor} />
        </div>
      </div>
    );
  }

  // Default mode: single scroll container
  return (
    <div className={`h-full flex flex-col ${noBorder ? '' : 'border rounded-md'} bg-background`} data-testid="rich-text-editor">
      <div className="shrink-0 border-b">
        <MenuBar editor={editor} />
      </div>
      <div className="flex-1 overflow-y-auto min-h-0 p-4">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

export function stripHtmlForValidation(html: string): string {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

export function RichTextDisplay({ content }: { content: string }) {
  // Convert literal bullets to proper HTML lists for display
  const convertedContent = cleanupHtmlSpacing(convertHtmlBulletsToLists(content || ''));
  return (
    <div 
      className="prose prose-sm dark:prose-invert max-w-none break-words overflow-hidden"
      style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
      dangerouslySetInnerHTML={{ __html: convertedContent }}
      data-testid="rich-text-display"
    />
  );
}
