# Documentacao API Interna - AEasy (South Tecnologia)

**Sistema:** AEasy - Gestao de Associacoes Veiculares
**URL Base:** `https://aeasy.autovaleprevencoes.org`
**API Oficial:** `https://api.autovaleprevencoes.org/`
**Documentacao Oficial:** `https://aeasy.readme.io/reference`
**Desenvolvido por:** South Tecnologia
**Data mapeamento:** Julho 2026

---

## 1. AUTENTICACAO

### Login

| Campo | Valor |
|-------|-------|
| **URL** | `POST /conta/login` |
| **Content-Type** | `application/json` |
| **Body** | `{"UsuariosLogin":"CPF","UsuariosSenha":"SENHA"}` |

**Resposta sucesso:**
```json
{"mensagem":"Login efetuado com sucesso.","redirect":"/","aviso":null}
```

**Sessao:** Cookie `PHPSESSID` (expira em 60 minutos)

**Cookies retornados no login:**
- `PHPSESSID` - sessao
- `users` - dados do usuario (JSON encoded)
- `permissions` - permissoes (JSON encoded)
- `config` - configuracoes do sistema (JSON encoded)
- `traducoes` - traducoes customizadas (JSON encoded)

### Logout
| Campo | Valor |
|-------|-------|
| **URL** | `GET /conta/sair` |

---


## 2. ASSOCIADOS (Vendas)

### Endpoint principal

| Campo | Valor |
|-------|-------|
| **URL** | `POST /vendas/listagem` |
| **Content-Type** | `application/x-www-form-urlencoded` |
| **Headers extras** | `X-Requested-With: XMLHttpRequest` |
| **Total registros** | ~34.318 |
| **Campos por registro** | 225 |

### Parametros obrigatorios (DataTables)

```
draw=1
start=0                    (offset, paginacao)
length=50                  (registros por pagina: 10/25/50/100)
columns[0][data]=ClientesIndividuosNome
columns[0][name]=ClientesIndividuosNome
columns[0][searchable]=false
columns[0][orderable]=true
order[0][column]=0
order[0][dir]=asc          (asc/desc)
```

### Filtros disponiveis (formPesquisa)

```
formPesquisa[submitFilter]=true              (OBRIGATORIO para ativar filtros)
formPesquisa[VendasSituacao][]=1             (situacao - pode enviar multiplos)
formPesquisa[TipoData]=VendasDataAtivacao    (qual campo de data filtrar)
formPesquisa[DataInicial]=2025-07-01         (data inicio YYYY-MM-DD)
formPesquisa[DataFinal]=2025-07-31           (data fim YYYY-MM-DD)
formPesquisa[campo_pesquisa]=documento       (tipo de busca rapida)
formPesquisa[search]=63741373370             (valor da busca rapida)
```

### Valores dos filtros

#### VendasSituacao (situacao do associado)
| Valor | Descricao |
|-------|-----------|
| `1` | Ativo |
| `2` | Suspenso |
| `3` | Cancelado |
| `4` | Aguardando Pagamento |
| `5` | Novo |
| `6` | Aguardando Vistoria |
| `7` | Vistoria Agendada |
| `8` | Vistoria Negada |
| `9` | Analise de Comite |
| `10` | Revistoria |
| `11` | Reativacao |
| `12` | Roubo/Furto |
| `13` | Pre-Cancelamento |
| `14` | Migrado |
| `17` | Juridico |

#### TipoData (qual campo de data usar no filtro)
| Valor | Descricao |
|-------|-----------|
| `VendasDataCadastro` | Data de Cadastro |
| `VendasDataCancelamento` | Data de Cancelamento |
| `VendasDataPagamento` | Data do Contrato |
| `VendasDataAtivacao` | Data de Ativacao |
| `VendasDataReativacao` | Data de Reativacao |
| `VendasDataUltimoFaturaCarne` | Data de Ultima Fatura Carne |
| `VendasDataImpressaoCarne` | Data de Impressao Carne |
| `VendasDataSuspensao` | Data Suspensao |

#### campo_pesquisa (busca rapida)
| Valor | Descricao |
|-------|-----------|
| `nome` | Nome |
| `cpf_cnpj` | CPF/CNPJ |
| `placa` | Placa |
| `chassi` | Chassi |
| `renavam` | Renavam |
| `rastreador` | Rastreador |
| `telefone` | Telefone |
| `cep` | CEP |

#### FormaPagamento
| Valor | Descricao |
|-------|-----------|
| `1` | Boleto |
| `2` | Cartao de Credito |

#### VendasClassificacao
| Valor | Descricao |
|-------|-----------|
| `1` | Nova Adesao |
| `2` | Renovacao |
| `3` | Reativacao |

#### ConsultoresCentroCustoId (Sedes)
| Valor | Descricao |
|-------|-----------|
| `Empresa` | 01 - AutoVale Clube de Beneficios |
| `2DFB8E7F-09CA-527B-0E36-CFF08A943C19` | 02 - Petrolina - Pe |
| `Juazeiro` | 03 - Juazeiro - Ba |
| `Bomfim` | 04 - Sr. Bomfim - Ba |
| `Itabuna` | 05 - Itabuna - Ba |
| `JNorte` | 06 - J. Norte - Ce |
| `Maceio` | 07 - Maceio - Al |
| `Salgueiro` | 08 - Salgueiro - Pe |
| `Arapiraca1` | 09 - Arapiraca - Al |
| `SMiguelCampos` | 10 - S. Miguel Campos - Al |
| `C2D9F83C-E5ED-10FC-C44F-F97B974C84F2` | 11 - Carpina - Pe |
| `DFA87AB6-49FF-B6C0-C971-BB9FDBF343EC` | 12 - Serra Talhada - Pe |
| `4808A9B4-1D5E-1D95-ECE6-D09FA4F5316F` | 13 - Propria - Se |
| `C076FFB2-A1FF-DA78-D2C2-B8049B1C8F91` | 14 - Horizonte - Ce |
| `746E6EAC-32E8-455C-7230-BC41043D89B0` | 15 - Feira de Santana - Ba |
| `CF7C65F2-833C-F6E6-D726-426982B1453C` | 16 - Recife - Pe |
| `AA67330C-53E7-2B5B-1271-78E26734792E` | 17 - Meep Pagamentos |

#### VendasCarrosCategoriasPlanosId (Planos)
| Valor | Descricao |
|-------|-----------|
| `1341acfb-93a2-11ee-98aa-0244bdb3ddcc` | Basico |
| `1341b209-93a2-11ee-98aa-0244bdb3ddcc` | VIP |
| `1341b058-93a2-11ee-98aa-0244bdb3ddcc` | TOP |
| `1341cd94-93a2-11ee-98aa-0244bdb3ddcc` | Truck |
| `AA4433F7-F47F-E7D4-545C-759305B53719` | Start |
| `EF60577E-8A33-77FC-F1B4-505419E5C581` | Premium |
| `4688130B-EAF8-2F75-1BC8-F95DEF15B15A` | Agregado |
| `E98BFBF4-466C-29AA-312A-CEC2E905819D` | Basico Truck |
| `C695DF0A-54E4-9C3F-B391-EDE11CB231EA` | Top Truck |
| `EB11A116-C44A-6838-F6A8-4770CFE875BB` | Vip Truck |
| `EA8DF053-0685-8C94-7ADD-9D133CA7AA04` | Comodato |
| `7859ADE8-45D0-845C-A908-6EDCEC597664` | Frota Publica |
| `480208CD-E318-36DA-224D-03929FAD6AC5` | Plano Automovel Eletrico |
| `124B3EAF-2422-4EEF-36F4-2F994D827DB0` | Plano Automovel Hibrido |
| `B86C7BC6-8F62-D96F-6B38-05CE0BDFBED1` | Rastreador Comodato |

---

## 3. CONSULTORES

### Endpoint

| Campo | Valor |
|-------|-------|
| **URL** | `GET /consultores/listagem` |
| **Metodo** | GET (parametros na query string) |
| **Headers** | `X-Requested-With: XMLHttpRequest` |
| **Total registros** | ~6.526 |

### Parametros (query string)

```
draw=1
start=0
length=50
columns[0][data]=IndividuosNome
columns[0][name]=IndividuosNome
columns[0][orderable]=true
columns[0][searchable]=false
order[0][column]=0
order[0][dir]=asc
formPesquisa[submitFilter]=true
formPesquisa[Situacao][]=2              (filtrar por ativos)
```

### Filtros

#### Situacao (consultor)
| Valor | Descricao |
|-------|-----------|
| `1` | Pre-cadastro |
| `2` | Ativo |
| `3` | Suspenso |
| `4` | Bloqueado |
| `5` | Cancelado |
| `6` | Ativo / Comissao Suspensa |

#### TipoConsultor
| Valor | Descricao |
|-------|-----------|
| `1` | Consultor |
| `2` | Vendedor |
| `3` | Sede/Parceria |
| `4` | Indicador |
| `5` | Regional/Gestor |
| `6` | Gestor |
| `7` | Interno |

---

## 4. FLUXO DE CAIXA (Financeiro)

### Endpoint

| Campo | Valor |
|-------|-------|
| **URL** | `POST /fluxo-caixa/buscar-pagina` |
| **Content-Type** | `application/x-www-form-urlencoded` |
| **Headers** | `X-Requested-With: XMLHttpRequest` |

### Parametros

```
page=1
length=100               (registros por pagina)
DataInicial=2025-06-01   (OBRIGATORIO)
DataFinal=2025-06-30     (OBRIGATORIO)
TipoData=FaturasDataVencimento
```

### Resposta

```json
{
  "code": 200,
  "dados": [...],
  "totais": {
    "ValorTotal": 2693558.33,
    "ValorPago": 1970952.26,
    "ValorAberto": 154549.11,
    "Quantidade": 20802,
    "QuantidadePago": 14896,
    "QuantidadeAberto": 1637,
    "ValorCancelado": 575575.54,
    "QuantidadeCancelado": 4269,
    "Diferenca": 8119.04,
    "QuantidadeDiferenca": 2751
  },
  "paginacao": null
}
```

---

## 5. EVENTOS (Sinistros/Ocorrencias)

### Endpoint

| Campo | Valor |
|-------|-------|
| **URL** | `GET /eventos/listagem` |
| **Metodo** | GET |
| **Headers** | `X-Requested-With: XMLHttpRequest` |

### Filtros
| Filtro | Tipo | Valores |
|--------|------|---------|
| `TipoData` | select | 1=Data Cadastro, 2=Data do Fato, 3=Data Conclusao Abertura, 4=Data Conclusao Evento, 5=Data Ressarcimento |
| `TipoAtendimento` | select | 1=Associado, 2=Terceiro, 3=Todos **(OBRIGATORIO)** |
| `DataInicial` | date | YYYY-MM-DD |
| `DataFinal` | date | YYYY-MM-DD |

---

## 6. HISTORICO DO CLIENTE

### Endpoint

| Campo | Valor |
|-------|-------|
| **URL** | `GET /vendas/historico/{VendasId}/{ClientesIndividuosId}` |
| **Metodo** | GET |

Retorna pagina HTML com historico completo do associado.

---

## 7. CONSIDERACOES TECNICAS

### Sessao
- Cookie `PHPSESSID` expira em **60 minutos** de inatividade
- Necessario re-login apos expiracao
- Uma sessao por vez (login novo invalida sessao anterior)

### Paginacao
- `start` = offset (0, 50, 100...)
- `length` = quantidade por pagina
- Resposta inclui `recordsTotal` e `recordsFiltered`
- Para puxar todos: loop incrementando `start` ate `start >= recordsFiltered`

### Formato de resposta (DataTables)
```json
{
  "draw": "1",
  "recordsTotal": "34318",
  "recordsFiltered": "811",
  "data": [...]
}
```

### Headers obrigatorios
- `Cookie: PHPSESSID=xxx` (autenticacao)
- `X-Requested-With: XMLHttpRequest` (identifica como Ajax)
- `Content-Type: application/x-www-form-urlencoded` (para POST)

---

*Documento gerado em Julho/2026 por mapeamento dos endpoints internos do AEasy.*
*Sujeito a mudancas pela South Tecnologia sem aviso previo.*
