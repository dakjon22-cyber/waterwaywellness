import { Router, type IRouter } from "express";
import { randomUUID } from "crypto";
import { printify } from "../lib/printify";
import { tapstitch, isTapstitchId, tapstitchEmailFields, TAPSTITCH_ORDER_EMAIL, SITE_URL, TAPSTITCH_SHIPPING_COST } from "../lib/tapstitch";
import { getUncachableStripeClient, getStripePublishableKey } from "../stripeClient";
import { db } from "@workspace/db";
import { ordersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

type CartItem = { product_id: string; variant_id: number; quantity: number };

async function getCatalogProduct(id: string) {
  return isTapstitchId(id) ? tapstitch.getProduct(id) : printify.getProduct(id);
}

async function submitOrderToPrintify(stripeSessionId: string): Promise<void> {
  const stripe = await getUncachableStripeClient();

  // Newer Stripe API versions moved shipping details under collected_information.
  const session = (await stripe.checkout.sessions.retrieve(stripeSessionId)) as any;

  if (session.payment_status !== "paid") {
    logger.info({ stripeSessionId }, "Session not yet paid — skipping fulfillment");
    return;
  }

  const [order] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.stripeSessionId, stripeSessionId));

  if (!order) {
    logger.warn({ stripeSessionId }, "No order found for session");
    return;
  }

  const shipping =
    session.collected_information?.shipping_details ?? session.shipping_details ?? null;
  const customerEmail: string = session.customer_details?.email ?? "";

  if (!shipping?.address || !shipping?.name) {
    logger.error({ stripeSessionId }, "No shipping address on session — cannot fulfill");
    return;
  }

  const items = order.items as CartItem[];
  const printifyItems = items.filter((i) => !isTapstitchId(i.product_id));
  const tapstitchItems = items.filter((i) => isTapstitchId(i.product_id));
  const statusTags = new Set(order.status.split(",").filter(Boolean));

  // Printify: automatic
  let printifyOrderId = order.printifyOrderId;
  if (printifyItems.length > 0 && !printifyOrderId) {
    const nameParts = shipping.name.trim().split(/\s+/);
    const firstName = nameParts[0] ?? "";
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : firstName;

    logger.info({ orderId: order.id, printifyItems }, "Submitting order to Printify");
    const printifyOrder = await printify.createOrder({
      external_id: order.id,
      label: `WW-${order.id.slice(0, 8).toUpperCase()}`,
      line_items: printifyItems.map((item) => ({
        product_id: item.product_id,
        variant_id: item.variant_id,
        quantity: item.quantity,
      })),
      shipping_method: 1,
      send_shipping_notification: true,
      address_to: {
        first_name: firstName,
        last_name: lastName,
        email: customerEmail,
        country: shipping.address.country ?? "US",
        region: shipping.address.state ?? "",
        address1: shipping.address.line1 ?? "",
        address2: shipping.address.line2 ?? undefined,
        city: shipping.address.city ?? "",
        zip: shipping.address.postal_code ?? "",
      },
    });
    printifyOrderId = printifyOrder.id;
    statusTags.add("printify_submitted");
    logger.info({ orderId: order.id, printifyOrderId }, "Order submitted to Printify");
  }

  statusTags.delete("pending");
  await db
    .update(ordersTable)
    .set({
      status: [...statusTags].join(",") || "submitted",
      printifyOrderId,
      customerEmail,
      shippingAddress: shipping.address,
      updatedAt: new Date(),
    })
    .where(eq(ordersTable.id, order.id));
}

router.get("/checkout/config", async (req, res): Promise<void> => {
  try {
    const publishableKey = await getStripePublishableKey();
    res.json({ publishableKey });
  } catch (err: any) {
    req.log.error({ err }, "Failed to get Stripe config");
    res.status(500).json({ error: err.message ?? "Config unavailable" });
  }
});

const ZINGO_CODE = "ZINGO";

router.get("/checkout/validate-coupon", async (req, res): Promise<void> => {
  const { code } = req.query;
  if (!code || typeof code !== "string") {
    res.status(400).json({ error: "Missing code" });
    return;
  }
  if (code.trim().toUpperCase() === ZINGO_CODE) {
    res.json({
      valid: true,
      id: "ZINGO_AT_COST",
      code: ZINGO_CODE,
      type: "at_cost",
      percentOff: null,
      amountOff: null,
      label: "At-cost pricing — you pay what we pay",
    });
    return;
  }
  try {
    const stripe = await getUncachableStripeClient();
    const promoCodes = await stripe.promotionCodes.list({ code, active: true, limit: 1 });
    if (promoCodes.data.length === 0) {
      res.json({ valid: false, error: "Invalid or expired code" });
      return;
    }
    const promo = promoCodes.data[0];
    const coupon = promo.coupon;
    res.json({
      valid: true,
      id: promo.id,
      code: promo.code,
      type: "standard",
      percentOff: coupon.percent_off ?? null,
      amountOff: coupon.amount_off ?? null,
    });
  } catch (err: any) {
    req.log.error({ err }, "Failed to validate coupon");
    res.status(500).json({ error: "Could not validate code" });
  }
});

const PRINTIFY_SHIPPING: Record<number, { first: number; additional: number }> = {
  77: { first: 769, additional: 209 },
  706: { first: 399, additional: 209 },
};

const DEFAULT_SHIPPING = { first: 699, additional: 209 };

async function computeAtCostDiscount(
  items: Array<{ product_id: string; variant_id: number; quantity: number }>
): Promise<number> {
  const products = await Promise.all(
    items.map(async (item) => {
      const product = await getCatalogProduct(item.product_id);
      const variant = product.variants.find((v) => v.id === item.variant_id);
      if (!variant) throw new Error(`Variant ${item.variant_id} not found`);
      return { product, variant, quantity: item.quantity };
    })
  );

  let totalDiscount = 0;

  for (const { product, variant, quantity } of products) {
    const markup = variant.price - variant.cost;
    totalDiscount += markup * quantity;
  }

  let firstItemDone = false;
  for (const { product, quantity } of products) {
    const shipping = isTapstitchId(product.id)
      ? { first: TAPSTITCH_SHIPPING_COST, additional: TAPSTITCH_SHIPPING_COST }
      : PRINTIFY_SHIPPING[(product as any).blueprint_id] ?? DEFAULT_SHIPPING;
    if (!firstItemDone) {
      totalDiscount += shipping.first;
      totalDiscount += shipping.additional * (quantity - 1);
      firstItemDone = true;
    } else {
      totalDiscount += shipping.additional * quantity;
    }
  }

  return totalDiscount;
}

router.post("/checkout/embedded-session", async (req, res): Promise<void> => {
  try {
    const { items, promoCodeId } = req.body as {
      items: Array<{ product_id: string; variant_id: number; quantity: number }>;
      promoCodeId?: string;
    };

    if (!items || items.length === 0) {
      res.status(400).json({ error: "No items provided" });
      return;
    }

    const stripe = await getUncachableStripeClient();

    const baseUrl = SITE_URL;

    const lineItems = await Promise.all(
      items.map(async (item) => {
        const product = await getCatalogProduct(item.product_id);
        const variant = product.variants.find((v) => v.id === item.variant_id);
        if (!variant) throw new Error(`Variant ${item.variant_id} not found`);

        const image = product.images.find((img) => img.variant_ids.includes(item.variant_id)) ??
          product.images.find((img) => img.is_default);

        return {
          price_data: {
            currency: "usd",
            unit_amount: variant.price,
            product_data: {
              name: `${product.title} — ${variant.title}`,
              description: product.description?.replace(/<[^>]+>/g, "").slice(0, 500) || undefined,
              images: image
                ? [image.src.startsWith("http") ? image.src : `${baseUrl}${image.src}`]
                : [],
            },
          },
          quantity: item.quantity,
        };
      })
    );

    const orderId = randomUUID();

    // No promo field inside Stripe's form — codes (incl. ZINGO) are applied via the cart
    let discountConfig: Record<string, unknown> = {};

    if (promoCodeId === "ZINGO_AT_COST") {
      const discountAmount = await computeAtCostDiscount(items);
      req.log.info({ discountAmount }, "ZINGO at-cost discount computed");

      const tempCoupon = await stripe.coupons.create({
        amount_off: discountAmount,
        currency: "usd",
        duration: "once",
        name: "ZINGO — At-Cost Pricing",
        max_redemptions: 1,
      });

      discountConfig = { discounts: [{ coupon: tempCoupon.id }] };
    } else if (promoCodeId) {
      discountConfig = { discounts: [{ promotion_code: promoCodeId }] };
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: lineItems,
      mode: "payment",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ui_mode: "embedded_page" as any,
      shipping_address_collection: {
        allowed_countries: ["US", "CA", "GB", "AU", "DE", "FR", "ES", "IT", "NL", "SE", "NO", "DK", "FI"],
      },
      shipping_options: [
        {
          shipping_rate_data: {
            type: "fixed_amount",
            fixed_amount: { amount: 699, currency: "usd" },
            display_name: "Standard Shipping (5–10 business days)",
            delivery_estimate: {
              minimum: { unit: "business_day", value: 5 },
              maximum: { unit: "business_day", value: 10 },
            },
          },
        },
        {
          shipping_rate_data: {
            type: "fixed_amount",
            fixed_amount: { amount: 1299, currency: "usd" },
            display_name: "Express Shipping (2–4 business days)",
            delivery_estimate: {
              minimum: { unit: "business_day", value: 2 },
              maximum: { unit: "business_day", value: 4 },
            },
          },
        },
      ],
      return_url: `${baseUrl}/shop/success?session_id={CHECKOUT_SESSION_ID}`,
      metadata: { order_id: orderId },
      ...discountConfig,
    } as Parameters<typeof stripe.checkout.sessions.create>[0]);

    await db.insert(ordersTable).values({
      id: orderId,
      stripeSessionId: session.id,
      status: "pending",
      items,
      totalAmount: "0",
    });

    res.json({ clientSecret: session.client_secret });
  } catch (err: any) {
    req.log.error({ err }, "Failed to create embedded checkout session");
    res.status(500).json({ error: err.message ?? "Checkout failed" });
  }
});

router.post("/checkout/session", async (req, res): Promise<void> => {
  try {
    const { items } = req.body as {
      items: Array<{ product_id: string; variant_id: number; quantity: number }>;
    };

    if (!items || items.length === 0) {
      res.status(400).json({ error: "No items provided" });
      return;
    }

    const stripe = await getUncachableStripeClient();

    const lineItems = await Promise.all(
      items.map(async (item) => {
        const product = await getCatalogProduct(item.product_id);
        const variant = product.variants.find((v) => v.id === item.variant_id);
        if (!variant) throw new Error(`Variant ${item.variant_id} not found`);

        const image = product.images.find((img) => img.variant_ids.includes(item.variant_id)) ??
          product.images.find((img) => img.is_default);

        return {
          price_data: {
            currency: "usd",
            unit_amount: variant.price,
            product_data: {
              name: `${product.title} — ${variant.title}`,
              description: product.description?.slice(0, 500) || undefined,
              images: image ? [image.src.startsWith("http") ? image.src : `${baseUrl}${image.src}`] : [],
            },
          },
          quantity: item.quantity,
        };
      })
    );

    const orderId = randomUUID();
    const baseUrl = SITE_URL;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: lineItems,
      mode: "payment",
      shipping_address_collection: {
        allowed_countries: ["US", "CA", "GB", "AU", "DE", "FR", "ES", "IT", "NL", "SE", "NO", "DK", "FI"],
      },
      shipping_options: [
        {
          shipping_rate_data: {
            type: "fixed_amount",
            fixed_amount: { amount: 699, currency: "usd" },
            display_name: "Standard Shipping (5–10 business days)",
            delivery_estimate: {
              minimum: { unit: "business_day", value: 5 },
              maximum: { unit: "business_day", value: 10 },
            },
          },
        },
        {
          shipping_rate_data: {
            type: "fixed_amount",
            fixed_amount: { amount: 1299, currency: "usd" },
            display_name: "Express Shipping (2–4 business days)",
            delivery_estimate: {
              minimum: { unit: "business_day", value: 2 },
              maximum: { unit: "business_day", value: 4 },
            },
          },
        },
      ],
      success_url: `${baseUrl}/shop/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/shop`,
      metadata: { order_id: orderId },
    });

    await db.insert(ordersTable).values({
      id: orderId,
      stripeSessionId: session.id,
      status: "pending",
      items,
      totalAmount: String(session.amount_total ?? 0),
    });

    res.json({ url: session.url });
  } catch (err: any) {
    req.log.error({ err }, "Failed to create checkout session");
    res.status(500).json({ error: err.message ?? "Checkout failed" });
  }
});

router.get("/checkout/session/:sessionId", async (req, res): Promise<void> => {
  try {
    const { sessionId } = req.params;

    await submitOrderToPrintify(sessionId).catch((err) => {
      req.log.error({ err }, "Printify order submission failed");
    });

    const stripe = await getUncachableStripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    const [order] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.stripeSessionId, sessionId));

    res.json({
      data: {
        session: {
          id: session.id,
          status: session.payment_status,
          customer_email: session.customer_details?.email,
          amount_total: session.amount_total,
          currency: session.currency,
        },
        order: order ?? null,
      },
    });
  } catch (err: any) {
    req.log.error({ err }, "Failed to get session");
    res.status(500).json({ error: err.message ?? "Failed to fetch session" });
  }
});

/** The Tapstitch order email for a paid session, or null if there's nothing (left) to send. */
async function pendingTapstitchEmail(stripeSessionId: string): Promise<Record<string, string> | null> {
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.stripeSessionId, stripeSessionId));
  if (!order || order.status.split(",").includes("tapstitch_emailed")) return null;
  const items = (order.items as CartItem[]).filter((i) => isTapstitchId(i.product_id));
  if (items.length === 0) return null;
  const stripe = await getUncachableStripeClient();
  const session = (await stripe.checkout.sessions.retrieve(stripeSessionId)) as any;
  if (session.payment_status !== "paid") return null;
  const shipping = session.collected_information?.shipping_details ?? session.shipping_details ?? null;
  const a = shipping?.address ?? {};
  return tapstitchEmailFields({
    orderId: order.id,
    customerName: shipping?.name ?? session.customer_details?.name ?? "",
    customerEmail: session.customer_details?.email ?? "",
    address: [a.line1, a.line2, `${a.city ?? ""}, ${a.state ?? ""} ${a.postal_code ?? ""}`, a.country].filter(Boolean).join("\n"),
    items: items.map((i) => {
      const p = tapstitch.getProduct(i.product_id);
      const v = p.variants.find((x) => x.id === i.variant_id);
      return { title: p.title, variant: v?.title ?? String(i.variant_id), quantity: i.quantity, tapstitchProductId: tapstitch.tapstitchProductId(i.product_id) };
    }),
    amountPaid: `$${((session.amount_total ?? 0) / 100).toFixed(2)}`,
  });
}

router.get("/checkout/tapstitch-email/:sessionId", async (req, res): Promise<void> => {
  try {
    res.json({ to: TAPSTITCH_ORDER_EMAIL, fields: await pendingTapstitchEmail(req.params.sessionId) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/checkout/tapstitch-email/:sessionId/sent", async (req, res): Promise<void> => {
  try {
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.stripeSessionId, req.params.sessionId));
    if (!order) { res.status(404).end(); return; }
    const tags = new Set(order.status.split(",").filter(Boolean));
    tags.add("tapstitch_emailed");
    await db.update(ordersTable).set({ status: [...tags].join(",") }).where(eq(ordersTable.id, order.id));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export { submitOrderToPrintify };
export default router;
