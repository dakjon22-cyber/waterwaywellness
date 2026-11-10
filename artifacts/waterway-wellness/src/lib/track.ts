// Tiny visit counter for the /admin dashboard: a random id in localStorage, no cookies.
function vid(): string {
  try {
    let v = localStorage.getItem("ww_vid");
    if (!v) { v = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem("ww_vid", v); }
    return v;
  } catch { return "anon"; }
}

let firstRef: string | null = document.referrer;

export function track(path: string, event: "view" | "buy" = "view") {
  if (path.startsWith("/admin")) return;
  try { if (localStorage.getItem("ww_admin_seen")) return; } catch { /* fine */ }
  const utm = new URLSearchParams(location.search).get("utm_source") ?? "";
  const body = JSON.stringify({ vid: vid(), path, ref: event === "view" ? firstRef ?? "" : "", utm, event });
  firstRef = null;
  try {
    if (!navigator.sendBeacon?.("/api/track", new Blob([body], { type: "application/json" }))) {
      void fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true });
    }
  } catch { /* never break the site */ }
}

// count taps on any Buy / Checkout button
document.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement | null)?.closest("button, a");
  if (b && /buy now|checkout/i.test(b.textContent ?? "")) track(location.pathname, "buy");
}, true);
