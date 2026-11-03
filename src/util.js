// Funcoes de apoio (limpeza de texto, telefone, datas)

export function digits(s) {
  return String(s ?? "").replace(/\D/g, "");
}

// Padroniza telefone brasileiro. A Meta as vezes envia numeros de celular antigos
// sem o 9 (55 + DDD + 8 digitos). Adicionamos o 9 para ter sempre uma chave unica.
export function normalizePhone(raw) {
  let d = digits(raw);
  if (d.startsWith("55") && d.length === 12 && /[6-9]/.test(d[4])) {
    d = d.slice(0, 4) + "9" + d.slice(4);
  }
  return d;
}

// Remove caracteres de controle, apara espacos e limita o tamanho
export function cleanText(s, max = 1000) {
  return String(s ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .trim()
    .slice(0, max);
}

// Palavra-chave em minusculo e sem acento (para comparar "Menu", "MENU", "menú")
export function keyword(s) {
  return cleanText(s, 100)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export const PROTOCOLO_RE = /^EMPIS-\d{4}-\d{5}$/;

export function parseProtocolo(s) {
  const p = cleanText(s, 40).toUpperCase();
  return PROTOCOLO_RE.test(p) ? p : null;
}

export function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function primeiroNome(nome) {
  return String(nome ?? "").trim().split(/\s+/)[0] || "";
}
