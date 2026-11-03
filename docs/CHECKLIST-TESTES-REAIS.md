# Checklist de testes reais (faça depois de publicar)

Use **dois celulares**: um como professor e outro como técnico (cadastrado em `administradores`).
Marque cada item. Se algo falhar, anote a mensagem recebida e me envie (sem tokens!).

- [ ] 1. Primeiro contato: professor manda "oi" e recebe o menu completo.
- [ ] 2. Cadastro: escolhe 1, o bot pede o nome completo, aceita "Maria da Silva" e recusa "Maria".
- [ ] 3. Abertura de chamado: responde todas as perguntas até a confirmação (1).
- [ ] 4. Protocolo: chega "Seu chamado foi registrado com sucesso" com protocolo `EMPIS-ANO-00001`.
- [ ] 5. Supabase: Table Editor > `chamados` mostra a linha; `professores` mostra o cadastro; `mensagens` mostra as mensagens.
- [ ] 6. Consulta: menu > 8 > 3 > protocolo mostra os detalhes. Teste um protocolo inexistente.
- [ ] 7. Inclusão de informação: menu > 8 > 4 > protocolo > texto. Veja em `historico_chamados`.
- [ ] 8. Resposta do técnico: `/responder PROTOCOLO teste` chega ao professor e aparece em `historico_chamados`.
- [ ] 9. Alteração de status: `/assumir PROTOCOLO` e o professor é avisado.
- [ ] 10. Encerramento: `/resolver PROTOCOLO ok` muda para Resolvido e preenche `concluido_em`.
- [ ] 11. Histórico: menu > 8 > 2 mostra o chamado encerrado em "anteriores".
- [ ] 12. Reinício: faça `npx wrangler deploy` no meio de um chamado e continue respondendo; o bot continua do mesmo ponto.
- [ ] 13. Duplicidade: (automático) a tabela `mensagens` não aceita o mesmo `wamid` duas vezes; confira que nenhuma resposta saiu repetida.
- [ ] 14. Segurança: do celular do professor, envie `/chamados` e `/resolver PROTOCOLO`; nada deve acontecer no chamado.
- [ ] 15. Atendimento humano: professor escolhe 9; bot avisa que pausou; professor escreve algo e o bot não responde; técnico usa `/responder`; professor digita `menu` e o bot volta.
- [ ] 16. Privacidade: um segundo professor tenta consultar o protocolo do primeiro e recebe "Não encontrei".
