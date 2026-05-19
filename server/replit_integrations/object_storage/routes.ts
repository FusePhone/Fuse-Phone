import type { Express } from "express";
import { ObjectStorageService, ObjectNotFoundError, objectStorageClient } from "./objectStorage";
import { spawn } from "child_process";
import { promises as fs } from "fs";
import { createWriteStream } from "fs";
import path from "path";
import os from "os";
import { randomUUID } from "crypto";
import { pipeline } from "stream/promises";

/**
 * Register object storage routes for file uploads.
 *
 * This provides example routes for the presigned URL upload flow:
 * 1. POST /api/uploads/request-url - Get a presigned URL for uploading
 * 2. The client then uploads directly to the presigned URL
 *
 * IMPORTANT: These are example routes. Customize based on your use case:
 * - Add authentication middleware for protected uploads
 * - Add file metadata storage (save to database after upload)
 * - Add ACL policies for access control
 */
export function registerObjectStorageRoutes(app: Express): void {
  const objectStorageService = new ObjectStorageService();

  /**
   * Request a presigned URL for file upload.
   *
   * Request body (JSON):
   * {
   *   "name": "filename.jpg",
   *   "size": 12345,
   *   "contentType": "image/jpeg"
   * }
   *
   * Response:
   * {
   *   "uploadURL": "https://storage.googleapis.com/...",
   *   "objectPath": "/objects/uploads/uuid"
   * }
   *
   * IMPORTANT: The client should NOT send the file to this endpoint.
   * Send JSON metadata only, then upload the file directly to uploadURL.
   */
  app.post("/api/uploads/request-url", async (req, res) => {
    try {
      const { name, size, contentType } = req.body;

      if (!name) {
        return res.status(400).json({
          error: "Missing required field: name",
        });
      }

      const uploadURL = await objectStorageService.getObjectEntityUploadURL();

      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      console.log("[Upload] Presigned URL generated, objectPath:", objectPath, "uploadURL:", uploadURL.substring(0, 80) + "...");

      res.json({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      });
    } catch (error) {
      console.error("Error generating upload URL:", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  /**
   * Transcode an uploaded video to a smaller H.264 720p MP4.
   * Body: { objectPath: "/objects/uploads/uuid" }
   * Returns: { objectPath: "/objects/uploads/uuid-c.mp4", originalSize, compressedSize }
   * The original file is deleted from storage after a successful transcode.
   */
  app.post("/api/uploads/transcode-video", async (req, res) => {
    const { objectPath } = req.body;
    if (!objectPath || typeof objectPath !== "string") {
      return res.status(400).json({ error: "Missing objectPath" });
    }

    const tmpDir = os.tmpdir();
    const jobId = randomUUID();
    const inPath = path.join(tmpDir, `vid-in-${jobId}`);
    const outPath = path.join(tmpDir, `vid-out-${jobId}.mp4`);

    try {
      const sourceFile = await objectStorageService.getObjectEntityFile(objectPath);
      const [meta] = await sourceFile.getMetadata();
      const originalSize = Number(meta.size || 0);

      // Download to temp file
      await pipeline(sourceFile.createReadStream(), createWriteStream(inPath));

      // Run ffmpeg: scale to <=1280 wide, H.264 CRF 28, AAC 96k, faststart for web playback
      console.log("[Transcode] Starting ffmpeg for", objectPath, `(${(originalSize / 1024 / 1024).toFixed(1)}MB)`);
      await new Promise<void>((resolve, reject) => {
        const args = [
          "-y",
          "-i", inPath,
          "-vf", "scale='min(1280,iw)':-2",
          "-c:v", "libx264",
          "-preset", "veryfast",
          "-crf", "28",
          "-c:a", "aac",
          "-b:a", "96k",
          "-movflags", "+faststart",
          "-max_muxing_queue_size", "1024",
          outPath,
        ];
        const ff = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
        let stderr = "";
        ff.stderr.on("data", (d) => { stderr += d.toString(); });
        ff.on("error", reject);
        ff.on("close", (code) => {
          if (code === 0) resolve();
          else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`));
        });
      });

      const stat = await fs.stat(outPath);
      const compressedSize = stat.size;
      console.log("[Transcode] ffmpeg done. Original:", originalSize, "Compressed:", compressedSize);

      // Decide which to keep — if compression actually made it bigger (rare for short clips), keep original
      if (compressedSize >= originalSize * 0.95) {
        console.log("[Transcode] Compressed file not meaningfully smaller, keeping original");
        await fs.unlink(inPath).catch(() => {});
        await fs.unlink(outPath).catch(() => {});
        return res.json({ objectPath, originalSize, compressedSize: originalSize, skipped: true });
      }

      // Upload compressed result to a new object path
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const compressedBuffer = await fs.readFile(outPath);
      const putRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": "video/mp4" },
        body: compressedBuffer,
      });
      if (!putRes.ok) throw new Error(`Upload of compressed video failed: ${putRes.status}`);
      const newObjectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      await objectStorageService.trySetObjectEntityAclPolicy(newObjectPath, { visibility: "public" });

      // Best-effort delete of original
      try {
        await sourceFile.delete();
      } catch (e) {
        console.warn("[Transcode] Failed to delete original:", e);
      }

      await fs.unlink(inPath).catch(() => {});
      await fs.unlink(outPath).catch(() => {});

      res.json({ objectPath: newObjectPath, originalSize, compressedSize });
    } catch (e: any) {
      console.error("[Transcode] Error:", e);
      await fs.unlink(inPath).catch(() => {});
      await fs.unlink(outPath).catch(() => {});
      res.status(500).json({ error: e?.message || "Transcode failed" });
    }
  });

  app.post("/api/uploads/confirm", async (req, res) => {
    try {
      const { objectPath } = req.body;
      if (!objectPath) {
        return res.status(400).json({ error: "Missing objectPath" });
      }
      console.log("[Upload] Confirming upload for objectPath:", objectPath);
      try {
        const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
        console.log("[Upload] File found in storage, setting public ACL");
        await objectStorageService.trySetObjectEntityAclPolicy(objectPath, {
          visibility: "public",
        });
      } catch (e) {
        console.log("[Upload] File not yet visible or ACL error, continuing:", e);
      }
      res.json({ ok: true, objectPath });
    } catch (error) {
      console.error("Error confirming upload:", error);
      res.status(500).json({ error: "Failed to confirm upload" });
    }
  });

  /**
   * Serve uploaded objects.
   *
   * GET /objects/:objectPath(*)
   *
   * This serves files from object storage. For public files, no auth needed.
   * For protected files, add authentication middleware and ACL checks.
   */
  app.get(/^\/objects\/(.+)$/, async (req, res) => {
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      await objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error serving object:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ error: "Object not found" });
      }
      return res.status(500).json({ error: "Failed to serve object" });
    }
  });
}

