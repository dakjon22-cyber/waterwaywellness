// Emails a paid Tapstitch order to the club inbox. Sent from the browser because
// FormSubmit's bot check blocks requests from our server.
export async function sendTapstitchEmail(sessionId: string): Promise<{ sent: boolean; message?: string }> {
  const r = await fetch(`/api/checkout/tapstitch-email/${encodeURIComponent(sessionId)}`, { cache: "no-store" });
  if (!r.ok) return { sent: false, message: `Couldn't load the order (${r.status})` };
  const { to, fields } = (await r.json()) as { to: string; fields: Record<string, string> | null };
  if (!fields) return { sent: false };
  const res = await fetch(`https://formsubmit.co/ajax/${to}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(fields),
  });
  const body = (await res.json().catch(() => ({}))) as { success?: string | boolean; message?: string };
  if (!res.ok || String(body.success) !== "true") return { sent: false, message: body.message ?? `Email service said ${res.status}` };
  await fetch(`/api/checkout/tapstitch-email/${encodeURIComponent(sessionId)}/sent`, { method: "POST" });
  return { sent: true };
}
