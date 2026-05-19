import { PDFDocument, rgb, degrees, StandardFonts } from 'pdf-lib';
import sharp from 'sharp';

const WATERMARK_LINES = [
  'PREVIEW ONLY',
  'Proposal Not Accepted',
];

const LEGAL_LINE = 'Unauthorized use of this document is prohibited. This document is attached to a proposal that has not been signed or accepted.';

export async function watermarkPdf(pdfBytes: Buffer, companyName?: string): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const pages = pdfDoc.getPages();
  for (const page of pages) {
    const { width, height } = page.getSize();
    const centerX = width / 2;

    const bandYs = [height * 0.87, height * 0.62, height * 0.37, height * 0.12];
    const mainSize = 36;
    const subSize = 22;
    const spacing = mainSize * 12;

    for (const bandY of bandYs) {
      for (let i = -3; i <= 3; i++) {
        const xOff = centerX + i * spacing;

        page.drawText('PREVIEW ONLY', {
          x: xOff - 120,
          y: bandY + 20,
          size: mainSize,
          font: helveticaBold,
          color: rgb(0.7, 0.1, 0.1),
          opacity: 0.30,
          rotate: degrees(-35),
        });

        page.drawText('Proposal Not Accepted', {
          x: xOff - 100,
          y: bandY - 20,
          size: subSize,
          font: helveticaBold,
          color: rgb(0.7, 0.1, 0.1),
          opacity: 0.25,
          rotate: degrees(-35),
        });
      }
    }

    const legalFontSize = 7;
    const legalText = LEGAL_LINE;
    const legalWidth = helvetica.widthOfTextAtSize(legalText, legalFontSize);
    page.drawRectangle({
      x: 0,
      y: 0,
      width: width,
      height: 22,
      color: rgb(0.95, 0.95, 0.95),
      opacity: 0.9,
    });
    page.drawText(legalText, {
      x: Math.max(10, (width - legalWidth) / 2),
      y: 8,
      size: legalFontSize,
      font: helvetica,
      color: rgb(0.4, 0.4, 0.4),
      opacity: 0.8,
    });

    if (companyName) {
      const companyFontSize = 8;
      const companyText = `Document property of ${companyName}`;
      const companyWidth = helvetica.widthOfTextAtSize(companyText, companyFontSize);
      page.drawText(companyText, {
        x: (width - companyWidth) / 2,
        y: height - 15,
        size: companyFontSize,
        font: helvetica,
        color: rgb(0.5, 0.5, 0.5),
        opacity: 0.6,
      });
    }
  }

  const modifiedPdfBytes = await pdfDoc.save();
  return Buffer.from(modifiedPdfBytes);
}

export async function watermarkImage(imageBuffer: Buffer, companyName?: string): Promise<Buffer> {
  const metadata = await sharp(imageBuffer).metadata();
  const w = metadata.width || 800;
  const h = metadata.height || 1000;

  const escapedCompany = (companyName || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const legalEscaped = LEGAL_LINE.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const shortSide = Math.min(w, h);
  const mainFontSize = Math.max(32, shortSide * 0.055);
  const subFontSize = Math.max(20, shortSide * 0.035);
  const legalFontSize = Math.max(8, Math.min(shortSide * 0.012, 14));
  const strokeW = Math.max(2, mainFontSize * 0.08);
  const strokeWSub = Math.max(2, subFontSize * 0.08);

  const bandSpacing = mainFontSize * 1.8;
  const bandYPositions = [h * 0.12, h * 0.37, h * 0.62, h * 0.87];

  const diag = Math.sqrt(w * w + h * h);
  const repeatWidth = mainFontSize * 12;
  const repeatCount = Math.ceil(diag / repeatWidth) + 2;

  const bands = bandYPositions.map((bandY, bandIdx) => {
    const stamps: string[] = [];
    for (let i = -repeatCount; i <= repeatCount; i++) {
      const xOff = i * repeatWidth;
      if (bandIdx === 1 || bandIdx === 2) {
        stamps.push(`
          <text class="shadow" x="${xOff}" y="-${bandSpacing * 0.5}">PREVIEW ONLY</text>
          <text class="main" x="${xOff}" y="-${bandSpacing * 0.5}">PREVIEW ONLY</text>
          <text class="shadow-sub" x="${xOff}" y="${bandSpacing * 0.3}">Proposal Not Accepted</text>
          <text class="sub" x="${xOff}" y="${bandSpacing * 0.3}">Proposal Not Accepted</text>
          <text class="shadow" x="${xOff}" y="${bandSpacing * 1.1}">PREVIEW ONLY</text>
          <text class="main" x="${xOff}" y="${bandSpacing * 1.1}">PREVIEW ONLY</text>
        `);
      } else {
        stamps.push(`
          <text class="shadow" x="${xOff}" y="0">PREVIEW ONLY</text>
          <text class="main" x="${xOff}" y="0">PREVIEW ONLY</text>
          <text class="shadow-sub" x="${xOff}" y="${bandSpacing * 0.8}">Proposal Not Accepted</text>
          <text class="sub" x="${xOff}" y="${bandSpacing * 0.8}">Proposal Not Accepted</text>
        `);
      }
    }
    return `<g transform="translate(${w / 2}, ${bandY}) rotate(-35)">${stamps.join('')}</g>`;
  }).join('\n      ');

  const svgOverlay = `
    <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <style>
          .main { font-family: sans-serif; font-weight: 900; font-size: ${mainFontSize}px; fill: rgba(180, 20, 20, 0.38); }
          .sub { font-family: sans-serif; font-weight: 700; font-size: ${subFontSize}px; fill: rgba(180, 20, 20, 0.32); }
          .shadow { font-family: sans-serif; font-weight: 900; font-size: ${mainFontSize}px; fill: rgba(255, 255, 255, 0.30); stroke: rgba(255, 255, 255, 0.20); stroke-width: ${strokeW}px; }
          .shadow-sub { font-family: sans-serif; font-weight: 700; font-size: ${subFontSize}px; fill: rgba(255, 255, 255, 0.30); stroke: rgba(255, 255, 255, 0.20); stroke-width: ${strokeWSub}px; }
          .legal { font-family: sans-serif; font-size: ${legalFontSize}px; fill: rgba(100, 100, 100, 0.7); }
          .company { font-family: sans-serif; font-size: ${legalFontSize + 2}px; fill: rgba(100, 100, 100, 0.5); }
        </style>
      </defs>
      ${bands}
      <rect x="0" y="${h - legalFontSize * 3}" width="${w}" height="${legalFontSize * 3}" fill="rgba(245,245,245,0.9)" />
      <text class="legal" x="${w / 2}" y="${h - legalFontSize}" text-anchor="middle">${legalEscaped}</text>
      ${escapedCompany ? `<text class="company" x="${w / 2}" y="${legalFontSize * 2}" text-anchor="middle">Document property of ${escapedCompany}</text>` : ''}
    </svg>
  `;

  const watermarked = await sharp(imageBuffer)
    .composite([{ input: Buffer.from(svgOverlay), top: 0, left: 0 }])
    .png()
    .toBuffer();

  return watermarked;
}

function detectFileType(buffer: Buffer, contentType: string): 'pdf' | 'image' | 'unknown' {
  if (contentType === 'application/pdf') return 'pdf';
  if (contentType.startsWith('image/')) return 'image';

  if (buffer.length >= 5 && buffer.slice(0, 5).toString() === '%PDF-') return 'pdf';

  if (buffer.length >= 8) {
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'image';
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return 'image';
    if (buffer.slice(0, 4).toString() === 'RIFF' && buffer.slice(8, 12).toString() === 'WEBP') return 'image';
    if (buffer.slice(0, 3).toString() === 'GIF') return 'image';
  }

  return 'unknown';
}

export async function applyWatermark(fileBuffer: Buffer, contentType: string, companyName?: string): Promise<{ buffer: Buffer; contentType: string }> {
  const fileType = detectFileType(fileBuffer, contentType);

  if (fileType === 'pdf') {
    const watermarked = await watermarkPdf(fileBuffer, companyName);
    return { buffer: watermarked, contentType: 'application/pdf' };
  }

  if (fileType === 'image') {
    const watermarked = await watermarkImage(fileBuffer, companyName);
    return { buffer: watermarked, contentType: 'image/png' };
  }

  return { buffer: fileBuffer, contentType };
}
