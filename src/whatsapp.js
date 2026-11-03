// Integracao com a WhatsApp Cloud API oficial da Meta

const enc = new TextEncoder();

function hex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Confere se a mensagem veio mesmo da Meta (assinatura HMAC-SHA256 com o App Secret)
export async function verifySignature(rawBody, header, appSecret) {
  if (!header || !appSecret || !header.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const expected = hex(await crypto.subtle.sign("HMAC", key, enc.encode(rawBody)));
  const received = header.slice(7).toLowerCase();
  if (expected.length !== received.length) return false;
  let diff = 0; // comparacao em tempo constante
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ received.charCodeAt(i);
  return diff === 0;
}

// Extrai mensagens recebidas (e "ecos" de mensagens enviadas pelo app do celular)
export function parseWebhook(payload) {
  const messages = [];
  const echoes = [];
  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const v = change?.value ?? {};
      const names = {};
      for (const c of v.contacts ?? []) names[c.wa_id] = c?.profile?.name ?? null;
      for (const m of v.messages ?? []) {
        messages.push({
          wamid: m.id,
          from: m.from,
          name: names[m.from] ?? null,
          type: m.type,
          text: m.type === "text" ? m?.text?.body ?? "" : null,
        });
      }
      for (const m of v.message_echoes ?? []) {
        echoes.push({ wamid: m.id, to: m.to, type: m.type, text: m.type === "text" ? m?.text?.body ?? "" : null });
      }
    }
  }
  return { messages, echoes };
}

export function createWa(env) {
  const version = env.GRAPH_VERSION || "v23.0";
  return {
    // Envia texto. Nunca lanca erro: devolve { ok, wamid, error }
    async send(to, text) {
      try {
        const res = await fetch(`https://graph.facebook.com/${version}/${env.PHONE_NUMBER_ID}/messages`, {
          method: "POST",
          headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: String(to),
            type: "text",
            text: { body: String(text).slice(0, 4000), preview_url: false },
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return { ok: false, error: `${res.status} ${JSON.stringify(data?.error ?? data).slice(0, 300)}` };
        return { ok: true, wamid: data?.messages?.[0]?.id ?? null };
      } catch (e) {
        return { ok: false, error: String(e?.message ?? e) };
      }
    },
  };
}
