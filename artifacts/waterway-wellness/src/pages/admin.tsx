import { useCallback, useEffect, useState } from "react";

type Win = { days: number; started: number; paid: number; abandoned: number; open: number; conversion: number | null; revenue: number; tax: number };
type Top = { name: string; count: number }[];
type VWin = { days: number; visitors: number; pageViews: number; buyTaps: number; sources: Top; pages: Top };
type Month = { month: string; orders: number; flOrders: number; gross: number; flTaxable: number; flTax: number; outOfState: number };
type Order = {
  sessionId: string; created: number; name: string | null; email: string | null; state: string | null; amountTotal: number; test: boolean; items: string;
  hasPrintify: boolean; hasTapstitch: boolean; printifyOrderId: string | null; printifyStatus: string | null;
  shipments: { carrier: string; number: string; url: string; delivered: boolean }[]; tapstitchEmailed: boolean; known: boolean;
};
type Product = { id: string; title: string; source: string; variants: { title: string; price: number; cost: number }[] };
type Day = { day: string; visitors: number; revenue: number };
type Summary = {
  generatedAt: number; visits: { today: VWin; d7: VWin; d30: VWin } | null; visitsError?: string;
  sales?: { today: Win; d7: Win; d30: Win }; months?: Month[]; orders?: Order[]; salesError?: string; products: Product[]; daily: Day[];
};
type Range = 1 | 7 | 30;
type Tab = "overview" | "sales" | "visitors" | "tax" | "products" | "links";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" }, { id: "sales", label: "Sales" }, { id: "visitors", label: "Visitors" },
  { id: "tax", label: "Tax" }, { id: "products", label: "Products" }, { id: "links", label: "Links" },
];
const RANGES: { days: Range; label: string; long: string }[] = [
  { days: 1, label: "Today", long: "today" }, { days: 7, label: "7 days", long: "the last 7 days" }, { days: 30, label: "30 days", long: "the last 30 days" },
];
const pick = <T,>(w: { today: T; d7: T; d30: T }, r: Range) => (r === 1 ? w.today : r === 7 ? w.d7 : w.d30);
const usd = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const pct = (x: number | null) => (x == null ? "—" : `${Math.round(x * 100)}%`);
const pageName = (p: string) => (p === "/" ? "home" : p);
const monthName = (m: string) => new Date(`${m}-15`).toLocaleDateString("en-US", { month: "long", year: "numeric" });
const STAGE: Record<string, string> = {
  pending: "Received", "on-hold": "On hold — check Printify", "sending-to-production": "Sending to print", "in-production": "Being made",
  fulfilled: "Shipped", "partially-fulfilled": "Partly shipped", canceled: "Canceled", "payment-not-received": "Printify payment failed",
  "callback-received": "Received", "has-issues": "Has an issue — check Printify",
};
const LINKS = [
  { label: "Payments & payouts", sub: "Stripe", href: "https://dashboard.stripe.com/payments" },
  { label: "Printing & shipping", sub: "Printify orders", href: "https://printify.com/app/orders" },
  { label: "Tapstitch orders", sub: "Place emailed orders here", href: "https://www.tapstitch.com" },
  { label: "Order emails", sub: "waterwaywellnessco@gmail.com", href: "https://mail.google.com" },
  { label: "Florida sales tax", sub: "File the DR-15", href: "https://floridarevenue.com/taxes/eservices/Pages/default.aspx" },
  { label: "The live site", sub: "waterwaywellness.co", href: "https://waterwaywellness.co" },
];

const card = "rounded-2xl border border-white/10 bg-white/[0.04] p-4";
const tag = "text-[11px] uppercase tracking-[0.18em] text-emerald-300/80 mb-2";
const mute = "text-white/50";
const btn = "rounded-full bg-emerald-400 text-black font-semibold px-4 min-h-[40px] disabled:opacity-50";

function Stats({ rows }: { rows: [React.ReactNode, React.ReactNode][] }) {
  return (
    <dl className="divide-y divide-white/10">
      {rows.map(([k, v], i) => <div key={i} className="flex justify-between gap-4 py-2 text-sm"><dt className="text-white/70">{k}</dt><dd className="text-right font-medium">{v}</dd></div>)}
    </dl>
  );
}
function TopList({ title, list }: { title: string; list: Top }) {
  return (
    <div className={card}>
      <p className={tag}>{title}</p>
      {list.length === 0 ? <p className={`${mute} text-sm`}>Nothing yet</p> : <Stats rows={list.map((r) => [pageName(r.name), r.count])} />}
    </div>
  );
}
function Delta({ now, before, ok, extra }: { now: number; before: number; ok: boolean; extra?: string }) {
  if (!ok || before === 0) return <small className={mute}>{extra ?? (ok && now > 0 ? "new" : "")}</small>;
  const ch = (now - before) / before;
  return <small className={mute}>{extra ? `${extra} · ` : ""}<span className={ch >= 0 ? "text-emerald-300" : "text-rose-300"}>{ch >= 0 ? "▲" : "▼"} {Math.abs(Math.round(ch * 100))}%</span></small>;
}
function Bars({ days, k, money }: { days: Day[]; k: "visitors" | "revenue"; money?: boolean }) {
  const max = Math.max(1, ...days.map((d) => d[k]));
  return (
    <div className="flex items-end gap-[3px] h-28">
      {days.map((d) => (
        <div key={d.day} className="flex-1 h-full flex items-end" title={`${d.day}: ${money ? usd(d[k]) : d[k]}`}>
          <div className={`w-full rounded-t ${k === "revenue" ? "bg-sky-300/80" : "bg-emerald-400/80"}`} style={{ height: `${Math.max(d[k] ? 4 : 1, (d[k] / max) * 100)}%` }} />
        </div>
      ))}
    </div>
  );
}

function stageOf(o: Order) {
  const bits: { text: string; bad: boolean }[] = [];
  if (o.hasPrintify) {
    if (o.shipments.some((s) => s.delivered)) bits.push({ text: "Printify: Delivered", bad: false });
    else if (o.printifyStatus) bits.push({ text: `Printify: ${STAGE[o.printifyStatus] ?? o.printifyStatus}`, bad: /hold|issue|not-received|canceled/.test(o.printifyStatus) });
    else if (o.printifyOrderId) bits.push({ text: "Printify: Sent", bad: false });
    else bits.push({ text: "Printify: Not sent", bad: true });
  }
  if (o.hasTapstitch) bits.push(o.tapstitchEmailed ? { text: "Tapstitch: emailed — place it by hand", bad: false } : { text: "Tapstitch: email not sent", bad: true });
  if (!o.known) bits.push({ text: "Not in the order list", bad: true });
  return bits;
}

export default function Admin() {
  const [data, setData] = useState<Summary | null>(null);
  const [state, setState] = useState<"loading" | "login" | "ready">("loading");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [range, setRangeS] = useState<Range>(7);
  const [tab, setTabS] = useState<Tab>("overview");
  const [live, setLive] = useState<{ now: number | null; pages: Top; error?: string } | null>(null);
  const setTab = (t: Tab) => { setTabS(t); try { localStorage.setItem("ww_admin_tab", t); } catch { /* fine */ } };
  const setRange = (r: Range) => { setRangeS(r); try { localStorage.setItem("ww_admin_range", String(r)); } catch { /* fine */ } };

  useEffect(() => {
    document.title = "Waterway — Dashboard";
    try {
      localStorage.setItem("ww_admin_seen", "1"); // don't count the team's own visits
      const r = Number(localStorage.getItem("ww_admin_range")); if (r === 1 || r === 7 || r === 30) setRangeS(r);
      const t = localStorage.getItem("ww_admin_tab"); if (TABS.some((x) => x.id === t)) setTabS(t as Tab);
    } catch { /* fine */ }
  }, []);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/summary", { cache: "no-store" });
    if (res.status === 401) return setState("login");
    if (!res.ok) { setMsg(`Couldn't load (${res.status}). The server may be waking up — try Refresh in a minute.`); return setState("ready"); }
    const d = (await res.json()) as Summary;
    setData(d); setStale(false); setState("ready");
    try { localStorage.setItem("ww_admin_cache", JSON.stringify(d)); } catch { /* fine */ }
  }, []);
  useEffect(() => {
    try { const c = localStorage.getItem("ww_admin_cache"); if (c) { setData(JSON.parse(c)); setStale(true); setState("ready"); } } catch { /* fine */ }
    void load();
  }, [load]);

  useEffect(() => {
    if (state !== "ready") return;
    let stop = false;
    const tick = async () => { try { const r = await fetch("/api/admin/live", { cache: "no-store" }); if (r.ok && !stop) setLive(await r.json()); } catch { /* next */ } };
    void tick();
    const id = setInterval(tick, 20_000);
    return () => { stop = true; clearInterval(id); };
  }, [state]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    const res = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pw }) });
    if (!res.ok) return setMsg("That password didn't work.");
    setPw(""); setState("loading"); await load();
  }
  async function signOut() {
    await fetch("/api/admin/login", { method: "DELETE" });
    try { localStorage.removeItem("ww_admin_cache"); } catch { /* fine */ }
    setData(null); setState("login");
  }
  async function retry(sessionId: string) {
    setBusy(sessionId);
    const r = await fetch("/api/admin/retry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId }) });
    setMsg(r.ok ? "Sent again. Refreshing…" : `Retry failed: ${(await r.json().catch(() => ({}))).error ?? r.status}`);
    setBusy(null); await load();
  }

  const shell = "min-h-screen bg-[#0b1410] text-white px-4 sm:px-8 py-8 max-w-5xl mx-auto";
  if (state === "login") {
    return (
      <main className={shell}>
        <p className={tag}>Waterway Wellness</p>
        <h1 className="text-3xl font-bold mb-2">Sign in</h1>
        <p className={`${mute} mb-6`}>You'll only need to do this once on this device.</p>
        <form onSubmit={signIn} className="flex gap-2 max-w-md">
          <input type="password" autoComplete="current-password" placeholder="Dashboard password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus
            className="flex-1 rounded-full bg-white/10 border border-white/15 px-4 min-h-[44px] outline-none focus:border-emerald-400" />
          <button className={btn} disabled={!pw}>Sign in</button>
        </form>
        {msg && <p className="text-rose-300 mt-4">{msg}</p>}
      </main>
    );
  }
  if (state === "loading" || !data) return <main className={shell}><p className={mute}>Loading… (the server can take up to a minute to wake up)</p></main>;

  const R = RANGES.find((x) => x.days === range)!;
  const sales = data.sales ? pick(data.sales, range) : null;
  const visits = data.visits ? pick(data.visits, range) : null;
  const since = Math.floor(Date.now() / 1000) - range * 86400;
  const orders = (data.orders ?? []).filter((o) => o.created >= since);
  const daily = data.daily ?? [];
  const canCompare = range < 30;
  const sum = (k: "visitors" | "revenue", back: number) => daily.slice(daily.length - range - back, daily.length - back).reduce((t, d) => t + d[k], 0);
  const chartDays = range === 30 ? daily.slice(-30) : daily.slice(-14);
  const needsAttention = (data.orders ?? []).filter((o) => stageOf(o).some((b) => b.bad));

  return (
    <main className={shell}>
      <header className="flex items-start justify-between gap-4 mb-6">
        <div>
          <p className={tag}>Waterway Wellness</p>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className={`${mute} text-sm`}>Updated {new Date(data.generatedAt * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}{stale ? " · refreshing…" : ""}</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="rounded-full border border-white/20 px-4 min-h-[40px]" onClick={() => { setStale(true); void load(); }}>Refresh</button>
          <button className="text-sm underline text-white/60" onClick={signOut}>Sign out</button>
        </div>
      </header>
      {msg && <p className="mb-4 rounded-xl bg-white/10 p-3 text-sm">{msg}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="inline-flex rounded-full bg-white/10 p-1" role="tablist">
          {RANGES.map((r) => (
            <button key={r.days} role="tab" aria-selected={range === r.days} onClick={() => setRange(r.days)}
              className={`rounded-full px-4 py-1.5 text-sm ${range === r.days ? "bg-white text-black font-semibold" : "text-white/70"}`}>{r.label}</button>
          ))}
        </div>
        <div className="text-sm flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          {live?.error ? <span className="text-rose-300">live count unavailable</span> : <><b>{live?.now ?? "…"}</b> on the site right now
            {live && live.pages.length > 0 && <span className={mute}> · {live.pages.map((p) => `${pageName(p.name)} ${p.count}`).join(", ")}</span>}</>}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        {[
          { label: "Visitors", value: visits ? visits.visitors.toLocaleString() : "—", go: "visitors" as Tab, d: <Delta now={sum("visitors", 0)} before={sum("visitors", range)} ok={canCompare && !!visits} /> },
          { label: "Sales", value: sales ? usd(sales.revenue) : "—", go: "sales" as Tab, d: <Delta now={sum("revenue", 0)} before={sum("revenue", range)} ok={canCompare && !!sales} extra={sales ? `${sales.paid} order${sales.paid === 1 ? "" : "s"}` : undefined} /> },
          { label: "Reached checkout", value: sales ? String(sales.started) : "—", go: "sales" as Tab, d: <small className={mute}>{sales ? `${pct(sales.conversion)} paid` : ""}</small> },
          { label: "Tapped Buy", value: visits ? String(visits.buyTaps) : "—", go: "visitors" as Tab, d: <small className={mute}>{visits && visits.visitors ? `${Math.round((visits.buyTaps / visits.visitors) * 100)}% of visitors` : ""}</small> },
        ].map((t) => (
          <button key={t.label} onClick={() => setTab(t.go)} className={`${card} text-left flex flex-col gap-1 hover:border-emerald-400/50`}>
            <span className="text-xs text-white/60">{t.label}</span><b className="text-2xl">{t.value}</b>{t.d}
          </button>
        ))}
      </div>
      {(data.salesError || data.visitsError) && <p className="text-rose-300 text-sm mb-3">{[data.salesError && `Stripe: ${data.salesError}`, data.visitsError && `Visits: ${data.visitsError}`].filter(Boolean).join(" · ")}</p>}

      <nav className="flex gap-1 overflow-x-auto border-b border-white/10 mb-5" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${tab === t.id ? "border-emerald-400 text-white font-semibold" : "border-transparent text-white/60"}`}>
            {t.label}{t.id === "sales" && needsAttention.length > 0 && <i className="not-italic ml-1.5 rounded-full bg-rose-500 px-1.5 text-[11px]">{needsAttention.length}</i>}
          </button>
        ))}
      </nav>

      {tab === "overview" && (
        <section className="grid gap-3 md:grid-cols-2">
          {needsAttention.length > 0 && (
            <button onClick={() => setTab("sales")} className={`${card} md:col-span-2 text-left border-rose-400/40`}>
              <p className={tag}>Needs attention</p>
              <p>{needsAttention.length} order{needsAttention.length === 1 ? "" : "s"} need a look (not sent, on hold, or Tapstitch to place). Open Sales →</p>
            </button>
          )}
          <div className={card}><p className={tag}>Visitors per day</p><Bars days={chartDays} k="visitors" /></div>
          <div className={card}><p className={tag}>Sales per day</p><Bars days={chartDays} k="revenue" money /></div>
          <div className={`${card} md:col-span-2`}>
            <p className={tag}>How people got to a sale · {R.long}</p>
            <Stats rows={[
              ["Visited the site", visits?.visitors ?? "—"],
              ["Tapped Buy / Checkout", visits?.buyTaps ?? "—"],
              ["Reached the Stripe checkout", sales?.started ?? "—"],
              ["Paid", sales?.paid ?? "—"],
              ["Top source", visits?.sources[0] ? `${visits.sources[0].name} (${visits.sources[0].count})` : "—"],
            ]} />
          </div>
        </section>
      )}

      {tab === "sales" && (
        <section className="space-y-4">
          {sales && (
            <div className={card}>
              <p className="text-3xl font-bold mb-2">{usd(sales.revenue)} <small className={`${mute} text-base font-normal`}>{R.long}</small></p>
              <Stats rows={[
                ["Paid orders", sales.paid], ["Tapped Buy", visits?.buyTaps ?? "—"], ["Reached checkout", sales.started],
                ["Checkout → paid", pct(sales.conversion)], ["Left without paying", `${sales.abandoned}${sales.open ? ` (+${sales.open} still open)` : ""}`],
                ["Sales tax collected", usd(sales.tax)],
              ]} />
            </div>
          )}
          <h2 className="text-xl font-semibold">Orders · {R.long}</h2>
          {orders.length === 0 ? <p className={mute}>No orders {R.long}.</p> : (
            <div className="grid gap-3 md:grid-cols-2">
              {orders.map((o) => {
                const bits = stageOf(o);
                return (
                  <div key={o.sessionId} className={card}>
                    <div className="flex justify-between gap-3"><b>{o.name ?? o.email ?? "—"}</b><b>{usd(o.amountTotal)}</b></div>
                    <p className={`${mute} text-sm`}>{new Date(o.created * 1000).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}{o.state ? ` · ${o.state}` : ""}{o.email && o.name ? ` · ${o.email}` : ""}
                      {o.test && <span className="ml-2 rounded bg-amber-400 text-black px-1.5 text-[11px] font-bold">TEST</span>}</p>
                    <p className="text-sm my-2">{o.items}</p>
                    {bits.map((b) => <p key={b.text} className={`text-sm ${b.bad ? "text-rose-300" : "text-emerald-300"}`}>{b.text}</p>)}
                    {o.shipments.map((s) => <p key={s.number} className="text-sm">{s.carrier} <a className="underline" href={s.url} target="_blank" rel="noopener">{s.number}</a></p>)}
                    {o.known && ((o.hasPrintify && !o.printifyOrderId) || (o.hasTapstitch && !o.tapstitchEmailed)) && (
                      <button className={`${btn} mt-3`} disabled={busy === o.sessionId} onClick={() => retry(o.sessionId)}>{busy === o.sessionId ? "Sending…" : "Retry"}</button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <p className={`${mute} text-sm`}>"Reached checkout" = someone pressed Buy and landed on the Stripe payment page. Printify items go to Printify automatically; Tapstitch items are emailed to waterwaywellnessco@gmail.com to place by hand.</p>
        </section>
      )}

      {tab === "visitors" && (
        <section className="grid gap-3 md:grid-cols-2">
          {!visits ? <p className={mute}>Visit counting isn't working yet{data.visitsError ? `: ${data.visitsError}` : "."}</p> : (<>
            <div className={card}><p className={tag}>Traffic · {R.long}</p><Stats rows={[["Visitors", visits.visitors], ["Page views", visits.pageViews], ["Tapped Buy / Checkout", visits.buyTaps]]} /></div>
            <TopList title={`Where they came from · ${R.long}`} list={visits.sources} />
            <TopList title={`Top pages · ${R.long}`} list={visits.pages} />
          </>)}
          <p className={`${mute} text-sm md:col-span-2`}>Counting started when this dashboard went live, so earlier days show zero. Visits from a device that has opened this dashboard aren't counted.</p>
        </section>
      )}

      {tab === "tax" && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Sales by month</h2>
          <p className={`${mute} text-sm`}>Website orders this year, split by Florida vs out of state. Use these for the Florida DR-15.</p>
          {!data.months?.length ? <p className={mute}>No paid orders yet this year.</p> : (
            <div className="grid gap-3 md:grid-cols-2">
              {data.months.map((m) => (
                <div key={m.month} className={card}>
                  <p className={tag}>{monthName(m.month)}</p>
                  <Stats rows={[["Gross sales", usd(m.gross)], ["Out of state (exempt)", usd(m.outOfState)], ["Florida taxable", usd(m.flTaxable)], ["Tax collected", usd(m.flTax)], ["Orders", `${m.orders} · ${m.flOrders} in FL`]]} />
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === "products" && (
        <section className="grid gap-3 md:grid-cols-2">
          {data.products.map((p) => (
            <div key={p.id} className={card}>
              <p className={tag}>{p.source}</p>
              <p className="font-semibold mb-2">{p.title}</p>
              <Stats rows={(() => {
                const seen = new Map<string, { price: number; cost: number; n: number }>();
                for (const v of p.variants) { const k = `${v.price}-${v.cost}`; const e = seen.get(k); if (e) e.n++; else seen.set(k, { price: v.price, cost: v.cost, n: 1 }); }
                return [...seen.values()].map((v, i) => [p.source === "Tapstitch" ? p.variants[0].title : `${v.n} variant${v.n === 1 ? "" : "s"}${i === 0 ? "" : ""}`, <span key={i}>{usd(v.price)} <span className={mute}>· cost {usd(v.cost)} · profit {usd(v.price - v.cost)}</span></span>] as [React.ReactNode, React.ReactNode]);
              })()} />
            </div>
          ))}
        </section>
      )}

      {tab === "links" && (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} target="_blank" rel="noopener" className={`${card} hover:border-emerald-400/50`}><b className="block">{l.label}</b><span className={`${mute} text-sm`}>{l.sub} ↗</span></a>
          ))}
        </section>
      )}
    </main>
  );
}
