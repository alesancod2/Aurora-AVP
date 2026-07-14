# Mapeamento de Endpoints - Auto Vale Prevencoes (aEasy)

**URL Base:** `https://aeasy.autovaleprevencoes.org`  
**Tecnologia:** PHP (Apache/Ubuntu), jQuery, AJAX (jquery.form), Bootstrap  
**Sessao:** PHPSESSID (cookie-based sessions)  
**Banco de Dados:** Provavel MySQL (baseado no padrão PHP)  
**Provider/Backend:** SouthTI (api.southti.com.br)

---

## Informacoes do Sistema (extraidas dos cookies)

### Dados do Usuario Logado
```json
{
  "UsuariosId": "B69B8C45-68C2-FFF9-5FEE-B75E99911451",
  "IndividuosId": "B69B8C45-68C2-FFF9-5FEE-B75E99911451",
  "DataCadastro": "2026-05-04 16:45:53",
  "Nome": "Alesanco dos Santos Ferreira",
  "EmpresaUrl": "https://autovaleprevencoes.org/",
  "Empresa": "autovaleprevencoes",
  "Email": "alesancoferreira@gmail.com"
}
```

### Permissoes
```json
{
  "permissaogerarfaturaavulsa": true,
  "permissaogerarfaturaavulsarastreador": true,
  "importarboletossiprov": true,
  "podeCompartilharCotacao": false,
  "permissaoparaexportarrelatorios": false,
  "btnGerarPdfSimplificadoAssociado": true
}
```

### Configuracoes Gerais
```json
{
  "EmissaoFaturasRateio": "1",
  "TempoFidelidade": "24",
  "TempoSessao": "60",
  "TipoAdesao": "3",
  "RedeBinaria": "1",
  "CartaoHabilitado": true,
  "ContasBancariasId": "HinovaPay",
  "ContasBancariasIdAdesao": "HinovaPay",
  "TipoMonitoramento": "1",
  "TipoRenovacao": "COMPLETA",
  "ValorMinimoSaque": "200.00",
  "ConsultorPrincipal": "admin",
  "EmiteCarne": true
}
```

### Traducoes/Nomenclaturas Customizadas
| Original | Customizado |
|----------|-------------|
| Mensal | Rateio |
| Adesao | Adesao |
| Mensalidade | Contribuicao |
| TermoAdesao | Regimento Interno |
| Regional | Gestor |
| Suspenso | Suspenso |

---

## ENDPOINTS MAPEADOS

### 1. AUTENTICACAO E CONTA

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| GET | `/conta/login` | Pagina de login |
| POST | `/conta/login` | Efetuar login (UsuariosLogin + UsuariosSenha) |
| GET | `/conta/recuperar` | Recuperar senha |
| POST | `/conta/recuperar` | Enviar token de recuperacao |
| GET | `/conta/sair` | Logout / Encerrar sessao |

### 2. DASHBOARD

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| GET | `/dashboard` | Pagina principal/painel |
| GET | `/dashboard/dados` | Dados do dashboard |
| GET | `/dashboard/resumo` | Resumo geral |
| GET | `/painel` | Painel alternativo |

### 3. ASSOCIADOS (Clientes/Membros)

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| GET | `/associados` | Modulo de associados |
| GET | `/associados/listar` | Listar associados |
| GET | `/associados/cadastrar` | Formulario de cadastro |
| GET | `/associados/editar` | Editar associado |
| GET | `/associados/remover` | Remover associado |
| GET | `/associados/buscar` | Buscar associado |
| GET | `/associados/detalhes` | Detalhes do associado |
| GET | `/associados/historico` | Historico do associado |
| GET | `/associados/veiculos` | Veiculos do associado |
| GET | `/associados/exportar` | Exportar associados |
| GET | `/associados/buscar-dados-autocomplete` | Autocomplete (param: termoPesquisa) |

### 4. VENDAS

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| GET | `/vendas/listar` | Listar vendas |
| GET | `/vendas/cadastrar` | Cadastrar venda |
| GET | `/vendas/editar` | Editar venda |
| GET | `/vendas/remover` | Remover venda |
| GET | `/vendas/detalhes` | Detalhes da venda |
| GET | `/vendas/historico` | Historico de vendas |
| GET | `/vendas/arquivos` | Arquivos da venda |
| GET | `/vendas/exportar` | Exportar vendas |
| GET | `/vendas/aprovar` | Aprovar venda |
| GET | `/vendas/reprovar` | Reprovar venda |
| GET | `/vendas/buscar-dados-autocomplete` | Autocomplete (param: termoPesquisa) |

### 5. ADESOES

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| GET | `/adesoes` | Modulo de adesoes |
| GET | `/adesoes/listar` | Listar adesoes |
| GET | `/adesoes/cadastrar` | Cadastrar adesao |
| GET | `/adesoes/editar` | Editar adesao |
| GET | `/adesoes/remover` | Remover adesao |

### 6. VEICULOS

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| GET | `/veiculos` | Modulo de veiculos |
| GET | `/veiculos/listar` | Listar veiculos |
| GET | `/veiculos/cadastrar` | Cadastrar veiculo |
| GET | `/veiculos/editar` | Editar veiculo |
| GET | `/veiculos/remover` | Remover veiculo |
| GET | `/veiculos/detalhes` | Detalhes do veiculo |
| GET | `/veiculos/buscar-dados-autocomplete` | Autocomplete |

### 7. VISTORIA

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| GET | `/vistoria/listar` | Listar vistorias |
| GET | `/vistoria/cadastrar` | Cadastrar vistoria |
| GET | `/vistoria/editar` | Editar vistoria |
| GET | `/vistoria/aprovar` | Aprovar vistoria |
| GET | `/vistoria/reprovar` | Reprovar vistoria |
| GET | `/vistoria/fotos` | Fotos da vistoria |
| GET | `/vistoria/documentos` | Documentos da vistoria |

### 8. FATURAS E FINANCEIRO

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| GET | `/faturas/listar` | Listar faturas |
| GET | `/faturas/cadastrar` | Cadastrar fatura |
| GET | `/faturas/editar` | Editar fatura |
| GET | `/faturas/remover` | Remover fatura |
| GET | `/faturas/exportar` | Exportar faturas |
| GET | `/faturas/gerar` | Gerar fatura |
| GET | `/faturas/segunda-via` | Segunda via de fatura |
| GET | `/financeiro` | Modulo financeiro |
| GET | `/financeiro/listar` | Listar financeiro |
| GET | `/financeiro/cadastrar` | Cadastrar lancamento |
| GET | `/financeiro/editar` | Editar lancamento |
| GET | `/financeiro/resumo` | Resumo financeiro |
| GET | `/faturamento/listar` | Listar faturamento |
| GET | `/faturamento/gerar` | Gerar faturamento |

### 9. COBRANCAS E BOLETOS

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| GET | `/cobrancas` | Modulo de cobrancas |
| GET | `/cobrancas/listar` | Listar cobrancas |
| GET | `/cobrancas/cadastrar` | Cadastrar cobranca |
| GET | `/cobrancas/gerar` | Gerar cobranca |
| GET | `/cobrancas/enviar` | Enviar cobranca |
| GET | `/boletos` | Modulo de boletos |
| GET | `/boletos/listar` | Listar boletos |
| GET | `/boletos/gerar` | Gerar boleto |
| GET | `/boletos/exportar` | Exportar boletos |
| GET | `/boletos/segunda-via` | Segunda via de boleto |
| GET | `/boletos/remessa` | Arquivo de remessa |

### 10. PAGAMENTOS E CARTAO

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| GET | `/pagamentos/listar` | Listar pagamentos |
| GET | `/pagamentos/cadastrar` | Cadastrar pagamento |
| GET | `/pagamentos/cartao` | Pagamento via cartao |
| GET | `/cartao/cadastrar` | Cadastrar cartao |
| GET | `/cartao/listar` | Listar cartoes |
| GET | `/cartao/remover` | Remover cartao |
| GET | `/creditos/listar` | Listar creditos |
| GET | `/debitos/listar` | Listar debitos |
| GET | `/inadimplentes/listar` | Listar inadimplentes |
| GET | `/adimplentes/listar` | Listar adimplentes |
| GET | `/contas-bancarias/listar` | Listar contas bancarias |
| GET | `/contas-bancarias/cadastrar` | Cadastrar conta bancaria |

### 11. BONUS, COMISSOES E SALDO

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| GET | `/bonus` | Modulo de bonus |
| GET | `/bonus/listar` | Listar bonus |
| GET | `/bonus/cadastrar` | Cadastrar bonus |
| GET | `/bonus/consultar` | Consultar bonus |
| GET | `/comissoes` | Modulo de comissoes |
| GET | `/comissoes/listar` | Listar comissoes |
| GET | `/comissoes/cadastrar` | Cadastrar comissao |
| GET | `/comissoes/extrato` | Extrato de comissoes |
| GET | `/saldo` | Modulo de saldo |
| GET | `/saldo/listar` | Listar saldos |
| GET | `/saldo/sacar` | Efetuar saque |
| GET | `/saldo/extrato` | Extrato de saldo |
| GET | `/saldo/historico` | Historico de saldo |

### 12. CONSULTORES

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| GET | `/consultor` | Modulo consultor |
| GET | `/consultor/listar` | Listar consultores |
| GET | `/consultor/cadastrar` | Cadastrar consultor |
| GET | `/consultor/editar` | Editar consultor |
| GET | `/consultor/buscar-dados-autocomplete` | Autocomplete consultores |

### 13. REDE BINARIA E INDICACOES

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| GET | `/rede-binaria` | Modulo rede binaria |
| GET | `/rede-binaria/listar` | Listar rede |
| GET | `/rede-binaria/arvore` | Arvore da rede |
| GET | `/rede-binaria/detalhes` | Detalhes do no |
| GET | `/rede-binaria/comissoes` | Comissoes da rede |
| GET | `/indicacoes` | Modulo indicacoes |
| GET | `/indicacoes/listar` | Listar indicacoes |
| GET | `/indicacoes/cadastrar` | Cadastrar indicacao |
| GET | `/indicacoes/detalhes` | Detalhes da indicacao |
| GET | `/indicacoes/comissoes` | Comissoes de indicacoes |

### 14. RENOVACAO E CANCELAMENTOS

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| GET | `/renovacao` | Modulo renovacao |
| GET | `/renovacao/listar` | Listar renovacoes |
| GET | `/renovacao/cadastrar` | Cadastrar renovacao |
| GET | `/renovacao/gerar` | Gerar renovacao |
| GET | `/renovacao/detalhes` | Detalhes da renovacao |
| GET | `/cancelamentos` | Modulo cancelamentos |
| GET | `/cancelamentos/listar` | Listar cancelamentos |
| GET | `/cancelamentos/cadastrar` | Cadastrar cancelamento |
| GET | `/cancelamentos/editar` | Editar cancelamento |
| GET | `/cancelamentos/detalhes` | Detalhes do cancelamento |
| GET | `/cancelamentos/motivos` | Motivos de cancelamento |
| GET | `/pre-cancelamentos/listar` | Listar pre-cancelamentos |
| GET | `/pre-cancelamentos/cadastrar` | Cadastrar pre-cancelamento |

### 15. EVENTOS E ASSISTENCIA

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| GET | `/eventos/listar` | Listar eventos |
| GET | `/eventos/cadastrar` | Cadastrar evento |
| GET | `/eventos/detalhes` | Detalhes do evento |
| GET | `/eventos/encerrar` | Encerrar evento |
| GET | `/assistencia/listar` | Listar assistencias |
| GET | `/assistencia/cadastrar` | Cadastrar assistencia |
| GET | `/assistencia/detalhes` | Detalhes da assistencia |
| GET | `/assistencia/encerrar` | Encerrar assistencia |
| GET | `/ocorrencias` | Modulo ocorrencias |
| GET | `/ocorrencias/listar` | Listar ocorrencias |
| GET | `/ocorrencias/cadastrar` | Cadastrar ocorrencia |
| GET | `/ocorrencias/editar` | Editar ocorrencia |
| GET | `/ocorrencias/detalhes` | Detalhes da ocorrencia |

### 16. MONITORAMENTO E RASTREADORES

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| GET | `/monitoramento/listar` | Listar monitoramento |
| GET | `/monitoramento/rastrear` | Rastrear veiculo |
| GET | `/monitoramento/historico` | Historico de rastreamento |
| GET | `/monitoramento/alertas` | Alertas de monitoramento |
| GET | `/rastreadores/listar` | Listar rastreadores |

### 17. COTACAO

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| GET | `/cotacao` | Modulo de cotacao |
| GET | `/cotacao/listar` | Listar cotacoes |
| GET | `/cotacao/cadastrar` | Cadastrar cotacao |
| GET | `/cotacao/gerar` | Gerar cotacao |
| GET | `/cotacao/enviar` | Enviar cotacao |

### 18. PLANOS, CATEGORIAS E SERVICOS

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| GET | `/planos` | Modulo de planos |
| GET | `/planos/listar` | Listar planos |
| GET | `/planos/cadastrar` | Cadastrar plano |
| GET | `/planos/buscar-dados-autocomplete` | Autocomplete planos |
| GET | `/categorias` | Modulo de categorias |
| GET | `/categorias/listar` | Listar categorias |
| GET | `/categorias/cadastrar` | Cadastrar categoria |
| GET | `/categorias/buscar-dados-autocomplete` | Autocomplete categorias |
| GET | `/servicos` | Modulo de servicos |
| GET | `/servicos/listar` | Listar servicos |
| GET | `/servicos/cadastrar` | Cadastrar servico |
| GET | `/servicos/buscar-dados-autocomplete` | Autocomplete servicos |

### 19. TABELA FIPE

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| GET | `/fipe/buscar` | Buscar na FIPE |
| GET | `/fipe/buscar-marca` | Buscar marca FIPE |
| GET | `/fipe/buscar-modelo` | Buscar modelo FIPE |
| GET | `/fipe/buscar-ano` | Buscar ano FIPE |
| GET | `/fipe/buscar-valor` | Buscar valor FIPE |

### 20. LOCALIDADES

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| GET | `/estados` | Modulo de estados |
| GET | `/estados/listar` | Listar estados |
| GET | `/estados/getEstadoUf/{UF}` | Buscar estado por UF |
| GET | `/cidades` | Modulo de cidades |
| GET | `/cidades/listar` | Listar cidades |
| GET | `/cidades/getCidadesPorEstado/{estadoId}` | Cidades por estado |
| GET | `/cidades/buscar-dados-autocomplete-estadoid` | Autocomplete cidades (param: estadoId, termoPesquisa) |
| GET | `/paises/getPais` | Buscar pais |
| GET | `/externo` | Modulo externo |
| GET | `/externo/listar` | Listar dados externos |
| GET | `/externo/getEstadoUf/{UF}` | Estado por UF (externo) |

### 21. CONTRATOS E ASSINATURAS

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| GET | `/contratos` | Modulo de contratos |
| GET | `/contratos/listar` | Listar contratos |
| GET | `/contratos/gerar` | Gerar contrato |
| GET | `/assinaturas/listar` | Listar assinaturas |
| GET | `/assinaturas/cadastrar` | Cadastrar assinatura |
| GET | `/assinaturas/validar` | Validar assinatura |
| GET | `/termos/aceitar` | Aceitar termos |
| GET | `/termos/listar` | Listar termos |
| GET | `/parcelas/listar` | Listar parcelas |
| GET | `/parcelas/cadastrar` | Cadastrar parcela |
| GET | `/carne/gerar` | Gerar carne |

### 22. COMUNICACAO (WhatsApp, SMS, Email)

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| GET/POST | `/whatsapp/enviar` | Enviar mensagem WhatsApp |
| GET | `/whatsapp/configurar` | Configurar WhatsApp |
| GET/POST | `/sms/enviar` | Enviar SMS |
| GET/POST | `/email/enviar` | Enviar email |
| GET | `/mensagens` | Modulo de mensagens |
| GET | `/mensagens/listar` | Listar mensagens |
| GET | `/mensagens/enviar` | Enviar mensagem |
| GET | `/mensagens/detalhes` | Detalhes da mensagem |

### 23. DOCUMENTOS E ARQUIVOS

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| GET | `/arquivos` | Modulo de arquivos |
| GET | `/arquivos/listar` | Listar arquivos |
| POST | `/arquivos/upload` | Upload de arquivo |
| GET | `/arquivos/download` | Download de arquivo |
| POST/DELETE | `/arquivos/remover` | Remover arquivo |
| GET | `/pdf/gerar` | Gerar PDF |
| GET | `/pdf/contrato` | PDF de contrato |
| GET | `/pdf/boleto` | PDF de boleto |
| GET | `/pdf/carne` | PDF de carne |

### 24. IMPORTACAO E EXPORTACAO

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| POST | `/importar/boletos` | Importar boletos |
| POST | `/importar/associados` | Importar associados |
| GET | `/exportar/associados` | Exportar associados |
| GET | `/exportar/vendas` | Exportar vendas |
| GET | `/exportar/financeiro` | Exportar financeiro |
| GET | `/exportar/faturas` | Exportar faturas |

### 25. RELATORIOS

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| GET | `/relatorios/geral` | Relatorio geral |
| GET | `/relatorios/vendas` | Relatorio de vendas |
| GET | `/relatorios/financeiro` | Relatorio financeiro |
| GET | `/relatorios/associados` | Relatorio de associados |
| GET | `/relatorios/cancelamentos` | Relatorio de cancelamentos |
| GET | `/relatorios/bonus` | Relatorio de bonus |
| GET | `/relatorios/comissoes` | Relatorio de comissoes |
| GET | `/relatorios/inadimplencia` | Relatorio de inadimplencia |
| GET | `/relatorios/adesoes` | Relatorio de adesoes |
| GET | `/relatorios/renovacoes` | Relatorio de renovacoes |
| GET | `/relatorios/eventos` | Relatorio de eventos |
| GET | `/relatorios/assistencias` | Relatorio de assistencias |

### 26. CONFIGURACOES

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| GET | `/configuracoes/listar` | Listar configuracoes |
| GET | `/configuracoes/geral` | Configuracoes gerais |
| GET | `/configuracoes/empresa` | Configuracoes da empresa |
| GET | `/configuracoes/emails` | Configuracoes de emails |
| GET | `/configuracoes/bonus` | Configuracoes de bonus |
| GET | `/configuracoes/planos` | Configuracoes de planos |
| GET | `/configuracoes/faturas` | Configuracoes de faturas |
| GET | `/configuracoes/vendas` | Configuracoes de vendas |
| GET | `/configuracoes/comissoes` | Configuracoes de comissoes |
| GET | `/configuracoes/assinaturas` | Configuracoes de assinaturas |
| GET | `/configuracoes/monitoramento` | Configuracoes de monitoramento |
| GET | `/configuracoes/integracoes` | Configuracoes de integracoes |

### 27. INTEGRACOES

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| GET | `/integracoes/hinovapay` | Integracao HinovaPay |
| GET | `/integracoes/siprov` | Integracao Siprov |
| POST | `/webhook/receber` | Receber webhook |

### 28. USUARIOS E PERMISSOES

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| GET | `/usuarios` | Modulo de usuarios |
| GET | `/usuarios/listar` | Listar usuarios |
| GET | `/usuarios/cadastrar` | Cadastrar usuario |
| GET | `/usuarios/editar` | Editar usuario |
| GET | `/usuarios/remover` | Remover usuario |
| POST | `/usuario/atualizar` | Atualizar dados/senha do usuario |
| GET | `/permissoes` | Modulo de permissoes |
| GET | `/permissoes/listar` | Listar permissoes |

### 29. PERFIL E SUPORTE

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| GET | `/perfil` | Modulo de perfil |
| GET | `/perfil/editar` | Editar perfil |
| GET | `/perfil/dados` | Dados do perfil |
| GET | `/perfil/atualizar` | Atualizar perfil |
| GET | `/suporte` | Modulo de suporte |
| GET | `/suporte/listar` | Listar suporte |
| GET | `/suporte/cadastrar` | Cadastrar ticket |
| GET | `/suporte/detalhes` | Detalhes do ticket |

### 30. LOGS, TAREFAS E NOTIFICACOES

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| GET | `/logs` | Modulo de logs |
| GET | `/logs/listar` | Listar logs |
| GET | `/logs/detalhes` | Detalhes do log |
| GET | `/logs/exportar` | Exportar logs |
| GET | `/tarefas` | Modulo de tarefas |
| GET | `/tarefas/listar` | Listar tarefas |
| GET | `/tarefas/cadastrar` | Cadastrar tarefa |
| GET | `/tarefas/concluir` | Concluir tarefa |
| GET | `/notificacoes/enviar` | Enviar notificacao |
| GET | `/notificacoes/configurar` | Configurar notificacoes |
| GET | `/fornecedores/listar` | Listar fornecedores |

---

## APIs EXTERNAS UTILIZADAS

| Servico | URL | Descricao |
|---------|-----|-----------|
| ViaCEP | `https://viacep.com.br/ws/{cep}/json/` | Busca de endereco por CEP |
| Nominatim (OSM) | `https://nominatim.openstreetmap.org/search` | Geocodificacao |
| SouthTI | `https://api.southti.com.br/AtualizacoesSistemas/BuscarAtualizacoes/` | Atualizacoes do sistema |
| HinovaPay | (via integracao) | Gateway de pagamento |
| Siprov | (via integracao) | Integracao de provisionamento |

---

## PADRAO DE FORM SUBMISSION

O sistema usa o padrao **AJAX form submit** (jquery.form.js):
- Formularios sao enviados via `ajaxSubmit()`
- Resposta JSON: `{ mensagem: "...", redirect: "/...", aviso: "...", reload: true/false }`
- Erro JSON: `{ mensagem: "...", redirect: "..." }`
- Metodo de busca geral: `?pesquisa_geral={termo}&pesquisa_geral_opt={tipo}`

## PADRAO DE AUTOCOMPLETE

- Rota: `/{modulo}/buscar-dados-autocomplete`
- Parametro: `termoPesquisa`
- Minimo de caracteres: 3 (padrao)
- Usa Select2 com AJAX

## ASSETS ESTATICOS

| Tipo | Path |
|------|------|
| CSS | `/assets/css/plugins.css` |
| CSS | `/assets/css/style.css` |
| JS | `/assets/js/plugins.js` |
| JS | `/assets/js/scripts.js` |
| JS | `/assets/js/form.js` |
| JS | `/assets/plugins/jquery-form/jquery.form.js` |
| Imagens | `https://imagens.autovaleprevencoes.org/` |

---

## RESUMO TOTAL DE ENDPOINTS

| Modulo | Qtd Endpoints |
|--------|---------------|
| Autenticacao | 5 |
| Dashboard | 4 |
| Associados | 11 |
| Vendas | 11 |
| Adesoes | 5 |
| Veiculos | 7 |
| Vistoria | 7 |
| Faturas/Financeiro | 13 |
| Cobrancas/Boletos | 11 |
| Pagamentos/Cartao | 10 |
| Bonus/Comissoes/Saldo | 12 |
| Consultores | 4 |
| Rede Binaria/Indicacoes | 9 |
| Renovacao/Cancelamentos | 12 |
| Eventos/Assistencia | 12 |
| Monitoramento | 5 |
| Cotacao | 5 |
| Planos/Categorias/Servicos | 12 |
| FIPE | 4 |
| Localidades | 10 |
| Contratos/Assinaturas | 9 |
| Comunicacao | 7 |
| Documentos/Arquivos | 7 |
| Importacao/Exportacao | 6 |
| Relatorios | 12 |
| Configuracoes | 12 |
| Integracoes | 3 |
| Usuarios/Permissoes | 7 |
| Perfil/Suporte | 7 |
| Logs/Tarefas/Notificacoes | 10 |
| **TOTAL** | **~250 endpoints** |
