# Documentacao API Interna - AEasy (South Tecnologia)

**Sistema:** AEasy - Gestao de Associacoes Veiculares
**URL Base:** `https://aeasy.autovaleprevencoes.org`
**API Oficial:** `https://api.autovaleprevencoes.org/`
**Documentacao Oficial:** `https://aeasy.readme.io/reference`
**Desenvolvido por:** South Tecnologia
**Data mapeamento:** Julho 2026

---

## Indice

1. [Autenticacao](#1-autenticacao)
2. [Associados (Vendas)](#2-associados-vendas)
3. [Consultores](#3-consultores)
4. [Fluxo de Caixa (Financeiro)](#4-fluxo-de-caixa-financeiro)
5. [Eventos (Sinistros/Ocorrencias)](#5-eventos-sinistrosocorrencias)
6. [Cotacoes](#6-cotacoes)
7. [Relatorio Evolucao Base](#7-relatorio-evolucao-base)
8. [Top Vendas (Adesoes)](#8-top-vendas-adesoes)
9. [Relatorio Clientes Cancelados](#9-relatorio-clientes-cancelados)
10. [Historico do Cliente](#10-historico-do-cliente)
11. [API Oficial (South Tecnologia)](#11-api-oficial-south-tecnologia)
12. [Mapa Completo de Rotas](#12-mapa-completo-de-rotas-disponiveis)
13. [Exemplos de Requisicoes](#13-exemplos-de-requisicoes-prontas)
14. [Consideracoes Tecnicas](#14-consideracoes-tecnicas)
15. [Categorias de Veiculos](#15-categorias-de-veiculos-ids)
16. [Hierarquia Consultores/Gestores](#16-hierarquia-consultoresgestores)
17. [Retornar Lider com Equipe (Comportamento)](#17-retornar-lider-com-equipe-comportamento)

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


#### MotivosSituacao (motivos de cancelamento/suspensao)

| Valor | Descricao |
|-------|-----------|
| `BCD795BF-C4C2-0094-DC90-605D97BE26D9` | Inadimplencia |
| `automatico` | Inadimplencia (automatico) |
| `D0E0779E-C39C-0C78-C056-FF326269FA8F` | Dificuldade Financeira |
| `9689A5F4-9734-A70A-6EBF-437C655EA31B` | Insatisfacao |
| `88933A61-F642-5AE1-0F2B-2838501376FE` | Desistencias |
| `B5326095-378D-AA1C-86F8-0311E98BD835` | Venda Do Veiculo |
| `044B1AFC-707D-F9CA-CF8C-9B5D8CA648D6` | Troca Do Veiculo |
| `4507CE3C-6892-7126-F666-FF724F85507A` | Erro Lancamento |
| `E5556C81-EC51-112F-32F8-816383254D0B` | Avarias Severas |
| `92D3E3FA-130B-5718-25F5-DD157759491E` | Cadastro Teste |
| `F7A8C75A-33CD-454B-B331-B8D62CF36A71` | Cancelado Pre-Adesao |
| `CancelamentoAdesao` | Cancelamento Adesao |
| `NaoRenovado` | Contrato Nao Renovado |
| `Migracao` | Migracao Associacao |
| `QuitacaoBoletoAvulso` | Quitacao Boleto |
| `6EDE1EA2-27BA-CF81-2AAF-C0EC4567854F` | Ressarcimento |
| `D176C990-B25C-582B-AD92-3B6595E7750C` | SBL Interno |
| `126128BE-2D28-A8CD-F010-970952DF1B3E` | Vistoria Nao Aprovada |


#### Outros filtros disponiveis

| Filtro | Tipo | Valores |
|--------|------|---------|
| `VendasVencimento[]` | multi-select | 5, 10, 15, 20, 25, 30 |
| `Fidelidade` | select | 1=Sim, 0=Nao |
| `DataNascimento` | select | 1-12 (mes nascimento) |
| `VeiculoZero` | select | 1=Sim, 2=Nao |
| `PossuiEvento` | select | 1=Sim, 0=Nao |
| `PossuiRastreador` | select | 1=Sim, 2=Nao |
| `VendasDiasAtraso` | text | numero de dias |
| `TipoVendasFaturasPagas` | select | maior, >, menor, <, ! |
| `FaturasPagas` | text | quantidade |
| `ValorFipeInicio` | text | valor minimo |
| `ValorFipeFinal` | text | valor maximo |
| `VendasCarrosPlaca` | text | placa |
| `VendasCarrosPlacaImplemento` | text | placa implemento |
| `CarrosChassi` | text | chassi |
| `VendasCategoriasCarros[]` | multi-select | IDs das categorias (80+) |
| `ConsultoresIndividuosId[]` | multi-select | IDs dos consultores |
| `VendasCarrosOrigemMigracao` | select | SM, 1=SGA, 2=SIPROV, 3=DWITCH |
| `VendasCarrosPortabilidade` | select | 1=Sim, 0=Nao |
| `VendasCarrosChassiRemarcado` | select | 1=Sim, 0=Nao |
| `VendasCarrosLeilao` | select | 1=Sim, 0=Nao |
| `VendasCarrosMediaMonta` | select | 1=Sim, 0=Nao |
| `AssociadosMaisPlacas` | select | 1=Sim, 0=Nao |
| `VendasCarrosPlotagem` | select | 1=Sim, 0=Nao |
| `CarneEmitido` | select | 1=Sim, 0=Nao |
| `IndividuosEnderecosEstadosId` | select | ID do estado |
| `IndividuosEnderecosCidadesId` | select | ID da cidade |
| `EquipesId` | select | ID da equipe |
| `RetornarLiderComEquipe` | select | SIM/NAO/ATE_NIVEL_1 |


### Campos retornados (agrupados)

#### Dados Pessoais

| Campo | Descricao | Exemplo |
|-------|-----------|---------|
| `ClientesIndividuosNome` | Nome completo ou CPF formatado | "Joao Silva" |
| `ClientesIndividuosDocumento` | CPF/CNPJ (so numeros) | "12345678901" |
| `ClientesIndividuosDataNascimento` | Data nascimento (DD/MM/YYYY) | "20/07/2005" |
| `DataNascimentoAssociado` | Data nascimento (YYYY-MM-DD) | "2005-07-20" |
| `ClientesIndividuosEmail` | Email | "email@gmail.com" |
| `ClientesIndividuosContatosDdd` | DDD | "88" |
| `ClientesIndividuosContatosTelefone` | Telefone | "998379290" |
| `ClientesIndividuosRg` | RG | "20211266978" |
| `ClientesIndividuosSexo` | Sexo | "Feminino" |
| `ClientesIndividuosId` | ID interno do cliente | UUID |
| `VendasClientesId` | ID do registro de venda/cliente | UUID |

#### Endereco

| Campo | Descricao |
|-------|-----------|
| `IndividuosEnderecosLogradouro` | Rua + numero |
| `IndividuosEnderecosNumero` | Numero |
| `IndividuosEnderecosBairro` | Bairro |
| `IndividuosEnderecosCep` | CEP |
| `IndividuosEnderecosCidadesNome` | Cidade |
| `IndividuosEnderecosEstadosNome` | Estado |
| `IndividuosEnderecosEstadosUf` | UF |
| `IndividuosEnderecosComplemento` | Complemento |


#### Veiculo

| Campo | Descricao | Exemplo |
|-------|-----------|---------|
| `VendasCarrosPlaca` | Placa | "PJZ9I31" |
| `VendasCarrosMarcasNome` | Marca | "HONDA" |
| `VendasCarrosModelosNome` | Modelo | "XRE 190/ Flex" |
| `VendasCarrosAnosModelosNome` | Ano modelo | "2016" |
| `CarrosAnoFabricacao` | Ano fabricacao | "2016" |
| `VendasCarrosCarrosCor` | Cor | "Vermelha" |
| `CarrosChassi` | Chassi | "9C2MD4100GR001168" |
| `CarrosRenavan` | Renavam | "01091116781" |
| `VendasCarrosCodigoFipe` | Codigo FIPE | "811141-3" |
| `VendasCarrosValorFipe` | Valor FIPE | "R$ 15.524,00" |
| `VendasCarrosCategoriasCarrosNome` | Categoria | "Motocicletas - Honda" |
| `VendasCarrosCategoriasPlanosNome` | Plano | "Basico" |
| `VendasCarrosPlacaImplemento` | Placa implemento 1 | |
| `VendasCarrosPlacaImplemento2` | Placa implemento 2 | |
| `VendasCarrosPlacaImplemento3` | Placa implemento 3 | |

#### Financeiro

| Campo | Descricao | Exemplo |
|-------|-----------|---------|
| `VendasValor` | Valor mensalidade | "R$ 65,90" |
| `VendasCarrosValorAdesao` | Valor adesao | "R$ 250,00" |
| `VendasCarrosValorFipe` | Valor protegido (FIPE) | "R$ 15.524,00" |
| `VendasCarrosCota` | Valor da cota | "1086.68" |
| `VendasCarrosValorMensal` | Valor mensal | "65.90" |
| `VendasCarrosValorTotal` | Valor total | "65.90" |
| `VendasVencimento` | Dia vencimento | "10" |
| `VendasFormaPagamento` | Forma (HTML badge) | `<span>Boleto</span>` |
| `VendasFormaPagamentoEnum` | Forma (numerico) | "1" |
| `VendasQuantidadeFaturasPagas` | Qtd faturas pagas | "0" |
| `VendasQuantidadeFaturasAtraso` | Qtd faturas atraso | "0" |
| `VendasDiasAtraso` | Dias em atraso | "0" |
| `VendasParcelas` | Total parcelas | "12" |
| `VendasIsentaCobranca` | Isento cobranca | "0" |


#### Situacao/Datas

| Campo | Descricao | Exemplo |
|-------|-----------|---------|
| `VendasSituacao` | Situacao texto | "Ativo" |
| `VendasSituacaoEnum` | Situacao numerico | "1" |
| `VendasSituacaoCor` | Badge com cor | {"Nome":"Ativo","Class":"badge bg-primary"} |
| `VendasDataCadastro` | Data cadastro | "06/06/2026 10:57:49" |
| `VendasDataAtivacao` | Data ativacao | "05/07/2025" |
| `VendasDataCancelamento` | Data cancelamento | "-" |
| `VendasDataSuspensao` | Data suspensao | "-" |
| `VendasDataReativacao` | Data reativacao | null |
| `VendasDataFidelidade` | Data fim fidelidade | "06/09/2026" |
| `VendasDataPagamento` | Data contrato | "06/06/2026" |
| `VendasClassificacao` | Tipo | "Nova Adesao" |
| `VendasTipoSuspensao` | Tipo suspensao | "" |
| `VendasMotivosCancelamentosNome` | Motivo cancelamento | "-" |

#### Campos de Cancelamento/Inadimplencia (confirmados)

| Campo | Descricao | Exemplo |
|-------|-----------|---------|
| `VendasMotivosCancelamentosNome` | Nome/motivo do cancelamento | "Inadimplencia" ou "-" |
| `VendasDiasAtraso` | Quantidade de dias em atraso | "45" ou "0" |
| `VendasQuantidadeFaturasPagas` | Total de faturas ja pagas | "8" |
| `VendasQuantidadeFaturasAtraso` | Total de faturas em atraso | "3" |

**Nota:** Esses campos sao uteis para identificar associados em risco de cancelamento e para relatorios de inadimplencia.

#### Consultor

| Campo | Descricao | Exemplo |
|-------|-----------|---------|
| `ConsultoresNome` | Nome consultor | "Roberta Pereira" |
| `ConsultoresLogin` | CPF do consultor | "03637642328" |
| `ConsultoresEmail` | Email consultor | "email@hotmail.com" |
| `ConsultoresDdd` | DDD consultor | "88" |
| `ConsultoresTelefone` | Telefone consultor | "988786226" |
| `ConsultoresCentroCustoId` | ID sede | "JNorte" |
| `ConsultoresCentroCustoNome` | Nome sede | "06 - J. Norte - Ce" |
| `VendasConsultoresId` | ID do consultor | UUID |

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

#### Outros filtros

- `CentroCustoId[]` - mesmos IDs das sedes
- `ConsultoresNiveisId[]` - niveis de comissao
- `GruposConsultoresId[]` - grupo (Externo/Interno)
- `DataInicial` / `DataFinal` - data cadastro
- `Nome` - busca por nome
- `Documento` - busca por CPF
- `Equipe` - ID da equipe
- `Indicador` - busca por indicador


### Campos retornados (principais)

| Campo | Descricao |
|-------|-----------|
| `IndividuosNome` | Nome completo |
| `IndividuosDocumento` | CPF formatado |
| `IndividuosNomeFantasia` | Nome fantasia |
| `IndividuosEmail` | Email |
| `IndividuosDataNascimento` | Data nascimento (YYYY-MM-DD) |
| `IndividuosSexo` | Sexo |
| `IndividuosLogin` | Login (CPF) |
| `IndividuosContatosDdd` | DDD |
| `IndividuosContatosTelefone` | Telefone formatado |
| `IndividuosEnderecosCidadesNome` | Cidade |
| `IndividuosEnderecosEstadosNome` | Estado |
| `ConsultoresId` | ID interno |
| `ConsultoresDataCadastro` | Data cadastro |
| `ConsultoresSituacaoCadastro` | Situacao texto |
| `ConsultoresSituacaoCadastroEnum` | Situacao numerico |
| `ConsultoresTipoConsultor` | Tipo texto |
| `ConsultoresTipoConsultorEnum` | Tipo numerico |
| `ConsultoresGerarComissao` | Gera comissao (1/0) |
| `ConsultoresIndicadorIndividuosNome` | Nome do indicador |
| `ConsultoresPatrocinadorIndividuosNome` | Nome patrocinador |
| `GruposEmpresasNome` | Centro de custo |
| `GruposConsultoresNome` | Grupo |
| `ConsultoresNiveisNome` | Nivel comissao |
| `IndividuosDadosBancariosBancosNome` | Banco |
| `IndividuosDadosBancariosConta` | Conta |
| `IndividuosDadosBancariosAgencia` | Agencia |

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

### Estrutura dos Totais (confirmada)

O objeto `totais` contem todos os campos de sumarizacao. Exemplo real (periodo jul/2025, primeira semana):

```json
{
  "ValorTotal": 747488.62,
  "ValorPago": 354866.28,
  "ValorAberto": 378392.23,
  "Quantidade": 5219,
  "QuantidadePago": 2650,
  "QuantidadeAberto": 2484,
  "ValorCancelado": 14461.25,
  "QuantidadeCancelado": 85
}
```

| Campo | Descricao |
|-------|-----------|
| `ValorTotal` | Soma de todos os valores (pago + aberto + cancelado) |
| `ValorPago` | Total de faturas pagas no periodo |
| `ValorAberto` | Total de faturas em aberto no periodo |
| `Quantidade` | Total de faturas no periodo |
| `QuantidadePago` | Quantidade de faturas pagas |
| `QuantidadeAberto` | Quantidade de faturas em aberto |
| `ValorCancelado` | Total de faturas canceladas |
| `QuantidadeCancelado` | Quantidade de faturas canceladas |
| `Diferenca` | Diferenca entre valores (presente em alguns periodos) |
| `QuantidadeDiferenca` | Quantidade da diferenca (presente em alguns periodos) |

**Nota:** Os campos `Diferenca` e `QuantidadeDiferenca` podem nao estar presentes em todos os periodos.


### Filtros

| Filtro | Tipo | Valores |
|--------|------|---------|
| `DataInicial` | date | YYYY-MM-DD (obrigatorio) |
| `DataFinal` | date | YYYY-MM-DD (obrigatorio) |
| `TipoData` | select | FaturasDataVencimento, FaturasDataOriginal, FaturasDataCredito, FaturasDataPagamento, VendasDataAtivacao |
| `OrdenarPor` | select | IndividuosNome, FaturasDataPagamento, FaturasDataVencimento, FaturasDataOriginal, FaturasDataCredito |
| `FaturasTipo` | select | 1=Adesao, 2=Contribuicao, 3=Avulsa, 4=Rastreador, 5=Adesao Consultor, 6=Cota participacao, 7=Cobranca, 8=Reativacao, 9=Cancelamento, 10=TaxaInstalacao |
| `FormaCobranca` | select | 1=Boleto, 2=Cartao |
| `VendasSituacao[]` | multi | mesmos valores de associados |
| `VendasCentroCustoId[]` | multi | IDs das sedes |
| `VendasCategoriasPlanosId[]` | multi | IDs dos planos |
| `VendasCarrosCategoriasCarrosId[]` | multi | IDs categorias veiculo |
| `ContasBancarias[]` | multi | IDs contas bancarias |
| `FaturasFormasPagamentosFaturasId[]` | multi | 1=Boleto, 2=Cartao, 3=Cancelado, 4=Isento, 5=Caixa, 6=Pix, 7=Ev, 8=Indicacao, 9=Migracao, 10=Debito |
| `Nome` | text | busca por nome |
| `NomeFantasia` | text | busca nome fantasia |
| `Placa` | text | busca placa |
| `Telefone` | text | busca telefone |
| `VendasConsultoresId` | text | ID consultor |
| `TipoBaixa` | select | 1=Sim, 2=Nao |
| `PagamentoEmAberto` | checkbox | |
| `PagamentoRealizados` | checkbox | |
| `IncluirEndereco` | checkbox | incluir endereco na resposta |
| `IncluirDetalhes` | checkbox | incluir detalhes |


### Campos retornados por fatura

| Campo | Descricao |
|-------|-----------|
| `FaturasId` | ID da fatura |
| `FaturasDataVencimento` | Data vencimento |
| `FaturasDataPagamento` | Data pagamento |
| `FaturasDataOriginal` | Data original |
| `FaturasDataCredito` | Data credito |
| `FaturasValor` | Valor da fatura |
| `FaturasValorPago` | Valor pago |
| `FaturasValorJuros` | Valor juros |
| `FaturasNumeroFaturaBoleto` | Numero boleto |
| `FaturasParcela` | Parcela |
| `FaturasItensNome` | Descricao item |
| `FaturasItensValor` | Valor item |
| `Situacao` | Pago/Aberto/Cancelado |
| `TipoFatura` | Contribuicao/Adesao/etc |
| `IndividuosNome` | Nome associado |
| `IndividuosDocumento` | CPF/CNPJ |
| `IndividuosContatosDdd` | DDD |
| `IndividuosContatosContato` | Telefone |
| `IndividuosEmail` | Email |
| `VendasPlaca` | Placa |
| `VendasConsultoresNome` | Nome consultor |
| `VendasSituacaoNome` | Situacao venda |
| `VendasDataCadastro` | Data cadastro |
| `VendasCarrosModelosNome` | Modelo veiculo |
| `VendasCarrosCategoriasCarrosNome` | Categoria |
| `VendasCategoriasPlanosNome` | Plano |
| `CentroCusto` | Sede |
| `FormasPagamentosFaturasNome` | Forma pgto |
| `SubTotal` | Subtotal |

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
| `DataInicial` | date | YYYY-MM-DD |
| `DataFinal` | date | YYYY-MM-DD |
| `Situacao[]` | multi | (aberto/concluido/cancelado) |
| `Etapa` | select | UUIDs das etapas (Cadastro, Analise Tecnica, Orcamento, Reparo, Entrega) |
| `TipoAtendimento` | select | 1=Associado, 2=Terceiro, 3=Todos |
| `ProtecaoEventosLocalAbertura` | select | C=Gerenciador, S=Externo |
| `Nome` | text | busca nome |
| `Documento` | text | busca CPF |
| `Placa` | text | busca placa |
| `ConsideraCancelado` | flag | |
| `ConsideraEventoAberto` | flag | |

---

## 6. COTACOES

### Endpoint

| Campo | Valor |
|-------|-------|
| **URL** | `GET /cotacoes/listagem` (provavel) |
| **Metodo** | GET |

### Filtros

| Filtro | Tipo |
|--------|------|
| `DataInicial` | date |
| `DataFinal` | date |
| `nome` | text |
| `numeroCotacao` | text |
| `situacao` | select |
| `consultoresId` | select |
| `CotacoesCarrosPlaca` | text |
| `CotacoesCarrosMarcasId` | select |
| `CotacoesCarrosModelosId[]` | multi |
| `ProtecaoTabelaRateioCategoriasPlanosId[]` | multi |
| `IndividuosEnderecosEstadosId` | select |
| `IndividuosEnderecosCidadesId` | select |

---


## 7. RELATORIO EVOLUCAO BASE

### Endpoint

| Campo | Valor |
|-------|-------|
| **URL** | `POST /relatorio-evolucao-base` |

### Filtros

| Filtro | Tipo | Descricao |
|--------|------|-----------|
| `Mes` | select | 1-12 (mes) |
| `Ano` | text | ex: 2025 |
| `ConsultoresId` | select | ID consultor (opcional) |

**Nota:** Este relatorio renderiza HTML server-side (nao retorna JSON).

---

## 8. TOP VENDAS (Adesoes)

### Endpoint

| Campo | Valor |
|-------|-------|
| **URL** | `POST /TopVendas` |

### Filtros

| Filtro | Tipo | Valores |
|--------|------|---------|
| `TipoData` | select | 2=Data Cotacao, 3=Data Ativacao, 4=Data Venda Efetivada, 5=Primeiro Boleto Pago |
| `DataInicial` | date | YYYY-MM-DD |
| `DataFinal` | date | YYYY-MM-DD |
| `Ordenar` | select | 1=Cotacao, 2=Cadastros, 3=Adesoes Efetivadas, 4=Adesoes Canceladas, 5=Adesoes Suspensas, 7=Primeiro Boleto Pago |
| `CampoOrder` | select | Quantidade, Ticket, Valor |
| `CentrodeCusto` | select | IDs sedes |
| `ConsultoresId` | select | ID consultor |
| `EquipeId` | select | ID equipe |
| `RetornarLiderComEquipe` | select | SIM, NAO, ATE_NIVEL_1 |

### Estrutura HTML retornada (25 colunas confirmadas)

O endpoint retorna HTML server-side com uma tabela de 25 colunas. Mapeamento confirmado:

| Indice | Coluna | Descricao |
|--------|--------|-----------|
| `[0]` | # | Posicao no ranking |
| `[1]` | Nome | Nome do consultor |
| `[2]` | Centro Custo | Sede do consultor |
| `[3]` | Taxa Conversao | Percentual de conversao |
| `[4]` | Cotacoes Qtd | Quantidade de cotacoes |
| `[5]` | Cotacoes Valor | Valor total cotacoes |
| `[6]` | Cotacoes Ticket | Ticket medio cotacoes |
| `[7]` | Cadastros Qtd | Quantidade de cadastros |
| `[8]` | Cadastros Valor | Valor total cadastros |
| `[9]` | Cadastros Ticket | Ticket medio cadastros |
| `[10]` | Efetivadas Qtd | Quantidade efetivadas |
| `[11]` | Efetivadas Valor | Valor total efetivadas |
| `[12]` | Efetivadas Ticket | Ticket medio efetivadas |
| `[13]` | Ativadas Qtd | Quantidade ativadas |
| `[14]` | Ativadas Valor | Valor total ativadas |
| `[15]` | Ativadas Ticket | Ticket medio ativadas |
| `[16]` | Suspensas Qtd | Quantidade suspensas |
| `[17]` | Suspensas Valor | Valor total suspensas |
| `[18]` | Suspensas Ticket | Ticket medio suspensas |
| `[19]` | Canceladas Qtd | Quantidade canceladas |
| `[20]` | Canceladas Valor | Valor total canceladas |
| `[21]` | Canceladas Ticket | Ticket medio canceladas |
| `[22]` | Primeiro Boleto Pago Qtd | Quantidade primeiro boleto pago |
| `[23]` | Primeiro Boleto Pago Valor | Valor total primeiro boleto pago |
| `[24]` | Primeiro Boleto Pago Ticket | Ticket medio primeiro boleto pago |

### Agrupamento por blocos

| Bloco | Colunas | Tripla (Qtd/Valor/Ticket) |
|-------|---------|---------------------------|
| Cotacoes | [4], [5], [6] | Sim |
| Cadastros | [7], [8], [9] | Sim |
| Efetivadas | [10], [11], [12] | Sim |
| Ativadas | [13], [14], [15] | Sim |
| Suspensas | [16], [17], [18] | Sim |
| Canceladas | [19], [20], [21] | Sim |
| Primeiro Boleto Pago | [22], [23], [24] | Sim |

**Nota:** Este relatorio renderiza HTML server-side (nao retorna JSON). O parser deve extrair dados dos `<td>` da tabela HTML.

---


## 9. RELATORIO CLIENTES CANCELADOS

### Via endpoint principal (recomendado)

Usar `/vendas/listagem` com filtros:
```
formPesquisa[VendasSituacao][]=3
formPesquisa[TipoData]=VendasDataCancelamento
formPesquisa[DataInicial]=2025-07-01
formPesquisa[DataFinal]=2025-07-31
formPesquisa[submitFilter]=true
```

### Filtros adicionais (pagina dedicada /relatorio-cliente-cancelado)

| Filtro | Tipo | Valores |
|--------|------|---------|
| `TipoData` | select | 1=Data Cancelamento, 2=Data Contrato |
| `DataInicial` | date | |
| `DataFinal` | date | |
| `DiasAtraso` | text | numero |
| `TipoDiasAtraso` | select | maior, >, menor, < |
| `MotivosSituacao[]` | multi | IDs motivos |
| `Nome` | text | |
| `Placa` | text | |
| `Telefone` | text | |
| `NomeCancelamento` | text | usuario que cancelou |
| `VendasConsultoresId` | select | |
| `ordenar` | select | 2=Nome Cliente, 3=Dias Atraso |
| `possuiBoletoAberto` | select | 1=Sim, 0=Nao |

---

## 10. HISTORICO DO CLIENTE

### Endpoint

| Campo | Valor |
|-------|-------|
| **URL** | `GET /vendas/historico/{VendasId}/{ClientesIndividuosId}` |
| **Metodo** | GET |

Retorna pagina HTML com historico completo do associado.

---


## 11. API OFICIAL (South Tecnologia)

### Informacoes

| Campo | Valor |
|-------|-------|
| **Base URL** | `https://api.autovaleprevencoes.org/` |
| **Documentacao** | `https://aeasy.readme.io/reference` |
| **Autenticacao** | Token (gerado em /gerenciar-api) |
| **Parametro obrigatorio** | `funcao` |

### Geracao de Token

Acessar `/gerenciar-api` no painel admin e clicar em "Gerar Token".
Tokens ficam listados na tabela do modal.

### Uso

A API oficial requer o parametro `funcao` em todas as requisicoes:
```
GET https://api.autovaleprevencoes.org/?funcao=NOME_FUNCAO&token=SEU_TOKEN
```

**Nota:** A documentacao completa dos endpoints disponiveis esta em
`https://aeasy.readme.io/reference`. E necessario verificar quais funcoes
estao disponiveis para o tipo de token gerado.

---


## 12. MAPA COMPLETO DE ROTAS DISPONIVEIS

### Menu Principal (todas as rotas acessiveis)

| Rota | Area | Tipo |
|------|------|------|
| `/vendas` | Gestao > Associados | DataTable POST |
| `/consultores` | Cadastros > Consultores | DataTable GET |
| `/fluxo-caixa` | Financeiro | Custom POST |
| `/fluxo-caixa-simplificado` | Financeiro | Custom |
| `/eventos` | Eventos | DataTable GET |
| `/cotacoes` | CRM > Cotacoes | DataTable |
| `/leads` | CRM > Leads | DataTable |
| `/vistoria` | Gestao > Ativacao > Vistoria | DataTable |
| `/boas-vindas` | Gestao > Ativacao | DataTable |
| `/ouvidoria` | Gestao > Ouvidoria | DataTable |
| `/monitoramento` | Monitoramento | Custom |
| `/rastreadores` | Monitoramento > Rastreadores | DataTable |
| `/agenda` | Monitoramento > Agenda Instalacao | Custom |
| `/TopVendas` | Gestao > Relatorios > Top Adesoes | Form/HTML |
| `/relatorio-cliente-cancelado` | Gestao > Relatorios | Form/HTML |
| `/relatorio-evolucao-base` | Gestao > Relatorios | Form/HTML |
| `/relatorio-rastreadores` | Gestao > Relatorios | Form/HTML |
| `/relatorio-troca-titularidade` | Gestao > Relatorios | Form/HTML |
| `/colaboradores` | Cadastros > Usuarios | DataTable |
| `/grupos-colaboradores` | Cadastros > Grupos Usuarios | CRUD |
| `/fornecedores` | Cadastros > Fornecedores | DataTable |
| `/configuracoes` | Configuracoes > Sistema | Form |
| `/categorias-carros` | Config > Categoria de Veiculos | CRUD |
| `/protecao-coberturas` | Config > Cadastro Coberturas | CRUD |
| `/gerenciar-api` | Config > Integracoes | Admin |
| `/fila-gerar-relatorio` | Config > Fila Relatorios | Queue |

---


## 13. EXEMPLOS DE REQUISICOES PRONTAS

### Exemplo 1: Buscar associado por CPF

```http
POST /vendas/listagem HTTP/1.1
Host: aeasy.autovaleprevencoes.org
Cookie: PHPSESSID=xxxxx
Content-Type: application/x-www-form-urlencoded
X-Requested-With: XMLHttpRequest

draw=1&start=0&length=10&columns[0][data]=ClientesIndividuosNome&columns[0][name]=ClientesIndividuosNome&columns[0][orderable]=true&columns[0][searchable]=false&order[0][column]=0&order[0][dir]=asc&formPesquisa[campo_pesquisa]=cpf_cnpj&formPesquisa[search]=12345678901&formPesquisa[submitFilter]=true
```

### Exemplo 2: Listar ativos ativados em Julho/2025

```http
POST /vendas/listagem HTTP/1.1
Host: aeasy.autovaleprevencoes.org
Cookie: PHPSESSID=xxxxx
Content-Type: application/x-www-form-urlencoded
X-Requested-With: XMLHttpRequest

draw=1&start=0&length=50&columns[0][data]=ClientesIndividuosNome&columns[0][name]=ClientesIndividuosNome&columns[0][orderable]=true&columns[0][searchable]=false&order[0][column]=0&order[0][dir]=asc&formPesquisa[VendasSituacao][]=1&formPesquisa[TipoData]=VendasDataAtivacao&formPesquisa[DataInicial]=2025-07-01&formPesquisa[DataFinal]=2025-07-31&formPesquisa[submitFilter]=true
```

### Exemplo 3: Fluxo de caixa de um mes

```http
POST /fluxo-caixa/buscar-pagina HTTP/1.1
Host: aeasy.autovaleprevencoes.org
Cookie: PHPSESSID=xxxxx
Content-Type: application/x-www-form-urlencoded
X-Requested-With: XMLHttpRequest

page=1&length=100&DataInicial=2025-07-01&DataFinal=2025-07-31&TipoData=FaturasDataVencimento
```


### Exemplo 4: Cancelados em Julho/2025

```http
POST /vendas/listagem HTTP/1.1
Host: aeasy.autovaleprevencoes.org
Cookie: PHPSESSID=xxxxx
Content-Type: application/x-www-form-urlencoded
X-Requested-With: XMLHttpRequest

draw=1&start=0&length=50&columns[0][data]=ClientesIndividuosNome&columns[0][name]=ClientesIndividuosNome&columns[0][orderable]=true&columns[0][searchable]=false&order[0][column]=0&order[0][dir]=asc&formPesquisa[VendasSituacao][]=3&formPesquisa[TipoData]=VendasDataCancelamento&formPesquisa[DataInicial]=2025-07-01&formPesquisa[DataFinal]=2025-07-31&formPesquisa[submitFilter]=true
```

### Exemplo 5: Consultores ativos da sede Petrolina

```http
GET /consultores/listagem?draw=1&start=0&length=50&columns[0][data]=IndividuosNome&columns[0][name]=IndividuosNome&columns[0][orderable]=true&columns[0][searchable]=false&order[0][column]=0&order[0][dir]=asc&formPesquisa[Situacao][]=2&formPesquisa[CentroCustoId][]=2DFB8E7F-09CA-527B-0E36-CFF08A943C19&formPesquisa[submitFilter]=true HTTP/1.1
Host: aeasy.autovaleprevencoes.org
Cookie: PHPSESSID=xxxxx
X-Requested-With: XMLHttpRequest
```

---


## 14. CONSIDERACOES TECNICAS

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

### Endpoints que retornam JSON (DataTables)

- `/vendas/listagem` (POST)
- `/consultores/listagem` (GET)
- `/eventos/listagem` (GET)
- `/fluxo-caixa/buscar-pagina` (POST)

### Endpoints que retornam HTML (server-side render)

- `/TopVendas` (POST)
- `/relatorio-cliente-cancelado` (POST)
- `/relatorio-evolucao-base` (POST)
- `/relatorio-rastreadores`
- `/relatorio-troca-titularidade`

### Campo importante para validacao CPF + Data Nascimento

- **CPF:** `ClientesIndividuosDocumento` (numeros puros, sem formatacao)
- **Data Nascimento:** `DataNascimentoAssociado` (formato YYYY-MM-DD)
- Ambos retornados no endpoint `/vendas/listagem`

---


## 15. CATEGORIAS DE VEICULOS (IDs)

Amostra dos 80+ categorias disponiveis:

| ID | Nome |
|----|------|
| 56 | Agregado Carreta |
| 66 | Atividade Remunerada (motocicleta - Avelloz/Shineray/Bajaj) |
| 50 | Atividade Remunerada (motocicleta - Honda) |
| 51 | Atividade Remunerada (motocicleta - Yamaha) |
| 18 | Atividade Remunerada (suv/caminhonete/utilitario) |
| 17 | Atividade Remunerada (veiculo leve) |
| 29 | Automovel Premium |
| 40 | Automovel Start |
| 76 | Eletrico/Hibrido |
| 12 | ELITE 125/FLUO 125/NEO |
| 49 | Motocicletas - Avelloz/Shineray/Bajaj |
| 45 | Motocicletas - Honda |
| 48 | Motocicletas - Yamaha |
| 28 | Motocicletas Especiais |
| 16 | Passeio - Importado |
| 1 | Passeio - Nacional |
| 15 | SUV/Caminhonete/Utilitario |

---


## 16. HIERARQUIA CONSULTORES/GESTORES

### Visao Geral

O sistema AEasy possui uma hierarquia complexa de consultores. Dados confirmados por testes diretos na API:

| Metrica | Valor |
|---------|-------|
| **Total consultores ativos** | 5.951 |
| **Tipo Gestor (enum=5)** | 3.257 |
| **Tipo Consultor (enum=1)** | ~1.500+ |
| **Tipo Indicador (enum=4)** | ~1.200+ |

### Detalhamento do tipo "Gestor" (enum=5)

Nem todo consultor com `ConsultoresTipoConsultorEnum=5` e um lider real com equipe. A grande maioria sao vendedores classificados como "Gestor" no sistema mas sem equipe:

| Subgrupo | Quantidade | Descricao |
|----------|-----------|-----------|
| `ConsultoresLider=1` | 62 | **Lideres reais** - possuem equipe |
| `ConsultoresLider=0` | 3.195 | Vendedores classificados como "Gestor" mas sem equipe |

### FormaLider (subdivisao dos 62 lideres reais)

| FormaLider | Quantidade | Descricao |
|------------|-----------|-----------|
| `FormaLider=1` | ~30 | Lider direto (gestor principal) |
| `FormaLider=2` | ~32 | Sub-lider (subordinado a outro gestor) |

### Resumo visual da hierarquia

```
Consultores Ativos (5.951)
├── Tipo Gestor - enum=5 (3.257)
│   ├── COM equipe - ConsultoresLider=1 (62)
│   │   ├── Lider Direto - FormaLider=1 (~30)
│   │   └── Sub-lider - FormaLider=2 (~32)
│   └── SEM equipe - ConsultoresLider=0 (3.195)
│       └── Sao vendedores, apesar do tipo "Gestor"
├── Tipo Consultor - enum=1 (~1.500+)
└── Tipo Indicador - enum=4 (~1.200+)
```

### Implicacao pratica

Para filtrar apenas gestores que realmente lideram equipes no dashboard, o criterio correto e:
- `ConsultoresTipoConsultorEnum=5` (tipo Gestor)
- **E** `ConsultoresLider=1` (possui equipe)

Isso retorna apenas os 62 lideres reais, nao os 3.257 do tipo Gestor.

---


## 17. RETORNAR LIDER COM EQUIPE (Comportamento)

### O que e

O filtro `RetornarLiderComEquipe` controla quais membros da equipe de um gestor sao retornados quando se seleciona uma equipe nos endpoints `/TopVendas` e `/vendas/listagem`.

### Valores possiveis

| Opcao | Valor na API | O que retorna |
|-------|-------------|---------------|
| **Equipe completa** | `SIM` | Todos da equipe + sub-lideres + membros dos sub-lideres |
| **Equipe sem lideres** | `NAO` | Apenas os membros diretos (remove sub-lideres e suas equipes) |
| **Equipe ate lider 1o nivel** | `ATE_NIVEL_1` | Membros diretos + sub-lideres do primeiro nivel (sem as equipes deles) |

### Exemplo pratico (ADHRIAN - confirmado em testes)

| Filtro | Resultado |
|--------|-----------|
| Equipe completa (`SIM`) | **104 membros** (ele + sub-lideres + equipes dos sub-lideres) |
| Equipe sem lideres (`NAO`) | **61 membros** (apenas membros diretos, sem sub-lideres) |

A diferenca (104 - 61 = 43) sao **sub-lideres e suas equipes** que ficam ocultos no modo "sem lideres".

### Comportamento detalhado

#### `SIM` (Equipe completa)
- Retorna o gestor selecionado
- Retorna todos os membros diretos da equipe
- Retorna todos os sub-lideres (FormaLider=2)
- Retorna todos os membros das equipes dos sub-lideres
- Resultado: arvore completa abaixo do gestor

#### `NAO` (Equipe sem lideres)
- Retorna o gestor selecionado
- Retorna apenas os consultores diretamente sob o gestor
- **Exclui** quem e sub-lider
- **Exclui** as equipes dos sub-lideres
- Resultado: apenas os "soldados" diretos

#### `ATE_NIVEL_1` (Ate lider 1o nivel)
- Retorna o gestor selecionado
- Retorna membros diretos da equipe
- Retorna sub-lideres do primeiro nivel
- **Nao retorna** os membros das equipes dos sub-lideres
- Resultado: primeiro nivel completo, sem expandir sub-equipes

### Uso no dashboard

No relatorio do dashboard, usamos **`NAO`** (Equipe sem lideres) para obter apenas os consultores que estao diretamente sob cada gestor, sem duplicar membros que aparecem em sub-equipes. O proprio gestor ainda aparece na lista, por isso separamos resultado individual vs equipe no processamento.

---

*Documento gerado em Julho/2026 por mapeamento dos endpoints internos do AEasy.*
*Sujeito a mudancas pela South Tecnologia sem aviso previo.*
