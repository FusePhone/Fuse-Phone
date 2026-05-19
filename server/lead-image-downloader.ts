import sharp from "sharp";
import { randomUUID } from "crypto";
import { execSync } from "child_process";
import { ObjectStorageService } from "./replit_integrations/object_storage/objectStorage";

const MAX_DIMENSION = 2048;
const JPEG_QUALITY = 80;
const DOWNLOAD_TIMEOUT_MS = 15000;

interface DownloadedImage {
  storageKey: string;
  fileName: string;
  originalUrl: string;
}

function extractAttachmentHash(url: string): string | null {
  const match = url.match(/\/attachment\/([a-f0-9]{20,})\//);
  return match ? match[1] : null;
}

export function deduplicateImageUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const url of urls) {
    const hash = extractAttachmentHash(url);
    const key = hash || url;
    if (!seen.has(key)) {
      seen.add(key);
      const withExt = urls.find(u => {
        const h = extractAttachmentHash(u);
        return h === hash && u.endsWith('.jpg');
      });
      result.push(withExt || url);
    }
  }
  return result;
}

async function downloadWithFetch(url: string): Promise<Buffer | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
    });
    clearTimeout(timeout);
    const contentType = res.headers.get('content-type') || '';
    const contentLength = res.headers.get('content-length') || 'unknown';
    const urlTail = url.slice(-60);
    console.log(`[LeadImages] fetch response for ${urlTail}: status=${res.status} type=${contentType} length=${contentLength}`);
    if (!res.ok) {
      console.error(`[LeadImages] fetch failed (${urlTail}): ${res.status} ${res.statusText}`);
      return null;
    }
    if (contentType.includes('text/html')) {
      console.warn(`[LeadImages] fetch got HTML instead of image for ${urlTail}`);
      return null;
    }
    const arrayBuf = await res.arrayBuffer();
    const buf = Buffer.from(arrayBuf);
    console.log(`[LeadImages] fetch downloaded ${buf.length} bytes from ${urlTail}`);
    return buf;
  } catch (err: any) {
    console.error(`[LeadImages] fetch error for ${url.slice(-60)}:`, err.message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function downloadWithCurl(url: string): Buffer | null {
  const urlTail = url.slice(-60);
  try {
    const buf = execSync(
      `curl -sL --max-time 15 -H "User-Agent: FusePhone-CRM/1.0" -H "Accept: image/*" "${url}"`,
      { maxBuffer: 20 * 1024 * 1024 }
    );
    if (!buf || buf.length < 1000) {
      const text = buf?.toString('utf8', 0, 200) || '';
      if (text.includes('<html') || text.includes('<!DOCTYPE') || text.includes('<HTML')) {
        console.warn(`[LeadImages] curl got HTML for ${urlTail}`);
        return null;
      }
      console.warn(`[LeadImages] curl got tiny response (${buf?.length || 0} bytes) for ${urlTail}`);
      return null;
    }
    const header = buf.slice(0, 4);
    const isJpeg = header[0] === 0xFF && header[1] === 0xD8;
    const isPng = header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47;
    const isWebp = buf.slice(0, 12).toString('ascii').includes('WEBP');
    if (!isJpeg && !isPng && !isWebp) {
      console.warn(`[LeadImages] curl got non-image data for ${urlTail} (header: ${header.toString('hex')})`);
      return null;
    }
    console.log(`[LeadImages] curl downloaded ${buf.length} bytes from ${urlTail}`);
    return buf;
  } catch (err: any) {
    console.error(`[LeadImages] curl error for ${urlTail}:`, err.message?.slice(0, 200));
    return null;
  }
}

async function downloadImageOnce(url: string): Promise<Buffer | null> {
  const buf = await downloadWithFetch(url);
  if (buf && buf.length > 0) return buf;
  console.log(`[LeadImages] fetch failed, trying curl fallback for ${url.slice(-60)}`);
  return downloadWithCurl(url);
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

async function downloadImage(url: string): Promise<Buffer | null> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const buf = await downloadImageOnce(url);
    if (buf && buf.length > 0) return buf;
    if (attempt < MAX_RETRIES) {
      console.log(`[LeadImages] Retry ${attempt}/${MAX_RETRIES} for ${url.slice(-60)} in ${RETRY_DELAY_MS}ms...`);
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    }
  }
  console.error(`[LeadImages] All ${MAX_RETRIES} attempts failed for ${url.slice(-60)}`);
  return null;
}

async function compressImageBuffer(buffer: Buffer): Promise<Buffer> {
  try {
    const metadata = await sharp(buffer).metadata();
    const { width = 0, height = 0 } = metadata;

    if (width <= MAX_DIMENSION && height <= MAX_DIMENSION && buffer.length < 500_000) {
      return buffer;
    }

    let pipeline = sharp(buffer).rotate();

    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      pipeline = pipeline.resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true });
    }

    const compressed = await pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer();

    if (compressed.length < buffer.length) {
      return compressed;
    }
    return buffer;
  } catch (err: any) {
    console.error('[LeadImages] Compression error:', err.message);
    return buffer;
  }
}

export async function downloadAndStoreLeadImages(
  imageUrls: string[],
  source: string = 'lead_submission'
): Promise<DownloadedImage[]> {
  const objectStorage = new ObjectStorageService();
  const results: DownloadedImage[] = [];

  const dedupedUrls = deduplicateImageUrls(imageUrls);
  console.log(`[LeadImages] Processing ${dedupedUrls.length} unique images (from ${imageUrls.length} total URLs)`);

  for (const url of dedupedUrls) {
    try {
      const rawBuffer = await downloadImage(url);
      if (!rawBuffer || rawBuffer.length === 0) {
        console.warn(`[LeadImages] Skipping empty/failed download: ${url}`);
        continue;
      }

      const compressed = await compressImageBuffer(rawBuffer);
      const sizeBefore = (rawBuffer.length / 1024).toFixed(0);
      const sizeAfter = (compressed.length / 1024).toFixed(0);
      console.log(`[LeadImages] Compressed: ${sizeBefore}KB → ${sizeAfter}KB`);

      const uploadUrl = await objectStorage.getObjectEntityUploadURL();
      const objectPath = objectStorage.normalizeObjectEntityPath(uploadUrl);

      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        body: compressed,
        headers: {
          'Content-Type': 'image/jpeg',
        },
      });

      if (!putRes.ok) {
        console.error(`[LeadImages] Upload failed for ${url}: ${putRes.status}`);
        continue;
      }

      try {
        await objectStorage.trySetObjectEntityAclPolicy(objectPath, {
          visibility: 'public',
        });
      } catch (aclErr) {
        console.warn('[LeadImages] ACL set warning:', aclErr);
      }

      const hash = extractAttachmentHash(url);
      const fileName = `lead-photo-${hash || randomUUID()}.jpg`;

      results.push({
        storageKey: objectPath,
        fileName,
        originalUrl: url,
      });

      console.log(`[LeadImages] Saved: ${fileName} → ${objectPath}`);
    } catch (err: any) {
      console.error(`[LeadImages] Error processing ${url}:`, err.message);
    }
  }

  return results;
}
