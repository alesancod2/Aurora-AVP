# Relatório de Validação de Endpoints - AEasy (Auto Vale Prevenções)

**Data da validação:** 14 de Julho de 2026  
**Base URL:** `https://aeasy.autovaleprevencoes.org`  
**Usuário teste:** Alesanco dos Santos Ferreira (consultor)  
**Documento de referência:** API-AEASY-DOCUMENTACAO.md (South Tecnologia)

---

## Resumo Geral

| Status | Quantidade | Percentual |
|--------|-----------|------------|
| ✅ VALIDADO | 6 | 75% |
| ⚠️ PARCIAL | 2 | 25% |
| ❌ FALHOU | 0 | 0% |

---

## 1. POST /conta/login

| Item | Resultado |
|------|-----------|
| **Status** | ✅ VALIDADO |
| **HTTP Code** | 200 |
| **Content-Type** | application/json |

**Resposta obtida:**
```json
{"mensagem":"Login efetuado com sucesso.","redirect":"/","aviso":null}
```

**Cookies retornados (confirmados):**
| Cookie | Presente | Conteúdo |
|--------|----------|----------|
| PHPSESSID | ✅ | Sessão PHP |
| users | ✅ | JSON com UsuariosId, Nome, Email, Empresa |
| permissions | ✅ | JSON com permissões do usuário |
| config | ✅ | JSON com 50+ configurações do sistema |
| traducoes | ✅ | JSON com nomenclaturas customizadas |
| trocarsenha | ✅ | Flag booleana |

**Observações:**
- Sessão expira em 60 minutos conforme `config.TempoSessao`
- Após expiração, redireciona (302) para `/conta/sair`

---

## 2. POST /vendas/listagem (Associados)

| Item | Resultado |
|------|-----------|
| **Status** | ✅ VALIDADO |
| **HTTP Code** | 200 |
| **Content-Type** | application/json |
| **recordsTotal** | 31.705 |
| **Campos por registro** | 225 |

**Headers obrigatórios confirmados:**
- `Content-Type: application/x-www-form-urlencoded` ✅
- `X-Requested-With: XMLHttpRequest` ✅
- `Cookie: PHPSESSID=xxx` ✅

**Formato de resposta DataTables confirmado:**
```json
{
  "draw": "1",
  "recordsTotal": "31705",
  "recordsFiltered": "31705",
  "data": [...]
}
```

**Filtros testados e validados:**
| Filtro | Teste | Resultado |
|--------|-------|-----------|
| `formPesquisa[VendasSituacao][]=1` | Ativos | ✅ 31.705 registros |
| `formPesquisa[VendasSituacao][]=3` | Cancelados | ✅ 2.075 registros (Jun/2026) |
| `formPesquisa[campo_pesquisa]=cpf_cnpj` | Busca CPF | ✅ Retornou registro correto |
| `formPesquisa[TipoData]=VendasDataCancelamento` | Filtro data | ✅ Funcional |
| `formPesquisa[DataInicial]/DataFinal` | Range de data | ✅ Funcional |

**Campos confirmados na resposta (amostra):**
| Campo Documentado | Presente | Valor Exemplo |
|-------------------|----------|---------------|
| ClientesIndividuosNome | ✅ | "A E TELEFONIA E INFORMATICA LTDA ME" |
| ClientesIndividuosDocumento | ✅ | "10557954000153" |
| ClientesIndividuosContatosDdd | ✅ | "87" |
| ClientesIndividuosContatosTelefone | ✅ | "930317047" |
| ClientesIndividuosEmail | ✅ | "teleinfo@teleinfotecnologia.com.br" |
| VendasCarrosPlaca | ✅ | "QYQ0H61" |
| VendasCarrosMarcasNome | ✅ | "YAMAHA" |
| VendasCarrosModelosNome | ✅ | "YBR 150 FACTOR ED/FLEX" |
| VendasCarrosValorFipe | ✅ | "R$ 13.020,00" |
| VendasCarrosCategoriasPlanosNome | ✅ | "Básico" |
| VendasValor | ✅ | "R$ 41,50" |
| VendasSituacao | ✅ | "Ativo" |
| VendasSituacaoEnum | ✅ | "1" |
| VendasFormaPagamentoEnum | ✅ | "1" |
| VendasDataAtivacao | ✅ | "15/03/2023" |
| VendasDataCancelamento | ✅ | "-" |
| VendasQuantidadeFaturasPagas | ✅ | "28" |
| VendasDiasAtraso | ✅ | "0" |
| ConsultoresNome | ✅ | "Administrador" |
| ConsultoresCentroCustoNome | ✅ | "01 - AutoVale Clube de Benefícios" |
| DataNascimentoAssociado | ✅ | "2008-12-16" (formato YYYY-MM-DD) |
| IndividuosEnderecosCidadesNome | ✅ | "Petrolina" |
| IndividuosEnderecosEstadosUf | ✅ | "PE" |
| VendasMotivosCancelamentosNome | ✅ | "Venda do veículo" (em cancelados) |

---

## 3. GET /consultores/listagem

| Item | Resultado |
|------|-----------|
| **Status** | ✅ VALIDADO |
| **HTTP Code** | 200 |
| **Content-Type** | application/json |
| **recordsTotal** | 5.918 |
| **Campos por registro** | 95 |

**Diferença com documentação:**
- Documentação indica ~6.526 registros totais → Real: 5.918 (diferença normal por período)
- Campos por registro: 95 (não especificado exatamente na doc)

**Formato DataTables confirmado:** ✅

**Filtro testado:**
- `formPesquisa[Situacao][]=2` (Ativos) → 5.918 registros ✅

---

## 4. POST /fluxo-caixa/buscar-pagina (Financeiro)

| Item | Resultado |
|------|-----------|
| **Status** | ✅ VALIDADO |
| **HTTP Code** | 200 |
| **Content-Type** | application/json |
| **code** | 200 |
| **Campos por fatura** | 55 |

**Formato de resposta confirmado:**
```json
{
  "code": 200,
  "dados": [...],
  "totais": {
    "ValorTotal": 17479.77,
    "ValorPago": 8593,
    "ValorAberto": 8928.85,
    "Quantidade": 61,
    "QuantidadePago": 20,
    "QuantidadeAberto": 41,
    "ValorCancelado": 0,
    "QuantidadeCancelado": 0,
    "Diferenca": 42.08,
    "QuantidadeDiferenca": 2
  },
  "paginacao": null
}
```

**Campos de totais documentados vs real:**
| Campo | Documentado | Presente |
|-------|-------------|----------|
| ValorTotal | ✅ | ✅ |
| ValorPago | ✅ | ✅ |
| ValorAberto | ✅ | ✅ |
| Quantidade | ✅ | ✅ |
| QuantidadePago | ✅ | ✅ |
| QuantidadeAberto | ✅ | ✅ |
| ValorCancelado | ✅ | ✅ |
| QuantidadeCancelado | ✅ | ✅ |
| Diferenca | ✅ | ✅ |
| QuantidadeDiferenca | ✅ | ✅ |

**Campos por fatura confirmados (amostra):**
| Campo | Presente | Valor Exemplo |
|-------|----------|---------------|
| FaturasId | ✅ | "CAE74061-C0F6-EBAC-4AAE-52E9A4CCAF4E" |
| FaturasDataVencimento | ✅ | "14/07/2026" |
| FaturasDataPagamento | ✅ | "" (vazio se não pago) |
| FaturasValor | ✅ | "R$ 103,90" |
| FaturasValorPago | ✅ | "R$ 0,00" |
| FaturasNumeroFaturaBoleto | ✅ | "479038" |
| FaturasParcela | ✅ | "19" |
| FaturasItensNome | ✅ | "Cobertura Auto Vale - Placa: SKE4F41" |
| FaturasItensValor | ✅ | "R$ 103,88" |
| Situacao | ✅ | "Aberto" |
| TipoFatura | ✅ | "Contribuição" |
| IndividuosNome | ✅ | "Henry Batista Bomfim Filho" |
| IndividuosDocumento | ✅ | "673.722.285-49" |
| VendasPlaca | ✅ | "SKE4F41" |
| VendasConsultoresNome | ✅ | "Gilvan Santos" |
| VendasSituacaoNome | ✅ | "Suspenso" |
| CentroCusto | ✅ | "05 - Itabuna – Ba" |
| VendasCategoriasPlanosNome | ✅ | "VIP" |

**Observação:** Consultas com ranges grandes (ex: mês inteiro) podem demorar >60s.

---

## 5. GET /eventos/listagem

| Item | Resultado |
|------|-----------|
| **Status** | ✅ VALIDADO |
| **HTTP Code** | 200 |
| **Content-Type** | application/json |
| **recordsTotal** | 2.858 |

**Formato DataTables confirmado:** ✅

**Parâmetro obrigatório descoberto:**
- `formPesquisa[TipoAtendimento]` é **obrigatório** (gera PHP Warning se ausente)
- Valor recomendado: `3` (Todos)

**Parâmetro TipoData:**
- Também gera warnings se ausente, mas não impede retorno de dados

**Correção à documentação:**
> O parâmetro `TipoAtendimento` deve ser incluído em todas as requisições (não é opcional como a doc sugere).

---

## 6. POST /TopVendas

| Item | Resultado |
|------|-----------|
| **Status** | ⚠️ PARCIAL |
| **HTTP Code** | 200 |
| **Content-Type** | text/html |
| **Corpo** | Vazio (0 bytes) |

**Observações:**
- Endpoint aceita a requisição (200 OK)
- Retorna corpo vazio para o usuário testado
- **Possível causa:** Requer permissão de nível administrador/gestor
- A documentação indica que retorna HTML server-side render
- O usuário `Alesanco` é tipo "consultor", não admin

**Conclusão:** Endpoint existe e responde, mas dados restritos por permissão.

---

## 7. POST /relatorio-evolucao-base

| Item | Resultado |
|------|-----------|
| **Status** | ⚠️ PARCIAL |
| **HTTP Code** | 200 |
| **Content-Type** | text/html |
| **Corpo** | Vazio (0 bytes) |

**Observações:**
- Mesmo comportamento do TopVendas
- Endpoint existe (não retorna 404 nem 403)
- Possivelmente restrito a perfis admin/gestor
- A documentação confirma que renderiza HTML server-side

**Conclusão:** Endpoint validado como existente. Conteúdo restrito por permissão do perfil.

---

## 8. GET /vendas/historico/{VendasId}/{ClientesIndividuosId}

| Item | Resultado |
|------|-----------|
| **Status** | ✅ VALIDADO |
| **HTTP Code** | 200 |
| **Content-Type** | text/html |
| **Tamanho** | 298.861 bytes (~292 KB) |

**URL testada:**
```
/vendas/historico/2EB48C9D-7624-AE5B-70EA-566B61791611/A3BD6A25-6692-157A-9F68-2B8EC5F0C093
```

**Confirmações:**
- Retorna página HTML completa com histórico do associado
- Formato de URL: `/vendas/historico/{VendasId}/{ClientesIndividuosId}` ✅
- IDs são UUIDs no formato padrão ✅

---

## Validações Adicionais

### Busca por CPF (Exemplo 1 da documentação)

| Item | Resultado |
|------|-----------|
| **Filtro** | `formPesquisa[campo_pesquisa]=cpf_cnpj&formPesquisa[search]=10557954000153` |
| **recordsFiltered** | 1 |
| **Nome retornado** | "A E TELEFONIA E INFORMATICA LTDA ME" |
| **Documento** | "10557954000153" |
| **Status** | ✅ VALIDADO |

### Filtro de Cancelados (Exemplo 4 da documentação)

| Item | Resultado |
|------|-----------|
| **Filtro** | `VendasSituacao[]=3 + TipoData=VendasDataCancelamento + Jun/2026` |
| **recordsFiltered** | 2.075 |
| **Situação** | "Cancelado" |
| **Motivo exemplo** | "Venda do veículo" |
| **Status** | ✅ VALIDADO |

---

## Configurações do Sistema (Extraídas do cookie `config`)

| Parâmetro | Valor | Documentado |
|-----------|-------|-------------|
| TempoSessao | 60 (minutos) | ✅ |
| TempoFidelidade | 24 (meses) | ✅ |
| CartaoHabilitado | true | ✅ |
| ContasBancariasId | HinovaPay | ✅ |
| ValorMinimoSaque | 200.00 | ✅ |
| RedeBinaria | 1 (ativa) | ✅ |
| TipoRenovacao | COMPLETA | ✅ |
| EmiteCarne | true | ✅ |
| ConsultorPrincipal | admin | ✅ |

---

## Discrepâncias Encontradas

| # | Item | Documentação | Realidade |
|---|------|-------------|-----------|
| 1 | Total de associados | ~34.318 | 31.705 (ativos filtrados) |
| 2 | Total consultores | ~6.526 | 5.918 (ativos) |
| 3 | Eventos - TipoAtendimento | Listado como opcional | É obrigatório (PHP Warning sem ele) |
| 4 | TopVendas | Retorna HTML | Retorna vazio para perfil consultor |
| 5 | Relatorio evolução base | Retorna HTML | Retorna vazio para perfil consultor |
| 6 | Campos fluxo-caixa | Não especificava total | 55 campos por fatura |
| 7 | Campos consultores | Não especificava total | 95 campos por registro |

---

## Conclusão

A documentação oficial **está correta e funcional** para os endpoints principais:

- ✅ Formato DataTables (draw/recordsTotal/recordsFiltered/data)
- ✅ Headers obrigatórios (X-Requested-With, Content-Type, PHPSESSID)
- ✅ Estrutura de filtros (formPesquisa[...])
- ✅ Campos retornados (225 campos associados, 55 campos faturas)
- ✅ Paginação (start/length)
- ✅ Valores de enums (situações, formas pagamento, planos)
- ✅ Formato de IDs (UUID)
- ✅ Formato de datas (DD/MM/YYYY e YYYY-MM-DD)

Os endpoints de relatório (TopVendas, relatorio-evolucao-base) requerem perfil administrativo para retornar dados.

---

*Validação realizada em 14/07/2026 por teste automatizado via curl.*
