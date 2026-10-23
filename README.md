# Painel de Portabilidade ATN

Painel da operação TIM (ATN e DAHA): vendas, entrega, conectadas, portabilidade, retargeting e mailings.

- Página estática servida pelo GitHub Pages.
- Login, base processada e histórico de mailings ficam no Supabase (tabelas `pp_*` e bucket privado `painel-portabilidade`), protegidos por regras de acesso.
- Os relatórios são lidos no navegador de quem faz o upload. Só os campos de análise sobem; nome, CPF, telefone e endereço dos clientes nunca são enviados.
- Mailings e a planilha Rota são gerados na hora, a partir do relatório de vendas escolhido no computador de quem clica.

**Nunca suba os relatórios (vendas, entregas, conectadas, gross) para este repositório.**
