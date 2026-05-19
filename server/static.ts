import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { injectCustomDomainOGTags, setOGCacheHeaders } from "./og-inject";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  app.use("/{*path}", async (req, res) => {
    if (/\.(js|css|map|woff2?|ttf|png|jpg|jpeg|svg|ico|webp|gif|json)$/i.test(req.path)) {
      return res.status(404).send('Not found');
    }
    const htmlPath = path.resolve(distPath, "index.html");
    let html = await fs.promises.readFile(htmlPath, "utf-8");
    const customDomain = req.get('x-custom-domain');
    const workerAuth = req.get('x-worker-auth');
    const isCustomDomain = !!(customDomain && workerAuth);
    if (isCustomDomain) {
      console.log(`[Static] Serving SPA for custom domain: path=${req.path} x-custom-domain=${customDomain} host=${req.get('host')}`);
    }
    html = await injectCustomDomainOGTags(req, html);
    setOGCacheHeaders(res, isCustomDomain);
    res.status(200).set({ "Content-Type": "text/html" }).end(html);
  });
}
