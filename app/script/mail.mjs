// Reads sign-in codes from the local Supabase mail catcher (Mailpit, or Inbucket on older CLIs).
const MAIL = process.env.LOCAL_MAIL_URL || "http://127.0.0.1:54324";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function json(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

async function newestBody(email) {
  try {
    const s = await json(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}&limit=50`);
    const m = (s.messages || []).slice().sort((a, b) => String(b.Created).localeCompare(String(a.Created)))[0];
    if (m) { const full = await json(`${MAIL}/api/v1/message/${m.ID}`); return { id: m.ID, text: `${full.Text || ""}\n${full.HTML || ""}` }; }
    return null;
  } catch {
    const box = email.split("@")[0];
    const list = await json(`${MAIL}/api/v1/mailbox/${encodeURIComponent(box)}`);
    const m = list[list.length - 1];
    if (!m) return null;
    const full = await json(`${MAIL}/api/v1/mailbox/${encodeURIComponent(box)}/${m.id}`);
    return { id: m.id, text: `${full.body?.text || ""}\n${full.body?.html || ""}` };
  }
}

/** Wait for an email newer than `afterId` and return its 6-digit code. */
export async function latestCode(email, afterId = null, tries = 50) {
  for (let i = 0; i < tries; i++) {
    const b = await newestBody(email).catch(() => null);
    if (b && b.id !== afterId) {
      const m = b.text.match(/\b(\d{6})\b/);
      if (m) return { code: m[1], id: b.id };
    }
    await sleep(200);
  }
  throw new Error(`no code email arrived for ${email}`);
}

export async function lastMailId(email) {
  const b = await newestBody(email).catch(() => null);
  return b?.id ?? null;
}
