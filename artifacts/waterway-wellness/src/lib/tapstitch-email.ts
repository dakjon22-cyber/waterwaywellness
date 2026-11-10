// Emails a paid Tapstitch order to waterwaywellnessco@gmail.com via Web3Forms.
// The access key is public by design: it can only send to that inbox.
const WEB3FORMS_KEY = "43619c1d-bca1-4489-ae31-75af7783bda1";

export async function sendTapstitchEmail(sessionId: string): Promise<{ sent: boolean; message?: string }> {
  const r = await fetch(`/api/checkout/tapstitch-email/${encodeURIComponent(sessionId)}`, { cache: "no-store" });
  if (!r.ok) return { sent: false, message: `Couldn't load the order (${r.status})` };
  const { fields } = (await r.json()) as { fields: Record<string, string> | null };
  if (!fields) return { sent: false };
  const { _subject, _template, _captcha, ...rest } = fields;
  void _template; void _captcha;
  const res = await fetch("https://api.web3forms.com/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ access_key: WEB3FORMS_KEY, subject: _subject, from_name: "Waterway Wellness shop", ...rest }),
  });
  const body = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string };
  if (!res.ok || !body.success) return { sent: false, message: body.message ?? `Email service said ${res.status}` };
  await fetch(`/api/checkout/tapstitch-email/${encodeURIComponent(sessionId)}/sent`, { method: "POST" });
  return { sent: true };
}
