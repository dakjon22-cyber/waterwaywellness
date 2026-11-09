import { Router, type IRouter } from "express";
import { printify } from "../lib/printify";
import { tapstitch, isTapstitchId } from "../lib/tapstitch";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function proxyImageUrl(src: string): string {
  // Printify mockup URLs are publicly served from their CDN — link directly
  // (much faster than proxying every image through this server).
  return src;
}

function rewriteProductImages(
  product: import("../lib/printify").PrintifyProduct
): import("../lib/printify").PrintifyProduct {
  return {
    ...product,
    images: product.images.map((img) => ({
      ...img,
      src: proxyImageUrl(img.src),
    })),
  };
}

router.get("/printify/image", async (req, res): Promise<void> => {
  const { url } = req.query;
  if (!url || typeof url !== "string") {
    res.status(400).json({ error: "Missing url parameter" });
    return;
  }

  try {
    const upstream = await fetch(decodeURIComponent(url), {
      signal: AbortSignal.timeout(10_000),
    });

    if (!upstream.ok) {
      res.status(upstream.status).end();
      return;
    }

    const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
    const buffer = await upstream.arrayBuffer();

    res.set("Content-Type", contentType);
    res.set("Cache-Control", "public, max-age=86400");
    res.send(Buffer.from(buffer));
  } catch (err) {
    logger.warn({ err, url }, "Image proxy failed");
    res.status(502).end();
  }
});

router.get("/printify/products", async (req, res) => {
  try {
    let rewritten: Awaited<ReturnType<typeof printify.listProducts>> = [];
    try {
      rewritten = (await printify.listProducts()).map((p) => rewriteProductImages(p));
    } catch (err) {
      req.log.error({ err }, "Printify unavailable — serving Tapstitch products only");
    }
    res.json({ data: [...rewritten, ...tapstitch.listProducts()] });
  } catch (err: any) {
    req.log.error({ err }, "Failed to list Printify products");
    res.status(500).json({ error: err.message ?? "Failed to fetch products" });
  }
});

router.get("/printify/products/:productId", async (req, res): Promise<void> => {
  try {
    const id = req.params.productId;
    if (isTapstitchId(id)) {
      res.json({ data: tapstitch.getProduct(id) });
      return;
    }
    const product = await printify.getProduct(id);
    const rewritten = rewriteProductImages(product);
    res.json({ data: rewritten });
  } catch (err: any) {
    req.log.error({ err }, "Failed to get Printify product");
    if (err.message?.includes("404")) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    res.status(500).json({ error: err.message ?? "Failed to fetch product" });
  }
});

export default router;
