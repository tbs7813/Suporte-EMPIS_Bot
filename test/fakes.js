// Banco e WhatsApp "de mentira" (em memoria) usados SOMENTE nos testes automaticos.
export function createFakeDb() {
  const s = { professores: [], administradores: [], conversas: {}, mensagens: [], chamados: [], historico: [], erros: [], cont: {} };
  let seq = 0;
  const id = () => `id-${++seq}`;
  const now = () => new Date().toISOString();
  const comProf = (c) => (c ? { ...c, professor: (({ nome, telefone }) => ({ nome, telefone }))(s.professores.find((p) => p.id === c.professor_id)) } : null);
  return {
    _s: s,
    async getProfessorByPhone(t) { return s.professores.find((p) => p.telefone === t) ?? null; },
    async createProfessor({ telefone, nome }) {
      let p = s.professores.find((x) => x.telefone === telefone);
      if (p) { p.nome = nome; return p; }
      p = { id: id(), telefone, nome, criado_em: now() }; s.professores.push(p); return p;
    },
    async getConversation(t) { return s.conversas[t] ? structuredClone(s.conversas[t]) : null; },
    async saveConversation(o) {
      s.conversas[o.telefone] = { estado: "INICIO", dados: {}, bot_pausado: false, ...(s.conversas[o.telefone] ?? {}), ...structuredClone(o), atualizado_em: now() };
    },
    async getWaId(t) { return s.conversas[t]?.wa_id ?? null; },
    async isAdmin(t) { return s.administradores.some((a) => a.telefone === t && a.ativo); },
    async touchAdmin(t, wa) { const a = s.administradores.find((x) => x.telefone === t); if (a) a.wa_id = wa; },
    async listAdmins() { return s.administradores.filter((a) => a.ativo); },
    async registerMessage(m) {
      if (m.wamid && s.mensagens.some((x) => x.wamid === m.wamid)) return false;
      s.mensagens.push({ id: id(), criado_em: now(), ...m }); return true;
    },
    async attachMessage(wamid, { protocolo, chamado_id }) { const m = s.mensagens.find((x) => x.wamid === wamid); if (m) Object.assign(m, { protocolo, chamado_id }); },
    async createChamado(p) {
      if (p.chave) { const ex = s.chamados.find((c) => c.chave_idempotencia === p.chave); if (ex) return ex; }
      const ano = new Date().getFullYear();
      s.cont[ano] = (s.cont[ano] ?? 0) + 1;
      const c = {
        id: id(), protocolo: `EMPIS-${ano}-${String(s.cont[ano]).padStart(5, "0")}`, professor_id: p.professor_id, categoria: p.categoria,
        equipamento: p.equipamento ?? null, descricao: p.descricao, local: p.local ?? null, urgencia: p.urgencia ?? "nao_impede",
        status: "aberto", humano: !!p.humano, tecnico_telefone: null, chave_idempotencia: p.chave ?? null, aberto_em: now(), concluido_em: null,
      };
      s.chamados.push(c);
      s.historico.push({ chamado_id: c.id, tipo: c.humano ? "atendimento_humano" : "abertura", texto: "aberto", autor: "professor", criado_em: now() });
      return c;
    },
    async getChamadoByProtocolo(p) { return comProf(s.chamados.find((c) => c.protocolo === p)); },
    async listChamadosPorProfessor(pid, grupo) {
      const st = grupo === "abertos" ? ["aberto", "em_atendimento"] : ["resolvido", "cancelado"];
      return s.chamados.filter((c) => c.professor_id === pid && st.includes(c.status)).map(comProf);
    },
    async listChamadosPorStatus(st) { return s.chamados.filter((c) => st.includes(c.status)).map(comProf); },
    async findChamadoHumanoAberto(pid) { return s.chamados.find((c) => c.professor_id === pid && c.humano && ["aberto", "em_atendimento"].includes(c.status)) ?? null; },
    async updateChamado(i, f) { const c = s.chamados.find((x) => x.id === i); Object.assign(c, f); return c; },
    async addHistorico(h) { s.historico.push({ ...h, criado_em: now() }); },
    async getHistorico(i) { return s.historico.filter((h) => h.chamado_id === i); },
    async logError(o, m) { s.erros.push({ o, m }); },
    async ping() {},
  };
}

export function createFakeWa({ falharPara = [] } = {}) {
  const enviadas = [];
  let n = 0;
  return {
    enviadas,
    async send(to, text) {
      if (falharPara.includes(String(to))) return { ok: false, error: "131047 fora da janela de 24h" };
      enviadas.push({ to: String(to), text });
      return { ok: true, wamid: `out-${++n}` };
    },
    ultima(to) { return [...enviadas].reverse().find((e) => e.to === String(to))?.text ?? null; },
  };
}
