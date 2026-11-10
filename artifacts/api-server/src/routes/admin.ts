import { Router, type IRouter, type Request } from "express";
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { pool, db, ordersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getUncachableStripeClient } from "../stripeClient";
import { printify } from "../lib/printify";
import { tapstitch } from "../lib/tapstitch";
import { submitOrderToPrintify } from "./checkout";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ---------- sign-in ----------
// The dashboard password is stored only as a SHA-256 hash. Setting ADMIN_SECRET on the
// server replaces it (and signs everyone out).
const BUILT_IN_HASH = "4e1a780336f4a7331d9b9c9b79c8407d7b2bf3ddeb895ea667707c6b4e7b3933";
const COOKIE = "ww_admin";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const passHash = () => (process.env.ADMIN_SECRET ? sha(process.env.ADMIN_SECRET) : BUILT_IN_HASH);
const token = () => createHmac("sha256", passHash()).update("ww-admin-v1").digest("hex");
const same = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
function isAdmin(req: Request): boolean {
  const c = (req.headers.cookie ?? "").split(/;\s*/).find((p) => p.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  return !!c && same(c, token());
}

router.post("/admin/login", async (req, res) => {
  const given = String(req.body?.password ?? "");
  if (!given || !same(sha(given), passHash())) {
    await new Promise((r) => setTimeout(r, 600));
    res.status(401).json({ error: "Wrong password" });
    return;
  }
  res.setHeader("Set-Cookie", `${COOKIE}=${token()}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Strict`);
  res.json({ ok: true });
});
router.delete("/admin/login", (_req, res) => {
  res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`);
  res.json({ ok: true });
});

// ---------- visit counting (no cookies, no personal data: a random id kept in the browser) ----------
let tableReady: Promise<void> | null = null;
function ensureTable() {
  tableReady ??= pool
    .query(`CREATE TABLE IF NOT EXISTS ww_visits (
      id bigserial PRIMARY KEY, vid text NOT NULL, path text NOT NULL, source text, event text NOT NULL DEFAULT 'view',
      created timestamptz NOT NULL DEFAULT now());
      CREATE INDEX IF NOT EXISTS ww_visits_created ON ww_visits (created);`)
    .then(() => pool.query(`DELETE FROM ww_visits WHERE created < now() - interval '120 days'`))
    .then(() => undefined)
    .catch((err: unknown) => { tableReady = null; throw err; });
  return tableReady;
}

function sourceOf(ref: string, utm: string): string {
  if (utm) return utm.toLowerCase().slice(0, 40);
  if (!ref) return "direct";
  try {
    const h = new URL(ref).hostname.replace(/^www\.|^m\.|^l\./, "");
    if (h.includes("waterwaywellness")) return "";
    if (/instagram/.test(h)) return "instagram";
    if (/facebook|fb\./.test(h)) return "facebook";
    if (/tiktok/.test(h)) return "tiktok";
    if (/google/.test(h)) return "google";
    if (/t\.co$|twitter|x\.com/.test(h)) return "x / twitter";
    return h.slice(0, 40);
  } catch { return "direct"; }
}

router.post("/track", async (req, res) => {
  res.status(204).end();
  try {
    const { vid, path, ref, utm, event } = req.body ?? {};
    if (typeof vid !== "string" || typeof path !== "string" || vid.length > 40) return;
    if (/bot|crawl|spider|preview/i.test(req.headers["user-agent"] ?? "")) return;
    await ensureTable();
    const src = sourceOf(String(ref ?? ""), String(utm ?? "")) || null;
    await pool.query(`INSERT INTO ww_visits (vid, path, source, event) VALUES ($1,$2,$3,$4)`, [
      vid, path.slice(0, 120), src, event === "buy" ? "buy" : "view",
    ]);
  } catch (err) { logger.warn({ err }, "track failed"); }
});

router.get("/admin/live", async (req, res) => {
  if (!isAdmin(req)) { res.status(401).end(); return; }
  try {
    await ensureTable();
    const now = await pool.query(`SELECT count(DISTINCT vid)::int n FROM ww_visits WHERE created > now() - interval '5 minutes'`);
    const pages = await pool.query(`SELECT path name, count(DISTINCT vid)::int count FROM (SELECT DISTINCT ON (vid) vid, path FROM ww_visits WHERE created > now() - interval '5 minutes' ORDER BY vid, created DESC) t GROUP BY path ORDER BY 2 DESC LIMIT 4`);
    res.json({ now: now.rows[0].n, pages: pages.rows });
  } catch (err: any) { res.json({ now: null, pages: [], error: err.message }); }
});

// ---------- the summary ----------
const DAY = 86400;
type Top = { name: string; count: number }[];

async function visitStats() {
  await ensureTable();
  const win = async (days: number) => {
    const r = await pool.query(
      `SELECT count(DISTINCT vid)::int visitors, count(*) FILTER (WHERE event='view')::int views, count(*) FILTER (WHERE event='buy')::int buys
       FROM ww_visits WHERE created > now() - make_interval(days => $1)`, [days]);
    const top = async (col: string) =>
      (await pool.query(`SELECT ${col} name, count(DISTINCT vid)::int count FROM ww_visits WHERE created > now() - make_interval(days => $1) AND event='view' AND ${col} IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 8`, [days])).rows as Top;
    return { days, visitors: r.rows[0].visitors, pageViews: r.rows[0].views, buyTaps: r.rows[0].buys, sources: await top("source"), pages: await top("path") };
  };
  const [today, d7, d30] = await Promise.all([win(1), win(7), win(30)]);
  const daily = (await pool.query(
    `SELECT to_char(date_trunc('day', created AT TIME ZONE 'America/New_York'), 'YYYY-MM-DD') day, count(DISTINCT vid)::int visitors
     FROM ww_visits WHERE created > now() - interval '60 days' GROUP BY 1`)).rows as { day: string; visitors: number }[];
  return { today, d7, d30, daily };
}

async function salesStats() {
  const stripe = await getUncachableStripeClient();
  const since = Math.floor(Date.now() / 1000) - 60 * DAY;
  const yearStart = Math.floor(new Date(new Date().getFullYear(), 0, 1).getTime() / 1000);
  const sessions: any[] = [];
  for await (const s of stripe.checkout.sessions.list({ created: { gte: Math.min(since, yearStart) }, limit: 100, expand: ["data.line_items"] } as any)) {
    sessions.push(s);
    if (sessions.length >= 3000) break;
  }
  const now = Math.floor(Date.now() / 1000);
  const win = (days: number) => {
    const ss = sessions.filter((s) => s.created >= now - days * DAY);
    const paid = ss.filter((s) => s.payment_status === "paid" || s.payment_status === "no_payment_required");
    const expired = ss.filter((s) => s.status === "expired").length;
    const open = ss.filter((s) => s.status === "open").length;
    return {
      days, started: ss.length, paid: paid.length, abandoned: expired, open,
      conversion: ss.length ? paid.length / ss.length : null,
      revenue: paid.reduce((t, s) => t + (s.amount_total ?? 0), 0),
      tax: paid.reduce((t, s) => t + (s.total_details?.amount_tax ?? 0), 0),
    };
  };
  const paidAll = sessions.filter((s) => s.payment_status === "paid");
  const stateOf = (s: any) => s.collected_information?.shipping_details?.address?.state ?? s.shipping_details?.address?.state ?? s.customer_details?.address?.state ?? null;

  // by month this year, for sales-tax filing
  const months = new Map<string, any>();
  for (const s of paidAll.filter((s) => s.created >= yearStart)) {
    const m = new Date(s.created * 1000).toISOString().slice(0, 7);
    const row = months.get(m) ?? { month: m, orders: 0, flOrders: 0, gross: 0, flTaxable: 0, flTax: 0, outOfState: 0 };
    const fl = stateOf(s) === "FL";
    row.orders++; row.gross += s.amount_total ?? 0;
    if (fl) { row.flOrders++; row.flTaxable += (s.amount_total ?? 0) - (s.total_details?.amount_tax ?? 0); row.flTax += s.total_details?.amount_tax ?? 0; }
    else row.outOfState += s.amount_total ?? 0;
    months.set(m, row);
  }

  // orders (last 30 days) joined with fulfillment
  const recent = paidAll.filter((s) => s.created >= now - 30 * DAY).slice(0, 60);
  const orders = await Promise.all(recent.map(async (s) => {
    let row: any = null;
    try { [row] = await db.select().from(ordersTable).where(eq(ordersTable.stripeSessionId, s.id)); } catch { /* db optional */ }
    const items: { product_id: string }[] = (row?.items as any[]) ?? [];
    const hasPrintify = items.some((i) => !i.product_id.startsWith("ts_"));
    const hasTapstitch = items.some((i) => i.product_id.startsWith("ts_"));
    let printifyStatus: string | null = null;
    let shipments: { carrier: string; number: string; url: string; delivered: boolean }[] = [];
    if (row?.printifyOrderId) {
      try {
        const o = await printify.getOrder(row.printifyOrderId);
        printifyStatus = o.status ?? null;
        shipments = (o.shipments ?? []).map((x: any) => ({ carrier: x.carrier, number: x.number, url: x.url, delivered: !!x.delivered_at }));
      } catch { /* show without status */ }
    }
    const tags = String(row?.status ?? "").split(",");
    return {
      sessionId: s.id, created: s.created,
      name: s.customer_details?.name ?? null, email: s.customer_details?.email ?? null, state: stateOf(s),
      amountTotal: s.amount_total ?? 0, test: !s.livemode,
      items: (s.line_items?.data ?? []).map((l: any) => `${l.quantity}× ${l.description}`).join(", "),
      hasPrintify, hasTapstitch,
      printifyOrderId: row?.printifyOrderId ?? null, printifyStatus, shipments,
      tapstitchEmailed: tags.includes("tapstitch_emailed"),
      known: !!row,
    };
  }));

  const dailyRevenue = new Map<string, number>();
  for (const s of paidAll) {
    const d = new Date(s.created * 1000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    dailyRevenue.set(d, (dailyRevenue.get(d) ?? 0) + (s.amount_total ?? 0));
  }
  return { sales: { today: win(1), d7: win(7), d30: win(30) }, months: [...months.values()].sort((a, b) => b.month.localeCompare(a.month)), orders, dailyRevenue };
}

async function productStats() {
  const list = await printify.listProducts().catch(() => [] as any[]);
  const pf = list.map((p: any) => ({
    id: p.id, title: p.title, source: "Printify",
    variants: p.variants.filter((v: any) => v.is_enabled).map((v: any) => ({ title: v.title, price: v.price, cost: v.cost })),
  }));
  const ts = tapstitch.listProducts().map((p) => ({
    id: p.id, title: p.title, source: "Tapstitch",
    variants: [{ title: p.options[0].values.map((v) => v.title).join(", "), price: p.variants[0].price, cost: p.variants[0].cost }],
  }));
  return [...pf, ...ts];
}

router.get("/admin/summary", async (req, res) => {
  if (!isAdmin(req)) { res.status(401).json({ error: "Sign in" }); return; }
  const [v, s, p] = await Promise.allSettled([visitStats(), salesStats(), productStats()]);
  const visits = v.status === "fulfilled" ? v.value : null;
  const sales = s.status === "fulfilled" ? s.value : null;

  // last 60 days, oldest first
  const days: { day: string; visitors: number; revenue: number }[] = [];
  for (let i = 59; i >= 0; i--) {
    const d = new Date(Date.now() - i * DAY * 1000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    days.push({ day: d, visitors: visits?.daily.find((x) => x.day === d)?.visitors ?? 0, revenue: sales?.dailyRevenue.get(d) ?? 0 });
  }
  res.json({
    generatedAt: Math.floor(Date.now() / 1000),
    visits: visits && { today: visits.today, d7: visits.d7, d30: visits.d30 },
    visitsError: v.status === "rejected" ? String(v.reason?.message ?? v.reason) : undefined,
    sales: sales?.sales, months: sales?.months, orders: sales?.orders,
    salesError: s.status === "rejected" ? String(s.reason?.message ?? s.reason) : undefined,
    products: p.status === "fulfilled" ? p.value : [],
    daily: days,
  });
});

router.post("/admin/retry", async (req, res) => {
  if (!isAdmin(req)) { res.status(401).end(); return; }
  try {
    await submitOrderToPrintify(String(req.body?.sessionId ?? ""));
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
