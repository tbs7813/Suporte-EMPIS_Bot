// Acesso ao banco (Supabase) pela API REST. Somente o bot usa a chave secreta.

const enc = encodeURIComponent;

export function createDb(env) {
  const base = env.SUPABASE_URL.replace(/\/+$/, "") + "/rest/v1";
  const key = env.SUPABASE_SERVICE_KEY;
  const baseHeaders = { apikey: key, "Content-Type": "application/json" };
  // Chaves antigas (service_role) sao JWT e vao tambem em Authorization. As novas (sb_secret_...) so em apikey.
  if (key.startsWith("eyJ")) baseHeaders.Authorization = `Bearer ${key}`;

  async function rest(path, { method = "GET", body, prefer } = {}) {
    const res = await fetch(base + path, {
      method,
      headers: prefer ? { ...baseHeaders, Prefer: prefer } : baseHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const txt = await res.text();
    if (!res.ok) {
      const e = new Error(`Supabase ${res.status}: ${txt.slice(0, 300)}`);
      e.status = res.status;
      throw e;
    }
    return txt ? JSON.parse(txt) : null;
  }

  const withProf = (r) => {
    if (!r) return null;
    const { professores, ...rest } = r;
    return { ...rest, professor: professores ?? null };
  };
  const SEL = "select=*,professores(nome,telefone)";

  return {
    async getProfessorByPhone(tel) {
      const r = await rest(`/professores?telefone=eq.${enc(tel)}&select=*&limit=1`);
      return r?.[0] ?? null;
    },
    async createProfessor({ telefone, nome }) {
      const r = await rest("/professores?on_conflict=telefone", {
        method: "POST", body: { telefone, nome }, prefer: "resolution=merge-duplicates,return=representation",
      });
      return r[0];
    },
    async getConversation(tel) {
      const r = await rest(`/conversas?telefone=eq.${enc(tel)}&select=*&limit=1`);
      return r?.[0] ?? null;
    },
    async saveConversation(obj) {
      await rest("/conversas?on_conflict=telefone", {
        method: "POST",
        body: { ...obj, atualizado_em: new Date().toISOString() },
        prefer: "resolution=merge-duplicates,return=minimal",
      });
    },
    async getWaId(tel) {
      const r = await rest(`/conversas?telefone=eq.${enc(tel)}&select=wa_id&limit=1`);
      return r?.[0]?.wa_id ?? null;
    },
    async isAdmin(tel) {
      const r = await rest(`/administradores?telefone=eq.${enc(tel)}&ativo=eq.true&select=id&limit=1`);
      return (r?.length ?? 0) > 0;
    },
    async touchAdmin(tel, waId) {
      await rest(`/administradores?telefone=eq.${enc(tel)}`, { method: "PATCH", body: { wa_id: waId }, prefer: "return=minimal" });
    },
    async listAdmins() {
      return (await rest("/administradores?ativo=eq.true&select=telefone,nome,wa_id")) ?? [];
    },
    // Devolve false se a mensagem (wamid) ja existia = duplicada
    async registerMessage(m) {
      if (m.wamid) {
        const r = await rest("/mensagens?on_conflict=wamid", {
          method: "POST", body: m, prefer: "resolution=ignore-duplicates,return=representation",
        });
        return (r?.length ?? 0) > 0;
      }
      await rest("/mensagens", { method: "POST", body: m, prefer: "return=minimal" });
      return true;
    },
    async attachMessage(wamid, { protocolo, chamado_id }) {
      await rest(`/mensagens?wamid=eq.${enc(wamid)}`, { method: "PATCH", body: { protocolo, chamado_id }, prefer: "return=minimal" });
    },
    async createChamado(p) {
      const r = await rest("/rpc/criar_chamado", {
        method: "POST",
        body: {
          p_professor_id: p.professor_id, p_categoria: p.categoria, p_equipamento: p.equipamento ?? null,
          p_descricao: p.descricao, p_local: p.local ?? null, p_urgencia: p.urgencia ?? "nao_impede",
          p_humano: !!p.humano, p_chave: p.chave ?? null,
        },
      });
      return Array.isArray(r) ? r[0] : r;
    },
    async getChamadoByProtocolo(protocolo) {
      const r = await rest(`/chamados?protocolo=eq.${enc(protocolo)}&${SEL}&limit=1`);
      return withProf(r?.[0]);
    },
    async listChamadosPorProfessor(professorId, grupo, limit = 10) {
      const st = grupo === "abertos" ? "aberto,em_atendimento" : "resolvido,cancelado";
      const r = await rest(`/chamados?professor_id=eq.${enc(professorId)}&status=in.(${st})&${SEL}&order=aberto_em.desc&limit=${limit}`);
      return (r ?? []).map(withProf);
    },
    async listChamadosPorStatus(statuses, limit = 15) {
      const r = await rest(`/chamados?status=in.(${statuses.join(",")})&${SEL}&order=aberto_em.asc&limit=${limit}`);
      return (r ?? []).map(withProf);
    },
    async findChamadoHumanoAberto(professorId) {
      const r = await rest(`/chamados?professor_id=eq.${enc(professorId)}&humano=eq.true&status=in.(aberto,em_atendimento)&limit=1`);
      return r?.[0] ?? null;
    },
    async updateChamado(id, fields) {
      const r = await rest(`/chamados?id=eq.${enc(id)}`, { method: "PATCH", body: fields, prefer: "return=representation" });
      return r?.[0] ?? null;
    },
    async addHistorico({ chamado_id, tipo, texto, autor }) {
      await rest("/historico_chamados", { method: "POST", body: { chamado_id, tipo, texto, autor }, prefer: "return=minimal" });
    },
    async getHistorico(chamadoId, limit = 5) {
      const r = await rest(`/historico_chamados?chamado_id=eq.${enc(chamadoId)}&order=criado_em.desc&limit=${limit}`);
      return (r ?? []).reverse();
    },
    async logError(origem, mensagem, detalhe) {
      await rest("/erros", { method: "POST", body: { origem, mensagem: String(mensagem).slice(0, 500), detalhe: detalhe ?? null }, prefer: "return=minimal" });
    },
    async ping() {
      await rest("/administradores?select=id&limit=1");
    },
  };
}
