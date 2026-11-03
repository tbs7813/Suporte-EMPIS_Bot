// PORT: contrato unico entre o bot e qualquer provedor de WhatsApp (Meta oficial, Evolution API...).
// Aqui ficam SOMENTE as regras e a validacao dos dados. Nenhuma chamada de rede.
//
// Formatos que o bot (bot.js) entende:
//   mensagem recebida : { wamid, from, name, type, text }
//   eco (enviada pelo celular do tecnico): { wamid, to, type, text }
//   resultado de envio: { ok: true, wamid } ou { ok: false, error }
//
// Contrato de um provedor (adapter):
//   name           texto
//   required       lista de segredos obrigatorios do provedor
//   handleGet(url, env)                    -> Response   (verificacao inicial do webhook)
//   authenticate(request, rawBody, env)    -> Promise<boolean>
//   parse(payload, env)                    -> { messages, echoes }
//   createWa(env)                          -> { send(to, text) }

export const MAX_TEXTO_ENVIO = 4000;
export const MAX_TEXTO_ENTRADA = 4096;
const TELEFONE_RE = /^\d{8,20}$/;

// ---------- resultados de envio ----------
export const resultadoOk = (wamid = null) => ({ ok: true, wamid: wamid ? String(wamid) : null });
export const resultadoErro = (error) => ({ ok: false, error: String(error ?? "erro desconhecido").slice(0, 300) });

// ---------- saida ----------
// Confere destino e texto ANTES de chamar qualquer API. Devolve { ok, to, text } ou { ok:false, error }.
export function validarEnvio(to, text) {
  const dest = String(to ?? "").replace(/\D/g, "");
  if (!TELEFONE_RE.test(dest)) return { ok: false, error: "destino invalido" };
  if (typeof text !== "string" && typeof text !== "number") return { ok: false, error: "texto invalido" };
  const corpo = String(text).trim().slice(0, MAX_TEXTO_ENVIO);
  if (!corpo) return { ok: false, error: "texto vazio" };
  return { ok: true, to: dest, text: corpo };
}

// ---------- entrada ----------
function textoOuNulo(t) {
  return typeof t === "string" ? t.slice(0, MAX_TEXTO_ENTRADA) : null;
}

// Devolve a mensagem no formato do bot, ou null se os dados forem invalidos.
export function normalizarMensagem(raw) {
  if (!raw || typeof raw !== "object") return null;
  const wamid = typeof raw.wamid === "string" ? raw.wamid.trim() : "";
  const from = String(raw.from ?? "").replace(/\D/g, "");
  if (!wamid || wamid.length > 200 || !TELEFONE_RE.test(from)) return null;
  const type = typeof raw.type === "string" && raw.type ? raw.type.slice(0, 40) : "unknown";
  const text = type === "text" ? (textoOuNulo(raw.text) ?? "") : null;
  const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim().slice(0, 80) : null;
  return { wamid, from, name, type, text };
}

export function normalizarEco(raw) {
  if (!raw || typeof raw !== "object") return null;
  const wamid = typeof raw.wamid === "string" ? raw.wamid.trim() : "";
  const to = String(raw.to ?? "").replace(/\D/g, "");
  if (!wamid || wamid.length > 200 || !TELEFONE_RE.test(to)) return null;
  const type = typeof raw.type === "string" && raw.type ? raw.type.slice(0, 40) : "unknown";
  const text = type === "text" ? (textoOuNulo(raw.text) ?? "") : null;
  return { wamid, to, type, text };
}

// ---------- contrato do provedor ----------
export function validarProvedor(p) {
  const erros = [];
  if (!p || typeof p !== "object") return ["provedor ausente"];
  if (typeof p.name !== "string" || !p.name) erros.push("name");
  if (!Array.isArray(p.required)) erros.push("required");
  for (const fn of ["handleGet", "authenticate", "parse", "createWa"]) {
    if (typeof p[fn] !== "function") erros.push(fn);
  }
  return erros;
}
