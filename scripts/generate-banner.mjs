import sharp from 'sharp';
import https from 'https';
import http from 'http';
import path from 'path';
import fs from 'fs';

async function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadImage(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

const BANNER_W = 2400;
const COLS = 3;
const ROWS = 2;
const GAP = 4;
const CELL_W = Math.floor((BANNER_W - (COLS - 1) * GAP) / COLS);
const CELL_H = 380;
const BANNER_H = ROWS * CELL_H + (ROWS - 1) * GAP + 8;

const photos = [
  'https://gamainteriorpainting.com/wp-content/uploads/2026/03/gama-crew-prep-work-rotated.jpeg',
  'https://gamainteriorpainting.com/wp-content/uploads/2026/03/brooklyn-charcoal-hallway-rotated.jpeg',
  'https://gamainteriorpainting.com/wp-content/uploads/2026/03/park-slope-brownstone-living-room.jpeg',
  'https://gamainteriorpainting.com/wp-content/uploads/2026/03/brooklyn-olive-doors-kitchen.jpeg',
  'https://gamainteriorpainting.com/wp-content/uploads/2026/03/gama-crew-ceiling-painting.jpeg',
  'https://gamainteriorpainting.com/wp-content/uploads/2026/03/park-slope-bay-window-room.jpeg',
];

const logoUrl = 'https://gamainteriorpainting.com/wp-content/uploads/2024/02/cropped-cropped-cropped-gama-Brush-handle-New-yelow.png';
const ownerUrl = 'https://gamainteriorpainting.com/wp-content/uploads/2026/03/owner-gamaliel.jpeg';

async function generateBanner(withBg, outputName) {
  console.log(`Generating ${outputName}...`);

  const composites = [];

  for (let i = 0; i < photos.length; i++) {
    const row = Math.floor(i / COLS);
    const col = i % COLS;
    const x = col * (CELL_W + GAP);
    const y = row * (CELL_H + GAP);

    const buf = await downloadImage(photos[i]);
    const cell = await sharp(buf).resize(CELL_W, CELL_H, { fit: 'cover' }).toBuffer();
    composites.push({ input: cell, left: x, top: y });
  }

  const redBar = await sharp({ create: { width: BANNER_W, height: 8, channels: 4, background: { r: 228, g: 24, b: 29, alpha: 1 } } }).png().toBuffer();
  composites.push({ input: redBar, left: 0, top: BANNER_H - 8 });

  const logoSize = 120;
  const ownerSize = 124;
  const textH = 70;
  const padX = 44;
  const padY = 28;
  const innerGap = 28;

  const contentW = logoSize + innerGap + ownerSize + innerGap + 420;
  const contentH = Math.max(logoSize, ownerSize, textH);

  const boxW = contentW + padX * 2;
  const boxH = contentH + padY * 2;
  const boxX = Math.round((BANNER_W - boxW) / 2);
  const boxY = Math.round((BANNER_H - boxH) / 2);

  if (withBg) {
    const bg = await sharp({ create: { width: boxW, height: boxH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{
        input: Buffer.from(`<svg width="${boxW}" height="${boxH}"><rect x="0" y="0" width="${boxW}" height="${boxH}" rx="28" fill="rgba(0,0,0,0.8)"/><rect x="0" y="0" width="${boxW}" height="${boxH}" rx="28" fill="none" stroke="rgba(228,24,29,0.3)" stroke-width="2"/></svg>`),
        top: 0, left: 0
      }]).png().toBuffer();
    composites.push({ input: bg, left: boxX, top: boxY });
  }

  const logoBuf = await downloadImage(logoUrl);
  const logoResized = await sharp(logoBuf).resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const logoX = boxX + padX;
  const logoY = boxY + Math.round((boxH - logoSize) / 2);
  composites.push({ input: logoResized, left: logoX, top: logoY });

  const ownerBuf = await downloadImage(ownerUrl);
  const ownerCircle = await sharp(ownerBuf).resize(ownerSize, ownerSize, { fit: 'cover' }).png().toBuffer();
  const bdr = 6;
  const mask = Buffer.from(`<svg width="${ownerSize}" height="${ownerSize}"><circle cx="${ownerSize/2}" cy="${ownerSize/2}" r="${ownerSize/2 - bdr/2}" fill="white"/></svg>`);
  const border = Buffer.from(`<svg width="${ownerSize + bdr*2}" height="${ownerSize + bdr*2}"><circle cx="${(ownerSize+bdr*2)/2}" cy="${(ownerSize+bdr*2)/2}" r="${(ownerSize+bdr*2)/2 - 1}" fill="none" stroke="#e4181d" stroke-width="${bdr}"/></svg>`);

  const maskedOwner = await sharp(ownerCircle)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png().toBuffer();

  const ownerWithBorder = await sharp({ create: { width: ownerSize + bdr*2, height: ownerSize + bdr*2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      { input: border, left: 0, top: 0 },
      { input: maskedOwner, left: bdr, top: bdr }
    ]).png().toBuffer();

  const ownerX = logoX + logoSize + innerGap;
  const ownerY = boxY + Math.round((boxH - (ownerSize + bdr*2)) / 2);
  composites.push({ input: ownerWithBorder, left: ownerX, top: ownerY });

  const textX = ownerX + ownerSize + bdr*2 + innerGap;
  const textY = boxY + Math.round(boxH / 2) - 32;

  const nameColor = '#ffffff';
  const titleColor = '#e4181d';

  const textSvg = Buffer.from(`<svg width="460" height="80">
    <text x="0" y="32" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="30" fill="${nameColor}">Gamaliel Revolorio</text>
    <text x="0" y="62" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="18" fill="${titleColor}" letter-spacing="2">OWNER · GAMA INTERIOR PAINTING</text>
  </svg>`);
  composites.push({ input: textSvg, left: textX, top: textY });

  await sharp({ create: { width: BANNER_W, height: BANNER_H, channels: 4, background: { r: 17, g: 17, b: 17, alpha: 1 } } })
    .composite(composites)
    .png({ quality: 95 })
    .toFile(`client/public/${outputName}`);

  console.log(`  -> client/public/${outputName} (${BANNER_W}x${BANNER_H})`);
}

await generateBanner(true, 'hero-banner-with-bg.png');
await generateBanner(false, 'hero-banner-no-bg.png');
console.log('Done!');
