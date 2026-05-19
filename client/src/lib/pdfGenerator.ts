import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { getMaterialPdfLabel } from './materialIcons';
import { formatPhoneDisplay } from './utils';
import { calcExcludedTotals, calcOptionalAreaTotals, filterExcludedForHiddenAreas, getAreaSqft, calcBlockSqftSummary, formatSqft } from '@/components/ProductionRateBlockDisplay';
import { buildOrderedEntries } from '@/lib/changeOrderContent';
import type { ProductionRateBlock, UnifiedLineItem, AreaCalcResult, SurfaceCalcResult } from '@shared/schema';

interface LineItem {
  name?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  scopeNoteHtml?: string;
  surfaces?: any[];
  pricingDetails?: any;
  displayOverrides?: any;
  debug?: any;
  isOptional?: boolean;
}

interface TextSegment {
  text: string;
  bold?: boolean;
  italic?: boolean;
  color?: string;
  backgroundColor?: string;
  fontSize?: number;
}

interface ParsedLine {
  segments: TextSegment[];
  isBullet?: boolean;
  bulletText?: string;
}

function pluralizeLabel(label: string, count: number): string {
  if (count === 1) return label;
  if (label === "pass") return "passes";
  return label + "s";
}

function parseColor(colorStr: string): [number, number, number] | null {
  if (!colorStr) return null;
  
  // Handle rgb(r, g, b) format
  const rgbMatch = colorStr.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
  if (rgbMatch) {
    return [parseInt(rgbMatch[1]), parseInt(rgbMatch[2]), parseInt(rgbMatch[3])];
  }
  
  // Handle hex format
  const hexMatch = colorStr.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (hexMatch) {
    return [parseInt(hexMatch[1], 16), parseInt(hexMatch[2], 16), parseInt(hexMatch[3], 16)];
  }
  
  // Handle named colors
  const namedColors: Record<string, [number, number, number]> = {
    'yellow': [255, 255, 0],
    'red': [255, 0, 0],
    'green': [0, 128, 0],
    'blue': [0, 0, 255],
    'orange': [255, 165, 0],
    'pink': [255, 192, 203],
    'cyan': [0, 255, 255],
    'magenta': [255, 0, 255],
    'lime': [0, 255, 0],
  };
  
  return namedColors[colorStr.toLowerCase()] || null;
}

function parseHtmlToSegments(html: string): ParsedLine[] {
  if (!html) return [];
  
  const lines: ParsedLine[] = [];
  let currentLine: ParsedLine = { segments: [] };
  let listCounter = 0;
  let inOrderedList = false;
  
  // Clean up empty paragraphs that can cause layout issues
  let cleanedHtml = html
    .replace(/<p>\s*<\/p>/gi, '') // Remove empty <p></p> tags
    .replace(/<p><\/p>/gi, '')    // Remove empty <p></p> tags (no space)
    .replace(/(<\/ul>|<\/ol>)\s*<br\s*\/?>/gi, '$1') // Remove <br> after lists
    .replace(/<br\s*\/?>\s*(<ul>|<ol>)/gi, '$1');    // Remove <br> before lists
  
  // Create a temporary div to parse HTML
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = cleanedHtml;
  
  function processNode(node: Node, inheritedStyles: Partial<TextSegment> = {}) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      if (text) {
        currentLine.segments.push({
          text,
          ...inheritedStyles
        });
      }
      return;
    }
    
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as HTMLElement;
      const tagName = element.tagName.toLowerCase();
      const styles = { ...inheritedStyles };
      
      // Check for inline styles
      const style = element.style;
      if (style.backgroundColor) {
        styles.backgroundColor = style.backgroundColor;
      }
      if (style.color) {
        styles.color = style.color;
      }
      if (style.fontSize) {
        // Handle em-based font sizes (e.g., "1.25em")
        const emMatch = style.fontSize.match(/([\d.]+)em/);
        if (emMatch) {
          const emValue = parseFloat(emMatch[1]);
          // Convert em to points (base size is ~10pt)
          styles.fontSize = Math.round(emValue * 10);
        } else {
          // Handle pixel-based sizes
          const pxMatch = style.fontSize.match(/(\d+)/);
          if (pxMatch) {
            styles.fontSize = parseInt(pxMatch[1]);
          }
        }
      }
      
      // Check for mark (highlight)
      if (tagName === 'mark') {
        const dataBg = element.getAttribute('data-color');
        if (dataBg) {
          styles.backgroundColor = dataBg;
        } else if (!styles.backgroundColor) {
          styles.backgroundColor = 'yellow';
        }
      }
      
      // Check for bold
      if (tagName === 'strong' || tagName === 'b') {
        styles.bold = true;
      }
      
      // Check for italic
      if (tagName === 'em' || tagName === 'i') {
        styles.italic = true;
      }
      
      // Handle lists
      if (tagName === 'ol') {
        inOrderedList = true;
        listCounter = 0;
      } else if (tagName === 'ul') {
        inOrderedList = false;
      } else if (tagName === 'li') {
        // Start new line for list item
        if (currentLine.segments.length > 0) {
          lines.push(currentLine);
        }
        currentLine = { segments: [], isBullet: true };
        if (inOrderedList) {
          listCounter++;
          currentLine.bulletText = `${listCounter}. `;
        } else {
          currentLine.bulletText = '• ';
        }
      }
      
      // Handle line breaks - but NOT for p/div inside list items
      if (tagName === 'br') {
        if (currentLine.segments.length > 0 || currentLine.isBullet) {
          lines.push(currentLine);
          currentLine = { segments: [] };
        }
      } else if ((tagName === 'p' || tagName === 'div') && !currentLine.isBullet) {
        // Only break for p/div when NOT inside a bullet point
        if (currentLine.segments.length > 0) {
          lines.push(currentLine);
          currentLine = { segments: [] };
        }
      }
      
      // Process children
      element.childNodes.forEach(child => processNode(child, styles));
      
      // End of list item means new line
      if (tagName === 'li' && (currentLine.segments.length > 0 || currentLine.isBullet)) {
        lines.push(currentLine);
        currentLine = { segments: [] };
      }
      // End of p/div means new line (if not handled above)
      if ((tagName === 'p' || tagName === 'div') && currentLine.segments.length > 0 && !lines.includes(currentLine)) {
        lines.push(currentLine);
        currentLine = { segments: [] };
      }
    }
  }
  
  tempDiv.childNodes.forEach(child => processNode(child));
  
  // Add remaining line
  if (currentLine.segments.length > 0) {
    lines.push(currentLine);
  }
  
  return lines;
}

function stripHtmlTags(html: string): string {
  if (!html) return '';
  let listCounter = 0;
  let inOrderedList = false;
  
  const result = html
    .replace(/<ol[^>]*>/gi, () => { inOrderedList = true; listCounter = 0; return ''; })
    .replace(/<\/ol>/gi, () => { inOrderedList = false; return ''; })
    .replace(/<ul[^>]*>/gi, '')
    .replace(/<\/ul>/gi, '')
    .replace(/<li>/gi, () => {
      if (inOrderedList) {
        listCounter++;
        return `${listCounter}. `;
      }
      return '• ';
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n\s*\n/g, '\n')
    .trim();
  return result;
}

function estimateRichTextHeight(pdf: jsPDF, html: string, maxWidth: number): number {
  const lines = parseHtmlToSegments(html);
  let totalHeight = 0;
  const baseLineHeight = 3.5;
  const defaultFontSize = 8;
  const bulletMargin = 4;
  const bulletIndent = 3;
  
  lines.forEach(line => {
    let currentX = 0;
    let availableWidth = maxWidth;
    let linesNeeded = 1;
    
    // Calculate the max font size in this line to determine line height
    let maxFontSizeInLine = defaultFontSize;
    line.segments.forEach(segment => {
      const fontSize = segment.fontSize ? Math.min(segment.fontSize, 14) : defaultFontSize;
      if (fontSize > maxFontSizeInLine) {
        maxFontSizeInLine = fontSize;
      }
    });
    
    // Scale line height based on font size
    const lineHeight = baseLineHeight * (maxFontSizeInLine / defaultFontSize);
    
    // Add extra space BEFORE lines with larger fonts (for headers)
    if (maxFontSizeInLine > defaultFontSize + 2) {
      totalHeight += (maxFontSizeInLine - defaultFontSize) * 0.4;
    }
    
    if (line.isBullet) {
      currentX = bulletMargin + bulletIndent;
      availableWidth -= bulletMargin + bulletIndent;
    }
    
    line.segments.forEach(segment => {
      const fontSize = segment.fontSize ? Math.min(segment.fontSize, 14) : defaultFontSize;
      const fontStyle = segment.bold && segment.italic ? 'bolditalic' : 
                       segment.bold ? 'bold' : 
                       segment.italic ? 'italic' : 'normal';
      pdf.setFont('helvetica', fontStyle);
      pdf.setFontSize(fontSize);
      
      const words = segment.text.split(/(\s+)/);
      const bulletStartX = line.isBullet ? bulletMargin + bulletIndent : 0;
      words.forEach(word => {
        if (!word) return;
        const wordWidth = pdf.getTextWidth(word);
        if (currentX + wordWidth > availableWidth && currentX > bulletStartX) {
          linesNeeded++;
          currentX = bulletStartX;
        }
        currentX += wordWidth;
      });
    });
    
    totalHeight += linesNeeded * lineHeight;
  });
  
  // Reset font to default
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(defaultFontSize);
  
  return totalHeight;
}

function drawRichText(pdf: jsPDF, html: string, x: number, y: number, maxWidth: number, enablePageBreaks: boolean = false, maxHeight?: number, startFromLine: number = 0): { heightUsed: number; nextLine: number } {
  const lines = parseHtmlToSegments(html);
  let currentY = y;
  const baseLineHeight = 3.5;
  const defaultFontSize = 8;
  const bulletMargin = 4;
  const bulletIndent = 3;
  const margin = 20;
  const pageHeight = pdf.internal.pageSize.getHeight();
  const bottomMargin = 20;
  
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    if (lineIndex < startFromLine) continue;
    
    const line = lines[lineIndex];
    let currentX = x;
    let availableWidth = maxWidth;
    
    let maxFontSizeInLine = defaultFontSize;
    line.segments.forEach(segment => {
      const fontSize = segment.fontSize ? Math.min(segment.fontSize, 14) : defaultFontSize;
      if (fontSize > maxFontSizeInLine) {
        maxFontSizeInLine = fontSize;
      }
    });
    
    const lineHeight = baseLineHeight * (maxFontSizeInLine / defaultFontSize);
    
    if (maxHeight !== undefined && (currentY - y + lineHeight) > maxHeight) {
      return { heightUsed: currentY - y, nextLine: lineIndex };
    }
    
    if (enablePageBreaks && currentY + lineHeight > pageHeight - bottomMargin) {
      pdf.addPage();
      currentY = margin;
    }
    
    if (maxFontSizeInLine > defaultFontSize + 2) {
      currentY += (maxFontSizeInLine - defaultFontSize) * 0.4;
    }
    
    if (line.isBullet && line.bulletText) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(defaultFontSize);
      pdf.setTextColor(0, 0, 0);
      pdf.text(line.bulletText, x + bulletMargin, currentY);
      currentX = x + bulletMargin + bulletIndent;
      availableWidth = maxWidth - bulletMargin - bulletIndent;
    }
    
    line.segments.forEach(segment => {
      const fontSize = segment.fontSize ? Math.min(segment.fontSize, 14) : defaultFontSize;
      const fontStyle = segment.bold && segment.italic ? 'bolditalic' : 
                       segment.bold ? 'bold' : 
                       segment.italic ? 'italic' : 'normal';
      
      pdf.setFont('helvetica', fontStyle);
      pdf.setFontSize(fontSize);
      
      if (segment.color) {
        const color = parseColor(segment.color);
        if (color) {
          pdf.setTextColor(color[0], color[1], color[2]);
        } else {
          pdf.setTextColor(80, 80, 80);
        }
      } else {
        pdf.setTextColor(80, 80, 80);
      }
      
      const words = segment.text.split(/(\s+)/);
      
      words.forEach(word => {
        if (!word) return;
        
        const wordWidth = pdf.getTextWidth(word);
        
        const bulletStartX = line.isBullet ? bulletMargin + bulletIndent : 0;
        if (currentX + wordWidth > x + availableWidth && currentX > x + bulletStartX) {
          currentY += lineHeight;
          currentX = x + bulletStartX;
          
          if (enablePageBreaks && currentY > pageHeight - bottomMargin) {
            pdf.addPage();
            currentY = margin;
          }
        }
        
        if (segment.backgroundColor && word.trim()) {
          const bgColor = parseColor(segment.backgroundColor);
          if (bgColor) {
            pdf.setFillColor(bgColor[0], bgColor[1], bgColor[2]);
            pdf.rect(currentX - 0.3, currentY - fontSize * 0.3, wordWidth + 0.6, fontSize * 0.4, 'F');
          }
        }
        
        pdf.text(word, currentX, currentY);
        currentX += wordWidth;
      });
    });
    
    currentY += lineHeight;
  }
  
  return { heightUsed: currentY - y, nextLine: lines.length };
}

interface PdfDisplayToggles {
  showLaborHrs: boolean;
  showLaborPrice: boolean;
  showMaterialQty: boolean;
  showMaterialPrice: boolean;
  showSurfaceDetails?: boolean;
  showSurfaceTotal?: boolean;
  showProjectTotalSqft?: boolean;
}

interface PdfSurfaceCalc {
  surfaceName: string;
  surfaceKey: string;
  quantity: number;
  unit: string;
  coats: number;
  laborHours: number;
  price: number;
  paintableSqft: number;
  materialName?: string;
}

interface PdfMaterialCost {
  surfaceName: string;
  materialName: string;
  materialUnit: string;
  totalSqft: number;
  qtyToBuy: number;
  costPerUnit: number;
  totalCost: number;
}

interface PdfAreaResult {
  roomId: string;
  roomName: string;
  length: number;
  width: number;
  ceilingHeight: number;
  surfaces: PdfSurfaceCalc[];
  setupHours: number;
  totalLaborHours: number;
  totalPrice: number;
  materialCosts: PdfMaterialCost[];
}

interface PdfProductionRateBlock {
  id: string;
  name: string;
  roomBuilderData: {
    areaResults?: PdfAreaResult[];
    sameColorAllAreas?: boolean;
    displayToggles: PdfDisplayToggles;
    materialCosts: PdfMaterialCost[];
    totalLaborHours: number;
    totalLaborCost: number;
    totalMaterialCost: number;
    grandTotal: number;
  };
}

interface DocumentData {
  id: number;
  type: string;
  status: string;
  totalAmount: number;
  createdAt: string | Date | null;
  content: {
    items: LineItem[];
    notes?: string;
    productionRateBlocks?: PdfProductionRateBlock[];
    acceptedOptionalItems?: string[];
    excludedSurfaces?: string[];
    proposalPackagesEnabled?: boolean;
    proposalPackagesData?: any[];
    packageSnapshot?: any;
    selectedPackageId?: number | null;
    paymentSettings?: {
      depositRequired?: boolean;
      depositType?: 'percentage' | 'fixed';
      depositAmount?: number;
      showPaymentSchedule?: boolean;
      schedule?: Array<{
        label?: string;
        amount?: number;
        dueCondition?: string;
      }>;
    };
  };
  signature?: string | null;
  signedAt?: string | Date | null;
  jobAddress?: string | null;
  jobCity?: string | null;
  jobState?: string | null;
  jobZipCode?: string | null;
  jobAddressSameAsBilling?: boolean | null;
  contact: {
    name: string;
    email: string;
    phone: string;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    zipCode?: string | null;
  };
}

interface CompanySettings {
  companyName: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  phone?: string | null;
  email?: string | null;
  logo?: string | null;
  brandColor?: string | null;
  useBrandColorOnDocs?: boolean;
  contractorSignature?: string | null;
  useContractorSignature?: boolean;
}

interface ChangeOrder {
  id: number;
  title: string;
  totalAmount: number;
  signature?: string | null;
  signedAt?: string | Date | null;
  content: {
    items: LineItem[];
    notes?: string;
    productionRateBlocks?: ProductionRateBlock[];
    itemOrder?: string[];
    // Frozen visibility filters carried over from the signed CO content.
    // Read by the PDF block-rendering loop to mirror the customer portal's
    // hidden-area / excluded-surface / accepted-optional-area logic.
    excludedSurfaces?: string[];
    contractorHiddenAreas?: string[];
    acceptedOptionalAreas?: string[];
  };
}

interface PaymentData {
  id: number;
  amount: number;
  paymentType: string;
  paymentDate: string | Date;
  notes?: string | null;
}

interface PdfPhoto {
  storageKey: string;
  annotatedStorageKey?: string | null;
  caption?: string | null;
  fileName: string;
}

async function loadImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const isWebp = blob.type === 'image/webp';
    if (isWebp) {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          if (!ctx) { resolve(null); return; }
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = () => resolve(null);
        img.src = URL.createObjectURL(blob);
      });
    }
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function generateDocumentPDF(
  doc: DocumentData,
  settings: CompanySettings,
  changeOrders?: ChangeOrder[],
  standardsExpectations?: string,
  termsConditions?: string,
  payments?: PaymentData[],
  allPackages?: any[],
  overrideSelectedPackageId?: number,
  overrideAcceptedOptionals?: string[],
  photos?: PdfPhoto[],
  sourcePhotoUrls?: string[],
  overrideExcludedSurfaces?: string[],
  overrideAcceptedOptionalAreas?: string[]
): Promise<Blob> {
  const pdf = new jsPDF('p', 'mm', 'letter');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 20;
  let yPos = margin;

  const signedChangeOrders = (changeOrders?.filter(co => co.signature) || [])
    .sort((a, b) => new Date(a.signedAt || 0).getTime() - new Date(b.signedAt || 0).getTime());

  // Logo alignment: logo spans from company name (top) to email (bottom) of company info
  // Logo stays centered, company info on the left - same row
  const headerStartY = yPos;
  
  // Calculate total height of company info text
  const cityStateZip = [settings.city, settings.state, settings.zipCode].filter(Boolean).join(', ');
  let companyInfoHeight = 5; // Company name line
  if (settings.address) companyInfoHeight += 4;
  if (cityStateZip) companyInfoHeight += 4;
  if (settings.phone) companyInfoHeight += 4;
  if (settings.email) companyInfoHeight += 4;
  
  const companyInfoBottomY = headerStartY + companyInfoHeight;
  
  // Track actual logo dimensions for header height calculation
  let actualLogoHeight = 0;
  let actualLogoY = headerStartY;

  // Add logo centered (if exists) - preserve aspect ratio
  // Logo top aligns with company name, bottom aligns with email
  if (settings.logo) {
    try {
      // Create an image element to get natural dimensions
      const img = new Image();
      img.src = settings.logo;
      
      // Get natural dimensions (default to square if can't determine)
      const naturalWidth = img.naturalWidth || 100;
      const naturalHeight = img.naturalHeight || 100;
      const aspectRatio = naturalWidth / naturalHeight;
      
      // Logo height matches company info height, width based on aspect ratio
      actualLogoHeight = companyInfoHeight;
      const logoWidth = actualLogoHeight * aspectRatio;
      
      // Position logo at top of company info, centered horizontally
      // Offset by -4mm to account for text baseline positioning (text Y is at baseline, image Y is at top)
      actualLogoY = headerStartY - 4;
      const logoX = (pageWidth - logoWidth) / 2;
      
      const logoFormat = settings.logo.includes('image/png') ? 'PNG' : 
                         settings.logo.includes('image/jpeg') || settings.logo.includes('image/jpg') ? 'JPEG' : 'PNG';
      pdf.addImage(settings.logo, logoFormat, logoX, actualLogoY, logoWidth, actualLogoHeight);
    } catch (e) {
      console.error('Failed to add logo to PDF:', e);
    }
  }

  const brandRgb = settings.brandColor && settings.useBrandColorOnDocs ? parseColor(settings.brandColor) : null;

  // Company info starts at headerStartY (same row as logo)
  let companyY = headerStartY;
  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  if (brandRgb) {
    pdf.setTextColor(brandRgb[0], brandRgb[1], brandRgb[2]);
  } else {
    pdf.setTextColor(0);
  }
  pdf.text(settings.companyName, margin, companyY);
  companyY += 5;

  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(100);

  if (settings.address) {
    pdf.text(settings.address, margin, companyY);
    companyY += 4;
  }
  if (cityStateZip) {
    pdf.text(cityStateZip, margin, companyY);
    companyY += 4;
  }
  if (settings.phone) {
    pdf.text(formatPhoneDisplay(settings.phone), margin, companyY);
    companyY += 4;
  }
  if (settings.email) {
    pdf.text(settings.email, margin, companyY);
    companyY += 4;
  }

  // Use whichever is taller - company info or logo position
  const headerEndY = Math.max(companyY, actualLogoY + actualLogoHeight);
  yPos = headerEndY + 6;
  if (brandRgb) {
    pdf.setDrawColor(brandRgb[0], brandRgb[1], brandRgb[2]);
    pdf.setLineWidth(0.4);
  } else {
    pdf.setDrawColor(200);
    pdf.setLineWidth(0.2);
  }
  pdf.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 8;

  pdf.setTextColor(0);
  const col1X = margin;
  const col2X = pageWidth / 3 + 10;
  const col3X = (pageWidth * 2) / 3;

  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Client:', col1X, yPos);
  pdf.text('Job Address:', col2X, yPos);
  pdf.text(`${doc.type.replace('_', ' ').charAt(0).toUpperCase() + doc.type.replace('_', ' ').slice(1)} Info:`, col3X, yPos);
  yPos += 5;

  pdf.setFont('helvetica', 'normal');
  const lineHeight = 4;

  let clientY = yPos;
  pdf.text(doc.contact.name, col1X, clientY);
  clientY += lineHeight;
  
  // Helper to print wrapped address lines
  const colWidth = 50;
  const printWrappedLine = (text: string, x: number, y: number): number => {
    const lines = pdf.splitTextToSize(text, colWidth);
    lines.forEach((line: string) => {
      pdf.text(line, x, y);
      y += lineHeight;
    });
    return y;
  };

  // Client address - two lines: street then city/state/zip
  if (doc.contact.address) {
    clientY = printWrappedLine(doc.contact.address, col1X, clientY);
  }
  const contactCityStateZip = [doc.contact.city, doc.contact.state, doc.contact.zipCode].filter(Boolean).join(', ');
  if (contactCityStateZip) {
    clientY = printWrappedLine(contactCityStateZip, col1X, clientY);
  }
  
  pdf.text(doc.contact.phone ? formatPhoneDisplay(doc.contact.phone) : '', col1X, clientY);
  clientY += lineHeight;
  pdf.text(doc.contact.email, col1X, clientY);

  // Job address - two lines: street then city/state/zip
  let jobY = yPos;
  if (doc.jobAddressSameAsBilling) {
    // Use contact address when same as billing
    if (doc.contact.address) {
      jobY = printWrappedLine(doc.contact.address, col2X, jobY);
    }
    if (contactCityStateZip) {
      jobY = printWrappedLine(contactCityStateZip, col2X, jobY);
    }
    if (!doc.contact.address && !contactCityStateZip) {
      pdf.text('Same as client', col2X, jobY);
    }
  } else {
    // Use separate job address fields
    if (doc.jobAddress) {
      jobY = printWrappedLine(doc.jobAddress, col2X, jobY);
    }
    const jobCityStateZip = [doc.jobCity, doc.jobState, doc.jobZipCode].filter(Boolean).join(', ');
    if (jobCityStateZip) {
      jobY = printWrappedLine(jobCityStateZip, col2X, jobY);
    }
    if (!doc.jobAddress && !jobCityStateZip) {
      pdf.text('Not specified', col2X, jobY);
    }
  }

  let infoY = yPos;
  pdf.text(`#${(doc.documentNumber || doc.id).toString().padStart(6, '0')}`, col3X, infoY);
  infoY += lineHeight;
  const createdDate = doc.createdAt ? new Date(doc.createdAt) : new Date();
  pdf.text(`Date: ${format(createdDate, 'MMM d, yyyy')}`, col3X, infoY);
  infoY += lineHeight;
  
  if (['proposal', 'estimate'].includes(doc.type)) {
    const validThrough = new Date(createdDate);
    validThrough.setDate(validThrough.getDate() + 30);
    pdf.text(`Valid Through: ${format(validThrough, 'MMM d, yyyy')}`, col3X, infoY);
    infoY += lineHeight;
  }

  if (doc.status) {
    pdf.text(`Status: ${doc.status.charAt(0).toUpperCase() + doc.status.slice(1)}`, col3X, infoY);
  }

  yPos = Math.max(clientY, jobY, infoY) + 6;

  if (brandRgb) {
    pdf.setDrawColor(brandRgb[0], brandRgb[1], brandRgb[2]);
    pdf.setLineWidth(0.4);
  } else {
    pdf.setDrawColor(200);
    pdf.setLineWidth(0.2);
  }
  pdf.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 5;

  // Document-level "Total Square Footage" rollup: shown when any rate block
  // opted in via `displayToggles.showProjectTotalSqft`. Mirrors the customer
  // portal's "Project Size" card (single block: one line; multiple: per-block).
  {
    const headerBlocks = doc.content?.productionRateBlocks || [];
    const headerEnabled = headerBlocks.filter(
      (b: any) => b.roomBuilderData?.displayToggles?.showProjectTotalSqft,
    );
    if (headerEnabled.length > 0) {
      const headerExcluded = (overrideExcludedSurfaces ?? (doc.content as any)?.excludedSurfaces ?? []) as string[];
      const headerHidden = ((doc.content as any)?.contractorHiddenAreas ?? []) as string[];
      const headerAccepted = (overrideAcceptedOptionalAreas ?? (doc.content as any)?.acceptedOptionalAreas ?? []) as string[];
      const summaries = headerEnabled
        .map((b: any) => ({
          name: b.name,
          summary: calcBlockSqftSummary(b, {
            isCustomerView: true,
            excludedSurfaces: headerExcluded,
            contractorHiddenAreas: headerHidden,
            acceptedOptionalAreas: headerAccepted,
          }),
        }))
        .filter((s: any) => s.summary.includedSqft > 0 || s.summary.optionalSqft > 0);

      if (summaries.length > 0) {
        const totalIncluded = summaries.reduce((sum: number, s: any) => sum + s.summary.includedSqft, 0);
        const totalOptional = summaries.reduce((sum: number, s: any) => sum + s.summary.optionalSqft, 0);

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9);
        pdf.setTextColor(60, 60, 65);
        pdf.text('Area Square Footage:', margin, yPos);
        const lblW = pdf.getTextWidth('Area Square Footage:');

        if (summaries.length === 1) {
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(10);
          pdf.setTextColor(0, 0, 0);
          const valStr = ` ${formatSqft(totalIncluded)}`;
          pdf.text(valStr, margin + lblW, yPos);
          if (totalOptional > 0) {
            const valW = pdf.getTextWidth(valStr);
            pdf.setFont('helvetica', 'italic');
            pdf.setFontSize(8);
            pdf.setTextColor(120, 120, 125);
            pdf.text(`  +${formatSqft(totalOptional)} if add-ons accepted`, margin + lblW + valW, yPos);
          }
          yPos += 5;
        } else {
          yPos += 4;
          for (const s of summaries) {
            if (yPos > pageHeight - 25) { pdf.addPage(); yPos = margin; }
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(8.5);
            pdf.setTextColor(60, 60, 65);
            pdf.text(`${s.name}:`, margin + 4, yPos);
            const nameW = pdf.getTextWidth(`${s.name}:`);
            pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(0, 0, 0);
            const lineVal = ` ${formatSqft(s.summary.includedSqft)}`;
            pdf.text(lineVal, margin + 4 + nameW, yPos);
            if (s.summary.optionalSqft > 0) {
              const valW = pdf.getTextWidth(lineVal);
              pdf.setFont('helvetica', 'italic');
              pdf.setFontSize(7.5);
              pdf.setTextColor(120, 120, 125);
              pdf.text(`  +${formatSqft(s.summary.optionalSqft)} if add-ons accepted`, margin + 4 + nameW + valW, yPos);
            }
            yPos += 4;
          }
        }
        pdf.setTextColor(0, 0, 0);
        yPos += 2;

        if (brandRgb) {
          pdf.setDrawColor(brandRgb[0], brandRgb[1], brandRgb[2]);
          pdf.setLineWidth(0.4);
        } else {
          pdf.setDrawColor(200);
          pdf.setLineWidth(0.2);
        }
        pdf.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 5;
      }
    }
  }

  // Add Standards and Expectations section if provided
  if (standardsExpectations && standardsExpectations.trim()) {
    const contentWidth = pageWidth - (margin * 2);
    
    // Draw the rich text content
    const { heightUsed: contentHeight } = drawRichText(pdf, standardsExpectations, margin, yPos, contentWidth, true);
    yPos += contentHeight + 3;
    
    // Check if we need a new page
    if (yPos > pageHeight - 40) {
      pdf.addPage();
      yPos = margin;
    }
    
    // Add a separator line after standards and expectations
    if (brandRgb) {
      pdf.setDrawColor(brandRgb[0], brandRgb[1], brandRgb[2]);
      pdf.setLineWidth(0.4);
    } else {
      pdf.setDrawColor(200);
      pdf.setLineWidth(0.2);
    }
    pdf.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 3;
  }

  // Package variables (needed for totals; rendering is after line items)
  const pkgSnap = doc.content?.packageSnapshot;
  const hasAllPackages = !!(allPackages && allPackages.length > 0);
  const pdfPkgEnabled = doc.content?.proposalPackagesEnabled !== false && (hasAllPackages || !!pkgSnap);
  const pdfSelectedPkgIdResolved = overrideSelectedPackageId ?? doc.content?.selectedPackageId ?? pkgSnap?.id;

  // Build ordered entries respecting itemOrder for interleaving items and blocks
  const isInvoice = doc.type === 'invoice';
  const allContentItems = doc.content.items;
  const acceptedOptIds = overrideAcceptedOptionals ?? doc.content.acceptedOptionalItems ?? [];
  const optionalLineItems = allContentItems.filter(item => item.isOptional);
  const acceptedOptionalLineItems = optionalLineItems.filter((item, i) => {
    const id = `item-${item.name || i}`;
    return acceptedOptIds.includes(id);
  });
  const originalItems = isInvoice 
    ? allContentItems.filter(item => !item.name?.startsWith('[CO]') && !item.isOptional)
    : allContentItems.filter(item => !item.isOptional);
  const invoiceChangeOrderItems = isInvoice 
    ? allContentItems.filter(item => item.name?.startsWith('[CO]'))
    : [];
  
  const descriptionWidth = pageWidth - (margin * 2) - 30 - 8;
  const allBlocks = doc.content.productionRateBlocks || [];
  const nonOptionalBlocks = allBlocks.filter((b: any) => !b.isOptional);
  const pdfItemOrder: string[] = (doc.content as any).itemOrder || [];

  const pdfChItemsEarly: string[] = (doc.content as any)?.contractorHiddenItems || [];
  const pdfOrderedEntries: Array<{ type: 'item' | 'block'; item?: any; block?: any }> = [];
  if (pdfItemOrder.length > 0) {
    let iIdx = 0, bIdx = 0;
    for (const t of pdfItemOrder) {
      if (t === 'block' && bIdx < nonOptionalBlocks.length) {
        pdfOrderedEntries.push({ type: 'block', block: nonOptionalBlocks[bIdx++] });
      } else if (t === 'item' && iIdx < originalItems.length) {
        pdfOrderedEntries.push({ type: 'item', item: originalItems[iIdx++] });
      }
    }
    while (bIdx < nonOptionalBlocks.length) pdfOrderedEntries.push({ type: 'block', block: nonOptionalBlocks[bIdx++] });
    while (iIdx < originalItems.length) pdfOrderedEntries.push({ type: 'item', item: originalItems[iIdx++] });
  } else {
    originalItems.forEach(item => pdfOrderedEntries.push({ type: 'item', item }));
    nonOptionalBlocks.forEach(block => pdfOrderedEntries.push({ type: 'block', block }));
  }

  const renderLineItemTable = (items: any[]) => {
    if (items.length === 0) return;
    const tableData: any[][] = [];
    const descriptionRowIndices: Map<number, string> = new Map();
    let rowIndex = 0;
    items.forEach(item => {
      const descriptionText = stripHtmlTags(item.description);
      const itemName = item.name || '';
      if (item.descriptionOnly) {
        tableData.push([
          { content: itemName, colSpan: 4, styles: { fontStyle: 'bold' } }
        ]);
        rowIndex++;
        if (item.description) {
          descriptionRowIndices.set(rowIndex, item.description);
          tableData.push([
            { content: descriptionText, colSpan: 4, styles: { textColor: [80, 80, 80], fontSize: 8, cellPadding: { top: 1, bottom: 3, left: 4, right: 4 } } }
          ]);
          rowIndex++;
        }
      } else if (item.hidePrice) {
        tableData.push([
          { content: itemName, colSpan: 4, styles: { fontStyle: 'bold' } }
        ]);
        rowIndex++;
        if (item.description) {
          descriptionRowIndices.set(rowIndex, item.description);
          tableData.push([
            { content: descriptionText, colSpan: 4, styles: { textColor: [80, 80, 80], fontSize: 8, cellPadding: { top: 1, bottom: 3, left: 4, right: 4 } } }
          ]);
          rowIndex++;
        }
      } else {
        tableData.push([
          { content: itemName, styles: { fontStyle: 'bold' } },
          { content: item.quantity.toString(), styles: { halign: 'center' } },
          { content: `$${(item.unitPrice / 100).toFixed(2)}`, styles: { halign: 'center' } },
          { content: `$${(item.total / 100).toFixed(2)}`, styles: { halign: 'center', fontStyle: 'bold' } }
        ]);
        rowIndex++;
        if (item.description) {
          descriptionRowIndices.set(rowIndex, item.description);
          tableData.push([
            { content: descriptionText, colSpan: 3, styles: { textColor: [80, 80, 80], fontSize: 8, cellPadding: { top: 1, bottom: 3, left: 4, right: 4 } } },
            ''
          ]);
          rowIndex++;
        }
      }
    });
    autoTable(pdf, {
      startY: yPos,
      head: [],
      body: tableData,
      margin: { top: margin, left: margin, right: margin, bottom: 10 },
      pageBreak: 'auto',
      showHead: false,
      headStyles: {
        fillColor: [245, 245, 248],
        textColor: [100, 100, 105],
        fontStyle: 'bold',
        fontSize: 8,
        cellPadding: { top: 2, bottom: 2, left: 5, right: 5 },
        lineWidth: 0
      },
      bodyStyles: {
        fontSize: 9,
        cellPadding: { top: 2, bottom: 2, left: 5, right: 5 },
        lineWidth: 0
      },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 22 },
        2: { cellWidth: 32 },
        3: { cellWidth: 32 }
      },
      theme: 'plain',
      styles: {
        lineColor: [220, 220, 220],
        lineWidth: 0
      },
      didParseCell: (data) => {
        data.cell.styles.lineWidth = 0;
        if (data.section === 'body' && data.column.index === 0) {
          const html = descriptionRowIndices.get(data.row.index);
          if (html) {
            const neededHeight = estimateRichTextHeight(pdf, html, descriptionWidth);
            data.cell.styles.minCellHeight = Math.max(neededHeight + 4, 10);
          }
        }
      },
      didDrawCell: (() => {
        const rowProgress = new Map<number, number>();
        return (data: any) => {
          if (data.section === 'body' && data.column.index === 0) {
            const html = descriptionRowIndices.get(data.row.index);
            if (html) {
              const startLine = rowProgress.get(data.row.index) || 0;
              const padTop = 2;
              const padBottom = 2;
              pdf.setFillColor(255, 255, 255);
              pdf.rect(data.cell.x, data.cell.y, descriptionWidth + 8, data.cell.height, 'F');
              const maxH = data.cell.height - padTop - padBottom;
              const result = drawRichText(pdf, html, data.cell.x + 4, data.cell.y + padTop, descriptionWidth, false, maxH, startLine);
              rowProgress.set(data.row.index, result.nextLine);
            }
          }
        };
      })()
    });
    yPos = (pdf as any).lastAutoTable.finalY;
  };

  // Render ordered entries: batch consecutive items into tables, render blocks inline
  let pendingItems: any[] = [];
  let pdfItemIdx = 0;
  for (const entry of pdfOrderedEntries) {
    if (entry.type === 'item') {
      const itemKey = `item-${entry.item.name || pdfItemIdx}`;
      pdfItemIdx++;
      if (pdfChItemsEarly.includes(itemKey)) continue;
      pendingItems.push(entry.item);
    } else {
      if (pendingItems.length > 0) {
        renderLineItemTable(pendingItems);
        pendingItems = [];
      }
      const block = entry.block;
      // --- Start block rendering ---
      const data = block.roomBuilderData;
      const toggles = data.displayToggles || {
        showLaborHrs: true,
        showLaborPrice: true,
        showMaterialQty: true,
        showMaterialPrice: true,
        showSurfaceDetails: true,
      };
      if (toggles.showSurfaceDetails === undefined) toggles.showSurfaceDetails = true;
      const areas = data.areaResults || [];
      const excludedSurfaces = doc.content.excludedSurfaces || [];
      const contractorHiddenAreas: string[] = (doc.content as any).contractorHiddenAreas || [];
      const isCustomerProvidingMaterials = !!data.customerProvidingMaterials;

      let blockExclLaborHours = 0;
      let blockExclLaborCost = 0;
      let blockExclMaterialCost = 0;
      for (const a of areas) {
        const areaId = `${block.id}:area:${a.roomId}`;
        const isAreaHidden = contractorHiddenAreas.includes(areaId);
        for (const s of a.surfaces) {
          const sid = `${block.id}:${a.roomId}:${s.surfaceKey}`;
          if (excludedSurfaces.includes(sid) || isAreaHidden) {
            blockExclLaborHours += s.laborHours + ((s as any).primerLaborHours || 0);
            blockExclLaborCost += s.price;
            if (!isCustomerProvidingMaterials) {
              if (!(s as any).inMaterialGroup && (s as any).materialTotalCost) {
                blockExclMaterialCost += (s as any).materialTotalCost;
              }
            }
          }
        }
      }

      if (yPos > pageHeight - 40) {
        pdf.addPage();
        yPos = margin;
      }

      yPos += 2;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.setTextColor(30, 30, 30);
      pdf.text(block.name, margin, yPos);
      yPos += 4;
      pdf.setDrawColor(220, 220, 220);
      pdf.setLineWidth(0.3);
      pdf.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 3;

      if ((toggles as any).showProjectTotalSqft) {
        const blockSqft = calcBlockSqftSummary(block as any, {
          isCustomerView: true,
          excludedSurfaces: pdfExcludedSurfaces,
          contractorHiddenAreas: contractorHiddenAreas,
          acceptedOptionalAreas: pdfAcceptedOptionalAreas,
        });
        if (blockSqft.includedSqft > 0 || blockSqft.optionalSqft > 0) {
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(8);
          pdf.setTextColor(80, 80, 85);
          const labelText = 'Area Square Footage:';
          pdf.text(labelText, margin, yPos);
          const labelW = pdf.getTextWidth(labelText);
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(9);
          pdf.setTextColor(30, 30, 35);
          const valueText = ` ${formatSqft(blockSqft.includedSqft)}`;
          pdf.text(valueText, margin + labelW, yPos);
          if (blockSqft.optionalSqft > 0) {
            const valueW = pdf.getTextWidth(valueText);
            pdf.setFont('helvetica', 'italic');
            pdf.setFontSize(8);
            pdf.setTextColor(120, 120, 125);
            pdf.text(`  +${formatSqft(blockSqft.optionalSqft)} if add-ons accepted`, margin + labelW + valueW, yPos);
          }
          yPos += 5;
          pdf.setTextColor(0, 0, 0);
        }
      }

      const showSurfaceDetails = toggles.showSurfaceDetails !== false;

      for (let areaIdx = 0; areaIdx < areas.length; areaIdx++) {
        const area = areas[areaIdx];
        const pdfAreaId = `${block.id}:area:${area.roomId}`;
        const pdfAreaHidden = contractorHiddenAreas.includes(pdfAreaId);
        if (pdfAreaHidden) continue;

        if (yPos > pageHeight - 30) {
          pdf.addPage();
          yPos = margin;
        }

        if (areaIdx > 0) {
          yPos += 2;
        }

        const areaRowHeight = 7;
        pdf.setFillColor(245, 245, 248);
        pdf.setDrawColor(220, 220, 220);
        pdf.setLineWidth(0.3);
        pdf.roundedRect(margin, yPos - 4.5, pageWidth - margin * 2, areaRowHeight, 1, 1, 'FD');

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9.5);
        pdf.setTextColor(40, 40, 45);
        pdf.text(area.roomName, margin + 4, yPos);

        const pdfAreaRoom = (data.rooms || []).find((r: any) => r.id === area.roomId);

        if (showSurfaceDetails || (toggles as any).showProjectTotalSqft) {
          const parts: string[] = [];
          if (showSurfaceDetails) {
            parts.push(`${area.length}' × ${area.width}' × ${area.ceilingHeight}'`);
          }
          if ((toggles as any).showProjectTotalSqft) {
            const areaSqft = getAreaSqft(area as any, (pdfAreaRoom as any)?.sectionType);
            if (areaSqft > 0) parts.push(formatSqft(areaSqft));
          }
          if (parts.length > 0) {
            const dimText = parts.join('  ·  ');
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(7.5);
            pdf.setTextColor(140, 140, 145);
            const nameW = pdf.getTextWidth(area.roomName);
            pdf.text(dimText, margin + 4 + nameW + 4, yPos);
          }
        }

        const pdfRoom = pdfAreaRoom;
        const pdfRoomOverride = pdfRoom?.priceOverride;
        // Override always applies when set; showOverrideTotal toggle now only gates the
        // bottom Subtotal/Cost-Breakdown row, not whether the override drives the area total.
        const pdfHasOverride = pdfRoomOverride != null && pdfRoomOverride > 0;

        let areaEffectiveLaborHours = area.totalLaborHours;
        let areaEffectivePrice = area.totalPrice;
        let areaTotal = 0;
        for (const s of area.surfaces) {
          const sid = `${block.id}:${area.roomId}:${s.surfaceKey}`;
          // When the section has a fixed-price override, surface exclusions are
          // ignored — the override is the authoritative total and surface
          // checkboxes are disabled in the customer view.
          if (!pdfHasOverride && excludedSurfaces.includes(sid)) {
            areaEffectiveLaborHours -= (s.laborHours + ((s as any).primerLaborHours || 0));
            areaEffectivePrice -= s.price;
          } else {
            let st = s.price;
            if (!isCustomerProvidingMaterials) {
              if (!(s as any).inMaterialGroup && (s as any).materialTotalCost) st += (s as any).materialTotalCost;
              if ((s as any).primerMaterialTotalCost) st += (s as any).primerMaterialTotalCost;
            }
            if ((s as any).repairPrice) st += (s as any).repairPrice;
            areaTotal += st;
          }
        }

        if (pdfHasOverride) {
          areaTotal = pdfRoomOverride!;
        }

        const areaInfoParts: string[] = [];
        if (toggles.showLaborHrs && !pdfHasOverride) areaInfoParts.push(`${areaEffectiveLaborHours.toFixed(1)} hrs`);
        if (pdfHasOverride) {
          areaInfoParts.push(`$${pdfRoomOverride!.toFixed(2)}`);
        } else if ((toggles as any).showSurfaceTotal) {
          areaInfoParts.push(`$${areaTotal.toFixed(2)}`);
        } else if (toggles.showLaborPrice) {
          areaInfoParts.push(`$${areaEffectivePrice.toFixed(2)}`);
        }
        if (areaInfoParts.length > 0) {
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(8);
          pdf.setTextColor(100, 100, 105);
          pdf.text(areaInfoParts.join('  |  '), pageWidth - margin - 2, yPos, { align: 'right' });
        }

        yPos += 7;

        if (area.scopeNotes) {
          if (yPos > pageHeight - 20) {
            pdf.addPage();
            yPos = margin;
          }
          pdf.setFont('helvetica', 'italic');
          pdf.setFontSize(7.5);
          pdf.setTextColor(130, 130, 135);
          const noteLines = pdf.splitTextToSize(area.scopeNotes, pageWidth - margin * 2 - 14);
          for (const line of noteLines) {
            if (yPos > pageHeight - 20) {
              pdf.addPage();
              yPos = margin;
            }
            pdf.text(line, margin + 8, yPos);
            yPos += 3.8;
          }
          yPos += 2;
        }

        for (const surf of area.surfaces) {
          const surfId = `${block.id}:${area.roomId}:${surf.surfaceKey}`;
          // When section has a fixed-price override, surface exclusions are
          // ignored — render every surface so the breakdown matches the
          // overridden total shown to the customer.
          if (!pdfHasOverride && excludedSurfaces.includes(surfId)) {
            continue;
          }

          if (yPos > pageHeight - 20) {
            pdf.addPage();
            yPos = margin;
          }

          if (pdfHasOverride) {
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(8);
            pdf.setTextColor(60, 60, 65);
            const surfLabel = surf.unit === 'each' && surf.quantity > 1 ? `${surf.surfaceName} ×${surf.quantity}` : surf.surfaceName;
            pdf.text(surfLabel, margin + 10, yPos);
            yPos += 4;
            const bulletX = margin + 14;
            const textX = margin + 17;
            const subDetailX = textX + 2;
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(7.5);
            pdf.setTextColor(90, 90, 95);
            const usePaint1 = (surf as any).usePaint !== false;
            const hasPrimer1 = ((surf as any).primerCoats && (surf as any).primerCoats > 0) || (surf as any).primerMaterialName;
            if (usePaint1 || hasPrimer1) {
              pdf.circle(bulletX, yPos - 0.8, 0.5, 'F');
              const cl1 = (surf as any).coatsLabel || 'coat';
              let coatText = usePaint1 ? `${surf.coats} ${pluralizeLabel(cl1, surf.coats)} of paint` : '';
              if (hasPrimer1) {
                const pc = (surf as any).primerCoats || 1;
                coatText += usePaint1
                  ? ` + ${pc} ${pluralizeLabel(cl1, pc)} primer`
                  : `${pc} ${pluralizeLabel(cl1, pc)} of primer`;
              }
              pdf.text(coatText, textX, yPos);
              yPos += 3.5;
            }

            if (usePaint1 && (surf as any).materialName) {
              if (yPos > pageHeight - 20) { pdf.addPage(); yPos = margin; }
              pdf.setFontSize(7);
              pdf.setTextColor(140, 140, 145);
              const matTypeLabel = getMaterialPdfLabel((surf as any).materialType);
              let matLine = `[${matTypeLabel}] ${(surf as any).materialName}`;
              const inGroup = (surf as any).inMaterialGroup;
              if (inGroup && (surf as any).materialGroupName) {
                matLine += ` (${(surf as any).materialGroupName})`;
              }
              pdf.text(matLine, subDetailX, yPos);
              yPos += 3.5;
            }

            if ((surf as any).primerMaterialName) {
              if (yPos > pageHeight - 20) { pdf.addPage(); yPos = margin; }
              pdf.setFontSize(7);
              pdf.setTextColor(140, 140, 145);
              const primerTypeLabel = getMaterialPdfLabel((surf as any).primerMaterialType);
              pdf.text(`[${primerTypeLabel}] ${(surf as any).primerMaterialName}`, subDetailX, yPos);
              yPos += 3.5;
            }

            yPos += 0.5;
            continue;
          }

          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(8);
          pdf.setTextColor(60, 60, 65);
          const surfLabelNormal = surf.unit === 'each' && surf.quantity > 1 ? `${surf.surfaceName} ×${surf.quantity}` : surf.surfaceName;
          pdf.text(surfLabelNormal, margin + 10, yPos);

          const surfInfoParts: string[] = [];
          if (toggles.showLaborHrs) surfInfoParts.push(`${surf.laborHours.toFixed(1)}h`);
          const showSurfTotal = (toggles as any).showSurfaceTotal;
          if (showSurfTotal || toggles.showLaborPrice) {
            if (showSurfTotal) {
              let sTotal = surf.price;
              if (!isCustomerProvidingMaterials) {
                if (!(surf as any).inMaterialGroup && (surf as any).materialTotalCost) sTotal += (surf as any).materialTotalCost;
                if ((surf as any).primerMaterialTotalCost) sTotal += (surf as any).primerMaterialTotalCost;
              }
              if ((surf as any).repairPrice) sTotal += (surf as any).repairPrice;
              surfInfoParts.push(`$${sTotal.toFixed(2)}`);
            } else {
              surfInfoParts.push(`$${surf.price.toFixed(2)}`);
            }
          }
          if (surfInfoParts.length > 0) {
            pdf.setFont('helvetica', 'normal');
            pdf.setTextColor(110, 110, 115);
            pdf.text(surfInfoParts.join('  |  '), pageWidth - margin, yPos, { align: 'right' });
          }
          yPos += 4;

          if ((surf as any).description) {
            pdf.setFont('helvetica', 'italic');
            pdf.setFontSize(7);
            pdf.setTextColor(120, 120, 125);
            const descLines = pdf.splitTextToSize((surf as any).description, pageWidth - margin * 2 - 18);
            const maxDescLines = Math.min(descLines.length, 3);
            for (let dl = 0; dl < maxDescLines; dl++) {
              if (yPos > pageHeight - 20) { pdf.addPage(); yPos = margin; }
              pdf.text(descLines[dl], margin + 14, yPos);
              yPos += 3;
            }
            yPos += 0.5;
          }

          const bulletX = margin + 14;
          const textX = margin + 17;

          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(7.5);
          pdf.setTextColor(90, 90, 95);
          const usePaint2 = (surf as any).usePaint !== false;
          const cl2 = (surf as any).coatsLabel || 'coat';
          if (usePaint2) {
            pdf.circle(bulletX, yPos - 0.8, 0.5, 'F');
            pdf.text(`${surf.coats} ${pluralizeLabel(cl2, surf.coats)} of paint`, textX, yPos);
            yPos += 3.5;
          }

          const subDetailX = textX + 2;
          const showMatInfo = !isCustomerProvidingMaterials && ((toggles as any).showMaterials ?? true) && (toggles.showMaterialQty || toggles.showMaterialPrice);
          if (usePaint2 && (surf as any).materialName) {
            pdf.setFontSize(7);
            pdf.setTextColor(140, 140, 145);
            const matTypeLabel = getMaterialPdfLabel((surf as any).materialType);
            let matLine = `[${matTypeLabel}] ${(surf as any).materialName}`;
            const inGroup = (surf as any).inMaterialGroup;
            if (inGroup && (surf as any).materialGroupName) {
              matLine += ` (${(surf as any).materialGroupName})`;
            }
            if (!inGroup && showMatInfo && toggles.showMaterialQty && (surf as any).materialQtyExact != null) {
              matLine += `  ·  ${((surf as any).materialQtyExact as number).toFixed(2)} ${(surf as any).materialUnit || 'gal'}`;
              if ((surf as any).materialQtyBuy != null) {
                matLine += `  ·  Buy ${(surf as any).materialQtyBuy}`;
              }
            }
            if (!inGroup && showMatInfo && toggles.showMaterialPrice && (surf as any).materialTotalCost != null) {
              matLine += `  ·  $${((surf as any).materialTotalCost as number).toFixed(2)}`;
            }
            pdf.text(matLine, subDetailX, yPos);
            yPos += 3.5;
          }

          if ((surf as any).primerCoats && (surf as any).primerCoats > 0 || (surf as any).primerMaterialName) {
            const pc = (surf as any).primerCoats || 1;
            pdf.setFontSize(7.5);
            pdf.setTextColor(90, 90, 95);
            pdf.circle(bulletX, yPos - 0.8, 0.5, 'F');
            pdf.text(`${pc} ${pluralizeLabel(cl2, pc)} of primer`, textX, yPos);
            yPos += 3.5;
          }

          if ((surf as any).primerMaterialName) {
            pdf.setFontSize(7);
            pdf.setTextColor(140, 140, 145);
            const primerTypeLabel = getMaterialPdfLabel((surf as any).primerMaterialType);
            pdf.text(`[${primerTypeLabel}] ${(surf as any).primerMaterialName}`, subDetailX, yPos);
            yPos += 3.5;
          }

          const hasRepairHrs = (surf as any).repairHours && (surf as any).repairHours > 0;
          if (hasRepairHrs) {
            pdf.setFontSize(7.5);
            pdf.setTextColor(90, 90, 95);
            pdf.circle(bulletX, yPos - 0.8, 0.5, 'F');
            pdf.text('Repair', textX, yPos);
            yPos += 3.5;
          }

          if ((surf as any).repairDescription) {
            pdf.setFont('helvetica', 'italic');
            pdf.setFontSize(7);
            pdf.setTextColor(120, 120, 125);
            const repairDescLines = pdf.splitTextToSize((surf as any).repairDescription, pageWidth - margin * 2 - 23);
            const maxRepairLines = Math.min(repairDescLines.length, 3);
            for (let rdl = 0; rdl < maxRepairLines; rdl++) {
              if (yPos > pageHeight - 20) { pdf.addPage(); yPos = margin; }
              pdf.text(repairDescLines[rdl], subDetailX, yPos);
              yPos += 3;
            }
            pdf.setFont('helvetica', 'normal');
            yPos += 0.5;
          }

          if ((toggles as any).showRepairPrice && (surf as any).repairPrice && (surf as any).repairPrice > 0) {
            pdf.setFontSize(7);
            pdf.setTextColor(140, 140, 145);
            pdf.text(`Repair Cost: $${((surf as any).repairPrice as number).toFixed(2)}`, subDetailX, yPos);
            yPos += 3.5;
          }

          if (showSurfaceDetails) {
            pdf.setFontSize(7);
            pdf.setTextColor(140, 140, 145);
            const sqftLabel = surf.paintableSqft > 0 ? `${surf.paintableSqft.toFixed(0)} sqft` : `${surf.quantity.toLocaleString()} ${surf.unit}`;
            pdf.text(`Area: ${sqftLabel}`, margin + 14, yPos);
            yPos += 3.5;
          }
        }


        yPos += 2;
      }

      const showMaterialInfo = !isCustomerProvidingMaterials && ((toggles as any).showMaterials ?? true) && (toggles.showMaterialQty || toggles.showMaterialPrice);

      if (data.materialGroupResults && data.materialGroupResults.length > 0 && showMaterialInfo) {
        if (yPos > pageHeight - 20) {
          pdf.addPage();
          yPos = margin;
        }
        pdf.setDrawColor(220, 220, 220);
        pdf.setLineWidth(0.2);
        pdf.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 5;
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(7.5);
        pdf.setTextColor(100, 100, 105);
        pdf.text('MATERIAL GROUPS', margin + 4, yPos);
        yPos += 5;
        for (const group of data.materialGroupResults) {
          if (yPos > pageHeight - 20) {
            pdf.addPage();
            yPos = margin;
          }
          // Net cost (gross minus the portion attributable to overridden rooms).
          // We show this on the per-group line so the sum of group costs matches
          // the Materials block subtotal printed below.
          const groupExcluded = group.excludedCost ?? 0;
          const groupNetCost = group.totalCost - groupExcluded;
          const groupHasExclusion = groupExcluded > 0.005;
          const groupFullyExcluded = groupExcluded >= group.totalCost - 0.005;
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(7.5);
          pdf.setTextColor(70, 70, 75);
          pdf.text(group.groupName, margin + 6, yPos);
          if (toggles.showMaterialPrice) {
            const priceLabel = groupFullyExcluded
              ? '(in room price)'
              : groupHasExclusion
                ? `$${groupNetCost.toFixed(2)} (net)`
                : `$${group.totalCost.toFixed(2)}`;
            pdf.text(priceLabel, pageWidth - margin, yPos, { align: 'right' });
          }
          yPos += 4;
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(7);
          pdf.setTextColor(130, 130, 135);
          pdf.text(group.materialName, margin + 9, yPos);
          yPos += 3.5;
          const surfList = group.surfaces.map((s: any) => showSurfaceDetails ? `${s.surfaceName} (${s.sqft.toFixed(0)} sqft)` : s.surfaceName).join(', ');
          pdf.text(`Surfaces: ${surfList}`, margin + 9, yPos);
          yPos += 3.5;
          if (toggles.showMaterialQty) {
            pdf.text(`${group.totalSqft.toFixed(0)} sqft pooled  —  ${group.coveragePerUnit} sqft/${group.materialUnit}`, margin + 9, yPos);
            yPos += 3.5;
            pdf.text(`${group.exactQtyNeeded.toFixed(2)} ${group.materialUnit} needed  —  Buy ${group.qtyToBuy} ${group.materialUnit} @ $${group.costPerUnit.toFixed(2)}/${group.materialUnit}`, margin + 9, yPos);
            yPos += 4;
          }
          yPos += 2;
        }
        yPos += 2;
      }

      pdf.setDrawColor(200, 200, 200);
      pdf.setLineWidth(0.3);
      pdf.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 3;

      const summaryParts: string[] = [];
      // data.totalMaterialCost is already net-of-excluded and includes
      // ungrouped + group + primer-group totals (see RoomBuilder.totalMaterialCost),
      // so don't re-add groupMatCost — that double-counted in earlier versions.
      const combinedMaterialCost = isCustomerProvidingMaterials ? 0 : (data.totalMaterialCost || 0);
      const effLaborHours = data.totalLaborHours - blockExclLaborHours;
      const effLaborCost = data.totalLaborCost - blockExclLaborCost;
      const effMaterialCost = combinedMaterialCost - blockExclMaterialCost;
      const effGrandTotal = data.grandTotal - blockExclLaborCost - blockExclMaterialCost;
      if (toggles.showLaborHrs) summaryParts.push(`Labor: ${effLaborHours.toFixed(1)} hrs`);
      if (toggles.showLaborPrice && combinedMaterialCost > 0 && !isCustomerProvidingMaterials) {
        summaryParts.push(`Labor: $${effLaborCost.toFixed(2)}`);
        summaryParts.push(`Materials: $${effMaterialCost.toFixed(2)}`);
      }
      const pdfShowOverrideTotal = (toggles as any).showOverrideTotal !== false;
      if (pdfShowOverrideTotal) {
        if (summaryParts.length > 0) {
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(8);
          pdf.setTextColor(110, 110, 115);
          pdf.text(summaryParts.join('   |   '), margin, yPos);
        }

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(10);
        pdf.setTextColor(30, 30, 30);
        pdf.text(`Sub Total: $${effGrandTotal.toFixed(2)}`, pageWidth - margin, yPos, { align: 'right' });
        yPos += 6;
      }
      // --- End block rendering ---
    }
  }
  if (pendingItems.length > 0) {
    renderLineItemTable(pendingItems);
    pendingItems = [];
  }

  // Optional Items Section - only show accepted optional items
  if (acceptedOptionalLineItems.length > 0) {
    yPos += 3;
    if (yPos > pageHeight - 40) {
      pdf.addPage();
      yPos = margin;
    }

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(16, 185, 129);
    pdf.text('Additional Selected Items', margin, yPos);
    yPos += 3;

    const optTableData: any[][] = [];
    const optDescRowIndices: Map<number, string> = new Map();
    let optRowIndex = 0;

    acceptedOptionalLineItems.forEach(item => {
      const descriptionText = stripHtmlTags(item.description);
      const itemName = item.name || '';

      optTableData.push([
        { content: itemName, styles: { fontStyle: 'bold' } },
        { content: item.quantity.toString(), styles: { halign: 'center' } },
        { content: `$${(item.unitPrice / 100).toFixed(2)}`, styles: { halign: 'right' } },
        { content: `$${(item.total / 100).toFixed(2)}`, styles: { halign: 'right', fontStyle: 'bold' } }
      ]);
      optRowIndex++;

      if (item.description) {
        optDescRowIndices.set(optRowIndex, item.description);
        optTableData.push([
          { content: descriptionText, colSpan: 3, styles: { textColor: [80, 80, 80], fontSize: 8, cellPadding: { top: 1, bottom: 3, left: 4, right: 4 } } },
          ''
        ]);
        optRowIndex++;
      }
    });

    const optDescWidth = pageWidth - (margin * 2) - 30 - 8;

    autoTable(pdf, {
      startY: yPos,
      head: [[
        { content: '', styles: { halign: 'left' } },
        { content: 'Qty', styles: { halign: 'center' } },
        { content: 'Price', styles: { halign: 'right' } },
        { content: 'Total', styles: { halign: 'right' } }
      ]],
      body: optTableData,
      margin: { top: margin, left: margin, right: margin, bottom: 10 },
      pageBreak: 'auto',
      showHead: 'firstPage',
      headStyles: {
        fillColor: [236, 253, 245],
        textColor: [16, 120, 80],
        fontStyle: 'bold',
        fontSize: 8,
        cellPadding: { top: 2, bottom: 2, left: 5, right: 0 },
        lineWidth: 0
      },
      bodyStyles: {
        fontSize: 9,
        cellPadding: { top: 3, bottom: 2, left: 5, right: 0 },
        lineWidth: 0
      },
      columnStyles: {
        0: { cellWidth: 'auto', cellPadding: { top: 3, bottom: 2, left: 5, right: 5 } },
        1: { cellWidth: 14 },
        2: { cellWidth: 22 },
        3: { cellWidth: 24 }
      },
      theme: 'plain',
      styles: {
        lineColor: [167, 243, 208],
        lineWidth: 0
      },
      didParseCell: (data) => {
        data.cell.styles.lineWidth = 0;
        if (data.section === 'body' && data.column.index === 0) {
          const html = optDescRowIndices.get(data.row.index);
          if (html) {
            const neededHeight = estimateRichTextHeight(pdf, html, optDescWidth);
            data.cell.styles.minCellHeight = Math.max(neededHeight + 4, 10);
          }
        }
      },
      didDrawCell: (() => {
        const rowProgress = new Map<number, number>();
        return (data: any) => {
          if (data.section === 'body' && data.column.index === 0) {
            const html = optDescRowIndices.get(data.row.index);
            if (html) {
              const startLine = rowProgress.get(data.row.index) || 0;
              const padTop = 2;
              const padBottom = 2;
              pdf.setFillColor(255, 255, 255);
              pdf.rect(data.cell.x, data.cell.y, optDescWidth + 8, data.cell.height, 'F');
              const maxH = data.cell.height - padTop - padBottom;
              const result = drawRichText(pdf, html, data.cell.x + 4, data.cell.y + padTop, optDescWidth, false, maxH, startLine);
              rowProgress.set(data.row.index, result.nextLine);
            }
          }
        };
      })()
    });

    yPos = (pdf as any).lastAutoTable.finalY;

    const optTotal = acceptedOptionalLineItems.reduce((sum, item) => sum + (item.total || 0), 0);
    yPos += 2;
    pdf.setDrawColor(200);
    pdf.setLineWidth(0.3);
    pdf.line(pageWidth - margin - 70, yPos, pageWidth - margin, yPos);
    yPos += 4;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(0, 0, 0);
    pdf.text('Sub Total:', pageWidth - margin - 55, yPos);
    pdf.text(`$${(optTotal / 100).toFixed(2)}`, pageWidth - margin, yPos, { align: 'right' });
    yPos += 4;
    pdf.setTextColor(0, 0, 0);
  }
  
  // === PACKAGES & UPGRADES SECTION (after line items, before totals) ===
  if (pdfPkgEnabled) {
    const selectedId = pdfSelectedPkgIdResolved ?? (hasAllPackages ? allPackages![0]?.id : undefined);
    const packagesToShow = hasAllPackages ? allPackages! : (pkgSnap ? [pkgSnap] : []);
    const pdfNonOptBlocks = (doc.content?.productionRateBlocks || []).filter((b: any) => !b.isOptional);
    const pdfBlocksCents = pdfNonOptBlocks.reduce((s: number, b: any) => s + Math.round((b.roomBuilderData?.grandTotal || 0) * 100), 0);
    const pdfNonOptItems = (doc.content?.items || []).filter((item: any) => !item.isOptional && !item.name?.startsWith('[CO]'));
    const pdfItemsCents = pdfNonOptItems.reduce((s: number, i: any) => s + (i.total || 0), 0);
    const pdfPkgHiddenItemsCents = pdfNonOptItems.reduce((s: number, i: any, idx: number) => {
      const key = `item-${i.name || idx}`;
      return pdfChItemsEarly.includes(key) ? s + (i.total || 0) : s;
    }, 0);
    const pdfHasBlocks = pdfNonOptBlocks.length > 0;
    const baseTotal = (pdfHasBlocks
      ? pdfBlocksCents + pdfItemsCents
      : doc.totalAmount - (signedChangeOrders.reduce((sum, co) => sum + co.totalAmount, 0))) - pdfPkgHiddenItemsCents;

    if (packagesToShow.length > 0) {
      const perRow = 3;
      const cardGap = 4;
      const cardPad = 5.5;
      const cardRadius = 3.6;
      const featureLineH = 5;
      const circleR = 2;

      const maxFeatures = Math.max(0, ...packagesToShow.map((p: any) => (p.features || []).length));
      const headerBlockH = 18;
      const featuresBlockH = maxFeatures * featureLineH;
      const btnBlockH = 10;
      const cardHeight = cardPad + headerBlockH + featuresBlockH + btnBlockH + cardPad;

      const rows: any[][] = [];
      for (let r = 0; r < packagesToShow.length; r += perRow) {
        rows.push(packagesToShow.slice(r, r + perRow));
      }

      for (const row of rows) {
        const maxCols = Math.max(row.length, 3);
        const maxGaps = (maxCols - 1) * cardGap;
        const cardWidth = (pageWidth - margin * 2 - maxGaps) / maxCols;
        const rowTotalWidth = row.length * cardWidth + (row.length - 1) * cardGap;
        const rowStartX = margin + (pageWidth - margin * 2 - rowTotalWidth) / 2;

        if (yPos + cardHeight + 4 > pageHeight - 20) { pdf.addPage(); yPos = margin; }
        yPos += 3;

        for (let i = 0; i < row.length; i++) {
          const pkg = row[i];
          const cardX = rowStartX + i * (cardWidth + cardGap);
          const isSelected = Number(pkg.id) === Number(selectedId);

          let pkgPrice = baseTotal;
          if (pkg.priceAdjustmentType === 'percent') {
            pkgPrice = baseTotal + Math.round(baseTotal * (pkg.adjustmentValue / 100));
          } else {
            pkgPrice = baseTotal + Math.round((pkg.adjustmentValue || 0) * 100);
          }

          pdf.setFillColor(242, 243, 245);
          if (isSelected) {
            pdf.setDrawColor(0, 0, 0);
            pdf.setLineWidth(0.7);
          } else {
            pdf.setDrawColor(200, 202, 208);
            pdf.setLineWidth(0.3);
          }
          pdf.roundedRect(cardX, yPos, cardWidth, cardHeight, cardRadius, cardRadius, 'FD');

          let innerY = yPos + cardPad + 3.5;

          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(11);
          pdf.setTextColor(30, 30, 35);
          pdf.text(pkg.name, cardX + cardPad, innerY);

          if (pkg.recommended) {
            const badgeText = 'Most Popular';
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(6.5);
            const badgeW = pdf.getTextWidth(badgeText) + 5;
            const badgeH = 4;
            const badgeX = cardX + cardWidth - cardPad - badgeW;
            const badgeY = innerY - 3;
            pdf.setFillColor(255, 243, 220);
            pdf.roundedRect(badgeX, badgeY, badgeW, badgeH, 1.5, 1.5, 'F');
            pdf.setTextColor(180, 120, 20);
            pdf.text(badgeText, badgeX + 2.5, badgeY + 3);
          }

          innerY += 7;

          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(16);
          pdf.setTextColor(30, 30, 35);
          const priceStr = `$${(pkgPrice / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          pdf.text(priceStr, cardX + cardPad, innerY);
          innerY += 8;

          const allFeatures = pkg.features || [];
          pdf.setFontSize(7.5);
          for (const feat of allFeatures) {
            const cx = cardX + cardPad + circleR + 0.5;
            const cy = innerY - 1.2;
            const textX = cardX + cardPad + circleR * 2 + 3;

            if (feat.included) {
              pdf.setFillColor(220, 245, 220);
              pdf.circle(cx, cy, circleR, 'F');
              pdf.setDrawColor(60, 160, 60);
              pdf.setLineWidth(0.45);
              pdf.line(cx - 0.9, cy, cx - 0.1, cy + 0.8);
              pdf.line(cx - 0.1, cy + 0.8, cx + 1.0, cy - 0.7);

              pdf.setFont('helvetica', 'normal');
              pdf.setFontSize(7.5);
              pdf.setTextColor(40, 45, 40);
              pdf.text(feat.name, textX, innerY);
            } else {
              pdf.setFillColor(230, 230, 232);
              pdf.circle(cx, cy, circleR, 'F');
              pdf.setDrawColor(160, 160, 165);
              pdf.setLineWidth(0.4);
              pdf.line(cx - 0.7, cy - 0.7, cx + 0.7, cy + 0.7);
              pdf.line(cx + 0.7, cy - 0.7, cx - 0.7, cy + 0.7);

              pdf.setFont('helvetica', 'normal');
              pdf.setFontSize(7.5);
              pdf.setTextColor(160, 160, 165);
              const nameW = pdf.getTextWidth(feat.name);
              pdf.text(feat.name, textX, innerY);
              pdf.setDrawColor(160, 160, 165);
              pdf.setLineWidth(0.15);
              pdf.line(textX, innerY - 1, textX + nameW, innerY - 1);
            }
            innerY += featureLineH;
          }
          for (let f = allFeatures.length; f < maxFeatures; f++) {
            innerY += featureLineH;
          }

          innerY += 1;
          const btnX = cardX + cardPad;
          const btnW = cardWidth - cardPad * 2;
          const btnH = 7;
          const btnY = innerY;
          const btnR = 2.5;

          if (isSelected) {
            pdf.setFillColor(220, 245, 220);
            pdf.setDrawColor(60, 160, 60);
            pdf.setLineWidth(0.5);
            pdf.roundedRect(btnX, btnY, btnW, btnH, btnR, btnR, 'FD');
            const btnCenterX = btnX + btnW / 2;
            const btnCenterY = btnY + btnH / 2;
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(7.5);
            pdf.setTextColor(40, 120, 40);
            const selText = 'Selected';
            const selTextW = pdf.getTextWidth(selText);
            const checkGap = 2;
            const totalW = 3 + checkGap + selTextW;
            const startX = btnCenterX - totalW / 2;
            pdf.setDrawColor(40, 120, 40);
            pdf.setLineWidth(0.5);
            pdf.line(startX, btnCenterY + 0.2, startX + 1, btnCenterY + 1.2);
            pdf.line(startX + 1, btnCenterY + 1.2, startX + 2.5, btnCenterY - 0.8);
            pdf.text(selText, startX + 3 + checkGap, btnCenterY + 1);
          } else {
            pdf.setFillColor(242, 243, 245);
            pdf.setDrawColor(140, 140, 145);
            pdf.setLineWidth(0.35);
            pdf.roundedRect(btnX, btnY, btnW, btnH, btnR, btnR, 'FD');
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(7.5);
            pdf.setTextColor(80, 80, 85);
            pdf.text('Select Package', btnX + btnW / 2, btnY + btnH / 2 + 1, { align: 'center' });
          }
        }

        yPos += cardHeight + 2;
      }

      const selPkg = packagesToShow.find((p: any) => Number(p.id) === Number(selectedId));
      if (selPkg) {
        const includedFeats = (selPkg.features || []).filter((f: any) => f.included);
        const featsWithDesc = includedFeats.filter((f: any) => f.description);
        if (featsWithDesc.length > 0) {
          const estHeight = 14 + featsWithDesc.length * 10;
          if (yPos + estHeight > pageHeight - 20) { pdf.addPage(); yPos = margin; }

          yPos += 1;
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(9);
          pdf.setTextColor(30, 30, 35);
          pdf.text(`${selPkg.name} — What's Included`, margin, yPos);
          yPos += 4;

          for (const feat of featsWithDesc) {
            if (yPos + 10 > pageHeight - 20) { pdf.addPage(); yPos = margin; }

            pdf.setDrawColor(60, 160, 60);
            pdf.setLineWidth(0.45);
            const cx = margin + 2.5;
            const cy = yPos - 1.2;
            pdf.setFillColor(220, 245, 220);
            pdf.circle(cx, cy, 2, 'F');
            pdf.line(cx - 0.9, cy, cx - 0.1, cy + 0.8);
            pdf.line(cx - 0.1, cy + 0.8, cx + 1.0, cy - 0.7);

            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(8);
            pdf.setTextColor(30, 30, 35);
            pdf.text(feat.name, margin + 7, yPos);
            yPos += 4;

            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(7);
            pdf.setTextColor(100, 100, 105);
            const descLines = pdf.splitTextToSize(`• ${feat.description}`, pageWidth - margin * 2 - 7);
            pdf.text(descLines, margin + 7, yPos);
            yPos += descLines.length * 3.2 + 2;
          }
          yPos += 1;
        }
      }
    }
  }

  // === END PACKAGES & UPGRADES SECTION ===

  // Check if we need a new page for totals section
  if (yPos > pageHeight - 20) {
    pdf.addPage();
    yPos = margin;
  }

  pdf.setTextColor(0, 0, 0);

  const needsTotalsSeparator = true;
  const acceptedOptTotalRaw = acceptedOptionalLineItems.reduce((sum, item) => sum + (item.total || 0), 0);
  const acceptedOptTotal = doc.signature ? 0 : acceptedOptTotalRaw;
  const coAdjust = signedChangeOrders.reduce((sum, co) => sum + co.totalAmount, 0);
  const totNonOptBlocks = (doc.content?.productionRateBlocks || []).filter((b: any) => !b.isOptional);
  const totBlocksCents = totNonOptBlocks.reduce((s: number, b: any) => s + Math.round((b.roomBuilderData?.grandTotal || 0) * 100), 0);
  const totNonOptItems = (doc.content?.items || []).filter((item: any) => !item.isOptional && !item.name?.startsWith('[CO]'));
  const totItemsCents = totNonOptItems.reduce((s: number, i: any) => s + (i.total || 0), 0);
  const pdfChItems: string[] = (doc.content as any)?.contractorHiddenItems || [];
  const pdfHiddenItemsCents = totNonOptItems.reduce((s: number, i: any, idx: number) => {
    const key = `item-${i.name || idx}`;
    return pdfChItems.includes(key) ? s + (i.total || 0) : s;
  }, 0);
  const totHasBlocks = totNonOptBlocks.length > 0;
  const baseTotalForCalc = totHasBlocks
    ? totBlocksCents + totItemsCents
    : doc.totalAmount - coAdjust;

  const pdfExcludedSurfaces: string[] = overrideExcludedSurfaces
    ?? (doc.content as any)?.excludedSurfaces
    ?? [];
  const pdfAcceptedOptionalAreas: string[] = overrideAcceptedOptionalAreas
    ?? (doc.content as any)?.acceptedOptionalAreas
    ?? [];

  let pdfExcludedSurfacesCents = 0;
  let pdfOptionalAreaExclCents = 0;
  let pdfContractorHiddenCents = 0;
  {
    const pdfChAreas: string[] = (doc.content as any)?.contractorHiddenAreas || [];
    const allPdfBlocksForExcl = (doc.content?.productionRateBlocks || []);

    if (pdfExcludedSurfaces.length > 0) {
      const filtered = filterExcludedForHiddenAreas(pdfExcludedSurfaces, pdfChAreas);
      if (filtered.length > 0) {
        for (const block of allPdfBlocksForExcl) {
          if ((block as any).isOptional) continue;
          const excl = calcExcludedTotals(block as any, filtered);
          pdfExcludedSurfacesCents += Math.round(excl.grandTotal * 100);
        }
      }
    }

    for (const block of allPdfBlocksForExcl) {
      if ((block as any).isOptional) continue;
      const areaResults = (block as any).roomBuilderData?.areaResults || [];
      const rooms = (block as any).roomBuilderData?.rooms || [];
      const unacceptedAreaIds = areaResults
        .filter((a: any) => {
          const room = rooms.find((r: any) => r.id === a.roomId);
          const isOpt = a.isOptional || (room as any)?.isOptional;
          if (!isOpt) return false;
          return !pdfAcceptedOptionalAreas.includes(`${(block as any).id}:area:${a.roomId}`);
        })
        .map((a: any) => `${(block as any).id}:area:${a.roomId}`);
      if (unacceptedAreaIds.length > 0) {
        const excl = calcOptionalAreaTotals(block as any, unacceptedAreaIds);
        pdfOptionalAreaExclCents += Math.round(excl.grandTotal * 100);
      }
    }
    if (pdfChAreas.length > 0) {
      const allPdfBlocks = (doc.content?.productionRateBlocks || []);
      for (const blk of allPdfBlocks) {
        if ((blk as any).isOptional) continue;
        const blkData = (blk as any).roomBuilderData;
        if (!blkData?.areaResults) continue;
        const areas = blkData.areaResults;
        let hiddenCount = 0;
        const isCustomerMat = !!blkData.customerProvidingMaterials;
        let blkHiddenCents = 0;
        for (const a of areas) {
          const aId = `${(blk as any).id}:area:${a.roomId}`;
          if (!pdfChAreas.includes(aId)) continue;
          hiddenCount++;
          for (const s of a.surfaces) {
            let surfCost = s.price;
            if (!isCustomerMat) {
              if (!(s as any).inMaterialGroup && (s as any).materialTotalCost) surfCost += (s as any).materialTotalCost;
              if ((s as any).primerMaterialTotalCost) surfCost += (s as any).primerMaterialTotalCost;
            }
            if ((s as any).repairPrice) surfCost += (s as any).repairPrice;
            blkHiddenCents += Math.round(surfCost * 100);
          }
        }
        if (hiddenCount === areas.length) {
          pdfContractorHiddenCents += Math.round((blkData.grandTotal || 0) * 100);
        } else {
          pdfContractorHiddenCents += blkHiddenCents;
        }
      }
    }
  }
  let effectiveTotal = baseTotalForCalc + coAdjust + acceptedOptTotal - pdfContractorHiddenCents - pdfHiddenItemsCents - pdfExcludedSurfacesCents - pdfOptionalAreaExclCents;

  const activeSelectedId = pdfSelectedPkgIdResolved ?? (hasAllPackages ? allPackages![0]?.id : undefined);
  if (pdfPkgEnabled && activeSelectedId) {
    const selectedPkgData = (hasAllPackages ? allPackages!.find((p: any) => Number(p.id) === Number(activeSelectedId)) : null)
      || pkgSnap;
    if (selectedPkgData) {
      const pdfEffectiveBase = baseTotalForCalc - pdfContractorHiddenCents - pdfHiddenItemsCents - pdfExcludedSurfacesCents - pdfOptionalAreaExclCents;
      let adjusted = pdfEffectiveBase;
      if (selectedPkgData.priceAdjustmentType === 'percent') {
        adjusted = pdfEffectiveBase + Math.round(pdfEffectiveBase * (selectedPkgData.adjustmentValue / 100));
      } else {
        adjusted = pdfEffectiveBase + Math.round((selectedPkgData.adjustmentValue || 0) * 100);
      }
      effectiveTotal = adjusted + acceptedOptTotal + coAdjust;
    }
  }

  const pdfDiscounts: { type: 'flat' | 'percentage'; value: number; label?: string }[] =
    (doc.content as any)?.discounts?.length
      ? (doc.content as any).discounts
      : (doc.content as any)?.discount?.value ? [(doc.content as any).discount] : [];
  let discountCents = 0;
  if (pdfDiscounts.length > 0 && !doc.signature) {
    const subtotalForDiscount = effectiveTotal - coAdjust;
    const baseForDiscount = subtotalForDiscount - acceptedOptTotal;
    for (const dd of pdfDiscounts) {
      if (dd.value > 0) {
        discountCents += dd.type === 'percentage'
          ? Math.round(baseForDiscount * (Math.min(dd.value, 100) / 100))
          : Math.round(dd.value * 100);
      }
    }
    discountCents = Math.min(discountCents, Math.max(0, subtotalForDiscount));
    effectiveTotal = effectiveTotal - discountCents;
  }

  const pdfBlocks = doc.content?.productionRateBlocks || [];
  const pdfTaxBlock = pdfBlocks.find((b: any) => b.taxable && b.taxProfileRate != null);
  const pdfTaxRate = pdfTaxBlock ? parseFloat(String(pdfTaxBlock.taxProfileRate)) : (settings.taxRate ? parseFloat(settings.taxRate) : 0);
  const pdfTaxProfileNameRaw = pdfTaxBlock?.taxProfileName || null;
  const pdfTaxProfileName = pdfTaxProfileNameRaw && pdfTaxProfileNameRaw.length > 22
    ? pdfTaxProfileNameRaw.slice(0, 20).trimEnd() + '…'
    : pdfTaxProfileNameRaw;
  let pdfTaxableTotal = 0;
  for (const item of (doc.content?.items || []).filter((i: any) => i.taxable && !i.isOptional && !i.descriptionOnly)) {
    pdfTaxableTotal += (item.total || 0);
  }
  for (const block of pdfBlocks.filter((b: any) => b.taxable && !b.isOptional)) {
    pdfTaxableTotal += Math.round((block.roomBuilderData?.grandTotal || 0) * 100);
  }
  pdfTaxableTotal -= pdfContractorHiddenCents;
  pdfTaxableTotal -= pdfHiddenItemsCents;
  if (pdfExcludedSurfacesCents > 0) {
    const pdfChAreasForTax: string[] = (doc.content as any)?.contractorHiddenAreas || [];
    const filteredForTax = filterExcludedForHiddenAreas(pdfExcludedSurfaces, pdfChAreasForTax);
    if (filteredForTax.length > 0) {
      for (const block of pdfBlocks) {
        if ((block as any).isOptional) continue;
        if (!(block as any).taxable) continue;
        const excl = calcExcludedTotals(block as any, filteredForTax);
        pdfTaxableTotal -= Math.round(excl.grandTotal * 100);
      }
    }
  }
  if (pdfOptionalAreaExclCents > 0) {
    for (const block of pdfBlocks) {
      if ((block as any).isOptional) continue;
      if (!(block as any).taxable) continue;
      const areaResults = (block as any).roomBuilderData?.areaResults || [];
      const rooms = (block as any).roomBuilderData?.rooms || [];
      const unacceptedAreaIds = areaResults
        .filter((a: any) => {
          const room = rooms.find((r: any) => r.id === a.roomId);
          const isOpt = a.isOptional || (room as any)?.isOptional;
          if (!isOpt) return false;
          return !pdfAcceptedOptionalAreas.includes(`${(block as any).id}:area:${a.roomId}`);
        })
        .map((a: any) => `${(block as any).id}:area:${a.roomId}`);
      if (unacceptedAreaIds.length > 0) {
        const excl = calcOptionalAreaTotals(block as any, unacceptedAreaIds);
        pdfTaxableTotal -= Math.round(excl.grandTotal * 100);
      }
    }
  }
  pdfTaxableTotal = Math.max(0, pdfTaxableTotal);
  if (discountCents > 0 && (effectiveTotal + discountCents) > 0) {
    pdfTaxableTotal = Math.round(pdfTaxableTotal * (effectiveTotal / (effectiveTotal + discountCents)));
  }
  const pdfTaxAmount = pdfTaxRate > 0 ? Math.round(pdfTaxableTotal * pdfTaxRate / 100) : 0;
  if (pdfTaxAmount > 0) effectiveTotal += pdfTaxAmount;

  if (needsTotalsSeparator) {
    yPos += 1;
    pdf.setDrawColor(200, 200, 200);
    pdf.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 4;
  } else {
    yPos += 2;
  }

  // Calculate original total based on whether this is an invoice with change orders
  const invoiceCOTotal = invoiceChangeOrderItems.reduce((sum, item) => sum + (item.total || 0), 0) / 100;
  const originalTotal = isInvoice && invoiceChangeOrderItems.length > 0
    ? (effectiveTotal / 100) - invoiceCOTotal
    : (effectiveTotal - coAdjust) / 100;
  
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  
  // For invoices with embedded change order items
  if (isInvoice && invoiceChangeOrderItems.length > 0) {
    // Show original total
    pdf.text('Original Total:', pageWidth - margin - 60, yPos);
    pdf.text(`$${originalTotal.toFixed(2)}`, pageWidth - margin, yPos, { align: 'right' });
    yPos += 12;
    
    // Change orders start on a new page
    pdf.addPage();
    yPos = margin;
    
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.text('Accepted Change Orders', margin, yPos);
    yPos += 10;
    
    // Build table data for change order items
    const coTableData: any[][] = [];
    const coDescriptionRowIndices: Map<number, string> = new Map();
    let coRowIndex = 0;
    
    invoiceChangeOrderItems.forEach(item => {
      const descriptionText = stripHtmlTags(item.description);
      // Remove [CO] prefix from the name for display
      const itemName = item.name?.replace('[CO] ', '') || '';
      
      coTableData.push([
        { content: itemName, styles: { fontStyle: 'bold' } },
        { content: item.quantity.toString(), styles: { halign: 'center' } },
        { content: `$${(item.unitPrice / 100).toFixed(2)}`, styles: { halign: 'center' } },
        { content: `$${(item.total / 100).toFixed(2)}`, styles: { halign: 'center', fontStyle: 'bold' } }
      ]);
      coRowIndex++;
      
      if (item.description) {
        coDescriptionRowIndices.set(coRowIndex, item.description);
        coTableData.push([
          { content: descriptionText, colSpan: 3, styles: { textColor: [80, 80, 80], fontSize: 8, cellPadding: { top: 1, bottom: 3, left: 4, right: 4 } } },
          ''
        ]);
        coRowIndex++;
      }
    });
    
    autoTable(pdf, {
      startY: yPos,
      head: [[
        { content: '', styles: { halign: 'left' } },
        { content: 'Qty', styles: { halign: 'center' } },
        { content: 'Price', styles: { halign: 'center' } },
        { content: 'Total', styles: { halign: 'center' } }
      ]],
      body: coTableData,
      margin: { top: 5, left: margin, right: margin, bottom: 20 },
      pageBreak: 'auto',
      showHead: 'firstPage',
      headStyles: {
        fillColor: [245, 245, 248],
        textColor: [100, 100, 105],
        fontStyle: 'bold',
        fontSize: 8,
        cellPadding: { top: 2, bottom: 4, left: 5, right: 5 },
        lineWidth: 0
      },
      bodyStyles: {
        fontSize: 9,
        cellPadding: { top: 3, bottom: 2, left: 5, right: 5 },
        lineWidth: 0
      },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 22 },
        2: { cellWidth: 32 },
        3: { cellWidth: 32 }
      },
      theme: 'plain',
      styles: {
        lineColor: [220, 220, 220],
        lineWidth: 0
      },
      didParseCell: (data) => {
        data.cell.styles.lineWidth = 0;
        if (data.section === 'body' && data.column.index === 0) {
          const html = coDescriptionRowIndices.get(data.row.index);
          if (html) {
            const neededHeight = estimateRichTextHeight(pdf, html, descriptionWidth);
            data.cell.styles.minCellHeight = Math.max(neededHeight + 4, 10);
          }
        }
      },
      didDrawCell: (() => {
        const rowProgress = new Map<number, number>();
        return (data: any) => {
          if (data.section === 'body' && data.column.index === 0) {
            const html = coDescriptionRowIndices.get(data.row.index);
            if (html) {
              const startLine = rowProgress.get(data.row.index) || 0;
              const padTop = 2;
              const padBottom = 2;
              pdf.setFillColor(255, 255, 255);
              pdf.rect(data.cell.x, data.cell.y, descriptionWidth + 8, data.cell.height, 'F');
              const maxH = data.cell.height - padTop - padBottom;
              const result = drawRichText(pdf, html, data.cell.x + 4, data.cell.y + padTop, descriptionWidth, false, maxH, startLine);
              rowProgress.set(data.row.index, result.nextLine);
            }
          }
        };
      })()
    });
    
    yPos = (pdf as any).lastAutoTable.finalY;
    
    // Change Orders Subtotal
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text('Change Orders Total:', pageWidth - margin - 60, yPos + 4);
    pdf.text(`$${invoiceCOTotal.toFixed(2)}`, pageWidth - margin, yPos + 4, { align: 'right' });
    yPos += 12;
    
    if (discountCents > 0 && pdfDiscounts.length > 0) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      pdf.setTextColor(0, 128, 0);
      for (const dd of pdfDiscounts) {
        if (!dd.value) continue;
        const ddLabel = dd.label || 'Discount';
        const ddDisplay = dd.type === 'percentage' ? `${ddLabel} (${dd.value}%)` : ddLabel;
        const ddAmt = dd.type === 'percentage'
          ? Math.round((effectiveTotal + discountCents - coAdjust - acceptedOptTotal) * (Math.min(dd.value, 100) / 100))
          : Math.round(dd.value * 100);
        pdf.text(`${ddDisplay}:`, pageWidth - margin - 60, yPos);
        pdf.text(`-$${(ddAmt / 100).toFixed(2)}`, pageWidth - margin, yPos, { align: 'right' });
        yPos += 6;
      }
      pdf.setTextColor(0, 0, 0);
    }
    // Grand Total
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.text('Grand Total:', pageWidth - margin - 60, yPos);
    pdf.text(`$${(effectiveTotal / 100).toFixed(2)}`, pageWidth - margin, yPos, { align: 'right' });
    yPos += 8;
  } else if (signedChangeOrders.length > 0) {
    // Show original total
    pdf.text('Original Total:', pageWidth - margin - 60, yPos);
    pdf.text(`$${originalTotal.toFixed(2)}`, pageWidth - margin, yPos, { align: 'right' });
    yPos += 12;

    // Change orders on separate pages - each change order starts on a fresh page
    for (const co of signedChangeOrders) {
      // Always start change order on a new page
      pdf.addPage();
      yPos = margin;

      // Change order header
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(14);
      pdf.text(`Change Order: ${co.title}`, margin, yPos);
      
      // Change order number and date on the right
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      const coNumber = `#${(co.documentNumber || co.id).toString().padStart(6, '0')}`;
      pdf.text(coNumber, pageWidth - margin, yPos, { align: 'right' });
      yPos += 6;
      
      if (co.signedAt) {
        const signedDate = co.signedAt instanceof Date ? co.signedAt : new Date(co.signedAt);
        pdf.text(`Accepted: ${signedDate.toLocaleDateString()}`, pageWidth - margin, yPos, { align: 'right' });
      }
      yPos += 10;

      // Change order line items + production rate blocks
      // Walk content in saved itemOrder sequence so mixed COs preserve the
      // contractor-arranged order. Uses the shared buildOrderedEntries helper
      // (typed generically over the local LineItem shape) so the PDF and the
      // React renderer (ChangeOrderContentRenderer) stay in sync.
      const orderedEntries = buildOrderedEntries<LineItem, ProductionRateBlock>({
        items: co.content.items,
        productionRateBlocks: co.content.productionRateBlocks,
        itemOrder: co.content.itemOrder,
      });
      const hasAnyItems = orderedEntries.some((e) => e.type === 'item');
      if (co.content && orderedEntries.length > 0) {
        const descColX = margin;
        const qtyColX = pageWidth - margin - 60;
        const priceColX = pageWidth - margin - 35;
        const totalColX = pageWidth - margin;

        // Header row only when there's at least one line item to label
        if (hasAnyItems) {
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(8);
          pdf.setTextColor(100, 100, 100);

          pdf.text('Description', descColX, yPos);
          pdf.text('Qty', qtyColX, yPos, { align: 'center' });
          pdf.text('Price', priceColX, yPos, { align: 'center' });
          pdf.text('Total', totalColX, yPos, { align: 'right' });
          yPos += 3;

          pdf.setDrawColor(200, 200, 200);
          pdf.line(margin, yPos, pageWidth - margin, yPos);
          yPos += 4;

          pdf.setTextColor(0, 0, 0);
        }

        // Single ordered pass — items and blocks interleaved per itemOrder
        for (const entry of orderedEntries) {
          if (entry.type === 'item') {
            const item: LineItem = entry.item;

            // Page break check
            if (yPos > pageHeight - 40) {
              pdf.addPage();
              yPos = margin;
            }

            // Item name
            if (item.name) {
              pdf.setFont('helvetica', 'bold');
              pdf.setFontSize(9);
              pdf.setTextColor(50, 50, 50);
              pdf.text(item.name, margin, yPos);
              yPos += 4;
            }

            // Item description with rich text
            if (item.description) {
              const descWidth = pageWidth - margin - 75;
              const { heightUsed: descHeight } = drawRichText(pdf, item.description, margin, yPos, descWidth, true);

              pdf.setFont('helvetica', 'normal');
              pdf.setFontSize(8);
              pdf.text(item.quantity.toString(), qtyColX, yPos, { align: 'center' });
              pdf.text(`$${(item.unitPrice / 100).toFixed(2)}`, priceColX, yPos, { align: 'center' });
              pdf.setFont('helvetica', 'bold');
              pdf.text(`$${(item.total / 100).toFixed(2)}`, totalColX, yPos, { align: 'right' });

              yPos += descHeight + 4;
            } else {
              pdf.setFont('helvetica', 'normal');
              pdf.setFontSize(8);
              pdf.text(item.quantity.toString(), qtyColX, yPos, { align: 'center' });
              pdf.text(`$${(item.unitPrice / 100).toFixed(2)}`, priceColX, yPos, { align: 'center' });
              pdf.setFont('helvetica', 'bold');
              pdf.text(`$${(item.total / 100).toFixed(2)}`, totalColX, yPos, { align: 'right' });
              yPos += 6;
            }

            pdf.setDrawColor(230, 230, 230);
            pdf.line(margin, yPos, pageWidth - margin, yPos);
            yPos += 4;
          } else {
            // Production Rate Block (Room Builder content)
            const block: ProductionRateBlock = entry.block;

            if (yPos > pageHeight - 50) {
              pdf.addPage();
              yPos = margin;
            }

            // Block heading
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(9);
            pdf.setTextColor(50, 50, 50);
            pdf.text(block.name || 'Production Rate Estimate', margin, yPos);
            yPos += 5;

            // CO content is a frozen snapshot of what the customer signed.
            // Apply the same visibility filters the customer portal applies
            // (contractor-hidden areas + fully-excluded surfaces) so the
            // customer-facing PDF doesn't leak hidden content.
            const coExcludedSurfaces = (co.content.excludedSurfaces ?? []) as string[];
            const coContractorHiddenAreas = (co.content.contractorHiddenAreas ?? []) as string[];
            const coAcceptedOptionalAreas = ((co.content as any).acceptedOptionalAreas ?? []) as string[];

            // Per-block "Area Square Footage" summary (mirrors main proposal PDF).
            const coShowSqft = !!block.roomBuilderData?.displayToggles?.showProjectTotalSqft;
            if (coShowSqft) {
              const coBlockSqft = calcBlockSqftSummary(block as any, {
                isCustomerView: true,
                excludedSurfaces: coExcludedSurfaces,
                contractorHiddenAreas: coContractorHiddenAreas,
                acceptedOptionalAreas: coAcceptedOptionalAreas,
              });
              if (coBlockSqft.includedSqft > 0 || coBlockSqft.optionalSqft > 0) {
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(7.5);
                pdf.setTextColor(80, 80, 85);
                pdf.text('Area Square Footage:', margin, yPos);
                const coLblW = pdf.getTextWidth('Area Square Footage:');
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(8);
                pdf.setTextColor(30, 30, 35);
                const coValStr = ` ${formatSqft(coBlockSqft.includedSqft)}`;
                pdf.text(coValStr, margin + coLblW, yPos);
                if (coBlockSqft.optionalSqft > 0) {
                  const coValW = pdf.getTextWidth(coValStr);
                  pdf.setFont('helvetica', 'italic');
                  pdf.setFontSize(7);
                  pdf.setTextColor(120, 120, 125);
                  pdf.text(`  +${formatSqft(coBlockSqft.optionalSqft)} if add-ons accepted`, margin + coLblW + coValW, yPos);
                }
                pdf.setTextColor(0, 0, 0);
                yPos += 4;
              }
            }

            const allAreas: AreaCalcResult[] = block.roomBuilderData?.areaResults ?? [];
            const visibleAreas = allAreas.filter((area) => {
              const roomId = (area as any).roomId as string | undefined;
              if (!roomId) return true;
              if (coContractorHiddenAreas.includes(`${block.id}:area:${roomId}`)) {
                return false;
              }
              const surfaces = area.surfaces ?? [];
              if (surfaces.length === 0) return true;
              const allSurfacesExcluded = surfaces.every((s: any) =>
                coExcludedSurfaces.includes(`${block.id}:${roomId}:${s.key || s.type}`),
              );
              const isOpt = (area as any).isOptional;
              return isOpt || !allSurfacesExcluded;
            });
            if (visibleAreas.length === 0) {
              // Fallback: just show the block grand total
              pdf.setFont('helvetica', 'normal');
              pdf.setFontSize(8);
              pdf.setTextColor(100, 100, 100);
              pdf.text('Estimate total', margin + 4, yPos);
              // grandTotal/totalPrice from Room Builder are stored as dollars
              // (not cents) — match the rest of pdfGenerator.ts which converts
              // *to* cents via `Math.round(... * 100)`.
              const blockTotal = block.roomBuilderData?.grandTotal ?? 0;
              pdf.setFont('helvetica', 'bold');
              pdf.setTextColor(0, 0, 0);
              pdf.text(`$${blockTotal.toFixed(2)}`, totalColX, yPos, { align: 'right' });
              yPos += 5;
            } else {
              for (const area of visibleAreas) {
                if (yPos > pageHeight - 30) {
                  pdf.addPage();
                  yPos = margin;
                }

                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(8);
                pdf.setTextColor(60, 60, 60);
                const roomLabel = area.roomName || 'Room';
                const sizeBits: string[] = [];
                if (area.length && area.width) {
                  sizeBits.push(`${area.length}' x ${area.width}'`);
                }
                if (area.ceilingHeight) {
                  sizeBits.push(`${area.ceilingHeight}' ceil`);
                }
                if (coShowSqft) {
                  const coRoom = (block.roomBuilderData?.rooms || []).find((r: any) => r.id === (area as any).roomId);
                  const coAreaSqft = getAreaSqft(area as any, (coRoom as any)?.sectionType);
                  if (coAreaSqft > 0) sizeBits.push(formatSqft(coAreaSqft));
                }
                const optionalTag = area.isOptional ? ' (Optional)' : '';
                const leftLabel = sizeBits.length > 0
                  ? `  ${roomLabel} — ${sizeBits.join(', ')}${optionalTag}`
                  : `  ${roomLabel}${optionalTag}`;

                pdf.text(leftLabel, margin, yPos);

                pdf.setFont('helvetica', 'bold');
                pdf.setTextColor(0, 0, 0);
                // area.totalPrice from Room Builder is in dollars (not cents).
                const areaTotal = area.totalPrice || 0;
                pdf.text(`$${areaTotal.toFixed(2)}`, totalColX, yPos, { align: 'right' });
                yPos += 4;

                // Compact surface lines
                const surfaces: SurfaceCalcResult[] = area.surfaces ?? [];
                if (surfaces.length > 0) {
                  pdf.setFont('helvetica', 'normal');
                  pdf.setFontSize(7);
                  pdf.setTextColor(120, 120, 120);
                  for (const s of surfaces) {
                    if (yPos > pageHeight - 25) {
                      pdf.addPage();
                      yPos = margin;
                    }
                    const sName = s.surfaceName || 'Surface';
                    const sQty = s.quantity != null && s.unit
                      ? ` (${s.quantity} ${s.unit})`
                      : '';
                    const coatsLabel = s.coatsLabel || 'coat';
                    const sCoats = s.coats > 0
                      ? ` · ${s.coats} ${s.coats === 1 ? coatsLabel : `${coatsLabel}s`}`
                      : '';
                    pdf.text(`     • ${sName}${sQty}${sCoats}`, margin, yPos);
                    yPos += 3.5;
                  }
                  pdf.setTextColor(0, 0, 0);
                }

                yPos += 1.5;
              }
            }

            // Block separator
            pdf.setDrawColor(230, 230, 230);
            pdf.line(margin, yPos, pageWidth - margin, yPos);
            yPos += 4;
          }
        }

        // Change order subtotal
        if (yPos > pageHeight - 25) {
          pdf.addPage();
          yPos = margin;
        }
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9);
        pdf.text('Change Order Total:', pageWidth - margin - 60, yPos);
        pdf.text(`$${(co.totalAmount / 100).toFixed(2)}`, pageWidth - margin, yPos, { align: 'right' });
        yPos += 8;

        // Change order signature (smaller than main signature)
        if (co.signature) {
          // Check if we need a new page for signature
          if (yPos > pageHeight - 35) {
            pdf.addPage();
            yPos = margin;
          }
          
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(7);
          pdf.setTextColor(100, 100, 100);
          pdf.text('Accepted by:', margin, yPos);
          yPos += 3;
          
          try {
            // Add signature image at smaller size (height 12mm instead of 20mm for main)
            pdf.addImage(co.signature, 'PNG', margin, yPos, 35, 12);
            yPos += 14;
          } catch (e) {
            console.error('Failed to add change order signature to PDF:', e);
          }
          
          if (co.signedAt) {
            const signedDate = co.signedAt instanceof Date ? co.signedAt : new Date(co.signedAt);
            pdf.setFontSize(6);
            pdf.text(`Signed: ${signedDate.toLocaleDateString()}`, margin, yPos);
            yPos += 4;
          }
          
          pdf.setTextColor(0, 0, 0);
        }
        yPos += 4;
      }
    }

    // Grand total after all change orders
    if (yPos > pageHeight - 20) {
      pdf.addPage();
      yPos = margin;
    }
    
    pdf.setDrawColor(0, 0, 0);
    pdf.setLineWidth(0.5);
    pdf.line(pageWidth - margin - 70, yPos, pageWidth - margin, yPos);
    yPos += 5;
    
    const totalsLabelX = pageWidth - margin - 95;
    const totalsAmountRight = pageWidth - margin;
    const totalsLabelMaxWidth = 70;
    const fitTotalsLabel = (label: string): string => {
      let s = label;
      while (s.length > 4 && pdf.getTextWidth(s) > totalsLabelMaxWidth) {
        s = s.slice(0, -2);
      }
      return s === label ? s : s.replace(/[\s:]+$/, '') + '…:';
    };
    if (pdfTaxAmount > 0) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      pdf.text('Subtotal:', totalsLabelX, yPos);
      pdf.text(`$${((effectiveTotal - pdfTaxAmount) / 100).toFixed(2)}`, totalsAmountRight, yPos, { align: 'right' });
      yPos += 5;
      const pdfTaxLabel = pdfTaxProfileName ? `${pdfTaxProfileName} (${pdfTaxRate}%):` : `Sales tax (${pdfTaxRate}%):`;
      pdf.text(fitTotalsLabel(pdfTaxLabel), totalsLabelX, yPos);
      pdf.text(`$${(pdfTaxAmount / 100).toFixed(2)}`, totalsAmountRight, yPos, { align: 'right' });
      yPos += 4;
      pdf.setFontSize(8);
      pdf.setTextColor(110, 110, 110);
      pdf.text(`on $${(pdfTaxableTotal / 100).toFixed(2)} taxable`, totalsAmountRight, yPos, { align: 'right' });
      pdf.setTextColor(0, 0, 0);
      pdf.setFontSize(10);
      yPos += 5;
    }
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.text('Grand Total:', totalsLabelX, yPos);
    pdf.text(`$${(effectiveTotal / 100).toFixed(2)}`, totalsAmountRight, yPos, { align: 'right' });
  } else {
    const totalsLabelX = pageWidth - margin - 95;
    const totalsAmountRight = pageWidth - margin;
    const totalsLabelMaxWidth = 70;
    const fitTotalsLabel = (label: string): string => {
      let s = label;
      while (s.length > 4 && pdf.getTextWidth(s) > totalsLabelMaxWidth) {
        s = s.slice(0, -2);
      }
      return s === label ? s : s.replace(/[\s:]+$/, '') + '…:';
    };
    const hasBreakdown = (discountCents > 0 && pdfDiscounts.length > 0) || pdfTaxAmount > 0;
    if (hasBreakdown) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      const subtotalBeforeTax = effectiveTotal - pdfTaxAmount;
      pdf.text('Subtotal:', totalsLabelX, yPos);
      pdf.text(`$${((subtotalBeforeTax + discountCents) / 100).toFixed(2)}`, totalsAmountRight, yPos, { align: 'right' });
      yPos += 5;
      if (discountCents > 0 && pdfDiscounts.length > 0) {
        pdf.setTextColor(0, 128, 0);
        const subtotalForPdfDisc = subtotalBeforeTax + discountCents;
        const baseForPdfDisc = subtotalForPdfDisc - acceptedOptTotal;
        for (const dd of pdfDiscounts) {
          if (!dd.value) continue;
          const ddLabel2 = dd.label || 'Discount';
          const ddDisplay2 = dd.type === 'percentage' ? `${ddLabel2} (${dd.value}%)` : ddLabel2;
          const ddAmt2 = dd.type === 'percentage'
            ? Math.round(baseForPdfDisc * (Math.min(dd.value, 100) / 100))
            : Math.round(dd.value * 100);
          pdf.text(fitTotalsLabel(`${ddDisplay2}:`), totalsLabelX, yPos);
          pdf.text(`-$${(ddAmt2 / 100).toFixed(2)}`, totalsAmountRight, yPos, { align: 'right' });
          yPos += 5;
        }
        pdf.setTextColor(0, 0, 0);
      }
      if (pdfTaxAmount > 0) {
        const pdfTaxLabel = pdfTaxProfileName ? `${pdfTaxProfileName} (${pdfTaxRate}%):` : `Sales tax (${pdfTaxRate}%):`;
        pdf.text(fitTotalsLabel(pdfTaxLabel), totalsLabelX, yPos);
        pdf.text(`$${(pdfTaxAmount / 100).toFixed(2)}`, totalsAmountRight, yPos, { align: 'right' });
        yPos += 4;
        pdf.setFontSize(8);
        pdf.setTextColor(110, 110, 110);
        pdf.text(`on $${(pdfTaxableTotal / 100).toFixed(2)} taxable`, totalsAmountRight, yPos, { align: 'right' });
        pdf.setTextColor(0, 0, 0);
        pdf.setFontSize(10);
        yPos += 5;
      }
      yPos += 1;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
    }
    pdf.text('Total:', totalsLabelX, yPos);
    pdf.text(`$${(effectiveTotal / 100).toFixed(2)}`, totalsAmountRight, yPos, { align: 'right' });
  }

  yPos += (doc.type === 'invoice') ? 3 : 6;

  // Payment Schedule section
  const ps = doc.content.paymentSettings;
  if (ps?.showPaymentSchedule && ps.depositRequired && ps.schedule && ps.schedule.length > 0) {
    if (yPos > pageHeight - 60) {
      pdf.addPage();
      yPos = margin;
    }

    const scheduleWidth = 100;
    const scheduleStartX = pageWidth - margin - scheduleWidth;

    pdf.setDrawColor(200);
    pdf.line(scheduleStartX, yPos, pageWidth - margin, yPos);
    yPos += 4;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(0);
    pdf.text('Payment Schedule', scheduleStartX, yPos);
    yPos += 5;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);

    const depositCents = ps.depositType === 'percentage'
      ? Math.round(effectiveTotal * ((ps.depositAmount || 0) / 100))
      : Math.round((ps.depositAmount || 0) * 100);
    const depositLabel = ps.depositType === 'percentage'
      ? `Deposit (${ps.depositAmount}%)`
      : 'Deposit (Fixed)';
    
    pdf.text(depositLabel, scheduleStartX, yPos);
    pdf.text(`$${(depositCents / 100).toFixed(2)}`, pageWidth - margin, yPos, { align: 'right' });
    yPos += 5;
    pdf.setDrawColor(230);
    pdf.line(scheduleStartX, yPos, pageWidth - margin, yPos);
    yPos += 4;

    const originalScheduleTotal = ps.schedule.reduce((sum: number, item: any) => sum + (item.amount || 0), 0);
    const remainingAfterDeposit = Math.max(0, effectiveTotal - depositCents);

    let distributed = 0;
    for (let si = 0; si < ps.schedule.length; si++) {
      const item = ps.schedule[si];
      if (yPos > pageHeight - 30) {
        pdf.addPage();
        yPos = margin;
      }
      const label = item.label || 'Payment';
      let adjustedAmount = item.amount || 0;
      if (originalScheduleTotal > 0) {
        if (si === ps.schedule.length - 1) {
          adjustedAmount = Math.max(0, remainingAfterDeposit - distributed);
        } else {
          adjustedAmount = Math.round(remainingAfterDeposit * ((item.amount || 0) / originalScheduleTotal));
          distributed += adjustedAmount;
        }
      }
      pdf.text(label, scheduleStartX, yPos);
      pdf.text(`$${(adjustedAmount / 100).toFixed(2)}`, pageWidth - margin, yPos, { align: 'right' });
      yPos += 5;
      pdf.setDrawColor(230);
      pdf.line(scheduleStartX, yPos, pageWidth - margin, yPos);
      yPos += 4;
    }

    yPos += 4;
  }

  if (doc.content.notes) {
    // Check if we need a new page for notes
    if (yPos > pageHeight - 40) {
      pdf.addPage();
      yPos = margin;
    }
    
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text('Notes:', margin, yPos);
    yPos += 5;
    
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    const noteLines = pdf.splitTextToSize(doc.content.notes, pageWidth - (margin * 2));
    noteLines.forEach((line: string) => {
      // Check for page break while drawing notes
      if (yPos > pageHeight - 40) {
        pdf.addPage();
        yPos = margin;
      }
      pdf.text(line, margin, yPos);
      yPos += 4;
    });
    yPos += 5;
  }

  if (photos && photos.length > 0) {
    const contentWidth = pageWidth - (margin * 2);
    const cols = 4;
    const gap = 3;
    const imgW = (contentWidth - gap * (cols - 1)) / cols;
    const imgH = imgW * 0.75;
    const captionH = 4;
    const cellH = imgH + captionH + gap;

    if (yPos + 10 > pageHeight - 40) {
      pdf.addPage();
      yPos = margin;
    }

    if (brandRgb) {
      pdf.setDrawColor(brandRgb[0], brandRgb[1], brandRgb[2]);
      pdf.setLineWidth(0.4);
    } else {
      pdf.setDrawColor(180, 150, 80);
      pdf.setLineWidth(0.5);
    }
    pdf.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 4;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(60, 60, 60);
    pdf.text('Project Photos', margin, yPos);
    yPos += 6;

    const photoDataUrls: (string | null)[] = await Promise.all(
      photos.map((p) => {
        const key = p.annotatedStorageKey || p.storageKey;
        const url = key.startsWith('/objects/') ? key : `/objects/${key}`;
        return loadImageAsDataUrl(url);
      })
    );

    let col = 0;
    for (let i = 0; i < photos.length; i++) {
      const dataUrl = photoDataUrls[i];
      if (!dataUrl) continue;

      if (col === 0 && yPos + cellH > pageHeight - 20) {
        pdf.addPage();
        yPos = margin;
      }

      const x = margin + col * (imgW + gap);
      try {
        const fmt = dataUrl.includes('image/png') ? 'PNG' : 'JPEG';
        pdf.addImage(dataUrl, fmt, x, yPos, imgW, imgH);
      } catch {
        pdf.setDrawColor(200);
        pdf.setFillColor(245, 245, 245);
        pdf.roundedRect(x, yPos, imgW, imgH, 1, 1, 'FD');
      }

      if (photos[i].caption) {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(6);
        pdf.setTextColor(100, 100, 100);
        const capLines = pdf.splitTextToSize(photos[i].caption!, imgW);
        pdf.text(capLines[0] || '', x, yPos + imgH + 3);
      }

      col++;
      if (col >= cols) {
        col = 0;
        yPos += cellH;
      }
    }

    if (col > 0) {
      yPos += cellH;
    }
    yPos += 4;
  }

  if (sourcePhotoUrls && sourcePhotoUrls.length > 0) {
    const contentWidth = pageWidth - (margin * 2);
    const cols = 4;
    const gap = 3;
    const imgW = (contentWidth - gap * (cols - 1)) / cols;
    const imgH = imgW * 0.75;
    const cellH = imgH + gap;

    if (yPos + 10 > pageHeight - 40) {
      pdf.addPage();
      yPos = margin;
    }

    if (brandRgb) {
      pdf.setDrawColor(brandRgb[0], brandRgb[1], brandRgb[2]);
      pdf.setLineWidth(0.4);
    } else {
      pdf.setDrawColor(180, 150, 80);
      pdf.setLineWidth(0.5);
    }
    pdf.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 4;

    const srcHeading = (photos && photos.length > 0) ? 'Additional Photos' : 'Project Photos';
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(60, 60, 60);
    pdf.text(srcHeading, margin, yPos);
    yPos += 6;

    const srcDataUrls: (string | null)[] = await Promise.all(
      sourcePhotoUrls.map((url) => loadImageAsDataUrl(url))
    );

    let srcCol = 0;
    for (let i = 0; i < sourcePhotoUrls.length; i++) {
      const dataUrl = srcDataUrls[i];
      if (!dataUrl) continue;

      if (srcCol === 0 && yPos + cellH > pageHeight - 20) {
        pdf.addPage();
        yPos = margin;
      }

      const x = margin + srcCol * (imgW + gap);
      try {
        const fmt = dataUrl.includes('image/png') ? 'PNG' : 'JPEG';
        pdf.addImage(dataUrl, fmt, x, yPos, imgW, imgH);
      } catch {
        pdf.setDrawColor(200);
        pdf.setFillColor(245, 245, 245);
        pdf.roundedRect(x, yPos, imgW, imgH, 1, 1, 'FD');
      }

      srcCol++;
      if (srcCol >= cols) {
        srcCol = 0;
        yPos += cellH;
      }
    }

    if (srcCol > 0) {
      yPos += cellH;
    }
    yPos += 4;
  }

  // Terms and Conditions section
  if (termsConditions && termsConditions.trim()) {
    const contentWidth = pageWidth - (margin * 2);
    
    // Check if we need a new page for terms
    const termsHeight = estimateRichTextHeight(pdf, termsConditions, contentWidth);
    if (yPos + termsHeight + 20 > pdf.internal.pageSize.getHeight() - 40) {
      pdf.addPage();
      yPos = margin;
    }
    
    // Draw section header
    if (brandRgb) {
      pdf.setDrawColor(brandRgb[0], brandRgb[1], brandRgb[2]);
      pdf.setLineWidth(0.4);
    } else {
      pdf.setDrawColor(180, 150, 80);
      pdf.setLineWidth(0.5);
    }
    pdf.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 4;
    
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(60, 60, 60);
    pdf.text('Terms and Conditions', margin, yPos);
    yPos += 4;
    
    const { heightUsed: contentHeight2 } = drawRichText(pdf, termsConditions, margin, yPos, contentWidth, true);
    yPos += contentHeight2 + 3;
    
    // Bottom border
    if (brandRgb) {
      pdf.setDrawColor(brandRgb[0], brandRgb[1], brandRgb[2]);
      pdf.setLineWidth(0.4);
    } else {
      pdf.setDrawColor(180, 150, 80);
      pdf.setLineWidth(0.5);
    }
    pdf.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 6;
  }

  // Signature section - Skip for invoices
  if (doc.signature && doc.signedAt && doc.type !== 'invoice') {
    const showContractorSig = settings.useContractorSignature && settings.contractorSignature;
    const sigBlockH = 55;
    if (yPos + sigBlockH > pageHeight - 20) { pdf.addPage(); yPos = margin; }

    yPos += 5;
    pdf.setDrawColor(200);
    pdf.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 8;

    const contentWidth = pageWidth - margin * 2;

    if (showContractorSig) {
      const colWidth = (contentWidth - 10) / 2;
      const leftX = margin;
      const rightX = margin + colWidth + 10;

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.setTextColor(30, 30, 35);
      pdf.text('Contractor Signature:', leftX, yPos);
      pdf.text('Customer Signature:', rightX, yPos);
      const labelY = yPos;
      yPos += 5;

      try {
        pdf.addImage(settings.contractorSignature!, 'PNG', leftX, yPos, 55, 22);
      } catch (e) {
        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(9);
        pdf.setTextColor(120, 120, 120);
        pdf.text('[Signature on file]', leftX, yPos + 10);
      }

      try {
        pdf.addImage(doc.signature, 'PNG', rightX, yPos, 55, 22);
      } catch (e) {
        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(9);
        pdf.setTextColor(120, 120, 120);
        pdf.text('[Signature on file]', rightX, yPos + 10);
      }
      yPos += 26;

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(60, 60, 60);
      pdf.text(settings.companyName, leftX, yPos);
      pdf.text(`Signed by: ${doc.contact.name}`, rightX, yPos);
      yPos += 4;
      pdf.text(`Date: ${format(new Date(doc.signedAt), 'MMM d, yyyy h:mm a')}`, leftX, yPos);
      pdf.text(`Date: ${format(new Date(doc.signedAt), 'MMM d, yyyy h:mm a')}`, rightX, yPos);
    } else {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.setTextColor(30, 30, 35);
      pdf.text('Customer Signature:', margin, yPos);
      yPos += 5;

      try {
        pdf.addImage(doc.signature, 'PNG', margin, yPos, 60, 25);
        yPos += 30;
      } catch (e) {
        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(9);
        pdf.text('[Signature on file]', margin, yPos);
        yPos += 8;
      }

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(60, 60, 60);
      pdf.text(`Signed by: ${doc.contact.name}`, margin, yPos);
      yPos += 4;
      pdf.text(`Date: ${format(new Date(doc.signedAt), 'MMM d, yyyy h:mm a')}`, margin, yPos);
    }
  }

  // Payment History section - Only for invoices
  if (doc.type === 'invoice' && payments && payments.length > 0) {
    // Add payment history directly after totals
    pdf.setDrawColor(200);
    pdf.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 6;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.text('Payment History', margin, yPos);
    yPos += 8;

    // Calculate totals
    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    const invoiceTotal = effectiveTotal;
    const balance = invoiceTotal - totalPaid;

    // Payment table header
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(100);
    pdf.text('Date', margin, yPos);
    pdf.text('Type', margin + 35, yPos);
    pdf.text('Amount', pageWidth - margin - 25, yPos);
    yPos += 5;
    
    pdf.setDrawColor(220);
    pdf.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 5;

    // Payment rows
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(0);
    for (const payment of payments) {
      const paymentDate = payment.paymentDate instanceof Date 
        ? payment.paymentDate 
        : new Date(payment.paymentDate);
      
      pdf.text(format(paymentDate, 'MMM d, yyyy'), margin, yPos);
      
      const paymentTypeLabels: Record<string, string> = { cash: 'Cash', check: 'Check', zelle: 'Zelle', venmo: 'Venmo', paypal: 'PayPal', credit_card: 'Credit Card' };
      const typeLabel = paymentTypeLabels[payment.paymentType] ?? (payment.paymentType.charAt(0).toUpperCase() + payment.paymentType.slice(1).replace('_', ' '));
      pdf.text(typeLabel, margin + 35, yPos);
      
      const amountText = `$${(payment.amount / 100).toFixed(2)}`;
      const amountWidth = pdf.getTextWidth(amountText);
      pdf.text(amountText, pageWidth - margin - amountWidth, yPos);
      
      yPos += 5;
    }

    // Only add page break if there's no room for summary section (about 25mm needed)
    const pageHeight = pdf.internal.pageSize.getHeight();
    if (yPos > pageHeight - 30) {
      pdf.addPage();
      yPos = margin;
    }

    yPos += 3;
    pdf.setDrawColor(200);
    pdf.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 6;

    // Summary section
    const summaryX = pageWidth - margin - 60;
    
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.text('Invoice Total:', summaryX, yPos);
    const totalText = `$${(invoiceTotal / 100).toFixed(2)}`;
    pdf.text(totalText, pageWidth - margin - pdf.getTextWidth(totalText), yPos);
    yPos += 5;

    pdf.text('Total Paid:', summaryX, yPos);
    const paidText = `$${(totalPaid / 100).toFixed(2)}`;
    pdf.text(paidText, pageWidth - margin - pdf.getTextWidth(paidText), yPos);
    yPos += 5;

    pdf.setDrawColor(200);
    pdf.line(summaryX, yPos, pageWidth - margin, yPos);
    yPos += 5;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    if (balance <= 0) {
      pdf.setTextColor(34, 139, 34); // Green for paid
      pdf.text('PAID IN FULL', summaryX, yPos);
    } else {
      pdf.text('Balance Due:', summaryX, yPos);
      const balanceText = `$${(balance / 100).toFixed(2)}`;
      pdf.text(balanceText, pageWidth - margin - pdf.getTextWidth(balanceText), yPos);
    }
    pdf.setTextColor(0); // Reset to black
  }

  // Add page numbers to all pages (at bottom)
  const totalPages = pdf.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    const pgH = pdf.internal.pageSize.getHeight();

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(120, 120, 120);
    const pageText = `Page ${i} of ${totalPages}`;
    const ptw = pdf.getTextWidth(pageText);
    pdf.text(pageText, (pageWidth - ptw) / 2, pgH - 8);

  }

  return pdf.output('blob');
}

export function downloadPDF(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function viewPDF(blob: Blob) {
  const Cap = (window as any).Capacitor;
  const isNative = !!(Cap?.isNativePlatform?.() || Cap?.isNative);

  const fallbackDownload = () => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'document.pdf';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (isNative) {
    try {
      const { Browser } = await import('@capacitor/browser');
      const reader = new FileReader();
      reader.onerror = () => fallbackDownload();
      reader.onloadend = () => {
        try {
          const dataUrl = reader.result as string;
          Browser.open({ url: dataUrl });
        } catch {
          fallbackDownload();
        }
      };
      reader.readAsDataURL(blob);
    } catch {
      fallbackDownload();
    }
  } else {
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  }
}
