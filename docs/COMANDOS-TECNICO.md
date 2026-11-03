# Manual do técnico — comandos pelo WhatsApp

Os comandos funcionam **somente** para números cadastrados na tabela `administradores` (veja o guia, Parte 2).
Envie os comandos do **seu celular** (o número cadastrado) para o **número do suporte técnico**.
Professores não conseguem usá-los: se um professor digitar `/resolver ...`, o bot trata como texto comum.

| Comando | O que faz |
|---|---|
| `/ajuda` | Lista os comandos. |
| `/chamados` | Chamados pendentes (abertos + em atendimento), os mais antigos primeiro (até 15). |
| `/abertos` | Somente os chamados com status Aberto. |
| `/protocolo EMPIS-2026-00001` | Detalhes: professor, telefone, equipamento, local, urgência, descrição e últimos registros. |
| `/assumir EMPIS-2026-00001` | Muda para "Em atendimento", registra você como responsável e avisa o professor. |
| `/responder EMPIS-2026-00001 Já estou indo` | Envia sua mensagem ao professor e grava no histórico. O bot fica em silêncio nessa conversa. |
| `/resolver EMPIS-2026-00001 Troquei o cabo` | Marca como Resolvido, grava a observação (opcional), avisa o professor e devolve a conversa ao bot. |
| `/retomar EMPIS-2026-00001` | Devolve a conversa ao bot sem encerrar o chamado. |

## Regra das 24 horas (importante)
O WhatsApp só permite enviar texto livre ao professor **até 24 horas depois da última mensagem dele**.
Se passou disso, `/responder`, `/assumir` e `/resolver` gravam a ação no histórico, mas o aviso ao professor **não é entregue**; o bot avisa você disso.
Nesse caso, ligue/escreva pelo app normal do celular, ou peça ao professor que mande qualquer mensagem ao número do suporte.
Mensagens fora da janela exigem *template* aprovado pela Meta e podem ser cobradas (centavos); o bot atual não usa templates, de propósito, para custar R$ 0,00.

## Dicas
- Copie o protocolo da lista (`/chamados`) e cole no comando.
- Pedido de atendimento humano aparece como chamado com 🙋 "pediu técnico".
- Se você já respondeu pelo app do celular (Coexistência), use `/retomar` quando quiser devolver ao bot.
- Os avisos de chamado novo chegam ao seu WhatsApp, mas só se você tiver escrito ao suporte nas últimas 24 h (mesma regra). Mande `/chamados` de manhã para "abrir a janela".
