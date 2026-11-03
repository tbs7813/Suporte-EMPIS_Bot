// Fabrica de provedores: o segredo WA_PROVIDER escolhe qual adapter o bot usa.
//   WA_PROVIDER=meta       -> WhatsApp Cloud API oficial (padrao se nao for definido)
//   WA_PROVIDER=evolution  -> Evolution API (nao oficial, temporario)
import { validarProvedor, validarEnvio, resultadoErro } from "./port.js";
import { metaProvider } from "./meta.adapter.js";
import { evolutionProvider } from "./evolution.adapter.js";

const PROVEDORES = { meta: metaProvider, evolution: evolutionProvider };

for (const [nome, p] of Object.entries(PROVEDORES)) {
  const erros = validarProvedor(p);
  if (erros.length) throw new Error(`Provedor "${nome}" fora do contrato: ${erros.join(", ")}`);
}

// Lanca erro se WA_PROVIDER tiver um valor desconhecido
export function getProvider(env) {
  const nome = String(env.WA_PROVIDER || "meta").trim().toLowerCase();
  const p = PROVEDORES[nome];
  if (!p) throw new Error(`WA_PROVIDER invalido: "${nome}". Use: ${Object.keys(PROVEDORES).join(" ou ")}.`);
  return p;
}

// Cliente de envio com a validacao do port aplicada a TODA mensagem, em qualquer provedor
export function createWaClient(provider, env) {
  const raw = provider.createWa(env);
  return {
    async send(to, text) {
      const v = validarEnvio(to, text);
      if (!v.ok) return resultadoErro(v.error);
      return raw.send(v.to, v.text);
    },
  };
}
