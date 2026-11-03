// ADAPTER: WhatsApp Cloud API oficial da Meta. Reaproveita src/whatsapp.js sem alterar o comportamento.
import { createWa, verifySignature, parseWebhook } from "../whatsapp.js";
import { normalizarMensagem, normalizarEco } from "./port.js";

export const metaProvider = {
  name: "meta",
  required: ["WHATSAPP_TOKEN", "PHONE_NUMBER_ID", "APP_SECRET", "VERIFY_TOKEN"],

  // Verificacao inicial feita pela Meta ao cadastrar o webhook
  handleGet(url, env) {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === env.VERIFY_TOKEN && challenge) return new Response(challenge, { status: 200 });
    return new Response("Token inválido", { status: 403 });
  },

  authenticate: (request, rawBody, env) =>
    verifySignature(rawBody, request.headers.get("x-hub-signature-256"), env.APP_SECRET),

  parse(payload) {
    const { messages, echoes } = parseWebhook(payload);
    return {
      messages: messages.map(normalizarMensagem).filter(Boolean),
      echoes: echoes.map(normalizarEco).filter(Boolean),
    };
  },

  createWa,
};
