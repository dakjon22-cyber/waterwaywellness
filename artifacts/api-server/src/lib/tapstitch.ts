import type { PrintifyProduct, PrintifyVariant, PrintifyImage } from "./printify";
import { logger } from "./logger";

// Tapstitch has no public API, so these products are defined here and served in the
// same shape as Printify products. Orders for them are emailed for manual fulfillment.
// Images live in the frontend at /tapstitch/*.jpg.

export const SITE_URL = process.env.SITE_URL || "https://waterwaywellness.co";
export const TAPSTITCH_ORDER_EMAIL = process.env.TAPSTITCH_ORDER_EMAIL || "waterwaywellnessco@gmail.com";

const PRICE = 3200; // sale price, cents
const COST = 1597; // Tapstitch product + print cost, cents
export const TAPSTITCH_SHIPPING_COST = 562; // Tapstitch shipping per item, cents

const SIZES = ["S", "M", "L", "XL", "2XL"];

interface TsDef {
  id: string;
  tapstitchId: string;
  title: string;
  description: string;
  colors: Array<{ name: string; slug: string }>;
  imagePrefix: string;
}

const DEFS: TsDef[] = [
  {
    id: "ts_seafoam_logo_tee",
    tapstitchId: "1544188709442850816",
    title: "Sea Foam Logo Tee",
    description:
      "Boxy vintage-wash tee with the Waterway Wellness logo in sea foam. Printed on demand. Sizes S–2XL.",
    colors: [
      { name: "Black", slug: "black" },
      { name: "Apricot", slug: "apricot" },
      { name: "Pink", slug: "pink" },
    ],
    imagePrefix: "seafoam-logo",
  },
  {
    id: "ts_logo_tee",
    tapstitchId: "1544189698728169472",
    title: "Logo Tee",
    description:
      "Boxy vintage-wash tee with the Waterway Wellness logo. Printed on demand. Sizes S–2XL.",
    colors: [
      { name: "Apricot", slug: "apricot" },
      { name: "Pink", slug: "pink" },
      { name: "Sky Blue", slug: "skyblue" },
      { name: "Red", slug: "red" },
    ],
    imagePrefix: "logo",
  },
  {
    id: "ts_emblem_tee",
    tapstitchId: "1544189222162956288",
    title: "Emblem Tee",
    description:
      "Boxy vintage-wash tee with the Waterway Wellness emblem. Printed on demand. Sizes S–2XL.",
    colors: [
      { name: "Black", slug: "black" },
      { name: "Apricot", slug: "apricot" },
      { name: "Pink", slug: "pink" },
    ],
    imagePrefix: "emblem",
  },
];

function build(def: TsDef, pIdx: number): PrintifyProduct & { source: "tapstitch" } {
  // Option/variant ids must be unique numbers; offset per product to avoid collisions.
  const colorId = (ci: number) => 900000 + pIdx * 100 + ci;
  const sizeId = (si: number) => 910000 + pIdx * 100 + si;
  const variantId = (ci: number, si: number) => 920000 + pIdx * 1000 + ci * 10 + si;

  const variants: PrintifyVariant[] = [];
  def.colors.forEach((c, ci) =>
    SIZES.forEach((s, si) =>
      variants.push({
        id: variantId(ci, si),
        sku: `${def.id}-${c.slug}-${s}`,
        cost: COST,
        price: PRICE,
        title: `${c.name} / ${s}`,
        grams: 259,
        is_enabled: true,
        is_default: ci === 0 && si === 0,
        is_available: true,
        options: [colorId(ci), sizeId(si)],
      })
    )
  );

  const images: PrintifyImage[] = [];
  def.colors.forEach((c, ci) => {
    const ids = SIZES.map((_, si) => variantId(ci, si));
    for (const [n, position] of [[1, "front"], [2, "back"]] as const) {
      images.push({
        src: `/tapstitch/${def.imagePrefix}-${c.slug}-${n}.jpg`,
        variant_ids: ids,
        position,
        is_default: ci === 0 && n === 1,
      });
    }
  });

  return {
    id: def.id,
    title: def.title,
    description: def.description,
    tags: [],
    options: [
      { name: "Colors", type: "color", values: def.colors.map((c, ci) => ({ id: colorId(ci), title: c.name })) },
      { name: "Sizes", type: "size", values: SIZES.map((s, si) => ({ id: sizeId(si), title: s })) },
    ],
    variants,
    images,
    is_locked: false,
    visible: true,
    external: { id: def.tapstitchId, handle: def.id },
    source: "tapstitch",
  };
}

const PRODUCTS = DEFS.map(build);

export function isTapstitchId(id: string): boolean {
  return id.startsWith("ts_");
}

export const tapstitch = {
  listProducts(): PrintifyProduct[] {
    return PRODUCTS;
  },
  getProduct(id: string): PrintifyProduct {
    const p = PRODUCTS.find((x) => x.id === id);
    if (!p) throw new Error(`Tapstitch product ${id} not found (404)`);
    return p;
  },
  tapstitchProductId(id: string): string | undefined {
    return DEFS.find((d) => d.id === id)?.tapstitchId;
  },
};

/**
 * Emails a Tapstitch order to the club inbox for manual placement in Tapstitch.
 * Uses FormSubmit (no API key). The first email to a new address sends an
 * activation link that must be clicked once.
 */
export async function emailTapstitchOrder(order: {
  orderId: string;
  customerName: string;
  customerEmail: string;
  address: string;
  items: Array<{ title: string; variant: string; quantity: number; tapstitchProductId?: string }>;
  amountPaid: string;
}): Promise<void> {
  const lines = order.items
    .map(
      (i) =>
        `• ${i.quantity} × ${i.title} — ${i.variant}` +
        (i.tapstitchProductId ? ` (Tapstitch design ID ${i.tapstitchProductId})` : "")
    )
    .join("\n");

  const resp = await fetch(`https://formsubmit.co/ajax/${TAPSTITCH_ORDER_EMAIL}`, {
    method: "POST",
    // FormSubmit ties activation to the sending site, so identify as the live site.
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Referer: `${SITE_URL}/`,
      Origin: SITE_URL,
    },
    body: JSON.stringify({
      _subject: `New Tapstitch order to place — WW-${order.orderId.slice(0, 8).toUpperCase()}`,
      _template: "box",
      _captcha: "false",
      "Order number": `WW-${order.orderId.slice(0, 8).toUpperCase()}`,
      "Items to order on Tapstitch": lines,
      "Ship to": `${order.customerName}\n${order.address}`,
      "Customer email": order.customerEmail,
      "Customer paid": order.amountPaid,
      "Next step": "Place this order in Tapstitch: Designs → find the design → Add to cart → enter the ship-to address above.",
    }),
    signal: AbortSignal.timeout(15_000),
  });

  const body = await resp.text().catch(() => "");
  if (!resp.ok) {
    throw new Error(`Order email failed: ${resp.status} ${body.slice(0, 200)}`);
  }
  logger.info({ orderId: order.orderId, body: body.slice(0, 200) }, "Tapstitch order email sent");
}
